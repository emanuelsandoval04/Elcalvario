import { bootstrapAdmin } from '../server/bootstrap-admin.js'
import { pool } from '../server/db.js'

try {
  const { INITIAL_ADMIN_EMAIL: email, INITIAL_ADMIN_PASSWORD: password, INITIAL_ADMIN_NAME: name } = process.env
  if (!email || !password || !name) throw new Error('Define INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD e INITIAL_ADMIN_NAME en el entorno del servidor. La contraseña debe tener de 10 a 128 caracteres.')
  await bootstrapAdmin({ email, password, name })
  console.log('Propietario inicial creado. Ya puede iniciar sesión con las credenciales asignadas.')
} catch (error) {
  console.error(error.status || !error.code ? error.message : 'No se pudo inicializar el propietario. Revisa la conexión y las migraciones.')
  process.exitCode = 1
} finally { await pool.end() }
