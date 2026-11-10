import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { pool } from './db.js'

// Public page of Misión Cristiana El Calvario. The panel or the environment can replace it.
const defaultPage = '61556906195984'
export const defaultGraphVersion = 'v23.0'
const facebookHosts = new Set(['facebook.com', 'www.facebook.com', 'web.facebook.com', 'm.facebook.com', 'mbasic.facebook.com'])
const cacheMilliseconds = 60000
let cached = { expires: 0, data: null }
let pending

const failure = (message, status = 400) => Object.assign(new Error(message), { status })
export const validPageId = value => /^\d{5,30}$/.test(String(value || ''))
export const validGraphVersion = value => /^v\d{1,2}\.\d$/.test(String(value || ''))

// ---------- Token encryption (AES-256-GCM) ----------
function secretKey() {
  const secret = process.env.TRANSMISSION_SECRET_KEY || ''
  return secret.length >= 32 ? createHash('sha256').update(secret).digest() : null
}
export const encryptionReady = () => Boolean(secretKey())
export function encryptToken(token) {
  const key = secretKey()
  if (!key) throw failure('Falta configurar TRANSMISSION_SECRET_KEY en el servidor. Pide al administrador que la agregue (ver la guía).', 409)
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':')
}
function decryptToken(stored) {
  const key = secretKey()
  if (!stored || !key) return null
  try {
    const [version, iv, tag, data] = stored.split(':')
    if (version !== 'v1') return null
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
  } catch { return null }
}

// ---------- Video links ----------
// Accepts a video link or the complete "Insertar" (embed) code copied from Facebook,
// and returns a canonical https://www.facebook.com/... link, or throws a readable error.
export function normalizeVideoUrl(input) {
  let value = String(input || '').trim()
  if (!value) return null
  if (value.length > 3000) throw failure('El enlace o código es demasiado largo.')
  const iframe = value.match(/<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i)
  if (iframe) value = iframe[1].replaceAll('&amp;', '&')
  let url
  try { url = new URL(value) } catch { throw failure('Pega el enlace del video o el código de "Insertar" de Facebook.') }
  if (url.protocol !== 'https:' || !facebookHosts.has(url.hostname)) throw failure('El enlace debe ser de facebook.com.')
  if (url.pathname.startsWith('/plugins/video.php')) {
    const href = url.searchParams.get('href')
    if (!href) throw failure('El código de insertar no contiene el enlace del video.')
    return normalizeVideoUrl(href)
  }
  const watch = url.pathname.replace(/\/+$/, '') === '/watch' && /^\d+$/.test(url.searchParams.get('v') || '')
  if (!watch && !/^\/(?:[\w.-]+\/videos\/(?:[\w.-]+\/)?\d+|reel\/\d+|share\/v\/[\w-]+)\/?$/.test(url.pathname)) throw failure('Ese enlace no corresponde a un video de Facebook.')
  return watch ? `https://www.facebook.com/watch/?v=${url.searchParams.get('v')}` : `https://www.facebook.com${url.pathname}`
}
const safeVideoUrl = (value, page, id) => {
  try { return normalizeVideoUrl(new URL(value || `/${page}/videos/${id}/`, 'https://www.facebook.com').href) } catch { return null }
}

