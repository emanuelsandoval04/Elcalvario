import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import nodemailer from 'nodemailer'
import { accountCapabilities, welcomeMessage } from '../server/account-welcome.js'
import { sendPasswordRecoveryEmail } from '../server/recovery-mail.js'
import { readFile } from 'node:fs/promises'
import { pool } from '../server/db.js'

after(() => pool.end())

const configuration = { provider: 'gmail', origin: 'https://church.example', from: 'support@gmail.com', appPassword: 'abcdefghijklmnop' }
const user = {
  email: 'new@example.invalid', name: 'María <script>alert(1)</script>', state: 'activo', roles: ['Discipulador'],
  permissions: { 'gestion.acceder': 'grupo', 'miembros.ver': 'grupo', 'asistencia.registrar': 'grupo', 'adiestramiento.gestionar': 'todos', 'usuarios.gestionar': 'todos', 'ministerios.gestionar': 'todos' },
  registration: { canManageAccounts: false, canCreateAdministrative: false, canAssignServices: false },
}
const context = {
  createdBy: 'Administración', createdAt: '7/11/2026, 10:00 a. m.',
  member: { id: 10, name: 'María', groupName: 'Grupo del Norte', groupCode: 'N-01', pastoralRole: 'Discipuladores', service: 'Acompañamiento', coverageName: 'Pastor Local', trainingBook: 'Libro 1' },
  groups: [{ nombre: 'Grupo del Norte', codigo_grupo: 'N-01' }], ministries: [{ nombre: 'Alabanza' }],
}

test('welcome contains initial credentials, assigned role, linking details and only effective capabilities', async () => {
  const password = 'Initial-<>&"\'123'
  const mail = await welcomeMessage(user, password, context, configuration)
  assert.equal(mail.from, 'El Calvario - Nexus Soporte <support@gmail.com>')
  assert.deepEqual(mail.to, [user.email])
  for (const value of [password, 'Discipulador', 'Grupo del Norte', 'Pastor Local', 'Libro 1', 'Alabanza', 'Administración', 'https://church.example/#login']) assert.ok(mail.text.includes(value), `Missing expected welcome field`)
  assert.ok(!mail.text.includes('N-01') && !mail.html.includes('N-01'), 'El código del grupo no se muestra')
  assert.ok(mail.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  assert.ok(!mail.html.includes('<script>'))
  assert.ok(mail.html.includes('Initial-&lt;&gt;&amp;&quot;&#39;123'))
  assert.ok(mail.text.includes('solo dentro del alcance de los grupos a tu cargo'))
  assert.ok(mail.text.includes('libros de adiestramiento'))
  assert.ok(!mail.text.includes('Crear y administrar cuentas de acceso'))
  assert.ok(!mail.text.includes('Asignar servicios y ministerios'))
  assert.ok(!mail.text.includes(configuration.appPassword))
  assert.ok(mail.text.includes('cambia tu contraseña'))
})

test('basic users receive no operational promises; authorized managers receive their actual capabilities', async () => {
  const basic = { ...user, roles: ['Usuario'], permissions: {}, registration: {} }
  const basicMail = await welcomeMessage(basic, 'Initial-1234', { createdBy: 'Administrador', createdAt: context.createdAt }, configuration)
  assert.ok(basicMail.text.includes('Sin ficha vinculada'))
  assert.ok(basicMail.text.includes('no tiene módulos de gestión'))
  assert.ok(!basicMail.text.includes('Registrar discípulos'))
  const manager = { ...user, permissions: { 'gestion.acceder': 'todos', 'grupos.editar': 'todos', 'ministerios.gestionar': 'todos' }, registration: { canManageAccounts: true, canCreateAdministrative: true, canAssignServices: true } }
  const capabilities = accountCapabilities(manager).join('\n')
  assert.ok(capabilities.includes('Crear y administrar cuentas de acceso'))
  assert.ok(capabilities.includes('asignar responsables'))
  assert.ok(capabilities.includes('Asignar servicios y ministerios'))
  assert.ok(!capabilities.includes('Exportar reportes de asistencia'))
})

test('both original logos are embedded by CID with real PNG bytes and valid MIME image parts', async () => {
  const mail = await welcomeMessage(user, 'Initial-1234', context, configuration)
  assert.equal(mail.attachments.length, 2)
  const originals = ['el-calvario.png', 'nexus.png']
  for (let index = 0; index < originals.length; index++) {
    const attachment = mail.attachments[index]
    assert.ok(Buffer.isBuffer(attachment.content))
    assert.deepEqual(attachment.content, await readFile(new URL(`../server/mail-assets/${originals[index]}`, import.meta.url)))
    assert.equal(attachment.content.subarray(1, 4).toString(), 'PNG')
    assert.ok(mail.html.includes(`src="cid:${attachment.cid}"`))
    assert.equal(attachment.contentDisposition, 'inline')
  }
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true })
  const generated = await transport.sendMail(mail)
  const mime = generated.message.toString()
  for (const attachment of mail.attachments) assert.ok(mime.includes(`Content-ID: <${attachment.cid}>`))
  assert.ok(mime.includes('multipart/related'))
  assert.equal((mime.match(/Content-Type: image\/png/g) || []).length, 2)
  assert.ok(!mime.includes(configuration.appPassword))
  transport.close()
})

test('recovery uses the same branded header and maps inline attachments to Resend base64 content IDs', async () => {
  let payload
  await sendPasswordRecoveryEmail(user.email, 'a'.repeat(64), { ...configuration, provider: 'resend', apiKey: 're_fake_key' }, async (_url, options) => {
    payload = JSON.parse(options.body)
    return new Response(JSON.stringify({ id: 'test-mail' }), { status: 200 })
  })
  assert.equal(payload.attachments.length, 2)
  for (const attachment of payload.attachments) {
    assert.equal(typeof attachment.content, 'string')
    assert.equal(Buffer.from(attachment.content, 'base64').subarray(1, 4).toString(), 'PNG')
    assert.ok(payload.html.includes(`src="cid:${attachment.content_id}"`))
    assert.equal(attachment.path, undefined)
  }
  assert.ok(payload.text.includes('15 minutos'))
  assert.ok(payload.html.includes('El Calvario Villavicencio'))
  assert.ok(payload.html.includes('Nexus Corporation'))
})
