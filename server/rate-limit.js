import { createHash } from 'node:crypto'
import { pool } from './db.js'

// Counters live in MySQL so parallel Vercel instances share the same limits.
export async function consumeAttempt(key, maximum, database = pool) {
  const digest = createHash('sha256').update(key).digest('hex')
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    await connection.execute(`INSERT INTO limite_solicitud (clave,intentos,vence_en)
      VALUES (?,1,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE))
      ON DUPLICATE KEY UPDATE
        intentos=IF(vence_en<=UTC_TIMESTAMP(),1,intentos+1),
        vence_en=IF(vence_en<=UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),vence_en)`, [digest])
    const [rows] = await connection.execute('SELECT intentos,TIMESTAMPDIFF(SECOND,UTC_TIMESTAMP(),vence_en) AS segundos FROM limite_solicitud WHERE clave=?', [digest])
    await connection.commit()
    return { allowed: rows[0].intentos <= maximum, retryAfter: Math.max(1, rows[0].segundos) }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

let lastCleanup = 0
export function databaseRateLimit({ prefix, maximum, message = 'Demasiados intentos. Inténtalo de nuevo más tarde.' }) {
  return async (request, response, next) => {
    try {
      // Bounded maintenance once per hour per warm instance; no background job.
      if (Date.now() - lastCleanup > 3600000) {
        await pool.execute('DELETE FROM limite_solicitud WHERE vence_en < DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) LIMIT 100')
        lastCleanup = Date.now()
      }
      const result = await consumeAttempt(`${prefix}:${request.ip}:${request.path}`, typeof maximum === 'function' ? maximum(request) : maximum)
      if (!result.allowed) {
        response.set('Retry-After', String(result.retryAfter))
        return response.status(429).json({ error: message })
      }
      next()
    } catch (error) {
      console.error('Error de límite de solicitudes:', error.code || 'RATE_LIMIT_ERROR')
      response.status(503).json({ error: 'El servicio no está disponible. Inténtalo nuevamente en unos minutos.' })
    }
  }
}
