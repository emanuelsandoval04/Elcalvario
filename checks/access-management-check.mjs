import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import mysql from 'mysql2/promise'
import { applyMigrations } from '../server/migration-runner.js'
import { pickOption } from './select-helper.mjs'

const database = `calvario_access_test_${randomUUID().replaceAll('-', '')}`
process.env.DB_NAME = database
const { databaseConfig } = await import('../server/config.js')
assert.ok(['localhost', '127.0.0.1', '::1'].includes(databaseConfig.host), 'Use a temporary local database only.')
const { database: ignored, ...configuration } = databaseConfig
const db = await mysql.createConnection(configuration)
let pool, server, browser, preview
try {
  await db.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
  await db.query(`USE \`${database}\``)
  await applyMigrations(db)
  pool = (await import('../server/db.js')).pool
  const { default: app } = await import('../server/app.js')
  const { bootstrapAdmin } = await import('../server/bootstrap-admin.js')
  const { hashPassword } = await import('../server/auth.js')
  const password = `Access-${randomUUID()}`
  await bootstrapAdmin({ name: 'Propietario de prueba', email: 'owner@example.invalid', password })
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  process.env.APP_ORIGINS = origin
  async function request(path, { body, cookie = '', status = 200, method = body === undefined ? 'GET' : 'POST' } = {}) {
    const response = await fetch(`${origin}/api/${path}`, { method, headers: { Cookie: cookie, Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) })
    const data = await response.json()
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`)
    return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie }
  }
  const owner = await request('auth/login', { body: { email: 'owner@example.invalid', password } })
  const hash = await hashPassword(password)
  async function account(email, role, state = 'activo') {
    const [user] = await db.execute('INSERT INTO usuario(correo_login,password_hash,estado_usuario) VALUES (?,?,?)', [email, hash, state])
    if (role) await db.execute('INSERT INTO usuario_rol(id_usuario,id_rol) SELECT ?,id_rol FROM rol_sistema WHERE nombre=?', [user.insertId, role])
    return request('auth/login', { body: { email, password } })
  }
  const media = await account('media@example.invalid', 'Multimedia')
  const target = await account('target@example.invalid', 'Usuario')
  const pastoral = await account('pastoral@example.invalid', 'Asistencia Pastoral')
  const pending = await account('pending@example.invalid', null, 'pendiente')
  const [editorRole] = await db.execute("INSERT INTO rol_sistema(nombre) VALUES ('Editor de perfiles')")
  for (const code of ['gestion.acceder', 'permisos.gestionar']) await db.execute("INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance) VALUES (?,?,'todos')", [editorRole.insertId, code])
  const editor = await account('editor@example.invalid', 'Editor de perfiles')
  const catalog = async () => (await request('management/permissions', { cookie: owner.cookie })).data
  const initial = await catalog()
  const role = name => initial.roles.find(item => item.nombre === name)
  const grants = (data, id) => data.grants.filter(grant => grant.id_rol === id).map(grant => ({ codigo: grant.codigo_permiso, alcance: grant.alcance }))
  const same = values => JSON.stringify(values.map(value => [value.codigo, value.alcance]).sort(([a], [b]) => a.localeCompare(b)))
  const mediaId = role('Multimedia').id_rol, base = grants(initial, mediaId)
  const save = (id, values, expected, status = 200, cookie = owner.cookie) => request(`management/permissions/${id}`, { cookie, method: 'PUT', status, body: { grants: values, ...(expected === undefined ? {} : { expectedGrants: expected }) } })
  assert.equal(role('Administrador').editable, false)
  assert.equal(role('Usuario').editable, false)
  assert.equal(role('Discipulador').groupOnly, true)
  assert.equal(role('Multimedia').editable, true)
  await request('management/permissions', { status: 401 })
  for (const account of [target, media, pending, pastoral]) await request('management/permissions', { cookie: account.cookie, status: 403 })
  await request('management/permissions', { cookie: editor.cookie })
  await request('auth/admin/users', { cookie: editor.cookie, status: 403 })
  await save(role('Administrador').id_rol, [], undefined, 409)
  await save(role('Usuario').id_rol, [], undefined, 409)
  await save(mediaId, [null], base, 400)
  await save(mediaId, [{ codigo: 'missing.permission', alcance: 'todos' }], base, 400)
  await save(mediaId, [base[0], base[0]], base, 400)
  await save(mediaId, [{ codigo: 'eventos.editar', alcance: 'grupo' }], base, 400)
  await save(role('Discipulador').id_rol, [{ codigo: 'miembros.ver', alcance: 'todos' }], undefined, 400)
  await save(mediaId, base, [], 409)
  assert.equal(same(grants(await catalog(), mediaId)), same(base), 'Rejected changes leave the complete profile intact')
  const withBirthday = [...base.filter(grant => grant.codigo !== 'reportes.cumpleanos'), { codigo: 'reportes.cumpleanos', alcance: 'todos' }]
  await save(mediaId, withBirthday, base)
  assert.equal((await request('auth/me', { cookie: media.cookie })).data.user.permissions['reportes.cumpleanos'], 'todos', 'Open sessions immediately receive role changes')
  await save(mediaId, base, withBirthday)
  const alternative = base.filter(grant => grant.codigo !== base[0].codigo)
  const concurrent = await Promise.all([fetch(`${origin}/api/management/permissions/${mediaId}`, { method: 'PUT', headers: { Cookie: owner.cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ grants: withBirthday, expectedGrants: base }) }), fetch(`${origin}/api/management/permissions/${mediaId}`, { method: 'PUT', headers: { Cookie: owner.cookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ grants: alternative, expectedGrants: base }) })])
  assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409])
  await save(mediaId, base, grants(await catalog(), mediaId))
  console.log('PASS API: existing authority boundaries, protected profiles, group scope, validation, atomic changes, open sessions and concurrent edit rejection.')

  if (process.argv.includes('--ui')) {
    const ui = 'http://127.0.0.1:5198'
    process.env.APP_ORIGINS = `${origin},${ui}`
    preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5198', '--strictPort'], { windowsHide: true, stdio: 'ignore' })
    let ready = false
    for (let index = 0; index < 80; index++) { try { ready = (await fetch(ui)).ok } catch {} if (ready) break; await delay(150) }
    assert.ok(ready)
    const { chromium } = await import('../.secrets/browser-tools/node_modules/playwright-core/index.mjs')
    browser = await chromium.launch({ channel: 'msedge', headless: true })
    const errors = []
    async function open(email) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' })
      const calls = []
      await context.route('**/api/**', async route => {
        const url = new URL(route.request().url()); calls.push(url.pathname)
        await route.fulfill({ response: await route.fetch({ url: origin + url.pathname + url.search }) })
      })
      const page = await context.newPage()
      page.setDefaultTimeout(12000)
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(`${ui}/#login`)
      await page.getByLabel('Correo electrónico', { exact: true }).fill(email)
      await page.getByLabel('Contraseña', { exact: true }).fill(password)
      await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
      await page.waitForURL(`${ui}/#gestion`)
      await page.goto(`${ui}/#usuarios`)
      return { context, page, calls }
    }
    const admin = await open('owner@example.invalid'), page = admin.page
    const mediaRow = page.locator('.admin-user-row').filter({ hasText: 'media@example.invalid' })
    await mediaRow.waitFor()
    assert.equal(await page.locator('.panel-nav').getByRole('link', { name: 'Usuarios, roles y permisos', exact: true }).count(), 1)
    assert.equal(await page.locator('.panel-nav').getByText('Permisos', { exact: true }).count(), 0)
    await page.locator('.profile-picker').waitFor()
    const usersBox = await page.locator('.access-users').boundingBox(), profilesBox = await page.locator('.role-permissions').boundingBox()
    assert.ok(profilesBox.x >= usersBox.x + usersBox.width, 'Profile editor is beside users on desktop')
    await mediaRow.getByRole('button', { name: 'Permisos del perfil de media@example.invalid', exact: true }).click()
    await page.waitForURL(`${ui}/#usuarios/perfiles/${mediaId}`)
    let form = page.getByRole('form', { name: 'Permisos del perfil Multimedia', exact: true })
    const birthdayDescription = initial.permissions.find(permission => permission.codigo === 'reportes.cumpleanos').descripcion
    await pickOption(form.getByRole('combobox', { name: birthdayDescription, exact: true }), 'todos')
    await form.getByRole('button', { name: 'Guardar permisos', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Permisos de Multimedia guardados.' }).waitFor()
    assert.equal((await request('auth/me', { cookie: media.cookie })).data.user.permissions['reportes.cumpleanos'], 'todos')
    const targetRow = page.locator('.admin-user-row').filter({ hasText: 'target@example.invalid' })
    await pickOption(targetRow.getByRole('combobox', { name: 'Rol de target@example.invalid', exact: true }), String(mediaId))
    await targetRow.getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Rol actualizado para target@example.invalid.' }).waitFor()
    assert.equal((await request('auth/me', { cookie: target.cookie })).data.user.permissions['reportes.cumpleanos'], 'todos')
    await page.reload()
    form = page.getByRole('form', { name: 'Permisos del perfil Multimedia', exact: true })
    await form.waitFor()
    await form.getByRole('searchbox', { name: 'Buscar permiso', exact: true }).fill('cumpleanos')
    assert.equal(await form.getByRole('combobox').count(), 1)
    await form.getByRole('searchbox', { name: 'Buscar permiso', exact: true }).fill('')
    await page.route(`**/api/management/permissions/${mediaId}`, route => route.fulfill({ status: 503, json: { error: 'No pudimos guardar el perfil. Inténtalo nuevamente.' } }))
    await pickOption(form.getByRole('combobox', { name: birthdayDescription, exact: true }), { label: 'Sin permiso' })
    await form.getByRole('button', { name: 'Guardar permisos', exact: true }).click()
    await form.getByRole('alert').filter({ hasText: 'No pudimos guardar el perfil.' }).waitFor()
    assert.equal((await request('auth/me', { cookie: media.cookie })).data.user.permissions['reportes.cumpleanos'], 'todos')
    await page.unroute(`**/api/management/permissions/${mediaId}`)
    page.once('dialog', dialog => dialog.accept())
    await form.getByRole('button', { name: 'Recargar permisos', exact: true }).click()
    await form.waitFor()
    const updated = grants(await catalog(), mediaId)
    await save(mediaId, updated.filter(grant => grant.codigo !== 'reportes.cumpleanos'), updated)
    await pickOption(form.getByRole('combobox', { name: birthdayDescription, exact: true }), { label: 'Sin permiso' })
    await form.getByRole('button', { name: 'Guardar permisos', exact: true }).click()
    await form.getByRole('alert').filter({ hasText: 'Otro administrador actualizó este perfil.' }).waitFor()
    page.once('dialog', dialog => dialog.accept())
    await form.getByRole('button', { name: 'Recargar permisos', exact: true }).click()
    await form.waitFor()
    await pickOption(form.getByRole('combobox', { name: birthdayDescription, exact: true }), 'todos')
    await form.getByRole('button', { name: 'Guardar permisos', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Permisos de Multimedia guardados.' }).waitFor()
    console.log('PASS UI save failure and concurrent edit recovery without overwriting permissions.')
    for (const width of [1440, 1024, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate(() => new Promise(resolve => { window.scrollTo({ top: 0, behavior: 'instant' }); requestAnimationFrame(() => requestAnimationFrame(resolve)) }))
      await page.locator('#role-permissions-title').waitFor()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Profiles overflow at ${width}px`)
      await page.screenshot({ path: `checks/access-profiles-${width}.png`, fullPage: false })
      if (width < 1240) {
        await page.getByRole('navigation', { name: 'Administración de accesos', exact: true }).getByRole('link', { name: 'Usuarios y asignación de roles', exact: true }).click()
        await targetRow.waitFor()
        await targetRow.getByRole('button', { name: 'Permisos del perfil de target@example.invalid', exact: true }).click()
        await form.waitFor()
      }
    }
    await page.goto(`${ui}/#usuarios/perfiles/${role('Administrador').id_rol}`)
    const protectedForm = page.getByRole('form', { name: 'Permisos del perfil Administrador', exact: true })
    await protectedForm.waitFor()
    assert.equal(await protectedForm.getByRole('button', { name: 'Guardar permisos', exact: true }).count(), 0)
    assert.equal(await protectedForm.getByRole('combobox').evaluateAll(elements => elements.every(element => element.disabled)), true)
    await page.goto(`${ui}/#gestion/permissions`)
    await page.waitForURL(`${ui}/#usuarios/perfiles`)
    await page.goto(`${ui}/#gestion/users`)
    await page.waitForURL(`${ui}/#usuarios`)
    console.log('PASS UI: one navigation entry, adjacent editor, contextual role selection, editing/persistence, role assignment, protected profiles, legacy URLs and 320–1440px layouts.')

    const roleOnly = await open('editor@example.invalid')
    await roleOnly.page.locator('.profile-picker').waitFor()
    assert.equal(await roleOnly.page.locator('.admin-user-row').count(), 0)
    assert.equal(roleOnly.calls.includes('/api/auth/admin/users'), false)
    assert.equal(await roleOnly.page.getByRole('button', { name: 'Crear cuenta', exact: true }).count(), 0)
    const accountsOnly = await open('pastoral@example.invalid')
    await accountsOnly.page.getByRole('button', { name: 'Crear cuenta', exact: true }).waitFor()
    assert.equal(await accountsOnly.page.locator('.role-permissions').count(), 0)
    assert.deepEqual(errors, [])
    await admin.context.close(); await roleOnly.context.close(); await accountsOnly.context.close()
    console.log('PASS separated authority within the unified page: profile editors cannot read users; account managers without permission editing cannot change profiles.')
  }
} finally {
  await browser?.close()
  if (preview) { preview.kill(); await once(preview, 'exit') }
  if (server) await new Promise(resolve => server.close(resolve))
  if (pool) await pool.end()
  await db.query(`DROP DATABASE IF EXISTS \`${database}\``)
  await db.end()
  console.log('Temporary access database removed; no production accounts changed.')
}
