import { Router } from 'express'
import { createHash, randomBytes } from 'node:crypto'
import { waitUntil } from '@vercel/functions'
import { pool } from './db.js'
import { audit } from './audit.js'
import { databaseRateLimit } from './rate-limit.js'
import { recoveryMailConfiguration, sendPasswordRecoveryEmail } from './recovery-mail.js'

const digest = value => createHash('sha256').update(value).digest('hex')
const fingerprint = account => digest(`${account.correo_login}\0${account.password_hash}`)
const eligible = account => account && ['activo', 'pendiente'].includes(account.estado_usuario)
const validToken = token => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)
const invalidLink = 'El enlace no es válido o ya venció. Solicita uno nuevo.'
const accepted = { ok: true, message: 'Si el correo corresponde a una cuenta habilitada para recuperar el acceso, recibirás un enlace válido por 15 minutos. Revisa también la carpeta de spam.' }

async function issueRecovery(email, configuration, request) {
  let connection, tokenHash
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const [accounts] = await connection.execute('SELECT id_usuario,correo_login,password_hash,estado_usuario FROM usuario WHERE correo_login=? FOR UPDATE', [email])
    const account = accounts[0]
    if (!eligible(account)) { await connection.rollback(); return }
    const token = randomBytes(32).toString('hex')
    tokenHash = digest(token)
    await connection.execute(`INSERT INTO recuperacion_contrasena(id_usuario,token_hash,credencial_hash,enviado,fecha_creacion,fecha_expiracion)
      VALUES (?,?,?,0,UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE))
      ON DUPLICATE KEY UPDATE token_hash=VALUES(token_hash),credencial_hash=VALUES(credencial_hash),enviado=0,fecha_creacion=UTC_TIMESTAMP(),fecha_expiracion=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE)`, [account.id_usuario, tokenHash, fingerprint(account)])
    await audit(connection, request, 'account.recovery_requested', 200, account.id_usuario)
    await connection.commit()
    connection.release(); connection = null
    // Release MySQL before sending email: Vercel instances have a small pool.
    await sendPasswordRecoveryEmail(email, token, configuration)
    await pool.execute('UPDATE recuperacion_contrasena SET enviado=1 WHERE token_hash=? AND fecha_expiracion>UTC_TIMESTAMP()', [tokenHash])
  } catch (error) {
    if (connection) { await connection.rollback(); connection.release(); connection = null }
    if (tokenHash) {
      try { await pool.execute('DELETE FROM recuperacion_contrasena WHERE token_hash=?', [tokenHash]) }
      catch { /* An undelivered token remains unusable and expires after 15 minutes. */ }
    }
    console.error('Error de recuperación por correo:', error.code || 'RECOVERY_SEND_ERROR')
  } finally { connection?.release() }
}

