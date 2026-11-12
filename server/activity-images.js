import { Router } from 'express'
import { pool } from './db.js'
import { hasPermission } from './auth.js'
import { invalid } from './entities.js'
import { databaseRateLimit } from './rate-limit.js'
import { parseJpegDataUrl } from './profile-photo.js'

// Event images uploaded from the panel. The browser resizes them to a JPEG (max 1600 px),
// MySQL stores the bytes (Vercel has no persistent disk) and the public site reads them
// through a content-addressed URL, so actividad.imagen keeps a short site path.
export const maxActivityImageBytes = 900 * 1024
export const maxActivityImageSide = 1600
export const activityImagePath = version => `/api/public/event-images/${version}.jpg`

export function parseActivityImage(value) {
  return parseJpegDataUrl(value, {
    maxBytes: maxActivityImageBytes, maxSide: maxActivityImageSide,
    error: () => invalid('Selecciona una imagen JPG, PNG o WebP válida.'),
    tooLarge: () => invalid('La imagen preparada supera el tamaño permitido. Elige otra imagen.', 413),
    foreign: () => invalid('La imagen debe prepararse desde el selector del formulario.'),
  })
}

// Uploads that never reached a saved event (cancelled forms) are removed after two days.
// Archived events and weekly series templates keep their images.
const removeOrphans = `DELETE FROM imagen_actividad
  WHERE fecha_creacion<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 DAY)
    AND NOT EXISTS(SELECT 1 FROM actividad ac WHERE ac.imagen=CONCAT('/api/public/event-images/',imagen_actividad.version,'.jpg'))
    AND NOT EXISTS(SELECT 1 FROM serie_actividad s WHERE JSON_UNQUOTE(JSON_EXTRACT(s.plantilla,'$.activity.imagen'))=CONCAT('/api/public/event-images/',imagen_actividad.version,'.jpg'))
  LIMIT 20`

export function activityImagesRouter() {
  const router = Router()
  const uploadLimit = databaseRateLimit({ prefix: 'event-images', maximum: 40, seconds: 3600, key: req => String(req.authUser.id), message: 'Has subido muchas imágenes. Espera unos minutos antes de subir otra.' })
  router.post('/activities/images', (req, res, next) => hasPermission(req.authUser, 'eventos.editar') || hasPermission(req.authUser, 'grupos.editar') ? next() : res.status(403).json({ error: 'No tienes permiso para subir imágenes de eventos.' }), uploadLimit, async (req, res) => {
    const image = parseActivityImage(req.body?.image)
    // Re-uploading the same picture renews its date so the cleanup below cannot remove it.
    await pool.execute('INSERT INTO imagen_actividad(version,contenido,ancho,alto,id_usuario_creacion) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE fecha_creacion=UTC_TIMESTAMP()',
      [image.version, image.bytes, image.width, image.height, req.authUser.id])
    try { await pool.execute(removeOrphans) } catch (error) { console.error('No se pudieron limpiar imágenes sin evento:', error.code || 'IMAGE_CLEANUP_ERROR') }
    res.status(201).json({ url: activityImagePath(image.version), width: image.width, height: image.height })
  })
  return router
}

export function publicActivityImages(publicRouter) {
  publicRouter.get('/event-images/:file', async (req, res) => {
    const match = /^([a-f0-9]{64})\.jpg$/.exec(req.params.file)
    if (!match) return res.status(404).json({ error: 'Imagen no encontrada.' })
    const [rows] = await pool.execute('SELECT contenido FROM imagen_actividad WHERE version=?', [match[1]])
    if (!rows.length) return res.status(404).json({ error: 'Imagen no encontrada.' })
    // The address changes with the content, so the browser may keep it for a year.
    res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Security-Policy': "default-src 'none'", 'Cross-Origin-Resource-Policy': 'same-site' }).send(rows[0].contenido)
  })
}
