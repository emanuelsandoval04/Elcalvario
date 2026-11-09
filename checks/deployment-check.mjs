import assert from 'node:assert/strict'
import { randomBytes, randomUUID, scrypt } from 'node:crypto'
import { promisify } from 'node:util'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import mysql from 'mysql2/promise'
import { databaseConfig } from '../server/config.js'

// This check must never create accounts or schemas on a hosted installation.
assert.ok(['localhost', '127.0.0.1', '::1'].includes(databaseConfig.host), 'Ejecuta esta prueba únicamente con MySQL local.')
const suffix = randomUUID().replaceAll('-', '')
const testDatabase = `calvario_deploy_test_${suffix}`
const testUser = `cd_${suffix.slice(0, 20)}`
assert.match(testDatabase, /^calvario_deploy_test_[a-f0-9]{32}$/)
assert.match(testUser, /^cd_[a-f0-9]{20}$/)
const { database, ...adminConfig } = databaseConfig
const connection = await mysql.createConnection(adminConfig)
const databasePassword = randomBytes(24).toString('hex')
const origin = 'https://church.example'
let child, proxy, childExit, databaseCreated = false, userCreated = false
let logs = ''
let clientIp = '203.0.113.20'

async function stopChild() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([childExit, delay(12000, undefined, { ref: false })])
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await childExit
  }
}

async function freePort() {
  const listener = createServer()
  listener.listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const port = listener.address().port
  await new Promise(resolve => listener.close(resolve))
  return port
}

