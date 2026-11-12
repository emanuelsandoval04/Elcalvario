import { pickOption } from './select-helper.mjs'
import assert from 'node:assert/strict'
import { applyMigrations } from '../server/migration-runner.js'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import mysql from 'mysql2/promise'
import express from 'express'

const testDatabase = `calvario_test_${randomUUID().replaceAll('-', '')}`
assert.match(testDatabase, /^calvario_test_[a-f0-9]{32}$/)
process.env.DB_NAME = testDatabase
const { databaseConfig } = await import('../server/config.js')
const { database, ...connectionConfig } = databaseConfig
const connection = await mysql.createConnection(connectionConfig)
let pool, server, browser
const accounts=[]
try {
 await connection.query(`CREATE DATABASE \`${testDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
 await connection.query(`USE \`${testDatabase}\``)
 await applyMigrations(connection)
 pool=(await import('../server/db.js')).pool
 const {authRouter}=await import('../server/auth.js')
 const app=express()
 app.use(express.json())
 app.use('/api/auth',authRouter)
 const {managementRouter}=await import('../server/management.js')
 app.use('/api/management',managementRouter)
 server=app.listen(0,'127.0.0.1')
 await new Promise(resolve=>server.once('listening',resolve))
 const base=`http://127.0.0.1:${server.address().port}`
 const uiOrigin=process.env.UI_ORIGIN || 'http://127.0.0.1:5173'
 process.env.APP_ORIGINS=`${base},${uiOrigin}`
 const password=`Check-${randomUUID()}`
 async function api(path,body,cookie=''){
  const response=await fetch(`${base}/api/auth/${path}`,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined})
  const data=await response.json()
  return {status:response.status,data,cookie:response.headers.get('set-cookie')?.split(';')[0]}
 }
 assert.equal((await api('register',{email:'weak@example.invalid',password:'weak'})).status,400)
 await pool.execute("UPDATE rol_sistema SET estado=0 WHERE nombre='Administrador'")
 assert.equal((await api('register',{email:'failed@example.invalid',password})).status,503)
 const [initial]=await pool.execute('SELECT bootstrap_completado FROM configuracion_sistema WHERE id=1')
 assert.equal(initial[0].bootstrap_completado,0)
 const [empty]=await pool.execute('SELECT COUNT(*) AS total FROM usuario')
 assert.equal(empty[0].total,0)
 await pool.execute("UPDATE rol_sistema SET estado=1 WHERE nombre='Administrador'")
 const firstTwo=await Promise.all(['first','second'].map(name=>api('register',{email:`${name}@example.invalid`,password,role:'Administrador'})))
 firstTwo.forEach(result=>assert.equal(result.status,201))
 accounts.push(...firstTwo.map(result=>result.data.user.id))
 const admin=firstTwo.find(result=>result.data.user.roles.includes('Administrador'))
 const basic=firstTwo.find(result=>result.data.user.state==='pendiente')
 assert.ok(admin && basic)
 assert.equal(admin.data.user.state,'activo')
 assert.deepEqual(basic.data.user.roles,[])
 assert.deepEqual(basic.data.user.permissions,{})
 assert.equal((await api('login',{email:basic.data.user.email,password})).data.user.state,'pendiente')
 assert.equal((await api('me',undefined,basic.cookie)).data.user.state,'pendiente')
 const [pendingAssignments]=await pool.execute('SELECT * FROM usuario_rol WHERE id_usuario=?',[basic.data.user.id])
 assert.equal(pendingAssignments.length,0)
 assert.equal(firstTwo.filter(result=>result.data.user.roles.includes('Administrador')).length,1)
 const catalog=await api('admin/users',undefined,admin.cookie)
 assert.equal(catalog.status,200)
 const superRole=catalog.data.roles.find(role=>role.name==='Administrador').id
 const basicRole=catalog.data.roles.find(role=>role.name==='Usuario').id
 assert.equal((await api('admin/users')).status,401)
 assert.equal((await api('admin/users',undefined,basic.cookie)).status,403)
 assert.equal((await fetch(`${base}/api/management/dashboard`,{headers:{Cookie:basic.cookie}})).status,403)
 assert.equal((await api(`admin/users/${basic.data.user.id}/role`,{roleId:superRole},basic.cookie)).status,403)
 assert.equal((await api(`admin/users/${admin.data.user.id}/role`,{roleId:basicRole},admin.cookie)).status,409)
 assert.equal((await api(`admin/users/${basic.data.user.id}/role`,{roleId:99999},admin.cookie)).status,404)
 assert.equal((await api('me',undefined,basic.cookie)).data.user.state,'pendiente')
 assert.equal((await api(`admin/users/${basic.data.user.id}/role`,{roleId:superRole},admin.cookie)).status,200)
 assert.equal((await api('me',undefined,basic.cookie)).data.user.state,'activo')
 assert.equal((await api('admin/users',undefined,basic.cookie)).status,200)
 assert.equal((await api(`admin/users/${basic.data.user.id}/role`,{roleId:basicRole},admin.cookie)).status,200)
 assert.equal((await api('admin/users',undefined,basic.cookie)).status,403)
 const third=await api('register',{email:'third@example.invalid',password,role:'Administrador'})
 assert.equal(third.status,201)
 assert.equal(third.data.user.state,'pendiente')
 assert.deepEqual(third.data.user.roles,[])
 accounts.push(third.data.user.id)
 const duplicate=await api('register',{email:admin.data.user.email,password})
 assert.equal(duplicate.status,409)
 console.log('PASS API: initial-admin rollback/concurrency, pending registration/login, no automatic role, role injection rejected, atomic activation, protected self-role and live revocation')

 const require=createRequire(import.meta.url)
 const {chromium}=require(process.env.TEMP+'/nexusbox-browser-check/node_modules/playwright')
 browser=await chromium.launch({headless:true,channel:'msedge'})
 const context=await browser.newContext({viewport:{width:1440,height:900}})
 const page=await context.newPage()
 const errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url())
  const response=await route.fetch({url:`${base}${url.pathname}`})
  await route.fulfill({response})
 })
 await page.goto(`${uiOrigin}/#login`,{waitUntil:'domcontentloaded'})
 await page.getByLabel('Correo electrónico',{exact:true}).fill(admin.data.user.email)
 await page.getByLabel('Contraseña',{exact:true}).fill(password)
 await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click()
 await page.waitForURL(`${uiOrigin}/#gestion`)
 await page.locator('#dashboard-title').waitFor()
 assert.equal(await page.locator('.site-header').count(),0)
 await page.getByRole('link',{name:'Usuarios, roles y permisos',exact:true}).click()
 await page.getByRole('heading',{name:'Usuarios, roles y permisos'}).waitFor()
 const row=page.locator('.admin-user-row').filter({hasText:basic.data.user.email})
 await pickOption(row.getByRole('combobox',{name:`Rol de ${basic.data.user.email}`}), String(superRole))
 await row.getByRole('button',{name:'Guardar',exact:true}).click()
 await page.getByRole('status').filter({hasText:'Rol actualizado'}).waitFor()
 assert.equal((await api('admin/users',undefined,basic.cookie)).status,200)
 const ownRow=page.locator('.admin-user-row').filter({hasText:admin.data.user.email})
 assert.equal(await ownRow.getByRole('combobox',{name:`Rol de ${admin.data.user.email}`}).isDisabled(),true)

 const mobileContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2})
 const mobilePage=await mobileContext.newPage()
 mobilePage.on('pageerror',error=>errors.push(error.message))
 await mobileContext.route('**/api/**',async route=>{
  const url=new URL(route.request().url())
  const response=await route.fetch({url:`${base}${url.pathname}${url.search}`})
  await route.fulfill({response})
 })
 await mobilePage.goto(`${uiOrigin}/#registro`,{waitUntil:'domcontentloaded'})
 await mobilePage.getByLabel('Correo electrónico',{exact:true}).fill('mobile-registration@example.invalid')
 await mobilePage.getByLabel('Contraseña',{exact:true}).fill(password)
 await mobilePage.getByLabel('Confirmar contraseña',{exact:true}).fill(password)
 await mobilePage.getByRole('button',{name:'Crear cuenta',exact:true}).tap()
 await mobilePage.waitForURL(`${uiOrigin}/#gestion`)
 await mobilePage.getByRole('heading',{name:'Tu cuenta está pendiente por activación.',exact:true}).waitFor()
 assert.equal(await mobilePage.locator('.site-header').count(),0)
 assert.equal(await mobilePage.getByRole('link',{name:'Entrar a gestión',exact:true}).count(),0)
 await mobilePage.screenshot({path:'checks/pending-account-mobile.png',fullPage:true})
 await mobilePage.reload({waitUntil:'domcontentloaded'})
 await mobilePage.getByRole('heading',{name:'Tu cuenta está pendiente por activación.',exact:true}).waitFor()
 assert.equal(await mobilePage.locator('.panel-nav [data-panel-item]').count(),0)
 await mobilePage.getByRole('button',{name:'Consultar activación',exact:true}).tap()
 await mobilePage.getByText('Tu cuenta sigue pendiente por activación.',{exact:true}).waitFor()
 await mobilePage.getByRole('button',{name:'Cerrar sesión',exact:true}).tap()
 await mobilePage.waitForURL(`${uiOrigin}/#login`)
 await mobilePage.getByLabel('Correo electrónico',{exact:true}).fill('mobile-registration@example.invalid')
 await mobilePage.getByLabel('Contraseña',{exact:true}).fill('incorrect-password')
 await mobilePage.getByRole('button',{name:'Iniciar sesión',exact:true}).tap()
 await mobilePage.getByText('Correo o contraseña incorrectos.',{exact:true}).waitFor()
 assert.equal(new URL(mobilePage.url()).hash,'#login')
 await mobilePage.getByLabel('Contraseña',{exact:true}).fill(password)
 await mobilePage.getByRole('button',{name:'Iniciar sesión',exact:true}).tap()
 await mobilePage.waitForURL(`${uiOrigin}/#gestion`)
 await mobilePage.getByRole('heading',{name:'Tu cuenta está pendiente por activación.',exact:true}).waitFor()
 await mobilePage.goto(`${uiOrigin}/#gestion/members`,{waitUntil:'domcontentloaded'})
 await mobilePage.getByRole('heading',{name:'Tu cuenta está pendiente por activación.',exact:true}).waitFor()
 assert.equal(await mobilePage.locator('.panel-nav [data-panel-item]').count(),0)
 await mobilePage.goto(`${uiOrigin}/#usuarios`,{waitUntil:'domcontentloaded'})
 await mobilePage.getByText('Solo los administradores y cargos pastorales autorizados pueden habilitar cuentas',{exact:false}).waitFor()
 assert.equal(await mobilePage.locator('.admin-user-row').count(),0)
 await mobilePage.goto(`${uiOrigin}/#gestion`,{waitUntil:'domcontentloaded'})
 await mobilePage.getByRole('heading',{name:'Tu cuenta está pendiente por activación.',exact:true}).waitFor()
 const mobileAccount=(await api('admin/users',undefined,admin.cookie)).data.users.find(user=>user.email==='mobile-registration@example.invalid')
 accounts.push(mobileAccount.id)
 const mobileCookie=(await mobileContext.cookies()).find(cookie=>cookie.name==='calvario_session')
 const cookieHeader=`calvario_session=${mobileCookie.value}`
 await page.getByRole('button',{name:'Actualizar usuarios',exact:true}).click()
 const pendingRow=page.locator('.admin-user-row').filter({hasText:mobileAccount.email})
 assert.equal(await pendingRow.getByRole('button',{name:'Habilitar cuenta',exact:true}).isDisabled(),true)
 const mediaRole=catalog.data.roles.find(role=>role.name==='Multimedia').id
 await pickOption(pendingRow.getByRole('combobox',{name:`Rol de ${mobileAccount.email}`}), String(mediaRole))
 await pendingRow.getByRole('button',{name:'Habilitar cuenta',exact:true}).click()
 await page.getByRole('status').filter({hasText:'Cuenta habilitada'}).waitFor()
 assert.equal((await api('me',undefined,cookieHeader)).data.user.state,'activo')
 await mobilePage.getByRole('button',{name:'Consultar activación',exact:true}).tap()
 await mobilePage.locator('.manage-session').filter({hasText:'Multimedia'}).waitFor({state:'attached'})
 const expectedMenus={
  Administrador:['Inicio','Discípulos','Grupos de Comunión','Eventos y Cultos','Asistencia','Reportes','Usuarios, roles y permisos'],
  Pastor:['Inicio','Discípulos','Grupos de Comunión','Eventos y Cultos','Asistencia','Reportes'],
  'Asistencia Pastoral':['Inicio','Discípulos','Grupos de Comunión','Eventos y Cultos','Asistencia','Reportes','Usuarios, roles y permisos'],
  Discipulador:['Inicio','Discípulos','Grupos de Comunión','Eventos y Cultos','Asistencia','Reportes'],
  Multimedia:['Inicio','Discípulos','Grupos de Comunión','Eventos y Cultos','Asistencia','Reportes'],
 }
 async function openMobileMenu(){
  await mobilePage.getByRole('button',{name:'Más opciones',exact:true}).tap()
  await mobilePage.waitForFunction(()=>{
   const drawer=document.querySelector('#panel-navigation')
   return !drawer.inert && Math.abs(drawer.getBoundingClientRect().left-12)<1 && getComputedStyle(drawer).visibility==='visible'
  })
 }
 for(const name of ['Multimedia','Discipulador','Asistencia Pastoral','Pastor','Administrador']){
  const roleId=catalog.data.roles.find(role=>role.name===name).id
  assert.equal((await api(`admin/users/${mobileAccount.id}/role`,{roleId},admin.cookie)).status,200)
  await mobilePage.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await mobilePage.waitForFunction(role=>document.querySelector('.manage-session > span:nth-child(2)')?.textContent===role,name)
  assert.deepEqual(await mobilePage.locator('.panel-nav [data-panel-item] > span:not(.panel-click-wave)').allTextContents(),expectedMenus[name],name)
  await openMobileMenu()
  await mobilePage.getByRole('button',{name:'Eventos y Cultos',exact:true}).tap()
  await mobilePage.getByRole('heading',{name:'Eventos y Cultos',exact:true}).waitFor()
  assert.equal(await mobilePage.getByRole('button',{name:'Más opciones',exact:true}).getAttribute('aria-expanded'),'false')
  assert.equal(await mobilePage.locator('.manage-message').textContent(),'')
  await openMobileMenu()
  await mobilePage.getByRole('button',{name:'Asistencia',exact:true}).tap()
  await mobilePage.getByRole('heading',{name:'Asistencia',exact:true}).waitFor()
  assert.equal(await mobilePage.locator('.falls-tabs a[href$="/alertas"]').count(),['Asistencia Pastoral','Pastor','Administrador'].includes(name)?1:0,'Las alertas conservan sus permisos propios')
  assert.equal(await mobilePage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 }
 // Navigate to users from the drawer, then use the same permitted module menu there.
 await openMobileMenu()
 await mobilePage.getByRole('link',{name:'Usuarios, roles y permisos',exact:true}).tap()
 await mobilePage.getByRole('button',{name:'Actualizar usuarios',exact:true}).waitFor()
 assert.deepEqual(await mobilePage.locator('.panel-nav [data-panel-item] > span:not(.panel-click-wave)').allTextContents(),expectedMenus.Administrador)
 await openMobileMenu()
 await mobilePage.getByRole('link',{name:'Grupos de Comunión',exact:true}).tap()
 await mobilePage.getByRole('heading',{name:'Grupos de Comunión',exact:true}).waitFor()
 // Repeated touch toggles, close control, backdrop and rotation/resizing.
 for(const width of [320,390,844,1024,390]){
  await mobilePage.setViewportSize({width,height:844})
  if(width>900){
   await mobilePage.waitForFunction(()=>parseFloat(getComputedStyle(document.querySelector('.admin-workspace')).getPropertyValue('--panel-nav-width'))>247)
   continue
  }
  await mobilePage.waitForFunction(()=>document.querySelector('.admin-workspace').dataset.navigationOpen==='false')
  for(let repeat=0;repeat<2;repeat++){
   await openMobileMenu()
   await mobilePage.getByRole('button',{name:'Cerrar menú',exact:true}).tap()
  }
  await openMobileMenu()
  await mobilePage.screenshot({path:`checks/role-menu-mobile-${width}.png`,fullPage:false})
  await mobilePage.locator('.panel-backdrop').tap({position:{x:width-5,y:180}})
  assert.equal(await mobilePage.getByRole('button',{name:'Más opciones',exact:true}).getAttribute('aria-expanded'),'false')
 }
 // Check granular permissions independently of the default role configuration.
 assert.equal((await api(`admin/users/${mobileAccount.id}/role`,{roleId:mediaRole},admin.cookie)).status,200)
 async function mediaPermissions(codes){
  const response=await fetch(`${base}/api/management/permissions/${mediaRole}`,{method:'PUT',headers:{'Content-Type':'application/json',Cookie:admin.cookie},body:JSON.stringify({grants:codes.map(codigo=>({codigo,alcance:'todos'}))})})
  assert.equal(response.status,200)
  await mobilePage.evaluate(()=>window.dispatchEvent(new Event('focus')))
 }
 await mediaPermissions(['gestion.acceder','alertas.ver'])
 await mobilePage.waitForFunction(()=>document.querySelectorAll('.panel-nav [data-panel-item]').length===2)
 await mobilePage.goto(`${uiOrigin}/#gestion/falls/registro`,{waitUntil:'domcontentloaded'})
 await mobilePage.getByRole('heading',{name:'Alertas pastorales',exact:true}).waitFor()
 assert.equal(await mobilePage.locator('.falls-tabs a[href$="/registro"]').count(),0,'Una cuenta de alertas no obtiene registro de asistencia por compartir el módulo')
 await mobilePage.goto(`${uiOrigin}/#gestion`,{waitUntil:'domcontentloaded'})
 await mobilePage.locator('.dashboard-shortcuts').waitFor()
 assert.equal(await mobilePage.locator('.dashboard-shortcuts a').count(),1)
 assert.equal(await mobilePage.locator('.dashboard-shortcuts button:disabled').count(),5)
 await mediaPermissions(['gestion.acceder','asistencia.ver'])
 await mobilePage.waitForFunction(()=>document.querySelectorAll('.panel-nav [data-panel-item]').length===3)
 assert.deepEqual(await mobilePage.locator('.panel-nav [data-panel-item] > span:not(.panel-click-wave)').allTextContents(),['Inicio','Eventos y Cultos','Asistencia'])
 await openMobileMenu()
 await mobilePage.getByRole('button',{name:'Eventos y Cultos',exact:true}).tap()
 await mobilePage.getByRole('heading',{name:'Eventos y Cultos',exact:true}).waitFor()
 assert.equal(await mobilePage.getByRole('button',{name:'Nuevo evento',exact:true}).count(),0)
 assert.equal(await mobilePage.locator('.manage-message').textContent(),'')
 await mediaPermissions(['gestion.acceder','eventos.editar'])
 await mobilePage.waitForFunction(()=>document.querySelectorAll('.panel-nav [data-panel-item]').length===2)
 assert.deepEqual(await mobilePage.locator('.panel-nav [data-panel-item] > span:not(.panel-click-wave)').allTextContents(),['Inicio','Eventos y Cultos'])
 await mobilePage.getByRole('button',{name:'Nuevo evento',exact:true}).tap()
 await mobilePage.getByRole('heading',{name:'Nuevo evento',exact:true}).waitFor()
 assert.equal(await mobilePage.getByLabel('Visible en la web pública',{exact:true}).count(),0)
 assert.equal(await mobilePage.locator('.manage-message').textContent(),'')
 // Revoke a role in the current module and verify the displayed menu and functions disappear.
 assert.equal((await api(`admin/users/${mobileAccount.id}/role`,{roleId:basicRole},admin.cookie)).status,200)
 await mobilePage.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await mobilePage.getByText('Necesitas una cuenta con un rol autorizado.',{exact:false}).waitFor()
 assert.equal(await mobilePage.locator('.panel-nav [data-panel-item]').count(),0)
 assert.equal(await mobilePage.getByRole('button',{name:'Nuevo evento',exact:true}).count(),0)
 await mobilePage.goto(`${uiOrigin}/#inicio`,{waitUntil:'domcontentloaded'})
 await mobilePage.getByRole('button',{name:'Abrir menú',exact:true}).tap()
 await mobilePage.locator('#mobile-navigation').getByRole('link',{name:'Nosotros',exact:false}).tap()
 assert.equal(await mobilePage.locator('#mobile-navigation').isVisible(),false)
 assert.deepEqual(errors,[])
 console.log('PASS browser: direct login/registration redirect, pending activation inside the panel, refresh/logout/invalid login, access restrictions, activation without relogin, all seven role menus, granular permissions and mobile touch navigation')
 await mobileContext.close()
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await page.screenshot({path:`checks/superadmin-${width}.png`,fullPage:true,animations:'disabled'})
 }
 for(const state of ['inactivo','bloqueado']){
  await pool.execute('UPDATE usuario SET estado_usuario=? WHERE id_usuario=?',[state,basic.data.user.id])
  assert.equal((await api(`admin/users/${basic.data.user.id}/role`,{roleId:basicRole},admin.cookie)).status,200)
  const [preserved]=await pool.execute('SELECT estado_usuario FROM usuario WHERE id_usuario=?',[basic.data.user.id])
  assert.equal(preserved[0].estado_usuario,state,'Assigning a role must preserve an existing block/inactivity')
  assert.equal((await api('login',{email:basic.data.user.email,password})).status,401)
 }
 console.log('PASS browser: Superadmin link, user list, role assignment, own-role protection, desktop and mobile')
 await browser.close();browser=null
 for(const id of accounts) await pool.execute('DELETE FROM usuario WHERE id_usuario=?',[id])
 const [marker]=await pool.execute('SELECT bootstrap_completado,id_superadmin_inicial FROM configuracion_sistema WHERE id=1')
 assert.equal(marker[0].bootstrap_completado,1)
 assert.equal(marker[0].id_superadmin_inicial,null)
 const afterDeletion=await api('register',{email:'after-deletion@example.invalid',password})
 assert.equal(afterDeletion.status,201)
 assert.equal(afterDeletion.data.user.state,'pendiente')
 assert.deepEqual(afterDeletion.data.user.roles,[])
 console.log('PASS bootstrap remains closed after account deletion')
} finally {
 if(browser) await browser.close()
 if(server) await new Promise(resolve=>server.close(resolve))
 if(pool) await pool.end()
 await connection.query(`DROP DATABASE IF EXISTS \`${testDatabase}\``)
 await connection.end()
 console.log('Isolated test database removed; local registration remains untouched')
}
