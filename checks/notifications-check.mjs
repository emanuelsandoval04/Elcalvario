import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import mysql from 'mysql2/promise'
import { applyMigrations } from '../server/migration-runner.js'

const database = `calvario_notifications_test_${randomUUID().replaceAll('-', '')}`
process.env.DB_NAME = database
const { databaseConfig } = await import('../server/config.js')
assert.ok(['localhost','127.0.0.1','::1'].includes(databaseConfig.host), 'Esta prueba solo usa MySQL local.')
const { database: ignored, ...configuration } = databaseConfig
const db = await mysql.createConnection(configuration)
let pool, server, browser, preview
try {
  await db.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
  await db.query(`USE \`${database}\``)
  await applyMigrations(db); await applyMigrations(db)
  pool = (await import('../server/db.js')).pool
  const { default: app } = await import('../server/app.js')
  server = app.listen(0,'127.0.0.1'); await once(server,'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  process.env.APP_ORIGINS = origin
  const password = `Check-${randomUUID()}`
  async function request(path, { body, cookie = '', status = 200, extra = {} } = {}) {
    const response = await fetch(`${origin}/api/auth/${path}`, { method: body ? 'POST' : 'GET', headers: { Origin: origin, Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined })
    const data = await response.json()
    assert.equal(response.status,status,`${path}: ${JSON.stringify(data)}`)
    return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie }
  }
  const {bootstrapAdmin}=await import('../server/bootstrap-admin.js')
  await bootstrapAdmin({name:'Propietario',email:'owner@example.invalid',password})
  const owner = await request('login',{body:{email:'owner@example.invalid',password}})
  const [secrets] = await db.execute('SELECT password_hash FROM usuario WHERE id_usuario=?',[owner.data.user.id])
  await db.execute("INSERT INTO usuario(correo_login,password_hash,estado_usuario) VALUES (?,?,'pendiente')",['pending@example.invalid',secrets[0].password_hash])
  const pending = await request('login',{body:{email:'pending@example.invalid',password}})
  const accounts = { Administrador: owner }
  for (const [index,role] of ['Apóstol General','Asistencia Apostólica','Pastor de Distrito','Pastor Local','Asistencia Pastoral','Usuario','Discipulador','Multimedia','Pastor'].entries()) {
    const email = `role-${index}@example.invalid`
    const [result] = await db.execute("INSERT INTO usuario(correo_login,password_hash,estado_usuario) VALUES (?,?,'activo')",[email,secrets[0].password_hash])
    await db.execute('INSERT INTO usuario_rol(id_usuario,id_rol) SELECT ?,id_rol FROM rol_sistema WHERE nombre=?',[result.insertId,role])
    accounts[role] = await request('login',{body:{email,password}})
  }
  const ownerId = owner.data.user.id
  async function event(title, { published = 1, type = 'evento', days = 1, state = 'programada', archived = 0 } = {}) {
    const [result] = await db.execute(`INSERT INTO actividad(tipo_actividad,titulo,fecha,hora,lugar,publicado,archivado,estado_actividad,id_usuario_creacion)
      VALUES (?,?,DATE_ADD(DATE(DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 HOUR)),INTERVAL ? DAY),'18:30','Templo principal',?,?,?,?)`,[type,title,days,published,archived,state,ownerId])
    return result.insertId
  }
  const mainEvent = await event('Encuentro de la comunidad')
  await event('Culto del domingo',{type:'culto'})
  await event('Evento cancelado',{state:'cancelada'})
  await event('Encuentro de familias')
  await event('Borrador privado',{published:0})
  await event('Reunión privada del grupo',{type:'reunion_grupo'})
  await event('Evento archivado',{archived:1})
  await event('Evento pasado',{days:-1})
  const feed = async account => (await request('notifications',{cookie:account.cookie})).data
  const dismiss = (account,id,options = {}) => request('notifications/dismiss',{cookie:account.cookie,body:{id},...options})
  await request('notifications',{status:401})
  await request('notifications/dismiss',{body:{id:'account:1'},status:401})
  const administrators = ['Administrador','Apóstol General','Asistencia Apostólica','Pastor de Distrito','Pastor Local','Asistencia Pastoral']
  for (const role of administrators) {
    const data = await feed(accounts[role])
    assert.equal(data.canManageAccounts,true,role)
    assert.equal(data.total,5,role)
    assert.equal(data.items.filter(item=>item.type==='account').length,1,role)
    assert.equal(data.items[0].title,pending.data.user.email)
    assert.equal((await request('admin/users',{cookie:accounts[role].cookie})).data.users.length,11)
  }
  const accountNotice = (await feed(owner)).items.find(item=>item.type==='account')
  for (const account of [accounts.Usuario,accounts.Discipulador,accounts.Multimedia,accounts.Pastor,pending]) {
    const data = await feed(account)
    assert.equal(data.canManageAccounts,false)
    assert.equal(data.total,4)
    assert.ok(data.items.every(item=>item.type==='event'))
    assert.ok(!JSON.stringify(data).includes(pending.data.user.email))
    assert.ok(data.items.some(item=>item.message.startsWith('Cancelado')))
    assert.ok(!JSON.stringify(data).includes('privad'))
    await dismiss(account,accountNotice.id,{status:404})
  }
  // A generic permission on an unrelated role must not reveal account requests.
  await db.execute("INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance) SELECT id_rol,'usuarios.gestionar','todos' FROM rol_sistema WHERE nombre='Multimedia'")
  assert.equal((await feed(accounts.Multimedia)).canManageAccounts,false)
  await dismiss(accounts.Multimedia,accountNotice.id,{status:404})
  await dismiss(owner,'invalid',{status:400})
  await dismiss(owner,'account:99999999',{status:404})
  await dismiss(owner,accountNotice.id,{status:403,extra:{Origin:'https://untrusted.invalid'}})
  await dismiss(owner,accountNotice.id)
  await dismiss(owner,accountNotice.id) // Idempotent retry.
  assert.equal((await feed(owner)).total,4)
  assert.equal((await feed(accounts['Asistencia Pastoral'])).total,5)
  assert.equal((await request('me',{cookie:pending.cookie})).data.user.state,'pendiente')
  assert.ok((await request('admin/users',{cookie:owner.cookie})).data.users.some(user=>user.id===pending.data.user.id))
  const anotherSession = await request('login',{body:{email:owner.data.user.email,password}})
  assert.equal((await feed(anotherSession)).items.some(item=>item.id===accountNotice.id),false)
  const eventNotice = (await feed(accounts.Usuario)).items.find(item=>item.title==='Encuentro de la comunidad')
  await dismiss(accounts.Usuario,eventNotice.id)
  assert.equal((await feed(accounts.Usuario)).total,3)
  assert.equal((await feed(accounts.Multimedia)).total,4)
  await db.execute("UPDATE actividad SET hora='19:30' WHERE id_actividad=?",[mainEvent])
  const changed = (await feed(accounts.Usuario)).items.find(item=>item.title==='Encuentro de la comunidad')
  assert.ok(changed); assert.notEqual(changed.id,eventNotice.id); assert.match(changed.message,/19:30/)
  await db.execute("UPDATE actividad SET estado_actividad='cancelada' WHERE id_actividad=?",[mainEvent])
  assert.match((await feed(accounts.Usuario)).items.find(item=>item.title===changed.title).message,/Cancelado/)
  await db.query("CREATE TRIGGER fail_notice_dismiss BEFORE INSERT ON notificacion_descartada FOR EACH ROW SET NEW.id_notificacion=NULL")
  const failureNotice = (await feed(accounts.Multimedia)).items[0]
  await dismiss(accounts.Multimedia,failureNotice.id,{status:503})
  assert.ok((await feed(accounts.Multimedia)).items.some(item=>item.id===failureNotice.id))
  await db.query('DROP TRIGGER fail_notice_dismiss')
  // Revoking the account permission removes requests on the very next API read.
  await db.execute("DELETE rp FROM rol_permiso rp JOIN rol_sistema r ON r.id_rol=rp.id_rol WHERE r.nombre='Pastor Local' AND rp.codigo_permiso='usuarios.gestionar'")
  assert.equal((await feed(accounts['Pastor Local'])).canManageAccounts,false)
  assert.ok((await feed(accounts['Pastor Local'])).items.every(item=>item.type==='event'))
  console.log('PASS API: all seven admin/pastoral roles, remaining profiles, public events only, revocation, per-account persistence, idempotency, schedule/cancellation updates, origin/identity checks and failed-dismiss recovery')

  if (process.argv.includes('--ui')) {
    const ui = 'http://127.0.0.1:5193'
    process.env.APP_ORIGINS = `${origin},${ui}`
    preview = spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5193','--strictPort'],{windowsHide:true,stdio:'ignore'})
    let ready = false
    for (let index=0;index<80;index++) { try { ready=(await fetch(ui)).ok } catch {} if(ready)break;await delay(200) }
    assert.ok(ready,'No inició la vista previa.')
    const {chromium} = await import('../.secrets/browser-tools/node_modules/playwright-core/index.mjs')
    browser = await chromium.launch({channel:'msedge',headless:true})
    // Notifications were removed from the panel: no bell for any profile (the API above remains).
    const errors=[]
    for (const [name, mobile] of [['Apóstol General', false], ['Multimedia', true]]) {
      const context = await browser.newContext({viewport:{width:mobile?390:1440,height:900},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'})
      await context.addCookies([{name:'calvario_session',value:accounts[name].cookie.split('=')[1],url:ui+'/api',httpOnly:true,sameSite:'Strict'}])
      await context.route('**/api/**',async route=>{const url=new URL(route.request().url());const response=await route.fetch({url:origin+url.pathname+url.search});await route.fulfill({response})})
      const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
      await page.goto(ui+'/#gestion',{waitUntil:'domcontentloaded'});await page.locator('#dashboard-title').waitFor()
      assert.equal(await page.getByRole('button',{name:/Notificaciones/}).count(),0)
      assert.equal(await page.locator('#account-notifications-panel').count(),0)
      await context.close()
    }
    assert.deepEqual(errors,[])
    console.log('PASS UI: the panel no longer shows notifications for administrative or remaining profiles')
  }
  await db.execute('DELETE FROM usuario WHERE id_usuario=?',[accounts.Usuario.data.user.id])
  const [orphaned]=await db.query('SELECT d.* FROM notificacion_descartada d LEFT JOIN usuario u ON u.id_usuario=d.id_usuario WHERE u.id_usuario IS NULL')
  assert.equal(orphaned.length,0)
} finally {
  if(browser)await browser.close()
  if(preview){preview.kill();await once(preview,'exit')}
  if(server)await new Promise(resolve=>server.close(resolve))
  if(pool)await pool.end()
  await db.query(`DROP DATABASE IF EXISTS \`${database}\``)
  await db.end()
  console.log('Base temporal eliminada. Las cuentas existentes se conservaron.')
}
