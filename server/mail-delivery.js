import nodemailer from 'nodemailer'

const configurationError = () => Object.assign(new Error('Recuperación por correo sin configurar.'), { code: 'RECOVERY_NOT_CONFIGURED' })

export function mailConfiguration(env = process.env) {
  const provider = env.MAIL_PROVIDER?.trim().toLowerCase() || 'resend'
  let origin
  try {
    const url = new URL(env.APP_PUBLIC_URL)
    const production = env.NODE_ENV === 'production' || env.VERCEL === '1'
    if (url.origin !== env.APP_PUBLIC_URL || !['https:', 'http:'].includes(url.protocol) || production && url.protocol !== 'https:') throw configurationError()
    origin = url.origin
  } catch { throw configurationError() }
  if (provider === 'gmail') {
    const from = env.GMAIL_USER?.trim().toLowerCase()
    // Google displays application passwords in groups separated by spaces.
    const appPassword = env.GMAIL_APP_PASSWORD?.replaceAll(' ', '')
    if (!from || from.length > 120 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@gmail\.com$/.test(from) || !/^[a-zA-Z0-9]{16}$/.test(appPassword || '')) throw configurationError()
    return { provider, origin, from, appPassword }
  }
  if (provider !== 'resend') throw configurationError()
  const apiKey = env.RESEND_API_KEY?.trim()
  const from = env.RESEND_FROM_EMAIL?.trim()
  if (!apiKey || /\s/.test(apiKey) || !from || from.length > 254 || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from)) throw configurationError()
  return { provider, apiKey, from, origin }
}

export async function deliverEmail(message, configuration, fetcher = fetch, createTransport = nodemailer.createTransport) {
  const email = message.to[0]
  if (configuration.provider === 'gmail') {
    const transport = createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true, pool: false,
      auth: { user: configuration.from, pass: configuration.appPassword },
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true, servername: 'smtp.gmail.com' },
      dnsTimeout: 5000, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000,
      logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
    })
    try {
      const result = await transport.sendMail(message)
      if (!result.accepted?.includes(email) || result.rejected?.length) throw new Error('Recipient rejected')
    } catch (error) {
      // Do not expose raw SMTP errors: they can contain addresses and responses.
      throw Object.assign(new Error('No se pudo enviar el correo.'), { code: error.code === 'EAUTH' ? 'GMAIL_AUTH_FAILED' : 'GMAIL_SEND_ERROR' })
    } finally { transport.close() }
    return
  }
  const response = await fetcher('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${configuration.apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({ ...message, attachments: (message.attachments || []).map(attachment => ({ filename: attachment.filename, content: attachment.content.toString('base64'), content_id: attachment.cid })) }),
  })
  // Never log the provider body: it can contain addresses or other private data.
  if (!response.ok) throw Object.assign(new Error('No se pudo enviar el correo.'), { code: `RESEND_HTTP_${response.status}` })
  const result = await response.json()
  if (typeof result.id !== 'string' || !result.id) throw Object.assign(new Error('Respuesta de correo inválida.'), { code: 'RESEND_INVALID_RESPONSE' })
}
