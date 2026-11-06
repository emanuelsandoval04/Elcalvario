import assert from 'node:assert/strict'
import {randomBytes,randomUUID,createHash} from 'node:crypto'
import {once} from 'node:events'
import {readFile} from 'node:fs/promises'
import {spawn} from 'node:child_process'
import {setTimeout as delay} from 'node:timers/promises'
import mysql from 'mysql2/promise'
import {applyMigrations} from '../server/migration-runner.js'

const database=`calvario_security_test_${randomUUID().replaceAll('-','')}`
process.env.DB_NAME=database;process.env.MFA_ENCRYPTION_KEY=randomBytes(32).toString('hex');process.env.MFA_ENFORCE_PRIVILEGED='true'
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
 const {createTotp,decryptSecret,requiresMfa}=await import('../server/security.js')
 const priorEnforcement=process.env.MFA_ENFORCE_PRIVILEGED,priorVercel=process.env.VERCEL
 process.env.MFA_ENFORCE_PRIVILEGED='false';process.env.VERCEL='1'
 assert.equal(requiresMfa({state:'activo',roles:['Superadmin'],permissions:{}}),true)
 process.env.MFA_ENFORCE_PRIVILEGED=priorEnforcement
 if(priorVercel===undefined)delete process.env.VERCEL;else process.env.VERCEL=priorVercel
 server=app.listen(0,'127.0.0.1');await once(server,'listening')
 const origin=`http://127.0.0.1:${server.address().port}`;process.env.APP_ORIGINS=origin
 const password=`Secure-${randomUUID()}`
 function jar(){return new Map()}
 const owner=jar(),second=jar(),basic=jar(),outsider=jar()
 async function request(path,body,cookies=owner,expected=200,extra={}){
  const response=await fetch(origin+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'}),Cookie:[...cookies].map(([key,value])=>`${key}=${value}`).join('; '),...extra},body:body===undefined?undefined:JSON.stringify(body)})
  for(const value of response.headers.getSetCookie()) {const [pair]=value.split(';'),index=pair.indexOf('=');const key=pair.slice(0,index),token=pair.slice(index+1);if(token)cookies.set(key,token);else cookies.delete(key)}
  const isJson=response.headers.get('content-type')?.includes('application/json'),data=isJson?await response.json():Buffer.from(await response.arrayBuffer())
  assert.equal(response.status,expected,`${path}: ${isJson?JSON.stringify(data):response.status}`)
  return {data,response}
 }
 let result=await request('auth/register',{email:'owner@example.invalid',password},owner,201)
 const ownerId=result.data.user.id;assert.equal(result.data.user.mfaSetupRequired,true)
 await request('management/members',undefined,owner,403)
 await request('auth/login',{email:'owner@example.invalid',password},second)
 const obsolete=new Map(second)
 await request('auth/account/security/mfa/setup',{currentPassword:'incorrecta'},owner,400)
 result=await request('auth/account/security/mfa/setup',{currentPassword:password})
 const secret=result.data.secret;assert.ok(result.data.qrDataUrl.startsWith('data:image/png;base64,'))
 const [stored]=await db.execute('SELECT secreto_cifrado FROM seguridad_mfa WHERE id_usuario=?',[ownerId])
 assert.equal(stored[0].secreto_cifrado.includes(secret),false);assert.equal(decryptSecret(stored[0].secreto_cifrado,ownerId),secret)
 assert.throws(()=>decryptSecret(stored[0].secreto_cifrado,ownerId+1))
 await request('auth/account/security/mfa/confirm',{code:'abcdef'},owner,401)
 const code=createTotp(secret).generate()
 result=await request('auth/account/security/mfa/confirm',{code})
 const recovery=result.data.recoveryCodes;assert.equal(recovery.length,8);assert.equal(new Set(recovery).size,8)
 await request('auth/me',undefined,obsolete,401)
 await request('management/members',undefined,owner,403)
 await request('auth/account/security/mfa/recovery/ack',{})
 await request('management/members')
 await request('auth/account/security/mfa/setup',{currentPassword:password},owner,409)
 await request('auth/account/security/mfa/disable',{currentPassword:password,code:recovery[7]},owner,403)
 result=await request('auth/login',{email:'owner@example.invalid',password},second)
 assert.equal(result.data.mfaRequired,true);assert.equal(result.data.user,undefined);assert.equal(second.has('calvario_session'),false)
 await request('management/members',undefined,second,401)
 await request('auth/login/mfa',{code},second,401)
 result=await request('auth/login/mfa',{code:recovery[0]},second)
 assert.equal(result.data.user.id,ownerId);assert.equal(second.has('calvario_session'),true)
 await request('auth/login/mfa',{code:recovery[0]},second,401)
 await request('auth/login',{email:'owner@example.invalid',password},outsider)
 for(let attempt=0;attempt<5;attempt++) await request('auth/login/mfa',{code:'abcdef'},outsider,401)
 await request('auth/login/mfa',{code:recovery[1]},outsider,401)
 result=await request('auth/account/security')
 assert.equal(result.data.sessions.length,2);assert.equal(result.data.remainingCodes,7)
 assert.ok(result.data.sessions.every(session=>!('token_hash' in session)))
 const secondId=result.data.sessions.find(session=>!session.current).id
 await request('auth/account/security/sessions/revoke',{sessionId:randomUUID()},owner,404)
 await request('auth/account/security/sessions/revoke',{sessionId:secondId})
 await request('auth/me',undefined,second,401)
 await request('auth/account/password',{currentPassword:password,newPassword:password+'x',code:recovery[0]},owner,401)
 await request('auth/account/password',{currentPassword:password,newPassword:password+'x',code:recovery[1]})
 await request('auth/account/security/mfa/recovery',{currentPassword:password+'x',code:recovery[2]})
 await request('auth/account/security/mfa/recovery',{currentPassword:password+'x',code:recovery[2]},owner,401)
 result=await request('auth/register',{email:'basic@example.invalid',password},basic,201)
 const basicId=result.data.user.id
 assert.equal(result.data.user.mfaEnabled,false)
 await request('auth/account/security/audit',undefined,basic,403)
 await request('auth/account/security/sessions/revoke',{sessionId:secondId},basic,404)
 const audit=await request('auth/account/security/audit')
 assert.ok(audit.data.events.some(event=>event.action==='GET /api/management/members' && event.status===200))
 assert.ok(audit.data.events.some(event=>event.action==='account.password_changed'))
 assert.ok(audit.data.events.some(event=>event.action==='login.factor_failed'))
 const [events]=await db.execute('SELECT * FROM auditoria_seguridad')
 const serialized=JSON.stringify(events);assert.equal(serialized.includes(password),false);assert.equal(serialized.includes(secret),false);assert.equal(serialized.includes(recovery[0]),false)
 const [recoveries]=await db.execute('SELECT codigo_hash FROM mfa_recuperacion WHERE id_usuario=?',[ownerId]);assert.ok(recoveries.every(row=>/^[a-f0-9]{64}$/.test(row.codigo_hash)))
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
  const candidate=await request('auth/register',{email:'browser@example.invalid',password},jar(),201)
  await db.execute("UPDATE usuario SET estado_usuario='activo' WHERE id_usuario=?",[candidate.data.user.id])
  await db.execute("INSERT INTO usuario_rol(id_usuario,id_rol) SELECT ?,id_rol FROM rol_sistema WHERE nombre='Superadmin'",[candidate.data.user.id])
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
  const security=page.getByRole('region',{name:'Seguridad de la cuenta',exact:true});await security.waitFor()
  await security.getByLabel('Contraseña actual',{exact:true}).fill(password)
  await security.getByRole('button',{name:'Configurar doble factor',exact:true}).click()
  await page.getByRole('img',{name:'QR para vincular el autenticador',exact:true}).waitFor()
  const [saved]=await db.execute('SELECT secreto_cifrado FROM seguridad_mfa WHERE id_usuario=?',[candidate.data.user.id])
  const browserSecret=decryptSecret(saved[0].secreto_cifrado,candidate.data.user.id)
  await security.getByLabel('Código de 6 dígitos',{exact:true}).fill(createTotp(browserSecret).generate())
  await security.getByRole('button',{name:'Confirmar y activar doble factor',exact:true}).click()
  const codesPanel=page.getByRole('region',{name:'Códigos de recuperación',exact:true});await codesPanel.waitFor()
  const backupCodes=await codesPanel.locator('code').allTextContents();assert.equal(backupCodes.length,8)
  const downloadEvent=page.waitForEvent('download');await codesPanel.getByRole('button',{name:'Descargar códigos',exact:true}).click()
  const download=await downloadEvent;assert.ok((await readFile(await download.path(),'utf8')).includes(backupCodes[0]))
  await codesPanel.getByRole('button',{name:'Ya guardé mis códigos. Continuar',exact:true}).click()
  await codesPanel.waitFor({state:'detached'})
  assert.equal((await firstContext.request.get(origin+'/api/management/members')).status(),200)
  const secondContext=await context(),other=await secondContext.newPage()
  await other.goto(ui+'/#login');await other.getByLabel('Correo electrónico',{exact:true}).fill('browser@example.invalid');await other.getByLabel('Contraseña',{exact:true}).fill(password)
  await other.getByRole('button',{name:'Iniciar sesión',exact:true}).click()
  await other.getByLabel('Código de autenticación o recuperación',{exact:true}).fill(backupCodes[0])
  await other.getByRole('button',{name:'Verificar e iniciar sesión',exact:true}).click()
  await other.getByRole('button',{name:'Mi cuenta',exact:true}).waitFor()
  await page.getByRole('button',{name:'Mi cuenta',exact:true}).click();await page.getByRole('menuitem',{name:'Seguridad y dispositivos',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Opciones de la cuenta',exact:true});await dialog.waitFor()
  await dialog.getByRole('button',{name:'Cerrar esta sesión',exact:true}).click()
  await dialog.getByRole('button',{name:'Confirmar cierre',exact:true}).click()
  await dialog.getByText('Sesión revocada.',{exact:true}).waitFor()
  const revoked=await secondContext.request.get(origin+'/api/auth/me');assert.equal(revoked.status(),401)
  await dialog.getByRole('button',{name:'Consultar auditoría administrativa',exact:true}).click()
  await dialog.getByRole('generic',{name:'Auditoría administrativa',exact:true}).waitFor().catch(()=>dialog.locator('.security-audit').waitFor())
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Desbordamiento en ${width}px`)}
  await page.getByRole('button',{name:'Cerrar opciones de la cuenta',exact:true}).click()
  await page.goto(ui+'/#gestion/mapa')
  await page.locator('.coverage-map .gm-style').waitFor({timeout:25000}).catch(error=>{console.log(JSON.stringify({errors,violations,consoleErrors}));throw error})
  assert.equal(await page.getByText('No fue posible cargar el mapa.',{exact:true}).count(),0)
  assert.deepEqual(errors,[]);assert.deepEqual(violations,[])
  console.log('PASS interfaz con CSP de producción: alta de autenticador, QR, descarga y confirmación de códigos, acceso con segundo factor, revocación de otro dispositivo, auditoría, mapa y 320/390/768/1440px.')
 }
 console.log('PASS seguridad: MFA obligatorio, QR, cifrado y aislamiento de secretos, códigos de recuperación de un uso, protección contra repetición, desafíos limitados, sesiones por dispositivo, revocación, expiración, auditoría, permisos y límites por cuenta/IP/exportaciones; cuerpos comprimidos rechazados.')
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
