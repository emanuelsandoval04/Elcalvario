import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import mysql from 'mysql2/promise'
import jpeg from 'jpeg-js'
import { applyMigrations } from '../server/migration-runner.js'
import { bogotaToday } from '../server/entities.js'

const database = `calvario_event_images_test_${randomUUID().replaceAll('-', '')}`
process.env.DB_NAME = database
const { databaseConfig } = await import('../server/config.js')
assert.ok(['localhost', '127.0.0.1', '::1'].includes(databaseConfig.host), 'Esta prueba solo admite MySQL local y una base temporal.')
const { database: ignored, ...configuration } = databaseConfig
const db = await mysql.createConnection(configuration)
let pool, server
const picture = (width, height, quality = 80) => {
  const data = Buffer.alloc(width * height * 4)
  for (let index = 0; index < data.length; index += 4) { const x = (index / 4) % width, y = Math.floor(index / 4 / width); data[index] = 255 * x / width; data[index + 1] = 255 * y / height; data[index + 2] = 120 + width % 97; data[index + 3] = 255 }
  return `data:image/jpeg;base64,${jpeg.encode({ data, width, height }, quality).data.toString('base64')}`
}
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
  const password = `Check-${randomUUID()}`
  async function request(path, { body, cookie = '', method = body === undefined ? 'GET' : 'POST', status = 200 } = {}) {
    const response = await fetch(`${origin}/api/${path}`, { method, headers: { Origin: origin, Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) })
    const data = response.headers.get('content-type')?.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer())
    assert.equal(response.status, status, `${method} ${path}: ${Buffer.isBuffer(data) ? `${data.length} bytes` : JSON.stringify(data)}`)
    return { data, response, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie }
  }
  await bootstrapAdmin({ name: 'Propietario', email: 'owner@example.invalid', password })
  const owner = await request('auth/login', { body: { email: 'owner@example.invalid', password } })
  const [roles] = await db.execute("SELECT id_rol FROM rol_sistema WHERE nombre='Usuario'")
  const [account] = await db.execute("INSERT INTO usuario(correo_login,password_hash,estado_usuario) VALUES ('basic@example.invalid',?,'activo')", [await hashPassword(password)])
  await db.execute('INSERT INTO usuario_rol(id_usuario,id_rol) VALUES (?,?)', [account.insertId, roles[0].id_rol])
  const basic = await request('auth/login', { body: { email: 'basic@example.invalid', password } })

  const image = picture(1600, 900)
  const uploaded = (await request('management/activities/images', { cookie: owner.cookie, status: 201, body: { image } })).data
  assert.match(uploaded.url, /^\/api\/public\/event-images\/[a-f0-9]{64}\.jpg$/)
  assert.deepEqual([uploaded.width, uploaded.height], [1600, 900])
  const again = (await request('management/activities/images', { cookie: owner.cookie, status: 201, body: { image } })).data
  assert.equal(again.url, uploaded.url, 'la misma imagen se guarda una sola vez')
  const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM imagen_actividad')
  assert.equal(total, 1)

  const served = await request(uploaded.url.slice(5))
  assert.equal(served.response.headers.get('content-type'), 'image/jpeg')
  assert.match(served.response.headers.get('cache-control'), /immutable/)
  assert.deepEqual(served.data, Buffer.from(image.split(',')[1], 'base64'))
  await request(`public/event-images/${'0'.repeat(64)}.jpg`, { status: 404 })
  await request('public/event-images/..%2F..%2Fetc.jpg', { status: 404 })

  await request('management/activities/images', { cookie: basic.cookie, status: 403, body: { image } })
  await request('management/activities/images', { status: 401, body: { image } })
  await request('management/activities/images', { cookie: owner.cookie, status: 400, body: { image: picture(1700, 400) } })
  await request('management/activities/images', { cookie: owner.cookie, status: 400, body: { image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' } })
  await request('management/activities/images', { cookie: owner.cookie, status: 400, body: { image: 'https://example.invalid/foto.jpg' } })
  await request('management/activities/images', { cookie: owner.cookie, status: 400, body: { image: `data:image/jpeg;base64,${Buffer.from('<svg onload=alert(1)>').toString('base64')}` } })
  const tooLarge = await fetch(`${origin}/api/management/activities/images`, { method: 'POST', headers: { Origin: origin, Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ image: `data:image/jpeg;base64,${'A'.repeat(1400 * 1024)}` }) })
  assert.equal(tooLarge.status, 413)

  const created = (await request('management/activities', { cookie: owner.cookie, status: 201, body: { tipo_actividad: 'evento', titulo: 'Vigilia con imagen', fecha: bogotaToday(), hora: '23:59', lugar: 'Templo', estado_actividad: 'programada', publicado: 1, imagen: uploaded.url } })).data
  const publicEvents = (await request('public/events')).data.items
  assert.equal(publicEvents.find(item => item.id_actividad === created.id)?.imagen, uploaded.url)

  // Orphaned uploads older than two days disappear; images used by an event stay.
  const orphan = (await request('management/activities/images', { cookie: owner.cookie, status: 201, body: { image: picture(320, 200) } })).data
  await db.execute('UPDATE imagen_actividad SET fecha_creacion=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 3 DAY)')
  await request('management/activities/images', { cookie: owner.cookie, status: 201, body: { image: picture(200, 200) } })
  await request(orphan.url.slice(5), { status: 404 })
  await request(uploaded.url.slice(5))

  // Profile photos keep their own limits after sharing the JPEG validator.
  const { parseProfilePhoto } = await import('../server/profile-photo.js')
  assert.equal(parseProfilePhoto(picture(512, 512, 60)).width, 512)
  assert.throws(() => parseProfilePhoto(picture(600, 600, 60)), /selector de la aplicación/)
  console.log('PASS event images: upload, deduplication, public delivery, permissions, format/size rejection, event link and orphan cleanup')
} finally {
  server?.close()
  await pool?.end().catch(() => {})
  await db.query(`DROP DATABASE IF EXISTS \`${database}\``).catch(() => {})
  await db.end()
}
