import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '../.backups/performance-tools/node_modules/playwright')
const baseline = process.argv.includes('--baseline')
const root = resolve('dist')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' }
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    const file = resolve(root, pathname === '/' ? 'index.html' : `.${pathname}`)
    if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return }
    response.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream')
    response.end(await readFile(file))
  } catch { response.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
let browser
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
  await context.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    const value = path === '/api/auth/me' ? { user: null } : path.endsWith('transmission') ? { videoUrl: null, pageUrl: 'https://www.facebook.com/61556906195984', live: false } : { items: [] }
    return route.fulfill({ json: value })
  })
  // Keep the comparison independent of third-party availability.
  await context.route(/^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.abort())
  const page = await context.newPage()
  const errors = []
  const requests = []
  page.on('request', request => requests.push(new URL(request.url()).pathname))
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    window.__perf = { lcp: 0, cls: 0, longTaskMs: 0 }
    new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__perf.lcp = entry.startTime }).observe({ type: 'largest-contentful-paint', buffered: true })
    new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__perf.cls += entry.value }).observe({ type: 'layout-shift', buffered: true })
    new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__perf.longTaskMs += entry.duration }).observe({ type: 'longtask', buffered: true })
  })
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 })
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1600000 / 8, uploadThroughput: 750000 / 8 })
  await page.goto(origin, { waitUntil: 'load' })
  await page.locator('.slideshow-pause').evaluate(button => button.click())
  await page.locator('.hero-slide').evaluateAll(images => Promise.all(images.map(image => image.decode())))
  await page.waitForLoadState('networkidle')
  const metrics = await page.evaluate(() => ({
    ...window.__perf,
    resources: performance.getEntriesByType('resource').filter(entry => new URL(entry.name).origin === location.origin).map(entry => ({ path: new URL(entry.name).pathname, bytes: entry.decodedBodySize, duration: Math.round(entry.duration) })),
    overflow: document.documentElement.scrollWidth > innerWidth,
  }))
  const javascript = metrics.resources.filter(entry => entry.path.endsWith('.js'))
  const images = metrics.resources.filter(entry => /\.(png|jpg|webp)$/.test(entry.path))
  const report = { profile: '390px, CPU 6x, 1.6 Mbps, latency 150ms; API fixtures; third-party fonts blocked; cold cache; no service worker', lcpMs: Math.round(metrics.lcp), cls: +metrics.cls.toFixed(4), longTaskMs: Math.round(metrics.longTaskMs), javascriptBytes: javascript.reduce((sum, entry) => sum + entry.bytes, 0), imageBytes: images.reduce((sum, entry) => sum + entry.bytes, 0), imageRequests: images.length, resources: metrics.resources }
  assert.equal(metrics.overflow, false, 'Mobile horizontal overflow')
  assert.deepEqual(errors, [], 'Browser runtime errors')
  await mkdir('.backups/performance', { recursive: true })
  await writeFile(`.backups/performance/${baseline ? 'before' : 'after'}.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ...report, resources: undefined }, null, 2))
  if (!baseline) {
    assert.ok(report.javascriptBytes < 300000, 'Public page must not download the administrative application')
    assert.ok(report.imageBytes < 150000, 'Mobile images must stay within the loading budget')
    assert.equal(javascript.some(entry => /Management-|AdminUsers-|admin-motion/.test(entry.path)), false)
    assert.equal(requests.filter(path => path === '/api/public/ministries').length, 1, 'Public sections share the ministry catalog request')
    assert.equal(await page.locator('.navigation-feedback .sr-only').evaluate(node => getComputedStyle(node).position), 'absolute', 'Accessibility helpers must load with the public page')
    const before = JSON.parse(await readFile('.backups/performance/before.json', 'utf8').catch(() => 'null'))
    if (before) console.log(`JavaScript reduction: ${Math.round((1 - report.javascriptBytes / before.javascriptBytes) * 100)}%; image reduction: ${Math.round((1 - report.imageBytes / before.imageBytes) * 100)}%`)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Public layout at ${width}px`)
      if ([320, 390, 1440].includes(width)) await page.screenshot({ path: `.backups/performance/home-${width}.png`, fullPage: true })
    }
    console.log('PASS public loading budgets and responsive layouts.')

    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('.hero-slideshow').scrollIntoViewIfNeeded()
    await page.clock.install()
    await page.clock.pauseAt(new Date())
    const first = await page.locator('.hero-slide.is-active').getAttribute('src')
    let slowPhoto
    await page.route('**/media/757596657_*-*.webp', route => { slowPhoto = route })
    await page.getByRole('button', { name: 'Reanudar fotografías' }).click()
    await page.clock.runFor(5100)
    await page.waitForFunction(() => document.querySelectorAll('.hero-slide').length === 2)
    assert.equal(await page.locator('.hero-slide.is-active').getAttribute('src'), first, 'Keep the current photograph while the next downloads')
    assert.ok(slowPhoto, 'The next photograph starts downloading only near its turn')
    await slowPhoto.continue()
    await page.unroute('**/media/757596657_*-*.webp')
    await page.waitForFunction(first => document.querySelector('.hero-slide.is-active')?.getAttribute('src') !== first, first)
    const seen = new Set([first, await page.locator('.hero-slide.is-active').getAttribute('src')])
    for (let index = 0; index < 6; index++) {
      const previous = await page.locator('.hero-slide.is-active').getAttribute('src')
      await page.clock.runFor(3500)
      await page.locator('.hero-slide').evaluateAll(images => Promise.all(images.map(image => image.decode())))
      await page.clock.runFor(1500)
      await page.waitForFunction(previous => document.querySelector('.hero-slide.is-active')?.getAttribute('src') !== previous, previous)
      assert.ok(await page.locator('.hero-slide').count() <= 2, 'Carousel memory stays bounded')
      seen.add(await page.locator('.hero-slide.is-active').getAttribute('src'))
    }
    assert.equal(seen.size, 8, 'Every original photograph remains in the carousel')
    await page.getByRole('button', { name: 'Pausar fotografías' }).click()
    const paused = await page.locator('.hero-slide.is-active').getAttribute('src')
    await page.clock.runFor(10000)
    assert.equal(await page.locator('.hero-slide.is-active').getAttribute('src'), paused)
    await page.getByRole('button', { name: 'Reanudar fotografías' }).click()
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    const hiddenRequests = requests.filter(path => path.startsWith('/api/')).length
    await page.clock.runFor(120000)
    assert.equal(requests.filter(path => path.startsWith('/api/')).length, hiddenRequests, 'Hidden page does not poll')
    assert.equal(await page.locator('.hero-slide.is-active').getAttribute('src'), paused, 'Hidden carousel is paused')
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    })
    await page.waitForResponse(response => new URL(response.url()).pathname === '/api/public/events')
    assert.equal(requests.filter(path => path.startsWith('/api/')).length, hiddenRequests + 2, 'Tab return refreshes each public endpoint once')
    console.log('PASS carousel: eight photographs, slow download safety, pause/resume, two images in memory, and no hidden-tab polling.')

    const publicRequests = requests.filter(path => path.startsWith('/api/public/')).length
    await page.locator('.hero-slideshow').evaluate(node => { node.dataset.anchorCheck = 'preserved' })
    await page.evaluate(() => { window.location.hash = '#ministerios' })
    await page.waitForURL(`${origin}/#ministerios`)
    await page.waitForTimeout(50)
    assert.equal(requests.filter(path => path.startsWith('/api/public/')).length, publicRequests, 'Anchor navigation must not remount the public page')
    assert.equal(await page.locator('.hero-slideshow').getAttribute('data-anchor-check'), 'preserved', 'Anchor navigation preserves the existing carousel')

    await page.goto(`${origin}/#login`)
    await page.getByLabel('Correo electrónico', { exact: true }).waitFor()
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Login layout at ${width}px`)
    }
    await page.goto(`${origin}/#recuperar`)
    await page.getByLabel('Correo electrónico', { exact: true }).waitFor()
    await page.goto(`${origin}/#gestion`)
    await page.getByText('Necesitas una cuenta con un rol autorizado.').waitFor()
    await page.goto(`${origin}/#usuarios`)
    await page.getByText('Solo los administradores y cargos pastorales autorizados pueden crear cuentas y asignar roles.').waitFor()
    assert.deepEqual(errors, [], 'Public and lazy screens have no runtime errors')
    console.log('PASS lazy login, password recovery and unauthorized management/users screens.')

    const failureContext = await browser.newContext({ serviceWorkers: 'block' })
    const failurePage = await failureContext.newPage()
    let interrupted = 0
    await failurePage.route(/\/assets\/Management-[^/]+\.js$/, route => { interrupted++; return route.abort() })
    await failurePage.goto(`${origin}/#gestion`)
    await failurePage.getByRole('heading', { name: 'No pudimos abrir esta sección' }).waitFor({ timeout: 10000 }).catch(async error => {
      console.error('Interrupted downloads:', interrupted, 'Screen:', await failurePage.locator('body').innerText())
      throw error
    })
    await failurePage.getByRole('link', { name: 'Ir al inicio' }).click()
    await failurePage.locator('.hero-slide.is-active').waitFor()
    await failureContext.close()
    console.log('PASS interrupted lazy downloads show a recovery action and allow returning home.')

    const reducedContext = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
    await reducedContext.route('**/api/**', route => route.fulfill({ json: { user: null, items: [] } }))
    const reducedPage = await reducedContext.newPage()
    await reducedPage.goto(origin)
    await reducedPage.getByRole('button', { name: 'Reanudar fotografías' }).waitFor()
    assert.equal(await reducedPage.locator('.hero-slide').count(), 1)
    await reducedContext.close()
    console.log('PASS reduced-motion preference starts with a single paused photograph.')

    const pwa = await browser.newContext({ viewport: { width: 390, height: 844 } })
    await pwa.route('**/api/**', route => route.fulfill({ json: { user: null, items: [] } }))
    const app = await pwa.newPage()
    await app.goto(`${origin}/#login`)
    await app.getByLabel('Correo electrónico', { exact: true }).waitFor()
    await app.evaluate(() => navigator.serviceWorker.ready)
    await app.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
    const cached = await app.evaluate(async () => (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)))).flat())
    assert.ok(cached.includes('/offline.html'))
    assert.equal(cached.some(path => path.startsWith('/api/')), false, 'Sessions and API data never enter the service worker cache')
    assert.equal(cached.some(path => /Management-|AdminUsers-|CoverageMap-/.test(path)), false, 'Installation must not fetch unvisited screens')
    await app.evaluate(() => { window.location.hash = '#gestion' })
    await app.getByText('Necesitas una cuenta con un rol autorizado.').waitFor()
    await app.waitForFunction(async () => {
      const paths = (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)))).flat()
      return paths.some(path => /Management-.+\.js$/.test(path)) && !paths.some(path => path.startsWith('/api/'))
    })
    await app.evaluate(() => { window.location.hash = '#login' })
    await app.getByLabel('Correo electrónico', { exact: true }).waitFor()
    await pwa.setOffline(true)
    await app.reload({ waitUntil: 'domcontentloaded' })
    await app.getByRole('heading', { name: 'Volvamos a conectar', exact: true }).waitFor()
    assert.equal(await app.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await pwa.setOffline(false)
    await app.getByRole('link', { name: 'Intentar de nuevo' }).click()
    await app.getByLabel('Correo electrónico', { exact: true }).waitFor()
    await pwa.close()
    console.log('PASS service worker: minimal install, visited chunks cached on demand, no cached sessions/data, offline fallback and online retry.')
  }
  await context.close()
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
