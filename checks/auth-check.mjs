import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import mysql from 'mysql2/promise'
import { applyMigrations } from '../server/migration-runner.js'

// Sign-in in an isolated database. Public self-registration is closed: accounts are created by the
// administration, so this check creates one and covers login, session, logout and the login screen.
const database = `calvario_auth_test_${randomUUID().replaceAll('-', '')}`
process.env.DB_NAME = database
const { databaseConfig } = await import('../server/config.js')
assert.ok(['localhost', '127.0.0.1', '::1'].includes(databaseConfig.host), 'Esta prueba solo se ejecuta en MySQL local.')
const { database: ignored, ...configuration } = databaseConfig
const db = await mysql.createConnection(configuration)
const email = `check-${randomUUID()}@example.invalid`
const password = `Test-${randomUUID()}`
let pool, server, browser, preview, cookie = ''
try {
  await db.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
  await db.query(`USE \`${database}\``); await applyMigrations(db)
  pool = (await import('../server/db.js')).pool
  const { createAccount, createOwner } = await import('./test-accounts.mjs')
  const { default: app } = await import('../server/app.js')
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  const ui = process.env.UI_ORIGIN || 'http://127.0.0.1:5184'
  process.env.APP_ORIGINS = `${base},${ui}`
  async function request(path, body, options = {}) {
    const response = await fetch(`${base}/api/auth/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { ...(body ? { 'Content-Type': 'application/json', Origin: base } : {}), ...(cookie ? { Cookie: cookie } : {}), ...options },
      body: body ? JSON.stringify(body) : undefined,
    })
    const newCookie = response.headers.get('set-cookie')
    if (newCookie) cookie = newCookie.split(';')[0]
    return { response, data: await response.json(), newCookie }
  }
  await createOwner({ email: 'owner@example.invalid', password })
  assert.equal((await request('me')).response.status, 401)
  // Registration is closed for everyone, whatever the input.
  for (const body of [{ email, password: 'short' }, { email, password }, { email, password, role: 'Administrador' }]) assert.equal((await request('register', body)).response.status, 403)
  assert.equal((await request('register', { email, password }, { Origin: 'https://untrusted.invalid' })).response.status, 403)
  const id = await createAccount(db, { email, password, role: 'Usuario' })
  const created = await request('login', { email: email.toUpperCase(), password })
  assert.equal(created.response.status, 200)
  assert.equal(created.data.user.email, email)
  assert.equal(created.data.user.state, 'activo')
  assert.deepEqual(created.data.user.roles, ['Usuario'])
  assert.match(created.newCookie, /HttpOnly/i)
  assert.match(created.newCookie, /SameSite=Strict/i)
  assert.equal('password_hash' in created.data.user, false)
  const [rows] = await pool.execute('SELECT password_hash FROM usuario WHERE correo_login=?', [email])
  assert.match(rows[0].password_hash, /^scrypt\$/)
  assert.notEqual(rows[0].password_hash, password)
  const [sessions] = await pool.execute('SELECT token_hash FROM sesion_usuario WHERE id_usuario=?', [id])
  assert.notEqual(sessions[0].token_hash, cookie.split('=')[1], 'La base guarda el token cifrado, no el de la cookie')
  assert.equal((await request('me')).data.user.email, email)
  const oldCookie = cookie
  await request('logout', {})
  cookie = oldCookie
  assert.equal((await request('me')).response.status, 401, 'Cerrar sesión invalida la cookie anterior')
  cookie = ''
  assert.equal((await request('login', { email, password: 'incorrect-password' })).response.status, 401)
  assert.equal((await request('login', { email: "' OR 1=1 --", password })).response.status, 400)
  assert.equal((await request('login', { email, password })).response.status, 200)
  await pool.execute('UPDATE sesion_usuario SET fecha_expiracion = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE id_usuario=?', [id])
  assert.equal((await request('me')).response.status, 401)
  await pool.execute("UPDATE usuario SET estado_usuario='bloqueado' WHERE id_usuario=?", [id])
  assert.equal((await request('login', { email, password })).response.status, 401)
  await pool.execute("UPDATE usuario SET estado_usuario='activo' WHERE id_usuario=?", [id])
  console.log('PASS API: closed public registration, login with case-insensitive email, hashing, cookie, logout, expiration, blocked account, SQL injection and origin validation')

  if (!process.env.UI_ORIGIN) {
    preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5184', '--strictPort'], { windowsHide: true, stdio: 'ignore' })
    for (let i = 0; i < 80; i++) { try { if ((await fetch(ui)).ok) break } catch {} await delay(150) }
  }
  const { chromium } = await import('../.secrets/browser-tools/node_modules/playwright-core/index.mjs')
  browser = await chromium.launch({ headless: true, channel: 'msedge' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
  await context.route('**/api/**', async route => { const url = new URL(route.request().url()); await route.fulfill({ response: await route.fetch({ url: `${base}${url.pathname}${url.search}` }) }) })
  const page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  // The old registration address opens the login, which offers no self-registration.
  await page.goto(`${ui}/#registro`, { waitUntil: 'domcontentloaded' })
  await page.waitForURL(`${ui}/#login`)
  assert.equal(await page.getByRole('link', { name: 'Crear mi cuenta' }).count(), 0)
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill('incorrect-password')
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await page.getByText('Correo o contraseña incorrectos.').waitFor()
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Mostrar contraseña' }).click()
  assert.equal(await page.locator('#login-password').getAttribute('type'), 'text')
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await page.waitForURL(`${ui}/#gestion`)
  await page.reload({ waitUntil: 'domcontentloaded' })
  assert.equal((await page.evaluate(async () => (await (await fetch('/api/auth/me')).json()).user.email)), email, 'La sesión sigue al recargar')
  await page.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) })
  await page.goto(`${ui}/#login`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor()
  await page.waitForFunction(() => !document.querySelector('.login-submit')?.disabled)
  for (const [width, height] of [[1440, 900], [1366, 768], [1280, 720], [390, 844], [375, 667], [320, 667]]) {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(150)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Desbordamiento en ${width}px`)
    const bottom = await page.locator('.login-page').evaluate(element => element.getBoundingClientRect().bottom)
    assert.ok(bottom <= height + 1, `login ${width}x${height}: ${bottom}`)
    await page.screenshot({ path: `checks/auth-login-${width}.png`, fullPage: true, animations: 'disabled' })
  }
  assert.deepEqual(errors, [])
  console.log('PASS browser: old registration link opens login, wrong password, password toggle, login, session on reload, logout and viewport layout')
  if (!process.argv.includes('--skip-rate-limit')) {
    cookie = ''
    let limited
    for (let i = 0; i < 21; i++) limited = await request('login', { email: 'invalid', password: 'invalid' })
    assert.equal(limited.response.status, 429)
    console.log('PASS rate limiting')
  }
} finally {
  if (browser) await browser.close()
  if (preview) preview.kill()
  if (server) await new Promise(resolve => server.close(resolve))
  if (pool) await pool.end()
  await db.query(`DROP DATABASE IF EXISTS \`${database}\``); await db.end()
  console.log('Base temporal de acceso eliminada; datos locales conservados.')
}
