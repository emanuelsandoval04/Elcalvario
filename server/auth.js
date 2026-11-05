import { Router } from 'express'
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { pool } from './db.js'
import { isAllowedOrigin } from './origin.js'
import { pastoralRoleFor, registrationCapabilities, hasPastoralAuthority, pastoralRoles } from './pastoral-policy.js'
import { parseProfilePhoto, saveProfilePhoto } from './profile-photo.js'
import { sessionMilliseconds } from './config.js'
import { databaseRateLimit } from './rate-limit.js'

const deriveKey = promisify(scrypt)
const passwordOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }
const cookieName = 'calvario_session'
const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/api' }
export const authRouter = Router()

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const key = await deriveKey(password, salt, 64, passwordOptions)
  return `scrypt$${salt}$${key.toString('hex')}`
}
async function verifyPassword(password, hash) {
  const [algorithm, salt, encoded] = hash.split('$')
  if (algorithm !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(encoded || '')) return false
  const key = await deriveKey(password, salt, 64, passwordOptions)
  return timingSafeEqual(key, Buffer.from(encoded, 'hex'))
}
const dummyHash = await hashPassword(randomBytes(32).toString('hex'))
const tokenDigest = token => createHash('sha256').update(token).digest('hex')

function sessionToken(request) {
  const cookie = (request.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${cookieName}=`))
  const token = cookie?.slice(cookieName.length + 1)
  return /^[a-f0-9]{64}$/.test(token || '') ? token : null
}
async function createSession(connection, id, response) {
  const token = randomBytes(32).toString('hex')
  await connection.execute('INSERT INTO sesion_usuario (token_hash, id_usuario, fecha_expiracion) VALUES (?, ?, ?)', [tokenDigest(token), id, new Date(Date.now() + sessionMilliseconds)])
  return () => response.cookie(cookieName, token, { ...cookieOptions, maxAge: sessionMilliseconds })
}
export async function readUser(id, connection = pool) {
  const [users] = await connection.execute("SELECT u.id_usuario AS id, u.id_miembro AS memberId, u.correo_login AS email, u.estado_usuario AS state, p.nombre AS name, f.version AS photoVersion, COALESCE(pr.tamano_interfaz,'normal') AS displaySize,l.id_libro AS trainingBookId,l.nombre AS trainingBookName FROM usuario u LEFT JOIN perfil_usuario p ON p.id_usuario=u.id_usuario LEFT JOIN foto_perfil_usuario f ON f.id_usuario=u.id_usuario LEFT JOIN preferencia_usuario pr ON pr.id_usuario=u.id_usuario LEFT JOIN miembro m ON m.id_miembro=u.id_miembro AND m.archivado=0 LEFT JOIN libro_adiestramiento l ON l.id_libro=m.id_libro WHERE u.id_usuario = ? AND u.estado_usuario IN ('activo','pendiente')", [id])
  if (!users.length) return null
  users[0].photoUrl = users[0].photoVersion ? `/api/auth/account/photo?v=${users[0].photoVersion}` : null
  delete users[0].photoVersion
  users[0].trainingBook=users[0].trainingBookId ? {id:users[0].trainingBookId,name:users[0].trainingBookName} : null
  delete users[0].trainingBookId
  delete users[0].trainingBookName
  if (users[0].state === 'pendiente') return { ...users[0], roles: [], permissions: {}, pastoralRole: null, registration: { canCreateAdministrative: false, canAssignServices: false, canManageAccounts: false } }
  const [roles] = await connection.execute('SELECT r.nombre FROM usuario_rol ur JOIN rol_sistema r ON r.id_rol = ur.id_rol WHERE ur.id_usuario = ? AND ur.activo = 1 AND r.estado = 1', [id])
  const [grants] = await connection.execute('SELECT rp.codigo_permiso, rp.alcance FROM usuario_rol ur JOIN rol_sistema r ON r.id_rol=ur.id_rol AND r.estado=1 JOIN rol_permiso rp ON rp.id_rol=ur.id_rol WHERE ur.id_usuario=? AND ur.activo=1', [id])
  const permissions = {}
  for (const grant of grants) if (permissions[grant.codigo_permiso] !== 'todos') permissions[grant.codigo_permiso] = grant.alcance
  const [linkedRoles] = users[0].memberId ? await connection.execute('SELECT r.nombre,r.nivel_jerarquico FROM miembro m JOIN rol_eclesiastico r ON r.id_rol_eclesiastico=m.id_rol_eclesiastico WHERE m.id_miembro=? AND m.archivado=0 AND m.estado_miembro=\'activo\'', [users[0].memberId]) : [[]]
  const user = { ...users[0], roles: roles.map(role => role.nombre), permissions }
  user.pastoralRole = pastoralRoleFor(user.roles, linkedRoles[0])
  if (!user.roles.includes('Superadmin') && user.pastoralRole?.level === 6 && permissions['miembros.editar']) permissions['miembros.editar'] = 'grupo'
  if (!user.roles.includes('Superadmin') && user.pastoralRole?.level === 6 && permissions['miembros.registrar']) permissions['miembros.registrar'] = 'grupo'
  user.registration = registrationCapabilities(user)
  return user
}
function emailAddress(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return email.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}
export function credentials(body, registration) {
  const email = emailAddress(body?.email)
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!email) return { error: 'Ingresa un correo electrónico válido (máximo 120 caracteres).' }
  if (!password.length || password.length > 128) return { error: 'La contraseña debe tener entre 10 y 128 caracteres.' }
  if (registration && password.length < 10) return { error: 'La contraseña debe tener al menos 10 caracteres.' }
  return { email, password }
}

// Same-origin browser requests only. No cross-origin credentials or CORS enabled.
authRouter.use((request, response, next) => {
  if (request.method === 'GET') return next()
  if (request.headers['sec-fetch-site'] === 'cross-site') return response.status(403).json({ error: 'Solicitud no permitida.' })
  const origin = request.headers.origin
  if (!isAllowedOrigin(origin, request.get('host'), process.env.APP_ORIGINS, process.env.NODE_ENV === 'production')) {
    if (process.env.NODE_ENV !== 'production') console.warn('Origen local rechazado:', { origin, host: request.get('host') })
    return response.status(403).json({ error: 'Solicitud no permitida.' })
  }
  if (!request.is('application/json')) return response.status(415).json({ error: 'Formato de solicitud inválido.' })
  next()
})

const rateLimit = databaseRateLimit({ prefix: 'auth', maximum: request => request.path === '/register' ? 8 : 20 })

authRouter.post('/register', rateLimit, async (request, response) => {
  const { email, password, error } = credentials(request.body, true)
  if (error) return response.status(400).json({ error })
  let connection
  try {
    const photo = parseProfilePhoto(request.body?.photo)
    const hash = await hashPassword(password)
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const [configuration] = await connection.execute('SELECT bootstrap_completado FROM configuracion_sistema WHERE id = 1 FOR UPDATE')
    if (!configuration.length) throw new Error('BOOTSTRAP_NOT_CONFIGURED')
    const initialAdmin = configuration[0].bootstrap_completado === 0
    const [result] = await connection.execute('INSERT INTO usuario (correo_login, password_hash, estado_usuario) VALUES (?, ?, ?)', [email, hash, initialAdmin ? 'activo' : 'pendiente'])
    if (photo) await saveProfilePhoto(connection, result.insertId, photo)
    if (initialAdmin) {
      const [roles] = await connection.execute("SELECT id_rol FROM rol_sistema WHERE nombre = 'Superadmin' AND estado = 1")
      if (!roles.length) throw new Error('ROLE_NOT_CONFIGURED')
      await connection.execute('INSERT INTO usuario_rol (id_usuario, id_rol) VALUES (?, ?)', [result.insertId, roles[0].id_rol])
      await connection.execute('UPDATE configuracion_sistema SET bootstrap_completado = 1, id_superadmin_inicial = ?, fecha_inicializacion = UTC_TIMESTAMP() WHERE id = 1', [result.insertId])
    }
    const setCookie = await createSession(connection, result.insertId, response)
    const user = await readUser(result.insertId, connection)
    await connection.commit()
    setCookie()
    response.status(201).json({ user })
  } catch (error) {
    if (connection) await connection.rollback()
    if (error.status) return response.status(error.status).json({ error: error.message })
    if (error.code === 'ER_DUP_ENTRY') return response.status(409).json({ error: 'No se pudo crear la cuenta con ese correo. Intenta iniciar sesión o consulta con la administración.' })
    console.error('Error de registro:', error.code || 'REGISTER_ERROR')
    response.status(503).json({ error: 'No pudimos crear tu cuenta. Inténtalo de nuevo más tarde.' })
  } finally { connection?.release() }
})

authRouter.post('/login', rateLimit, async (request, response) => {
  const { email, password, error } = credentials(request.body, false)
  if (error) return response.status(400).json({ error })
  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const [rows] = await connection.execute('SELECT id_usuario, password_hash, estado_usuario FROM usuario WHERE correo_login = ? FOR UPDATE', [email])
    const valid = await verifyPassword(password, rows[0]?.password_hash || dummyHash)
    if (!valid || !['activo','pendiente'].includes(rows[0]?.estado_usuario)) {
      await connection.rollback()
      return response.status(401).json({ error: 'Correo o contraseña incorrectos.' })
    }
    const oldToken = sessionToken(request)
    if (oldToken) await connection.execute('DELETE FROM sesion_usuario WHERE token_hash = ?', [tokenDigest(oldToken)])
    const setCookie = await createSession(connection, rows[0].id_usuario, response)
    await connection.execute('UPDATE usuario SET ultimo_acceso = UTC_TIMESTAMP() WHERE id_usuario = ?', [rows[0].id_usuario])
    const user = await readUser(rows[0].id_usuario, connection)
    await connection.commit()
    setCookie()
    response.json({ user })
  } catch (error) {
    if (connection) await connection.rollback()
    console.error('Error de inicio de sesión:', error.code || 'LOGIN_ERROR')
    response.status(503).json({ error: 'No pudimos iniciar sesión. Inténtalo de nuevo más tarde.' })
  } finally { connection?.release() }
})

authRouter.get('/me', async (request, response) => {
  const token = sessionToken(request)
  if (!token) return response.status(401).json({ error: 'Inicia sesión para continuar.' })
  try {
    const [sessions] = await pool.execute('SELECT id_usuario FROM sesion_usuario WHERE token_hash = ? AND fecha_expiracion > UTC_TIMESTAMP()', [tokenDigest(token)])
    const user = sessions.length ? await readUser(sessions[0].id_usuario) : null
    if (!user) {
      response.clearCookie(cookieName, cookieOptions)
      return response.status(401).json({ error: 'Tu sesión ha finalizado. Inicia sesión nuevamente.' })
    }
    response.json({ user })
  } catch (error) {
    console.error('Error de sesión:', error.code || 'SESSION_ERROR')
    response.status(503).json({ error: 'No pudimos verificar tu sesión.' })
  }
})

authRouter.post('/logout', async (request, response) => {
  try {
    const token = sessionToken(request)
    if (token) await pool.execute('DELETE FROM sesion_usuario WHERE token_hash = ?', [tokenDigest(token)])
    response.clearCookie(cookieName, cookieOptions)
    response.json({ ok: true })
  } catch (error) {
    console.error('Error de cierre de sesión:', error.code || 'LOGOUT_ERROR')
    response.status(503).json({ error: 'No pudimos cerrar la sesión. Inténtalo nuevamente.' })
  }
})

async function requireAccountSession(request, response, next) {
  try {
    const token = sessionToken(request)
    if (!token) return response.status(401).json({ error: 'Inicia sesión para continuar.' })
    const [sessions] = await pool.execute('SELECT id_usuario FROM sesion_usuario WHERE token_hash = ? AND fecha_expiracion > UTC_TIMESTAMP()', [tokenDigest(token)])
    const user = sessions.length ? await readUser(sessions[0].id_usuario) : null
    if (!user) return response.status(401).json({ error: 'Tu sesión ha finalizado.' })
    request.authUser = user
    next()
  } catch (error) {
    console.error('Error de autorización:', error.code || 'AUTHORIZATION_ERROR')
    response.status(503).json({ error: 'No pudimos verificar tus permisos.' })
  }
}

export function requireSession(request, response, next) {
  return requireAccountSession(request, response, () => {
    if (request.authUser.state !== 'activo') return response.status(403).json({ error: 'Tu cuenta está pendiente de habilitación. La administración debe asignarte un rol.' })
    next()
  })
}

// Profile changes always target the account identified by the session, never a body id.
async function lockedAccount(request, connection) {
  const [rows] = await connection.execute('SELECT id_usuario, correo_login, password_hash, estado_usuario FROM usuario WHERE id_usuario=? FOR UPDATE', [request.authUser.id])
  const [sessions] = await connection.execute('SELECT id_usuario FROM sesion_usuario WHERE token_hash=? AND fecha_expiracion>UTC_TIMESTAMP() FOR UPDATE', [tokenDigest(sessionToken(request))])
  if (!rows.length || !sessions.length || sessions[0].id_usuario !== rows[0].id_usuario || !['activo','pendiente'].includes(rows[0].estado_usuario)) {
    const error = new Error('Tu sesión ha finalizado. Inicia sesión nuevamente.')
    error.status = 401
    throw error
  }
  return rows[0]
}
async function confirmPassword(value, account) {
  if (typeof value !== 'string' || !value.length || value.length > 128 || !await verifyPassword(value, account.password_hash)) {
    const error = new Error('La contraseña actual no es correcta.')
    error.status = 400
    throw error
  }
}
async function replaceSessions(connection, id, response) {
  await connection.execute('DELETE FROM sesion_usuario WHERE id_usuario=?', [id])
  return createSession(connection, id, response)
}

authRouter.get('/account/photo', requireAccountSession, async (request, response) => {
  try {
    const [photos] = await pool.execute('SELECT contenido FROM foto_perfil_usuario WHERE id_usuario=?', [request.authUser.id])
    if (!photos.length) return response.status(404).json({ error: 'Tu cuenta aún no tiene foto de perfil.' })
    response.set({ 'Content-Type': 'image/jpeg', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' }).send(photos[0].contenido)
  } catch (error) {
    console.error('Error al consultar foto:', error.code || 'PHOTO_READ_ERROR')
    response.status(503).json({ error: 'No pudimos cargar tu foto de perfil.' })
  }
})

authRouter.post('/account/photo', rateLimit, requireAccountSession, async (request, response) => {
  if (!Object.hasOwn(request.body || {}, 'photo')) return response.status(400).json({ error: 'Selecciona una foto de perfil.' })
  let connection
  try {
    const photo = parseProfilePhoto(request.body.photo)
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const account = await lockedAccount(request, connection)
    await saveProfilePhoto(connection, account.id_usuario, photo)
    const user = await readUser(account.id_usuario, connection)
    await connection.commit()
    response.json({ user })
  } catch (error) {
    if (connection) await connection.rollback()
    if (error.status) return response.status(error.status).json({ error: error.message })
    console.error('Error al actualizar foto:', error.code || 'PHOTO_UPDATE_ERROR')
    response.status(503).json({ error: 'No pudimos actualizar tu foto. Inténtalo nuevamente.' })
  } finally { connection?.release() }
})

authRouter.post('/account/preferences', rateLimit, requireAccountSession, async (request, response) => {
  const size = request.body?.displaySize
  if (!['normal', 'large', 'extra-large'].includes(size)) return response.status(400).json({ error: 'Selecciona un tamaño de interfaz válido.' })
  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const account = await lockedAccount(request, connection)
    await connection.execute('INSERT INTO preferencia_usuario(id_usuario,tamano_interfaz) VALUES (?,?) ON DUPLICATE KEY UPDATE tamano_interfaz=?', [account.id_usuario, size, size])
    const user = await readUser(account.id_usuario, connection)
    await connection.commit()
    response.json({ user })
  } catch (error) {
    if (connection) await connection.rollback()
    if (error.status) return response.status(error.status).json({ error: error.message })
    console.error('Error al guardar preferencias:', error.code || 'PREFERENCES_ERROR')
    response.status(503).json({ error: 'No pudimos guardar el tamaño de la interfaz. Inténtalo nuevamente.' })
  } finally { connection?.release() }
})

authRouter.post('/account/profile', rateLimit, requireAccountSession, async (request, response) => {
  const name = typeof request.body?.name === 'string' ? request.body.name.trim() : ''
  const email = emailAddress(request.body?.email)
  if (!name || [...name].length > 100 || /[\u0000-\u001f\u007f]/.test(name)) return response.status(400).json({ error: 'Ingresa tu nombre (máximo 100 caracteres).' })
  if (!email) return response.status(400).json({ error: 'Ingresa un correo electrónico válido (máximo 120 caracteres).' })
  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const account = await lockedAccount(request, connection)
    const emailChanged = email !== account.correo_login
    if (emailChanged) await confirmPassword(request.body.currentPassword, account)
    await connection.execute('UPDATE usuario SET correo_login=? WHERE id_usuario=?', [email, account.id_usuario])
    await connection.execute('INSERT INTO perfil_usuario (id_usuario,nombre) VALUES (?,?) ON DUPLICATE KEY UPDATE nombre=?', [account.id_usuario, name, name])
    const setCookie = emailChanged ? await replaceSessions(connection, account.id_usuario, response) : null
    const user = await readUser(account.id_usuario, connection)
    await connection.commit()
    setCookie?.()
    response.json({ user })
  } catch (error) {
    if (connection) await connection.rollback()
    if (error.code === 'ER_DUP_ENTRY') return response.status(409).json({ error: 'Ese correo ya está asociado a otra cuenta.' })
    if (error.status) return response.status(error.status).json({ error: error.message })
    console.error('Error de perfil:', error.code || 'PROFILE_ERROR')
    response.status(503).json({ error: 'No pudimos actualizar tu cuenta. Inténtalo nuevamente.' })
  } finally { connection?.release() }
})

authRouter.post('/account/password', rateLimit, requireAccountSession, async (request, response) => {
  const password = request.body?.newPassword
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) return response.status(400).json({ error: 'La nueva contraseña debe tener entre 10 y 128 caracteres.' })
  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const account = await lockedAccount(request, connection)
    await confirmPassword(request.body.currentPassword, account)
    const hash = await hashPassword(password)
    await connection.execute('UPDATE usuario SET password_hash=? WHERE id_usuario=?', [hash, account.id_usuario])
    const setCookie = await replaceSessions(connection, account.id_usuario, response)
    const user = await readUser(account.id_usuario, connection)
    await connection.commit()
    setCookie()
    response.json({ user })
  } catch (error) {
    if (connection) await connection.rollback()
    if (error.status) return response.status(error.status).json({ error: error.message })
    console.error('Error de contraseña:', error.code || 'PASSWORD_ERROR')
    response.status(503).json({ error: 'No pudimos actualizar tu contraseña. Inténtalo nuevamente.' })
  } finally { connection?.release() }
})

export const hasPermission = (user, code) => user?.state === 'activo' && Boolean(user?.permissions?.[code])
export function requirePermission(code) {
  return (request, response, next) => hasPermission(request.authUser, code) ? next() : response.status(403).json({ error: 'No tienes permiso para esta operación.' })
}
export function protectMutation(request, response, next) {
  if (['GET','HEAD'].includes(request.method)) return next()
  if (request.headers['sec-fetch-site'] === 'cross-site' || !isAllowedOrigin(request.headers.origin, request.get('host'), process.env.APP_ORIGINS, process.env.NODE_ENV === 'production')) return response.status(403).json({ error: 'Solicitud no permitida.' })
  if (!request.is('application/json')) return response.status(415).json({ error: 'Formato de solicitud inválido.' })
  next()
}

authRouter.use('/admin', requireSession, requirePermission('usuarios.gestionar'), (request, response, next) => hasPastoralAuthority(request.authUser) ? next() : response.status(403).json({ error: 'Solo los cinco cargos pastorales autorizados pueden administrar cuentas.' }))

authRouter.get('/admin/users', async (request, response) => {
  try {
    const [users] = await pool.execute("SELECT id_usuario AS id, id_miembro AS memberId, correo_login AS email, estado_usuario AS state FROM usuario ORDER BY estado_usuario = 'pendiente' DESC, id_usuario DESC LIMIT 200")
    const [assignments] = await pool.execute('SELECT ur.id_usuario, r.nombre FROM usuario_rol ur JOIN rol_sistema r ON r.id_rol = ur.id_rol WHERE ur.activo = 1 AND r.estado = 1')
    const [roles] = await pool.execute('SELECT id_rol AS id, nombre AS name FROM rol_sistema WHERE estado = 1 ORDER BY nombre')
    response.json({ users: users.map(user => ({ ...user, roles: assignments.filter(role => role.id_usuario === user.id).map(role => role.nombre) })), roles: request.authUser.roles.includes('Superadmin') ? roles : roles.filter(role => role.name !== 'Superadmin') })
  } catch (error) {
    console.error('Error de consulta de usuarios:', error.code || 'USERS_ERROR')
    response.status(503).json({ error: 'No pudimos cargar los usuarios.' })
  }
})

authRouter.post('/admin/users/:id/role', async (request, response) => {
  const id = Number(request.params.id)
  const roleId = request.body?.roleId
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(roleId) || roleId < 1) return response.status(400).json({ error: 'Usuario o rol inválido.' })
  if (id === request.authUser.id) return response.status(409).json({ error: 'No puedes cambiar tu propio rol desde este panel.' })
  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()
    await connection.execute('SELECT id FROM configuracion_sistema WHERE id = 1 FOR UPDATE')
    const actor = await readUser(request.authUser.id, connection)
    if (!hasPermission(actor, 'usuarios.gestionar') || !hasPastoralAuthority(actor)) {
      await connection.rollback()
      return response.status(403).json({ error: 'Ya no tienes permiso para asignar roles.' })
    }
    const [targets] = await connection.execute('SELECT id_usuario, id_miembro, estado_usuario FROM usuario WHERE id_usuario = ? FOR UPDATE', [id])
    const [roles] = await connection.execute('SELECT nombre FROM rol_sistema WHERE id_rol = ? AND estado = 1', [roleId])
    if (!targets.length || !roles.length) {
      await connection.rollback()
      return response.status(404).json({ error: 'Usuario o rol no disponible.' })
    }
    if (roles[0].nombre === 'Superadmin' && !actor.roles.includes('Superadmin')) {
      await connection.rollback()
      return response.status(403).json({ error: 'El rol técnico Superadmin solo puede asignarlo el propietario de la instalación.' })
    }
    if (!actor.roles.includes('Superadmin')) {
      const [owners] = await connection.execute("SELECT ur.id_usuario FROM usuario_rol ur JOIN rol_sistema r ON r.id_rol=ur.id_rol WHERE ur.id_usuario=? AND ur.activo=1 AND r.nombre='Superadmin'", [id])
      if (owners.length) {
        await connection.rollback()
        return response.status(403).json({ error: 'La cuenta del propietario técnico está protegida.' })
      }
    }
    await connection.execute('UPDATE usuario_rol SET activo = 0 WHERE id_usuario = ?', [id])
    await connection.execute('INSERT INTO usuario_rol (id_usuario, id_rol) VALUES (?, ?) ON DUPLICATE KEY UPDATE activo = 1, fecha_asignacion = UTC_TIMESTAMP()', [id, roleId])
    const pastoral=pastoralRoles.find(role=>role.systemRole===roles[0].nombre)
    if(pastoral && targets[0].id_miembro) {
      const [ranks]=await connection.execute('SELECT id_rol_eclesiastico FROM rol_eclesiastico WHERE nivel_jerarquico=?',[pastoral.level])
      if(ranks.length) await connection.execute('UPDATE miembro SET id_rol_eclesiastico=?,id_usuario_actualizacion=? WHERE id_miembro=?',[ranks[0].id_rol_eclesiastico,actor.id,targets[0].id_miembro])
    }
    if (targets[0].estado_usuario === 'pendiente') await connection.execute("UPDATE usuario SET estado_usuario = 'activo' WHERE id_usuario = ?", [id])
    await connection.commit()
    response.json({ ok: true })
  } catch (error) {
    if (connection) await connection.rollback()
    console.error('Error de asignación de rol:', error.code || 'ROLE_ERROR')
    response.status(503).json({ error: 'No pudimos guardar el rol.' })
  } finally { connection?.release() }
})
