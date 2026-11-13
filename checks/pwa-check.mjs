import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = require('../.secrets/browser-tools/node_modules/playwright-core')
const origin = process.env.PWA_ORIGIN || 'http://127.0.0.1:4175'
const temporaryRoot = realpathSync(tmpdir())
const profile = mkdtempSync(join(temporaryRoot, 'calvario-pwa-check-'))
let context
try {
  context = await chromium.launchPersistentContext(profile, { headless: true, channel: 'msedge', viewport: { width: 390, height: 844 } })
  await context.route('**/api/**', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Inicia sesión para continuar.' }) }))
  const page = await context.newPage()
  await page.goto(`${origin}/#gestion`, { waitUntil: 'load' })
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
  const manifest = await (await context.request.get(`${origin}/manifest.webmanifest`)).json()
  assert.equal(manifest.start_url, '/#gestion')
  assert.equal(manifest.display, 'standalone')
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(icon => icon.sizes === `${size}x${size}`)
    assert.ok(icon)
    const png = await (await context.request.get(origin + icon.src)).body()
    assert.equal(png.readUInt32BE(16), size); assert.equal(png.readUInt32BE(20), size)
  }
  const cdp = await context.newCDPSession(page)
  const appManifest = await cdp.send('Page.getAppManifest')
  assert.deepEqual(appManifest.errors, [])
  const installability = await cdp.send('Page.getInstallabilityErrors')
  assert.deepEqual(installability.installabilityErrors, [])
  await page.evaluate(() => fetch('/api/auth/me'))
  const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)))).flat())
  assert.ok(cached.includes('/offline.html'))
  assert.equal(cached.some(path => path.startsWith('/api/')), false, 'Nunca guardar sesiones ni datos de la API en caché')
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Volvamos a conectar', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.screenshot({ path: 'checks/app-offline-mobile.png' })
  await context.setOffline(false)
  await page.getByRole('link', { name: 'Intentar de nuevo' }).click()
  // The retry URL can match the current hash, so it must trigger a real reload.
  await page.waitForSelector('#root')
  console.log('PASS PWA: Chromium installability, manifest, 192/512px icons, active service worker, API excluded from caches, offline fallback and online retry.')
} finally {
  if (context) await context.close()
  if (dirname(profile) !== temporaryRoot || !basename(profile).startsWith('calvario-pwa-check-')) throw new Error('Perfil temporal fuera del directorio esperado.')
  rmSync(profile, { recursive: true, force: true })
}
