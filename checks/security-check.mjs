import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {once} from 'node:events'
import {readFile} from 'node:fs/promises'
import {spawn} from 'node:child_process'
import {setTimeout as delay} from 'node:timers/promises'
import mysql from 'mysql2/promise'
import {applyMigrations} from '../server/migration-runner.js'

const database=`calvario_security_test_${randomUUID().replaceAll('-','')}`
process.env.DB_NAME=database
const {databaseConfig}=await import('../server/config.js')
assert.ok(['localhost','127.0.0.1','::1'].includes(databaseConfig.host),'Esta prueba solo se ejecuta en MySQL local.')
const {database:ignored,...configuration}=databaseConfig
const db=await mysql.createConnection(configuration)
let pool,server,browser,preview
try{
 await db.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
 await db.query(`USE \`${database}\``);await applyMigrations(db);await applyMigrations(db)
 pool=(await import('../server/db.js')).pool
 const {default:app}=await import('../server/app.js');app.set('trust proxy',1)
 server=app.listen(0,'127.0.0.1');await once(server,'listening')
 const origin=`http://127.0.0.1:${server.address().port}`;process.env.APP_ORIGINS=origin
 const password=`Secure-${randomUUID()}`
 function jar(){return new Map()}
 const owner=jar(),second=jar(),basic=jar()
 async function request(path,body,cookies=owner,expected=200,extra={}){
  const response=await fetch(origin+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'}),Cookie:[...cookies].map(([key,value])=>`${key}=${value}`).join('; '),...extra},body:body===undefined?undefined:JSON.stringify(body)})
  for(const value of response.headers.getSetCookie()) {const [pair]=value.split(';'),index=pair.indexOf('=');const key=pair.slice(0,index),token=pair.slice(index+1);if(token)cookies.set(key,token);else cookies.delete(key)}
  const isJson=response.headers.get('content-type')?.includes('application/json'),data=isJson?await response.json():Buffer.from(await response.arrayBuffer())
  assert.equal(response.status,expected,`${path}: ${isJson?JSON.stringify(data):response.status}`)
  return {data,response}
 }
 let result=await request('auth/register',{email:'owner@example.invalid',password},owner,201)
 const ownerId=result.data.user.id
 assert.equal(result.data.user.mfaSetupRequired,undefined)
 await request('management/members')
 // Existing configurations must not lock out accounts that previously enabled MFA.
 await db.execute('INSERT INTO seguridad_mfa(id_usuario,secreto_cifrado,habilitada,recuperacion_confirmada) VALUES (?,?,1,0)',[ownerId,'retired-test-configuration'])
 result=await request('auth/login',{email:'owner@example.invalid',password},second)
 assert.equal(result.data.user.id,ownerId);assert.equal(result.data.mfaRequired,undefined)
 await request('management/members',undefined,second)
 await request('auth/login/mfa',{code:'123456'},second,404)
 await request('auth/account/security/mfa/setup',{currentPassword:password},owner,404)
 result=await request('auth/account/security')
 assert.equal(result.data.sessions.length,2)
 assert.ok(result.data.sessions.every(session=>!('token_hash' in session)))
 const secondId=result.data.sessions.find(session=>!session.current).id
 await request('auth/account/security/sessions/revoke',{sessionId:randomUUID()},owner,404)
 await request('auth/account/security/sessions/revoke',{sessionId:secondId})
 await request('auth/me',undefined,second,401)
 await request('auth/account/password',{currentPassword:'incorrecta',newPassword:password+'x'},owner,400)
 await request('auth/account/password',{currentPassword:password,newPassword:password+'x'})
 await request('auth/login',{email:'owner@example.invalid',password},jar(),401)
 await request('auth/login',{email:'owner@example.invalid',password:password+'x'},jar())
 result=await request('auth/register',{email:'basic@example.invalid',password},basic,201)
 const basicId=result.data.user.id
 assert.equal(result.data.user.mfaEnabled,undefined)
 await request('auth/account/security/audit',undefined,basic,403)
 await request('auth/account/security/sessions/revoke',{sessionId:secondId},basic,404)
 const audit=await request('auth/account/security/audit')
 assert.ok(audit.data.events.some(event=>event.action==='GET /api/management/members' && event.status===200))
 assert.ok(audit.data.events.some(event=>event.action==='account.password_changed'))
 assert.ok(audit.data.events.some(event=>event.action==='login.failed'))
 const [events]=await db.execute('SELECT * FROM auditoria_seguridad')
 const serialized=JSON.stringify(events);assert.equal(serialized.includes(password),false)
 // Shared per-account limit also applies when attempts come from different IPs.
 for(let index=0;index<16;index++) await request('auth/login',{email:'missing@example.invalid',password},jar(),index===15?429:401,{'X-Forwarded-For':`198.51.100.${index+1}`})
 const expiry=new Date(Date.now()+60000)
 await db.execute('INSERT INTO limite_solicitud(clave,intentos,vence_en) VALUES (?,?,?)',[createHash('sha256').update('api:203.0.113.99').digest('hex'),600,expiry])
 await request('health',undefined,jar(),429,{'X-Forwarded-For':'203.0.113.99'})
 await db.execute('INSERT INTO limite_solicitud(clave,intentos,vence_en) VALUES (?,?,?)',[createHash('sha256').update(`exports:${ownerId}`).digest('hex'),12,expiry])
 await request('management/reports/discipulos?format=xlsx',undefined,owner,429)
 await db.execute('UPDATE sesion_detalle d JOIN sesion_usuario s ON s.token_hash=d.token_hash SET d.ultima_actividad=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 31 MINUTE) WHERE s.id_usuario=?',[basicId])
 await request('auth/me',undefined,basic,401)
 const compressed=await fetch(origin+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Content-Encoding':'gzip'},body:'invalid'});assert.equal(compressed.status,415)
 const config=JSON.parse(await readFile('vercel.json','utf8')),csp=config.headers[0].headers.find(header=>header.key==='Content-Security-Policy').value
 assert.ok(csp.includes("script-src-attr 'none'"));assert.ok(csp.includes("object-src 'none'"));assert.equal(csp.includes("script-src 'unsafe-inline'"),false)
 if(process.argv.includes('--ui')){
  const ui='http://127.0.0.1:5188';process.env.APP_ORIGINS=`${origin},${ui}`
  preview=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5188','--strictPort'],{windowsHide:true,stdio:'ignore'})
  let ready=false
  for(let count=0;count<80;count++){try{ready=(await fetch(ui)).ok}catch{}if(ready)break;await delay(200)}
  assert.ok(ready,'No inició la vista previa de producción.')
  const candidateJar=jar()
  const candidate=await request('auth/register',{email:'browser@example.invalid',password},candidateJar,201)
  await request('auth/logout',{},candidateJar)
  await db.execute("UPDATE usuario SET estado_usuario='activo' WHERE id_usuario=?",[candidate.data.user.id])
  await db.execute("INSERT INTO usuario_rol(id_usuario,id_rol) SELECT ?,id_rol FROM rol_sistema WHERE nombre='Administrador'",[candidate.data.user.id])
  const {chromium}=await import('../.secrets/browser-tools/node_modules/playwright-core/index.mjs')
  browser=await chromium.launch({channel:'msedge',headless:true})
  async function context(){
   const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'})
   await context.route('**/*',async route=>{
    const url=new URL(route.request().url())
    if(url.origin===ui && url.pathname.startsWith('/api/')){const response=await route.fetch({url:origin+url.pathname+url.search});return route.fulfill({response})}
    if(url.origin===ui && route.request().resourceType()==='document'){const response=await route.fetch();return route.fulfill({response,headers:{...response.headers(),'Content-Security-Policy':csp}})}
    return route.continue()
   })
   return context
  }
  const firstContext=await context(),page=await firstContext.newPage(),errors=[],violations=[],consoleErrors=[]
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text().replace(/https?:\/\/\S+/g,'[URL]'))})
  page.on('pageerror',error=>errors.push(error.message))
  await page.exposeFunction('captureCsp',detail=>violations.push(detail))
  await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',event=>window.captureCsp({directive:event.effectiveDirective,blocked:event.blockedURI.startsWith('http')?new URL(event.blockedURI).origin:event.blockedURI})))
  await page.goto(ui+'/#login')
  await page.getByLabel('Correo electrónico',{exact:true}).fill('browser@example.invalid')
  await page.getByLabel('Contraseña',{exact:true}).fill(password)
  await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click()
  const secondContext=await context(),other=await secondContext.newPage()
  await other.goto(ui+'/#login');await other.getByLabel('Correo electrónico',{exact:true}).fill('browser@example.invalid');await other.getByLabel('Contraseña',{exact:true}).fill(password)
  await other.getByRole('button',{name:'Iniciar sesión',exact:true}).click()
  await other.getByRole('button',{name:'Mi cuenta',exact:true}).waitFor()
  assert.equal(await other.getByLabel('Código de autenticación o recuperación',{exact:true}).count(),0)
  await page.getByRole('button',{name:'Mi cuenta',exact:true}).waitFor()
  await page.getByRole('button',{name:'Mi cuenta',exact:true}).click();await page.getByRole('menuitem',{name:'Seguridad y dispositivos',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Opciones de la cuenta',exact:true});await dialog.waitFor()
  await dialog.getByRole('button',{name:'Cerrar esta sesión',exact:true}).click()
  await dialog.getByRole('button',{name:'Confirmar cierre',exact:true}).click()
  await dialog.getByText('Sesión revocada.',{exact:true}).waitFor()
  const revoked=await secondContext.request.get(origin+'/api/auth/me');assert.equal(revoked.status(),401)
  await dialog.getByRole('button',{name:'Consultar auditoría administrativa',exact:true}).click()
  await dialog.locator('.security-audit').waitFor()
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Desbordamiento en ${width}px`)}
  await page.getByRole('button',{name:'Cerrar opciones de la cuenta',exact:true}).click()
  // Removed modules fall back to the dashboard.
  for(const path of ['#gestion/mapa','#gestion/transmisiones','#gestion/falls/alertas']){await page.goto(ui+'/'+path);await page.locator('#dashboard-title,.attendance-picker').first().waitFor();assert.equal(await page.locator('.coverage-map,.pastoral-page,.transmissions-page').count(),0)}
  assert.deepEqual(errors,[]);assert.deepEqual(violations,[])
  console.log('PASS interfaz con CSP de producción: acceso administrativo solo con correo y contraseña, revocación de otro dispositivo, auditoría, módulos retirados y 320/390/768/1440px.')
 }
 console.log('PASS seguridad: acceso sin doble factor incluso con configuración antigua, rutas retiradas, sesiones por dispositivo, revocación, expiración, auditoría, permisos y límites por cuenta/IP/exportaciones; cuerpos comprimidos rechazados.')
}catch(error){
 if(browser){const page=browser.contexts()[0]?.pages()[0];if(page)await page.screenshot({path:'.secrets/security-ui-failure.png',fullPage:true}).catch(()=>{})}
 throw error
}finally{
 if(browser)await browser.close()
 if(preview)preview.kill('SIGTERM')
 if(server) await new Promise(resolve=>server.close(resolve))
 if(pool) await pool.end()
 await db.query(`DROP DATABASE IF EXISTS \`${database}\``);await db.end()
 console.log('Base temporal de seguridad eliminada; datos originales conservados.')
}