export function createPasswordRecoveryRouter({ hashPassword }) {
  const router = Router()
  const requestLimit = databaseRateLimit({ prefix: 'recovery-ip', maximum: 10, seconds: 900 })
  const emailLimit = databaseRateLimit({ prefix: 'recovery-email', maximum: 3, seconds: 900, key: request => String(request.body?.email || '').trim().toLowerCase().slice(0, 120) })
  const resetLimit = databaseRateLimit({ prefix: 'recovery-reset', maximum: 30, seconds: 900 })

  router.post('/forgot-password', requestLimit, emailLimit, (request, response) => {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
    if (!email || email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response.status(400).json({ error: 'Ingresa un correo electrónico válido (máximo 120 caracteres).' })
    let configuration
    try { configuration = recoveryMailConfiguration() }
    catch {
      console.error('Recuperación por correo sin configurar: revisa MAIL_PROVIDER, sus credenciales y APP_PUBLIC_URL.')
      return response.status(503).json({ error: 'La recuperación por correo no está disponible en este momento. Comunícate con la administración.' })
    }
    // The lookup and email run after the same public response for every address.
    // waitUntil keeps the task alive on Vercel after sending that response.
    waitUntil(issueRecovery(email, configuration, request))
    response.json(accepted)
  })

  router.post('/reset-password/validate', resetLimit, async (request, response) => {
    const token = request.body?.token
    if (!validToken(token)) return response.status(400).json({ error: invalidLink })
    try {
      const [rows] = await pool.execute(`SELECT r.credencial_hash,u.correo_login,u.password_hash,u.estado_usuario FROM recuperacion_contrasena r
        JOIN usuario u ON u.id_usuario=r.id_usuario WHERE r.token_hash=? AND r.enviado=1 AND r.fecha_expiracion>UTC_TIMESTAMP()`, [digest(token)])
      if (!eligible(rows[0]) || rows[0].credencial_hash !== fingerprint(rows[0])) return response.status(400).json({ error: invalidLink })
      response.json({ ok: true })
    } catch (error) {
      console.error('Error al validar recuperación:', error.code || 'RECOVERY_VALIDATE_ERROR')
      response.status(503).json({ error: 'No pudimos verificar el enlace. Inténtalo nuevamente.' })
    }
  })

  router.post('/reset-password', resetLimit, async (request, response) => {
    const { token, newPassword, confirmation } = request.body || {}
    if (!validToken(token)) return response.status(400).json({ error: invalidLink })
    if (typeof newPassword !== 'string' || newPassword.length < 10 || newPassword.length > 128) return response.status(400).json({ error: 'La nueva contraseña debe tener entre 10 y 128 caracteres.' })
    if (newPassword !== confirmation) return response.status(400).json({ error: 'Las contraseñas no coinciden.' })
    let connection
    try {
      const tokenHash = digest(token)
      const [targets] = await pool.execute('SELECT id_usuario FROM recuperacion_contrasena WHERE token_hash=? AND enviado=1 AND fecha_expiracion>UTC_TIMESTAMP()', [tokenHash])
      if (!targets.length) return response.status(400).json({ error: invalidLink })
      const passwordHash = await hashPassword(newPassword)
      connection = await pool.getConnection()
      await connection.beginTransaction()
      // Same lock order as issuance: account first, then its reset token.
      const [accounts] = await connection.execute('SELECT id_usuario,correo_login,password_hash,estado_usuario FROM usuario WHERE id_usuario=? FOR UPDATE', [targets[0].id_usuario])
      const [tokens] = await connection.execute('SELECT credencial_hash FROM recuperacion_contrasena WHERE id_usuario=? AND token_hash=? AND enviado=1 AND fecha_expiracion>UTC_TIMESTAMP() FOR UPDATE', [targets[0].id_usuario, tokenHash])
      const account = accounts[0]
      if (!eligible(account) || !tokens.length || tokens[0].credencial_hash !== fingerprint(account)) {
        await connection.rollback()
        return response.status(400).json({ error: invalidLink })
      }
      await connection.execute('UPDATE usuario SET password_hash=? WHERE id_usuario=?', [passwordHash, account.id_usuario])
      await connection.execute('DELETE FROM sesion_usuario WHERE id_usuario=?', [account.id_usuario])
      await connection.execute('DELETE FROM reto_mfa WHERE id_usuario=?', [account.id_usuario])
      await connection.execute('DELETE FROM recuperacion_contrasena WHERE id_usuario=?', [account.id_usuario])
      await audit(connection, request, 'account.password_recovered', 200, account.id_usuario)
      await connection.commit()
      // A reset never logs the user in or creates a new session.
      response.json({ ok: true })
    } catch (error) {
      if (connection) await connection.rollback()
      console.error('Error al restablecer contraseña:', error.code || 'RECOVERY_RESET_ERROR')
      response.status(503).json({ error: 'No pudimos cambiar la contraseña. Inténtalo nuevamente.' })
    } finally { connection?.release() }
  })
  return router
}
