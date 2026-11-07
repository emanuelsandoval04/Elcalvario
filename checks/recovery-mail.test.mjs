import test from 'node:test'
import assert from 'node:assert/strict'
import { recoveryMailConfiguration, sendPasswordRecoveryEmail } from '../server/recovery-mail.js'

const environment = { NODE_ENV: 'production', APP_PUBLIC_URL: 'https://church.example', MAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test_key', RESEND_FROM_EMAIL: 'acceso@church.example' }
const gmail = { ...environment, MAIL_PROVIDER: 'gmail', GMAIL_USER: 'support@gmail.com', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop' }

test('recovery requires private mail settings and a fixed HTTPS origin in production', () => {
  assert.equal(recoveryMailConfiguration(environment).origin, 'https://church.example')
  for (const patch of [
    { RESEND_API_KEY: '' }, { RESEND_FROM_EMAIL: '' }, { RESEND_FROM_EMAIL: 'name <user@example.com>' },
    { RESEND_FROM_EMAIL: 'user@example.com\nBcc: other@example.com' }, { APP_PUBLIC_URL: '' },
    { APP_PUBLIC_URL: 'https://user:password@church.example' }, { APP_PUBLIC_URL: 'https://church.example/path' },
    { APP_PUBLIC_URL: 'https://church.example/' }, { APP_PUBLIC_URL: 'https://church.example?next=evil' },
    { APP_PUBLIC_URL: 'https://church.example/#token' }, { APP_PUBLIC_URL: 'http://church.example' },
    { MAIL_PROVIDER: 'unknown' },
  ]) assert.throws(() => recoveryMailConfiguration({ ...environment, ...patch }), { code: 'RECOVERY_NOT_CONFIGURED' })
  assert.throws(() => recoveryMailConfiguration({ ...environment, NODE_ENV: undefined, VERCEL: '1', APP_PUBLIC_URL: 'http://church.example' }))
  assert.equal(recoveryMailConfiguration({ ...environment, NODE_ENV: 'development', APP_PUBLIC_URL: 'http://127.0.0.1:5173' }).origin, 'http://127.0.0.1:5173')
})

test('Gmail accepts an application password and a Gmail sender without a custom domain', () => {
  const configuration = recoveryMailConfiguration({ ...gmail, GMAIL_USER: 'SUPPORT@gmail.com', RESEND_API_KEY: '', RESEND_FROM_EMAIL: '' })
  assert.equal(configuration.provider, 'gmail')
  assert.equal(configuration.from, 'support@gmail.com')
  assert.equal(configuration.appPassword, 'abcdefghijklmnop')
  assert.equal(configuration.origin, 'https://church.example')
  assert.ok(!('apiKey' in configuration))
  for (const patch of [
    { GMAIL_USER: '' }, { GMAIL_USER: 'support@other.example' }, { GMAIL_USER: 'Name <support@gmail.com>' },
    { GMAIL_USER: 'support@gmail.com\nBcc:other@gmail.com' },
    { GMAIL_APP_PASSWORD: '' }, { GMAIL_APP_PASSWORD: 'short' }, { GMAIL_APP_PASSWORD: 'abcd\nefghijklmnop' },
  ]) assert.throws(() => recoveryMailConfiguration({ ...gmail, ...patch }), { code: 'RECOVERY_NOT_CONFIGURED' })
})

test('Gmail sends through authenticated TLS on port 465, preserves the link and closes the transport', async () => {
  const configuration = recoveryMailConfiguration(gmail)
  let closed = false, mail
  await sendPasswordRecoveryEmail('recipient@example.invalid', 'c'.repeat(64), configuration, () => assert.fail('Gmail must not call Resend'), options => {
    assert.equal(options.host, 'smtp.gmail.com'); assert.equal(options.port, 465)
    assert.equal(options.secure, true); assert.equal(options.pool, false)
    assert.equal(options.tls.rejectUnauthorized, true); assert.equal(options.tls.servername, 'smtp.gmail.com')
    assert.equal(options.auth.user, 'support@gmail.com'); assert.equal(options.auth.pass, 'abcdefghijklmnop')
    assert.equal(options.logger, false); assert.equal(options.debug, false)
    assert.ok(options.connectionTimeout <= 10000 && options.socketTimeout <= 10000)
    return { sendMail: async message => { mail = message; return { accepted: message.to, rejected: [] } }, close: () => { closed = true } }
  })
  assert.equal(closed, true)
  assert.equal(mail.from, 'El Calvario - Nexus Soporte <support@gmail.com>')
  assert.deepEqual(mail.to, ['recipient@example.invalid'])
  assert.ok(mail.text.includes(`https://church.example/#restablecer?token=${'c'.repeat(64)}`))
  assert.ok(!JSON.stringify(mail).includes(configuration.appPassword))
})

test('Gmail closes failed sends and exposes only sanitized error codes', async () => {
  for (const mode of ['authentication', 'timeout', 'rejected']) {
    let closed = false
    await assert.rejects(sendPasswordRecoveryEmail('recipient@example.invalid', 'd'.repeat(64), recoveryMailConfiguration(gmail), undefined, () => ({
      sendMail: async () => {
        if (mode === 'rejected') return { accepted: [], rejected: ['recipient@example.invalid'] }
        throw Object.assign(new Error('private SMTP response'), { code: mode === 'authentication' ? 'EAUTH' : 'ETIMEDOUT' })
      },
      close: () => { closed = true },
    })), { code: mode === 'authentication' ? 'GMAIL_AUTH_FAILED' : 'GMAIL_SEND_ERROR' })
    assert.equal(closed, true)
  }
})

test('Resend receives the secret only in Authorization and a fragment-based single-use link', async () => {
  const token = 'a'.repeat(64)
  let mail
  await sendPasswordRecoveryEmail('recipient@example.invalid', token, recoveryMailConfiguration(environment), async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.Authorization, 'Bearer re_test_key')
    mail = JSON.parse(options.body)
    return new Response(JSON.stringify({ id: 'test-message' }), { status: 200 })
  })
  assert.deepEqual(mail.to, ['recipient@example.invalid'])
  assert.equal(mail.from, 'El Calvario - Nexus Soporte <acceso@church.example>')
  const link = new URL(mail.text.match(/https:\/\/\S+/)[0])
  assert.equal(link.origin, environment.APP_PUBLIC_URL)
  assert.equal(link.search, '')
  assert.equal(link.hash, `#restablecer?token=${token}`)
  assert.match(mail.text, /15 minutos/)
  assert.match(mail.html, /solo puede usarse una vez/)
  assert.ok(!JSON.stringify(mail).includes(environment.RESEND_API_KEY))
})

test('provider errors never expose response bodies or credentials', async () => {
  const configuration = recoveryMailConfiguration(environment)
  await assert.rejects(sendPasswordRecoveryEmail('recipient@example.invalid', 'b'.repeat(64), configuration, async () => new Response('sensitive-provider-body', { status: 403 })), { code: 'RESEND_HTTP_403' })
  await assert.rejects(sendPasswordRecoveryEmail('recipient@example.invalid', 'b'.repeat(64), configuration, async () => new Response('{}', { status: 200 })), { code: 'RESEND_INVALID_RESPONSE' })
})
