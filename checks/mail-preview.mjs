import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { welcomeMessage } from '../server/account-welcome.js'
import { sendPasswordRecoveryEmail } from '../server/recovery-mail.js'
import { pool } from '../server/db.js'

// Fictitious credentials only. This script never connects to an email provider.
const configuration = { provider: 'gmail', origin: 'https://elcalvario.vercel.app', from: 'ejemplo@gmail.com', appPassword: 'abcdefghijklmnop' }
const user = { name: 'María Torres', email: 'persona@example.invalid', state: 'activo', roles: ['Discipulador'], permissions: { 'gestion.acceder': 'grupo', 'miembros.ver': 'grupo', 'miembros.registrar': 'grupo', 'grupos.ver': 'grupo', 'asistencia.registrar': 'grupo', 'reportes.asistencia': 'grupo' }, registration: { canManageAccounts: false, canAssignServices: false, canCreateAdministrative: false } }
let browser
try {
  const welcome = await welcomeMessage(user, 'Ejemplo-2026-Inicial!', {
    member: { id: 12, name: 'María Torres', groupName: 'Familia del Norte', groupCode: 'GCF-01', pastoralRole: 'Discipuladores', coverageName: 'Pastor Local', trainingBook: 'Libro de adiestramiento 1' },
    groups: [{ nombre: 'Familia del Norte', codigo_grupo: 'GCF-01' }], ministries: [], createdBy: 'Administración El Calvario', createdAt: '7/11/2026, 10:00 a. m.',
  }, configuration)
  let recovery
  await sendPasswordRecoveryEmail(user.email, 'a'.repeat(64), configuration, () => assert.fail('No network allowed'), () => ({ sendMail: async message => { recovery = message; return { accepted: message.to, rejected: [] } }, close() {} }))
  if (process.argv.includes('--screenshots')) {
    const { chromium } = await import('../.secrets/browser-tools/node_modules/playwright-core/index.mjs')
    browser = await chromium.launch({ channel: 'msedge', headless: true })
  }
  for (const [name, message] of [['welcome', welcome], ['recovery', recovery]]) {
    let html = message.html
    for (const attachment of message.attachments) html = html.replaceAll(`cid:${attachment.cid}`, `data:${attachment.contentType};base64,${attachment.content.toString('base64')}`)
    const target = new URL(`./mail-preview-${name}.html`, import.meta.url)
    await writeFile(target, html, 'utf8')
    console.log(`Vista previa local: ${fileURLToPath(target)}`)
    if (browser) {
      const page = await browser.newPage()
      await page.goto(target.href)
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 900 })
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow in ${name} at ${width}px`)
        assert.equal(await page.locator('img').count(), 2)
        assert.ok(await page.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)))
        await page.screenshot({ path: fileURLToPath(new URL(`./mail-preview-${name}-${width}.png`, import.meta.url)), fullPage: true })
      }
      await page.close()
    }
  }
} finally { if (browser) await browser.close(); await pool.end() }
