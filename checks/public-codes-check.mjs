import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import ExcelJS from 'exceljs'
import mysql from 'mysql2/promise'
import { applyMigrations } from '../server/migration-runner.js'

// Temporary local database: disciples 0101... and accounts ADM-0001... never touch real data.
const database = `calvario_codes_test_${randomUUID().replaceAll('-', '')}`
process.env.DB_NAME = database
process.env.MAIL_PROVIDER='disabled' // registration emails below use real provider domains: never send mail from this check
const { databaseConfig } = await import('../server/config.js')
assert.ok(['localhost', '127.0.0.1', '::1'].includes(databaseConfig.host), 'Esta prueba solo se ejecuta en MySQL local.')
const { database: ignored, ...configuration } = databaseConfig
const db = await mysql.createConnection(configuration)
let pool, server
const results = []
const pass = text => { results.push(text); console.log(`PASS ${text}`) }
try {
  await db.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
  await db.query(`USE \`${database}\``)
  await applyMigrations(db)
  pool = (await import('../server/db.js')).pool
  const { default: app } = await import('../server/app.js')
  const { bootstrapAdmin } = await import('../server/bootstrap-admin.js')
  const { hashPassword } = await import('../server/auth.js')
  const password = `Codes-${randomUUID()}`
  await bootstrapAdmin({ name: 'Administración de prueba', email: 'owner@example.invalid', password })
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  process.env.APP_ORIGINS = origin
  async function request(path, { body, cookie = '', status = 200, method = body === undefined ? 'GET' : 'POST', raw = false } = {}) {
    const response = await fetch(`${origin}/api/${path}`, { method, headers: { Cookie: cookie, Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) })
    const data = raw ? response : await response.json()
    assert.equal(response.status, status, `${method} ${path}: ${raw ? status : JSON.stringify(data)}`)
    return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie }
  }
  const owner = await request('auth/login', { body: { email: 'owner@example.invalid', password } })
  assert.equal((await request('auth/me', { cookie: owner.cookie })).data.user.code, 'ADM-0001')
  pass('primera cuenta (propietario) recibe ADM-0001')

  // Disciples created from the panel
  const base = { apellidos: 'Prueba', tipo_identificacion: 'CC', celular: '3001234567', fecha_nacimiento: '1990-03-05' }
  const create = (nombres, numero) => request('management/members', { cookie: owner.cookie, status: 201, body: { ...base, nombres, numero_identificacion: numero } })
  assert.equal((await create('Ana', '1')).data.code, '0101')
  assert.equal((await create('Luis', '2')).data.code, '0102')
  const parallel = await Promise.all(['3', '4', '5', '6', '7'].map(numero => create(`Paralelo ${numero}`, numero)))
  assert.deepEqual(parallel.map(item => item.data.code).sort(), ['0103', '0104', '0105', '0106', '0107'])
  pass('discípulos: 0101, 0102 y 5 registros simultáneos con IDs consecutivos sin repetir')

  // Clients cannot choose or change the code
  const forced = await request('management/members', { cookie: owner.cookie, status: 201, body: { ...base, nombres: 'Intento', numero_identificacion: '8', codigo_miembro: 1 } })
  assert.equal(forced.data.code, '0108')
  await request(`management/members/${forced.data.id}`, { cookie: owner.cookie, method: 'PATCH', body: { codigo_miembro: 999 } }).catch(() => {})
  const [[forcedRow]] = await db.query('SELECT codigo_miembro FROM miembro WHERE id_miembro=?', [forced.data.id])
  assert.equal(forcedRow.codigo_miembro, 108)
  pass('el ID no se puede elegir ni modificar desde la API')

  // Archived records keep their number and it is never reused
  await db.query('UPDATE miembro SET archivado=1 WHERE id_miembro=?', [forced.data.id])
  assert.equal((await create('Después de archivar', '9')).data.code, '0109')
  pass('un registro archivado conserva su ID y el número no se reutiliza')

  // Search by ID
  const found = (await request('management/members?q=0102', { cookie: owner.cookie })).data.items
  assert.ok(found.some(item => item.nombres === 'Luis' && item.codigo_miembro === 102))
  pass('búsqueda de discípulos por ID (0102)')

  // Administrative record with account: member code + its own account code
  const catalogs = (await request('management/catalogs', { cookie: owner.cookie })).data
  const role = catalogs.roles.find(item => item.nivel_jerarquico === 6)
  const [group] = await db.execute("INSERT INTO grupo_comunion(codigo_grupo,nombre) VALUES ('G-A','Grupo A')")
  const administrative = await request('management/members', { cookie: owner.cookie, status: 201, body: { ...base, nombres: 'Administrativo', numero_identificacion: '10', tipo_registro: 'administrativo', id_rol_eclesiastico: role.id_rol_eclesiastico, id_grupo: group.insertId, account_email: 'leader@gmail.com', account_password: password, account_confirmation: password } })
  assert.equal(administrative.data.code, '0110'); assert.equal(administrative.data.accountCreated, true)
  const leader = await request('auth/login', { body: { email: 'leader@gmail.com', password } })
  const me = (await request('auth/me', { cookie: leader.cookie })).data.user
  assert.equal(me.code, 'ADM-0002'); assert.ok(me.roles.length > 0)
  pass('administrativo con cuenta: ficha 0110 y cuenta ADM-0002 con su rol')

  // Accounts created from "Usuarios, roles y permisos"
  const roles = (await request('auth/admin/users', { cookie: owner.cookie })).data.roles
  const created = await request('auth/admin/users', { cookie: owner.cookie, status: 201, body: { name: 'Multimedia', email: 'media@example.invalid', password, confirmation: password, roleId: roles.find(item => item.name === 'Multimedia').id } })
  const list = (await request('auth/admin/users', { cookie: owner.cookie })).data.users
  assert.deepEqual(list.map(user => user.code).sort(), ['ADM-0001', 'ADM-0002', 'ADM-0003'])
  assert.ok(list.every(user => user.roles.length > 0), 'Todas las cuentas tienen rol')
  const search = (await request('auth/admin/users?q=ADM-0003', { cookie: owner.cookie })).data.users
  assert.equal(search.length, 1); assert.equal(search[0].email, 'media@example.invalid'); assert.ok(created)
  pass('cuentas del panel: ADM-0001…ADM-0003, todas con rol, y búsqueda por ADM-0003')

  // Excel import reserves one number per row
  const [book] = await db.execute("INSERT INTO libro_adiestramiento(nombre,id_usuario_creacion) VALUES ('Libro 1',?)", [me.id])
  const row = { nombres: 'Importado', apellidos: 'Prueba', tipo_identificacion: 'CC', celular: '3001234567', fecha_nacimiento: '1990-01-01', codigo_grupo: 'G-A' }
  await request('management/members/import/commit', { cookie: owner.cookie, status: 201, body: { bookId: book.insertId, rows: [{ ...row, numero_identificacion: 'I-1' }, { ...row, numero_identificacion: 'I-2' }] } })
  const [imported] = await db.query("SELECT codigo_miembro FROM miembro WHERE numero_identificacion IN ('I-1','I-2') ORDER BY codigo_miembro")
  assert.deepEqual(imported.map(item => item.codigo_miembro), [111, 112])
  pass('importación desde Excel: 0111 y 0112')

  // Exports show the visible ID
  const response = (await request(`management/members/${forced.data.id - 1}/excel`, { cookie: owner.cookie, raw: true })).data
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()))
  const text = JSON.stringify(workbook.worksheets.map(sheet => sheet.getSheetValues()))
  assert.ok(text.includes('"0107"'), 'La ficha en Excel debe mostrar el ID 0107')
  pass('ficha en Excel muestra el ID con ceros (0107)')

  const profile = workbook.getWorksheet('Ficha del discípulo')
  assert.ok(JSON.stringify(profile.getSheetValues()).includes('ID 0107'), 'El encabezado de la ficha en Excel empieza por el ID')
  pass('ficha en Excel: el ID va primero en el encabezado')

  // Attendance and birthday reports carry the ID
  const [ana] = (await db.query("SELECT id_miembro FROM miembro WHERE nombres='Ana'"))[0]
  const [activity] = await db.execute("INSERT INTO actividad(tipo_actividad,titulo,fecha,hora,lugar,id_usuario_creacion) VALUES ('culto','Culto de prueba','2026-11-01','09:00','Templo',?)", [me.id])
  await db.execute("INSERT INTO asistencia(id_actividad,id_miembro,id_usuario_registro,estado_asistencia) VALUES (?,?,?,'presente')", [activity.insertId, ana.id_miembro, me.id])
  await db.execute("INSERT INTO asistencia(id_actividad,nombre_visitante,id_usuario_registro,estado_asistencia) VALUES (?,'Visitante X',?,'visitante')", [activity.insertId, me.id])
  const sheetRows = async path => { const file = (await request(path, { cookie: owner.cookie, raw: true })).data; const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(await file.arrayBuffer())); return JSON.stringify(book.worksheets[0].getSheetValues()) }
  const attendance = await sheetRows('management/reports/asistencia?format=xlsx')
  assert.ok(attendance.includes('"ID"') && attendance.includes('"0101"') && attendance.includes('Visitante X'))
  const eventSheet = await sheetRows(`management/reports/asistencia?format=xlsx&activityId=${activity.insertId}`)
  assert.ok(eventSheet.includes('"ID"') && eventSheet.includes('"0101"'))
  const birthdays = await sheetRows('management/reports/cumpleanos?format=xlsx')
  assert.ok(birthdays.indexOf('"ID"') < birthdays.indexOf('"Nombre"') && birthdays.includes('"0101"'))
  pass('reportes de asistencia (general y por evento) y cumpleaños incluyen la columna ID')

  // Records created outside the app (old data) are numbered by the migration
  const hash = await hashPassword(password)
  await db.execute("INSERT INTO usuario(correo_login,password_hash,estado_usuario) VALUES ('legacy@example.invalid',?,'activo')", [hash])
  await db.execute("INSERT INTO miembro(nombres,tipo_identificacion,numero_identificacion,celular,fecha_nacimiento,codigo_qr,id_usuario_creacion,id_usuario_actualizacion) VALUES ('Antiguo','CC','OLD-1','3000000000','1980-01-01',UUID(),?,?)", [me.id, me.id])
  await applyMigrations(db); await applyMigrations(db)
  const [[legacyUser]] = await db.query("SELECT codigo_usuario FROM usuario WHERE correo_login='legacy@example.invalid'")
  const [[legacyMember]] = await db.query("SELECT codigo_miembro FROM miembro WHERE numero_identificacion='OLD-1'")
  assert.equal(legacyUser.codigo_usuario, 4); assert.equal(legacyMember.codigo_miembro, 113)
  assert.equal((await request('management/members', { cookie: owner.cookie, status: 201, body: { ...base, nombres: 'Siguiente', numero_identificacion: '11', id_libro: book.insertId } })).data.code, '0114')
  const [[duplicates]] = await db.query('SELECT COUNT(*) - COUNT(DISTINCT codigo_miembro) AS repeated, SUM(codigo_miembro IS NULL) AS missing FROM miembro')
  assert.equal(Number(duplicates.repeated), 0); assert.equal(Number(duplicates.missing), 0)
  pass('registros antiguos sin ID se numeran al migrar (ADM-0004, 0113); repetir la migración no cambia nada')

  console.log(`\nRESULTADO: ${results.length}/${results.length} grupos de verificación aprobados.`)
} finally {
  if (server) await new Promise(resolve => server.close(resolve))
  if (pool) await pool.end()
  await db.query(`DROP DATABASE IF EXISTS \`${database}\``); await db.end()
  console.log('Base temporal eliminada; datos originales conservados.')
}
