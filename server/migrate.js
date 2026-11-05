import { applyMigrations } from './migration-runner.js'
import { pool } from './db.js'

let connection
try {
  connection = await pool.getConnection()
  const [lock] = await connection.execute("SELECT GET_LOCK('el_calvario_auth_migration', 10) AS acquired")
  if (lock[0].acquired !== 1) throw new Error('MIGRATION_LOCK')
  await applyMigrations(connection)
  console.log('Esquema listo: autenticación, RBAC y gestión de iglesia. Datos existentes conservados.')
} catch (error) {
  console.error('No se pudo actualizar el esquema:', error.code || error.message)
  process.exitCode = 1
} finally {
  if (connection) {
    await connection.execute("SELECT RELEASE_LOCK('el_calvario_auth_migration')")
    connection.release()
  }
  await pool.end()
}
