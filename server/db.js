import mysql from 'mysql2/promise'
import { databaseConfig, connectionLimit } from './config.js'

export const poolIdleTimeout = 5000
export const pool = mysql.createPool({
  ...databaseConfig,
  waitForConnections: true,
  connectionLimit,
  // mysql2 only starts its idle reaper when maxIdle < connectionLimit.
  maxIdle: Math.max(0, connectionLimit - 1),
  idleTimeout: poolIdleTimeout,
  queueLimit: 25,
  enableKeepAlive: true,
  timezone: 'Z',
})

export async function checkDatabase() {
  const [rows] = await pool.execute('SELECT 1 AS connected')
  return rows[0].connected === 1
}
