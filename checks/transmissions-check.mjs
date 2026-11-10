import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import mysql from 'mysql2/promise'
import { applyMigrations } from '../server/migration-runner.js'

// Temporary local database: the Multimedia module never touches real data or calls Meta.
const database = `calvario_transmissions_test_${randomUUID().replaceAll('-', '')}`
process.env.DB_NAME = database
process.env.TRANSMISSION_SECRET_KEY = randomUUID() + randomUUID()
delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN
const { databaseConfig } = await import('../server/config.js')
assert.ok(['localhost', '127.0.0.1', '::1'].includes(databaseConfig.host), 'Esta prueba solo se ejecuta en MySQL local.')
const { database: ignored, ...configuration } = databaseConfig
const db = await mysql.createConnection(configuration)
const realFetch = globalThis.fetch
let pool, server
try {
  await db.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
  await db.query(`USE \`${database}\``)
  await applyMigrations(db); await applyMigrations(db)
  pool = (await import('../server/db.js')).pool
  const { default: app } = await import('../server/app.js')
  const { bootstrapAdmin } = await import('../server/bootstrap-admin.js')
  const { hashPassword } = await import('../server/auth.js')
  const password = `Media-${randomUUID()}`
  await bootstrapAdmin({ name: 'Administración de prueba', email: 'owner@example.invalid', password })
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  process.env.APP_ORIGINS = origin
  // Meta is simulated: any other host goes to the real network (only the local API).
  let metaCalls = 0, metaReply = { ok: true, body: { data: [
    { id: '11', status: 'VOD', title: 'Culto dominical', creation_time: '2026-11-08T14:00:00Z', permalink_url: '/61556906195984/videos/11/' },
    { id: '12', status: 'LIVE', title: 'Oración en vivo', creation_time: '2026-11-09T23:00:00Z', permalink_url: 'https://web.facebook.com/61556906195984/videos/12/' },
  ] } }
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input))
    if (url.hostname !== 'graph.facebook.com') return realFetch(input, options)
    metaCalls++
    assert.equal(url.searchParams.has('access_token'), false)
    assert.match(options.headers.Authorization, /^Bearer EAA/)
    return { ok: metaReply.ok, json: async () => metaReply.body }
  }
  async function request(path, { body, cookie = '', status = 200, method = body === undefined ? 'GET' : 'POST', from = origin } = {}) {
    const response = await realFetch(`${origin}/api/${path}`, { method, headers: { Cookie: cookie, Origin: from, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) })
    const data = await response.json()
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`)
    return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie }
  }
  const hash = await hashPassword(password)
  async function account(email, role) {
    const [user] = await db.execute("INSERT INTO usuario(correo_login,password_hash,estado_usuario) VALUES (?,?,'activo')", [email, hash])
    await db.execute('INSERT INTO usuario_rol(id_usuario,id_rol) SELECT ?,id_rol FROM rol_sistema WHERE nombre=?', [user.insertId, role])
    return request('auth/login', { body: { email, password } })
  }
  const owner = await request('auth/login', { body: { email: 'owner@example.invalid', password } })
  const media = await account('media@example.invalid', 'Multimedia')
  const leader = await account('leader@example.invalid', 'Discipulador')
  const results = []
  const pass = text => { results.push(text); console.log(`PASS ${text}`) }

  // Permissions
  await request('management/transmission/settings', { status: 401 })
  await request('management/transmission/settings', { cookie: leader.cookie, status: 403 })
  await request('management/transmission/settings', { cookie: owner.cookie })
  let { data } = await request('management/transmission/settings', { cookie: media.cookie })
  assert.equal(data.settings.mode, 'automatico'); assert.equal(data.settings.hasToken, false); assert.equal(data.settings.encryptionReady, true)
  pass('permisos: sin sesión 401, Discipulador 403, Multimedia y Administrador 200')

  // Manual mode with the embed code copied from Facebook
  const embed = '<iframe src="https://www.facebook.com/plugins/video.php?height=314&href=https%3A%2F%2Fweb.facebook.com%2F61556906195984%2Fvideos%2F1840145000648542%2F&show_text=false&width=560&t=0" width="560" height="314"></iframe>'
  const settings = values => request('management/transmission/settings', { cookie: media.cookie, method: 'PUT', body: values })
  data = (await settings({ mode: 'manual', pageId: '61556906195984', graphVersion: 'v23.0', manualVideo: embed })).data
  assert.equal(data.settings.manualVideo, 'https://www.facebook.com/61556906195984/videos/1840145000648542/')
  let publicView = (await request('public/transmission')).data
  assert.equal(publicView.videoUrl, 'https://www.facebook.com/61556906195984/videos/1840145000648542/'); assert.equal(publicView.automatic, false)
  pass('modo manual: el código de "Insertar" (web.facebook.com) se guarda y la web pública lo muestra')

  // Injection and invalid input
  for (const manualVideo of ['https://evil.example/x/videos/1/', 'javascript:alert(1)', "https://www.facebook.com/1/videos/2/' OR 1=1 --", '<iframe src="https://evil.example/plugins/video.php?href=x"></iframe>'])
    await request('management/transmission/settings', { cookie: media.cookie, method: 'PUT', status: 400, body: { mode: 'manual', manualVideo } })
  await request('management/transmission/settings', { cookie: media.cookie, method: 'PUT', status: 400, body: { mode: 'automatico', pageId: "1 OR 1=1" } })
  await request('management/transmission/settings', { cookie: media.cookie, method: 'PUT', status: 400, body: { mode: 'automatico', graphVersion: "v1'; DROP TABLE usuario; --" } })
  await request('management/transmission/settings', { cookie: media.cookie, method: 'PUT', status: 403, from: 'https://untrusted.invalid', body: { mode: 'manual', manualVideo: embed } })
  await request('management/transmission/settings', { cookie: leader.cookie, method: 'PUT', status: 403, body: { mode: 'manual', manualVideo: embed } })
  const [[stillThere]] = await db.query('SELECT COUNT(*) AS total FROM usuario')
  assert.ok(stillThere.total >= 3)
  pass('inyección rechazada: sitios ajenos, javascript:, SQL en enlace/ID/versión (400), otro origen y rol sin permiso (403); tablas intactas')

  // Automatic mode: write-only encrypted token
  const token = 'EAA' + 'T'.repeat(80) + 'zx9Q'
  data = (await settings({ mode: 'automatico', pageId: '61556906195984', graphVersion: 'v23.0', token, manualVideo: embed })).data
  assert.equal(data.settings.hasToken, true); assert.equal(data.settings.tokenEnding, 'zx9Q')
  assert.ok(!JSON.stringify(data).includes(token))
  const [[row]] = await db.query('SELECT token_cifrado FROM configuracion_transmision WHERE id=1')
  assert.ok(row.token_cifrado.startsWith('v1:')); assert.ok(!row.token_cifrado.includes(token))
  pass('token: se guarda cifrado (AES-256-GCM) y la API nunca lo devuelve, solo sus 4 últimos caracteres')

  publicView = (await request('public/transmission')).data
  assert.equal(publicView.videoUrl, 'https://www.facebook.com/61556906195984/videos/12/'); assert.equal(publicView.live, true); assert.equal(publicView.automatic, true)
  assert.ok(!JSON.stringify(publicView).includes(token))
  const tested = (await request('management/transmission/test', { cookie: media.cookie, body: {} })).data
  assert.equal(tested.videos.length, 2); assert.equal(tested.videos[0].live, true)
  pass('modo automático: muestra primero el en vivo y "Probar conexión" lista las últimas transmisiones')

  // Meta failure: friendly message and backup video
  metaReply = { ok: false, body: { error: { code: 190, message: 'secret details' } } }
  const failed = await request('management/transmission/test', { cookie: media.cookie, body: {}, status: 502 })
  assert.match(failed.data.error, /venció/); assert.ok(!failed.data.error.includes('secret details'))
  await settings({ mode: 'automatico', pageId: '61556906195984', graphVersion: 'v23.0', manualVideo: embed })
  publicView = (await request('public/transmission')).data
  assert.equal(publicView.videoUrl, 'https://www.facebook.com/61556906195984/videos/1840145000648542/'); assert.equal(publicView.automatic, false)
  pass('fallo de Meta (token vencido): mensaje claro sin datos de Meta y la web usa el video de respaldo')

  data = (await settings({ mode: 'manual', manualVideo: embed, removeToken: true })).data
  assert.equal(data.settings.hasToken, false)
  const [audit] = await db.query("SELECT accion FROM auditoria_seguridad WHERE accion LIKE '%transmission%'")
  assert.ok(audit.some(item => item.accion.startsWith('PUT')))
  pass(`borrar token y auditoría de cambios (${metaCalls} consultas simuladas a Meta)`)
  console.log(`\nRESULTADO: ${results.length}/${results.length} grupos de verificación aprobados.`)
} finally {
  globalThis.fetch = realFetch
  if (server) await new Promise(resolve => server.close(resolve))
  if (pool) await pool.end()
  await db.query(`DROP DATABASE IF EXISTS \`${database}\``); await db.end()
  console.log('Base temporal eliminada; datos originales conservados.')
}
