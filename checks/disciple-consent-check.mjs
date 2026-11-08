import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {once} from 'node:events'
import {spawn} from 'node:child_process'
import {setTimeout as delay} from 'node:timers/promises'
import {writeFile} from 'node:fs/promises'
import mysql from 'mysql2/promise'
import jpeg from 'jpeg-js'
import {PDFDocument} from 'pdf-lib'
import {applyMigrations} from '../server/migration-runner.js'
import {parseConsentFiles} from '../server/disciple-consent-document.js'

const database=`calvario_consent_test_${randomUUID().replaceAll('-','')}`
process.env.DB_NAME=database
const {databaseConfig}=await import('../server/config.js')
assert.ok(['localhost','127.0.0.1','::1'].includes(databaseConfig.host),'Only a temporary local database is allowed.')
const {database:ignored,...config}=databaseConfig
const db=await mysql.createConnection(config)
let server,pool,browser,preview
try {
  await db.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
  await db.query(`USE \`${database}\``);await applyMigrations(db)
  pool=(await import('../server/db.js')).pool
  const {default:app}=await import('../server/app.js'),{bootstrapAdmin}=await import('../server/bootstrap-admin.js'),{hashPassword}=await import('../server/auth.js')
  const password=`Consent-${randomUUID()}`
  await bootstrapAdmin({name:'Propietario',email:'owner@example.invalid',password})
  server=app.listen(0,'127.0.0.1');await once(server,'listening')
  const origin=`http://127.0.0.1:${server.address().port}`;process.env.APP_ORIGINS=origin
  async function request(path,{body,cookie='',method=body===undefined?'GET':'POST',status=200,raw=false}={}) {
    const r=await fetch(`${origin}/api/${path}`,{method,headers:{Origin:origin,Cookie:cookie,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)})
    if(raw){assert.equal(r.status,status);return r}
    const data=await r.json();assert.equal(r.status,status,`${method} ${path}: ${JSON.stringify(data)}`)
    return {data,cookie:r.headers.get('set-cookie')?.split(';')[0]||cookie}
  }
  const owner=await request('auth/login',{body:{email:'owner@example.invalid',password}}),ownerId=owner.data.user.id,hash=await hashPassword(password)
  async function member(name,number,groupId=null) {
    const [m]=await db.execute("INSERT INTO miembro(nombres,apellidos,tipo_identificacion,numero_identificacion,celular,fecha_nacimiento,codigo_qr,id_grupo,id_usuario_creacion,eps) VALUES (?,'Apellido de prueba','CC',?,'3001234567','1990-01-01',?,?,?,'EPS RESERVADA')",[name,number,randomUUID(),groupId,ownerId]);return m.insertId
  }
  async function account(email,role,memberId=null){const [u]=await db.execute("INSERT INTO usuario(correo_login,password_hash,estado_usuario,id_miembro) VALUES (?,?,'activo',?)",[email,hash,memberId]);await db.execute('INSERT INTO usuario_rol(id_usuario,id_rol) SELECT ?,id_rol FROM rol_sistema WHERE nombre=?',[u.insertId,role]);return request('auth/login',{body:{email,password}})}
  const leader=await member('Líder','L-1'),[group]=await db.execute("INSERT INTO grupo_comunion(codigo_grupo,nombre,id_discipulador) VALUES ('C-A','Grupo consentimiento',?)",[leader])
  const person=await member('Persona de consentimiento','C-1',group.insertId),outside=await member('Fuera de alcance','C-2')
  const viewer=await account('viewer@example.invalid','Discipulador',leader),basic=await account('basic@example.invalid','Usuario')
  const path=`management/members/${person}/consents`
  await request(path,{status:401});await request(path,{cookie:basic.cookie,status:403})
  assert.equal((await request(path,{cookie:viewer.cookie})).data.signed,false)
  assert.equal((await request(path,{cookie:viewer.cookie})).data.canManage,false)
  await request(`management/members/${outside}/consents`,{cookie:viewer.cookie,status:404})
  await db.execute("INSERT INTO consentimiento_datos(id_miembro,version_politica,acepta_politica_privacidad,acepta_datos_religiosos,medio,estado_consentimiento,fecha_aceptacion) VALUES (?,'anterior',1,1,'papel','aceptado','2001-01-01')",[person])
  assert.equal((await request(path,{cookie:owner.cookie})).data.signed,false,'A legacy acceptance is not evidence of a signed upload.')
  await request(path,{cookie:owner.cookie,body:{estado_consentimiento:'aceptado',fecha_aceptacion:'2000-01-01'},status:400})
  await db.execute("UPDATE miembro SET nombres='Nombre actualizado en ficha' WHERE id_miembro=?",[person])
  const pdfResponse=await request(`management/members/${person}/consent.pdf`,{cookie:owner.cookie,raw:true})
  const pdf=Buffer.from(await pdfResponse.arrayBuffer())
  assert.equal(pdfResponse.headers.get('content-type'),'application/pdf')
  assert.equal((await PDFDocument.load(pdf)).getPageCount(),2)
  await writeFile('.secrets/consent-current-data.pdf',pdf)
  const upload={files:[{type:'application/pdf',data:pdf.toString('base64')}],confirmSigned:true,religious:true,health:true,fecha_aceptacion:'2000-01-01',version_politica:'forged'}
  await request(path,{cookie:viewer.cookie,body:upload,status:403})
  await request(path,{cookie:owner.cookie,body:{...upload,confirmSigned:false},status:400})
  await request(path,{cookie:owner.cookie,body:{...upload,files:[{type:'application/pdf',data:Buffer.from('<html>wrong file</html>').toString('base64')}]},status:400})
  await request(path,{cookie:owner.cookie,body:{...upload,files:[{type:'image/jpeg',data:pdf.toString('base64')}]},status:400})
  const active=await PDFDocument.create();active.addPage();active.addJavaScript('bad','alert(1)')
  await assert.rejects(()=>parseConsentFiles([{type:'application/pdf',data:Buffer.from('%PDF-1.7\nnot a document\n%%EOF').toString('base64') }]),{status:400})
  const activeBytes=await active.save()
  await assert.rejects(()=>parseConsentFiles([{type:'application/pdf',data:Buffer.from(activeBytes).toString('base64')}]),{status:400})
  const before=Date.now()
  const saved=(await request(path,{cookie:owner.cookie,body:upload,status:201})).data
  let status=(await request(path,{cookie:owner.cookie})).data
  assert.equal(status.signed,true);assert.ok(Date.parse(status.uploadedAt)>=before-1000)
  const [stored]=await db.execute('SELECT c.version_politica,c.fecha_aceptacion,d.* FROM consentimiento_datos c JOIN documento_consentimiento d ON d.id_consentimiento=c.id_consentimiento WHERE c.id_consentimiento=?',[saved.id])
  assert.equal(stored[0].version_politica,'base-2026-11-08');assert.equal(stored[0].contenido.compare(pdf),0)
  assert.equal(stored[0].sha256,createHash('sha256').update(pdf).digest('hex'))
  assert.equal(new Date(stored[0].fecha_aceptacion).getTime(),new Date(stored[0].fecha_subida).getTime())
  const viewerStatus=(await request(path,{cookie:viewer.cookie})).data
  assert.equal(viewerStatus.signed,true);assert.deepEqual(viewerStatus.items,[]);assert.equal(viewerStatus.canReadFiles,false)
  const filePath=`${path}/${saved.documentId}/file`
  const storedResponse=await request(filePath,{cookie:owner.cookie,raw:true})
  assert.ok(storedResponse.headers.get('content-disposition').startsWith('attachment;'))
  assert.equal(Buffer.from(await storedResponse.arrayBuffer()).compare(pdf),0)
  await request(filePath,{cookie:viewer.cookie,status:403})
  await request(`management/members/${outside}/consents/${saved.documentId}/file`,{cookie:owner.cookie,status:404})
  await request(`${path}/${saved.id}/revoke`,{cookie:owner.cookie,body:{}})
  status=(await request(path,{cookie:viewer.cookie})).data
  assert.equal(status.signed,false);assert.equal(status.revoked,true)
  await request(`${path}/${saved.id}/revoke`,{cookie:owner.cookie,body:{},status:409})
  assert.equal((await db.execute('SELECT COUNT(*) AS total FROM documento_consentimiento'))[0][0].total,1)
  // A failed document write must not leave behind an accepted consent row.
  const oldCount=(await db.execute('SELECT COUNT(*) AS total FROM consentimiento_datos'))[0][0].total
  await db.query('CREATE TRIGGER fail_consent_file BEFORE INSERT ON documento_consentimiento FOR EACH ROW SET NEW.contenido=NULL')
  await request(path,{cookie:owner.cookie,body:upload,status:503})
  await db.query('DROP TRIGGER fail_consent_file')
  assert.equal((await db.execute('SELECT COUNT(*) AS total FROM consentimiento_datos'))[0][0].total,oldCount)
  assert.equal((await request(path,{cookie:owner.cookie})).data.signed,false)
  // Group consent managers can prepare scoped PDFs without exporting reserved health fields.
  await db.execute("INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance) SELECT id_rol,'consentimientos.gestionar','grupo' FROM rol_sistema WHERE nombre='Discipulador'")
  const scopedPdf=await request(`management/members/${person}/consent.pdf`,{cookie:viewer.cookie,raw:true})
  await writeFile('.secrets/consent-scoped.pdf',Buffer.from(await scopedPdf.arrayBuffer()))
  await request(`management/members/${outside}/consent.pdf`,{cookie:viewer.cookie,status:404})
  await request(path,{cookie:viewer.cookie,body:upload,status:403})
  const raw=Buffer.alloc(600*800*4,255),photo=jpeg.encode({data:raw,width:600,height:800},85).data
  const pictures={files:[{type:'image/jpeg',data:photo.toString('base64')},{type:'image/jpeg',data:photo.toString('base64')}],confirmSigned:true,religious:false,health:false}
  const savedPhotos=(await request(path,{cookie:viewer.cookie,body:pictures,status:201})).data
  const [photos]=await db.execute('SELECT * FROM documento_consentimiento WHERE id_documento=?',[savedPhotos.documentId])
  assert.equal(photos[0].tipo_archivo,'application/pdf');assert.equal((await PDFDocument.load(photos[0].contenido)).getPageCount(),2)
  await assert.rejects(()=>parseConsentFiles([{type:'application/pdf',data:Buffer.alloc(2*1024*1024+1,32).toString('base64')}]))
  await assert.rejects(()=>parseConsentFiles(Array.from({length:7},()=>({type:'image/jpeg',data:photo.toString('base64')}))),{status:400})
  console.log('PASS PDF/current data, legacy evidence, strict file validation, automatic timestamp, atomic persistence, immutable history, revocation and scoped/private access.')

  if(process.argv.includes('--ui')) {
    const ui='http://127.0.0.1:5197';process.env.APP_ORIGINS=`${origin},${ui}`
    preview=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5197','--strictPort'],{windowsHide:true,stdio:'ignore'})
    for(let i=0;i<80;i++){try{if((await fetch(ui)).ok)break}catch{}await delay(150)}
    const {chromium}=await import('../.secrets/browser-tools/node_modules/playwright-core/index.mjs')
    browser=await chromium.launch({channel:'msedge',headless:true})
    const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',reducedMotion:'reduce'})
    await context.route('**/api/**',async route=>{const url=new URL(route.request().url());const response=await route.fetch({url:origin+url.pathname+url.search});await route.fulfill({response})})
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
    await page.goto(ui+'/#login');await page.getByLabel('Correo electrónico',{exact:true}).fill('owner@example.invalid');await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.locator('#dashboard-title').waitFor()
    await page.goto(ui+'/#gestion/members');await page.getByRole('button',{name:'Ver ficha de Nombre actualizado en ficha Apellido de prueba',exact:true}).click()
    const section=page.locator('.disciple-consent');await section.getByText('Firmado · consentimiento aceptado',{exact:true}).waitFor()
    assert.equal(await section.getByLabel('Versión de la política',{exact:false}).count(),0)
    assert.equal(await section.locator('input[type=datetime-local]').count(),0)
    await section.getByRole('button',{name:'Registrar revocación solicitada',exact:true}).click();await section.getByRole('button',{name:'Confirmar revocación',exact:true}).click();await section.getByText('Consentimiento revocado',{exact:true}).waitFor()
    const downloadWait=page.waitForEvent('download');await section.getByRole('button',{name:'Descargar ficha en PDF para firmar',exact:true}).click();assert.ok((await downloadWait).suggestedFilename().endsWith('.pdf'))
    await section.locator('input[type=file]').setInputFiles({name:'ficha-firmada.pdf',mimeType:'application/pdf',buffer:pdf})
    await section.getByText('1. ficha-firmada.pdf',{exact:false}).waitFor()
    await section.getByLabel('El titular autorizó expresamente los datos religiosos.',{exact:true}).check()
    await section.getByLabel('Revisé todas las páginas:',{exact:false}).check()
    await section.getByRole('button',{name:'Guardar documento firmado',exact:true}).click()
    await section.getByText('Firmado · consentimiento aceptado',{exact:true}).waitFor()
    for(const width of [1440,390,320]) {
      await page.setViewportSize({width,height:1000});await section.scrollIntoViewIfNeeded()
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Consent page at ${width}px`)
      await section.screenshot({path:`checks/consent-${width}.png`})
    }
    await section.getByText('Documentos e historial',{exact:false}).click()
    const fileWait=page.waitForEvent('download');await section.getByRole('button',{name:'Descargar documento firmado',exact:true}).first().click();assert.ok((await fileWait).suggestedFilename().includes('ficha-firmada'))
    // PNG/photo preparation must preserve the entire page's aspect ratio, not crop it to an avatar.
    const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=800;canvas.height=1200;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,800,1200);ctx.fillStyle='black';ctx.fillText('PÁGINA COMPLETA DE PRUEBA',10,20);ctx.fillText('FIRMA DE PRUEBA',10,1190);return canvas.toDataURL('image/png').split(',')[1]})
    await section.locator('input[type=file]').setInputFiles([{name:'pagina1.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')},{name:'pagina2.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')}])
    await section.locator('.consent-files img').first().waitFor()
    assert.equal(await section.locator('.consent-files img').count(),2)
    assert.equal(await section.locator('.consent-files img').first().evaluate(img=>img.naturalWidth/img.naturalHeight),2/3)
    await section.getByLabel('Revisé todas las páginas:',{exact:false}).check();await section.getByRole('button',{name:'Guardar documento firmado',exact:true}).click();await page.getByRole('status').filter({hasText:'Documento firmado guardado.'}).waitFor()
    assert.deepEqual(errors,[])
    console.log('PASS UI PDF download, signed upload, green/red status, no manual policy/date controls, multiple complete PNG pages and 320-1440px layouts.')
  }
  await request(`auth/admin/users/${viewer.data.user.id}`,{cookie:owner.cookie,method:'DELETE',body:{action:'delete',expectedEmail:viewer.data.user.email,expectedState:'activo'}})
  const [retained]=await db.execute('SELECT id_usuario,contenido FROM documento_consentimiento WHERE id_documento=?',[savedPhotos.documentId])
  assert.equal(retained[0].id_usuario,null);assert.ok(retained[0].contenido.length)
  await applyMigrations(db);await applyMigrations(db)
  assert.ok((await db.execute('SELECT COUNT(*) AS total FROM documento_consentimiento'))[0][0].total>=2)
  console.log('PASS author deletion and migration reruns retain signed documents.')
}finally {
  await browser?.close();if(preview){preview.kill();await once(preview,'exit')}
  if(server)await new Promise(resolve=>server.close(resolve))
  await pool?.end();await db.query(`DROP DATABASE IF EXISTS \`${database}\``);await db.end()
  console.log('Temporary consent database removed; no production records or emails used.')
}
