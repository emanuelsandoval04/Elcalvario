import { Router } from 'express'
import { pool } from './db.js'
import { isAllowedOrigin } from './origin.js'
import { databaseRateLimit } from './rate-limit.js'

export const participationRouter = Router()
participationRouter.post('/', (request, response, next) => {
  if (request.headers['sec-fetch-site'] === 'cross-site' || !isAllowedOrigin(request.headers.origin, request.get('host'), process.env.APP_ORIGINS, process.env.NODE_ENV === 'production')) return response.status(403).json({ error: 'Solicitud no permitida.' })
  if (!request.is('application/json')) return response.status(415).json({ error: 'Formato de solicitud inválido.' })
  next()
}, databaseRateLimit({ prefix: 'participation', maximum: 10, message: 'Demasiadas solicitudes. Inténtalo de nuevo más tarde.' }), async (request, response) => {
  const field = key => typeof request.body?.[key] === 'string' ? request.body[key].trim() : ''
  const name = field('name'), phone = field('phone'), ministry = field('ministry'), message = field('message')
  if (!name || name.length > 120) return response.status(400).json({ error: 'Ingresa tu nombre (máximo 120 caracteres).' })
  if (!/^[+0-9 ()-]{7,30}$/.test(phone) || phone.replace(/\D/g, '').length < 7) return response.status(400).json({ error: 'Ingresa un teléfono válido con al menos 7 dígitos.' })
  if (message.length > 2000) return response.status(400).json({ error: 'El mensaje puede tener hasta 2000 caracteres.' })
  try {
    const [ministries] = await pool.execute('SELECT id_ministerio FROM ministerio WHERE nombre=?',[ministry])
    if (!ministries.length) return response.status(400).json({ error: 'Selecciona un ministerio válido.' })
    await pool.execute('INSERT INTO solicitud_participacion (nombre, telefono, ministerio, mensaje) VALUES (?, ?, ?, ?)', [name, phone, ministry, message])
    response.status(201).json({ ok: true })
  } catch (error) {
    console.error('Error de participación:', error.code || 'PARTICIPATION_ERROR')
    response.status(503).json({ error: 'No pudimos guardar tu solicitud. Inténtalo nuevamente.' })
  }
})
