export type WelcomeEmailStatus = 'sent' | 'failed' | 'not_configured'

export function welcomeEmailMessage(status?: WelcomeEmailStatus) {
  if (status === 'sent') return 'Correo de bienvenida enviado con los datos de acceso, el rol y sus funciones.'
  if (status === 'not_configured') return 'El envío de correo no está configurado. La cuenta quedó creada; informa a la persona cómo recuperar su acceso.'
  if (status === 'failed') return 'No pudimos enviar el correo de bienvenida. La cuenta quedó creada; verifica la dirección e informa a la persona cómo recuperar su acceso.'
  return ''
}
