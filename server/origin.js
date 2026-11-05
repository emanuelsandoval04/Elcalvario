import { networkInterfaces } from 'node:os'

export function isAllowedOrigin(origin, requestHost, configuredOrigins, production = false) {
  if (!origin) return true
  try {
    const parsed = new URL(origin)
    if (parsed.origin !== origin) return false
    const allowed = (configuredOrigins || (production ? '' : 'http://127.0.0.1:5173,http://localhost:5173')).split(',').map(value => value.trim())
    if (process.env.VERCEL === '1') {
      for (const host of [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
        if (host) allowed.push(`https://${host}`)
      }
    }
    if (allowed.includes(origin)) return true
    // Vite forwards its original Host header. In development, permit this PC's
    // IPv4 interfaces as well as loopback, with an exact origin/Host match.
    if (production || parsed.protocol !== 'http:' || parsed.host !== requestHost) return false
    const localHosts = ['localhost', '127.0.0.1', '[::1]', ...Object.values(networkInterfaces()).flatMap(addresses =>
      (addresses || []).filter(address => address.family === 'IPv4').map(address => address.address))]
    return localHosts.includes(parsed.hostname)
  } catch { return false }
}
