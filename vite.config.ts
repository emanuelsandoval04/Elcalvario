import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import interfaceUnits from './scripts/interface-units.mjs'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiPort = Number(process.env.PORT || process.env.API_PORT || env.PORT || env.API_PORT || 3001)
  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) throw new Error('PORT / API_PORT inválido para el proxy de Vite.')
  return {
    css: { postcss: { plugins: [interfaceUnits()] } },
    plugins: [react(), {
      name: 'calvario-pwa',
      apply: 'build',
      generateBundle(_options, bundle) {
        // Install the offline screen only. Lazy screens are cached when visited.
        const assets = ['/offline.html', '/app-icon.svg']
        const template = readFileSync(new URL('./scripts/service-worker.js', import.meta.url), 'utf8')
        const version = createHash('sha256').update(template + JSON.stringify(Object.keys(bundle).sort()) + readFileSync(new URL('./public/offline.html', import.meta.url), 'utf8') + readFileSync(new URL('./public/app-icon.svg', import.meta.url), 'utf8')).digest('hex').slice(0, 12)
        this.emitFile({ type: 'asset', fileName: 'sw.js', source: template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(assets)) })
      },
    }],
    server: {
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: false,
        },
      },
    },
  }
})
