import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import mysql from 'mysql2/promise'
import express from 'express'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { applyMigrations } from '../server/migration-runner.js'
import { jsonBody } from '../server/body-parser.js'

const testDatabase = `calvario_display_test_${randomUUID().replaceAll('-', '')}`
assert.match(testDatabase, /^calvario_display_test_[a-f0-9]{32}$/)
process.env.DB_NAME = testDatabase
const { databaseConfig } = await import('../server/config.js')
const { database, ...config } = databaseConfig
const connection = await mysql.createConnection(config)
const ui = process.env.UI_ORIGIN || 'http://127.0.0.1:5186'
let pool, server, browser, preview
try {
  await connection.query(`CREATE DATABASE \`${testDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
  await connection.query(`USE \`${testDatabase}\``)
  await applyMigrations(connection)
  pool = (await import('../server/db.js')).pool
  const { createAccount, createOwner } = await import('./test-accounts.mjs')
  const { authRouter } = await import('../server/auth.js')
  const { managementRouter, publicRouter } = await import('../server/management.js')
  const app = express()
  app.use(jsonBody); app.use('/api/auth', authRouter); app.use('/api/management', managementRouter); app.use('/api/public', publicRouter)
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  process.env.APP_ORIGINS = `${base},${ui}`
  const password = `Display-${randomUUID()}`
  async function api(path, body, cookie = '', expected = 200, headers = {}) {
    const response = await fetch(`${base}/api/auth/${path}`, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined })
    const data = await response.json()
    assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`)
    return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  // Public registration is closed: the owner comes from the installation, the pending account from the database.
  await api('register', { email: 'owner@example.invalid', password }, '', 403)
  await createOwner({ email: 'owner@example.invalid', password })
  await createAccount(connection, { email: 'pending@example.invalid', password })
  const owner = await api('login', { email: 'owner@example.invalid', password })
  const pending = await api('login', { email: 'pending@example.invalid', password })
  assert.equal(owner.data.user.displaySize, 'normal'); assert.equal(pending.data.user.displaySize, 'normal')
  await api('account/preferences', { displaySize: 'large' }, '', 401)
  await api('account/preferences', { displaySize: 'large' }, owner.cookie, 403, { Origin: 'https://untrusted.invalid' })
  for (const displaySize of ['huge', 130, null]) await api('account/preferences', { displaySize }, owner.cookie, 400)
  const changed = await api('account/preferences', { displaySize: 'extra-large', id: owner.data.user.id, roles: ['Administrador'], state: 'activo' }, pending.cookie)
  assert.equal(changed.data.user.displaySize, 'extra-large'); assert.equal(changed.data.user.state, 'pendiente')
  assert.deepEqual(changed.data.user.permissions, {}); assert.deepEqual(changed.data.user.roles, [])
  assert.equal((await api('me', undefined, owner.cookie)).data.user.displaySize, 'normal')
  assert.equal((await api('login', { email: pending.data.user.email, password })).data.user.displaySize, 'extra-large')
  const [preferencesBefore] = await pool.execute('SELECT * FROM preferencia_usuario ORDER BY id_usuario')
  await applyMigrations(connection)
  assert.deepEqual((await pool.execute('SELECT * FROM preferencia_usuario ORDER BY id_usuario'))[0], preferencesBefore)
  await pool.execute("UPDATE usuario SET estado_usuario='bloqueado' WHERE id_usuario=?", [pending.data.user.id])
  await api('account/preferences', { displaySize: 'large' }, pending.cookie, 401)
  await pool.execute("UPDATE usuario SET estado_usuario='pendiente' WHERE id_usuario=?", [pending.data.user.id])
  console.log('PASS API display: normal default, per-account persistence and login, own account only, invalid values/origin/session rejection, pending privileges unchanged and repeatable migration.')

  if (!process.env.UI_ORIGIN) {
    preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '5186', '--strictPort'], { windowsHide: true, stdio: 'ignore' })
    for (let i = 0; i < 80; i++) { try { if ((await fetch(ui)).ok) break } catch {} await delay(150) }
  }
  const require = createRequire(import.meta.url)
  const { chromium } = require('../.secrets/browser-tools/node_modules/playwright-core')
  browser = await chromium.launch({ headless: true, channel: 'msedge' })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  await context.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    await route.fulfill({ response: await route.fetch({ url: `${base}${url.pathname}${url.search}` }) })
  })
  const page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.setDefaultTimeout(12000)
  async function login(email) {
    await page.goto(`${ui}/#login`)
    await page.getByLabel('Correo electrónico', { exact: true }).fill(email)
    await page.getByLabel('Contraseña', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    await page.waitForURL(`${ui}/#gestion`)
    await page.getByRole('button', { name: 'Mi cuenta', exact: true }).waitFor()
  }
  async function openPreferences() {
    await page.getByRole('button', { name: 'Mi cuenta', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Tamaño de la interfaz', exact: true }).click()
    await page.getByRole('dialog', { name: 'Opciones de la cuenta' }).waitFor()
  }
  async function checkLayout(name, widths = [320, 390, 768, 1440]) {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate(() => document.fonts.ready)
      const overflow = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth, nodes: [...document.querySelectorAll('body *')].filter(n => n.getClientRects().length && n.getBoundingClientRect().right > innerWidth + 1 && !n.closest('.panel-sidebar,.nav-links')).slice(0, 5).map(n => `${n.tagName}.${n.className}${n.tagName === "BUTTON" ? `(${n.textContent.trim().slice(0, 40)} in ${n.parentElement?.className})` : ""}`) }))
      assert.ok(overflow.width <= overflow.viewport, `${name} ${width}px: ${JSON.stringify(overflow)}`)
      await page.screenshot({ path: `checks/display-${name}-${width}.png`, fullPage: false, animations: 'disabled' })
    }
  }
  await login(owner.data.user.email)
  await page.locator('.today-stat').last().waitFor()
  const baseFont = await page.locator('.today-stat strong').first().evaluate(node => parseFloat(getComputedStyle(node).fontSize))
  const baseIcon = await page.locator('.today-stat > svg').first().evaluate(node => node.getBoundingClientRect().width)
  await checkLayout('normal')
  for (const [size, label, scale] of [['large', 'Grande', 1.15], ['extra-large', 'Muy grande', 1.3]]) {
    await page.setViewportSize({ width: 390, height: 844 })
    await openPreferences()
    await page.getByRole('radio', { name: new RegExp(`^${label} `) }).check()
    await page.getByRole('button', { name: 'Guardar tamaño', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Tamaño de la interfaz guardado en tu cuenta.' }).waitFor()
    assert.equal(await page.locator('html').getAttribute('data-display-size'), size)
    await checkLayout(`${size}-options`)
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 390, height: 844 })
    const font = await page.locator('.today-stat strong').first().evaluate(node => parseFloat(getComputedStyle(node).fontSize))
    const icon = await page.locator('.today-stat > svg').first().evaluate(node => node.getBoundingClientRect().width)
    assert.ok(Math.abs(font / baseFont - scale) < .02)
    assert.ok(Math.abs(icon / baseIcon - scale) < .02)
    await checkLayout(`${size}-dashboard`)
    await page.reload()
    await page.waitForFunction(size => document.documentElement.dataset.displaySize === size, size)
  }
  for (const [path, name, loaded] of [['#gestion/members', 'members', 'Discípulos'], ['#gestion/falls/registro', 'attendance', 'Asistencia'], ['#gestion/reports', 'reports', 'Reportes'], ['#usuarios', 'users', 'Actualizar usuarios']]) {
    await page.goto(`${ui}/${path}`)
    await page.getByRole(name === 'users' ? 'button' : 'heading', { name: loaded, exact: true }).last().waitFor()
    await checkLayout(`extra-large-${name}`)
  }
  await page.goto(`${ui}/#gestion/members`)
  await page.getByRole('button', { name: 'Registrar discípulo', exact: true }).click()
  await checkLayout('extra-large-form')
  await page.getByRole('combobox', { name: 'Tipo de identificación *', exact: true }).click()
  await checkLayout('extra-large-picker')
  await page.keyboard.press('Escape')
  await page.getByLabel('Nombres *', { exact: true }).fill('Formulario sin guardar')
  await openPreferences()
  await page.getByRole('radio', { name: 'Normal', exact: false }).check()
  await page.getByRole('button', { name: 'Guardar tamaño', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Tamaño de la interfaz guardado en tu cuenta.' }).waitFor()
  await page.keyboard.press('Escape')
  assert.equal(await page.getByLabel('Nombres *', { exact: true }).inputValue(), 'Formulario sin guardar')
  assert.equal(await page.locator('html').getAttribute('data-display-size'), 'normal')
  await page.getByRole('button', { name: 'Mi cuenta', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Cerrar sesión', exact: true }).click()
  await page.waitForURL(`${ui}/#login`)
  assert.equal(await page.locator('html').getAttribute('data-display-size'), 'normal')
  await login(pending.data.user.email)
  await page.waitForFunction(() => document.documentElement.dataset.displaySize === 'extra-large')
  await page.goto(`${ui}/#inicio`)
  await page.locator('.site-header').waitFor()
  await checkLayout('extra-large-public')
  await page.reload()
  await page.waitForFunction(() => document.documentElement.dataset.displaySize === 'extra-large')
  assert.deepEqual(errors, [])
  console.log('PASS browser display: normal/115%/130%, text and icon scaling, account options, reload/logout/account isolation, public page, forms/picker/navigation and 320/390/768/1440px without overflow.')
} finally {
  if (browser) await browser.close()
  if (preview) preview.kill()
  if (server) await new Promise(resolve => server.close(resolve))
  if (pool) await pool.end()
  await connection.query(`DROP DATABASE IF EXISTS \`${testDatabase}\``)
  await connection.end()
  console.log('Base temporal de tamaños eliminada; datos locales conservados.')
}
