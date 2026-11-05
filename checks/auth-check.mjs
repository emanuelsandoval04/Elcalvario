import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { pool } from '../server/db.js'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.TEMP + '/nexusbox-browser-check/node_modules/playwright')
const base = process.env.UI_ORIGIN || 'http://127.0.0.1:5174'
const email = `check-${randomUUID()}@example.invalid`
const browserEmail = `check-${randomUUID()}@example.invalid`
const password = `Test-${randomUUID()}`
let cookie = ''
let browser
async function request(path, body, options = {}) {
 const response = await fetch(`${base}/api/auth/${path}`, {
  method: body ? 'POST' : 'GET',
  headers: { ...(body ? {'Content-Type':'application/json',Origin:base}:{}), ...(cookie ? {Cookie:cookie}:{}), ...options },
  body: body ? JSON.stringify(body) : undefined,
 })
 const newCookie=response.headers.get('set-cookie')
 if(newCookie) cookie=newCookie.split(';')[0]
 return {response, data:await response.json(), newCookie}
}
try {
 const [bootstrap]=await pool.execute('SELECT bootstrap_completado FROM configuracion_sistema WHERE id=1')
 if(!bootstrap[0]?.bootstrap_completado) throw new Error('Registro inicial pendiente: usa checks/superadmin-check.mjs para probar en una base aislada sin ocupar el lugar del propietario.')
 assert.equal((await request('me')).response.status,401)
 assert.equal((await request('register',{email,password:'short'})).response.status,400)
 assert.equal((await request('register',{email,password},{Origin:'https://untrusted.invalid'})).response.status,403)
 const created=await request('register',{email:email.toUpperCase(),password,role:'Administrador'})
 assert.equal(created.response.status,201)
 assert.equal(created.data.user.email,email)
 assert.equal(created.data.user.state,'pendiente')
 assert.deepEqual(created.data.user.roles,[])
 assert.deepEqual(created.data.user.permissions,{})
 assert.match(created.newCookie,/HttpOnly/i)
 assert.match(created.newCookie,/SameSite=Strict/i)
 assert.equal('password_hash' in created.data.user,false)
 const [rows]=await pool.execute('SELECT password_hash FROM usuario WHERE correo_login=?',[email])
 assert.match(rows[0].password_hash,/^scrypt\$/)
 assert.notEqual(rows[0].password_hash,password)
 const [sessions]=await pool.execute('SELECT token_hash FROM sesion_usuario WHERE id_usuario=?',[created.data.user.id])
 assert.notEqual(sessions[0].token_hash,cookie.split('=')[1])
 assert.equal((await request('me')).data.user.email,email)
 assert.equal((await request('register',{email,password})).response.status,409)
 const oldCookie=cookie
 await request('logout',{})
 cookie=oldCookie
 assert.equal((await request('me')).response.status,401)
 cookie=''
 assert.equal((await request('login',{email,password:'incorrect-password'})).response.status,401)
 assert.equal((await request('login',{email:"' OR 1=1 --",password})).response.status,400)
 assert.equal((await request('login',{email,password})).response.status,200)
 await pool.execute('UPDATE sesion_usuario SET fecha_expiracion = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE id_usuario=?',[created.data.user.id])
 assert.equal((await request('me')).response.status,401)
 await pool.execute("UPDATE usuario SET estado_usuario='bloqueado' WHERE id_usuario=?",[created.data.user.id])
 assert.equal((await request('login',{email,password})).response.status,401)
 console.log('PASS API: registration, duplicate email, hashing, basic role, cookie, logout, expiration, blocked account, SQL injection and origin validation')

 browser=await chromium.launch({headless:true,channel:'msedge'})
 const page=await browser.newPage({viewport:{width:1440,height:900}})
 const errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.goto(`${base}/#login`,{waitUntil:'domcontentloaded'})
 await page.getByRole('link',{name:'Crear mi cuenta'}).click()
 await page.getByRole('button',{name:'Crear cuenta',exact:true}).waitFor()
 await page.getByLabel('Correo electrónico',{exact:true}).fill(browserEmail)
 await page.getByLabel('Contraseña',{exact:true}).fill(password)
 await page.getByLabel('Confirmar contraseña',{exact:true}).fill('mismatch-password')
 await page.getByRole('button',{name:'Crear cuenta',exact:true}).click()
 await page.getByText('Las contraseñas no coinciden.').waitFor()
 await page.getByLabel('Confirmar contraseña',{exact:true}).fill(password)
 await page.getByRole('button',{name:'Crear cuenta',exact:true}).click()
 await page.waitForURL(`${base}/#gestion`)
 await page.getByRole('heading',{name:'Tu cuenta está pendiente por activación.',exact:true}).waitFor()
 await page.reload({waitUntil:'domcontentloaded'})
 await page.getByRole('heading',{name:'Tu cuenta está pendiente por activación.',exact:true}).waitFor()
 await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click()
 await page.getByRole('button',{name:'Iniciar sesión',exact:true}).waitFor()
 await page.getByLabel('Correo electrónico',{exact:true}).fill(browserEmail)
 await page.getByLabel('Contraseña',{exact:true}).fill('incorrect-password')
 await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click()
 await page.getByText('Correo o contraseña incorrectos.').waitFor()
 await page.getByLabel('Contraseña',{exact:true}).fill(password)
 await page.getByRole('button',{name:'Mostrar contraseña'}).click()
 assert.equal(await page.locator('#login-password').getAttribute('type'),'text')
 await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click()
 await page.waitForURL(`${base}/#gestion`)
 await page.getByRole('heading',{name:'Tu cuenta está pendiente por activación.',exact:true}).waitFor()
 await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click()
 await page.getByRole('button',{name:'Iniciar sesión',exact:true}).waitFor()
 for(const hash of ['#login','#registro']){
  await page.goto(`${base}/${hash}`,{waitUntil:'domcontentloaded'})
  await page.waitForFunction(()=>!document.querySelector('.login-submit')?.disabled)
  for(const [width,height] of [[1440,900],[1366,768],[1280,720],[390,844],[375,667],[320,667]]){
   await page.setViewportSize({width,height})
   await page.waitForTimeout(150)
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
   const bottom=await page.locator('.login-page').evaluate(e=>e.getBoundingClientRect().bottom)
   assert.ok(bottom<=height+1,`${hash} scroll ${width}x${height}: ${bottom}`)
   await page.screenshot({path:`checks/auth-${hash.slice(1)}-${width}.png`,fullPage:true,animations:'disabled'})
  }
 }
 assert.deepEqual(errors,[])
 console.log('PASS browser: register, confirmation, persist on refresh, login, logout, password toggle and viewport layout')
 if(!process.argv.includes('--skip-rate-limit')) {
  cookie=''
  let limited
  for(let i=0;i<21;i++) limited=await request('login',{email:'invalid',password:'invalid'})
  assert.equal(limited.response.status,429)
  console.log('PASS rate limiting')
 }
} finally {
 if(browser) await browser.close()
 await pool.execute('DELETE FROM usuario WHERE correo_login IN (?, ?)',[email,browserEmail])
 await pool.end()
 console.log('Temporary test accounts removed')
}
