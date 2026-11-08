import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {once} from 'node:events'
import {spawn} from 'node:child_process'
import {setTimeout as delay} from 'node:timers/promises'
import mysql from 'mysql2/promise'
import ExcelJS from 'exceljs'
import {applyMigrations} from '../server/migration-runner.js'
import {bogotaToday} from '../server/entities.js'
import {addDays} from '../server/date-ranges.js'
import {pickOption} from './select-helper.mjs'

const database=`calvario_tools_test_${randomUUID().replaceAll('-','')}`
// Set before importing anything which configures the connection pool.
process.env.DB_NAME=database
const {databaseConfig}=await import('../server/config.js')
assert.ok(['localhost','127.0.0.1','::1'].includes(databaseConfig.host),'Only a temporary local database is allowed.')
const {importColumns,spreadsheetRows,inspectSpreadsheet}=await import('../server/member-import.js')
const {database:ignored,...config}=databaseConfig
const db=await mysql.createConnection(config)
let server,pool,browser,preview
try {
  await db.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
  await db.query(`USE \`${database}\``);await applyMigrations(db)
  await db.query("SET time_zone = '+00:00'")
  pool=(await import('../server/db.js')).pool
  const {default:app}=await import('../server/app.js'),{bootstrapAdmin}=await import('../server/bootstrap-admin.js'),{hashPassword}=await import('../server/auth.js')
  const password=`Tools-${randomUUID()}`
  await bootstrapAdmin({name:'Propietario',email:'owner@example.invalid',password})
  server=app.listen(0,'127.0.0.1');await once(server,'listening')
  const origin=`http://127.0.0.1:${server.address().port}`;process.env.APP_ORIGINS=origin
  async function request(path,{body,cookie='',method=body===undefined?'GET':'POST',status=200,raw=false}={}) {
    const r=await fetch(`${origin}/api/${path}`,{method,headers:{Origin:origin,Cookie:cookie,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)})
    if(raw){assert.equal(r.status,status);return r}
    const data=await r.json();assert.equal(r.status,status,`${method} ${path}: ${JSON.stringify(data)}`)
    return {data,cookie:r.headers.get('set-cookie')?.split(';')[0]||cookie}
  }
  const owner=await request('auth/login',{body:{email:'owner@example.invalid',password}}),ownerId=owner.data.user.id,today=bogotaToday()
  const hash=await hashPassword(password)
  async function account(email,role,memberId=null){const [user]=await db.execute("INSERT INTO usuario(correo_login,password_hash,estado_usuario,id_miembro) VALUES (?,?,'activo',?)",[email,hash,memberId]);await db.execute('INSERT INTO usuario_rol(id_usuario,id_rol) SELECT ?,id_rol FROM rol_sistema WHERE nombre=?',[user.insertId,role]);return request('auth/login',{body:{email,password}})}
  async function member(name,number,groupId=null){const [m]=await db.execute("INSERT INTO miembro(nombres,tipo_identificacion,numero_identificacion,celular,fecha_nacimiento,codigo_qr,id_grupo,id_usuario_creacion,id_usuario_actualizacion) VALUES (?,'CC',?,'3001234567','1990-01-01',?,?,?,?)",[name,number,randomUUID(),groupId,ownerId,ownerId]);await db.execute("INSERT INTO historial_estado_miembro(id_miembro,estado,id_usuario) VALUES (?,'activo',?)",[m.insertId,ownerId]);return m.insertId}
  const leaderA=await member('Líder A','L-A'),leaderB=await member('Líder B','L-B')
  const [gA]=await db.execute("INSERT INTO grupo_comunion(codigo_grupo,nombre,id_discipulador) VALUES ('G-A','Grupo A',?)",[leaderA])
  const [gB]=await db.execute("INSERT INTO grupo_comunion(codigo_grupo,nombre,id_discipulador) VALUES ('G-B','Grupo B',?)",[leaderB])
  const personA=await member('Persona A','A-1',gA.insertId),personB=await member('Persona B','B-1',gB.insertId),otherA=await member('Otra persona A','A-2',gA.insertId)
  const discipleA=await account('disciple-a@example.invalid','Discipulador',leaderA),discipleB=await account('disciple-b@example.invalid','Discipulador',leaderB),basic=await account('basic@example.invalid','Usuario')
  const [readerRole]=await db.execute("INSERT INTO rol_sistema(nombre) VALUES ('Consulta de alertas')")
  for(const code of ['gestion.acceder','alertas.ver'])await db.execute("INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance) VALUES (?,?,'grupo')",[readerRole.insertId,code])
  const reader=await account('reader@example.invalid','Consulta de alertas',leaderB)
  const [book]=await db.execute("INSERT INTO libro_adiestramiento(nombre,id_usuario_creacion) VALUES ('Libro existente',?)",[ownerId])
  async function activity(name,days,groupId){const [a]=await db.execute("INSERT INTO actividad(tipo_actividad,titulo,fecha,hora,lugar,id_usuario_creacion) VALUES ('reunion_grupo',?,?,'09:00','Lugar de prueba',?)",[name,addDays(today,days),ownerId]);await db.execute('INSERT INTO reunion_grupo(id_actividad,id_grupo) VALUES (?,?)',[a.insertId,groupId]);return a.insertId}
  async function attend(activityId,memberId,state='ausente'){await db.execute('INSERT INTO asistencia(id_actividad,id_miembro,id_usuario_registro,estado_asistencia) VALUES (?,?,?,?)',[activityId,memberId,ownerId,state])}
  const a1=await activity('Reunión A anterior',-8,gA.insertId),a2=await activity('Reunión A reciente',-1,gA.insertId),b1=await activity('Reunión B anterior',-8,gB.insertId),b2=await activity('Reunión B reciente',-1,gB.insertId),older=await activity('Periodo anterior',-18,gA.insertId)
  await attend(a1,personA);await attend(a2,personA);await attend(b1,personB);await attend(b2,personB);await attend(a1,otherA,'presente');await attend(a1,null,'visitante');await attend(older,personA,'presente')
  await request('management/statistics',{cookie:owner.cookie,status:404})
  const permissionCatalog=(await request('management/permissions',{cookie:owner.cookie})).data
  assert.ok(!permissionCatalog.permissions.some(permission=>permission.codigo==='estadisticas.ver'))
  await db.execute("INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance) SELECT id_rol,'alertas.ver','grupo' FROM rol_sistema WHERE nombre='Discipulador'")
  await db.execute("INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance) SELECT id_rol,'seguimiento.gestionar','grupo' FROM rol_sistema WHERE nombre='Discipulador'")
  await request(`management/members/${personA}/state`,{cookie:owner.cookie,body:{estado_miembro:'inactivo'}})
  await request(`management/members/${personA}/state`,{cookie:owner.cookie,body:{estado_miembro:'activo'}})
  assert.equal((await db.execute('SELECT COUNT(*) AS total FROM historial_estado_miembro WHERE id_miembro=?',[personA]))[0][0].total,3)
  console.log('PASS removed statistics: route unavailable, permission hidden and member state history retained.')

  let cases=(await request('management/pastoral/cases',{cookie:owner.cookie})).data.items
  const caseA=cases.find(row=>row.id_miembro===personA),caseB=cases.find(row=>row.id_miembro===personB)
  assert.ok(caseA&&caseB)
  assert.equal((await request('management/pastoral/cases?q=Persona%20B',{cookie:owner.cookie})).data.items.length,1)
  assert.equal((await request('management/pastoral/cases?page=2',{cookie:owner.cookie})).data.items.length,0)
  await request('management/pastoral/cases?page=0',{cookie:owner.cookie,status:400})
  assert.equal((await request(`management/pastoral/cases/${caseB.id_alerta}`,{cookie:reader.cookie})).data.canManage,false)
  await request(`management/pastoral/cases/${caseB.id_alerta}`,{cookie:reader.cookie,method:'PATCH',body:{revision:0,estado:'pendiente'},status:403})
  const ownCases=(await request('management/pastoral/cases',{cookie:discipleA.cookie})).data.items
  assert.ok(ownCases.some(row=>row.id_alerta===caseA.id_alerta));assert.ok(!ownCases.some(row=>row.id_alerta===caseB.id_alerta))
  await request(`management/pastoral/cases/${caseB.id_alerta}`,{cookie:discipleA.cookie,status:404})
  const details=(await request(`management/pastoral/cases/${caseA.id_alerta}`,{cookie:discipleA.cookie})).data
  assert.ok(details.responsibles.some(user=>user.id===discipleA.data.user.id));assert.ok(!details.responsibles.some(user=>user.id===discipleB.data.user.id))
  const body={revision:0,estado:'en_seguimiento',id_responsable:discipleA.data.user.id,proximo_contacto:addDays(today,2),note:{tipo:'llamada',detalle:'Se acordó una visita de acompañamiento.',fecha:`${addDays(today,-1)}T12:00`}}
  await request(`management/pastoral/cases/${caseA.id_alerta}`,{cookie:discipleA.cookie,method:'PATCH',body:{...body,id_responsable:discipleB.data.user.id},status:400})
  await request(`management/pastoral/cases/${caseA.id_alerta}`,{cookie:discipleA.cookie,method:'PATCH',body:{...body,estado:'atendido',note:undefined},status:400})
  await request(`management/pastoral/cases/${caseA.id_alerta}`,{cookie:discipleA.cookie,method:'PATCH',body})
  await request(`management/pastoral/cases/${caseA.id_alerta}`,{cookie:discipleA.cookie,method:'PATCH',body,status:409})
  await request(`management/pastoral/cases/${caseA.id_alerta}`,{cookie:discipleA.cookie,method:'PATCH',body:{...body,revision:1,estado:'atendido',note:undefined}})
  await db.execute("UPDATE asistencia SET estado_asistencia='presente' WHERE id_actividad=? AND id_miembro=?",[a2,personA])
  cases=(await request('management/pastoral/cases?state=atendido',{cookie:owner.cookie})).data.items
  assert.equal(cases.find(row=>row.id_alerta===caseA.id_alerta).vigente,0)
  assert.equal((await request(`management/pastoral/cases/${caseA.id_alerta}`,{cookie:discipleA.cookie})).data.notes.length,1)
  console.log('PASS pastoral: assigned responsible must see the member, group privacy, contact history, optimistic concurrency, closure evidence and retained resolved alerts.')

  const fixed=(await request('management/activities',{cookie:owner.cookie,status:201,body:{tipo_actividad:'culto',titulo:'Culto del calendario',fixed:true,hora:'09:00',lugar:'Templo',estado_actividad:'programada',publicado:1,recurrence:{dayOfWeek:0}}})).data
  const publicQuery=new URLSearchParams({from:today,to:addDays(today,35)})
  let calendar=(await request(`public/calendar?${publicQuery}`)).data.items
  assert.ok(calendar.filter(row=>row.id_serie===fixed.seriesId).length>=4,'The calendar must include all dates, unlike nearest-event cards.')
  await request(`public/calendar?from=${addDays(today,140)}&to=${addDays(today,161)}`)
  const [generated]=await db.execute('SELECT CAST(fecha_programada AS CHAR) AS day FROM actividad_repetida WHERE id_serie=? ORDER BY fecha_programada',[fixed.seriesId])
  for(let i=1;i<generated.length;i++)assert.equal(Date.parse(generated[i].day)-Date.parse(generated[i-1].day),7*86400000,'Future navigation must not leave gaps.')
  await request('management/activities',{cookie:owner.cookie,status:201,body:{tipo_actividad:'evento',titulo:'Encuentro visual',fecha:today,hora:'23:59',lugar:'Templo',estado_actividad:'programada',publicado:1}})
  await request('management/activities',{cookie:owner.cookie,status:201,body:{tipo_actividad:'evento',titulo:'Evento privado invisible',fecha:today,hora:'23:59',lugar:'Privado',estado_actividad:'programada'}})
  calendar=(await request(`public/calendar?${publicQuery}`)).data.items
  assert.ok(!JSON.stringify(calendar).includes('Evento privado invisible'))
  const groupCalendar=(await request(`management/activities/calendar?from=${addDays(today,-9)}&to=${today}`,{cookie:discipleA.cookie})).data.items
  assert.ok(groupCalendar.some(row=>row.id_actividad===a1));assert.ok(!groupCalendar.some(row=>row.id_actividad===b1))
  await request(`public/calendar?from=${today}&to=${addDays(today,400)}`,{status:400})
  console.log('PASS calendar: public/private separation, complete weekly occurrences, future generation without gaps and scoped private meetings.')

  const template=await request('management/members/import/template',{cookie:owner.cookie,raw:true})
  const sample=new ExcelJS.Workbook();await sample.xlsx.load(Buffer.from(await template.arrayBuffer()))
  assert.equal(sample.getWorksheet('Discipulos').getRow(1).cellCount,8)
  const data={nombres:'Importado con ceros',apellidos:'Prueba',tipo_identificacion:'CC',numero_identificacion:'00001',celular:'03001234567',correo:'import@example.invalid',fecha_nacimiento:'1990-01-01',codigo_grupo:'G-A'}
  const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Discipulos')
  sheet.columns=Object.entries(importColumns).map(([key,label])=>({key,header:label,width:24}))
  sheet.addRow(data);sheet.addRow({...data,numero_identificacion:'A-1'});sheet.addRow({...data,nombres:'Duplicado en el archivo'});sheet.addRow({...data,numero_identificacion:'ERROR',celular:'123',fecha_nacimiento:'2099-01-01'});sheet.addRow({...data,numero_identificacion:'FORMULA',apellidos:{formula:'1+1'}})
  const file=Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64')
  const initialPreview=(await request('management/members/import/preview',{cookie:owner.cookie,body:{file,bookId:book.insertId}})).data
  assert.equal(initialPreview.valid,1);assert.equal(initialPreview.rows[0].data.numero_identificacion,'00001');assert.equal(initialPreview.rows[0].data.celular,'03001234567')
  assert.ok(initialPreview.rows[1].errors.numero_identificacion);assert.ok(initialPreview.rows[2].errors.numero_identificacion);assert.ok(initialPreview.rows[3].errors.celular&&initialPreview.rows[3].errors.fecha_nacimiento);assert.ok(initialPreview.rows[4].errors.apellidos)
  assert.throws(()=>inspectSpreadsheet(Buffer.alloc(513*1024)),{status:400})
  await assert.rejects(()=>spreadsheetRows(Buffer.from('not a zip').toString('base64')),{status:400})
  const forbidden=(await request('management/members/import/preview',{cookie:discipleA.cookie,body:{bookId:book.insertId,rows:[{...data,codigo_grupo:'G-B'}]}})).data
  assert.ok(forbidden.rows[0].errors.codigo_grupo)
  await request('management/members/import/preview',{cookie:basic.cookie,body:{bookId:book.insertId,rows:[data]},status:403})
  const before=(await db.execute('SELECT COUNT(*) AS total FROM miembro'))[0][0].total
  await request('management/members/import/commit',{cookie:owner.cookie,status:400,body:{bookId:book.insertId,rows:[data,{...data,numero_identificacion:'A-1'}]}})
  assert.equal((await db.execute('SELECT COUNT(*) AS total FROM miembro'))[0][0].total,before)
  await request('management/members/import/commit',{cookie:owner.cookie,status:201,body:{bookId:book.insertId,rows:[{...data,password:'ignored',id_rol_eclesiastico:1}]}})
  const [imported]=await db.execute("SELECT * FROM miembro WHERE numero_identificacion='00001'")
  assert.equal(imported[0].id_grupo,gA.insertId);assert.equal(imported[0].id_libro,book.insertId);assert.equal(imported[0].id_rol_eclesiastico,null)
  assert.equal((await db.execute('SELECT COUNT(*) AS total FROM usuario'))[0][0].total,5,'Import must never create access accounts.')
  await request('management/members/import/commit',{cookie:owner.cookie,status:400,body:{bookId:book.insertId,rows:[data]}})
  await db.execute('DELETE FROM limite_solicitud')
  await db.query('CREATE TRIGGER fail_import_history BEFORE INSERT ON historial_estado_miembro FOR EACH ROW SET NEW.estado=NULL')
  await request('management/members/import/commit',{cookie:owner.cookie,status:503,body:{bookId:book.insertId,rows:[{...data,numero_identificacion:'ROLLBACK'}]}})
  assert.equal((await db.execute("SELECT COUNT(*) AS total FROM miembro WHERE numero_identificacion='ROLLBACK'"))[0][0].total,0)
  await db.query('DROP TRIGGER fail_import_history')
  const racing={bookId:book.insertId,rows:[{...data,numero_identificacion:'RACE'}]}
  const responses=await Promise.all([0,1].map(()=>fetch(`${origin}/api/management/members/import/commit`,{method:'POST',headers:{Origin:origin,Cookie:owner.cookie,'Content-Type':'application/json'},body:JSON.stringify(racing)})))
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,400])
  console.log('PASS import: real XLSX/template, zero preservation, formulas/size limits, field errors, duplicate detection, group boundaries, all-or-nothing rollback, race protection and no accounts/emails.')

  if(process.argv.includes('--ui')) {
    const ui='http://127.0.0.1:5198';process.env.APP_ORIGINS=`${origin},${ui}`
    preview=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5198','--strictPort'],{windowsHide:true,stdio:'ignore'})
    for(let i=0;i<80;i++){try{if((await fetch(ui)).ok)break}catch{}await delay(150)}
    const {chromium}=await import('../.secrets/browser-tools/node_modules/playwright-core/index.mjs')
    browser=await chromium.launch({channel:'msedge',headless:true})
    const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',reducedMotion:'reduce'})
    await context.route('**/api/**',async route=>{const url=new URL(route.request().url());const response=await route.fetch({url:origin+url.pathname+url.search});await route.fulfill({response})})
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
    await page.goto(ui+'/#login');await page.getByLabel('Correo electrónico',{exact:true}).fill('owner@example.invalid');await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.locator('#dashboard-title').waitFor()
    assert.equal(await page.locator('.panel-nav').getByText('Estadísticas',{exact:true}).count(),0)
    await page.waitForFunction(()=>document.querySelector('.admin-workspace')?.getAttribute('data-navigation-open')==='true')
    assert.equal(await page.locator('.panel-sidebar').evaluate(node=>getComputedStyle(node).position),'fixed')
    const initialSidebar=await page.locator('.panel-sidebar').boundingBox()
    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));assert.equal((await page.locator('.panel-sidebar').boundingBox()).y,initialSidebar.y)
    await page.getByRole('button',{name:'Encoger menú lateral',exact:true}).click()
    await page.waitForFunction(()=>document.querySelector('.admin-workspace')?.getAttribute('data-navigation-compact')==='true')
    assert.ok((await page.locator('.panel-sidebar').boundingBox()).width<initialSidebar.width)
    await page.goto(ui+'/#usuarios');await page.getByRole('heading',{name:'Administración de cuentas',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('.admin-workspace')?.getAttribute('data-navigation-compact')==='true')
    await page.reload();await page.getByRole('heading',{name:'Administración de cuentas',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('.admin-workspace')?.getAttribute('data-navigation-compact')==='true')
    await page.getByRole('button',{name:'Expandir menú lateral',exact:true}).click();await page.goto(ui+'/#gestion');await page.locator('#dashboard-title').waitFor();await page.waitForFunction(()=>document.querySelector('.admin-workspace')?.getAttribute('data-navigation-open')==='true')
    await page.goto(ui+'/#gestion/falls/alertas');await page.getByRole('button').filter({hasText:'Persona B'}).click();await page.getByLabel('Registrar una llamada, visita o nota').check();await page.getByLabel('Resultado y observaciones').fill('Visita registrada desde el navegador.');await page.getByRole('button',{name:'Guardar seguimiento',exact:true}).click();await page.getByRole('status').filter({hasText:'Seguimiento guardado.'}).waitFor();await page.getByText('Visita registrada desde el navegador.',{exact:true}).waitFor()
    await page.goto(ui+'/#gestion/activities');await page.getByRole('button',{name:'Calendario',exact:true}).click();await page.locator('.calendar-event').filter({hasText:'Encuentro visual'}).click();await page.getByRole('heading',{name:'Encuentro visual',exact:true}).waitFor()
    await page.goto(ui+'/#gestion/members');await page.getByRole('button',{name:'Registrar discípulo',exact:true}).click();await page.getByRole('button',{name:/Continuar/}).click();await page.locator('.form-error-summary').waitFor();assert.equal(await page.locator('.form-error-summary').evaluate(node=>node===document.activeElement),true)
    await page.locator('.form-error-summary a').first().click();assert.equal(await page.locator('input[name=nombres]').evaluate(node=>node===document.activeElement),true)
    await page.getByLabel('Nombres *',{exact:true}).fill('Validación en servidor');await pickOption(page.getByRole('combobox',{name:'Tipo de identificación *',exact:true}),{label:'Cédula de ciudadanía'});await page.getByLabel('Número de identificación *',{exact:true}).fill('NOT-SAVED');await page.getByLabel('Celular *',{exact:true}).fill('123');await page.getByLabel('Fecha de nacimiento / cumpleaños *',{exact:true}).fill('1990-01-01');await page.getByRole('button',{name:/Continuar/}).click();await pickOption(page.getByRole('combobox',{name:/Libro de adiestramiento/}),{label:'Libro existente'});await page.getByRole('button',{name:/Continuar/}).click();await page.getByRole('button',{name:'Guardar discípulo',exact:true}).click();await page.locator('input[name=celular][aria-invalid=true]').waitFor();assert.equal(await page.locator('input[name=celular]').inputValue(),'123')
    await page.getByRole('button',{name:'Cancelar',exact:true}).click();await page.getByRole('button',{name:'Importar desde Excel',exact:true}).click()
    await pickOption(page.getByRole('combobox',{name:'Libro para las fichas importadas',exact:true}),{label:'Libro existente'})
    const browserBook=new ExcelJS.Workbook(),browserSheet=browserBook.addWorksheet('Discipulos');browserSheet.columns=Object.entries(importColumns).map(([key,label])=>({key,header:label}));browserSheet.addRow({...data,nombres:'Importado desde navegador',numero_identificacion:'UI-001'});browserSheet.addRow({...data,nombres:'Fila para corregir',numero_identificacion:'UI-002',celular:'123'})
    await page.locator('input[type=file]').setInputFiles({name:'discipulos.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await browserBook.xlsx.writeBuffer())})
    await page.getByRole('button',{name:'Revisar archivo',exact:true}).click();await page.getByRole('button',{name:'Corregir fila 3',exact:true}).click();await page.locator('.import-editor').getByLabel('Celular *',{exact:true}).fill('3001112233');await page.getByRole('button',{name:'Guardar corrección y validar',exact:true}).click();await page.getByText('2 filas · 2 válidas · 0 con errores.',{exact:false}).waitFor()
    for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`checks/tools-import-${width}.png`,fullPage:true})}
    await page.getByLabel('Revisé las filas seleccionadas y confirmo la creación de sus fichas.').check();await page.getByRole('button',{name:'Importar 2 discípulos',exact:true}).click();await page.getByRole('status').filter({hasText:'2 discípulos importados.'}).waitFor()
    for(const [path,ready,name] of [['#gestion','.dashboard-home','dashboard'],['#gestion/falls/alertas','.pastoral-case','pastoral'],['#gestion/members','.record-create','members']]) {
      await page.goto(ui+'/'+path);await page.locator(ready).first().waitFor()
      if(name==='pastoral'){await page.getByRole('button').filter({hasText:'Persona B'}).click();await page.getByRole('button',{name:'Guardar seguimiento',exact:true}).waitFor()}
      for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} at ${width}`);if([1440,390,320].includes(width))await page.screenshot({path:`checks/tools-${name}-${width}.png`,fullPage:true})}
    }
    await page.goto(ui+'/#gestion/activities');await page.getByRole('button',{name:'Calendario',exact:true}).click();await page.locator('.calendar-grid').waitFor()
    for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`checks/tools-calendar-${width}.png`,fullPage:true})}
    await page.getByRole('button',{name:'Semana',exact:true}).click();assert.equal(await page.locator('.calendar-day').count(),7)
    await page.goto(ui+'/#eventos');await page.getByRole('button',{name:'Ver calendario de encuentros',exact:true}).click();await page.locator('.public-calendar').waitFor();assert.equal(await page.locator('.public-calendar').getByText('Evento privado invisible',{exact:true}).count(),0)
    assert.deepEqual(errors,[])
    console.log('PASS UI: fixed expanded desktop sidebar, optional compact mode/persistence, statistics removed, contacts, calendar, field validation, Excel and 320-1440px layouts.')
  }
  await request(`auth/admin/users/${discipleA.data.user.id}`,{cookie:owner.cookie,method:'DELETE',body:{action:'delete',expectedEmail:discipleA.data.user.email,expectedState:'activo'}})
  const retained=(await request(`management/pastoral/cases/${caseA.id_alerta}`,{cookie:owner.cookie})).data
  assert.equal(retained.notes[0].autor,'Cuenta eliminada');assert.equal(retained.notes.length,1);assert.equal(retained.case.id_responsable,null)
  const [historyBefore]=await db.execute('SELECT COUNT(*) AS total FROM historial_estado_miembro');await applyMigrations(db);await applyMigrations(db);assert.equal((await db.execute('SELECT COUNT(*) AS total FROM historial_estado_miembro'))[0][0].total,historyBefore[0].total)
} finally {
  await browser?.close();if(preview){preview.kill();await once(preview,'exit')}
  if(server)await new Promise(resolve=>server.close(resolve))
  await pool?.end();await db.query(`DROP DATABASE IF EXISTS \`${database}\``);await db.end()
  console.log('Temporary database removed; no production data or real emails used.')
}
