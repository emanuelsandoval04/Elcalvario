import { brandedEmail, mailButton } from './mail-templates.js'
import { deliverEmail } from './mail-delivery.js'

export { mailConfiguration as recoveryMailConfiguration } from './mail-delivery.js'

export async function sendPasswordRecoveryEmail(email, token, configuration, fetcher, createTransport) {
  const link = `${configuration.origin}/#restablecer?token=${token}`
  const message = await brandedEmail({
    email, title: 'Cambia tu contraseña',
    subject: 'Cambia tu contraseña de El Calvario',
    text: `Recibimos una solicitud para cambiar tu contraseña de El Calvario.\n\nAbre este enlace: ${link}\n\nEs válido por 15 minutos desde la solicitud y solo puede usarse una vez. Si solicitas otro enlace, el anterior dejará de funcionar.\n\nSi no solicitaste este cambio, ignora este correo. Tu contraseña seguirá igual.`,
    body: `<p>Recibimos una solicitud para recuperar el acceso a tu cuenta de El Calvario.</p>${mailButton('Cambiar contraseña', link)}<p>Este enlace es válido por <strong>15 minutos desde la solicitud</strong> y solo puede usarse una vez. Si solicitas otro, el anterior dejará de funcionar.</p><p>Si no solicitaste este cambio, ignora este correo. Tu contraseña seguirá igual.</p>`,
  }, configuration)
  await deliverEmail(message, configuration, fetcher, createTransport)
}
