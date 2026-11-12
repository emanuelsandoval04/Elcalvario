import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import mysql from 'mysql2/promise'
import { applyMigrations } from '../server/migration-runner.js'
import { bogotaToday } from '../server/entities.js'
import { pickOption } from './select-helper.mjs'

const database = `calvario_recurring_test_${randomUUID().replaceAll('-', '')}`
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
  const { ensureRecurringActivities } = await import('../server/recurring-activities.js')
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  process.env.APP_ORIGINS = origin
  const password = `Check-${randomUUID()}`
  const today = bogotaToday()
  const plusDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
  const start = plusDays(today, 1)
  async function request(path, { body, cookie = '', method = body === undefined ? 'GET' : 'POST', status = 200 } = {}) {
    const response = await fetch(`${origin}/api/${path}`, { method, headers: { Origin: origin, Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) })
    const data = await response.json()
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`)
    return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie }
  }
  await bootstrapAdmin({ name: 'Propietario', email: 'owner@example.invalid', password })
  const owner = await request('auth/login', { body: { email: 'owner@example.invalid', password } })
  const passwordHash = await hashPassword(password)
  async function seedAccount(email, role) {
    const [roles] = await db.execute('SELECT id_rol FROM rol_sistema WHERE nombre=?', [role])
    const [account] = await db.execute("INSERT INTO usuario(correo_login,password_hash,estado_usuario) VALUES (?,?,'activo')", [email, passwordHash])
    await db.execute('INSERT INTO usuario_rol(id_usuario,id_rol) VALUES (?,?)', [account.insertId, roles[0].id_rol])
    return request('auth/login', { body: { email, password } })
  }
  const basic = await seedAccount('basic@example.invalid', 'Usuario')
  const disciple = await seedAccount('disciple@example.invalid', 'Discipulador')
  const media = await seedAccount('media@example.invalid', 'Multimedia')
  const [editorRole] = await db.execute("INSERT INTO rol_sistema(nombre) VALUES ('Editor limitado')")
  for (const code of ['gestion.acceder', 'eventos.editar']) await db.execute("INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance) VALUES (?,?,'todos')", [editorRole.insertId, code])
  const editor = await seedAccount('editor@example.invalid', 'Editor limitado')
  const base = { tipo_actividad: 'culto', titulo: 'Culto dominical', fecha: start, hora: '09:00', lugar: 'Templo', estado_actividad: 'programada', publicado: true, recurrence: { dayOfWeek: 0, until: null } }
  const create = (body = base, cookie = owner.cookie, status = 201) => request('management/activities', { body, cookie, status })
  const edit = (id, body, status = 200) => request(`management/activities/${id}`, { body, cookie: owner.cookie, method: 'PATCH', status })
  const occurrences = async id => (await db.execute('SELECT ac.*,CAST(ac.fecha AS CHAR) AS fecha,CAST(ar.fecha_programada AS CHAR) AS originalDate FROM actividad ac JOIN actividad_repetida ar ON ar.id_actividad=ac.id_actividad WHERE ar.id_serie=? ORDER BY ar.fecha_programada', [id]))[0]
  await create(base, '', 401)
  await create(base, basic.cookie, 403)
  await create(base, disciple.cookie, 403)
  await create(base, editor.cookie, 403)
  for (const recurrence of [{ dayOfWeek: 7 }, { dayOfWeek: '0' }, { dayOfWeek: 0, until: plusDays(start, -1) }]) await create({ ...base, recurrence }, owner.cookie, 400)
  await create({ ...base, tipo_actividad: 'reunion_grupo' }, disciple.cookie, 400)
  assert.equal((await db.execute('SELECT COUNT(*) AS total FROM serie_actividad'))[0][0].total, 0)
  const created = (await create()).data
  assert.ok(created.seriesId); assert.ok(created.id)
  let dates = await occurrences(created.seriesId)
  assert.ok(dates.length >= 12 && dates.length <= 13)
  assert.equal(new Set(dates.map(row => row.id_actividad)).size, dates.length)
  for (let index = 0; index < dates.length; index++) {
    assert.equal(new Date(`${dates[index].fecha}T00:00:00Z`).getUTCDay(), 0)
    assert.equal(dates[index].hora, '09:00:00')
    if (index) assert.equal(Date.parse(dates[index].fecha) - Date.parse(dates[index - 1].fecha), 7 * 86400000)
  }
  await Promise.all(Array.from({ length: 4 }, () => request('public/events')))
  assert.equal((await occurrences(created.seriesId)).length, dates.length, 'Las consultas concurrentes no deben duplicar fechas.')
  let publicEvents = (await request('public/events')).data.items
  assert.equal(publicEvents.filter(row => row.id_serie === created.seriesId).length, 1)
  assert.equal(publicEvents.find(row => row.id_serie === created.seriesId).id_actividad, dates[0].id_actividad)
  // Attendance cards: one date per fixed event (this week's, even after it started today); every single event.
  const attendanceCards = async period => (await request(`management/activities?view=attendance&period=${period}`, { cookie: owner.cookie })).data.items
  const singles = [(await create({ ...base, titulo: 'Retiro único', fecha: plusDays(start, 20), publicado: false, recurrence: undefined })).data, (await create({ ...base, titulo: 'Vigilia única', fecha: plusDays(start, 40), publicado: false, recurrence: undefined })).data]
  let cards = await attendanceCards('upcoming')
  assert.equal(cards.filter(row => row.id_serie === created.seriesId).length, 1, 'Asistencia debe mostrar una sola fecha por evento fijo.')
  assert.equal(cards.find(row => row.id_serie === created.seriesId).id_actividad, dates[0].id_actividad)
  assert.ok(singles.every(single => cards.some(row => row.id_actividad === single.id)), 'Asistencia debe mostrar todos los eventos no fijos.')
  await db.execute("UPDATE actividad SET fecha=?,hora='00:00:01' WHERE id_actividad=?", [today, dates[0].id_actividad])
  cards = await attendanceCards('upcoming')
  assert.deepEqual(cards.filter(row => row.id_serie === created.seriesId).map(row => row.id_actividad), [dates[0].id_actividad], 'La fecha de hoy sigue disponible aunque ya comenzó.')
  await db.execute('UPDATE actividad SET fecha=?,hora=? WHERE id_actividad=?', [dates[0].fecha, dates[0].hora, dates[0].id_actividad])
  for (const single of singles) await request(`management/activities/${single.id}`, { body: {}, cookie: owner.cookie, method: 'DELETE' })
  let notifications = (await request('auth/notifications', { cookie: basic.cookie })).data.items
  assert.equal(notifications.filter(item => item.title === 'Culto dominical').length, 1)
  const attendance = id => request('management/attendance', { body: { id_actividad: id, estado_asistencia: 'visitante', nombre_visitante: 'Visitante de prueba' }, cookie: owner.cookie, status: 201 })
  await attendance(dates[0].id_actividad); await attendance(dates[1].id_actividad)
  for (const occurrence of dates.slice(0, 2)) assert.equal((await request(`management/attendance?activityId=${occurrence.id_actividad}`, { cookie: owner.cookie })).data.items.length, 1)
  await edit(dates[0].id_actividad, { estado_actividad: 'cancelada', edit_scope: 'single' })
  assert.equal((await occurrences(created.seriesId))[1].estado_actividad, 'programada')
  await edit(dates[0].id_actividad, { estado_actividad: 'programada', fecha: plusDays(dates[0].fecha, 1), hora: '11:00', edit_scope: 'single' })
  await request('public/events')
  assert.equal((await occurrences(created.seriesId)).length, dates.length, 'Una excepción no debe regenerar la fecha original.')
  publicEvents = (await request('public/events')).data.items
  const exception = publicEvents.find(row => row.id_serie === created.seriesId)
  assert.equal(exception.hora, '11:00:00'); assert.equal(exception.repeticion_hora, '09:00')
  await edit(dates[1].id_actividad, { titulo: 'Culto con nueva hora', hora: '10:00', edit_scope: 'following' })
  let updated = await occurrences(created.seriesId)
  assert.equal(updated[0].hora, '11:00:00')
  assert.ok(updated.slice(1).every(row => row.hora === '10:00:00' && row.titulo === 'Culto con nueva hora'))
  await edit(dates[1].id_actividad, { fecha: plusDays(dates[1].fecha, 1), edit_scope: 'following' }, 400)
  await Promise.all([ensureRecurringActivities(plusDays(today, 77)), ensureRecurringActivities(plusDays(today, 77))])
  updated = await occurrences(created.seriesId)
  assert.ok(updated.length > dates.length)
  assert.ok(updated.slice(dates.length).every(row => row.hora === '10:00:00' && row.titulo === 'Culto con nueva hora'))
  assert.equal(new Set(updated.map(row => row.originalDate)).size, updated.length)
  const limited = (await create({ ...base, tipo_actividad: 'evento', titulo: 'Encuentro de los jueves', requiere_inscripcion: true, url_inscripcion: 'https://example.invalid/inscripcion', recurrence: { dayOfWeek: 4, until: plusDays(start, 21) } }, media.cookie)).data
  const thursdays = await occurrences(limited.seriesId)
  assert.ok(thursdays.length >= 3 && thursdays.length <= 4)
  assert.ok(thursdays.every(row => new Date(`${row.fecha}T00:00:00Z`).getUTCDay() === 4 && row.fecha <= plusDays(start, 21)))
  const [eventRows] = await db.execute('SELECT e.* FROM evento e JOIN actividad_repetida ar ON ar.id_actividad=e.id_actividad WHERE ar.id_serie=?', [limited.seriesId])
  assert.equal(eventRows.length, thursdays.length)
  assert.ok(eventRows.every(row => row.requiere_inscripcion === 1 && row.url_inscripcion === 'https://example.invalid/inscripcion'))
  const privateSeries = (await create({ ...base, titulo: 'Culto privado', publicado: undefined }, editor.cookie)).data
  assert.ok(!(await request('public/events')).data.items.some(row => row.id_serie === privateSeries.seriesId))
  assert.ok(!(await request('auth/notifications', { cookie: basic.cookie })).data.items.some(item => item.title === 'Culto privado'))
  const archivedId = (await occurrences(privateSeries.seriesId))[0].id_actividad
  await request(`management/activities/${archivedId}`, { body: {}, cookie: owner.cookie, method: 'DELETE' })
  await request('public/events')
  assert.equal((await occurrences(privateSeries.seriesId)).filter(row => row.id_actividad === archivedId)[0].archivado, 1)
  const clockSeries = (await create({ ...base, titulo: 'Próxima fecha después del horario de hoy' })).data
  const clockDates = await occurrences(clockSeries.seriesId)
  await edit(clockDates[0].id_actividad, { fecha: today, hora: '00:00', edit_scope: 'single' })
  const clockPublic = (await request('public/events')).data.items.find(row => row.id_serie === clockSeries.seriesId)
  assert.equal(clockPublic.id_actividad, clockDates[1].id_actividad, 'La agenda debe avanzar después de la hora de una repetición de hoy.')
  const agenda=async()=> (await request('management/activities?view=agenda',{cookie:owner.cookie})).data.items
  let agendaItems=await agenda()
  assert.equal(agendaItems.filter(row=>row.id_serie===clockSeries.seriesId).length,1)
  assert.equal(agendaItems.find(row=>row.id_serie===clockSeries.seriesId).id_actividad,clockDates[1].id_actividad)
  assert.equal(agendaItems.filter(row=>row.id_serie===privateSeries.seriesId).length,1,'Los fijos privados también deben aparecer una sola vez para sus responsables.')
  assert.equal(agendaItems.find(row=>row.id_serie===privateSeries.seriesId).id_actividad,(await occurrences(privateSeries.seriesId))[1].id_actividad,'Una fecha archivada no debe impedir mostrar la siguiente.')
  const pastOneOff=(await create({...base,titulo:'Evento individual pasado',fecha:plusDays(today,-1),recurrence:null})).data
  const elapsedToday=(await create({...base,titulo:'Evento individual realizado hoy',fecha:today,hora:'00:00',recurrence:null})).data
  const futureOneOff=(await create({...base,titulo:'Evento individual próximo',fecha:plusDays(today,2),recurrence:null})).data
  const originalActivities=(await db.execute('SELECT * FROM actividad ORDER BY id_actividad'))[0]
  const originalAttendance=(await db.execute('SELECT * FROM asistencia ORDER BY id_asistencia'))[0]
  agendaItems=await agenda()
  assert.ok(!agendaItems.some(row=>row.id_actividad===pastOneOff.id || row.id_actividad===elapsedToday.id))
  assert.ok(agendaItems.some(row=>row.id_actividad===futureOneOff.id))
  const order=agendaItems.map(row=>`${row.fecha} ${row.hora} ${String(row.id_actividad).padStart(12,'0')}`)
  assert.deepEqual(order,[...order].sort(),'La lista debe ordenarse por la próxima fecha y hora, después de agrupar las series.')
  assert.deepEqual((await db.execute('SELECT * FROM actividad ORDER BY id_actividad'))[0],originalActivities,'Ocultar fechas pasadas no debe modificarlas ni archivarlas.')
  assert.deepEqual((await db.execute('SELECT * FROM asistencia ORDER BY id_asistencia'))[0],originalAttendance)
  const history=(await request('management/activities',{cookie:owner.cookie})).data.items
  assert.ok(history.some(row=>row.id_actividad===pastOneOff.id));assert.ok(history.some(row=>row.id_actividad===clockDates[0].id_actividad))
  assert.ok(history.filter(row=>row.id_serie===clockSeries.seriesId).length>1,'Asistencia debe conservar cada fecha independiente.')
  await request('management/activities?view=agenda',{cookie:basic.cookie,status:403})
  assert.ok(!(await request('management/activities?view=agenda',{cookie:disciple.cookie})).data.items.some(row=>row.id_serie),'El listado simplificado no debe ampliar los permisos por grupo.')
  await request('management/activities?view=invalid',{cookie:owner.cookie,status:400})
  await edit(clockDates[1].id_actividad,{fecha:plusDays(today,2),hora:'09:00',edit_scope:'single'})
  await edit(clockDates[2].id_actividad,{fecha:plusDays(today,2),hora:'09:00',edit_scope:'single'})
  agendaItems=await agenda()
  assert.equal(agendaItems.filter(row=>row.id_serie===clockSeries.seriesId).length,1,'Dos excepciones en la misma fecha no deben producir tarjetas duplicadas.')
  assert.equal(agendaItems.find(row=>row.id_serie===clockSeries.seriesId).id_actividad,clockDates[1].id_actividad)
  const sameTitle=(await create({...base,titulo:'Próxima fecha después del horario de hoy'})).data
  assert.equal((await agenda()).filter(row=>[clockSeries.seriesId,sameTitle.seriesId].includes(row.id_serie)).length,2,'Las programaciones diferentes conservan su tarjeta aunque compartan título.')
  console.log('PASS agenda: one pending date per active series, private dates, archived exceptions, clock rollover, distinct series, chronological order, scoped access and unchanged history/attendance.')
  const oneOff = (await create({ ...base, titulo: 'Evento para convertir', recurrence: null })).data
  await request(`management/activities/${oneOff.id}`, { body: { recurrence: { dayOfWeek: 0 } }, cookie: editor.cookie, method: 'PATCH', status: 403 })
  const converted = (await edit(oneOff.id, { recurrence: { dayOfWeek: 0 } })).data
  assert.equal(converted.id, oneOff.id); assert.ok(converted.seriesId)
  const used = (await create({ ...base, titulo: 'Evento con historial', recurrence: null })).data
  await attendance(used.id)
  await edit(used.id, { recurrence: { dayOfWeek: 0 } }, 409)
  await edit(dates[2].id_actividad, { fecha: plusDays(today, -1), edit_scope: 'single' })
  await attendance(dates[2].id_actividad)
  await request(`management/activities/${created.id}/recurrence/stop`, { cookie: disciple.cookie, body: {}, status: 403 })
  await Promise.all([ensureRecurringActivities(plusDays(today, 100)), request(`management/activities/${created.id}/recurrence/stop`, { cookie: owner.cookie, body: {} })])
  const stopped = await occurrences(created.seriesId)
  assert.ok(stopped.filter(row => row.fecha > today).every(row => row.estado_actividad === 'cancelada'))
  assert.equal(stopped.find(row => row.id_actividad === dates[2].id_actividad).estado_actividad, 'programada')
  assert.equal((await db.execute('SELECT COUNT(*) AS total FROM asistencia WHERE id_actividad IN (?,?,?)', dates.slice(0, 3).map(row => row.id_actividad)))[0][0].total, 3)
  await ensureRecurringActivities(plusDays(today, 200))
  assert.equal((await occurrences(created.seriesId)).length, stopped.length)
  await applyMigrations(db)
  assert.equal((await occurrences(created.seriesId)).length, stopped.length)
  const fixed = (await create({...base,fecha:undefined,fixed:true,titulo:'Fijo sin fecha'})).data
  const fixedDates = await occurrences(fixed.seriesId)
  const historicId=fixedDates[0].id_actividad, advanceId=fixedDates[1].id_actividad
  await edit(historicId,{fecha:plusDays(today,-7),edit_scope:'single'})
  await attendance(historicId); await attendance(advanceId)
  const historicBefore=(await db.execute('SELECT * FROM actividad WHERE id_actividad=?',[historicId]))[0][0]
  const historicAttendance=(await request(`management/attendance?activityId=${historicId}`,{cookie:owner.cookie})).data.items
  await edit(historicId,{fixed:true,edit_scope:'following',recurrence:{dayOfWeek:4},hora:'09:30',titulo:'Fijo cambiado a jueves'})
  const fixedUpdated=await occurrences(fixed.seriesId)
  assert.ok(fixedUpdated.filter(row=>row.fecha>=today).every(row=>new Date(`${row.fecha}T00:00:00Z`).getUTCDay()===4 && row.hora==='09:30:00'))
  assert.deepEqual((await db.execute('SELECT * FROM actividad WHERE id_actividad=?',[historicId]))[0][0],historicBefore)
  assert.equal((await request(`management/attendance?activityId=${advanceId}`,{cookie:owner.cookie})).data.items.length,1,'La asistencia adelantada también permanece accesible.')
  await request(`management/activities/${historicId}`,{cookie:editor.cookie,method:'DELETE',body:{scope:'series'},status:403})
  await request(`management/activities/${historicId}`,{cookie:owner.cookie,method:'DELETE',body:{scope:'series'}})
  assert.deepEqual((await db.execute('SELECT * FROM actividad WHERE id_actividad=?',[historicId]))[0][0],historicBefore)
  assert.deepEqual((await request(`management/attendance?activityId=${historicId}`,{cookie:owner.cookie})).data.items,historicAttendance)
  const deletedCount=(await occurrences(fixed.seriesId)).length
  await ensureRecurringActivities(plusDays(today,200))
  assert.equal((await occurrences(fixed.seriesId)).length,deletedCount)
  assert.ok(!(await request('public/events')).data.items.some(row=>row.id_serie===fixed.seriesId))
  assert.ok(!(await agenda()).some(row=>row.id_serie===fixed.seriesId || row.id_serie===created.seriesId),'Las series detenidas no deben reaparecer por conservar asistencias futuras.')
  console.log('PASS API: Sunday/Thursday schedules, distinct attendance, concurrent generation, future extension, date exceptions, following edits, public/notification deduplication, privacy, conversion and stopping without deleting history')

  if (process.argv.includes('--ui')) {
    const ui = 'http://127.0.0.1:5196'
    process.env.APP_ORIGINS = `${origin},${ui}`
    preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5196', '--strictPort'], { windowsHide: true, stdio: 'ignore' })
    let ready = false
    for (let index = 0; index < 80; index++) { try { ready = (await fetch(ui)).ok } catch {} if (ready) break; await delay(200) }
    assert.ok(ready, 'No inició la vista previa local.')
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
    await page.goto(`${ui}/#login`)
    await page.getByLabel('Correo electrónico', { exact: true }).fill('owner@example.invalid')
    await page.getByLabel('Contraseña', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await page.locator('#dashboard-title').waitFor()
    await page.goto(`${ui}/#gestion/activities`)
    await page.getByRole('button', { name: 'Nuevo evento', exact: true }).click()
    assert.equal(await page.getByRole('combobox', { name: 'Tipo de actividad', exact: true }).count(), 0)
    const form = page.locator('.manage-form')
    await form.getByLabel('Nombre del evento *', { exact: true }).fill('Culto semanal de prueba UI')
    await form.getByLabel('Fecha *', { exact: true }).fill(start)
    await form.getByLabel('Hora (Colombia) *', { exact: true }).fill('09:00')
    await form.getByLabel('Lugar *', { exact: true }).fill('Templo principal')
    await pickOption(form.getByRole('combobox', { name: 'Estado *', exact: true }), 'programada')
    await form.getByLabel('Visible en la web pública').check()
    await form.getByLabel('Fijo', { exact: true }).check()
    assert.equal(await form.locator('input[type=date]').count(),0)
    await pickOption(form.getByRole('combobox', { name: 'Día de la semana *', exact: true }), '0')
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await page.screenshot({ path: `checks/recurring-form-${width}.png`, fullPage: true })
    }
    await form.getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Programación semanal creada.' }).waitFor()
    await page.getByRole('button',{name:'Ver ficha de Culto semanal de prueba UI',exact:true}).waitFor()
    assert.equal(await page.getByRole('button',{name:'Ver ficha de Culto semanal de prueba UI',exact:true}).count(),1)
    assert.equal(await page.getByRole('button',{name:'Pasados',exact:true}).count(),0)
    assert.equal(await page.getByRole('button',{name:'Ver ficha de Evento individual pasado',exact:true}).count(),0)
    assert.equal(await page.getByRole('button',{name:'Ver ficha de Evento individual realizado hoy',exact:true}).count(),0)
    const [uiSeries]=await db.execute("SELECT ar.id_serie FROM actividad_repetida ar JOIN actividad ac ON ac.id_actividad=ar.id_actividad WHERE ac.titulo='Culto semanal de prueba UI' LIMIT 1")
    const uiDates=await occurrences(uiSeries[0].id_serie)
    assert.ok(uiDates.length>1)
    const priorUiDate=uiDates[0].id_actividad
    await edit(priorUiDate,{fecha:plusDays(today,-7),edit_scope:'single'})
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
    await page.waitForFunction(id=>document.querySelector(`.record-open[aria-label="Ver ficha de Culto semanal de prueba UI"]`)?.closest('article')?.textContent?.includes(id),uiDates[1].fecha)
    assert.equal(await page.getByRole('button',{name:'Ver ficha de Culto semanal de prueba UI',exact:true}).count(),1)
    const uiPast=(await db.execute('SELECT CAST(fecha AS CHAR) AS fecha FROM actividad WHERE id_actividad=?',[priorUiDate]))[0][0]
    assert.equal(uiPast.fecha,plusDays(today,-7))
    await page.goto(`${ui}/#eventos`)
    const card = page.locator('.event-card').filter({ hasText: 'Culto semanal de prueba UI' })
    await card.waitFor(); assert.equal(await card.count(), 1)
    assert.ok((await card.innerText()).includes('Cada domingo'))
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await card.screenshot({ path: `checks/recurring-public-${width}.png` })
    }
    await page.goto(`${ui}/#gestion/activities`)
    await page.getByRole('button', { name: 'Ver ficha de Culto semanal de prueba UI', exact: true }).first().click()
    await page.getByRole('button', { name: 'Editar actividad', exact: true }).click()
    await pickOption(page.getByRole('combobox', { name: 'Aplicar cambios a', exact: true }), 'following')
    await page.getByLabel('Lugar *', { exact: true }).fill('Templo actualizado')
    await page.locator('.manage-form').getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Programación semanal guardada.' }).waitFor()
    await page.getByRole('button', { name: 'Ver ficha de Culto semanal de prueba UI', exact: true }).first().click()
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Eliminar evento fijo', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Evento fijo eliminado de la agenda.' }).waitFor()
    assert.deepEqual(errors, [])
    console.log('PASS UI: Fijo without a date, weekday/time, public weekly label, editing and deletion at 1440/390/320 px')
  }
} finally {
  if (browser) await browser.close()
  if (preview) { preview.kill(); await once(preview, 'exit') }
  if (server) await new Promise(resolve => server.close(resolve))
  if (pool) await pool.end()
  await db.query(`DROP DATABASE IF EXISTS \`${database}\``)
  await db.end()
}
