import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// The existing migration runner takes a MySQL lock and preserves stored data.
// It runs at startup, when Railway's private database network is available.
const migration = spawnSync(process.execPath, ['server/migrate.js'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  stdio: 'inherit',
  windowsHide: true,
})
if (migration.error || migration.status !== 0) {
  console.error('Despliegue detenido: revisa la conexión y las migraciones antes de iniciar la API.')
  process.exitCode = 1
} else {
  await import('../server/index.js')
}
