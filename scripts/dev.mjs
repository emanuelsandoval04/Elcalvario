import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { apiPort } from '../server/config.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const healthUrl = `http://127.0.0.1:${apiPort}/api/health`
const children = new Set()
let stopping = false

function stop(code = 0) {
  if (stopping) return
  stopping = true
  process.exitCode = code
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue
    if (process.platform === 'win32') {
      // Node watch mode owns a child process; stop the entire tree on Windows.
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    } else {
      child.kill('SIGTERM')
    }
  }
}

process.once('SIGINT', () => stop())
process.once('SIGTERM', () => stop())

function start(args, name) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true })
  children.add(child)
  child.once('error', error => {
    console.error(`No se pudo iniciar ${name}: ${error.message}`)
    stop(1)
  })
  child.once('exit', code => {
    children.delete(child)
    if (!stopping) stop(code ?? 1)
  })
  return child
}

async function apiReady() {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1000) })
    if (!response.ok) return false
    const health = await response.json()
    return health.status === 'ok' && health.database === 'connected'
  } catch {
    return false
  }
}

try {
  if (await apiReady()) {
    console.log(`API ya disponible: http://127.0.0.1:${apiPort}`)
  } else {
    console.log('Iniciando API y comprobando MySQL...')
    start(['--watch', 'server/index.js'], 'la API')
    const deadline = Date.now() + 15000
    let ready = false
    while (!stopping && Date.now() < deadline) {
      if (await apiReady()) { ready = true; break }
      await delay(250)
    }
    if (!stopping && !ready) {
      throw new Error('La API no pudo arrancar. Comprueba que MySQL esté encendido y revisa la configuración de .env y el error mostrado arriba.')
    }
  }
  if (!stopping) {
    start(['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', ...process.argv.slice(2)], 'Vite')
  }
} catch (error) {
  console.error(error.message)
  stop(1)
}
