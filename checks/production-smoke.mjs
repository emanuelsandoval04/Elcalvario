import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
import { readEnvironment } from '../server/environment.js'

const origin = new URL(process.argv[2] || 'https://elcalvario.vercel.app')
assert.equal(origin.protocol, 'https:')
assert.equal(origin.pathname, '/')
const env = dotenv.parse(await readFile(new URL('../.env.aiven.local', import.meta.url)))
env.DB_SSL_CA = await readFile(new URL('../.secrets/aiven-ca.pem', import.meta.url), 'utf8')
const { databaseConfig } = readEnvironment(env)
assert.ok(databaseConfig.host.endsWith('.aivencloud.com') && databaseConfig.ssl.verifyIdentity)
const database = await mysql.createConnection(databaseConfig)
const email = `deploy-${randomUUID()}@example.invalid`
const password = `Deploy-${randomUUID()}`
let cookie = '', attemptedRegistration = false

async function request(path, body, overrides = {}) {
  return fetch(new URL(path, origin), {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Origin: origin.origin, 'Sec-Fetch-Site': 'same-origin',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...overrides,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  })
}

try {
  const home = await request('/')
  assert.equal(home.status, 200)
  const html = await home.text()
  assert.ok(html.includes('id="root"'))
  for (const match of html.matchAll(/(?:src|href)="([^" ]+\.(?:js|css))"/g)) assert.equal((await request(match[1])).status, 200)
  const health = await request('/api/health')
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { status: 'ok', database: 'connected' })
  for (const path of ['/api/public/institution', '/api/public/events', '/api/public/ministries']) {
    assert.equal((await request(path)).status, 200, path)
  }
  assert.equal((await request('/api/auth/me')).status, 401)
  assert.equal((await request('/api/auth/login', { email, password }, { Origin: 'https://untrusted.example' })).status, 403)
  const [bootstrap] = await database.execute('SELECT bootstrap_completado FROM configuracion_sistema WHERE id=1')
  assert.equal(bootstrap[0]?.bootstrap_completado, 1, 'La prueba no puede consumir el registro inicial del propietario.')
  const [roles] = await database.execute(`SELECT r.id_rol FROM rol_sistema r
    JOIN rol_permiso g ON g.id_rol=r.id_rol AND g.codigo_permiso='gestion.acceder'
    JOIN rol_permiso p ON p.id_rol=r.id_rol AND p.codigo_permiso='reportes.grupos'
    WHERE r.estado=1 AND r.nombre NOT IN ('Superadmin','Usuario')
    ORDER BY r.nombre='Multimedia' DESC,r.id_rol LIMIT 1`)
  assert.ok(roles.length, 'No hay un rol operativo para probar las exportaciones.')
  attemptedRegistration = true
  const registered = await request('/api/auth/register', { email, password })
  assert.equal(registered.status, 201)
  const [accounts] = await database.execute('SELECT id_usuario FROM usuario WHERE correo_login=? AND id_miembro IS NULL', [email])
  assert.equal(accounts.length, 1)
  await database.beginTransaction()
  await database.execute("UPDATE usuario SET estado_usuario='activo' WHERE id_usuario=? AND correo_login=?", [accounts[0].id_usuario, email])
  await database.execute('INSERT INTO usuario_rol(id_usuario,id_rol) VALUES (?,?)', [accounts[0].id_usuario, roles[0].id_rol])
  await database.commit()
  const login = await request('/api/auth/login', { email, password })
  assert.equal(login.status, 200)
  const cookies = login.headers.get('set-cookie')
  assert.match(cookies, /; Secure/i)
  assert.match(cookies, /; HttpOnly/i)
  assert.match(cookies, /; SameSite=Strict/i)
  cookie = cookies.split(';')[0]
  const me = await request('/api/auth/me')
  assert.equal(me.status, 200)
  assert.equal((await me.json()).user.email, email)
  const updated = await request('/api/auth/account/profile', { name: 'Comprobación temporal de despliegue', email })
  assert.equal(updated.status, 200)
  const photoBytes = await readFile(new URL('./fixtures/profile.jpg', import.meta.url))
  const photo = await request('/api/auth/account/photo', { photo: `data:image/jpeg;base64,${photoBytes.toString('base64')}` })
  assert.equal(photo.status, 200)
  const photoUrl = (await photo.json()).user.photoUrl
  const downloadedPhoto = await request(photoUrl)
  assert.equal(downloadedPhoto.status, 200)
  assert.ok(Buffer.from(await downloadedPhoto.arrayBuffer()).equals(photoBytes))
  for (const format of ['pdf', 'xlsx']) {
    const report = await request(`/api/management/reports/grupos?format=${format}`)
    assert.equal(report.status, 200, `Reporte ${format}`)
    const bytes = Buffer.from(await report.arrayBuffer())
    assert.ok(bytes.length > 100)
    assert.ok(format === 'pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' : bytes.subarray(0, 2).toString() === 'PK')
  }
  assert.equal((await request('/api/auth/logout', {})).status, 200)
  assert.equal((await request('/api/auth/me')).status, 401)
  console.log('PASS HTTPS: página y assets, Aiven, API anidada, origen, registro/login, cookie segura, perfil, foto y exportaciones PDF/Excel.')
} finally {
  // Only the exact synthetic account generated by this run can be removed.
  if (attemptedRegistration) {
    await database.rollback()
    await database.execute('DELETE FROM usuario WHERE correo_login=? AND id_miembro IS NULL', [email])
    const [left] = await database.execute('SELECT COUNT(*) AS total FROM usuario WHERE correo_login=?', [email])
    assert.equal(left[0].total, 0)
    console.log('Cuenta y sesiones temporales eliminadas; cuentas existentes conservadas.')
  }
  await database.end()
}
