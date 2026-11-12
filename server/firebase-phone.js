import { createRemoteJWKSet, jwtVerify } from 'jose'
import { invalid } from './entities.js'

// Verifies the ID token that Firebase Phone Auth gives the browser after the person types the SMS code.
// Only FIREBASE_PROJECT_ID is needed on the server: Google's public keys check the signature.
const googleKeys = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
let keySet, keySetUrl

export const firebaseProjectId = () => process.env.FIREBASE_PROJECT_ID?.trim() || ''
export const phoneAuthConfigured = () => /^[a-z0-9-]{4,40}$/.test(firebaseProjectId())

function keys() {
  // Only the local checks point this at their own key set.
  const url = process.env.NODE_ENV !== 'production' && process.env.FIREBASE_JWKS_URL ? process.env.FIREBASE_JWKS_URL : googleKeys
  if (!keySet || keySetUrl !== url) { keySet = createRemoteJWKSet(new URL(url), { timeoutDuration: 8000, cooldownDuration: 30000 }); keySetUrl = url }
  return keySet
}

export async function verifyPhoneToken(token, maxAgeSeconds = 600) {
  if (!phoneAuthConfigured()) throw invalid('La verificación por SMS no está configurada en el servidor (Firebase).', 503)
  if (typeof token !== 'string' || token.length > 4096 || token.split('.').length !== 3) throw invalid('Verificación por SMS inválida. Envía un código nuevo.')
  const project = firebaseProjectId()
  let payload
  try {
    ;({ payload } = await jwtVerify(token, keys(), { algorithms: ['RS256'], issuer: `https://securetoken.google.com/${project}`, audience: project, clockTolerance: 60 }))
  } catch (error) {
    // Network or key-set problems are not the person's fault: ask to retry instead of a new code.
    const code = String(error?.code || '')
    if (!code.startsWith('ERR_JW') || ['ERR_JWKS_TIMEOUT', 'ERR_JWKS_INVALID'].includes(code)) throw invalid('No pudimos comprobar la verificación con Google. Intenta de nuevo.', 502)
    throw invalid('La verificación por SMS no es válida o venció. Envía un código nuevo.', 400)
  }
  const now = Math.floor(Date.now() / 1000)
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) throw invalid('Verificación por SMS inválida.')
  if (payload.firebase?.sign_in_provider !== 'phone' || typeof payload.phone_number !== 'string') throw invalid('La verificación no corresponde a un código por SMS.')
  if (typeof payload.auth_time !== 'number' || payload.auth_time > now + 60 || now - payload.auth_time > maxAgeSeconds) throw invalid('La verificación por SMS venció. Envía un código nuevo.', 409)
  return { uid: payload.sub, phone: payload.phone_number, authTime: new Date(payload.auth_time * 1000) }
}
