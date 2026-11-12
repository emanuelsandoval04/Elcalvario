// Same registration rules as server/contact-rules.js: 10-digit phones, common email providers, age up to 99.
export const emailDomains = [
  'gmail.com', 'googlemail.com',
  'hotmail.com', 'hotmail.es', 'hotmail.co', 'outlook.com', 'outlook.es', 'live.com', 'live.com.co', 'msn.com',
  'yahoo.com', 'yahoo.es', 'yahoo.com.co', 'ymail.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'proton.me', 'protonmail.com', 'zoho.com', 'gmx.com', 'mail.com', 'yandex.com',
]
export const maxAge = 99
export const colombiaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
export function oldestBirthDate(today = colombiaToday()) {
  const [year, month, day] = today.split('-').map(Number)
  const date = new Date(Date.UTC(year - maxAge - 1, month - 1, day))
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}
export function phoneError(value: string) {
  let digits = value.replace(/[\s().-]/g, '')
  if (/^\+57\d{10}$/.test(digits)) digits = digits.slice(3)
  return /^\d{10}$/.test(digits) ? '' : 'El celular debe tener exactamente 10 dígitos.'
}
export function emailError(value: string) {
  const domain = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/.exec(value.trim().toLowerCase())?.[1]
  if (!domain) return 'Escribe un correo válido, por ejemplo nombre@gmail.com.'
  return emailDomains.includes(domain) ? '' : 'Usa un correo de un proveedor conocido, como Gmail, Hotmail, Outlook, Yahoo o iCloud.'
}
export function birthDateError(value: string) {
  const today = colombiaToday()
  if (value > today) return 'La fecha de nacimiento no puede estar en el futuro.'
  if (value < oldestBirthDate(today)) return `Revisa la fecha de nacimiento: la edad no puede ser mayor de ${maxAge} años.`
  return ''
}
// Which rule each registration field follows (data-rule attribute on the input).
export const fieldRules: Record<string, 'phone' | 'email' | 'birthdate'> = { celular: 'phone', contacto_emergencia_celular: 'phone', correo: 'email', account_email: 'email', fecha_nacimiento: 'birthdate' }
