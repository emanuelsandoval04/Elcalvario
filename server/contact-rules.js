// Registration rules shared by the API (the browser applies the same ones in src/contact-rules.ts).

// Most used email providers. Addresses from other domains are rejected in registration forms.
export const emailDomains = [
  'gmail.com', 'googlemail.com',
  'hotmail.com', 'hotmail.es', 'hotmail.co', 'outlook.com', 'outlook.es', 'live.com', 'live.com.co', 'msn.com',
  'yahoo.com', 'yahoo.es', 'yahoo.com.co', 'ymail.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'proton.me', 'protonmail.com', 'zoho.com', 'gmx.com', 'mail.com', 'yandex.com',
]
export const maxAge = 99

// Exactly 10 digits. Spaces, dashes, parentheses and a leading +57 are accepted and removed.
export function tenDigitPhone(value) {
  let digits = String(value).replace(/[\s().-]/g, '')
  if (/^\+57\d{10}$/.test(digits)) digits = digits.slice(3)
  if (!/^\d{10}$/.test(digits)) return null
  return digits
}

export function commonEmail(value) {
  const email = String(value).trim().toLowerCase()
  const match = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/.exec(email)
  if (!match) return { email: null, reason: 'Correo inválido.' }
  if (!emailDomains.includes(match[1])) return { email: null, reason: 'Usa un correo de un proveedor conocido, como Gmail, Hotmail, Outlook, Yahoo o iCloud.' }
  return { email }
}

// Oldest accepted birth date for a given "today" (YYYY-MM-DD): someone born that day is 99.
export function oldestBirthDate(today) {
  const [year, month, day] = today.split('-').map(Number)
  const date = new Date(Date.UTC(year - maxAge - 1, month - 1, day))
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

// International format for SMS: Colombian 10-digit mobiles (3xx…) become +573xxxxxxxxx.
export function mobileNumber(value) {
  const digits = tenDigitPhone(value || '')
  return digits && digits.startsWith('3') ? `+57${digits}` : null
}
export const maskedNumber = value => {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length >= 4 ? `*** *** ${digits.slice(-4)}` : null
}
