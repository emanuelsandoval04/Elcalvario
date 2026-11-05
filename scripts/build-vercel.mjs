import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
try {
  for (const args of [['node_modules/typescript/bin/tsc', '-b'], ['node_modules/vite/bin/vite.js', 'build']]) {
    const child = spawnSync(process.execPath, args, { cwd: fileURLToPath(root), stdio: 'inherit', windowsHide: true })
    if (child.error || child.status !== 0) throw new Error('No se pudo compilar la plataforma.')
  }
  console.log('Vercel listo: React en dist/ y API en api/. La construcción no modifica la base de datos.')
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
