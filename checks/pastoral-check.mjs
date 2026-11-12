import { pickOption } from './select-helper.mjs'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import mysql from 'mysql2/promise'
import express from 'express'
import { applyMigrations } from '../server/migration-runner.js'
import { jsonBody } from '../server/body-parser.js'

const testDatabase = `calvario_pastoral_test_${randomUUID().replaceAll('-', '')}`
assert.match(testDatabase, /^calvario_pastoral_test_[a-f0-9]{32}$/)
process.env.DB_NAME = testDatabase
process.env.MAIL_PROVIDER='disabled' // registration emails below use real provider domains: never send mail from this check
const { databaseConfig } = await import('../server/config.js')
const { database, ...config } = databaseConfig
const connection = await mysql.createConnection(config)
const ui = process.env.UI_ORIGIN || 'http://127.0.0.1:5173'
let pool, server, browser
try {
  await connection.query(`CREATE DATABASE \`${testDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
  await connection.query(`USE \`${testDatabase}\``)
  await applyMigrations(connection)
  pool = (await import('../server/db.js')).pool
  const { authRouter } = await import('../server/auth.js')
  const { managementRouter } = await import('../server/management.js')
  const app = express(); app.use(jsonBody); app.use('/api/auth', authRouter); app.use('/api/management', managementRouter)
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  process.env.APP_ORIGINS = `${base},${ui}`
  const password = `Pastoral-${randomUUID()}`
  async function api(path, body, cookie = '', expected = 200, method) {
    const response = await fetch(`${base}/api/${path}`, { method: method || (body === undefined ? 'GET' : 'POST'), headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
    const data = await response.json()
    assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`)
    return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  const owner = await api('auth/register', { email: 'owner@example.invalid', password }, '', 201)
  const catalogs = (await api('management/catalogs', undefined, owner.cookie)).data
  // Reproduce the local bootstrap: no groups and a Superadmin linked to rank 6.
  assert.deepEqual(catalogs.grupos,[])
  const bootstrapInput={nombres:'Primer discipulador',apellidos:'Prueba',tipo_identificacion:'CC',numero_identificacion:'BOOTSTRAP',celular:'3001234567',fecha_nacimiento:'1990-03-05',tipo_registro:'administrativo',id_rol_eclesiastico:catalogs.roles.find(role=>role.nivel_jerarquico===6).id_rol_eclesiastico,account_email:'bootstrap-leader@gmail.com',account_password:password,account_confirmation:password}
  const bootstrap=(await api('management/members',bootstrapInput,owner.cookie,201)).data.id
  const [[bootstrapStored]]=await pool.execute('SELECT id_grupo FROM miembro WHERE id_miembro=?',[bootstrap])
  assert.equal(bootstrapStored.id_grupo,null)
  await pool.execute('UPDATE usuario SET id_miembro=? WHERE id_usuario=?',[bootstrap,owner.data.user.id])
  const linkedOwner=(await api('auth/me',undefined,owner.cookie)).data.user
  assert.equal(linkedOwner.pastoralRole.level,6)
  assert.equal(linkedOwner.registration.canAssignServices,true)
  assert.equal(linkedOwner.registration.canCreateAdministrative,true)
  const group = (await api('management/groups', { codigo_grupo: 'FAMILIA', nombre: 'Familia de prueba', estado_grupo: 'activo' }, owner.cookie, 201)).data.id
  const outside = (await api('management/groups', { codigo_grupo: 'OTRO', nombre: 'Otro grupo', estado_grupo: 'activo' }, owner.cookie, 201)).data.id
  let sequence = 0
  function member(extra = {}) {
    sequence++
    return { nombres: `Persona ${sequence}`, apellidos: 'Prueba', tipo_identificacion: 'CC', numero_identificacion: `P-${sequence}`, celular: '3001234567', fecha_nacimiento: '1990-03-05', id_grupo: group, ...extra }
  }
  function administrative(level, extra = {}) {
    const email = `pastoral-${sequence + 1}@example.invalid`
    return member({ tipo_registro: 'administrativo', id_rol_eclesiastico: catalogs.roles.find(role => role.nivel_jerarquico === level).id_rol_eclesiastico, account_email: email, account_password: password, account_confirmation: password, ...extra })
  }
  const actors = []
  for (const level of [1, 2, 3, 4, 5]) {
    const input = administrative(level)
    const created = await api('management/members', input, owner.cookie, 201)
    assert.equal(created.data.accountCreated, true)
    assert.equal(created.cookie, undefined, 'El registro no debe reemplazar la sesión del creador')
    const login = await api('auth/login', { email: input.account_email, password })
    assert.equal(login.data.user.pastoralRole.level, level)
    assert.equal(login.data.user.registration.canCreateAdministrative, true)
    assert.equal(login.data.user.memberId, created.data.id)
    const subordinate = administrative(6)
    await api('management/members', subordinate, login.cookie, 201)
    actors.push(login)
  }
  const leaderInput = administrative(6, { responsable_grupo: 1, id_ministerio: catalogs.ministerios[0].id_ministerio })
  await api('management/members', administrative(1), actors[4].cookie, 201)
  const leader = (await api('management/members', leaderInput, actors[4].cookie, 201)).data.id
  const disciple = await api('auth/login', { email: leaderInput.account_email, password })
  assert.equal(disciple.data.user.pastoralRole.level, 6)
  assert.equal(disciple.data.user.registration.canCreateAdministrative, false)
  assert.equal(disciple.data.user.registration.canAssignServices, false)
  assert.equal(disciple.data.user.permissions['miembros.registrar'], 'grupo')
  const limitedCatalogs = (await api('management/catalogs', undefined, disciple.cookie)).data
  assert.deepEqual(limitedCatalogs.registrationGroups.map(row => row.id_grupo), [group])
  const normalInput = member()
  const normal = await api('management/members', normalInput, disciple.cookie, 201)
  assert.equal(normal.data.accountCreated, false)
  const [stored] = await pool.execute('SELECT id_rol_eclesiastico,id_grupo FROM miembro WHERE id_miembro=?', [normal.data.id])
  assert.equal(stored[0].id_rol_eclesiastico, null); assert.equal(stored[0].id_grupo, group)
  const [unwantedAccount] = await pool.execute('SELECT id_usuario FROM usuario WHERE id_miembro=?', [normal.data.id])
  assert.equal(unwantedAccount.length, 0)
  await api('management/members', administrative(5), disciple.cookie, 403)
  await api('management/members', member({ id_rol_eclesiastico: catalogs.roles[0].id_rol_eclesiastico }), disciple.cookie, 403)
  await api('management/members', member({ funcion_iglesia: 'Pastor' }), disciple.cookie, 403)
  await api('management/members', member({ id_cobertura_pastoral: leader }), disciple.cookie, 403)
  await api('management/members', member({ id_ministerio: catalogs.ministerios[0].id_ministerio }), disciple.cookie, 403)
  const unassigned=await api('management/members', member({ id_grupo: null }), disciple.cookie, 201)
  assert.ok((await api('management/members',undefined,disciple.cookie)).data.items.some(row=>row.id_miembro===unassigned.data.id))
  assert.ok(!(await api('management/members',undefined,disciple.cookie)).data.items.some(row=>row.id_miembro===bootstrap))
  await api('management/members', member({ id_grupo: outside }), disciple.cookie, 404)
  await api('management/groups', { codigo_grupo: 'NO', nombre: 'No autorizado', estado_grupo: 'activo' }, disciple.cookie, 403)
  await api(`management/groups/${group}`, { direccion: 'Dirección actualizada' }, disciple.cookie, 200, 'PATCH')
  await api(`management/groups/${group}`, { id_discipulador: normal.data.id }, disciple.cookie, 403, 'PATCH')
  // Even an accidentally granted generic permission cannot bypass pastoral authority.
  const [discipleRoles] = await pool.execute("SELECT id_rol FROM rol_sistema WHERE nombre='Discipulador'")
  for (const code of ['usuarios.gestionar', 'ministerios.gestionar', 'miembros.editar']) await pool.execute('INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance) VALUES (?,?,\'grupo\') ON DUPLICATE KEY UPDATE alcance=\'grupo\'', [discipleRoles[0].id_rol, code])
  await api('auth/admin/users', undefined, disciple.cookie, 403)
  await api(`management/users/${owner.data.user.id}/member`, { memberId: leader }, disciple.cookie, 403)
  await api(`management/members/${normal.data.id}`, { id_rol_eclesiastico: catalogs.roles[0].id_rol_eclesiastico }, disciple.cookie, 403, 'PATCH')
  await api(`management/members/${normal.data.id}/ministries`, { ids: [catalogs.ministerios[0].id_ministerio] }, disciple.cookie, 403, 'PUT')
  const systemRoles = (await api('auth/admin/users', undefined, owner.cookie)).data.roles
  await api(`auth/admin/users/${disciple.data.user.id}/role`, { roleId: systemRoles.find(role => role.name === 'Administrador').id }, actors[4].cookie, 403)
  await api(`auth/admin/users/${owner.data.user.id}/role`, { roleId: systemRoles.find(role => role.name === 'Usuario').id }, actors[4].cookie, 403)
  await api(`management/users/${owner.data.user.id}/member`, { memberId: leader }, actors[4].cookie, 403)
  const mediaAccount = await api('auth/register', { email: 'media@example.invalid', password }, '', 201)
  await api(`auth/admin/users/${mediaAccount.data.user.id}/role`, { roleId: systemRoles.find(role => role.name === 'Multimedia').id }, owner.cookie)
  const media = await api('auth/login', { email: 'media@example.invalid', password })
  assert.equal(media.data.user.registration.canCreateAdministrative, false)
  assert.equal(media.data.user.permissions['miembros.ver'], undefined)
  assert.equal(media.data.user.permissions['miembros.editar'], undefined)
  const unassignedMedia=await api('management/members', member({ id_grupo: null }), media.cookie, 201)
  assert.equal(unassignedMedia.data.accountCreated,false)
  const mediaCreated = await api('management/members', member(), media.cookie, 201)
  await api('management/members', undefined, media.cookie, 403)
  await api(`management/members/${mediaCreated.data.id}`, { nombres: 'Cambio no autorizado' }, media.cookie, 403, 'PATCH')
  const [linkedMinistry] = await pool.execute('SELECT id_ministerio FROM miembro_ministerio WHERE id_miembro=? AND activo=1', [leader])
  assert.equal(linkedMinistry[0].id_ministerio, catalogs.ministerios[0].id_ministerio)
  const counts = async () => {
    const [rows] = await pool.execute('SELECT (SELECT COUNT(*) FROM miembro) AS fichas,(SELECT COUNT(*) FROM usuario) AS cuentas,(SELECT COUNT(*) FROM usuario_rol) AS roles')
    return rows[0]
  }
  const before = await counts()
  const [assistantScopeRole] = await pool.execute("SELECT id_rol FROM rol_sistema WHERE nombre='Asistencia Pastoral'")
  await pool.execute("UPDATE rol_permiso SET alcance='grupo' WHERE id_rol=? AND codigo_permiso IN ('grupos.editar','ministerios.gestionar')", [assistantScopeRole[0].id_rol])
  await api('management/members', administrative(6, { responsable_grupo: 1 }), actors[4].cookie, 404)
  await api('management/members', administrative(6, { id_ministerio: catalogs.ministerios[0].id_ministerio }), actors[4].cookie, 404)
  assert.deepEqual(await counts(), before, 'Los servicios deben respetar el alcance de grupos de cada permiso')
  await api('management/members', administrative(4, { account_email: leaderInput.account_email }), owner.cookie, 409)
  assert.deepEqual(await counts(), before)
  const broken = administrative(4, { id_ministerio: 999999 })
  await api('management/members', broken, owner.cookie, 400)
  assert.deepEqual(await counts(), before, 'Un fallo tardío debe revertir ficha, cuenta y rol')
  await api('auth/login', { email: broken.account_email, password }, '', 401)
  const [assistantRole] = await pool.execute("SELECT id_rol FROM rol_sistema WHERE nombre='Asistencia Pastoral'")
  await pool.execute("DELETE FROM rol_permiso WHERE id_rol=? AND codigo_permiso='miembros.registrar'", [assistantRole[0].id_rol])
  assert.equal((await api('auth/me', undefined, actors[4].cookie)).data.user.registration.canCreateAdministrative, false)
  await api('management/members', administrative(4), actors[4].cookie, 403)
  assert.equal((await api('auth/me', undefined, owner.cookie)).data.user.id, owner.data.user.id)
  const [grantsBefore] = await pool.execute('SELECT * FROM rol_permiso ORDER BY id_rol,codigo_permiso')
  await applyMigrations(connection)
  const [grantsAfter] = await pool.execute('SELECT * FROM rol_permiso ORDER BY id_rol,codigo_permiso')
  assert.deepEqual(grantsAfter, grantsBefore, 'La migración no debe sobrescribir permisos personalizados al repetirse')
  console.log('PASS API pastoral: all five authorized creators, linked accounts and login, disciple-only/group scope, service and role bypass rejection, unchanged creator session, atomic rollback and repeatable migration.')

  if (process.env.PASTORAL_API_ONLY !== '1') {
    const require = createRequire(import.meta.url)
    const { chromium } = require(process.env.TEMP + '/nexusbox-browser-check/node_modules/playwright')
    browser = await chromium.launch({ headless: true, channel: 'msedge' })
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
    await context.route('**/api/**', async route => {
      const url = new URL(route.request().url())
      const response = await route.fetch({ url: `${base}${url.pathname}${url.search}` })
      await route.fulfill({ response })
    })
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.setDefaultTimeout(12000)
    async function login(email) {
      await page.goto(`${ui}/#login`, { waitUntil: 'domcontentloaded' })
      await page.getByLabel('Correo electrónico', { exact: true }).fill(email)
      await page.getByLabel('Contraseña', { exact: true }).fill(password)
      await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
      await page.waitForURL(`${ui}/#gestion`)
      await page.locator('#dashboard-title').waitFor()
    }
    const navigation = page.getByRole('navigation', { name: 'Navegación principal' })
    async function startRegistration() {
      await navigation.getByRole('link', { name: 'Discípulos', exact: true }).click()
      await page.getByRole('button', { name: 'Registrar discípulo', exact: true }).click()
    }
    async function basic(name, identification) {
      await page.getByLabel('Nombres *', { exact: true }).fill(name)
      await page.getByLabel('Apellidos', { exact: true }).fill('Prueba')
      await pickOption(page.getByLabel('Tipo de identificación *', { exact: true }), 'CC')
      await page.getByLabel('Número de identificación *', { exact: true }).fill(identification)
      await page.getByLabel('Celular *', { exact: true }).fill('3001234567')
      await page.getByLabel('Fecha de nacimiento / cumpleaños *', { exact: true }).fill('1990-03-05')
      await page.getByRole('button', { name: 'Continuar', exact: true }).click()
    }
    await login('owner@example.invalid')
    await startRegistration()
    // Disciple registration has no "Tipo de registro": administrative accounts come from Usuarios y roles.
    assert.equal(await page.getByLabel('Tipo de registro', { exact: true }).count(), 0)
    assert.equal(await page.locator('select[name=id_rol_eclesiastico],input[name=account_email]').count(), 0)
    await api('management/members', { nombres: 'Discipulador de interfaz', apellidos: 'Prueba', tipo_identificacion: 'CC', numero_identificacion: 'UI-ADMIN', celular: '3001234567', fecha_nacimiento: '1990-03-05', tipo_registro: 'administrativo', id_rol_eclesiastico: catalogs.roles.find(role => role.nivel_jerarquico === 6).id_rol_eclesiastico, account_email: 'ui-leader@gmail.com', account_password: password, account_confirmation: password }, owner.cookie, 201)
    assert.equal((await page.evaluate(async () => (await (await fetch('/api/auth/me')).json()).user.email)), 'owner@example.invalid')
    const [uiLeaders]=await pool.execute("SELECT id_miembro,id_grupo FROM miembro WHERE numero_identificacion='UI-ADMIN'")
    assert.equal(uiLeaders[0].id_grupo,null)
    await page.goto(`${ui}/#gestion/groups`)
    await page.getByRole('button',{name:'Nuevo grupo',exact:true}).click()
    await page.getByText('Se asigna automáticamente al guardar',{exact:false}).waitFor()
    await page.getByLabel('Nombre *',{exact:true}).fill('Grupo después del discipulador')
    await pickOption(page.getByRole('combobox',{name:'Discipulador',exact:true}),String(uiLeaders[0].id_miembro))
    await page.getByRole('button',{name:'Guardar grupo',exact:true}).click()
    await page.getByRole('heading',{name:'Grupo después del discipulador',exact:true}).waitFor()
    await page.getByRole('button', { name: 'Mi cuenta', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Cerrar sesión', exact: true }).click()
    await page.waitForURL(`${ui}/#login`)
    await login('ui-leader@gmail.com')
    await page.waitForFunction(() => document.querySelector('.panel-avatar img')?.naturalWidth === 512)
    await startRegistration()
    assert.equal(await page.getByLabel('Tipo de registro', { exact: true }).count(), 0)
    assert.equal(await page.locator('select[name=id_rol_eclesiastico],input[name=account_email],input[name=funcion_iglesia],select[name=id_ministerio]').count(), 0)
    await basic('Discípulo de interfaz', 'UI-DISCIPLE')
    assert.equal(await page.locator('select[name=id_grupo]').evaluate(node=>node.required),false)
    assert.equal(await page.locator('select[name=id_grupo] option').count(), 2)
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()
    await page.getByRole('button', { name: 'Guardar discípulo', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Cambios guardados.' }).waitFor()
    await page.getByRole('button', { name: 'Ver ficha de Discípulo de interfaz Prueba', exact: true }).waitFor()
    assert.deepEqual(errors, [])
    console.log('PASS browser pastoral: administrative selector, account password confirmation, linked administrator login, disciple-only form, own group and mobile 390/320px.')
  }
} finally {
  if (browser) await browser.close()
  if (server) await new Promise(resolve => server.close(resolve))
  if (pool) await pool.end()
  await connection.query(`DROP DATABASE IF EXISTS \`${testDatabase}\``)
  await connection.end()
  console.log('Base temporal pastoral eliminada; datos locales conservados.')
}
