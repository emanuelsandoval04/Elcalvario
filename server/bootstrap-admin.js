import { pool } from './db.js'
import { credentials, hashPassword } from './auth.js'
import { invalid, text } from './entities.js'

// Server-side installation only. Never expose this operation through an HTTP route.
export async function bootstrapAdmin(input) {
  const { email, password, error } = credentials(input, true)
  if (error) throw invalid(error)
  const name = text(input.name, 100, true)
  const hash = await hashPassword(password)
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [configuration] = await connection.execute('SELECT bootstrap_completado FROM configuracion_sistema WHERE id=1 FOR UPDATE')
    if (!configuration.length) throw invalid('Ejecuta las migraciones antes de crear el propietario.', 409)
    const [users] = await connection.execute('SELECT COUNT(*) AS total FROM usuario')
    if (configuration[0].bootstrap_completado || users[0].total) throw invalid('La instalación ya tiene un propietario o cuentas existentes.', 409)
    const [roles] = await connection.execute("SELECT id_rol FROM rol_sistema WHERE nombre='Superadmin' AND estado=1")
    if (!roles.length) throw invalid('El rol Superadmin no está configurado.', 409)
    const [result] = await connection.execute("INSERT INTO usuario(correo_login,password_hash,estado_usuario) VALUES (?,?,'activo')", [email, hash])
    await connection.execute('INSERT INTO perfil_usuario(id_usuario,nombre) VALUES (?,?)', [result.insertId, name])
    await connection.execute('INSERT INTO usuario_rol(id_usuario,id_rol) VALUES (?,?)', [result.insertId, roles[0].id_rol])
    await connection.execute('UPDATE configuracion_sistema SET bootstrap_completado=1,id_superadmin_inicial=?,fecha_inicializacion=UTC_TIMESTAMP() WHERE id=1', [result.insertId])
    await connection.commit()
    return { id: result.insertId, email }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
}
