import { reportTable } from './report-table.mjs'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {once} from 'node:events'
import {spawn} from 'node:child_process'
import {setTimeout as delay} from 'node:timers/promises'
import {writeFile} from 'node:fs/promises'
import mysql from 'mysql2/promise'
import ExcelJS from 'exceljs'
import {PDFDocument} from 'pdf-lib'
import {applyMigrations} from '../server/migration-runner.js'
import {bogotaToday} from '../server/entities.js'
import {addDays} from '../server/date-ranges.js'
import {pickOption} from './select-helper.mjs'

const database=`calvario_attendance_test_${randomUUID().replaceAll('-','')}`
process.env.DB_NAME=database
const {databaseConfig}=await import('../server/config.js')
assert.ok(['localhost','127.0.0.1','::1'].includes(databaseConfig.host),'Use only a temporary local database.')
const {database:ignored,...config}=databaseConfig
const db=await mysql.createConnection(config)
let server,pool,browser,preview
try {
  await db.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
  await db.query(`USE \`${database}\``);await applyMigrations(db)
  pool=(await import('../server/db.js')).pool
  const {default:app}=await import('../server/app.js'),{bootstrapAdmin}=await import('../server/bootstrap-admin.js'),{hashPassword}=await import('../server/auth.js')
  const password=`Attendance-${randomUUID()}`
  await bootstrapAdmin({name:'Propietario',email:'owner@example.invalid',password})
  server=app.listen(0,'127.0.0.1');await once(server,'listening')
  const origin=`http://127.0.0.1:${server.address().port}`;process.env.APP_ORIGINS=origin
  async function request(path,{body,cookie='',method=body===undefined?'GET':'POST',status=200,raw=false}={}) {
    const response=await fetch(`${origin}/api/${path}`,{method,headers:{Origin:origin,Cookie:cookie,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)})
    if(raw){assert.equal(response.status,status);return response}
    const data=await response.json();assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(data)}`)
    return {data,cookie:response.headers.get('set-cookie')?.split(';')[0]||cookie}
  }
  const owner=await request('auth/login',{body:{email:'owner@example.invalid',password}}),ownerId=owner.data.user.id,hash=await hashPassword(password),today=bogotaToday()
  async function member(name,group=null,state='activo') {const [m]=await db.execute("INSERT INTO miembro(nombres,tipo_identificacion,numero_identificacion,celular,fecha_nacimiento,codigo_qr,id_grupo,estado_miembro,id_usuario_creacion,id_usuario_actualizacion) VALUES (?,'CC',?,'3001234567','1990-01-01',?,?,?,?,?)",[name,randomUUID().slice(0,20),randomUUID(),group,state,ownerId,ownerId]);return m.insertId}
  async function account(email,role,memberId=null) {const [u]=await db.execute("INSERT INTO usuario(correo_login,password_hash,estado_usuario,id_miembro) VALUES (?,?,'activo',?)",[email,hash,memberId]);await db.execute('INSERT INTO usuario_rol(id_usuario,id_rol) SELECT ?,id_rol FROM rol_sistema WHERE nombre=?',[u.insertId,role]);return request('auth/login',{body:{email,password}})}
  const leaderA=await member('Líder A'),leaderB=await member('Líder B')
  const [gA]=await db.execute("INSERT INTO grupo_comunion(codigo_grupo,nombre,id_discipulador) VALUES ('AT-A','Grupo A',?)",[leaderA]),[gB]=await db.execute("INSERT INTO grupo_comunion(codigo_grupo,nombre,id_discipulador) VALUES ('AT-B','Grupo B',?)",[leaderB])
  const personA=await member('Presente prueba',gA.insertId),personJ=await member('Justificado prueba',gA.insertId),personAbsent=await member('Ausente prueba',gA.insertId),personSaved=await member('Ya registrado',gA.insertId),inactive=await member('Inactivo prueba',gA.insertId,'inactivo'),archived=await member('Registro archivado',gA.insertId),outside=await member('Fuera de alcance',gB.insertId)
  const leader=await account('leader@example.invalid','Discipulador',leaderA),basic=await account('basic@example.invalid','Usuario'),media=await account('media@example.invalid','Multimedia')
  const [readRole]=await db.execute("INSERT INTO rol_sistema(nombre) VALUES ('Solo consulta asistencia')")
  for(const code of ['gestion.acceder','asistencia.ver','miembros.ver'])await db.execute("INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance) VALUES (?,?,'todos')",[readRole.insertId,code])
  const reader=await account('reader@example.invalid','Solo consulta asistencia')
  async function activity(title,day,group=gA.insertId,hour='09:00') {const [a]=await db.execute("INSERT INTO actividad(tipo_actividad,titulo,fecha,hora,lugar,id_usuario_creacion) VALUES ('reunion_grupo',?,?,?,'Lugar de prueba',?)",[title,day,hour,ownerId]);await db.execute('INSERT INTO reunion_grupo(id_actividad,id_grupo) VALUES (?,?)',[a.insertId,group]);return a.insertId}
  async function attend(id,person,state='presente',deleted=0) {await db.execute('INSERT INTO asistencia(id_actividad,id_miembro,id_usuario_registro,estado_asistencia,archivado) VALUES (?,?,?,?,?)',[id,person,ownerId,state,deleted])}
  const first=await activity('Mismo evento histórico',addDays(today,-3)),second=await activity('Mismo evento histórico',addDays(today,-3),gA.insertId,'18:00'),future=await activity('Evento futuro',addDays(today,3)),other=await activity('Evento de otro grupo',addDays(today,-4),gB.insertId)
  await attend(first,personSaved);await attend(first,archived,'presente',1)
  const roster=async(id,cookie=leader.cookie)=>(await request(`management/attendance/roster?activityId=${id}`,{cookie})).data
  const save=async(id,version,states={},cookie=leader.cookie,status=201)=>request('management/attendance/save',{cookie,status,body:{activityId:id,rosterVersion:version,states}})
  const initial=await roster(first)
  assert.deepEqual(initial.items.map(item=>item.id_miembro),[personA,personJ,personAbsent,personSaved])
  assert.equal(initial.items.find(item=>item.id_miembro===personSaved).registrado,1)
  await save(first,initial.version,{},'',401);await save(first,initial.version,{},basic.cookie,403);await save(first,initial.version,{},reader.cookie,403)
  for(const states of [null,false,[],undefined])await request('management/attendance/save',{cookie:leader.cookie,status:400,body:{activityId:first,rosterVersion:initial.version,states}})
  await request(`management/attendance/roster?activityId=${other}`,{cookie:leader.cookie,status:404})
  await db.execute('UPDATE miembro SET id_grupo=? WHERE id_miembro=?',[gB.insertId,personAbsent])
  await save(first,initial.version,{},leader.cookie,409)
  assert.equal((await db.execute('SELECT COUNT(*) AS total FROM asistencia WHERE id_actividad=? AND archivado=0',[first]))[0][0].total,1)
  await db.execute('UPDATE miembro SET id_grupo=? WHERE id_miembro=?',[gA.insertId,personAbsent])
  const choices={[personA]:'presente',[personJ]:'justificado'}
  const racing=await Promise.all([save(first,initial.version,choices),save(first,initial.version,choices)])
  assert.deepEqual(racing.map(result=>result.data.created).sort(),[0,3])
  const [stored]=await db.execute('SELECT id_miembro,estado_asistencia FROM asistencia WHERE id_actividad=? AND archivado=0 ORDER BY id_miembro',[first])
  assert.deepEqual(stored.map(item=>[item.id_miembro,item.estado_asistencia]),[[personA,'presente'],[personJ,'justificado'],[personAbsent,'ausente'],[personSaved,'presente']])
  assert.ok(!stored.some(item=>item.id_miembro===inactive || item.id_miembro===outside || item.id_miembro===archived))
  await save(first,initial.version,{[personSaved]:'ausente'},leader.cookie,409)
  await save(first,initial.version,{[outside]:'presente'},leader.cookie,404)
  const futureRoster=await roster(future)
  await save(future,futureRoster.version,{},leader.cookie,409)
  assert.equal((await db.execute('SELECT COUNT(*) AS total FROM asistencia WHERE id_actividad=?',[future]))[0][0].total,0)
  await db.query('CREATE TRIGGER fail_attendance_batch BEFORE INSERT ON asistencia FOR EACH ROW SET NEW.estado_asistencia=NULL')
  await save(second,(await roster(second)).version,{},leader.cookie,503)
  await db.query('DROP TRIGGER fail_attendance_batch')
  assert.equal((await db.execute('SELECT COUNT(*) AS total FROM asistencia WHERE id_actividad=?',[second]))[0][0].total,0)
  await db.query('CREATE TRIGGER fail_attendance_alert BEFORE INSERT ON alerta_ausencia FOR EACH ROW SET NEW.id_miembro=NULL')
  await save(second,(await roster(second)).version,{},leader.cookie,503)
  await db.query('DROP TRIGGER fail_attendance_alert')
  assert.equal((await db.execute('SELECT COUNT(*) AS total FROM asistencia WHERE id_actividad=?',[second]))[0][0].total,0,'Un fallo al recalcular alertas también debe revertir todas las asistencias del lote.')
  await save(second,(await roster(second)).version,{[personA]:'presente',[personJ]:'justificado',[archived]:'presente',[personSaved]:'presente'})
  const profilePath=`management/members/${personAbsent}/attendance`
  let history=(await request(profilePath,{cookie:leader.cookie})).data.items
  assert.deepEqual(history.map(item=>[item.id_actividad,item.estado_asistencia]),[[second,'ausente'],[first,'ausente']])
  assert.equal((await db.execute('SELECT vigente FROM alerta_ausencia WHERE id_miembro=?',[personAbsent]))[0][0].vigente,1)
  await request(`management/attendance/${history[0].id_asistencia}`,{cookie:owner.cookie,method:'PATCH',body:{estado_asistencia:'justificado'}})
  assert.equal((await request(profilePath,{cookie:leader.cookie})).data.items[0].estado_asistencia,'justificado')
  assert.equal((await db.execute('SELECT SUM(vigente) AS total FROM alerta_ausencia WHERE id_miembro=?',[personAbsent]))[0][0].total,'0')
  await request(profilePath,{cookie:basic.cookie,status:403})
  await request(`management/members/${outside}/attendance`,{cookie:leader.cookie,status:404})
  await attend(other,personA)
  assert.ok(!(await request(`management/members/${personA}/attendance`,{cookie:leader.cookie})).data.items.some(item=>item.id_actividad===other))
  assert.ok((await request(`management/members/${personA}/attendance`,{cookie:owner.cookie})).data.items.some(item=>item.id_actividad===other))
  const download=async(id,cookie=owner.cookie,format='xlsx',status=200)=>request(`management/reports/asistencia?activityId=${id}&format=${format}`,{cookie,raw:true,status})
  const report=new ExcelJS.Workbook();await report.xlsx.load(Buffer.from(await (await download(first)).arrayBuffer()))
  const reportData=report.worksheets[0],context=report.getWorksheet('Evento')
  assert.deepEqual(reportTable(reportData).header.slice(1),['ID','Discípulo','Estado','Método'])
  assert.equal(reportTable(reportData).count,4);assert.ok(reportData.getColumn(3).values.includes('Ausente sin justificación'))
  assert.ok(context.getColumn(2).values.includes('Mismo evento histórico'));assert.ok(context.getColumn(2).values.includes('09:00'));assert.ok(context.getColumn(2).values.includes(String(first)))
  assert.ok(!reportData.getColumn(2).values.includes('Registro archivado'))
  const scopedReport=new ExcelJS.Workbook();await scopedReport.xlsx.load(Buffer.from(await (await download(first,leader.cookie)).arrayBuffer()))
  assert.ok(scopedReport.worksheets[0].getColumn(2).values.includes('Presente prueba'))
  await db.execute('UPDATE miembro SET id_grupo=? WHERE id_miembro=?',[gB.insertId,personSaved])
  const transferred=new ExcelJS.Workbook();await transferred.xlsx.load(Buffer.from(await (await download(first,leader.cookie)).arrayBuffer()))
  assert.ok(!transferred.worksheets[0].getColumn(2).values.includes('Ya registrado'))
  await db.execute('UPDATE miembro SET id_grupo=? WHERE id_miembro=?',[gA.insertId,personSaved])
  const generalReport=new ExcelJS.Workbook();await generalReport.xlsx.load(Buffer.from(await (await request('management/reports/asistencia?format=xlsx',{cookie:leader.cookie,raw:true})).arrayBuffer()))
  assert.equal(reportTable(generalReport.worksheets[0]).header[4],'ID');assert.equal(reportTable(generalReport.worksheets[0]).header[5],'Discípulo')
  const noNames=new ExcelJS.Workbook();await noNames.xlsx.load(Buffer.from(await (await download(first,media.cookie)).arrayBuffer()))
  assert.ok(!JSON.stringify(noNames.worksheets[0].getSheetValues()).includes('Presente prueba'))
  await download(other,leader.cookie,'xlsx',404);await download(first,basic.cookie,'xlsx',403)
  const pdf=Buffer.from(await (await download(first,owner.cookie,'pdf')).arrayBuffer());assert.ok((await PDFDocument.load(pdf)).getPageCount()>=1)
  await writeFile('.secrets/attendance-event-test.pdf',pdf)
  const empty=await activity('Sin asistentes todavía',addDays(today,-6))
  const emptyReport=new ExcelJS.Workbook();await emptyReport.xlsx.load(Buffer.from(await (await download(empty)).arrayBuffer()))
  assert.equal(reportTable(emptyReport.worksheets[0]).count,0);assert.ok(emptyReport.getWorksheet('Evento').getColumn(2).values.includes('Sin asistentes todavía'))
  const allBlank=await activity('Todos sin marcar',addDays(today,-8))
  const allBlankRoster=await roster(allBlank)
  const allBlankSaved=await save(allBlank,allBlankRoster.version)
  assert.equal(allBlankSaved.data.absent,allBlankRoster.items.length)
  const canceled=await activity('Evento cancelado',addDays(today,-7))
  await db.execute("UPDATE actividad SET estado_actividad='cancelada' WHERE id_actividad=?",[canceled])
  await save(canceled,(await roster(canceled)).version,{},leader.cookie,409)
  for(let index=0;index<30;index++){const old=await activity(`Sesión del historial ${index}`,addDays(today,-200-index));await attend(old,personAbsent)}
  const profilePage1=(await request(profilePath,{cookie:leader.cookie})).data,profilePage2=(await request(profilePath+'?page=2',{cookie:leader.cookie})).data
  assert.equal(profilePage1.items.length,25);assert.equal(profilePage1.hasMore,true);assert.equal(profilePage2.items.length,8);assert.equal(profilePage2.hasMore,false)
  assert.equal(new Set([...profilePage1.items,...profilePage2.items].map(item=>item.id_asistencia)).size,33)
  const oldRows=Array.from({length:125},(_,i)=>['culto',`Histórico paginado ${i}`,addDays(today,-100-i),'09:00','Lugar',ownerId])
  const futureRows=Array.from({length:505},(_,i)=>['culto',`Futuro paginado ${i}`,addDays(today,100+i),'09:00','Lugar',ownerId])
  await db.query('INSERT INTO actividad(tipo_actividad,titulo,fecha,hora,lugar,id_usuario_creacion) VALUES ?',[oldRows.concat(futureRows)])
  const firstPage=(await request('management/activities?view=attendance&period=past&q=Histórico%20paginado',{cookie:owner.cookie})).data
  const nextPage=(await request('management/activities?view=attendance&period=past&page=2&q=Histórico%20paginado',{cookie:owner.cookie})).data
  assert.equal(firstPage.items.length,100);assert.equal(firstPage.hasMore,true);assert.equal(nextPage.items.length,25);assert.equal(nextPage.hasMore,false)
  assert.equal(new Set([...firstPage.items,...nextPage.items].map(item=>item.id_actividad)).size,125)
  assert.ok((await request('management/activities?view=attendance&period=past',{cookie:leader.cookie})).data.items.every(item=>item.id_grupo===gA.insertId))
  console.log('PASS automatic unmarked absences, explicit justification, preserved existing/archived records, future guard, atomic rollback, concurrent retry, profile history, scoped access, alerts/corrections, event-specific PDF/XLSX and paginated historical events.')

  if(process.argv.includes('--ui')) {
    const uiActivity=await activity('Encuentro para guardar UI',addDays(today,-2));await attend(uiActivity,personSaved);await attend(uiActivity,archived,'presente',1)
    const ui='http://127.0.0.1:5196';process.env.APP_ORIGINS=`${origin},${ui}`
    preview=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5196','--strictPort'],{windowsHide:true,stdio:'ignore'})
    for(let i=0;i<80;i++){try{if((await fetch(ui)).ok)break}catch{}await delay(150)}
    const {chromium}=await import('../.secrets/browser-tools/node_modules/playwright-core/index.mjs')
    browser=await chromium.launch({channel:'msedge',headless:true})
    const browserContext=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',reducedMotion:'reduce'})
    await browserContext.route('**/api/**',async route=>{const url=new URL(route.request().url());const response=await route.fetch({url:origin+url.pathname+url.search});await route.fulfill({response})})
    const page=await browserContext.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
    await page.goto(ui+'/#login');await page.getByLabel('Correo electrónico',{exact:true}).fill('owner@example.invalid');await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.locator('#dashboard-title').waitFor()
    await page.goto(ui+'/#gestion/falls/registro');await page.getByRole('button',{name:'Eventos anteriores',exact:true}).click()
    await page.getByLabel('Buscar evento para asistencia',{exact:true}).fill('Encuentro para guardar UI')
    await page.locator(`.attendance-picker select option[value="${uiActivity}"]`).waitFor({state:'attached'})
    await pickOption(page.getByRole('combobox',{name:'Actividad',exact:true}),String(uiActivity))
    await pickOption(page.getByRole('combobox',{name:'Asistencia de Presente prueba',exact:true}),'presente')
    await pickOption(page.getByRole('combobox',{name:'Asistencia de Justificado prueba',exact:true}),'justificado')
    assert.equal(await page.getByRole('combobox',{name:'Asistencia de Ausente prueba',exact:true}).innerText(),'Ausente sin justificación (sin marcar)')
    await page.getByRole('button',{name:'Guardar asistencia y registrar ausentes',exact:true}).click()
    await page.getByRole('status').filter({hasText:'Presentes: 1; justificados: 1; ausentes sin justificación: 1.'}).waitFor()
    const [uiStored]=await db.execute('SELECT id_miembro,estado_asistencia FROM asistencia WHERE id_actividad=? AND archivado=0 ORDER BY id_miembro',[uiActivity])
    assert.deepEqual(uiStored.map(row=>[row.id_miembro,row.estado_asistencia]),[[personA,'presente'],[personJ,'justificado'],[personAbsent,'ausente'],[personSaved,'presente']])
    for(const width of [1440,390,320]) {await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`checks/attendance-history-${width}.png`,fullPage:true})}
    const file=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar asistencia en PDF',exact:true}).click();assert.ok((await file).suggestedFilename().includes(String(uiActivity)))
    await page.goto(ui+'/#gestion/members');await page.getByRole('button',{name:'Ver ficha de Ausente prueba',exact:true}).click()
    const memberHistory=page.locator('.member-attendance')
    await memberHistory.getByText('Encuentro para guardar UI',{exact:true}).waitFor();assert.ok((await memberHistory.innerText()).includes('Ausente sin justificación'))
    for(const width of [1440,390,320]) {await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await memberHistory.screenshot({path:`checks/member-attendance-${width}.png`})}
    await memberHistory.getByRole('button',{name:'Ver más asistencias',exact:true}).click()
    await page.waitForFunction(()=>document.querySelectorAll('.member-attendance li').length===34)
    await memberHistory.getByRole('link',{name:'Ver asistencia del evento',exact:true}).first().click()
    await page.locator('.attendance-event').getByText('Encuentro para guardar UI',{exact:true}).waitFor()
    assert.deepEqual(errors,[])
    console.log('PASS UI previous events, unmarked absence save, explicit justification, PDF download, disciple profile history/deep link and 320-1440px layouts.')
  }
}finally {
  await browser?.close();if(preview){preview.kill();await once(preview,'exit')}
  if(server)await new Promise(resolve=>server.close(resolve))
  await pool?.end();await db.query(`DROP DATABASE IF EXISTS \`${database}\``);await db.end()
  console.log('Temporary attendance database removed; no production records changed.')
}
