import assert from 'node:assert/strict'
import { randomUUID, randomBytes, scrypt, createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
import { readEnvironment } from '../server/environment.js'

const origin = new URL(process.argv[2] || 'https://elcalvario.vercel.app')
assert.equal(origin.protocol, 'https:')
assert.equal(origin.pathname, '/')
const env = dotenv.parse(await readFile(new URL('../.env.aiven.local', import.meta.url)))
env.DB_SSL_CA = await readFile(new URL('../.secrets/aiven-ca.pem', import.meta.url), 'utf8')
const { databaseConfig } = readEnvironment(env)
assert.ok(databaseConfig.host.endsWith('.aivencloud.com') && databaseConfig.ssl.verifyIdentity)
const database = await mysql.createConnection(databaseConfig)
const email = `deploy-${randomUUID()}@example.invalid`
const password = `Deploy-${randomUUID()}`
let cookie = '', attemptedRegistration = false, fixtureId = null
const temporaryActivities = new Set()
let temporarySeries = null

async function request(path, body, overrides = {}) {
  return fetch(new URL(path, origin), {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Origin: origin.origin, 'Sec-Fetch-Site': 'same-origin',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...overrides,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  })
}

try {
  const home = await request('/')
  assert.equal(home.status, 200)
  const html = await home.text()
  assert.ok(html.includes('id="root"'))
  for (const match of html.matchAll(/(?:src|href)="([^" ]+\.(?:js|css))"/g)) assert.equal((await request(match[1])).status, 200)
  const health = await request('/api/health')
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { status: 'ok', database: 'connected' })
  for (const path of ['/api/public/institution', '/api/public/events', '/api/public/ministries']) {
    assert.equal((await request(path)).status, 200, path)
  }
  assert.equal((await request('/api/auth/me')).status, 401)
  assert.equal((await request('/api/auth/login', { email, password }, { Origin: 'https://untrusted.example' })).status, 403)
  const [bootstrap] = await database.execute('SELECT bootstrap_completado FROM configuracion_sistema WHERE id=1')
  assert.equal(bootstrap[0]?.bootstrap_completado, 1, 'La prueba no puede consumir el registro inicial del propietario.')
  const [roles] = await database.execute(`SELECT r.id_rol FROM rol_sistema r
    JOIN rol_permiso g ON g.id_rol=r.id_rol AND g.codigo_permiso='gestion.acceder'
    JOIN rol_permiso p ON p.id_rol=r.id_rol AND p.codigo_permiso='reportes.grupos'
    JOIN rol_permiso e ON e.id_rol=r.id_rol AND e.codigo_permiso='eventos.eliminar'
    WHERE r.estado=1 AND r.nombre NOT IN ('Superadmin','Usuario')
    ORDER BY r.nombre='Multimedia' DESC,r.id_rol LIMIT 1`)
  assert.ok(roles.length, 'No hay un rol operativo para probar las exportaciones.')
  attemptedRegistration = true
  const registered = await request('/api/auth/register', { email, password })
  assert.equal(registered.status, 403, 'El registro público debe permanecer cerrado.')
  const salt=randomBytes(16).toString('hex')
  const key=await promisify(scrypt)(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024})
  const [fixture]=await database.execute("INSERT INTO usuario(correo_login,password_hash,estado_usuario) VALUES (?,?,'activo')",[email,`scrypt$${salt}$${key.toString('hex')}`])
  fixtureId=fixture.insertId
  const [accounts] = await database.execute('SELECT id_usuario FROM usuario WHERE correo_login=? AND id_miembro IS NULL', [email])
  assert.equal(accounts.length, 1)
  await database.beginTransaction()
  await database.execute("UPDATE usuario SET estado_usuario='activo' WHERE id_usuario=? AND correo_login=?", [accounts[0].id_usuario, email])
  await database.execute('INSERT INTO usuario_rol(id_usuario,id_rol) VALUES (?,?)', [accounts[0].id_usuario, roles[0].id_rol])
  await database.commit()
  const login = await request('/api/auth/login', { email, password })
  assert.equal(login.status, 200)
  const cookies = login.headers.get('set-cookie')
  assert.match(cookies, /; Secure/i)
  assert.match(cookies, /; HttpOnly/i)
  assert.match(cookies, /; SameSite=Strict/i)
  cookie = cookies.split(';')[0]
  const me = await request('/api/auth/me')
  assert.equal(me.status, 200)
  assert.equal((await me.json()).user.email, email)
  const updated = await request('/api/auth/account/profile', { name: 'Comprobación temporal de despliegue', email })
  assert.equal(updated.status, 200)
  const photoBytes = await readFile(new URL('./fixtures/profile.jpg', import.meta.url))
  const photo = await request('/api/auth/account/photo', { photo: `data:image/jpeg;base64,${photoBytes.toString('base64')}` })
  assert.equal(photo.status, 200)
  const photoUrl = (await photo.json()).user.photoUrl
  const downloadedPhoto = await request(photoUrl)
  assert.equal(downloadedPhoto.status, 200)
  assert.ok(Buffer.from(await downloadedPhoto.arrayBuffer()).equals(photoBytes))
  for (const format of ['pdf', 'xlsx']) {
    const report = await request(`/api/management/reports/grupos?format=${format}`)
    assert.equal(report.status, 200, `Reporte ${format}`)
    const bytes = Buffer.from(await report.arrayBuffer())
    assert.ok(bytes.length > 100)
    assert.ok(format === 'pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' : bytes.subarray(0, 2).toString() === 'PK')
  }
  assert.equal((await request('/api/auth/notifications')).status,200)
  const fixedResponse=await request('/api/management/activities',{tipo_actividad:'culto',titulo:`Prueba privada ${fixtureId}`,fixed:true,hora:'09:00',lugar:'Comprobacion temporal',estado_actividad:'programada',recurrence:{dayOfWeek:0}})
  assert.equal(fixedResponse.status,201)
  const fixed=await fixedResponse.json();temporarySeries=fixed.seriesId
  const [generated]=await database.execute('SELECT id_actividad FROM actividad_repetida WHERE id_serie=?',[temporarySeries])
  for(const row of generated)temporaryActivities.add(row.id_actividad)
  assert.ok(generated.length>=12)
  const publicFeed=await request('/api/public/events')
  assert.ok(!(await publicFeed.json()).items.some(row=>row.id_serie===temporarySeries))
  const [pastDate]=await database.query('SELECT DATE_SUB(DATE(DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 HOUR)),INTERVAL 7 DAY) AS fecha')
  await database.execute('UPDATE actividad SET fecha=? WHERE id_actividad=?',[pastDate[0].fecha,fixed.id])
  const attendance=await request('/api/management/attendance',{id_actividad:fixed.id,estado_asistencia:'visitante',nombre_visitante:'Prueba temporal de historial'})
  assert.equal(attendance.status,201)
  const edited=await fetch(new URL(`/api/management/activities/${fixed.id}`,origin),{method:'PATCH',headers:{Origin:origin.origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({fixed:true,edit_scope:'following',hora:'10:00',recurrence:{dayOfWeek:4}}),signal:AbortSignal.timeout(45000)})
  assert.equal(edited.status,200)
  const deleted=await fetch(new URL(`/api/management/activities/${fixed.id}`,origin),{method:'DELETE',headers:{Origin:origin.origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({scope:'series'}),signal:AbortSignal.timeout(45000)})
  assert.equal(deleted.status,200)
  const historical=await request(`/api/management/attendance?activityId=${fixed.id}`)
  assert.equal(historical.status,200);assert.equal((await historical.json()).items.length,1)
  // Invalid input exercises the deployed recovery route without sending mail.
  assert.equal((await request('/api/auth/forgot-password',{email:'invalid'})).status,400)
  assert.equal((await request('/api/auth/logout', {})).status, 200)
  assert.equal((await request('/api/auth/me')).status, 401)
  const token=randomBytes(32).toString('hex'),digest=value=>createHash('sha256').update(value).digest('hex')
  const [credential]=await database.execute('SELECT password_hash FROM usuario WHERE id_usuario=?',[fixtureId])
  await database.execute('INSERT INTO recuperacion_contrasena(id_usuario,token_hash,credencial_hash,enviado,fecha_expiracion) VALUES (?,?,?,1,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE))',[fixtureId,digest(token),digest(`${email}\0${credential[0].password_hash}`)])
  assert.equal((await request('/api/auth/reset-password/validate',{token})).status,200)
  await database.execute('UPDATE recuperacion_contrasena SET fecha_expiracion=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE id_usuario=?',[fixtureId])
  assert.equal((await request('/api/auth/reset-password/validate',{token})).status,400)
  await database.execute('UPDATE recuperacion_contrasena SET fecha_expiracion=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE) WHERE id_usuario=?',[fixtureId])
  const replacement=`Changed-${randomUUID()}`
  assert.equal((await request('/api/auth/reset-password',{token,newPassword:replacement,confirmation:replacement})).status,200)
  assert.equal((await request('/api/auth/reset-password/validate',{token})).status,400)
  const recovered=await request('/api/auth/login',{email,password:replacement})
  assert.equal(recovered.status,200)
  cookie=recovered.headers.get('set-cookie').split(';')[0]
  assert.equal((await request('/api/auth/logout',{})).status,200)
  console.log('PASS HTTPS: assets, Aiven, registro cerrado, login seguro, perfil/foto, reportes, avisos, recuperación, creación/edición/eliminación de fijo privado y conservación de asistencia histórica.')
} finally {
  // Only the exact synthetic account generated by this run can be removed.
  if (attemptedRegistration) {
    await database.rollback()
    if(fixtureId) {
      const [owned]=await database.execute('SELECT id_actividad FROM actividad WHERE id_usuario_creacion=?',[fixtureId])
      for(const row of owned)temporaryActivities.add(row.id_actividad)
      if(temporarySeries)await database.execute('DELETE FROM actividad_repetida WHERE id_serie=?',[temporarySeries])
      for(const id of temporaryActivities) {
        await database.execute('DELETE FROM alerta_ausencia WHERE id_actividad=?',[id])
        await database.execute('DELETE FROM asistencia WHERE id_actividad=?',[id])
        await database.execute('DELETE FROM culto WHERE id_actividad=?',[id])
        await database.execute('DELETE FROM actividad WHERE id_actividad=? AND id_usuario_creacion=?',[id,fixtureId])
      }
      if(temporarySeries)await database.execute('DELETE FROM serie_actividad WHERE id_serie=? AND id_usuario_creacion=?',[temporarySeries,fixtureId])
    }
    await database.execute('DELETE FROM usuario WHERE correo_login=? AND id_miembro IS NULL', [email])
    const [left] = await database.execute('SELECT COUNT(*) AS total FROM usuario WHERE correo_login=?', [email])
    assert.equal(left[0].total, 0)
    console.log('Cuenta y sesiones temporales eliminadas; cuentas existentes conservadas.')
  }
  await database.end()
}
