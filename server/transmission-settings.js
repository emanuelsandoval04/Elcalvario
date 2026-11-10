import { Router } from 'express'
import { pool } from './db.js'
import { hasPermission, requirePermission } from './auth.js'
import { invalid } from './entities.js'
import {
  readTransmissionSettings, effectiveSettings, fetchRecentVideos, facebookTransmission, clearTransmissionCache,
  encryptToken, encryptionReady, normalizeVideoUrl, validPageId, validGraphVersion, defaultGraphVersion,
} from './facebook.js'

const permission = 'transmisiones.gestionar'
// The token is write-only: responses only reveal whether one exists and its last 4 characters.
function publicSettings(row) {
  return {
    mode: row?.modo === 'manual' ? 'manual' : 'automatico',
    pageId: row?.id_pagina || '',
    graphVersion: row?.version_graph || defaultGraphVersion,
    hasToken: Boolean(row?.token_cifrado),
    tokenEnding: row?.token_cifrado ? row.token_final : null,
    environmentToken: !row?.token_cifrado && Boolean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN),
    manualVideo: row?.video_manual || '',
    lastStatus: row?.ultimo_estado || null,
    checkedAt: row?.fecha_verificacion || null,
    updatedAt: row?.fecha_actualizacion || null,
    encryptionReady: encryptionReady(),
  }
}
async function recordStatus(connection, message) {
  await connection.execute('UPDATE configuracion_transmision SET ultimo_estado=?,fecha_verificacion=UTC_TIMESTAMP() WHERE id=1', [message.slice(0, 200)])
}

export function transmissionRouter({ transaction, currentActor }) {
  const router = Router()
  router.use('/transmission', requirePermission(permission))

  router.get('/transmission/settings', async (_req, res) => {
    const row = await readTransmissionSettings()
    if (!row) throw invalid('Falta aplicar la migración 023 de transmisiones (npm run db:migrate).', 503)
    res.json({ settings: publicSettings(row), current: await facebookTransmission() })
  })

  router.put('/transmission/settings', async (req, res) => {
    const body = req.body || {}
    const mode = body.mode === 'manual' ? 'manual' : body.mode === 'automatico' ? 'automatico' : null
    if (!mode) throw invalid('Elige cómo se muestran las transmisiones.')
    const pageId = String(body.pageId || '').trim()
    if (pageId && !validPageId(pageId)) throw invalid('El ID de la página son solo números (por ejemplo 61556906195984).')
    const graphVersion = String(body.graphVersion || defaultGraphVersion).trim()
    if (!validGraphVersion(graphVersion)) throw invalid('La versión de la API debe verse como v23.0.')
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    if (token && (token.length < 40 || token.length > 1000 || /\s/.test(token))) throw invalid('El token de Meta no tiene un formato válido. Cópialo completo, sin espacios.')
    const manualVideo = normalizeVideoUrl(body.manualVideo)

    const saved = await transaction(async connection => {
      const actor = await currentActor(req, connection)
      if (!hasPermission(actor, permission)) throw invalid('Ya no tienes permiso para configurar transmisiones.', 403)
      const [rows] = await connection.execute('SELECT * FROM configuracion_transmision WHERE id=1 FOR UPDATE')
      const row = rows[0]
      if (!row) throw invalid('Falta aplicar la migración 023 de transmisiones (npm run db:migrate).', 503)
      const values = { modo: mode, id_pagina: pageId || null, version_graph: graphVersion, video_manual: manualVideo, id_usuario_actualizacion: actor.id }
      if (body.removeToken === true) Object.assign(values, { token_cifrado: null, token_final: null, ultimo_estado: null, fecha_verificacion: null })
      else if (token) Object.assign(values, { token_cifrado: encryptToken(token), token_final: token.slice(-4) })
      await connection.query('UPDATE configuracion_transmision SET ?, fecha_actualizacion=UTC_TIMESTAMP() WHERE id=1', [values])
      return true
    })
    if (saved) clearTransmissionCache()
    const row = await readTransmissionSettings()
    res.json({ settings: publicSettings(row), current: await facebookTransmission() })
  })

  // Asks Meta for the latest broadcasts with the saved configuration.
  router.post('/transmission/test', async (_req, res) => {
    const row = await readTransmissionSettings()
    if (!row) throw invalid('Falta aplicar la migración 023 de transmisiones (npm run db:migrate).', 503)
    const settings = effectiveSettings(row)
    if (!settings.token) throw invalid('Primero guarda el token de acceso de la página (paso 4 de la guía).')
    try {
      const videos = await fetchRecentVideos(settings)
      const message = videos.length ? `Conexión correcta: ${videos.length} transmisión(es) encontradas.` : 'Conexión correcta, pero la página aún no tiene transmisiones.'
      await recordStatus(pool, message)
      clearTransmissionCache()
      res.json({ ok: true, message, videos, settings: publicSettings(await readTransmissionSettings()) })
    } catch (error) {
      await recordStatus(pool, `Error: ${error.message}`)
      throw invalid(error.message, error.status === 502 ? 502 : 400)
    }
  })
  return router
}
