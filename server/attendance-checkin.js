import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import { pool } from './db.js'
import { requirePermission, protectMutation } from './auth.js'
import { invalid, identifier } from './entities.js'
import { databaseRateLimit } from './rate-limit.js'
import { recalculateAlerts } from './alerts.js'

// QR self check-in. Each event date has its own unguessable token (actividad.token_asistencia),
// created the first time the team opens its QR. The public page works on any date, without signing in: members type their document number and get their name as confirmation;
// anyone else registers as a visitor with their full name.
export const checkinOrigin = 'autoregistro_qr'
const tokenPattern = /^[A-Za-z0-9_-]{32}$/
const invalidCode = 'Este código QR ya no es válido. Pide el código actualizado al equipo de servidores.'
const stateMessages = { cancelled: 'Este encuentro fue cancelado. No se registra asistencia.' }

// 1.020.304, 1 020 304 and 1020304 are the same document.
export function normalizeDocument(value) {
  if (value == null || value === '') return ''
  if (typeof value !== 'string') return null
  const cleaned = value.normalize('NFKC').replace(/[\s.\-]/g, '').toUpperCase()
  return /^[A-Z0-9]{4,20}$/.test(cleaned) ? cleaned : null
}
const documentSql = "UPPER(REPLACE(REPLACE(REPLACE(m.numero_identificacion,'.',''),' ',''),'-',''))"

