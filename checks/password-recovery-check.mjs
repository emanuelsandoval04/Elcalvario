import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import mysql from 'mysql2/promise'
import nodemailer from 'nodemailer'
import { applyMigrations } from '../server/migration-runner.js'

const database = `calvario_recovery_test_${randomUUID().replaceAll('-', '')}`
process.env.DB_NAME = database
process.env.DB_CONNECTION_LIMIT = '2'
const { databaseConfig } = await import('../server/config.js')
assert.ok(['localhost', '127.0.0.1', '::1'].includes(databaseConfig.host), 'La prueba solo admite MySQL local y una base temporal.')
const { database: ignored, ...configuration } = databaseConfig
const db = await mysql.createConnection(configuration)
const nativeFetch = globalThis.fetch
const nativeCreateTransport = nodemailer.createTransport
const gmailMode = process.argv.includes('--gmail')
const contextKey = Symbol.for('@vercel/request-context')
const previousContext = globalThis[contextKey]
const tasks = [], messages = []
globalThis[contextKey] = { get: () => ({ waitUntil: task => tasks.push(task) }) }
let providerStatus = 200, pool, server, browser, preview, releaseEmail
globalThis.fetch = async (url, options) => {
  if (String(url) !== 'https://api.resend.com/emails') return nativeFetch(url, options)
  assert.equal(gmailMode, false, 'Gmail no debe utilizar Resend.')
  messages.push(JSON.parse(options.body))
  if (releaseEmail) await releaseEmail.promise
  return new Response(JSON.stringify(providerStatus === 200 ? { id: randomUUID() } : { error: 'simulated failure' }), { status: providerStatus })
}
nodemailer.createTransport = options => {
  assert.equal(gmailMode, true, 'Resend no debe utilizar SMTP.')
  assert.equal(options.host, 'smtp.gmail.com'); assert.equal(options.port, 465)
  assert.equal(options.secure, true); assert.equal(options.tls.rejectUnauthorized, true)
  assert.equal(options.auth.user, 'support@gmail.com')
  return {
    async sendMail(message) {
      messages.push(message)
      if (releaseEmail) await releaseEmail.promise
      if (providerStatus !== 200) throw Object.assign(new Error('simulated SMTP failure'), { code: 'EAUTH' })
      return { accepted: message.to, rejected: [] }
    },
    close() {},
  }
}
const flush = async () => { while (tasks.length) await Promise.all(tasks.splice(0)) }
try {
  await db.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
  await db.query(`USE \`${database}\``)
  await applyMigrations(db); await applyMigrations(db)
  pool = (await import('../server/db.js')).pool
  const { default: app } = await import('../server/app.js')
  const { bootstrapAdmin } = await import('../server/bootstrap-admin.js')
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  Object.assign(process.env, { APP_ORIGINS: origin, APP_PUBLIC_URL: origin, MAIL_PROVIDER: gmailMode ? 'gmail' : 'resend', RESEND_API_KEY: 're_fake_local_test', RESEND_FROM_EMAIL: 'acceso@example.invalid', GMAIL_USER: 'support@gmail.com', GMAIL_APP_PASSWORD: 'abcdefghijklmnop' })
  const password = `Old-${randomUUID()}`, nextPassword = `New-${randomUUID()}`
  async function request(path, { body, cookie = '', status = 200, headers = {} } = {}) {
    const response = await nativeFetch(`${origin}/api/auth/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Origin: origin, Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await response.json()
    if (status !== null) assert.equal(response.status, status, `${path}: ${JSON.stringify(data)}`)
    return { data, status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie, newCookie: response.headers.get('set-cookie') }
  }
  await bootstrapAdmin({ name: 'Propietario', email: 'owner@example.invalid', password })
  const owner = await request('login', { body: { email: 'owner@example.invalid', password } })
  const roles = (await request('admin/users', { cookie: owner.cookie })).data.roles
  const basic = (await request('admin/users', { cookie: owner.cookie, body: { name: 'Cuenta de prueba', email: 'member@example.invalid', password, confirmation: password, roleId: roles.find(role => role.name === 'Usuario').id }, status: 201 })).data.user
  assert.equal(messages.length, 1, 'La creación envía un correo de bienvenida.')
  messages.length = 0
  const basicSession = await request('login', { body: { email: basic.email, password } })
  const secondSession = await request('login', { body: { email: basic.email, password } })
  async function clearLimits() { await db.execute('DELETE FROM limite_solicitud') }
  async function issue(email = basic.email) {
    await clearLimits()
    const before = messages.length
    const result = await request('forgot-password', { body: { email } })
    await flush()
    assert.equal(messages.length, before + 1)
    const mail = messages.at(-1)
    const token = mail.text.match(/#restablecer\?token=([a-f0-9]{64})/)[1]
    assert.ok(!JSON.stringify(result.data).includes(token))
    assert.equal(result.newCookie, null)
    const [[stored]] = await db.execute('SELECT *,TIMESTAMPDIFF(SECOND,fecha_creacion,fecha_expiracion) AS duration FROM recuperacion_contrasena WHERE token_hash=?', [createHash('sha256').update(token).digest('hex')])
    assert.equal(stored.duration, 900); assert.equal(stored.enviado, 1)
    assert.ok(!JSON.stringify(stored).includes(token))
    return token
  }
  const resetBody = token => ({ token, newPassword: nextPassword, confirmation: nextPassword })
  await request('forgot-password', { body: { email: 'invalid' }, status: 400 })
  await request('forgot-password', { body: { email: basic.email }, headers: { Origin: 'https://evil.invalid' }, status: 403 })
  await request('reset-password', { body: resetBody('x'), status: 400 })
  const credentialName = gmailMode ? 'GMAIL_APP_PASSWORD' : 'RESEND_API_KEY'
  const missingKey = process.env[credentialName]
  delete process.env[credentialName]
  await request('forgot-password', { body: { email: basic.email }, status: 503 })
  process.env[credentialName] = missingKey
  await clearLimits()
  releaseEmail = {}; releaseEmail.promise = new Promise(resolve => { releaseEmail.resolve = resolve })
  const existing = await request('forgot-password', { body: { email: basic.email.toUpperCase() } })
  const unknown = await request('forgot-password', { body: { email: 'unknown@example.invalid' } })
  assert.deepEqual(existing.data, unknown.data, 'La respuesta no debe revelar cuentas ni esperar al proveedor.')
  releaseEmail.resolve(); releaseEmail = null; await flush()
  assert.equal(messages.length, 1)
  for (const state of ['bloqueado', 'inactivo']) {
    await db.execute('UPDATE usuario SET estado_usuario=? WHERE id_usuario=?', [state, basic.id])
    await clearLimits()
    assert.deepEqual((await request('forgot-password', { body: { email: basic.email } })).data, existing.data)
    await flush(); assert.equal(messages.length, 1)
  }
  await db.execute("UPDATE usuario SET estado_usuario='activo' WHERE id_usuario=?", [basic.id])
  const token = await issue()
  await request('reset-password/validate', { body: { token } })
  await request('reset-password/validate', { body: { token } })
  await request('reset-password', { body: { ...resetBody(token), newPassword: 'short', confirmation: 'short' }, status: 400 })
  await request('reset-password', { body: { ...resetBody(token), confirmation: 'different' }, status: 400 })
  assert.equal((await request('reset-password', { body: resetBody(token), headers: { Origin: 'https://evil.invalid' }, status: 403 })).status, 403)
  const attempts = await Promise.all([request('reset-password', { body: { ...resetBody(token), id: owner.data.user.id, email: 'owner@example.invalid' }, status: null }), request('reset-password', { body: resetBody(token), status: null })])
  assert.deepEqual(attempts.map(result => result.status).sort(), [200, 400], 'Un enlace solo se puede consumir una vez bajo concurrencia.')
  assert.equal(attempts.find(result => result.status === 200).newCookie, null)
  await request('me', { cookie: basicSession.cookie, status: 401 })
  await request('me', { cookie: secondSession.cookie, status: 401 })
  await request('login', { body: { email: basic.email, password }, status: 401 })
  let fresh = await request('login', { body: { email: basic.email, password: nextPassword } })
  assert.deepEqual(fresh.data.user.roles, ['Usuario']); assert.equal(fresh.data.user.state, 'activo')
  await request('me', { cookie: owner.cookie })
  await request('reset-password/validate', { body: { token }, status: 400 })
  const expired = await issue()
  await db.execute('UPDATE recuperacion_contrasena SET fecha_expiracion=UTC_TIMESTAMP() WHERE id_usuario=?', [basic.id])
  await request('reset-password/validate', { body: { token: expired }, status: 400 })
  await request('reset-password', { body: resetBody(expired), status: 400 })
  const replaced = await issue(), latest = await issue()
  await request('reset-password/validate', { body: { token: replaced }, status: 400 })
  await request('reset-password/validate', { body: { token: latest } })
  await request('account/password', { cookie: fresh.cookie, body: { currentPassword: nextPassword, newPassword: password } })
  await request('reset-password', { body: resetBody(latest), status: 400 })
  fresh = await request('login', { body: { email: basic.email, password } })
  const beforeEmail = await issue()
  await request('account/profile', { cookie: fresh.cookie, body: { name: basic.name, email: 'new-address@example.invalid', currentPassword: password } })
  await request('reset-password/validate', { body: { token: beforeEmail }, status: 400 })
  const blockedToken = await issue('new-address@example.invalid')
  await db.execute("UPDATE usuario SET estado_usuario='bloqueado' WHERE id_usuario=?", [basic.id])
  await request('reset-password', { body: resetBody(blockedToken), status: 400 })
  await db.execute("UPDATE usuario SET estado_usuario='pendiente' WHERE id_usuario=?", [basic.id])
  const pendingToken = await issue('new-address@example.invalid')
  await request('reset-password', { body: resetBody(pendingToken) })
  assert.equal((await request('login', { body: { email: 'new-address@example.invalid', password: nextPassword } })).data.user.state, 'pendiente')
  providerStatus = 503
  await clearLimits()
  assert.deepEqual((await request('forgot-password', { body: { email: 'new-address@example.invalid' } })).data, existing.data)
  await flush()
  assert.equal((await db.execute('SELECT COUNT(*) AS total FROM recuperacion_contrasena WHERE id_usuario=?', [basic.id]))[0][0].total, 0)
  providerStatus = 200
  // Failed audit must roll back the password, sessions and token consumption.
  const rollbackToken = await issue('new-address@example.invalid')
  await db.query("CREATE TRIGGER fail_recovery_audit BEFORE INSERT ON auditoria_seguridad FOR EACH ROW SET NEW.accion=IF(NEW.accion='account.password_recovered',NULL,NEW.accion)")
  await request('reset-password', { body: { token: rollbackToken, newPassword: password, confirmation: password }, status: 503 })
  await db.query('DROP TRIGGER fail_recovery_audit')
  await request('reset-password/validate', { body: { token: rollbackToken } })
  await request('login', { body: { email: 'new-address@example.invalid', password: nextPassword } })
  await clearLimits()
  for (let index = 0; index < 3; index++) await request('forgot-password', { body: { email: 'rate-test@example.invalid' } })
  await request('forgot-password', { body: { email: 'rate-test@example.invalid' }, status: 429 })
  await flush()
  console.log(`PASS API (${gmailMode ? 'Gmail' : 'Resend'}): 15-minute expiry, hashed single-use links, concurrency, reissue, revoked sessions, unchanged roles/state, credential changes, provider failure, privacy, rollback and rate limits with a two-connection pool`)

  if (process.argv.includes('--ui')) {
    const ui = 'http://127.0.0.1:5195'
    process.env.APP_ORIGINS = `${origin},${ui}`; process.env.APP_PUBLIC_URL = ui
    preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5195', '--strictPort'], { windowsHide: true, stdio: 'ignore' })
    let ready = false
    for (let index = 0; index < 80; index++) { try { ready = (await nativeFetch(ui)).ok } catch {} if (ready) break; await delay(200) }
    assert.ok(ready, 'No inició la vista previa local.')
    const { chromium } = await import('../.secrets/browser-tools/node_modules/playwright-core/index.mjs')
    browser = await chromium.launch({ channel: 'msedge', headless: true })
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
    await context.route('**/api/**', async route => {
      const url = new URL(route.request().url())
      const response = await route.fetch({ url: origin + url.pathname + url.search })
      await route.fulfill({ response })
    })
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await clearLimits()
    await page.goto(`${ui}/#login`)
    await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click()
    await page.getByLabel('Correo electrónico', { exact: true }).fill('new-address@example.invalid')
    await page.getByRole('button', { name: 'Enviar enlace de recuperación' }).click()
    await page.getByRole('heading', { name: 'Revisa tu correo.' }).waitFor(); await flush()
    assert.match(await page.getByRole('status').innerText(), /15 minutos/)
    const link = messages.at(-1).text.match(/http:\/\/\S+/)[0]
    await page.goto(link)
    await page.getByLabel('Nueva contraseña', { exact: true }).waitFor()
    await page.reload()
    await page.getByLabel('Nueva contraseña', { exact: true }).fill(password)
    await page.getByLabel('Confirmar nueva contraseña', { exact: true }).fill(nextPassword)
    await page.getByRole('button', { name: 'Guardar nueva contraseña' }).click()
    await page.getByRole('alert').filter({ hasText: 'Las contraseñas no coinciden.' }).waitFor()
    await page.getByLabel('Confirmar nueva contraseña', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Mostrar contraseñas' }).click()
    assert.equal(await page.getByLabel('Nueva contraseña', { exact: true }).getAttribute('type'), 'text')
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await page.screenshot({ path: `checks/password-recovery-${width}.png`, fullPage: true })
    }
    await page.getByRole('button', { name: 'Guardar nueva contraseña' }).click()
    await page.getByRole('heading', { name: 'Contraseña actualizada.' }).waitFor()
    assert.equal(new URL(page.url()).hash, '#restablecer')
    await page.getByRole('link', { name: 'Iniciar sesión', exact: true }).click()
    await page.getByLabel('Correo electrónico', { exact: true }).fill('new-address@example.invalid')
    await page.getByLabel('Contraseña', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await page.waitForURL('**/#gestion')
    await page.goto(link)
    await page.getByRole('alert').filter({ hasText: 'El enlace no es válido o ya venció.' }).waitFor()
    await page.getByRole('link', { name: 'Solicitar un nuevo enlace' }).waitFor()
    assert.equal(await page.locator('input[name="newPassword"]').count(), 0)
    assert.deepEqual(errors, [])
    console.log('PASS UI: forgot-password link, request, email link, reload, validation, password visibility/confirmation, success, login and reused-link rejection at 1440/390/320 px')
  }
} finally {
  if (releaseEmail) releaseEmail.resolve()
  await flush()
  if (browser) await browser.close()
  if (preview) { preview.kill(); await once(preview, 'exit') }
  if (server) await new Promise(resolve => server.close(resolve))
  if (pool) await pool.end()
  await db.query(`DROP DATABASE IF EXISTS \`${database}\``)
  await db.end()
  globalThis.fetch = nativeFetch
  nodemailer.createTransport = nativeCreateTransport
  if (previousContext === undefined) delete globalThis[contextKey]
  else globalThis[contextKey] = previousContext
}