try {
  await connection.query(`CREATE DATABASE \`${testDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
  databaseCreated = true
  // Use a temporary password and schema-scoped user, even if local root has none.
  await connection.query('CREATE USER ?@? IDENTIFIED BY ?', [testUser, '%', databasePassword])
  userCreated = true
  await connection.query(`GRANT ALL PRIVILEGES ON \`${testDatabase}\`.* TO ?@?`, [testUser, '%'])
  const port = await freePort()
  const env = { ...process.env, NODE_ENV: 'production', DB_HOST: databaseConfig.host, DB_PORT: String(databaseConfig.port), DB_USER: testUser, DB_PASSWORD: databasePassword, DB_NAME: testDatabase, DB_SSL: 'false', DB_SSL_CA: '', PORT: String(port), API_HOST: '0.0.0.0', APP_ORIGINS: origin, TRUST_PROXY: '1', SESSION_HOURS: '2' }
  for (const key of ['ENV_FILE', 'DB_SSL_CA_FILE', 'VERCEL', 'VERCEL_URL', 'VERCEL_REGION', 'VERCEL_PROJECT_PRODUCTION_URL']) delete env[key]
  const api = `http://127.0.0.1:${port}`
  async function startChild(entry) {
    child = spawn(process.execPath, [entry], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    childExit = once(child, 'exit')
    child.stdout.on('data', chunk => { logs += chunk })
    child.stderr.on('data', chunk => { logs += chunk })
    let ready = false
    for (let attempt = 0; attempt < 160; attempt++) {
      if (child.exitCode !== null) throw new Error(`La API terminó durante el arranque. ${logs}`)
      try { ready = (await fetch(`${api}/api/health`, { signal: AbortSignal.timeout(500) })).ok } catch { /* Waiting for migrations. */ }
      if (ready) break
      await delay(250)
    }
    assert.ok(ready, `La API no inició. ${logs}`)
  }
  await startChild('scripts/start-deploy.mjs')
  proxy = createServer(async (request, response) => {
    try {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const headers = new Headers()
      for (const name of ['content-type', 'origin', 'cookie', 'sec-fetch-site']) {
        if (request.headers[name]) headers.set(name, request.headers[name])
      }
      headers.set('X-Forwarded-For', clientIp)
      headers.set('X-Forwarded-Proto', 'https')
      const upstream = await fetch(`${api}${request.url}`, {
        method: request.method, headers,
        body: chunks.length ? Buffer.concat(chunks) : undefined,
      })
      response.statusCode = upstream.status
      for (const name of ['content-type', 'cache-control', 'x-content-type-options', 'retry-after']) {
        if (upstream.headers.has(name)) response.setHeader(name, upstream.headers.get(name))
      }
      const cookies = upstream.headers.getSetCookie()
      if (cookies.length) response.setHeader('Set-Cookie', cookies)
      response.end(Buffer.from(await upstream.arrayBuffer()))
    } catch {
      response.writeHead(502).end()
    }
  })
  proxy.listen(0, '127.0.0.1')
  await once(proxy, 'listening')
  const base = `http://127.0.0.1:${proxy.address().port}`
  async function request(path, body, cookie, override = {}) {
    return fetch(`${base}/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...override },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }
  const health = await request('health')
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { status: 'ok', database: 'connected' })
  assert.equal(health.headers.get('cache-control'), 'no-store')
  const credentials = { email: 'owner@example.invalid', password: `Deploy-${randomUUID()}` }
  assert.equal((await request('auth/register', credentials, '', { Origin: 'https://evil.example' })).status, 403)
  assert.equal((await request('auth/register', credentials, '', { 'Sec-Fetch-Site': 'cross-site' })).status, 403)
  const registered = await request('auth/register', credentials)
  assert.equal(registered.status, 403, await registered.clone().text())
  const salt=randomBytes(16).toString('hex')
  const key=await promisify(scrypt)(credentials.password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024})
  const [fixture]=await connection.execute(`INSERT INTO \`${testDatabase}\`.usuario(correo_login,password_hash,estado_usuario) VALUES (?,?,'activo')`,[credentials.email,`scrypt$${salt}$${key.toString('hex')}`])
  await connection.execute(`INSERT INTO \`${testDatabase}\`.usuario_rol(id_usuario,id_rol) SELECT ?,id_rol FROM \`${testDatabase}\`.rol_sistema WHERE nombre='Administrador'`,[fixture.insertId])
  await connection.query(`UPDATE \`${testDatabase}\`.configuracion_sistema SET bootstrap_completado=1 WHERE id=1`)
  const authenticated=await request('auth/login',credentials)
  assert.equal(authenticated.status,200)
  const setCookie = authenticated.headers.get('set-cookie')
  assert.match(setCookie, /; HttpOnly/i)
  assert.match(setCookie, /; Secure/i)
  assert.match(setCookie, /; SameSite=Strict/i)
  assert.match(setCookie, /; Path=\/api/i)
  assert.match(setCookie, /Max-Age=7200/i)
  const cookie = setCookie.split(';')[0]
  const me = await request('auth/me', undefined, cookie)
  assert.equal(me.status, 200)
  assert.ok((await me.json()).user.roles.includes('Administrador'))
  assert.equal((await request('management/dashboard', undefined, cookie)).status, 200)
  const logout = await request('auth/logout', {}, cookie)
  assert.equal(logout.status, 200)
  assert.equal((await request('auth/me', undefined, cookie)).status, 401)
  const loggedIn = await request('auth/login', credentials)
  assert.equal(loggedIn.status, 200)
  assert.match(loggedIn.headers.get('set-cookie'), /; Secure/i)
  const unknown = await request('does-not-exist')
  assert.equal(unknown.status, 404)
  assert.match(unknown.headers.get('content-type'), /application\/json/)
  const malformed = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })
  assert.equal(malformed.status, 400)
  assert.equal(malformed.headers.get('cache-control'), 'no-store')
  const [account] = await connection.query(`SELECT password_hash FROM \`${testDatabase}\`.usuario`)
  assert.match(account[0].password_hash, /^scrypt\$/)
  assert.equal(logs.includes(databasePassword), false)
  // Concurrent attempts share an atomic fixed window in MySQL.
  await connection.execute(`DELETE FROM \`${testDatabase}\`.limite_solicitud`)
  const attempts = await Promise.all(Array.from({ length: 21 }, (_,index) => request('auth/login', { email: `invalid-${index}`, password: 'invalid' })))
  assert.equal(attempts.filter(response => response.status === 400).length, 20)
  assert.equal(attempts.filter(response => response.status === 429).length, 1)
  assert.ok(Number(attempts.find(response => response.status === 429).headers.get('retry-after')) > 0)
  // Replace the listener with a fresh process using the real Vercel export.
  await stopChild()
  await startChild('checks/vercel-api-runner.mjs')
  assert.equal((await request('auth/login', { email: 'invalid', password: 'invalid' })).status, 429)
  assert.equal((await request('auth/me', undefined, loggedIn.headers.get('set-cookie').split(';')[0])).status, 200)
  clientIp = '203.0.113.21'
  assert.equal((await request('auth/login', { email: 'invalid', password: 'invalid' })).status, 400)
  assert.equal(logs.includes('Unsupported database pool type'), false)
  console.log('PASS producción: migraciones con usuario limitado, proxy, salud, cookies seguras, login/logout, entrada real de Vercel, sesión entre procesos y límites concurrentes persistentes por IP.')
} finally {
  if (proxy) await new Promise(resolve => proxy.close(resolve))
  await stopChild()
  if (databaseCreated) await connection.query(`DROP DATABASE \`${testDatabase}\``)
  if (userCreated) await connection.query('DROP USER ?@?', [testUser, '%'])
  await connection.end()
  console.log('Base y usuario temporales eliminados; datos locales conservados.')
}
