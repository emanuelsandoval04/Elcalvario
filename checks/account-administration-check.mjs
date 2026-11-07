import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import mysql from 'mysql2/promise'
import { applyMigrations, migrationFiles } from '../server/migration-runner.js'
import { readFile } from 'node:fs/promises'

const database = `calvario_accounts_test_${randomUUID().replaceAll('-', '')}`
process.env.DB_NAME = database
const { databaseConfig } = await import('../server/config.js')
assert.ok(['localhost', '127.0.0.1', '::1'].includes(databaseConfig.host), 'La prueba requiere MySQL local y crea una base temporal.')
const { database: ignored, ...configuration } = databaseConfig
const db = await mysql.createConnection(configuration)
let pool, server, browser, preview
try {
  await db.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
  await db.query(`USE \`${database}\``)
  // Start on the previous schema, with real references, to verify the upgrade.
  for (const file of migrationFiles.filter(file => file !== '016-account-deletion.sql')) {
    const sql = await readFile(new URL(`../server/migrations/${file}`, import.meta.url), 'utf8')
    for (const statement of sql.split(';').map(item => item.trim()).filter(Boolean)) await db.query(statement)
  }
  pool = (await import('../server/db.js')).pool
  const { default: app } = await import('../server/app.js')
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  process.env.APP_ORIGINS = origin
  const password = `Check-${randomUUID()}`
  async function request(path, { body, cookie = '', method = body ? 'POST' : 'GET', status = 200, origin: requestOrigin = origin } = {}) {
    const response = await fetch(`${origin}/api/auth/${path}`, {
      method, headers: { Origin: requestOrigin, Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await response.json()
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`)
    return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie }
  }
  const {bootstrapAdmin}=await import('../server/bootstrap-admin.js')
  const {hashPassword}=await import('../server/auth.js')
  const passwordHash=await hashPassword(password)
  let initialized=false
  // Pending accounts are legacy fixtures; public self-registration is closed.
  const register = async email => {
    if(!initialized) { await bootstrapAdmin({name:'Propietario',email,password}); initialized=true }
    else await db.execute("INSERT INTO usuario(correo_login,password_hash,estado_usuario) VALUES (?,?,'pendiente')",[email,passwordHash])
    return request('login',{body:{email,password}})
  }
  const owner = await register('owner@example.invalid')
  const pending = await register('pending@example.invalid')
  const old = await register('old@example.invalid')
  const pastor = await register('pastor@example.invalid')
  const roles = (await request('admin/users', { cookie: owner.cookie })).data.roles
  const role = name => roles.find(item => item.name === name).id
  const activate = (account, name) => request(`admin/users/${account.data.user.id}/role`, { cookie: owner.cookie, body: { roleId: role(name) } })
  await activate(old, 'Usuario'); await activate(pastor, 'Asistencia Pastoral')
  const oldId = old.data.user.id
  await request('account/profile', { cookie: old.cookie, body: { name: 'Cuenta antigua', email: old.data.user.email } })
  await request('account/preferences', { cookie: old.cookie, body: { displaySize: 'large' } })
  const [book] = await db.execute("INSERT INTO libro_adiestramiento(nombre,id_usuario_creacion) VALUES ('Libro existente',?)", [oldId])
  const [member] = await db.execute("INSERT INTO miembro(nombres,tipo_identificacion,numero_identificacion,celular,fecha_nacimiento,codigo_qr,id_usuario_creacion,id_usuario_actualizacion,id_libro) VALUES ('Ficha existente','CC','10001','3000000000','1990-01-01',?,?,?,?)", [randomUUID(), oldId, oldId, book.insertId])
  await db.execute('UPDATE usuario SET id_miembro=? WHERE id_usuario=?', [member.insertId, oldId])
  await db.execute("INSERT INTO historial_miembro(id_miembro,concepto,id_usuario) VALUES (?,'grupo',?)", [member.insertId, oldId])
  const [activity] = await db.execute("INSERT INTO actividad(tipo_actividad,titulo,fecha,hora,lugar,id_usuario_creacion) VALUES ('culto','Culto existente','2026-10-01','10:00','Iglesia',?)", [oldId])
  await db.execute("INSERT INTO asistencia(id_actividad,id_miembro,id_usuario_registro,id_usuario_modificacion,estado_asistencia) VALUES (?,?,?,?,'presente')", [activity.insertId, member.insertId, oldId, oldId])
  const [group] = await db.execute("INSERT INTO grupo_comunion(codigo_grupo,nombre) VALUES ('TEST','Grupo existente')")
  const [neighborhood] = await db.execute("INSERT INTO barrio(nombre,codigo) VALUES ('Barrio de prueba','TEST')")
  const neighborhoodId = neighborhood.insertId
  await db.execute('INSERT INTO discipulador_barrio(id_discipulador,id_barrio,id_usuario_asigna,id_usuario_finaliza) VALUES (?,?,?,?)', [member.insertId, neighborhoodId, oldId, oldId])
  for (const table of ['grupo_barrio', 'grupo_barrio_cobertura']) await db.execute(`INSERT INTO ${table}(id_grupo,id_barrio,id_usuario_actualizacion) VALUES (?,?,?)`, [group.insertId, neighborhoodId, oldId])
  await db.execute('INSERT INTO seguridad_mfa(id_usuario,secreto_cifrado) VALUES (?,?)', [oldId, 'retired-test-secret'])
  await db.execute('INSERT INTO mfa_recuperacion(id_usuario,codigo_hash) VALUES (?,?)', [oldId, 'a'.repeat(64)])
  await db.execute('INSERT INTO reto_mfa(token_hash,id_usuario,vence_en) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR))', ['b'.repeat(64), oldId])
  await applyMigrations(db); await applyMigrations(db)
  console.log('PASS migration upgrades populated foreign keys and can run twice')

  const removal = (account, state, action = state === 'pendiente' ? 'reject' : 'delete') => ({ action, expectedEmail: account.data.user.email, expectedState: state })
  const remove = (account, body, cookie = owner.cookie, status = 200, extra = {}) => request(`admin/users/${account.data.user.id}`, { body, cookie, method: 'DELETE', status, ...extra })
  await request('admin/notifications', { status: 401 })
  await request('admin/notifications', { cookie: pending.cookie, status: 403 })
  await request('admin/notifications', { cookie: old.cookie, status: 403 })
  let notifications = (await request('admin/notifications', { cookie: pastor.cookie })).data
  assert.equal(notifications.total, 1); assert.equal(notifications.items[0].email, pending.data.user.email)
  assert.ok(!JSON.stringify(notifications).includes('password'))
  await remove(pending, removal(pending, 'pendiente'), '', 401)
  await remove(pending, removal(pending, 'pendiente'), pending.cookie, 403)
  await remove(pending, removal(pending, 'pendiente'), old.cookie, 403)
  await remove(owner, removal(owner, 'activo'), owner.cookie, 409)
  await remove(owner, removal(owner, 'activo'), pastor.cookie, 403)
  await remove(pastor, removal(pastor, 'activo'), pastor.cookie, 409)
  await remove(pending, removal(pending, 'pendiente'), owner.cookie, 403, { origin: 'https://untrusted.invalid' })
  await remove(pending, { ...removal(pending, 'pendiente'), expectedEmail: 'changed@example.invalid' }, owner.cookie, 409)
  await remove(old, removal(old, 'pendiente'), owner.cookie, 409)
  await request('admin/users/invalid', { body: removal(pending, 'pendiente'), cookie: owner.cookie, method: 'DELETE', status: 400 })
  await remove(pending, removal(pending, 'pendiente'), pastor.cookie)
  assert.equal((await request('admin/notifications', { cookie: owner.cookie })).data.total, 0)
  await request('me', { cookie: pending.cookie, status: 401 })
  await request('login', { body: { email: pending.data.user.email, password }, status: 401 })
  await remove(pending, removal(pending, 'pendiente'), owner.cookie, 404)
  // A stale rejection must not remove an account another administrator enabled.
  const stale = await register('stale@example.invalid')
  await activate(stale, 'Usuario')
  await remove(stale, removal(stale, 'pendiente'), owner.cookie, 409)
  // A failed audit must roll back both the account and its cascaded session deletion.
  await db.query("CREATE TRIGGER fail_account_delete_audit BEFORE INSERT ON auditoria_seguridad FOR EACH ROW SET NEW.accion=IF(NEW.accion='account.deleted',NULL,NEW.accion)")
  await remove(old, removal(old, 'activo'), owner.cookie, 503)
  await request('me', { cookie: old.cookie })
  await db.query('DROP TRIGGER fail_account_delete_audit')
  await remove(old, removal(old, 'activo'), pastor.cookie)
  await request('me', { cookie: old.cookie, status: 401 })
  for (const table of ['usuario', 'usuario_rol', 'sesion_usuario', 'perfil_usuario', 'preferencia_usuario', 'seguridad_mfa', 'mfa_recuperacion', 'reto_mfa']) {
    const [rows] = await db.execute(`SELECT COUNT(*) AS total FROM ${table} WHERE id_usuario=?`, [oldId])
    assert.equal(rows[0].total, 0, table)
  }
  const [details] = await db.query('SELECT COUNT(*) AS total FROM sesion_detalle d LEFT JOIN sesion_usuario s ON s.token_hash=d.token_hash WHERE s.token_hash IS NULL')
  assert.equal(details[0].total, 0)
  for (const [table, columns] of Object.entries({ miembro: ['id_usuario_creacion', 'id_usuario_actualizacion'], historial_miembro: ['id_usuario'], actividad: ['id_usuario_creacion'], asistencia: ['id_usuario_registro', 'id_usuario_modificacion'], discipulador_barrio: ['id_usuario_asigna', 'id_usuario_finaliza'], grupo_barrio: ['id_usuario_actualizacion'], grupo_barrio_cobertura: ['id_usuario_actualizacion'], libro_adiestramiento: ['id_usuario_creacion'] })) {
    const [rows] = await db.query(`SELECT ${columns.join(',')} FROM ${table}`)
    assert.equal(rows.length, 1, `Preserved ${table}`)
    for (const column of columns) assert.equal(rows[0][column], null, `${table}.${column}`)
  }
  const [audit] = await db.query("SELECT accion FROM auditoria_seguridad WHERE accion IN ('account.rejected','account.deleted')")
  assert.equal(audit.length, 2)
  assert.equal((await request('me', { cookie: owner.cookie })).data.user.state, 'activo')
  // Search and pagination can find accounts beyond the former 200-user cap.
  const values = Array.from({ length: 205 }, (_, index) => [`archive-${index}@example.invalid`, 'unusable-test-hash', 'inactivo'])
  await db.query('INSERT INTO usuario(correo_login,password_hash,estado_usuario) VALUES ?', [values])
  assert.equal((await request('admin/users?state=inactivo&page=5', { cookie: owner.cookie })).data.users.length, 5)
  const found = (await request('admin/users?q=archive-0%40example.invalid', { cookie: owner.cookie })).data
  assert.equal(found.total, 1); assert.equal(found.users[0].email, values[0][0])
  assert.ok(found.users[0].createdAt); assert.equal(found.users[0].lastAccess, null)
  await request('admin/users?page=0', { cookie: owner.cookie, status: 400 })
  await request('admin/users?state=invalid', { cookie: owner.cookie, status: 400 })
  console.log('PASS API: pending notifications, role permissions, self/owner protection, origin checks, stale rejection, transactional rollback, permanent deletion, session revocation, preserved history and old-account search')

  if (process.argv.includes('--ui')) {
    const ui = 'http://127.0.0.1:5192'
    process.env.APP_ORIGINS = `${origin},${ui}`
    preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5192', '--strictPort'], { windowsHide: true, stdio: 'ignore' })
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
    await page.goto(`${ui}/#login`, { waitUntil: 'domcontentloaded' })
    await page.getByLabel('Correo electrónico', { exact: true }).fill(owner.data.user.email)
    await page.getByLabel('Contraseña', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await page.locator('#dashboard-title').waitFor()
    await page.getByRole('button', { name: 'Notificaciones: 0', exact: true }).click()
    await page.getByText('No tienes notificaciones nuevas.', { exact: true }).waitFor()
    await page.keyboard.press('Escape')
    const candidate = await register('ui-pending@example.invalid')
    await page.getByRole('button', { name: /Notificaciones/ }).click()
    await page.getByText('1 notificación nueva.', { exact: true }).waitFor()
    await page.getByRole('link', { name: 'Revisar usuarios y solicitudes' }).click()
    const row = page.locator('.admin-user-row').filter({ hasText: candidate.data.user.email })
    await row.getByRole('button', { name: 'Rechazar solicitud', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Rechazar solicitud de cuenta', exact: true })
    await dialog.waitFor()
    assert.equal(await dialog.getByRole('button', { name: 'Cancelar', exact: true }).evaluate(node => node === document.activeElement), true)
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    assert.equal((await request('me', { cookie: candidate.cookie })).data.user.state, 'pendiente')
    await row.getByRole('button', { name: 'Rechazar solicitud', exact: true }).click()
    await dialog.getByRole('button', { name: 'Confirmar rechazo', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Solicitud rechazada.' }).waitFor()
    await row.waitFor({ state: 'detached' })
    await page.getByRole('button', { name: 'Notificaciones: 0', exact: true }).waitFor()
    await request('me', { cookie: candidate.cookie, status: 401 })
    const ownRow = page.locator('.admin-user-row').filter({ hasText: owner.data.user.email })
    // Pending-first sorting means the owner can be on a later page after fixtures.
    await page.getByRole('searchbox', { name: 'Buscar por correo' }).fill(owner.data.user.email)
    await page.getByRole('button', { name: 'Buscar', exact: true }).click()
    await ownRow.waitFor()
    assert.equal(await ownRow.getByRole('button', { name: 'Eliminar cuenta', exact: true }).isDisabled(), true)
    await page.getByRole('searchbox', { name: 'Buscar por correo' }).fill('archive-0@example.invalid')
    await page.getByRole('button', { name: 'Buscar', exact: true }).click()
    const oldRow = page.locator('.admin-user-row').filter({ hasText: 'archive-0@example.invalid' })
    await oldRow.waitFor()
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await oldRow.getByRole('button', { name: 'Eliminar cuenta', exact: true }).click()
      await page.getByRole('dialog', { name: 'Eliminar cuenta definitivamente', exact: true }).waitFor()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await page.screenshot({ path: `checks/account-administration-${width}.png`, fullPage: true })
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
      await page.getByRole('button', { name: /Notificaciones/ }).click()
      const box = await page.locator('#account-notifications-panel').boundingBox()
      assert.ok(box.x >= 0 && box.x + box.width <= width)
      await page.keyboard.press('Escape')
    }
    await oldRow.getByRole('button', { name: 'Eliminar cuenta', exact: true }).click()
    await page.getByRole('button', { name: 'Eliminar definitivamente', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'fue eliminada de la base de datos.' }).waitFor()
    await oldRow.waitFor({ state: 'detached' })
    assert.deepEqual(errors, [])
    console.log('PASS UI: bell count, review, cancel/Escape, rejection, permanent deletion, protected owner, filters and responsive layouts at 1440/390/320 px')
  }
} finally {
  if (browser) await browser.close()
  if (preview) { preview.kill(); await once(preview, 'exit') }
  if (server) await new Promise(resolve => server.close(resolve))
  if (pool) await pool.end()
  await db.query(`DROP DATABASE IF EXISTS \`${database}\``)
  await db.end()
  console.log('Base temporal eliminada. Las cuentas existentes se conservaron.')
}
