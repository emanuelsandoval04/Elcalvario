import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import mysql from 'mysql2/promise'
import { applyMigrations } from '../server/migration-runner.js'
import { bogotaToday } from '../server/entities.js'
import { addDays } from '../server/date-ranges.js'

const database = `calvario_checkin_test_${randomUUID().replaceAll('-', '')}`
process.env.DB_NAME = database
const { databaseConfig } = await import('../server/config.js')
assert.ok(['localhost', '127.0.0.1', '::1'].includes(databaseConfig.host), 'Esta prueba solo admite MySQL local y una base temporal.')
const { database: ignored, ...configuration } = databaseConfig
const db = await mysql.createConnection(configuration)
let pool, server, browser, preview
try {
  await db.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
  await db.query(`USE \`${database}\``)
  await applyMigrations(db)
  await applyMigrations(db)
  pool = (await import('../server/db.js')).pool
  const { default: app } = await import('../server/app.js')
  const { bootstrapAdmin } = await import('../server/bootstrap-admin.js')
  const { hashPassword } = await import('../server/auth.js')
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  process.env.APP_ORIGINS = origin
  const password = `Checkin-${randomUUID()}`
  async function request(path, { body, cookie = '', method = body === undefined ? 'GET' : 'POST', status = 200, headers = { Origin: origin } } = {}) {
    const response = await fetch(`${origin}/api/${path}`, { method, headers: { ...headers, Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) })
    const data = await response.json()
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`)
    return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie }
  }
  await bootstrapAdmin({ name: 'Propietario', email: 'owner@example.invalid', password })
  const owner = await request('auth/login', { body: { email: 'owner@example.invalid', password } })
  const ownerId = owner.data.user.id
  const [roles] = await db.execute("SELECT id_rol FROM rol_sistema WHERE nombre='Usuario'")
  const [account] = await db.execute("INSERT INTO usuario(correo_login,password_hash,estado_usuario) VALUES ('basic@example.invalid',?,'activo')", [await hashPassword(password)])
  await db.execute('INSERT INTO usuario_rol(id_usuario,id_rol) VALUES (?,?)', [account.insertId, roles[0].id_rol])
  const basic = await request('auth/login', { body: { email: 'basic@example.invalid', password } })
  const member = async (nombres, apellidos, numero, group = null) => {
    const [row] = await db.execute("INSERT INTO miembro(nombres,apellidos,tipo_identificacion,numero_identificacion,celular,fecha_nacimiento,codigo_qr,id_grupo,estado_miembro,id_usuario_creacion,id_usuario_actualizacion) VALUES (?,?,'CC',?,'3001234567','1990-01-01',?,?,'activo',?,?)", [nombres, apellidos, numero, randomUUID(), group, ownerId, ownerId])
    return row.insertId
  }
  const [group] = await db.execute("INSERT INTO grupo_comunion(codigo_grupo,nombre) VALUES ('QR-A','Grupo QR')")
  const ana = await member('Ana María', 'Prueba Ruiz', '1020304050'), luis = await member('Luis', 'Prueba', '52.111.222'), marta = await member('Marta', 'Prueba', '7788990'), grouped = await member('Gabriel', 'Grupo', '4455667', group.insertId)
  const today = bogotaToday()
  const event = async (titulo, fecha, extra = {}) => (await request('management/activities', { cookie: owner.cookie, status: 201, body: { tipo_actividad: 'evento', titulo, fecha, hora: '23:59', lugar: 'Templo', estado_actividad: 'programada', ...extra } })).data.id
  const tonight = await event('Culto de esta noche', today), tomorrow = await event('Culto de mañana', addDays(today, 1)), yesterday = await event('Culto de ayer', addDays(today, -1)), cancelled = await event('Culto cancelado', today, { estado_actividad: 'cancelada' })
  const [meeting] = await db.execute("INSERT INTO actividad(tipo_actividad,titulo,fecha,hora,lugar,id_usuario_creacion) VALUES ('reunion_grupo','Reunión del grupo QR',?,'23:59','Casa',?)", [today, ownerId])
  await db.execute('INSERT INTO reunion_grupo(id_actividad,id_grupo) VALUES (?,?)', [meeting.insertId, group.insertId])
  const link = async (activityId, renew = false, cookie = owner.cookie, status = 200) => (await request('management/attendance/checkin-link', { cookie, status, body: { activityId, ...(renew ? { renew } : {}) } })).data
  const checkin = (token, body, status = 201, headers) => request(`public/checkin/${token}`, { body, status, headers })

  // Team: one stable token per event date, renewable; only for attendance staff.
  const first = await link(tonight)
  assert.match(first.token, /^[A-Za-z0-9_-]{32}$/)
  assert.equal((await link(tonight)).token, first.token)
  await link(tonight, false, basic.cookie, 403)
  await request('management/attendance/checkin-link', { status: 401, body: { activityId: tonight } })
  const [[before]] = await db.query('SELECT fecha_actualizacion FROM actividad WHERE id_actividad=?', [tonight])
  const token = (await link(tonight, true)).token
  assert.notEqual(token, first.token)
  // Reading the current QR never creates one (the page shows it again after a reload).
  assert.equal((await request(`management/attendance/checkin-link?activityId=${tonight}`, { cookie: owner.cookie })).data.token, token)
  assert.equal((await request(`management/attendance/checkin-link?activityId=${tomorrow}`, { cookie: owner.cookie })).data.token, null)
  await request(`management/attendance/checkin-link?activityId=${tonight}`, { cookie: basic.cookie, status: 403 })
  const [[after]] = await db.query('SELECT fecha_actualizacion FROM actividad WHERE id_actividad=?', [tonight])
  assert.deepEqual(after.fecha_actualizacion, before.fecha_actualizacion, 'Renovar el código no marca el evento como modificado.')
  await request(`public/checkin/${first.token}`, { status: 404 })
  await request('public/checkin/no-es-un-codigo', { status: 404 })

  // Public page, no session: event data and whether the registration is open today.
  const info = (await request(`public/checkin/${token}`)).data
  assert.equal(info.state, 'open'); assert.equal(info.event.titulo, 'Culto de esta noche'); assert.equal(info.event.hora, '23:59')
  assert.equal(Object.hasOwn(info.event, 'token_asistencia'), false)
  // Any date is open (past or future); only a cancelled event refuses registrations.
  for (const id of [tomorrow, yesterday]) {
    const other = (await link(id)).token
    assert.equal((await request(`public/checkin/${other}`)).data.state, 'open')
    assert.equal((await checkin(other, { documento: '1020304050' })).data.result, 'registered')
  }
  const cancelledToken = (await link(cancelled)).token
  assert.equal((await request(`public/checkin/${cancelledToken}`)).data.state, 'cancelled')
  await checkin(cancelledToken, { documento: '1020304050' }, 409)

  // Registered member: attendance with their full name as confirmation; repeated scans are harmless.
  const registered = (await checkin(token, { documento: '1020304050' })).data
  assert.deepEqual(registered, { result: 'registered', nombre: 'Ana María Prueba Ruiz' })
  assert.equal((await checkin(token, { documento: '1.020.304.050' })).data.result, 'already')
  assert.equal((await checkin(token, { documento: '52111222' })).data.nombre, 'Luis Prueba', 'Se ignoran puntos y espacios del documento.')
  const [[anaRow]] = await db.query('SELECT estado_asistencia,metodo_registro,origen_registro,id_usuario_registro FROM asistencia WHERE id_actividad=? AND id_miembro=?', [tonight, ana])
  assert.deepEqual({ ...anaRow }, { estado_asistencia: 'presente', metodo_registro: 'qr', origen_registro: 'autoregistro_qr', id_usuario_registro: null })

  // Unknown document: nothing is stored until the person gives a full name, then a visitor appears in the list.
  assert.deepEqual((await checkin(token, { documento: '999888777' }, 200)).data, { result: 'not_found' })
  assert.equal((await db.query('SELECT COUNT(*) AS total FROM asistencia WHERE id_actividad=? AND id_miembro IS NULL', [tonight]))[0][0].total, 0)
  await checkin(token, { documento: '999888777', nombre: 'Pedro' }, 400)
  await checkin(token, { documento: '999888777', nombre: '<script>x</script> Pérez' }, 400)
  assert.deepEqual((await checkin(token, { documento: '999 888 777', nombre: '  Pedro   Pérez ' })).data, { result: 'visitor', nombre: 'Pedro Pérez' })
  assert.equal((await checkin(token, { documento: '999888777', nombre: 'Pedro Pérez' })).data.result, 'already')
  assert.equal((await checkin(token, { nombre: 'María Gómez' })).data.result, 'visitor')
  assert.equal((await checkin(token, { nombre: 'maria gomez' })).data.result, 'already')
  await checkin(token, { documento: '12' }, 400)
  await checkin(token, {}, 400)
  await checkin(token, { documento: '1020304050' }, 403, { Origin: 'https://example.invalid' })
  // A member who chose "visitor" but typed a registered document is recorded as the member.
  assert.deepEqual((await checkin(token, { documento: '4455667', nombre: 'Otro Nombre' })).data, { result: 'registered', nombre: 'Gabriel Grupo' })

  // The team list shows everything; the full save works on the event's day before it starts
  // and keeps QR registrations. A later QR scan turns an absence into presence.
  const list = (await request(`management/attendance?activityId=${tonight}`, { cookie: owner.cookie })).data.items
  assert.ok(list.some(row => row.nombre_visitante === 'Pedro Pérez' && row.documento_visitante === '999888777' && row.estado_asistencia === 'visitante'))
  assert.ok(list.some(row => row.nombre_visitante === 'María Gómez' && row.documento_visitante === null))
  const roster = (await request(`management/attendance/roster?activityId=${tonight}`, { cookie: owner.cookie })).data
  const saved = (await request('management/attendance/save', { cookie: owner.cookie, status: 201, body: { activityId: tonight, rosterVersion: roster.version, states: {} } })).data
  assert.deepEqual(saved, { created: 1, absent: 1, present: 0, justified: 0 })
  const tomorrowRoster = (await request(`management/attendance/roster?activityId=${tomorrow}`, { cookie: owner.cookie })).data
  assert.ok((await request('management/attendance/save', { cookie: owner.cookie, status: 201, body: { activityId: tomorrow, rosterVersion: tomorrowRoster.version, states: {} } })).data.created > 0)
  assert.equal((await checkin(token, { documento: '7788990' })).data.result, 'registered')
  const [[martaRow]] = await db.query('SELECT estado_asistencia,origen_registro FROM asistencia WHERE id_actividad=? AND id_miembro=?', [tonight, marta])
  assert.deepEqual({ ...martaRow }, { estado_asistencia: 'presente', origen_registro: 'autoregistro_qr' })
  await db.execute('UPDATE asistencia SET archivado=1 WHERE id_actividad=? AND id_miembro=?', [tonight, luis])
  await checkin(token, { documento: '52111222' }, 409)

  // Group meetings only recognize the group's disciples.
  const meetingToken = (await link(meeting.insertId)).token
  assert.equal((await checkin(meetingToken, { documento: '1020304050' }, 200)).data.result, 'not_found')
  assert.equal((await checkin(meetingToken, { documento: '4455667' })).data.result, 'registered')
  console.log('PASS API: QR link per event date, renewal, public page without session, any date (past or future), cancelled events refused, member check-in with full name, document normalization, visitors with full name, deduplication, same-day full save, absent to present, archived records and group scope')

  if (process.argv.includes('--ui')) {
    const shots = process.env.CHECKIN_SHOTS || 'checks'
    const ui = 'http://127.0.0.1:5198'; process.env.APP_ORIGINS = `${origin},${ui}`
    preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5198', '--strictPort'], { windowsHide: true, stdio: 'ignore' })
    for (let i = 0; i < 80; i++) { try { if ((await fetch(ui)).ok) break } catch {} await delay(150) }
    const { chromium } = await import('../.secrets/browser-tools/node_modules/playwright-core/index.mjs')
    browser = await chromium.launch({ channel: 'msedge', headless: true })
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' })
    await context.route('**/api/**', async route => { const url = new URL(route.request().url()); const response = await route.fetch({ url: origin + url.pathname + url.search, headers: { ...route.request().headers(), origin } }); await route.fulfill({ response }) })
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', entry => { if (entry.type() === 'error') errors.push(entry.text()) })
    // Visitor path from an unknown document, as a person scanning the QR with no session.
    await page.goto(`${ui}/#asistencia/${token}`)
    await page.getByRole('heading', { name: 'Registra tu asistencia' }).waitFor()
    assert.equal(await page.locator('.navbar, nav[aria-label]').count(), 0, 'La página del QR no muestra la navegación del sitio.')
    await page.screenshot({ path: `${shots}/checkin-document-390.png`, fullPage: true })
    await page.getByLabel('Número de cédula').fill('1112223334')
    await page.getByRole('button', { name: 'Registrar mi asistencia' }).click()
    await page.getByRole('heading', { name: 'Registro de visitante' }).waitFor()
    await page.getByLabel('Nombre completo').fill('Sofía Visitante')
    await page.screenshot({ path: `${shots}/checkin-visitor-390.png`, fullPage: true })
    await page.getByRole('button', { name: 'Registrarme como visitante' }).click()
    await page.getByRole('heading', { name: '¡Registro de visitante listo!' }).waitFor()
    assert.equal(await page.locator('.checkin-name').innerText(), 'Sofía Visitante')
    // Member path: name and confirmation.
    await page.getByRole('button', { name: 'Registrar a otra persona' }).click()
    await db.execute('DELETE FROM asistencia WHERE id_actividad=? AND id_miembro=?', [tonight, ana])
    await page.getByLabel('Número de cédula').fill('1020304050')
    await page.getByRole('button', { name: 'Registrar mi asistencia' }).click()
    await page.getByRole('heading', { name: '¡Asistencia registrada!' }).waitFor()
    assert.equal(await page.locator('.checkin-name').innerText(), 'Ana María Prueba Ruiz')
    await page.screenshot({ path: `${shots}/checkin-done-390.png`, fullPage: true })
    for (const width of [320, 1280]) { await page.setViewportSize({ width, height: 900 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Sin desbordamiento a ${width}px`) }
    const [[sofia]] = await db.query("SELECT estado_asistencia,documento_visitante FROM asistencia WHERE id_actividad=? AND nombre_visitante='Sofía Visitante'", [tonight])
    assert.deepEqual({ ...sofia }, { estado_asistencia: 'visitante', documento_visitante: '1112223334' })
    // Team screen: QR panel and the list with the self check-ins.
    await page.setViewportSize({ width: 1280, height: 1000 })
    await page.goto(`${ui}/#login`)
    await page.getByLabel('Correo electrónico', { exact: true }).fill('owner@example.invalid'); await page.getByLabel('Contraseña', { exact: true }).fill(password); await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click(); await page.locator('#dashboard-title').waitFor()
    await page.goto(`${ui}/#gestion/falls/registro`)
    await page.locator('.attendance-card', { hasText: 'Culto de esta noche' }).click()
    // The QR created earlier shows by itself, and again after reloading the page.
    await page.locator('.attendance-qr svg.qr-code').waitFor()
    assert.equal(await page.getByRole('button', { name: 'Mostrar código QR' }).count(), 0)
    assert.ok((await page.locator('.attendance-qr-link').innerText()).endsWith(`/#asistencia/${token}`))
    await page.reload()
    await page.locator('.attendance-qr svg.qr-code').waitFor()
    assert.ok((await page.locator('.attendance-qr-link').innerText()).endsWith(`/#asistencia/${token}`))
    assert.ok(await page.getByText('Sofía Visitante').count())
    assert.ok(await page.getByText('Con código QR').first().count())
    // A new QR registration appears in the list without reloading.
    const arrived = await fetch(`${origin}/api/public/checkin/${token}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: 'Tomás Recién Llegado' }) })
    assert.equal(arrived.status, 201)
    await page.locator('.attendance-records article', { hasText: 'Tomás Recién Llegado' }).waitFor({ timeout: 12000 })
    await page.screenshot({ path: `${shots}/checkin-team-1280.png`, fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Panel del QR sin desbordamiento en celular')
    await page.locator('.attendance-qr').screenshot({ path: `${shots}/checkin-team-390.png` })
    await page.setViewportSize({ width: 1280, height: 1000 })
    await page.getByRole('button', { name: 'Ampliar para proyectar' }).click()
    await page.locator('.attendance-qr-poster').waitFor()
    await page.screenshot({ path: `${shots}/checkin-poster-1280.png` })
    await page.keyboard.press('Escape')
    assert.deepEqual(errors.filter(error => !/401/.test(error)), [])
    console.log('PASS UI: QR page without session (visitor and member), name confirmation, 320-1280px layout, team QR panel, projection view and self check-ins in the list')
  }
} finally {
  await browser?.close()
  preview?.kill()
  server?.close()
  await pool?.end().catch(() => {})
  await db.query(`DROP DATABASE IF EXISTS \`${database}\``).catch(() => {})
  await db.end()
}
