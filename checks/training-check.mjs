import { reportTable } from './report-table.mjs'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import mysql from 'mysql2/promise'
import express from 'express'
import ExcelJS from 'exceljs'
import { applyMigrations } from '../server/migration-runner.js'
import { pickOption } from './select-helper.mjs'

const testDatabase = `calvario_training_test_${randomUUID().replaceAll('-', '')}`
assert.match(testDatabase, /^calvario_training_test_[a-f0-9]{32}$/)
process.env.DB_NAME = testDatabase
const { databaseConfig } = await import('../server/config.js')
assert.ok(['localhost', '127.0.0.1', '::1'].includes(databaseConfig.host), 'La prueba requiere MySQL local.')
const { database, ...config } = databaseConfig
const connection = await mysql.createConnection(config)
let pool, server, browser, vite
try {
  await connection.query(`CREATE DATABASE \`${testDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
  await connection.query(`USE \`${testDatabase}\``)
  await applyMigrations(connection)
  pool = (await import('../server/db.js')).pool
  const { authRouter } = await import('../server/auth.js')
  const { managementRouter } = await import('../server/management.js')
  const app = express(); app.use(express.json()); app.use('/api/auth', authRouter); app.use('/api/management', managementRouter)
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  process.env.APP_ORIGINS = base
  const password = `Training-${randomUUID()}`
  async function request(path, body, cookie = '', method, expected = 200) {
    const response = await fetch(`${base}/api/${path}`, { method: method || (body === undefined ? 'GET' : 'POST'), headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
    const data = await response.json()
    assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`)
    return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  const { bootstrapAdmin } = await import('../server/bootstrap-admin.js')
  const { hashPassword } = await import('../server/auth.js')
  await bootstrapAdmin({ name: 'Propietario de prueba', email: 'owner@example.invalid', password })
  const passwordHash = await hashPassword(password)
  const accounts = {}
  for (const [name, role] of [['owner', 'Administrador'], ['leader', 'Discipulador'], ['media', 'Multimedia'], ['assistant', 'Asistencia Pastoral'], ['basic', 'Usuario'], ['pending', null]]) {
    const email = `${name}@example.invalid`
    if (name !== 'owner') {
      const [created] = await pool.execute('INSERT INTO usuario(correo_login,password_hash,estado_usuario) VALUES (?,?,?)', [email,passwordHash,role ? 'activo' : 'pendiente'])
      await pool.execute('INSERT INTO usuario_rol(id_usuario,id_rol) SELECT ?,id_rol FROM rol_sistema WHERE nombre=?', [created.insertId,role || 'Usuario'])
    }
    const result = await request('auth/login', { email, password })
    accounts[name] = { id: result.data.user.id, cookie: result.cookie }
  }
  const owner = accounts.owner.cookie, leaderCookie = accounts.leader.cookie, media = accounts.media.cookie, assistant = accounts.assistant.cookie, basic = accounts.basic.cookie
  const values = { nombres: 'Legado', apellidos: 'Prueba', tipo_identificacion: 'CC', numero_identificacion: 'L1', celular: '3001234567', fecha_nacimiento: '1990-03-05', grupo_sanguineo_rh: 'O+', eps: 'EPS prueba', contacto_emergencia_nombre: 'Contacto prueba', contacto_emergencia_celular: '3001112233' }
  const memberA = (await request('management/members', values, owner, 'POST', 201)).data.id
  const memberB = (await request('management/members', { ...values, nombres: 'Legado B', numero_identificacion: 'L2' }, owner, 'POST', 201)).data.id
  const leader = (await request('management/members', { ...values, nombres: 'Responsable', numero_identificacion: 'L3' }, owner, 'POST', 201)).data.id
  assert.deepEqual((await request('management/catalogs', undefined, owner)).data.libros, [])
  await request(`management/users/${accounts.leader.id}/member`, { memberId: leader }, owner)
  const group = (await request('management/groups', { codigo_grupo: 'TRAIN', nombre: 'Grupo de prueba', id_discipulador: leader, estado_grupo: 'activo' }, owner, 'POST', 201)).data.id
  await request(`management/members/${memberA}`, { id_grupo: group }, owner, 'PATCH')
  await request('management/training/books', undefined, basic, 'GET', 403)
  await request('management/training/books', { nombre: 'No autorizado' }, accounts.pending.cookie, 'POST', 403)
  const first = (await request('management/training/books', { nombre: 'Fundamentos', descripcion: 'Primera etapa' }, media, 'POST', 201)).data.id
  const second = (await request('management/training/books', { nombre: 'Crecimiento' }, leaderCookie, 'POST', 201)).data.id
  await request('management/training/books', { nombre: 'Servicio' }, assistant, 'POST', 201)
  await request('management/training/books', { nombre: 'fundamentos' }, owner, 'POST', 409)
  await request('management/training/books', { nombre: ' ' }, owner, 'POST', 400)
  await request('management/training/books', { nombre: 'Inválido', descripcion: 'x'.repeat(2001) }, owner, 'POST', 400)
  const countMembers = async () => (await pool.execute('SELECT COUNT(*) AS total FROM miembro'))[0][0].total
  const before = await countMembers()
  await request('management/members', { ...values, numero_identificacion: 'BAD1' }, owner, 'POST', 400)
  await request('management/members', { ...values, numero_identificacion: 'BAD2', id_libro: 999999 }, owner, 'POST', 400)
  assert.equal(await countMembers(), before, 'No debe quedar una ficha parcial después de una asignación inválida.')
  const newMember = (await request('management/members', { ...values, nombres: 'Nuevo', numero_identificacion: 'NEW', id_libro: first }, owner, 'POST', 201)).data.id
  await request(`management/members/${memberA}/book`, { id_libro: first, expectedId: null }, leaderCookie, 'PUT')
  await request(`management/members/${memberB}/book`, { id_libro: first, expectedId: null }, leaderCookie, 'PUT', 404)
  await request(`management/members/${memberA}/book`, { id_libro: 999999, expectedId: first }, leaderCookie, 'PUT', 400)
  await request(`management/members/${memberA}/book`, { id_libro: second, expectedId: null }, owner, 'PUT', 409)
  await request(`management/members/${memberA}`, { nombres: 'Legado actualizado' }, owner, 'PATCH')
  const findMember = async id => (await request('management/members', undefined, owner)).data.items.find(item => item.id_miembro === id)
  assert.equal((await findMember(memberA)).libro_actual, 'Fundamentos')
  assert.equal((await findMember(memberB)).id_libro, null)
  assert.equal((await findMember(newMember)).id_libro, first)
  await request(`management/users/${accounts.basic.id}/member`, { memberId: memberA }, owner)
  assert.deepEqual((await request('auth/me', undefined, basic)).data.user.trainingBook, { id: first, name: 'Fundamentos' })
  // Even an accidental grant cannot let a basic disciple create books.
  const [basicRole] = await pool.execute("SELECT id_rol FROM rol_sistema WHERE nombre='Usuario'")
  await pool.execute("INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance) VALUES (?,'adiestramiento.gestionar','todos'),(?,'gestion.acceder','todos')", [basicRole[0].id_rol, basicRole[0].id_rol])
  await request('management/training/books', { nombre: 'Intento básico' }, basic, 'POST', 403)
  await request(`management/training/books/${first}`, { nombre: 'Intento básico' }, basic, 'PATCH', 403)
  await request(`management/training/books/${first}`, {}, basic, 'DELETE', 403)
  await pool.execute('DELETE FROM rol_permiso WHERE id_rol=?', [basicRole[0].id_rol])
  async function workbook(path, cookie, expected = 200) {
    const response = await fetch(`${base}/api/management/${path}`, { headers: { Cookie: cookie } })
    assert.equal(response.status, expected)
    if (expected !== 200) return null
    const result = new ExcelJS.Workbook(); await result.xlsx.load(Buffer.from(await response.arrayBuffer()))
    if (/^members\/\d+\/excel$/.test(path)) {
      const profile = result.getWorksheet('Ficha del discípulo')
      assert.ok(profile && profile.getImages().length === 1)
      assert.equal(result.views[0].activeTab, result.worksheets.indexOf(profile))
      if (!reportTable(result.worksheets[0]).header.includes('EPS')) assert.equal(JSON.stringify(result.worksheets.map(sheet=>sheet.getSheetValues())).includes('EPS prueba'), false)
    }
    return result.worksheets[0]
  }
  const full = await workbook(`members/${memberA}/excel`, owner)
  const headers = reportTable(full).header
  assert.ok(headers.includes('EPS') && headers.includes('Libro de adiestramiento') && headers.includes('Código QR'))
  assert.equal(reportTable(full).rows[0].getCell(headers.indexOf('Libro de adiestramiento')).value, 'Fundamentos')
  assert.equal(reportTable(full).rows[0].getCell(headers.indexOf('EPS')).value, 'EPS prueba')
  const limited = await workbook('reports/discipulos?format=xlsx', leaderCookie)
  assert.equal(reportTable(limited).count, 1)
  assert.equal(reportTable(limited).header.includes('EPS'), false)
  await workbook(`members/${memberB}/excel`, leaderCookie, 404)
  await workbook('reports/discipulos?format=xlsx', media, 403)
  const assisting = await workbook(`members/${memberA}/excel`, assistant)
  assert.equal(reportTable(assisting).header.includes('Celular de emergencia'), false)
  const noBook = await workbook('reports/discipulos?format=xlsx&sin_libro=1', owner)
  assert.equal(reportTable(noBook).count, 2)
  await request(`management/members/${memberA}/book`, { id_libro: second, expectedId: first }, owner, 'PUT')
  assert.equal((await request('auth/me', undefined, basic)).data.user.trainingBook.name, 'Crecimiento')
  const [mediaRole] = await pool.execute("SELECT id_rol FROM rol_sistema WHERE nombre='Multimedia'")
  await pool.execute("DELETE FROM rol_permiso WHERE id_rol=? AND codigo_permiso='adiestramiento.gestionar'", [mediaRole[0].id_rol])
  await applyMigrations(connection)
  assert.equal((await findMember(memberA)).id_libro, second)
  assert.equal((await request('management/training/books', undefined, owner)).data.items.length, 3)
  await request('management/training/books', { nombre: 'Permiso revocado' }, media, 'POST', 403)
  await request(`management/training/books/${first}`, { nombre: 'Permiso revocado' }, media, 'PATCH', 403)
  const usedBook=(await request(`management/training/books/${first}`,undefined,assistant)).data
  assert.equal(usedBook.asignaciones,1)
  await request(`management/training/books/${first}`,{nombre:'Fundamentos actualizado',descripcion:'Edición revisada',expectedName:usedBook.nombre,expectedDescription:usedBook.descripcion},assistant,'PATCH')
  assert.equal((await findMember(newMember)).id_libro,first)
  assert.equal((await findMember(newMember)).libro_actual,'Fundamentos actualizado')
  const renamed=await workbook(`members/${newMember}/excel`,owner)
  assert.ok(reportTable(renamed).rows[0].values.includes('Fundamentos actualizado'))
  await request(`management/training/books/${first}`,{nombre:'Cambio desactualizado',expectedName:usedBook.nombre,expectedDescription:usedBook.descripcion},owner,'PATCH',409)
  await request(`management/training/books/${first}`,{},assistant,'DELETE',409)
  assert.equal((await findMember(newMember)).id_libro,first)
  await request(`management/training/books/${first}`,{nombre:'Fundamentos',descripcion:'Primera etapa'},assistant,'PATCH')
  await request(`management/training/books/${second}`,{nombre:'Fundamentos'},owner,'PATCH',409)
  await request('management/training/books/999999',{nombre:'No existe'},owner,'PATCH',404)
  const removable=(await request('management/training/books',{nombre:'Temporal eliminable'},owner,'POST',201)).data.id
  assert.equal((await request(`management/training/books/${removable}`,undefined,owner)).data.asignaciones,0)
  await request(`management/training/books/${removable}`,{expectedName:'Nombre anterior'},owner,'DELETE',409)
  await request(`management/training/books/${removable}`,{},accounts.pending.cookie,'DELETE',403)
  await request(`management/training/books/${removable}`,{expectedName:'Temporal eliminable',expectedDescription:null},assistant,'DELETE')
  await request(`management/training/books/${removable}`,undefined,owner,'GET',404)
  await request(`management/training/books/${removable}`,{},owner,'DELETE',404)
  assert.equal((await request('management/training/books',undefined,owner)).data.items.length,3)
  console.log('PASS libros: edición con asignaciones conservadas, Excel actualizado, concurrencia, permisos y eliminación de libros sin uso.')
  console.log('PASS adiestramiento: catálogo vacío, permisos, creación por cargos, asignación nueva/existente, alcance por grupo, concurrencia, perfil propio, Excel completo, privacidad y migración repetible.')

  if (process.argv.includes('--ui')) {
    const { chromium } = await import('../.secrets/browser-tools/node_modules/playwright-core/index.mjs')
    const ui = 'http://127.0.0.1:5187'
    process.env.APP_ORIGINS = `${base},${ui}`
    vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5187', '--strictPort'], { windowsHide: true, stdio: 'ignore' })
    let ready = false
    for (let count = 0; count < 100; count++) {
      try { ready = (await fetch(ui)).ok } catch {}
      if (ready) break
      await delay(200)
    }
    assert.ok(ready, 'Vite no inició para la comprobación de interfaz.')
    browser = await chromium.launch({ headless: true, channel: 'msedge' })
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
    await context.route('**/api/**', async route => { const url = new URL(route.request().url()); const response = await route.fetch({ url: `${base}${url.pathname}${url.search}` }); await route.fulfill({ response }) })
    const login = await context.request.post(`${base}/api/auth/login`, { headers: { Origin: ui }, data: { email: 'owner@example.invalid', password } })
    assert.equal(login.status(), 200)
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(ui + '/#gestion/members')
    await page.getByRole('button', { name: 'Registrar discípulo', exact: true }).click()
    await page.getByLabel('Nombres', { exact: false }).fill('Desde interfaz')
    await page.getByLabel('Apellidos', { exact: true }).fill('Prueba')
    await pickOption(page.getByRole('combobox', { name: 'Tipo de identificación', exact: false }), 'CC')
    await page.getByLabel('Número de identificación', { exact: false }).fill('UI-TRAINING')
    await page.getByLabel('Celular', { exact: false }).first().fill('3001234567')
    await page.getByLabel('Fecha de nacimiento / cumpleaños', { exact: false }).fill('2000-01-01')
    await page.getByRole('button', { name: 'Continuar', exact: false }).click()
    await page.getByRole('button', { name: 'Crear libro aquí', exact: true }).click()
    await page.getByLabel('Nombre del libro', { exact: false }).fill('Libro desde el formulario')
    await page.getByLabel('Descripción (opcional)', { exact: true }).fill('Creado sin salir del registro.')
    await page.getByRole('button', { name: 'Guardar libro', exact: true }).click()
    await page.getByRole('combobox', { name: 'Libro de adiestramiento', exact: false }).filter({ hasText: 'Libro desde el formulario' }).waitFor()
    await page.getByRole('button', { name: 'Continuar', exact: false }).click()
    await page.getByRole('button', { name: 'Guardar discípulo', exact: true }).click()
    await page.getByRole('button', { name: 'Ver ficha de Desde interfaz Prueba', exact: true }).waitFor()
    const [created] = await pool.execute('SELECT m.id_libro,l.nombre FROM miembro m JOIN libro_adiestramiento l ON l.id_libro=m.id_libro WHERE m.numero_identificacion=?', ['UI-TRAINING'])
    assert.equal(created[0].nombre, 'Libro desde el formulario')
    await page.getByRole('button', { name: /^Sin libro/ }).click()
    await page.getByRole('button', { name: 'Ver ficha de Legado B Prueba', exact: true }).click()
    await pickOption(page.getByRole('combobox', { name: 'Seleccionar libro de adiestramiento', exact: false }), String(first))
    await page.getByRole('button', { name: 'Asignar libro', exact: true }).click()
    await page.getByRole('region', { name: 'Adiestramiento del discípulo', exact: true }).getByText('Fundamentos', { exact: true }).first().waitFor()
    const downloadEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Descargar ficha en Excel', exact: true }).click()
    const download = await downloadEvent
    const downloaded = new ExcelJS.Workbook(); await downloaded.xlsx.load(await readFile(await download.path()))
    assert.ok(reportTable(downloaded.worksheets[0]).rows[0].values.includes('Fundamentos'))
    await page.goto(ui + '/#gestion/training')
    await page.getByRole('heading', { name: 'Adiestramiento', exact: true }).last().waitFor()
    await page.getByRole('button',{name:'Editar Fundamentos',exact:true}).click()
    await page.getByLabel('Nombre del libro',{exact:false}).fill('Fundamentos revisado')
    await page.getByRole('group',{name:'Editar libro de adiestramiento',exact:true}).getByRole('textbox',{name:/^Descripción \(opcional\)/}).fill('Actualizado desde la misma interfaz.')
    await page.getByRole('button',{name:'Guardar cambios',exact:true}).click()
    await page.getByRole('heading',{name:'Fundamentos revisado',exact:true}).waitFor()
    assert.equal((await findMember(newMember)).libro_actual,'Fundamentos revisado')
    await page.getByRole('button',{name:'Eliminar Fundamentos revisado',exact:true}).click()
    const confirmation=page.getByRole('region',{name:'Confirmar eliminación de libro',exact:true})
    await confirmation.waitFor()
    assert.equal(await confirmation.getByRole('button',{name:'Confirmar eliminación',exact:true}).isDisabled(),true)
    await confirmation.getByRole('button',{name:'Cancelar eliminación',exact:true}).click()
    await page.getByRole('button',{name:'Eliminar Servicio',exact:true}).click()
    await confirmation.getByRole('button',{name:'Cancelar eliminación',exact:true}).click()
    assert.equal(await page.getByRole('heading',{name:'Servicio',exact:true}).count(),1)
    await page.getByRole('button',{name:'Eliminar Servicio',exact:true}).click()
    await confirmation.getByRole('button',{name:'Confirmar eliminación',exact:true}).click()
    await page.getByRole('heading',{name:'Servicio',exact:true}).waitFor({state:'detached'})
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Desbordamiento en ${width}px`)
    }
    assert.deepEqual(errors, [])
    console.log('PASS interfaz: creación integrada, asignación, edición, cancelación y confirmación de borrado, protección de asignados, Excel y 320/390/768/1440px.')
  }
} catch (error) {
  if (browser) {
    const page=browser.contexts()[0]?.pages()[0]
    if(page) await page.screenshot({path:'.secrets/training-ui-failure.png',fullPage:true}).catch(()=>{})
  }
  throw error
} finally {
  if (browser) await browser.close()
  if (vite) vite.kill('SIGTERM')
  if (server) await new Promise(resolve => server.close(resolve))
  if (pool) await pool.end()
  await connection.query(`DROP DATABASE IF EXISTS \`${testDatabase}\``)
  await connection.end()
  console.log('Base temporal de adiestramiento eliminada; datos locales conservados.')
}
