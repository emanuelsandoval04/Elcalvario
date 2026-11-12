// Firebase Phone Auth: Google sends the SMS code and returns a signed token once the code is typed.
// The Firebase SDK is loaded only when a code is requested, so it does not weigh on the rest of the app.
type PhoneDouble = { send: (phone: string) => Promise<void>; confirm: (code: string) => Promise<string> }
declare global { interface Window { __calvarioPhoneAuthDouble?: PhoneDouble } }

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}
// Local UI checks replace Firebase with a double; production builds never read it.
const double = () => import.meta.env.DEV ? window.__calvarioPhoneAuthDouble : undefined

export const phoneAuthReady = () => Boolean(double()) || Boolean(config.apiKey && config.authDomain && config.projectId && config.appId)

export type PhoneVerification = { confirm: (code: string) => Promise<string>; cancel: () => void }

const messages: Record<string, string> = {
  'auth/invalid-verification-code': 'El código no coincide. Revísalo con la persona.',
  'auth/code-expired': 'El código venció. Envía uno nuevo.',
  'auth/session-expired': 'El código venció. Envía uno nuevo.',
  'auth/too-many-requests': 'Demasiados intentos desde este dispositivo o a este celular. Espera unos minutos.',
  'auth/quota-exceeded': 'Se alcanzó el límite de SMS de Firebase por hoy. Intenta más tarde.',
  'auth/invalid-phone-number': 'Firebase no acepta este celular. Revisa el número de la ficha.',
  'auth/missing-phone-number': 'La ficha no tiene celular.',
  'auth/captcha-check-failed': 'No se pudo comprobar que no eres un robot. Recarga la página e intenta de nuevo.',
  'auth/unauthorized-domain': 'Este dominio no está autorizado en Firebase (Authentication → Settings → Authorized domains).',
  'auth/operation-not-allowed': 'Activa el proveedor "Teléfono" en Firebase (Authentication → Sign-in method).',
  'auth/billing-not-enabled': 'El proyecto de Firebase necesita facturación activa (plan Blaze) para enviar SMS.',
  'auth/network-request-failed': 'Sin conexión con Firebase. Revisa internet e intenta de nuevo.',
}
export const phoneAuthError = (cause: unknown) => {
  const code = (cause as { code?: string })?.code || ''
  // Same code, different cause: the project's SMS region policy does not allow the destination country.
  if (code === 'auth/operation-not-allowed' && /region/i.test(String((cause as { message?: string })?.message))) return 'Firebase no tiene habilitado el envío de SMS a Colombia (Authentication → Configuración → Política de región de SMS).'
  return messages[code] || (cause instanceof Error && !code ? cause.message : 'No pudimos completar la verificación por SMS. Intenta de nuevo.')
}

// Sends the SMS to `phone` (+57…). `container` hosts the invisible reCAPTCHA that Firebase requires.
export async function sendPhoneCode(phone: string, container: HTMLElement): Promise<PhoneVerification> {
  const fake = double()
  if (fake) { await fake.send(phone); return { confirm: code => fake.confirm(code), cancel: () => {} } }
  const [{ initializeApp, getApps }, auth] = await Promise.all([import('firebase/app'), import('firebase/auth')])
  const app = getApps().find(item => item.name === 'calvario-phone') || initializeApp(config, 'calvario-phone')
  // Memory only: this browser never stays signed in as the disciple.
  let session
  try { session = auth.initializeAuth(app, { persistence: auth.inMemoryPersistence }) } catch { session = auth.getAuth(app) }
  session.languageCode = 'es'
  const holder = document.createElement('div'); container.replaceChildren(holder)
  const verifier = new auth.RecaptchaVerifier(session, holder, { size: 'invisible' })
  try {
    const result = await auth.signInWithPhoneNumber(session, phone, verifier)
    return {
      confirm: async code => {
        const credential = await result.confirm(code)
        const token = await credential.user.getIdToken()
        await auth.signOut(session).catch(() => {})
        return token
      },
      cancel: () => verifier.clear(),
    }
  } catch (cause) { verifier.clear(); throw cause }
}
