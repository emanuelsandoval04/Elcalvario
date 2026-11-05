import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readEnvironment } from '../server/environment.js'
import { isAllowedOrigin } from '../server/origin.js'

const local = { DB_USER: 'local_user', DB_NAME: 'test_database' }
const production = { ...local, NODE_ENV: 'production', DB_HOST: 'mysql.example', DB_PASSWORD: 'example-test-password', APP_ORIGINS: 'https://church.example' }

test('production binds to the provider port and local defaults remain compatible', () => {
  const development = readEnvironment(local)
  assert.equal(development.apiHost, '127.0.0.1')
  assert.equal(development.apiPort, 3001)
  assert.equal(development.databaseConfig.password, '')
  const deployed = readEnvironment({ ...production, PORT: '8080', API_PORT: '3001' })
  assert.equal(deployed.apiPort, 8080)
  assert.equal(deployed.apiHost, '0.0.0.0')
  assert.equal(deployed.sessionMilliseconds, 8 * 3600000)
})

test('production refuses missing secrets, unsafe origins and invalid settings', () => {
  for (const patch of [
    { DB_HOST: '' }, { DB_USER: '' }, { DB_NAME: '' }, { DB_PASSWORD: '' },
    { APP_ORIGINS: '' }, { APP_ORIGINS: '*' }, { APP_ORIGINS: 'http://localhost:5173' },
    { APP_ORIGINS: 'https://church.example/' }, { APP_ORIGINS: 'https://church.example/path' },
    { APP_ORIGINS: 'https://user:secret@church.example' }, { DB_NAME: 'db;DROP TABLE usuario' },
    { PORT: 'abc' }, { PORT: '65536' }, { DB_PORT: '-1' },
    { DB_CONNECTION_LIMIT: '0' }, { DB_CONNECT_TIMEOUT_MS: '0' }, { TRUST_PROXY: 'true' },
    { SESSION_HOURS: '0' }, { SESSION_HOURS: '169' }, { DB_SSL: 'yes' },
    { DB_SSL: 'false', DB_SSL_CA: 'certificate' },
  ]) assert.throws(() => readEnvironment({ ...production, ...patch }))
  assert.doesNotThrow(() => readEnvironment({ ...production, APP_ORIGINS: 'https://church.example, https://www.church.example' }))
  assert.equal(isAllowedOrigin('http://localhost:5173', 'localhost:5173', undefined, true), false)
})

test('Aiven connections require TLS on Vercel and validate both CA and hostname', () => {
  assert.throws(() => readEnvironment({ ...production, VERCEL: '1', DB_SSL: 'false' }), /DB_SSL=true/)
  const { databaseConfig, connectionLimit } = readEnvironment({ ...production, VERCEL: '1', DB_SSL: 'true', DB_SSL_CA: 'line1\\nline2' })
  assert.equal(databaseConfig.ssl.rejectUnauthorized, true)
  assert.equal(databaseConfig.ssl.verifyIdentity, true)
  assert.equal(databaseConfig.ssl.ca, 'line1\nline2')
  assert.equal(databaseConfig.multipleStatements, false)
  assert.equal(connectionLimit, 2)
})

test('only provider-controlled Vercel domains are admitted automatically', () => {
  const saved = { VERCEL: process.env.VERCEL, VERCEL_URL: process.env.VERCEL_URL, VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL }
  try {
    process.env.VERCEL = '1'
    process.env.VERCEL_URL = 'church-deployment.vercel.app'
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'church.vercel.app'
    assert.doesNotThrow(() => readEnvironment({ ...production, APP_ORIGINS: '', VERCEL: '1', VERCEL_URL: process.env.VERCEL_URL, DB_SSL: 'true' }))
    assert.equal(isAllowedOrigin('https://church-deployment.vercel.app', 'internal', '', true), true)
    assert.equal(isAllowedOrigin('https://church.vercel.app', 'internal', '', true), true)
    assert.equal(isAllowedOrigin('https://attacker.vercel.app', 'internal', '', true), false)
    assert.equal(isAllowedOrigin('https://church.vercel.app.attacker.example', 'internal', '', true), false)
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('Vercel routes every API path to one native function without database migration during build', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.equal(config.framework, 'vite')
  assert.equal(config.outputDirectory, 'dist')
  assert.deepEqual(config.rewrites, [{ source: '/api/:path*', destination: '/api' }])
  assert.equal(config.headers.find(rule => rule.source === '/api/:path*').headers.find(header => header.key === 'Cache-Control').value, 'no-store')
  assert.ok(config.functions['api/**/*.js'].includeFiles.includes('pdfkit'))
  assert.ok(config.functions['api/**/*.js'].excludeFiles.includes('.env'))
  const build = await readFile(new URL('../scripts/build-vercel.mjs', import.meta.url), 'utf8')
  assert.equal(build.includes('migrate.js'), false)
  assert.equal(build.includes('API_ORIGIN'), false)
})

test('Vercel entry imports without opening a database connection and accepts the MySQL pool adapter', async () => {
  const { default: handler } = await import('../api/index.js')
  const { pool } = await import('../server/db.js')
  try {
    assert.equal(typeof handler, 'function')
    assert.equal(pool.pool._allConnections.length, 0)
  } finally {
    await pool.end()
  }
})