// ---------- Settings ----------
export async function readTransmissionSettings(connection = pool) {
  try {
    const [rows] = await connection.execute('SELECT * FROM configuracion_transmision WHERE id=1')
    return rows[0] || null
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') return null // Migration 023 not applied yet.
    throw error
  }
}
function effectiveSettings(row) {
  const env = process.env
  const page = validPageId(row?.id_pagina) ? row.id_pagina : validPageId(env.FACEBOOK_PAGE_ID) ? env.FACEBOOK_PAGE_ID : defaultPage
  const token = decryptToken(row?.token_cifrado) || env.FACEBOOK_PAGE_ACCESS_TOKEN || null
  const version = validGraphVersion(row?.version_graph) ? row.version_graph : validGraphVersion(env.FACEBOOK_GRAPH_VERSION) ? env.FACEBOOK_GRAPH_VERSION : defaultGraphVersion
  let manual = null
  try { manual = normalizeVideoUrl(row?.video_manual) } catch { /* invalid values are ignored */ }
  let fallbackVideo = null
  try { fallbackVideo = normalizeVideoUrl(env.FACEBOOK_FALLBACK_VIDEO) } catch { /* ignored */ }
  return { mode: row?.modo === 'manual' ? 'manual' : 'automatico', page, token, version, manual: manual || fallbackVideo, pageUrl: `https://www.facebook.com/${page}` }
}

// ---------- Meta Graph API ----------
function metaMessage(code) {
  if (code === 190) return 'El token de Meta venció o no es válido. Genera uno nuevo (paso 4 de la guía).'
  if ([10, 200, 210, 230].includes(code) || code >= 200 && code < 300) return 'El token no tiene permiso para leer los videos de la página. Revisa los permisos pages_read_engagement y pages_show_list.'
  if (code === 100 || code === 803) return 'Meta no encontró la página. Revisa el ID de la página.'
  if (code === 4 || code === 17 || code === 32 || code === 613) return 'Meta limitó temporalmente las consultas. Inténtalo en unos minutos.'
  return 'Meta no respondió correctamente. Inténtalo nuevamente.'
}
export async function fetchRecentVideos({ page, token, version }, limit = 6) {
  if (!validPageId(page) || !token || !validGraphVersion(version)) throw failure('Faltan el ID de la página o el token de Meta.')
  const endpoint = new URL(`https://graph.facebook.com/${version}/${page}/live_videos`)
  endpoint.searchParams.set('fields', 'id,status,title,permalink_url,creation_time')
  endpoint.searchParams.set('limit', '15')
  let response
  try { response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }) }
  catch { throw failure('No fue posible conectar con Meta. Revisa la conexión del servidor.', 502) }
  // Only Meta's numeric error code is read: messages can contain identifiers.
  const data = await response.json().catch(() => null)
  if (!response.ok) throw failure(metaMessage(Number(data?.error?.code)), 502)
  if (!Array.isArray(data?.data)) throw failure('Meta devolvió una respuesta inesperada.', 502)
  return data.data
    .filter(item => ['LIVE', 'VOD'].includes(item.status))
    .sort((a, b) => a.status !== b.status ? (a.status === 'LIVE' ? -1 : 1) : Date.parse(b.creation_time) - Date.parse(a.creation_time))
    .map(item => ({ id: String(item.id), live: item.status === 'LIVE', title: String(item.title || '').slice(0, 200) || null, createdAt: item.creation_time || null, url: safeVideoUrl(item.permalink_url, page, item.id) }))
    .filter(item => item.url)
    .slice(0, limit)
}

// ---------- Public transmission (home page) ----------
export function clearTransmissionCache() { cached = { expires: 0, data: null } }
export async function facebookTransmission() {
  if (cached.expires > Date.now()) return cached.data
  if (pending) return pending
  pending = (async () => {
    const settings = effectiveSettings(await readTransmissionSettings().catch(() => null))
    let result = { videoUrl: settings.manual, pageUrl: settings.pageUrl, automatic: false, live: false, title: null }
    if (settings.mode === 'automatico' && settings.token) {
      try {
        const [video] = await fetchRecentVideos(settings, 1)
        if (video) result = { videoUrl: video.url, pageUrl: settings.pageUrl, automatic: true, live: video.live, title: video.title }
      } catch { /* Keep the manual video. Never log tokens, endpoints or Meta payloads. */ }
    }
    cached = { expires: Date.now() + cacheMilliseconds, data: result }
    return result
  })()
  try { return await pending } finally { pending = undefined }
}

export { effectiveSettings }
