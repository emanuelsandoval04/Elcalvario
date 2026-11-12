import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {once} from 'node:events'
import {spawn} from 'node:child_process'
import {createServer} from 'node:http'
import {setTimeout as delay} from 'node:timers/promises'
import mysql from 'mysql2/promise'
import {SignJWT,exportJWK,generateKeyPair} from 'jose'
import {applyMigrations} from '../server/migration-runner.js'

const database=`calvario_consent_test_${randomUUID().replaceAll('-','')}`
process.env.DB_NAME=database
// Local stand-in for Google's Firebase signing keys: this check never sends a real SMS.
const project='calvario-test'
const {privateKey,publicKey}=await generateKeyPair('RS256')
const {privateKey:foreignKey}=await generateKeyPair('RS256')
const jwk={...await exportJWK(publicKey),kid:'test-key',alg:'RS256',use:'sig'}
const keyServer=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({keys:[jwk]}))})
keyServer.listen(0,'127.0.0.1');await once(keyServer,'listening')
Object.assign(process.env,{FIREBASE_PROJECT_ID:project,FIREBASE_JWKS_URL:`http://127.0.0.1:${keyServer.address().port}/keys`})
const now=()=>Math.floor(Date.now()/1000)
async function phoneToken(phone,{uid=`uid-${phone}`,authTime=now(),provider='phone',issuer=`https://securetoken.google.com/${project}`,audience=project,key=privateKey}={}) {
  return new SignJWT({phone_number:phone,auth_time:authTime,firebase:{sign_in_provider:provider,identities:{phone:[phone]}}})
    .setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer(issuer).setAudience(audience).setSubject(uid).setIssuedAt(authTime).setExpirationTime(authTime+3600).sign(key)
}
const {databaseConfig}=await import('../server/config.js')
assert.ok(['localhost','127.0.0.1','::1'].includes(databaseConfig.host),'Only a temporary local database is allowed.')
const {database:ignored,...config}=databaseConfig
const db=await mysql.createConnection(config)
let server,pool,browser,vite
try {
  await db.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
  await db.query(`USE \`${database}\``);await applyMigrations(db)
  pool=(await import('../server/db.js')).pool
  const {default:app}=await import('../server/app.js'),{bootstrapAdmin}=await import('../server/bootstrap-admin.js'),{hashPassword}=await import('../server/auth.js')
  const password=`Consent-${randomUUID()}`
  await bootstrapAdmin({name:'Propietario',email:'owner@example.invalid',password})
  server=app.listen(0,'127.0.0.1');await once(server,'listening')
  const origin=`http://127.0.0.1:${server.address().port}`;process.env.APP_ORIGINS=origin
  async function request(path,{body,cookie='',method=body===undefined?'GET':'POST',status=200}={}) {
    const r=await fetch(`${origin}/api/${path}`,{method,headers:{Origin:origin,Cookie:cookie,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)})
    const data=await r.json().catch(()=>({}));assert.equal(r.status,status,`${method} ${path}: ${JSON.stringify(data)}`)
    return {data,cookie:r.headers.get('set-cookie')?.split(';')[0]||cookie}
  }
  const owner=await request('auth/login',{body:{email:'owner@example.invalid',password}}),ownerId=owner.data.user.id,hash=await hashPassword(password)
  async function member(name,number,groupId=null,phone='3001234567') {
    const [m]=await db.execute("INSERT INTO miembro(nombres,apellidos,tipo_identificacion,numero_identificacion,celular,fecha_nacimiento,codigo_qr,id_grupo,id_usuario_creacion) VALUES (?,'Apellido de prueba','CC',?,?,'1990-01-01',?,?,?)",[name,number,phone,randomUUID(),groupId,ownerId]);return m.insertId
  }
  async function account(email,role,memberId=null){const [u]=await db.execute("INSERT INTO usuario(correo_login,password_hash,estado_usuario,id_miembro) VALUES (?,?,'activo',?)",[email,hash,memberId]);await db.execute('INSERT INTO usuario_rol(id_usuario,id_rol) SELECT ?,id_rol FROM rol_sistema WHERE nombre=?',[u.insertId,role]);return request('auth/login',{body:{email,password}})}
  const leader=await member('Líder','L-1',null,'3109876543'),[group]=await db.execute("INSERT INTO grupo_comunion(codigo_grupo,nombre,id_discipulador) VALUES ('C-A','Grupo consentimiento',?)",[leader])
  const person=await member('Persona de consentimiento','C-1',group.insertId),outside=await member('Fuera de alcance','C-2'),landline=await member('Teléfono fijo','C-3',null,'6015551234')
  const viewer=await account('viewer@example.invalid','Discipulador',leader),basic=await account('basic@example.invalid','Usuario')
  const path=`management/members/${person}/consents`
  const confirm=async(token,status,cookie=owner.cookie)=>request(`${path}/phone`,{cookie,body:{idToken:token},status})

  await request(path,{status:401});await request(path,{cookie:basic.cookie,status:403})
  let status=(await request(path,{cookie:viewer.cookie})).data
  assert.equal(status.accepted,false);assert.equal(status.canManage,false);assert.equal(status.phoneNumber,undefined,'Only managers receive the full number')
  await request(`management/members/${outside}/consents`,{cookie:viewer.cookie,status:404})
  // The signed-form upload, its PDF and the old Twilio routes are gone.
  await request(path,{cookie:owner.cookie,body:{files:[]},status:404})
  await request(`management/members/${person}/consent.pdf`,{cookie:owner.cookie,status:404})
  await request(`${path}/sms`,{cookie:owner.cookie,body:{},status:404})

  status=(await request(path,{cookie:owner.cookie})).data
  assert.equal(status.phoneReady,true);assert.equal(status.phone,'*** *** 4567');assert.equal(status.phoneNumber,'+573001234567')
  assert.match(status.authorizationText,/Iglesia El Calvario.*Ley 1581 de 2012/)
  assert.equal((await request(`management/members/${landline}/consents`,{cookie:owner.cookie})).data.phoneNumber,null,'A landline cannot receive the SMS')
  // Invalid tokens: wrong signature, project, provider, other phone, stale sign-in, garbage.
  await confirm('not-a-token',400)
  await confirm(await phoneToken('+573001234567',{key:foreignKey}),400)
  await confirm(await phoneToken('+573001234567',{audience:'otro-proyecto'}),400)
  await confirm(await phoneToken('+573001234567',{issuer:'https://securetoken.google.com/otro-proyecto'}),400)
  await confirm(await phoneToken('+573001234567',{provider:'password'}),400)
  assert.match((await confirm(await phoneToken('+573009999999'),409)).data.error,/no coincide con el de la ficha/)
  assert.match((await confirm(await phoneToken('+573001234567',{authTime:now()-1200}),409)).data.error,/venció/)
  await confirm(await phoneToken('+573001234567'),403,viewer.cookie)
  assert.equal((await db.query('SELECT COUNT(*) AS total FROM consentimiento_datos'))[0][0].total,0)
  // A valid verification registers the authorization once.
  const token=await phoneToken('+573001234567')
  const saved=(await confirm(token,201)).data
  status=(await request(path,{cookie:owner.cookie})).data
  assert.equal(status.accepted,true);assert.equal(status.method,'sms');assert.equal(status.acceptedPhone,'*** *** 4567')
  assert.equal(status.items[0].registrado_por,'Propietario');assert.equal(status.items[0].celular,'*** *** 4567')
  const [[row]]=await db.query('SELECT c.*,v.firebase_uid,v.texto_autorizacion FROM consentimiento_datos c JOIN verificacion_consentimiento_telefono v ON v.id_consentimiento=c.id_consentimiento WHERE c.id_consentimiento=?',[saved.id])
  assert.equal(row.medio,'sms');assert.equal(row.version_politica,'firebase-sms-2026-11-12');assert.equal(row.firebase_uid,'uid-+573001234567');assert.match(row.texto_autorizacion,/Ley 1581/)
  assert.match((await confirm(token,409)).data.error,/ya se usó/,'The same verification cannot be replayed')
  await request(`${path}/${saved.id}/revoke`,{cookie:owner.cookie,body:{}})
  assert.equal((await request(path,{cookie:viewer.cookie})).data.revoked,true)
  await confirm(await phoneToken('+573001234567',{authTime:now()-5}),201)
  // A consent manager limited to their groups works only inside them.
  await db.execute("INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance) SELECT id_rol,'consentimientos.gestionar','grupo' FROM rol_sistema WHERE nombre='Discipulador'")
  await request(`management/members/${outside}/consents/phone`,{cookie:viewer.cookie,body:{idToken:await phoneToken('+573001234567')},status:404})
  // Without the Firebase project the server refuses.
  delete process.env.FIREBASE_PROJECT_ID
  assert.equal((await request(path,{cookie:owner.cookie})).data.phoneReady,false)
  await confirm(await phoneToken('+573001234567'),503)
  process.env.FIREBASE_PROJECT_ID=project
  console.log('PASS Firebase phone consent: signed token from the project, phone of the record, recent sign-in, no replay, scope, revocation and missing configuration.')

  if(process.argv.includes('--ui')) {
    const ui='http://127.0.0.1:5197';process.env.APP_ORIGINS=`${origin},${ui}`
    // Vite dev mode: the Firebase SDK is replaced by a double (only honored in development builds).
    vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5197','--strictPort'],{windowsHide:true,stdio:'ignore'})
    for(let i=0;i<100;i++){try{if((await fetch(ui)).ok)break}catch{}await delay(200)}
    const {chromium}=await import('../.secrets/browser-tools/node_modules/playwright-core/index.mjs')
    browser=await chromium.launch({channel:'msedge',headless:true})
    const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',reducedMotion:'reduce'})
    await context.route('**/api/**',async route=>{const url=new URL(route.request().url());const response=await route.fetch({url:origin+url.pathname+url.search});await route.fulfill({response})})
    const sent=[]
    await context.exposeFunction('calvarioSignPhone',async phone=>{sent.push(phone);return phoneToken(phone)})
    await context.addInitScript(()=>{let phone='';window.__calvarioPhoneAuthDouble={send:async value=>{phone=value},confirm:async code=>{if(code!=='123456')throw Object.assign(new Error('wrong'),{code:'auth/invalid-verification-code'});return window.calvarioSignPhone(phone)}}})
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
    await page.goto(ui+'/#login');await page.getByLabel('Correo electrónico',{exact:true}).fill('owner@example.invalid');await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.locator('#dashboard-title').waitFor()
    await page.goto(ui+'/#gestion/members/discipuladores');await page.getByRole('button',{name:'Ver ficha de Líder Apellido de prueba',exact:true}).click()
    const section=page.locator('.disciple-consent');await section.getByText('Sin autorización',{exact:true}).waitFor()
    assert.equal(await section.locator('input[type=file]').count(),0,'No signed-form upload')
    await section.getByText('Léele esto a la persona:',{exact:false}).waitFor()
    await section.getByRole('button',{name:'Enviar código por SMS al *** *** 6543',exact:true}).click()
    await section.getByLabel('Código de 6 dígitos',{exact:true}).waitFor()
    assert.ok(await section.getByRole('button',{name:/^Reenviar código \(\d+ s\)$/}).isDisabled())
    await section.getByLabel('Código de 6 dígitos',{exact:true}).fill('000000')
    await section.getByRole('button',{name:'Confirmar autorización',exact:true}).click()
    await section.getByRole('alert').filter({hasText:'El código no coincide. Revísalo con la persona.'}).waitFor()
    for(const width of [1440,390,320]) {
      await page.setViewportSize({width,height:1000});await section.scrollIntoViewIfNeeded()
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Consent page at ${width}px`)
      if(process.env.CONSENT_SHOTS) await section.screenshot({path:`${process.env.CONSENT_SHOTS}/consent-code-${width}.png`})
    }
    await page.setViewportSize({width:1440,height:1000})
    await section.getByLabel('Código de 6 dígitos',{exact:true}).fill('123456')
    await section.getByRole('button',{name:'Confirmar autorización',exact:true}).click()
    await section.getByText('Autorizado',{exact:true}).waitFor()
    await section.getByText(/código verificado en el \*\*\* \*\*\* 6543/).waitFor()
    assert.deepEqual(sent,['+573109876543'])
    if(process.env.CONSENT_SHOTS) await section.screenshot({path:`${process.env.CONSENT_SHOTS}/consent-accepted.png`})
    await section.getByRole('button',{name:'Registrar revocación',exact:true}).click();await section.getByRole('button',{name:'Confirmar revocación',exact:true}).click()
    await section.getByText('Autorización revocada',{exact:true}).waitFor()
    await section.getByText('Historial de autorizaciones',{exact:false}).click()
    await section.getByText('Autorización por SMS',{exact:true}).first().waitFor()
    assert.deepEqual(errors,[])
    console.log('PASS UI: authorization text, send code, resend wait, wrong code message, confirmation, revocation, history and 320-1440px layouts.')
  }
  await request(`auth/admin/users/${viewer.data.user.id}`,{cookie:owner.cookie,method:'DELETE',body:{action:'delete',expectedEmail:viewer.data.user.email,expectedState:'activo'}})
  await applyMigrations(db);await applyMigrations(db)
  assert.ok((await db.execute("SELECT COUNT(*) AS total FROM verificacion_consentimiento_telefono"))[0][0].total>=2)
  console.log('PASS author deletion and migration reruns retain the SMS evidence.')
}finally {
  await browser?.close();if(vite){vite.kill();await once(vite,'exit').catch(()=>{})}
  if(server)await new Promise(resolve=>server.close(resolve))
  keyServer.close()
  await pool?.end();await db.query(`DROP DATABASE IF EXISTS \`${database}\``);await db.end()
  console.log('Temporary consent database removed; no real SMS sent.')
}
