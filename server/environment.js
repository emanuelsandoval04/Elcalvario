// Parse configuration separately so validation never needs a database connection.
function integer(value, fallback, name, maximum = 65535) {
  const result = Number(value === undefined || value === '' ? fallback : value)
  if (!Number.isInteger(result) || result < 1 || result > maximum) {
    throw new Error(`${name} debe ser un entero entre 1 y ${maximum}.`)
  }
  return result
}

function boolean(value, fallback, name) {
  if (value === undefined || value === '') return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`${name} debe ser true o false.`)
}

export function readEnvironment(env = process.env) {
  const production = env.NODE_ENV === 'production' || env.VERCEL === '1'
  const host = env.DB_HOST || env.MYSQLHOST || (production ? '' : 'localhost')
  const user = env.DB_USER || env.MYSQLUSER
  const database = env.DB_NAME || env.MYSQLDATABASE
  const password = env.DB_PASSWORD ?? env.MYSQLPASSWORD ?? ''
  if (!host || !user || !database) throw new Error('Configura DB_HOST, DB_USER y DB_NAME (o sus equivalentes MYSQLHOST, MYSQLUSER y MYSQLDATABASE).')
  if (!/^[a-zA-Z0-9_]+$/.test(database)) throw new Error('DB_NAME solo puede contener letras, números y guiones bajos.')
  if (production && !password) throw new Error('DB_PASSWORD no puede estar vacía en producción.')

  // Vercel's own deployment and production domains are provider-controlled.
  const vercelOrigins = env.VERCEL === '1' ? [env.VERCEL_URL, env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).map(host => `https://${host}`) : []
  const origins = [...(env.APP_ORIGINS || (production ? '' : 'http://127.0.0.1:5173,http://localhost:5173')).split(',').map(value => value.trim()).filter(Boolean), ...vercelOrigins]
  if (production && !origins.length) throw new Error('Configura APP_ORIGINS con el dominio HTTPS de la página en Vercel.')
  for (const origin of origins) {
    let parsed
    try { parsed = new URL(origin) } catch { throw new Error('APP_ORIGINS contiene una dirección inválida.') }
    if (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol) || (production && parsed.protocol !== 'https:')) {
      throw new Error('APP_ORIGINS debe contener orígenes completos, separados por comas y sin barra final; en producción deben usar HTTPS.')
    }
  }

  const ssl = boolean(env.DB_SSL, false, 'DB_SSL')
  if (!ssl && env.DB_SSL_CA) throw new Error('Activa DB_SSL=true para usar DB_SSL_CA.')
  if (env.VERCEL === '1' && !ssl) throw new Error('La conexión de Vercel a MySQL debe usar DB_SSL=true.')
  const proxy = env.TRUST_PROXY ?? (production ? '1' : '0')
  if (!/^[0-5]$/.test(proxy)) throw new Error('TRUST_PROXY debe indicar entre 0 y 5 proxies de confianza.')

  return {
    databaseConfig: {
      host,
      port: integer(env.DB_PORT || env.MYSQLPORT, 3306, 'DB_PORT'),
      user,
      password,
      database,
      charset: 'utf8mb4',
      timezone: 'Z',
      connectTimeout: integer(env.DB_CONNECT_TIMEOUT_MS, 10000, 'DB_CONNECT_TIMEOUT_MS', 120000),
      multipleStatements: false,
      ...(ssl ? { ssl: {
        rejectUnauthorized: true,
        verifyIdentity: true,
        minVersion: 'TLSv1.2',
        ...(env.DB_SSL_CA ? { ca: env.DB_SSL_CA.replaceAll('\\n', '\n') } : {}),
      } } : {}),
    },
    connectionLimit: integer(env.DB_CONNECTION_LIMIT, env.VERCEL === '1' ? 2 : 5, 'DB_CONNECTION_LIMIT', 100),
    apiPort: integer(env.PORT || env.API_PORT, 3001, 'PORT / API_PORT'),
    apiHost: env.API_HOST || (production ? '0.0.0.0' : '127.0.0.1'),
    trustProxy: Number(proxy),
    sessionMilliseconds: integer(env.SESSION_HOURS, 8, 'SESSION_HOURS', 168) * 60 * 60 * 1000,
  }
}
