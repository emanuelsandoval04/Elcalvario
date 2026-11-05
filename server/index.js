import app from './app.js'
import { apiPort, apiHost } from './config.js'
import { pool, checkDatabase } from './db.js'

try {
  await checkDatabase()
  const server = app.listen(apiPort, apiHost, () => {
    console.log(`API: http://${apiHost}:${apiPort} — MySQL conectado`)
  })
  server.on('error', async error => {
    console.error('No se pudo iniciar la API:', error.code || 'SERVER_ERROR')
    await pool.end()
    process.exitCode = 1
  })
  let stopping = false
  function shutdown() {
    if (stopping) return
    stopping = true
    // Drain requests before replacing a local or container process.
    const deadline = setTimeout(() => process.exit(1), 10000)
    deadline.unref()
    server.close(async () => {
      try { await pool.end() } finally { clearTimeout(deadline) }
    })
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
} catch (error) {
  console.error('No se pudo conectar a MySQL:', error.code || 'DATABASE_ERROR')
  await pool.end()
  process.exitCode = 1
}
