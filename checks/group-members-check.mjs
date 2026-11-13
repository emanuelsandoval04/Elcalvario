import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import mysql from 'mysql2/promise'
import { applyMigrations } from '../server/migration-runner.js'

const database = `calvario_group_members_test_${randomUUID().replaceAll('-', '')}`
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
  pool = (await import('../server/db.js')).pool
  const { default: app } = await import('../server/app.js')
  const { bootstrapAdmin } = await import('../server/bootstrap-admin.js')
  const { hashPassword } = await import('../server/auth.js')
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  process.env.APP_ORIGINS = origin
  const password = `Members-${randomUUID()}`
  async function request(path, { body, cookie = '', method = body === undefined ? 'GET' : 'POST', status = 200 } = {}) {
    const response = await fetch(`${origin}/api/${path}`, { method, headers: { Origin: origin, Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) })
    const data = await response.json()
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`)
    return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie }
  }
  await bootstrapAdmin({ name: 'Propietario', email: 'owner@example.invalid', password })
  const owner = await request('auth/login', { body: { email: 'owner@example.invalid', password } })
  const ownerId = owner.data.user.id, hash = await hashPassword(password)
  const member = async (nombres, group = null, number = randomUUID().slice(0, 10)) => (await db.execute("INSERT INTO miembro(nombres,apellidos,tipo_identificacion,numero_identificacion,celular,fecha_nacimiento,codigo_qr,codigo_miembro,id_grupo,estado_miembro,id_usuario_creacion,id_usuario_actualizacion) VALUES (?,'Prueba','CC',?,'3001234567','1990-01-01',?,?,?,'activo',?,?)", [nombres, number, randomUUID(), Math.floor(Math.random() * 1e6) + 1000, group, ownerId, ownerId]))[0].insertId
  const account = async (email, role, memberId) => {
    const [user] = await db.execute("INSERT INTO usuario(correo_login,password_hash,estado_usuario,id_miembro) VALUES (?,?,'activo',?)", [email, hash, memberId])
    await db.execute('INSERT INTO usuario_rol(id_usuario,id_rol) SELECT ?,id_rol FROM rol_sistema WHERE nombre=?', [user.insertId, role])
    return request('auth/login', { body: { email, password } })
  }
  const leaderA = await member('Líder A'), leaderB = await member('Líder B')
  const groupA = (await request('management/groups', { cookie: owner.cookie, status: 201, body: { nombre: 'Familia Esperanza', latitud: 4.1415, longitud: -73.6302, id_discipulador: leaderA, estado_grupo: 'activo' } })).data
  const groupB = (await request('management/groups', { cookie: owner.cookie, status: 201, body: { nombre: 'Familia Fe', latitud: 4.1502, longitud: -73.6201, id_discipulador: leaderB, estado_grupo: 'activo' } })).data
  const empty = (await request('management/groups', { cookie: owner.cookie, status: 201, body: { nombre: 'Grupo sin discípulos', direccion: 'Carrera 30 # 15-20', estado_grupo: 'activo' } })).data
  const ana = await member('Ana'), luis = await member('Luis'), marta = await member('Marta', groupB.id), outside = await member('Fuera', groupB.id)
  const leader = await account('leader@example.invalid', 'Discipulador', leaderA)
  const [[basicRole]] = await db.query("SELECT id_rol FROM rol_sistema WHERE nombre='Usuario'")
  const [basicUser] = await db.execute("INSERT INTO usuario(correo_login,password_hash,estado_usuario) VALUES ('basic@example.invalid',?,'activo')", [hash])
  await db.execute('INSERT INTO usuario_rol(id_usuario,id_rol) VALUES (?,?)', [basicUser.insertId, basicRole.id_rol])
  const basic = await request('auth/login', { body: { email: 'basic@example.invalid', password } })

  // API: add (and move) disciples with history; scope and permissions apply.
  const add = (groupId, ids, cookie = owner.cookie, status = 200) => request(`management/groups/${groupId}/members`, { cookie, status, body: { ids } })
  assert.deepEqual((await add(groupA.id, [ana, marta, ana])).data, { added: 2, moved: 1 })
  assert.deepEqual((await add(groupA.id, [ana])).data, { added: 0, moved: 0 }, 'Repetir no cambia nada.')
  const [rows] = await db.query('SELECT id_miembro,id_grupo FROM miembro WHERE id_miembro IN (?,?) ORDER BY id_miembro', [ana, marta])
  assert.ok(rows.every(row => row.id_grupo === groupA.id))
  const [history] = await db.query("SELECT id_anterior,id_nuevo FROM historial_miembro WHERE id_miembro=? AND concepto='grupo'", [marta])
  assert.deepEqual(history.map(row => [row.id_anterior, row.id_nuevo]), [[groupB.id, groupA.id]])
  await add(groupA.id, [], owner.cookie, 400)
  await add(groupA.id, ['x'], owner.cookie, 400)
  await add(groupA.id, [999999], owner.cookie, 404)
  await add(groupA.id, [luis], basic.cookie, 403)
  // A disciple leader has no "edit disciples" permission: the button is hidden and the API refuses.
  await add(groupA.id, [outside], leader.cookie, 403)
  // A role with both permissions limited to its groups cannot take disciples from another group.
  const [scopedRole] = await db.execute("INSERT INTO rol_sistema(nombre) VALUES ('Líder con edición')")
  for (const code of ['gestion.acceder', 'grupos.ver', 'grupos.editar', 'miembros.ver', 'miembros.editar']) await db.execute("INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance) VALUES (?,?,'grupo')", [scopedRole.insertId, code])
  const scopedLeader = await account('scoped@example.invalid', 'Líder con edición', leaderA)
  await add(groupA.id, [outside], scopedLeader.cookie, 404)
  await add(groupB.id, [ana], scopedLeader.cookie, 404)
  assert.equal((await db.query('SELECT id_grupo FROM miembro WHERE id_miembro=?', [outside]))[0][0].id_grupo, groupB.id, 'Un error no deja cambios a medias.')
  const groups = (await request('management/groups', { cookie: owner.cookie })).data.items
  assert.equal(groups.find(group => group.id_grupo === groupA.id).miembros, 2)
  // Removing a disciple leaves them without group and records it; limited roles cannot do it.
  const removeMember = (groupId, memberId, cookie = owner.cookie, status = 200) => request(`management/groups/${groupId}/members/${memberId}`, { cookie, status, method: 'DELETE', body: {} })
  await add(groupA.id, [luis])
  await removeMember(groupA.id, luis, scopedLeader.cookie, 403)
  await removeMember(groupB.id, luis, owner.cookie, 409)
  await removeMember(groupA.id, luis)
  assert.equal((await db.query('SELECT id_grupo FROM miembro WHERE id_miembro=?', [luis]))[0][0].id_grupo, null)
  assert.deepEqual((await db.query("SELECT id_anterior,id_nuevo FROM historial_miembro WHERE id_miembro=? AND concepto='grupo' ORDER BY id_historial", [luis]))[0].map(row => [row.id_anterior, row.id_nuevo]), [[null, groupA.id], [groupA.id, null]])
  for (const [name, code] of [['Barrio Norte', 'BN'], ['Barrio Sur', 'BS']]) await db.execute('INSERT INTO barrio(nombre,comuna,codigo) VALUES (?,?,?)', [name, 'Comuna 1', code])
  // Disciple leaders: leading a group or holding the "Discipuladores" pastoral role (level 6).
  const pastor = await member('Pastora')
  await db.execute("UPDATE miembro SET id_rol_eclesiastico=(SELECT id_rol_eclesiastico FROM rol_eclesiastico WHERE nivel_jerarquico=6 LIMIT 1) WHERE id_miembro=?", [pastor])
  const people = (await request('management/members', { cookie: owner.cookie })).data.items
  const leaderFlags = Object.fromEntries(people.map(row => [row.nombres, [Number(row.es_discipulador), row.grupos_a_cargo]]))
  assert.deepEqual(leaderFlags['Líder A'], [1, 'Familia Esperanza'])
  assert.deepEqual(leaderFlags.Pastora, [1, null])
  assert.deepEqual(leaderFlags.Ana, [0, null])
  // Group history: group names and who assigned them; a group chosen at registration is recorded too.
  const luisHistory = (await request(`management/members/${luis}/history`, { cookie: owner.cookie })).data.items
  assert.deepEqual(luisHistory.map(item => [item.grupo_anterior, item.grupo_nuevo, item.asignado_por]), [['Familia Esperanza', null, 'Propietario'], [null, 'Familia Esperanza', 'Propietario']])
  const registered = (await request('management/members', { cookie: owner.cookie, status: 201, body: { nombres: 'Registrada', apellidos: 'Con grupo', tipo_identificacion: 'CC', numero_identificacion: 'REG-GROUP', celular: '3001112233', fecha_nacimiento: '1995-04-02', id_grupo: groupB.id } })).data.id
  assert.deepEqual((await request(`management/members/${registered}/history`, { cookie: owner.cookie })).data.items.map(item => [item.id_anterior, item.grupo_nuevo, item.asignado_por]), [[null, 'Familia Fe', 'Propietario']])
  const unassigned = (await request('management/members', { cookie: owner.cookie, status: 201, body: { nombres: 'Registrada', apellidos: 'Sin grupo', tipo_identificacion: 'CC', numero_identificacion: 'REG-NONE', celular: '3001112234', fecha_nacimiento: '1995-04-02' } })).data.id
  assert.deepEqual((await request(`management/members/${unassigned}/history`, { cookie: owner.cookie })).data.items, [])
  await db.execute('UPDATE miembro SET archivado=1 WHERE id_miembro IN (?,?)', [registered, unassigned])
  // Data consistency: archiving a group releases its disciples (with history); a record with an
  // account or leading a group cannot be archived; an old email is kept when editing other data.
  const closing = (await request('management/groups', { cookie: owner.cookie, status: 201, body: { nombre: 'Grupo por cerrar', direccion: 'Calle 1 # 2-3', estado_grupo: 'activo' } })).data
  const pedro = await member('Pedro'), sara = await member('Sara')
  await add(closing.id, [pedro, sara])
  const archiveGroup = await request(`management/groups/${closing.id}`, { cookie: owner.cookie, method: 'DELETE', body: {} })
  assert.equal(archiveGroup.data.released, 2)
  assert.deepEqual((await db.query('SELECT id_grupo FROM miembro WHERE id_miembro IN (?,?)', [pedro, sara]))[0].map(row => row.id_grupo), [null, null], 'Archivar un grupo deja a sus discípulos sin grupo')
  assert.deepEqual((await request(`management/members/${pedro}/history`, { cookie: owner.cookie })).data.items.map(item => [item.grupo_anterior, item.grupo_nuevo]).slice(0, 1), [['Grupo por cerrar', null]])
  const kept = (await request(`management/members/${pedro}/history`, { cookie: owner.cookie })).data.items.find(item => item.id_nuevo === closing.id)
  assert.deepEqual([kept.grupo_nuevo, Number(kept.grupo_nuevo_eliminado)], ['Grupo por cerrar', 1], 'El historial conserva el grupo eliminado y lo marca')
  const archiveMember = (id, status) => request(`management/members/${id}`, { cookie: owner.cookie, method: 'DELETE', body: {}, status })
  assert.match((await archiveMember(leaderA, 409)).data.error, /cuenta de acceso/)
  assert.match((await archiveMember(leaderB, 409)).data.error, /Familia Fe/)
  await db.execute("UPDATE miembro SET correo='antiguo@example.com' WHERE id_miembro=?", [sara])
  await request(`management/members/${sara}`, { cookie: owner.cookie, method: 'PATCH', body: { correo: 'antiguo@example.com', celular: '3009998877' } })
  await request(`management/members/${sara}`, { cookie: owner.cookie, method: 'PATCH', body: { correo: 'otro@example.com' }, status: 400 })
  await request(`management/members/${sara}`, { cookie: owner.cookie, method: 'PATCH', body: { correo: 'sara@gmail.com' } })
  assert.equal((await db.query('SELECT correo FROM miembro WHERE id_miembro=?', [sara]))[0][0].correo, 'sara@gmail.com')
  assert.equal((await request('management/members', { cookie: owner.cookie })).data.truncated, false)
  // Migration 031 repairs older data the same way.
  await db.execute('UPDATE miembro SET id_grupo=? WHERE id_miembro=?', [closing.id, pedro])
  await db.execute('UPDATE miembro SET archivado=1 WHERE id_miembro=?', [leaderA])
  await (await import('../server/migration-runner.js')).applyMigrations(db)
  assert.equal((await db.query('SELECT id_grupo FROM miembro WHERE id_miembro=?', [pedro]))[0][0].id_grupo, null)
  assert.equal((await db.query('SELECT archivado FROM miembro WHERE id_miembro=?', [leaderA]))[0][0].archivado, 0)
  await archiveMember(sara, 200); await archiveMember(pedro, 200)
  console.log('PASS consistencia: archivar grupo libera a sus discípulos con historial, no se archiva una ficha con cuenta o grupo a cargo, correo antiguo conservado y migración 031')
  console.log('PASS API: add/move disciples to a group with history, idempotency, validation, permissions, group scope and atomicity, group history with names and who assigned')

  if (process.argv.includes('--ui')) {
    const shots = process.env.GROUP_SHOTS || 'checks'
    const ui = 'http://127.0.0.1:5199'; process.env.APP_ORIGINS = `${origin},${ui}`
    preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5199', '--strictPort'], { windowsHide: true, stdio: 'ignore' })
    for (let i = 0; i < 80; i++) { try { if ((await fetch(ui)).ok) break } catch {} await delay(150) }
    const { chromium } = await import('../.secrets/browser-tools/node_modules/playwright-core/index.mjs')
    browser = await chromium.launch({ channel: 'msedge', headless: true })
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' })
    await context.route('**/api/**', async route => { const url = new URL(route.request().url()); const response = await route.fetch({ url: origin + url.pathname + url.search }); await route.fulfill({ response }) })
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${ui}/#login`)
    await page.getByLabel('Correo electrónico', { exact: true }).fill('owner@example.invalid'); await page.getByLabel('Contraseña', { exact: true }).fill(password); await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click(); await page.locator('#dashboard-title').waitFor()
    // Removed modules and the notifications bell are gone.
    const nav = await page.locator('.panel-nav [data-panel-item]').allInnerTexts()
    for (const removed of ['Transmisiones', 'Asistencia y alertas', 'Seguimiento']) assert.ok(!nav.some(text => text.includes(removed)), `${removed} no debe estar en el menú`)
    assert.ok(nav.some(text => text.includes('Mapa de grupos')), 'El mapa de grupos vuelve al menú')
    assert.equal(await page.getByRole('button', { name: /Notificaciones/ }).count(), 0)
    assert.equal(await page.locator('[data-shortcut=alerts],[data-shortcut=transmisiones]').count(), 0)
    // Group codes exist but are not shown.
    await page.goto(`${ui}/#gestion/groups`)
    await page.locator('.record-open', { hasText: 'Familia Esperanza' }).waitFor()
    assert.equal(await page.getByText(/GR-\d+/).count(), 0, 'El código del grupo no se muestra en la lista')
    await page.getByRole('button', { name: 'Nuevo grupo', exact: true }).click()
    assert.equal(await page.getByText('Código del grupo').count(), 0)
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
    // Group record: add disciples with the picker.
    await page.locator('.record-open', { hasText: 'Familia Esperanza' }).click()
    await page.getByRole('heading', { name: /Discípulos del grupo/ }).waitFor()
    assert.equal(await page.getByText(/GR-\d+/).count(), 0, 'El código del grupo no se muestra en la ficha')
    assert.equal(await page.getByText('Ver barrios en el mapa').count(), 0)
    assert.deepEqual((await page.locator('.group-members-list li > span:not(.member-code)').allInnerTexts()).sort(), ['Ana Prueba', 'Marta Prueba'])
    await page.getByRole('button', { name: 'Agregar discípulos', exact: true }).click()
    await page.getByLabel('Buscar discípulo').fill('luis')
    await page.locator('.group-members-options label', { hasText: 'Luis Prueba' }).click()
    await page.getByLabel('Buscar discípulo').fill('fuera')
    await page.locator('.group-members-options label', { hasText: 'Fuera Prueba' }).click()
    await page.getByText('1 discípulo seleccionado está en otro grupo y pasará a este.').waitFor()
    await page.screenshot({ path: `${shots}/group-members-picker-1280.png`, fullPage: true })
    await page.getByRole('button', { name: 'Agregar 2 al grupo', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Se agregaron 2 discípulos al grupo (1 cambiaron de grupo).' }).waitFor()
    await page.locator('.group-members-list li', { hasText: 'Luis Prueba' }).waitFor()
    assert.equal(await page.locator('.group-members-list li').count(), 4)
    // "Ver discípulos" from the group shows its disciples.
    await page.getByRole('link', { name: /Ver discípulos/ }).click()
    await page.waitForURL(/#gestion\/members\/grupo\/\d+$/)
    await page.locator('.record-open').first().waitFor()
    assert.deepEqual((await page.locator('.record-open strong').allInnerTexts()).sort(), ['Ana Prueba', 'Fuera Prueba', 'Luis Prueba', 'Marta Prueba'])
    await page.getByText('Mostrando los discípulos de Familia Esperanza.').waitFor()
    // An empty group explains itself and leads back to the group to add disciples.
    await page.goto(`${ui}/#gestion/members/grupo/${empty.id}`)
    await page.getByRole('heading', { name: 'Este grupo todavía no tiene discípulos' }).waitFor()
    await page.getByRole('link', { name: 'Ir al grupo', exact: true }).click()
    await page.getByRole('heading', { name: /Discípulos del grupo/ }).waitFor()
    await page.getByText('Este grupo todavía no tiene discípulos.', { exact: false }).waitFor()
    for (const width of [390, 320]) { await page.setViewportSize({ width, height: 900 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Ficha de grupo a ${width}px`) }
    await page.getByRole('button', { name: 'Agregar discípulos', exact: true }).click()
    await page.screenshot({ path: `${shots}/group-members-picker-390.png`, fullPage: true })
    // Disciples / disciple leaders selector; a leader opens their own disciple record (no ministries section).
    await page.setViewportSize({ width: 1280, height: 1000 })
    await page.goto(`${ui}/#gestion/members`)
    await page.locator('.record-open').first().waitFor()
    const names = async () => (await page.locator('.record-open strong').allInnerTexts()).sort()
    assert.deepEqual(await names(), ['Ana Prueba', 'Fuera Prueba', 'Luis Prueba', 'Marta Prueba'])
    await page.getByRole('button', { name: /^Discipuladores/ }).click()
    assert.deepEqual(await names(), ['Líder A Prueba', 'Líder B Prueba', 'Pastora Prueba'])
    await page.locator('.record-open', { hasText: 'Líder A Prueba' }).getByText('Discipulador · Familia Esperanza').waitFor()
    await page.screenshot({ path: `${shots}/members-leaders-1280.png`, fullPage: true })
    await page.locator('.record-open', { hasText: 'Líder A Prueba' }).click()
    await page.getByRole('heading', { name: 'Ficha de Líder A' }).waitFor()
    await page.getByText('de: Familia Esperanza', { exact: false }).waitFor()
    assert.equal(await page.getByRole('heading', { name: 'Ministerios' }).count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Guardar ministerios' }).count(), 0)
    // Leader record split in "Información" and "Grupos a cargo": neighborhoods and disciples per group.
    page.on('dialog', dialog => void dialog.accept())
    await page.getByRole('tab', { name: 'Información' }).waitFor()
    await page.getByRole('tab', { name: /Grupos a cargo \(1\)/ }).click()
    const card = page.locator('.leader-group', { hasText: 'Familia Esperanza' })
    await card.getByText('Barrios: Sin barrios asignados').waitFor()
    await card.getByRole('button', { name: '+ Administrar barrios' }).click()
    await card.getByLabel('Buscar barrio').fill('barrio')
    await card.getByRole('checkbox', { name: 'Barrio Norte' }).check()
    await card.getByRole('checkbox', { name: 'Barrio Sur' }).check()
    await card.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    await card.getByText('Barrios: Barrio Norte, Barrio Sur').waitFor()
    await card.getByRole('checkbox', { name: 'Barrio Sur' }).uncheck()
    await card.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    await card.getByRole('button', { name: 'Quitar y guardar cambios' }).click()
    await card.getByText('Barrios: Barrio Norte', { exact: true }).waitFor()
    await card.getByRole('button', { name: 'Quitar a Marta Prueba del grupo' }).click()
    await page.getByRole('status').filter({ hasText: 'Marta Prueba ya no pertenece a Familia Esperanza.' }).waitFor()
    await card.locator('.group-members-list li', { hasText: 'Marta Prueba' }).waitFor({ state: 'detached' })
    assert.equal((await db.query('SELECT id_grupo FROM miembro WHERE id_miembro=?', [marta]))[0][0].id_grupo, null)
    await card.getByRole('button', { name: 'Agregar discípulos', exact: true }).click()
    await card.getByLabel('Buscar discípulo').fill('marta')
    await card.locator('.group-members-options label', { hasText: 'Marta Prueba' }).click()
    await card.getByRole('button', { name: 'Agregar 1 al grupo', exact: true }).click()
    await card.locator('.group-members-list li', { hasText: 'Marta Prueba' }).waitFor()
    assert.equal((await db.query('SELECT id_grupo FROM miembro WHERE id_miembro=?', [marta]))[0][0].id_grupo, groupA.id)
    await page.screenshot({ path: `${shots}/leader-groups-1280.png`, fullPage: true })
    const [[groupRow]] = await db.query('SELECT barrio FROM grupo_comunion WHERE id_grupo=?', [groupA.id])
    assert.equal(groupRow.barrio, 'Barrio Norte')
    await page.getByRole('tab', { name: 'Información' }).click()
    await page.getByRole('heading', { name: 'Historial de grupos' }).waitFor()
    // A disciple's group history lists only assignments, with the group name and who assigned it.
    await page.goto(`${ui}/#gestion/members`); await page.reload()
    await page.getByRole('button', { name: 'Ver ficha de Marta Prueba', exact: true }).click()
    const groupHistory = page.locator('.member-group-history')
    await groupHistory.getByRole('heading', { name: 'Historial de grupos' }).waitFor()
    await page.waitForFunction(() => document.querySelectorAll('.member-group-history li').length >= 2)
    await page.waitForTimeout(300)
    const entries = await groupHistory.locator('li').allInnerTexts()
    assert.equal(entries.length, 2, 'Solo las asignaciones (no cuando se quitó del grupo)')
    for (const entry of entries) assert.match(entry, /^Familia Esperanza\nAsignado por Propietario\n\d{1,2} de \p{L}+ de 20\d\d(,| a las) \d{1,2}:\d\d/u)
    assert.equal(await page.getByText('Historial de grupo y cobertura').count(), 0)
    await groupHistory.screenshot({ path: `${shots}/member-group-history.png` })
    await page.goto(`${ui}/#gestion/members/discipuladores`); await page.reload()
    await page.locator('.record-open', { hasText: 'Pastora Prueba' }).waitFor()
    for (const width of [390, 320]) { await page.setViewportSize({ width, height: 900 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Discipuladores a ${width}px`) }
    await page.screenshot({ path: `${shots}/members-leaders-390.png`, fullPage: true })
    assert.deepEqual(errors, [])
    console.log('PASS UI: removed modules and bell, hidden group codes, add disciples from the group record, redirect to the group disciples, empty group guidance, disciples/leaders selector, leader record split in information and groups (neighborhoods and disciples), no ministries and 320-1280px layout')
  }
} finally {
  await browser?.close()
  preview?.kill()
  server?.close()
  await pool?.end().catch(() => {})
  await db.query(`DROP DATABASE IF EXISTS \`${database}\``).catch(() => {})
  await db.end()
}