function visitorName(value) {
  if (value == null || value === '') return ''
  const name = typeof value === 'string' ? value.normalize('NFC').replace(/\s+/g, ' ').trim() : ''
  if (name.length > 150 || !/^\p{L}[\p{L}\p{M} .'-]*$/u.test(name) || name.split(' ').filter(part => /\p{L}/u.test(part)).length < 2) throw invalid('Escribe tu nombre completo (nombre y apellido).')
  return name
}

// Registration is open on any date (past or future); only a cancelled event refuses it.
function checkinState(activity) {
  return activity.estado_actividad === 'cancelada' ? 'cancelled' : 'open'
}


async function transaction(action) {
  const connection = await pool.getConnection()
  try { await connection.beginTransaction(); const result = await action(connection); await connection.commit(); return result }
  catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}

// Team side: show (and optionally renew) the QR link of one event date.
export function checkinManagementRouter({ getActivity }) {
  const router = Router()
  router.post('/attendance/checkin-link', requirePermission('asistencia.registrar'), async (req, res) => {
    const activity = await getActivity(req, identifier(req.body?.activityId), 'asistencia.registrar')
    const renew = req.body?.renew === true
    if (renew || !activity.token_asistencia) {
      // Keeping fecha_actualizacion avoids presenting the event as changed in notifications.
      await pool.execute(`UPDATE actividad SET token_asistencia=?,fecha_actualizacion=fecha_actualizacion WHERE id_actividad=? ${renew ? '' : 'AND token_asistencia IS NULL'}`, [randomBytes(24).toString('base64url'), activity.id_actividad])
    }
    const [rows] = await pool.execute('SELECT token_asistencia FROM actividad WHERE id_actividad=?', [activity.id_actividad])
    res.json({ token: rows[0].token_asistencia, state: checkinState(activity) })
  })
  return router
}

// Public side, mounted under /api/public/checkin.
export function publicCheckinRouter() {
  const router = Router()
  const limit = databaseRateLimit({ prefix: 'checkin', maximum: 300, seconds: 600, key: req => String(req.ip), message: 'Hay muchos registros desde esta conexión. Espera unos minutos e inténtalo de nuevo.' })
  router.get('/:token', async (req, res) => {
    if (!tokenPattern.test(req.params.token)) throw invalid(invalidCode, 404)
    const [rows] = await pool.execute(`SELECT ac.titulo,CAST(ac.fecha AS CHAR) AS fecha,ac.hora,ac.lugar,ac.estado_actividad,ac.tipo_actividad
      FROM actividad ac WHERE ac.token_asistencia=? AND ac.archivado=0`, [req.params.token])
    if (!rows.length) throw invalid(invalidCode, 404)
    const event = rows[0]
    res.json({ event: { titulo: event.titulo, fecha: event.fecha, hora: String(event.hora).slice(0, 5), lugar: event.lugar, grupo: event.tipo_actividad === 'reunion_grupo' }, state: checkinState(event) })
  })
  router.post('/:token', protectMutation, limit, async (req, res) => {
    if (!tokenPattern.test(req.params.token)) throw invalid(invalidCode, 404)
    const document = normalizeDocument(req.body?.documento)
    if (document === null) throw invalid('Revisa el número de documento: escribe de 4 a 20 números o letras.')
    const name = visitorName(req.body?.nombre)
    if (!document && !name) throw invalid('Escribe tu número de cédula.')
    const device = typeof req.get('user-agent') === 'string' ? req.get('user-agent').slice(0, 150) : null
    const result = await transaction(async connection => {
      const [rows] = await connection.execute('SELECT id_actividad,CAST(fecha AS CHAR) AS fecha,estado_actividad,tipo_actividad FROM actividad WHERE token_asistencia=? AND archivado=0 FOR UPDATE', [req.params.token])
      if (!rows.length) throw invalid(invalidCode, 404)
      const activity = rows[0], state = checkinState(activity)
      if (state !== 'open') throw invalid(stateMessages[state], 409)
      const [groups] = activity.tipo_actividad === 'reunion_grupo' ? await connection.execute('SELECT id_grupo FROM reunion_grupo WHERE id_actividad=?', [activity.id_actividad]) : [[]]
      const groupId = groups[0]?.id_grupo || null
      // Group meetings only recognize the group's disciples; everyone else registers as a visitor.
      const [members] = document ? await connection.execute(`SELECT m.id_miembro,CONCAT_WS(' ',m.nombres,m.apellidos) AS nombre FROM miembro m WHERE m.archivado=0 AND ${documentSql}=? ${groupId ? 'AND m.id_grupo=?' : ''}
        ORDER BY m.tipo_identificacion='CC' DESC,m.id_miembro LIMIT 1`, [document, ...(groupId ? [groupId] : [])]) : [[]]
      const member = members[0]
      if (member) {
        await connection.execute('SELECT id_miembro FROM miembro WHERE id_miembro=? FOR UPDATE', [member.id_miembro])
        const [saved] = await connection.execute('SELECT id_asistencia,estado_asistencia,archivado FROM asistencia WHERE id_actividad=? AND id_miembro=? FOR UPDATE', [activity.id_actividad, member.id_miembro])
        if (saved[0]?.archivado) throw invalid('Tu registro en este encuentro fue retirado por el equipo. Acércate a un servidor para revisarlo.', 409)
        if (['presente', 'visitante'].includes(saved[0]?.estado_asistencia)) return { result: 'already', nombre: member.nombre }
        // Someone marked absent or excused who is actually here becomes present.
        if (saved.length) await connection.execute("UPDATE asistencia SET estado_asistencia='presente',metodo_registro='qr',origen_registro=?,dispositivo_origen=?,id_usuario_modificacion=NULL WHERE id_asistencia=?", [checkinOrigin, device, saved[0].id_asistencia])
        else await connection.execute("INSERT INTO asistencia(id_actividad,id_miembro,id_usuario_registro,estado_asistencia,metodo_registro,origen_registro,dispositivo_origen) VALUES (?,?,NULL,'presente','qr',?,?)", [activity.id_actividad, member.id_miembro, checkinOrigin, device])
        await recalculateAlerts(connection, member.id_miembro)
        return { result: 'registered', nombre: member.nombre }
      }
      if (!name) return { result: 'not_found' }
      const [visitors] = await connection.execute(`SELECT id_asistencia FROM asistencia WHERE id_actividad=? AND id_miembro IS NULL AND archivado=0 AND ${document ? 'documento_visitante=?' : 'documento_visitante IS NULL AND nombre_visitante=?'} LIMIT 1`, [activity.id_actividad, document || name])
      if (visitors.length) return { result: 'already', nombre: name }
      await connection.execute("INSERT INTO asistencia(id_actividad,id_miembro,nombre_visitante,documento_visitante,id_usuario_registro,estado_asistencia,metodo_registro,origen_registro,dispositivo_origen) VALUES (?,NULL,?,?,NULL,'visitante','qr',?,?)", [activity.id_actividad, name, document || null, checkinOrigin, device])
      return { result: 'visitor', nombre: name }
    })
    res.status(result.result === 'not_found' ? 200 : 201).json(result)
  })
  router.use((error, _req, res, next) => error.status ? res.status(error.status).json({ error: error.message }) : next(error))
  return router
}
