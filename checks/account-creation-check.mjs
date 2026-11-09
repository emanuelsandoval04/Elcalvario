import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import mysql from 'mysql2/promise'
import nodemailer from 'nodemailer'
import { applyMigrations } from '../server/migration-runner.js'
import { pickOption } from './select-helper.mjs'

const database = `calvario_creation_test_${randomUUID().replaceAll('-', '')}`
process.env.DB_NAME = database
const { databaseConfig } = await import('../server/config.js')
assert.ok(['localhost', '127.0.0.1', '::1'].includes(databaseConfig.host), 'Esta prueba requiere MySQL local y una base temporal.')
const { database: ignored, ...configuration } = databaseConfig
const db = await mysql.createConnection(configuration)
let pool, server, browser, preview
const originalTransport = nodemailer.createTransport
const welcomeEmails = []
let failWelcome = false
nodemailer.createTransport = () => ({ sendMail: async message => { welcomeEmails.push(message); if (failWelcome) throw Object.assign(new Error('Simulated failure'), { code: 'EAUTH' }); return { accepted: message.to, rejected: [] } }, close() {} })
try {
  await db.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
  await db.query(`USE \`${database}\``)
  await applyMigrations(db)
  pool = (await import('../server/db.js')).pool
  const { default: app } = await import('../server/app.js')
  const { bootstrapAdmin } = await import('../server/bootstrap-admin.js')
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  process.env.APP_ORIGINS = origin
  Object.assign(process.env, { MAIL_PROVIDER: 'gmail', GMAIL_USER: 'support@gmail.com', GMAIL_APP_PASSWORD: 'abcdefghijklmnop', APP_PUBLIC_URL: origin })
  const password = `Check-${randomUUID()}`
  async function request(path, { body, cookie = '', status = 200, origin: requestOrigin = origin } = {}) {
    const response = await fetch(`${origin}/api/auth/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Origin: requestOrigin, Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await response.json()
    assert.equal(response.status, status, `${path}: ${JSON.stringify(data)}`)
    return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie, newCookie: response.headers.get('set-cookie') }
  }
  await request('register', { body: { email: 'public@example.invalid', password }, status: 403 })
  assert.equal((await db.execute('SELECT COUNT(*) AS total FROM usuario'))[0][0].total, 0)
  const initial = await Promise.allSettled(['owner', 'other-owner'].map(name => bootstrapAdmin({ name, email: `${name}@example.invalid`, password })))
  assert.equal(initial.filter(result => result.status === 'fulfilled').length, 1)
  const ownerEmail = initial.find(result => result.status === 'fulfilled').value.email
  await assert.rejects(bootstrapAdmin({ name: 'Repeated', email: 'repeated@example.invalid', password }), { status: 409 })
  const owner = await request('login', { body: { email: ownerEmail, password } })
  const roles = (await request('admin/users', { cookie: owner.cookie })).data.roles
  const role = name => roles.find(item => item.name === name).id
  const input = (email, roleName = 'Usuario') => ({ name: 'Nombre asignado', email, password, confirmation: password, roleId: role(roleName) })
  const create = (body, cookie = owner.cookie, status = 201, extra = {}) => request('admin/users', { body, cookie, status, ...extra })

  await create(input('unauthorized@example.invalid'), '', 401)
  await request('register', { body: input('public@example.invalid'), cookie: owner.cookie, status: 403 })
  await create(input('cross-site@example.invalid'), owner.cookie, 403, { origin: 'https://untrusted.invalid' })
  await create({ ...input('invalid@example.invalid'), name: ' ' }, owner.cookie, 400)
  await create({ ...input('invalid@example.invalid'), email: 'invalid' }, owner.cookie, 400)
  await create({ ...input('invalid@example.invalid'), password: 'short', confirmation: 'short' }, owner.cookie, 400)
  await create({ ...input('invalid@example.invalid'), confirmation: 'different' }, owner.cookie, 400)
  await create({ ...input('invalid@example.invalid'), roleId: 999999 }, owner.cookie, 400)
  assert.equal(welcomeEmails.length, 0, 'Los intentos inválidos no deben enviar credenciales.')
  await db.execute('DELETE FROM limite_solicitud')
  const basic = await create(input('BASIC@example.invalid'))
  assert.equal(basic.newCookie, null, 'Crear una cuenta debe conservar la sesión del administrador.')
  assert.equal(basic.data.user.state, 'activo')
  assert.equal(basic.data.user.email, 'basic@example.invalid')
  assert.equal(basic.data.user.name, 'Nombre asignado')
  assert.equal(basic.data.emailDelivery, 'sent')
  assert.equal(welcomeEmails.at(-1).to[0], 'basic@example.invalid')
  assert.ok(welcomeEmails.at(-1).text.includes(password))
  assert.deepEqual(basic.data.user.roles, ['Usuario'])
  assert.ok(!JSON.stringify(basic.data).includes(password))
  const [[stored]] = await db.execute('SELECT password_hash FROM usuario WHERE id_usuario=?', [basic.data.user.id])
  assert.ok(stored.password_hash.startsWith('scrypt$')); assert.notEqual(stored.password_hash, password)
  const basicSession = await request('login', { body: { email: basic.data.user.email, password } })
  assert.equal((await request('me', { cookie: owner.cookie })).data.user.id, owner.data.user.id)
  await create(input('forbidden@example.invalid'), basicSession.cookie, 403)
  await create(input('basic@example.invalid'), owner.cookie, 409)
  await create({ ...input('no-member@example.invalid'), memberId: 999999 }, owner.cookie, 404)
  await create({ ...input('no-photo@example.invalid'), photo: 'invalid' }, owner.cookie, 400)
  for (const roleName of ['Apóstol General', 'Asistencia Apostólica', 'Pastor de Distrito', 'Pastor Local', 'Asistencia Pastoral']) {
    await db.execute('DELETE FROM limite_solicitud')
    const email = `authority-${role(roleName)}@example.invalid`
    await create(input(email, roleName))
    const actor = await request('login', { body: { email, password } })
    assert.equal(actor.data.user.registration.canManageAccounts, true)
    const created = await create(input(`created-${role(roleName)}@example.invalid`), actor.cookie)
    assert.equal(created.data.user.state, 'activo')
    await create(input('privileged@example.invalid', 'Administrador'), actor.cookie, 403)
    // Nobody but Administrador grants a rank equal to or above their own.
    await create(input(`same-rank-${role(roleName)}@example.invalid`, roleName), actor.cookie, 403)
    await create(input(`above-${role(roleName)}@example.invalid`, 'Apóstol General'), actor.cookie, 403)
    await create(input(`pastor-${role(roleName)}@example.invalid`, 'Pastor'), actor.cookie, roleName === 'Asistencia Pastoral' || roleName === 'Pastor Local' ? 403 : 201)
    const listed = (await request('admin/users', { cookie: actor.cookie })).data.roles.map(item => item.name)
    assert.ok(!listed.includes('Administrador') && !listed.includes(roleName) && !listed.includes('Apóstol General'), roleName)
  }
  assert.ok(roles.some(item => item.name === 'Administrador') && !roles.some(item => item.name === 'Superadmin'), 'Superadmin se unificó con Administrador.')
  // A lower rank can neither change nor delete a higher-ranked account.
  await db.execute('DELETE FROM limite_solicitud')
  const assistant = await request('login', { body: { email: `authority-${role('Asistencia Pastoral')}@example.invalid`, password } })
  const [[apostle]] = await db.execute('SELECT id_usuario, correo_login, estado_usuario FROM usuario WHERE correo_login=?', [`authority-${role('Apóstol General')}@example.invalid`])
  await request(`admin/users/${apostle.id_usuario}/role`, { body: { roleId: role('Usuario') }, cookie: assistant.cookie, status: 403 })
  const removal = await fetch(`${origin}/api/auth/admin/users/${apostle.id_usuario}`, { method: 'DELETE', headers: { Origin: origin, Cookie: assistant.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', expectedEmail: apostle.correo_login, expectedState: apostle.estado_usuario }) })
  assert.equal(removal.status, 403)
  const [[ownerRow]] = await db.execute('SELECT id_usuario FROM usuario WHERE correo_login=?', [ownerEmail])
  const apostleSession = await request('login', { body: { email: apostle.correo_login, password } })
  await request(`admin/users/${ownerRow.id_usuario}/role`, { body: { roleId: role('Usuario') }, cookie: apostleSession.cookie, status: 403 })
  const leaderEmail = 'leader@example.invalid'
  await create(input(leaderEmail, 'Discipulador'))
  const leader = await request('login', { body: { email: leaderEmail, password } })
  await create(input('leader-forbidden@example.invalid'), leader.cookie, 403)
  const [[administrator]] = await db.execute("SELECT id_usuario FROM usuario WHERE correo_login=?", [`authority-${role('Apóstol General')}@example.invalid`])
  const adminLogin = await request('login', { body: { email: `authority-${role('Apóstol General')}@example.invalid`, password } })
  await db.execute('UPDATE usuario_rol SET activo=0 WHERE id_usuario=?', [administrator.id_usuario])
  await create(input('revoked@example.invalid'), adminLogin.cookie, 403)

  const [member] = await db.execute("INSERT INTO miembro(nombres,tipo_identificacion,numero_identificacion,celular,fecha_nacimiento,codigo_qr) VALUES ('Discípulo','CC','90001','3000000000','1990-01-01',?)", [randomUUID()])
  const linked = await create({ ...input('linked@example.invalid', 'Pastor Local'), memberId: member.insertId })
  assert.equal(linked.data.user.memberId, member.insertId)
  const [[rank]] = await db.execute('SELECT r.nivel_jerarquico FROM miembro m JOIN rol_eclesiastico r ON r.id_rol_eclesiastico=m.id_rol_eclesiastico WHERE m.id_miembro=?', [member.insertId])
  assert.equal(rank.nivel_jerarquico, 4)
  assert.ok(welcomeEmails.at(-1).text.includes('Ficha del discípulo: Discípulo'))
  assert.ok(welcomeEmails.at(-1).text.includes('Rol asignado: Pastor Local'))
  await db.execute('DELETE FROM limite_solicitud')
  await create({ ...input('duplicate-member@example.invalid'), memberId: member.insertId }, owner.cookie, 409)
  // The account, role and profile must roll back together if the audit fails.
  await db.query("CREATE TRIGGER fail_create_audit BEFORE INSERT ON auditoria_seguridad FOR EACH ROW SET NEW.accion=IF(NEW.accion='account.created',NULL,NEW.accion)")
  const sentBeforeRollback = welcomeEmails.length
  await create(input('rollback@example.invalid'), owner.cookie, 503)
  assert.equal(welcomeEmails.length, sentBeforeRollback, 'Una transacción fallida no debe enviar datos de una cuenta inexistente.')
  assert.equal((await db.execute('SELECT COUNT(*) AS total FROM usuario WHERE correo_login=?', ['rollback@example.invalid']))[0][0].total, 0)
  await db.query('DROP TRIGGER fail_create_audit')
  await db.execute('DELETE FROM limite_solicitud')
  failWelcome = true
  const failedDelivery = await create(input('failed-welcome@example.invalid'))
  failWelcome = false
  assert.equal(failedDelivery.data.emailDelivery, 'failed')
  await request('login', { body: { email: 'failed-welcome@example.invalid', password } })
  const configuredPassword = process.env.GMAIL_APP_PASSWORD
  delete process.env.GMAIL_APP_PASSWORD
  const beforeMissingConfiguration = welcomeEmails.length
  const missingDelivery = await create(input('no-mail-configuration@example.invalid'))
  process.env.GMAIL_APP_PASSWORD = configuredPassword
  assert.equal(missingDelivery.data.emailDelivery, 'not_configured')
  assert.equal(welcomeEmails.length, beforeMissingConfiguration)

  const catalogsResponse = await fetch(`${origin}/api/management/catalogs`, { headers: { Cookie: owner.cookie } })
  assert.equal(catalogsResponse.status, 200)
  const catalogs = await catalogsResponse.json()
  const [welcomeGroup] = await db.execute("INSERT INTO grupo_comunion(codigo_grupo,nombre) VALUES ('WELCOME','Grupo de bienvenida')")
  const memberInput = { nombres: 'Nuevo administrativo', apellidos: 'Prueba', tipo_identificacion: 'CC', numero_identificacion: 'WELCOME-01', celular: '3000000000', fecha_nacimiento: '1990-01-01', tipo_registro: 'administrativo', id_rol_eclesiastico: catalogs.roles.find(role => role.nivel_jerarquico === 6).id_rol_eclesiastico, id_grupo: welcomeGroup.insertId, responsable_grupo: 1, id_ministerio: catalogs.ministerios[0].id_ministerio, funcion_iglesia: 'Discipulador de prueba', account_email: 'member-welcome@example.invalid', account_password: password, account_confirmation: password }
  const administrative = await fetch(`${origin}/api/management/members`, { method: 'POST', headers: { Origin: origin, Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(memberInput) })
  const administrativeData = await administrative.json()
  assert.equal(administrative.status, 201, JSON.stringify(administrativeData))
  assert.equal(administrativeData.accountCreated, true)
  assert.equal(administrativeData.emailDelivery, 'sent')
  assert.ok(!JSON.stringify(administrativeData).includes(password))
  const administrativeMail = welcomeEmails.at(-1)
  for (const expected of ['member-welcome@example.invalid', 'Discipulador', 'Grupo de bienvenida', 'WELCOME', catalogs.ministerios[0].nombre, password]) assert.ok(administrativeMail.text.includes(expected), 'El correo debe incluir las credenciales y vinculaciones asignadas.')
  assert.ok(administrativeMail.text.includes('solo dentro del alcance de los grupos a tu cargo'))
  const beforeNormalMember = welcomeEmails.length
  const normal = await fetch(`${origin}/api/management/members`, { method: 'POST', headers: { Origin: origin, Cookie: owner.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ nombres: 'Discípulo sin cuenta', tipo_identificacion: 'CC', numero_identificacion: 'WELCOME-02', celular: '3000000000', fecha_nacimiento: '1990-01-01', tipo_registro: 'discipulo' }) })
  assert.equal(normal.status, 201)
  assert.equal((await normal.json()).accountCreated, false)
  assert.equal(welcomeEmails.length, beforeNormalMember, 'Una ficha sin cuenta no debe enviar credenciales.')
  console.log('PASS welcome: both creation flows, roles, scope, linking, inline logos, post-commit sending, missing mail configuration and failure without losing the account')
  console.log('PASS API: public registration closed, atomic bootstrap, authorized roles, validation, credentials, session preservation, member linking and rollback')

  if (process.argv.includes('--ui')) {
    const ui = 'http://127.0.0.1:5194'
    process.env.APP_ORIGINS = `${origin},${ui}`
    preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5194', '--strictPort'], { windowsHide: true, stdio: 'ignore' })
    let ready = false
    for (let index = 0; index < 80; index++) { try { ready = (await fetch(ui)).ok } catch {} if (ready) break; await delay(200) }
    assert.ok(ready, 'No inició la vista previa.')
    const { chromium } = await import('../.secrets/browser-tools/node_modules/playwright-core/index.mjs')
    browser = await chromium.launch({ channel: 'msedge', headless: true })
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
    await context.route('**/api/**', async route => {
      const url = new URL(route.request().url())
      const response = await route.fetch({ url: origin + url.pathname + url.search })
      await route.fulfill({ response })
    })
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${ui}/#registro`, { waitUntil: 'domcontentloaded' })
    await page.waitForURL('**/#login')
    await page.getByRole('heading', { name: 'Qué bueno verte de nuevo.' }).waitFor()
    assert.equal(await page.getByRole('link', { name: 'Crear mi cuenta' }).count(), 0)
    assert.equal(await page.locator('input[name="confirmation"]').count(), 0)
    await page.getByLabel('Correo electrónico', { exact: true }).fill(ownerEmail)
    await page.getByLabel('Contraseña', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await page.locator('#dashboard-title').waitFor()
    await page.goto(`${ui}/#usuarios`)
    await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
    const form = page.locator('.admin-create-account')
    await form.getByLabel('Nombre completo', { exact: true }).fill('Usuario creado por administración')
    await form.getByLabel('Correo de acceso', { exact: true }).fill('browser@example.invalid')
    await form.getByLabel('Contraseña de acceso', { exact: true }).fill(password)
    await form.getByLabel('Confirmar contraseña de acceso', { exact: true }).fill(`${password}-different`)
    await pickOption(form.getByRole('combobox', { name: 'Rol de la cuenta', exact: true }), { label: 'Usuario' })
    await form.getByRole('button', { name: 'Guardar cuenta', exact: true }).click()
    await form.getByRole('alert').filter({ hasText: 'Las contraseñas no coinciden.' }).waitFor()
    await form.getByLabel('Confirmar contraseña de acceso', { exact: true }).fill(password)
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${width}px`)
      await page.screenshot({ path: `checks/account-creation-${width}.png`, fullPage: true })
    }
    await form.getByRole('button', { name: 'Guardar cuenta', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Cuenta creada para browser@example.invalid.' }).waitFor()
    await page.locator('.admin-user-row').filter({ hasText: 'browser@example.invalid' }).waitFor()
    const newSession = await request('login', { body: { email: 'browser@example.invalid', password } })
    assert.equal(newSession.data.user.name, 'Usuario creado por administración')
    assert.equal((await page.evaluate(async () => (await (await fetch('/api/auth/me')).json()).user)).email, ownerEmail)
    await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
    await form.getByLabel('Contraseña de acceso', { exact: true }).fill(password)
    await form.getByRole('button', { name: 'Cancelar', exact: true }).click()
    await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
    assert.equal(await form.getByLabel('Contraseña de acceso', { exact: true }).inputValue(), '')
    assert.deepEqual(errors, [])
    console.log('PASS UI: legacy URL redirects, no public registration, administrative creation, password confirmation, session and responsive layouts at 1440/390/320 px')
  }
} finally {
  if (browser) await browser.close()
  if (preview) { preview.kill(); await once(preview, 'exit') }
  if (server) await new Promise(resolve => server.close(resolve))
  if (pool) await pool.end()
  nodemailer.createTransport = originalTransport
  await db.query(`DROP DATABASE IF EXISTS \`${database}\``)
  await db.end()
}
