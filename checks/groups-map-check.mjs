import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import mysql from 'mysql2/promise'
import { applyMigrations } from '../server/migration-runner.js'

const database = `calvario_groups_map_test_${randomUUID().replaceAll('-', '')}`
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
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  process.env.APP_ORIGINS = origin
  const password = `Map-${randomUUID()}`
  async function request(path, { body, cookie = '', method = body === undefined ? 'GET' : 'POST', status = 200 } = {}) {
    const response = await fetch(`${origin}/api/${path}`, { method, headers: { Origin: origin, Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) })
    const data = await response.json()
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`)
    return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie }
  }
  await bootstrapAdmin({ name: 'Propietario', email: 'owner@example.invalid', password })
  const owner = await request('auth/login', { body: { email: 'owner@example.invalid', password } })
  const [leader] = await db.execute("INSERT INTO miembro(nombres,apellidos,tipo_identificacion,numero_identificacion,celular,fecha_nacimiento,codigo_qr,id_usuario_creacion) VALUES ('Ana','Líder','CC','L-1','3001234567','1990-01-01',?,?)", [randomUUID(), owner.data.user.id])
  const group = body => request('management/groups', { cookie: owner.cookie, status: 201, body: { estado_grupo: 'activo', ...body } })

  // A group needs its point on the map (both coordinates) or a written address.
  assert.match((await request('management/groups', { cookie: owner.cookie, status: 400, body: { nombre: 'Sin ubicación', estado_grupo: 'activo' } })).data.error, /mapa o escribe su dirección/)
  assert.match((await request('management/groups', { cookie: owner.cookie, status: 400, body: { nombre: 'Medio punto', estado_grupo: 'activo', latitud: 4.14 } })).data.error, /punto completo/)
  await request('management/groups', { cookie: owner.cookie, status: 400, body: { nombre: 'Fuera de rango', estado_grupo: 'activo', latitud: 140, longitud: -73.6 } })
  const north = (await group({ nombre: 'Familia Norte', id_discipulador: leader.insertId, latitud: 4.1531, longitud: -73.6352 })).data.id
  const south = (await group({ nombre: 'Familia Sur', latitud: 4.1203, longitud: -73.6101, direccion: 'Calle 5 # 10-20' })).data.id
  const written = (await group({ nombre: 'Solo dirección', direccion: 'Carrera 40 # 26-15' })).data.id
  await request(`management/groups/${north}`, { cookie: owner.cookie, method: 'PATCH', body: { nombre: 'Familia del Norte' } })
  await request(`management/groups/${written}`, { cookie: owner.cookie, method: 'PATCH', status: 400, body: { direccion: '' } })
  await request(`management/groups/${south}`, { cookie: owner.cookie, method: 'PATCH', body: { direccion: '' } })
  await request(`management/groups/${north}`, { cookie: owner.cookie, method: 'PATCH', status: 400, body: { latitud: null, longitud: null } })
  const items = (await request('management/groups', { cookie: owner.cookie })).data.items
  const byName = Object.fromEntries(items.map(row => [row.nombre, row]))
  assert.equal(byName['Familia del Norte'].discipulador_nombre, 'Ana Líder')
  assert.equal(Number(byName['Familia Sur'].latitud), 4.1203); assert.equal(byName['Familia Sur'].direccion, null)
  assert.equal(byName['Solo dirección'].latitud, null)
  // Group preview: overall attendance of its current disciples at events that already happened.
  const ownerId = owner.data.user.id
  const disciple = async (name, groupId) => (await db.execute("INSERT INTO miembro(nombres,apellidos,tipo_identificacion,numero_identificacion,celular,fecha_nacimiento,codigo_qr,id_grupo,id_usuario_creacion) VALUES (?,'Prueba','CC',?,'3001234567','1990-01-01',?,?,?)", [name, `G-${name}`, randomUUID(), groupId, ownerId]))[0].insertId
  const eventOn = async (title, offset, state = 'programada') => (await db.execute("INSERT INTO actividad(tipo_actividad,titulo,fecha,hora,lugar,estado_actividad,id_usuario_creacion) VALUES ('evento',?,DATE_ADD(CURDATE(),INTERVAL ? DAY),'19:00','Templo',?,?)", [title, offset, state, ownerId]))[0].insertId
  const mark = (activityId, memberId, state, archived = 0) => db.execute('INSERT INTO asistencia(id_actividad,id_miembro,id_usuario_registro,estado_asistencia,archivado) VALUES (?,?,?,?,?)', [activityId, memberId, ownerId, state, archived])
  const m1 = await disciple('Uno', north), m2 = await disciple('Dos', north), other = await disciple('Otro', written)
  const e1 = await eventOn('Culto pasado', -7), e2 = await eventOn('Vigilia pasada', -3), cancelledEvent = await eventOn('Culto cancelado', -2, 'cancelada'), future = await eventOn('Culto futuro', 10)
  await mark(e1, m1, 'presente'); await mark(e1, m2, 'ausente'); await mark(e2, m1, 'presente'); await mark(e2, m2, 'justificado')
  await mark(cancelledEvent, m2, 'presente'); await mark(future, m1, 'ausente'); await mark(e1, other, 'ausente'); await mark(e2, other, 'presente', 1)
  const groupPreview = Object.fromEntries((await request('management/groups', { cookie: owner.cookie })).data.items.map(row => [row.nombre, row]))
  assert.equal(Number(groupPreview['Familia del Norte'].asistencia_porcentaje), 50, '2 de 4 registros válidos')
  assert.equal(Number(groupPreview['Familia del Norte'].miembros), 2)
  assert.equal(Number(groupPreview['Solo dirección'].asistencia_porcentaje), 0, 'El registro archivado no cuenta')
  assert.equal(groupPreview['Familia Sur'].asistencia_porcentaje, null, 'Sin registros no hay porcentaje')

  // A discipulador can be registered without an access account; only pastoral roles may do it.
  const base = { apellidos: 'Prueba', tipo_identificacion: 'CC', celular: '3001234567', fecha_nacimiento: '1990-01-01', tipo_registro: 'discipulo' }
  const pedro = (await request('management/members', { cookie: owner.cookie, status: 201, body: { ...base, nombres: 'Pedro', numero_identificacion: 'D-1' } })).data.id
  const carla = (await request('management/members', { cookie: owner.cookie, status: 201, body: { ...base, nombres: 'Carla', numero_identificacion: 'D-2', cargo_discipulador: 1 } })).data.id
  let people = Object.fromEntries((await request('management/members', { cookie: owner.cookie })).data.items.map(row => [row.nombres, row]))
  assert.deepEqual([people.Carla.es_discipulador, people.Carla.cargo_discipulador, people.Carla.tiene_cuenta].map(Number), [1, 1, 0])
  assert.equal(Number(people.Pedro.es_discipulador), 0)
  await request(`management/members/${pedro}`, { cookie: owner.cookie, method: 'PATCH', body: { cargo_discipulador: 1, nombres: 'Pedro' } })
  await request(`management/members/${pedro}`, { cookie: owner.cookie, method: 'PATCH', body: { cargo_discipulador: 0, nombres: 'Pedro' } })
  people = Object.fromEntries((await request('management/members', { cookie: owner.cookie })).data.items.map(row => [row.nombres, row]))
  assert.equal(Number(people.Pedro.es_discipulador), 0, 'Se puede quitar el cargo de discipulador a quien no tiene cuenta')
  const [[ownerMember]] = await db.query('SELECT id_miembro FROM usuario WHERE correo_login=?', ['owner@example.invalid'])
  if (ownerMember.id_miembro) await request(`management/members/${ownerMember.id_miembro}`, { cookie: owner.cookie, method: 'PATCH', status: 409, body: { cargo_discipulador: 0, nombres: 'Propietario' } })
  const [[basicRole]] = await db.query("SELECT id_rol FROM rol_sistema WHERE nombre='Usuario'")
  const [limited] = await db.execute("INSERT INTO rol_sistema(nombre) VALUES ('Registro sin cargo')")
  for (const code of ['gestion.acceder', 'miembros.ver', 'miembros.registrar']) await db.execute("INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance) VALUES (?,?,'todos')", [limited.insertId, code])
  const { hashPassword } = await import('../server/auth.js')
  const [clerk] = await db.execute("INSERT INTO usuario(correo_login,password_hash,estado_usuario) VALUES ('clerk@example.invalid',?,'activo')", [await hashPassword(password)])
  await db.execute('INSERT INTO usuario_rol(id_usuario,id_rol) VALUES (?,?)', [clerk.insertId, limited.insertId])
  const clerkSession = await request('auth/login', { body: { email: 'clerk@example.invalid', password } })
  await request('management/members', { cookie: clerkSession.cookie, status: 403, body: { ...base, nombres: 'No permitido', numero_identificacion: 'D-3', cargo_discipulador: 1 } })
  void basicRole; void carla
  console.log('PASS API: location required (point or address), complete coordinates, range, edits keep a location and leader name in the list; discipulador without account (create, remove, account and authority rules).')

  if (process.argv.includes('--ui')) {
    const shots = process.env.MAP_SHOTS
    const ui = 'http://127.0.0.1:5196'; process.env.APP_ORIGINS = `${origin},${ui}`
    preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5196', '--strictPort'], { windowsHide: true, stdio: 'ignore' })
    for (let i = 0; i < 80; i++) { try { if ((await fetch(ui)).ok) break } catch {} await delay(150) }
    const { chromium } = await import('../.secrets/browser-tools/node_modules/playwright-core/index.mjs')
    browser = await chromium.launch({ channel: 'msedge', headless: true })
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' })
    await context.route('**/api/**', async route => { const url = new URL(route.request().url()); const response = await route.fetch({ url: origin + url.pathname + url.search }); await route.fulfill({ response }) })
    // Google Maps stand-in: records maps, pins, info windows and fitted bounds (no network, no API key).
    await context.addInitScript(() => {
      const state = window.__maps = { maps: [], markers: [], infos: [], fits: [] }
      const point = (lat, lng) => ({ lat: () => lat, lng: () => lng })
      class Map { constructor(element, options) { this.listeners = {}; this.zoom = options.zoom; this.center = options.center; element.dataset.fakeMap = String(state.maps.length); state.maps.push(this) } addListener(event, callback) { this.listeners[event] = callback; return { remove() {} } } fitBounds(bounds) { state.fits.push(bounds.points.length) } panTo(center) { this.center = center } setCenter(center) { this.center = center } setZoom(zoom) { this.zoom = zoom } getZoom() { return this.zoom } }
      class Marker { constructor(options) { Object.assign(this, options); this.listeners = {}; state.markers.push(this) } setMap(map) { this.map = map } setPosition(position) { this.position = position } getPosition() { return point(this.position.lat, this.position.lng) } setIcon(icon) { this.icon = icon } setZIndex(zIndex) { this.zIndex = zIndex } addListener(event, callback) { this.listeners[event] = callback; return { remove() {} } } }
      class InfoWindow { constructor() { this.listeners = {}; state.infos.push(this) } setContent(content) { this.content = content } open({ anchor }) { this.anchor = anchor; this.opened = true; const box = document.querySelector('.groups-map[data-fake-map]'); if (box && this.content instanceof Node) { let slot = box.querySelector('.fake-info'); if (!slot) { slot = document.createElement('div'); slot.className = 'fake-info'; box.append(slot) } slot.replaceChildren(this.content) } } close() { this.opened = false } addListener(event, callback) { this.listeners[event] = callback; return { remove() {} } } }
      class LatLngBounds { constructor() { this.points = [] } extend(value) { this.points.push(value) } }
      window.google = { maps: { Map, Marker, InfoWindow, LatLngBounds, event: { clearInstanceListeners() {} } } }
    })
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${ui}/#login`)
    await page.getByLabel('Correo electrónico', { exact: true }).fill('owner@example.invalid'); await page.getByLabel('Contraseña', { exact: true }).fill(password); await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click(); await page.locator('#dashboard-title').waitFor()

    // Form: a small map; a click drops a draggable pin; point or address is required.
    await page.goto(`${ui}/#gestion/groups`)
    await page.getByRole('button', { name: 'Nuevo grupo', exact: true }).click()
    await page.getByLabel('Nombre *', { exact: true }).fill('Familia Centro')
    // Only discipuladores can lead a group.
    const leaders = await page.locator('select[name=id_discipulador] option').allInnerTexts()
    assert.ok(leaders.some(text => text.includes('Ana Líder')) && leaders.some(text => text.includes('Carla Prueba')), leaders.join(' | '))
    assert.ok(!leaders.some(text => text.includes('Pedro Prueba')), 'Un discípulo que no es discipulador no aparece')
    const form = page.locator('.group-location')
    await form.locator('[data-fake-map]').waitFor()
    await page.getByRole('button', { name: 'Guardar grupo', exact: true }).click()
    await page.getByText('Marca la ubicación del grupo en el mapa o escribe su dirección.').first().waitFor()
    await page.evaluate(() => window.__maps.maps.at(-1).listeners.click({ latLng: { lat: () => 4.13, lng: () => -73.62 } }))
    await form.getByText('Punto marcado: 4.13000, -73.62000').waitFor()
    const pin = await page.evaluate(() => { const marker = window.__maps.markers.at(-1); return { draggable: marker.draggable, fill: marker.icon.fillColor } })
    assert.equal(pin.draggable, true)
    await page.evaluate(() => { const marker = window.__maps.markers.at(-1); marker.position = { lat: 4.1357, lng: -73.6189 }; marker.listeners.dragend() })
    await form.getByText('Punto marcado: 4.13570, -73.61890').waitFor()
    assert.deepEqual(await form.locator('input[type=hidden]').evaluateAll(inputs => inputs.map(input => [input.name, input.value])), [['latitud', '4.1357'], ['longitud', '-73.6189']])
    if (shots) await page.locator('.manage-editor').screenshot({ path: `${shots}/group-form-map.png` })
    await page.getByRole('button', { name: 'Guardar grupo', exact: true }).click()
    await page.getByRole('heading', { name: 'Familia Centro', exact: true }).waitFor()
    const [[saved]] = await db.query("SELECT latitud,longitud,direccion FROM grupo_comunion WHERE nombre='Familia Centro'")
    assert.deepEqual([Number(saved.latitud), Number(saved.longitud), saved.direccion], [4.1357, -73.6189, null])

    // Cards of located groups link to the map; the map fits every pin and opens the chosen one.
    await page.goto(`${ui}/#gestion/groups`); await page.reload()
    await page.locator('.record-map-link').first().waitFor()
    // Preview: number of disciples, discipulador and only the attendance percentage.
    const northCard = await page.locator('.manage-records article', { hasText: 'Familia del Norte' }).innerText()
    assert.match(northCard, /2 discípulos/); assert.match(northCard, /Discipulador: Ana Líder/); assert.match(northCard, /Asistencia 50%/)
    assert.match(await page.locator('.manage-records article', { hasText: 'Familia Sur' }).innerText(), /Discipulador: Sin asignar[\s\S]*Asistencia: sin registros/)
    assert.match(await page.locator('.manage-records article', { hasText: 'Solo dirección' }).innerText(), /1 discípulo\b[\s\S]*Asistencia 0%/)
    if (shots) await page.locator('.manage-records').screenshot({ path: `${shots}/groups-preview.png` })
    assert.equal(await page.locator('.record-map-link').count(), 3, 'Solo los grupos ubicados muestran "Ver en el mapa"')
    await page.locator('article', { hasText: 'Familia Sur' }).getByRole('link', { name: 'Ver en el mapa' }).click()
    await page.locator('.groups-map[data-fake-map]').waitFor()
    await page.waitForFunction(() => window.__maps.infos.some(info => info.opened))
    const opened = await page.evaluate(() => { const info = window.__maps.infos.find(item => item.opened); const pins = window.__maps.markers.filter(marker => marker.map === info.anchor.map); return { text: info.content.textContent, title: info.anchor.title, pins: pins.map(marker => ({ title: marker.title, scale: marker.icon.scale, opacity: marker.icon.fillOpacity, color: marker.icon.fillColor })), fits: window.__maps.fits } })
    assert.equal(opened.title, 'Familia Sur')
    assert.match(opened.text, /^Familia Sur.*Sin discipulador asignado.*0 discípulos.*Abrir grupo/)
    assert.deepEqual(opened.fits, [3], 'El mapa se ajusta para que quepan los tres pines')
    assert.equal(opened.pins.length, 3)
    for (const marker of opened.pins) {
      if (marker.title === 'Familia Sur') { assert.equal(marker.scale, 1.35); assert.equal(marker.opacity, 1) }
      else { assert.equal(marker.scale, 1); assert.equal(marker.opacity, 0.35) }
    }
    assert.equal(new Set(opened.pins.map(marker => marker.color)).size, 3, 'Cada grupo tiene su color')
    await page.locator('.groups-map-card', { hasText: 'Solo dirección' }).getByRole('link', { name: 'Ubicar' }).waitFor()
    await page.locator('.groups-map-card', { hasText: 'Familia del Norte' }).getByRole('button', { name: 'Ver en el mapa' }).click()
    const second = await page.evaluate(() => { const info = window.__maps.infos.find(item => item.opened); return { title: info.anchor.title, text: info.content.textContent } })
    assert.equal(second.title, 'Familia del Norte'); assert.match(second.text, /^Familia del Norte.*Discipulador: Ana Líder/)
    await page.locator('.groups-map-card[data-active]', { hasText: 'Familia del Norte' }).waitFor()
    if (shots) await page.screenshot({ path: `${shots}/groups-map-1280.png`, fullPage: true })
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await page.locator('.groups-map[data-fake-map]').waitFor()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Mapa a ${width}px`)
      if (shots) await page.screenshot({ path: `${shots}/groups-map-${width}.png`, fullPage: true })
    }
    // Tapping the card inside the map opens the group.
    await page.setViewportSize({ width: 1280, height: 1000 })
    await page.locator('.groups-map-card', { hasText: 'Familia del Norte' }).getByRole('button', { name: 'Ver en el mapa' }).click()
    await page.getByRole('link', { name: 'Abrir el grupo Familia del Norte' }).click()
    await page.getByRole('heading', { name: 'Familia del Norte', exact: true }).waitFor()
    assert.ok(page.url().includes('#gestion/groups/ficha/'))
    assert.deepEqual(errors, [])
    console.log('PASS UI: discipulador selector limited to discipuladores, card in the map opens the group, form map with click and drag into hidden fields, point-or-address rule, "Ver en el mapa" on located cards, fitted bounds, colored pins with the open one highlighted, info with name/type/disciples/address and 320-1280px.')
  }
} finally {
  await browser?.close()
  preview?.kill()
  server?.close()
  await pool?.end().catch(() => {})
  await db.query(`DROP DATABASE IF EXISTS \`${database}\``).catch(() => {})
  await db.end()
}
