import mysql from 'mysql2/promise'
import { databaseConfig } from './config.js'

const initialize = process.argv.includes('--init')
let connection
try {
  const { database, ...serverConfig } = databaseConfig
  connection = await mysql.createConnection(initialize ? serverConfig : databaseConfig)
  const [versionRows] = await connection.execute('SELECT VERSION() AS version')
  console.log(`MySQL ${versionRows[0].version}: conexión correcta`)
  if (initialize) {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
    console.log(`Base disponible: ${database}`)
  }
  const [tables] = await connection.execute('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [database])
  console.log(`Tablas existentes: ${tables.length}`)
} catch (error) {
  console.error('No se pudo preparar la conexión:', error.code || 'DATABASE_ERROR')
  process.exitCode = 1
} finally {
  if (connection) await connection.end()
}
