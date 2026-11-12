import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import mysql from 'mysql2/promise'
import { applyMigrations } from '../server/migration-runner.js'

const database = `calvario_group_codes_test_${randomUUID().replaceAll('-', '')}`
process.env.DB_NAME = database
const { databaseConfig } = await import('../server/config.js')
assert.ok(['localhost', '127.0.0.1', '::1'].includes(databaseConfig.host), 'Esta prueba solo admite MySQL local y una base temporal.')
const { database: ignored, ...configuration } = databaseConfig
const db = await mysql.createConnection(configuration)
let pool, server
const codes = async () => (await db.query('SELECT id_grupo,codigo_grupo FROM grupo_comunion ORDER BY id_grupo'))[0].map(row => row.codigo_grupo)
try {
  await db.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
  await db.query(`USE \`${database}\``)
  await applyMigrations(db)

  // Existing groups with handwritten codes (one already looks like GR-02), as before migration 027.
  await db.query("DELETE FROM migracion_aplicada WHERE nombre='027-group-codes.sql'")
  await db.query("DELETE FROM secuencia_codigo WHERE nombre='grupo'")
  for (const [code, name, archived] of [['001', 'Primero', 0], ['NORTE', 'Norte', 0], ['GR-02', 'Ya parecía nuevo', 0], ['VIEJO', 'Archivado', 1]]) await db.execute('INSERT INTO grupo_comunion(codigo_grupo,nombre,archivado) VALUES (?,?,?)', [code, name, archived])
  await applyMigrations(db)
  assert.deepEqual(await codes(), ['GR-01', 'GR-02', 'GR-03', 'GR-04'], 'Se renumeran en orden de creación, incluidos los archivados.')
  assert.equal((await db.query("SELECT ultimo FROM secuencia_codigo WHERE nombre='grupo'"))[0][0].ultimo, 4)
  await db.execute("UPDATE grupo_comunion SET codigo_grupo='GR-09' WHERE codigo_grupo='GR-01'")
  await applyMigrations(db)
  assert.deepEqual(await codes(), ['GR-09', 'GR-02', 'GR-03', 'GR-04'], 'Volver a migrar no renumera.')
  await db.execute("UPDATE grupo_comunion SET codigo_grupo='GR-01' WHERE codigo_grupo='GR-09'")
  await db.execute("UPDATE secuencia_codigo SET ultimo=4 WHERE nombre='grupo'")

  pool = (await import('../server/db.js')).pool
  const { default: app } = await import('../server/app.js')
  const { bootstrapAdmin } = await import('../server/bootstrap-admin.js')
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  process.env.APP_ORIGINS = origin
  const password = `Groups-${randomUUID()}`
  async function request(path, { body, cookie = '', method = body === undefined ? 'GET' : 'POST', status = 200 } = {}) {
    const response = await fetch(`${origin}/api/${path}`, { method, headers: { Origin: origin, Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) })
    const data = await response.json()
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`)
    return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie }
  }
  await bootstrapAdmin({ name: 'Propietario', email: 'owner@example.invalid', password })
  const owner = await request('auth/login', { body: { email: 'owner@example.invalid', password } })

  // New groups continue the series; a code sent by the browser is ignored.
  const created = (await request('management/groups', { cookie: owner.cookie, status: 201, body: { codigo_grupo: 'MANUAL', nombre: 'Grupo nuevo', direccion: 'Calle 1', estado_grupo: 'activo' } })).data
  assert.equal(created.codigo_grupo, 'GR-05')
  const parallel = await Promise.all(Array.from({ length: 5 }, (_, index) => request('management/groups', { cookie: owner.cookie, status: 201, body: { nombre: `Paralelo ${index}`, direccion: 'Calle 2', estado_grupo: 'activo' } })))
  assert.deepEqual(parallel.map(item => item.data.codigo_grupo).sort(), ['GR-06', 'GR-07', 'GR-08', 'GR-09', 'GR-10'], 'Creaciones simultáneas no repiten código.')
  // The code cannot be edited.
  await request(`management/groups/${created.id}`, { cookie: owner.cookie, method: 'PATCH', status: 400, body: { codigo_grupo: 'OTRO' } })
  await request(`management/groups/${created.id}`, { cookie: owner.cookie, method: 'PATCH', body: { codigo_grupo: 'OTRO', nombre: 'Grupo renombrado' } })
  const list = (await request('management/groups', { cookie: owner.cookie })).data.items
  assert.equal(list.find(item => item.id_grupo === created.id).codigo_grupo, 'GR-05')
  // A failed creation does not consume a number.
  await request('management/groups', { cookie: owner.cookie, status: 400, body: { nombre: 'Estado inválido', estado_grupo: 'pausado' } })
  // This one fails after the number was reserved (unknown neighborhood); the rollback returns it.
  await request('management/groups', { cookie: owner.cookie, status: 409, body: { nombre: 'No debe guardarse', direccion: 'Calle 3', estado_grupo: 'activo', barrios: { ids: [999999], expectedIds: [], expectedLeaderId: null } } })
  assert.equal((await request('management/groups', { cookie: owner.cookie, status: 201, body: { nombre: 'Siguiente', direccion: 'Calle 4', estado_grupo: 'activo' } })).data.codigo_grupo, 'GR-11')
  // After GR-99 comes GR-100. Catalog options carry the code.
  await db.execute("UPDATE secuencia_codigo SET ultimo=99 WHERE nombre='grupo'")
  assert.equal((await request('management/groups', { cookie: owner.cookie, status: 201, body: { nombre: 'Centésimo', direccion: 'Calle 5', estado_grupo: 'activo' } })).data.codigo_grupo, 'GR-100')
  const catalogs = (await request('management/catalogs', { cookie: owner.cookie })).data
  assert.ok(catalogs.grupos.some(group => group.codigo_grupo === 'GR-100'))
  console.log('PASS group codes: one-time renumbering in creation order (with collisions and archived groups), rerun safety, GR-xx on creation, ignored/locked manual codes, concurrent creation, no gaps on failure, GR-100 and catalog labels')
} finally {
  server?.close()
  await pool?.end().catch(() => {})
  await db.query(`DROP DATABASE IF EXISTS \`${database}\``).catch(() => {})
  await db.end()
}
