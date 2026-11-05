import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import mysql from 'mysql2/promise'
import express from 'express'
import ExcelJS from 'exceljs'
import { applyMigrations } from '../server/migration-runner.js'

const testDatabase=`calvario_domain_test_${randomUUID().replaceAll('-','')}`
assert.match(testDatabase,/^calvario_domain_test_[a-f0-9]{32}$/)
process.env.DB_NAME=testDatabase
const { databaseConfig }=await import('../server/config.js')
const {database,...config}=databaseConfig
const connection=await mysql.createConnection(config)
let pool,server
try {
  await connection.query(`CREATE DATABASE \`${testDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
  await connection.query(`USE \`${testDatabase}\``)
  await applyMigrations(connection)
  pool=(await import('../server/db.js')).pool
  const {authRouter}=await import('../server/auth.js')
  const {managementRouter,publicRouter}=await import('../server/management.js')
  const app=express();app.use(express.json());app.use('/api/auth',authRouter);app.use('/api/management',managementRouter);app.use('/api/public',publicRouter)
  server=app.listen(0,'127.0.0.1')
  await new Promise(resolve=>server.once('listening',resolve))
  const base=`http://127.0.0.1:${server.address().port}`
  process.env.APP_ORIGINS=base
  const password=`Check-${randomUUID()}`
  async function request(path,body,cookie='',method,expected=200) {
    const response=await fetch(`${base}/api/${path}`,{method:method || (body===undefined?'GET':'POST'),headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)})
    const data=await response.json()
    assert.equal(response.status,expected,`${method || 'request'} ${path}: ${JSON.stringify(data)}`)
    return {data,cookie:response.headers.get('set-cookie')?.split(';')[0]}
  }
  const accounts={}
  for(const role of ['Superadmin','Usuario','Pastor','Asistencia Pastoral','Discipulador','Multimedia']) {
    const result=await request('auth/register',{email:`${role.replaceAll(' ','-')}@example.invalid`,password},'','POST',201)
    accounts[role]={id:result.data.user.id,cookie:result.cookie}
    if(role!=='Superadmin' && role!=='Usuario') {
      const [roles]=await pool.execute('SELECT id_rol FROM rol_sistema WHERE nombre=?',[role])
      await request(`auth/admin/users/${result.data.user.id}/role`,{roleId:roles[0].id_rol},accounts.Superadmin.cookie)
    }
  }
  const admin=accounts.Superadmin.cookie,pastor=accounts.Pastor.cookie,assistant=accounts['Asistencia Pastoral'].cookie,disciple=accounts.Discipulador.cookie,media=accounts.Multimedia.cookie
  await request('management/members',undefined,'',undefined,401)
  await request('management/dashboard',undefined,accounts.Usuario.cookie,undefined,403)
  await request('management/members',undefined,media,undefined,403)
  await request('management/reports/cumpleanos?format=xlsx',undefined,media,undefined,403)
  assert.equal((await request('public/institution')).data.grupos_confirmados,5)
  assert.equal((await request('management/groups',undefined,admin)).data.items.length,0)
  const catalogs=(await request('management/catalogs',undefined,admin)).data
  const terminologyCatalog=(await request('management/permissions',undefined,admin)).data
  assert.ok(terminologyCatalog.permissions.every(permission=>!/\bmiembros?\b/i.test(permission.descripcion)))
  assert.ok(terminologyCatalog.permissions.some(permission=>permission.codigo==='miembros.editar' && permission.descripcion.includes('discípulos')))
  assert.equal(catalogs.roles.length,6);assert.equal(catalogs.ministerios.length,3)
  const baseMember={nombres:'Persona',apellidos:'Prueba',tipo_identificacion:'CC',numero_identificacion:'1',celular:'3001234567',fecha_nacimiento:'1990-03-05',grupo_sanguineo_rh:'O+',eps:'EPS prueba',contacto_emergencia_nombre:'Contacto prueba',contacto_emergencia_celular:'3001112233'}
  const leader=(await request('management/members',baseMember,admin,'POST',201)).data.id
  const member=(await request('management/members',{...baseMember,nombres:'Miembro',numero_identificacion:'2'},admin,'POST',201)).data.id
  const outsider=(await request('management/members',{...baseMember,nombres:'Otro',numero_identificacion:'3'},admin,'POST',201)).data.id
  await request('management/members',{...baseMember,numero_identificacion:'4',celular:''},admin,'POST',400)
  await request('management/members',{...baseMember,numero_identificacion:'4',fecha_nacimiento:'2025-02-30'},admin,'POST',400)
  await request('management/members',baseMember,admin,'POST',409)
  await request(`management/users/${accounts.Discipulador.id}/member`,{memberId:leader},admin)
  const group=(await request('management/groups',{codigo_grupo:'G1',nombre:'Grupo real de prueba',id_discipulador:leader,estado_grupo:'activo'},admin,'POST',201)).data.id
  const otherGroup=(await request('management/groups',{codigo_grupo:'G2',nombre:'Otro grupo de prueba',estado_grupo:'activo'},admin,'POST',201)).data.id
  await request(`management/members/${member}`,{id_grupo:group,id_cobertura_pastoral:leader},admin,'PATCH')
  await request(`management/members/${leader}`,{id_grupo:group},admin,'PATCH')
  const visible=(await request('management/members',undefined,disciple)).data.items
  assert.equal(visible.length,2);assert.ok(visible.every(row=>!Object.hasOwn(row,'eps')&&!Object.hasOwn(row,'grupo_sanguineo_rh')))
  assert.ok(!(await request('management/members',undefined,assistant)).data.items.some(row=>Object.hasOwn(row,'contacto_emergencia_celular')))
  assert.equal((await request('management/groups',undefined,disciple)).data.items.length,1)
  const summary=async cookie=>Object.fromEntries((await request('management/dashboard',undefined,cookie)).data.widgets.map(widget=>[widget.key,widget.value]))
  const adminSummary=await summary(admin),discipleSummary=await summary(disciple),mediaSummary=await summary(media)
  assert.equal(adminSummary.miembros,3);assert.equal(adminSummary.grupos,2)
  assert.equal(discipleSummary.miembros,2);assert.equal(discipleSummary.grupos,1)
  assert.equal((await request('management/members?q=Miembro%20Prueba',undefined,disciple)).data.items.length,1)
  assert.equal(Object.hasOwn(mediaSummary,'miembros'),false)
  assert.equal(Object.hasOwn(mediaSummary,'cumpleanos'),false)
  assert.equal(Object.hasOwn(mediaSummary,'alertas'),false)
  assert.equal(adminSummary.eventos,0)
  await request(`management/groups/${otherGroup}`,{nombre:'Intento ajeno'},disciple,'PATCH',404)
  await request(`management/groups/${group}`,{id_discipulador:outsider},disciple,'PATCH',403)
  await request('management/groups',{codigo_grupo:'G3',nombre:'Grupo creado por su discipulador',id_discipulador:leader,estado_grupo:'activo'},disciple,'POST',403)
  await request(`management/members/${member}/state`,{estado_miembro:'retirado'},disciple,'POST',403)
  await request(`management/members/${member}/state`,{estado_miembro:'inactivo'},assistant)
  await request(`management/members/${member}/relations`,{id_grupo:otherGroup},assistant)
  assert.ok(!(await request('management/members',undefined,disciple)).data.items.some(row=>row.id_miembro===member))
  await request(`management/members/${member}/relations`,{id_grupo:group},assistant)
  assert.equal((await request(`management/members/${member}/history`,undefined,admin)).data.items.length,4)
  await request(`management/members/${member}/ministries`,{ids:catalogs.ministerios.slice(0,2).map(row=>row.id_ministerio)},admin,'PUT')
  assert.equal((await request(`management/members/${member}/ministries`,undefined,admin)).data.items.length,2)
  await request(`management/groups/${group}/processes`,{proposito:'apertura_iglesia',descripcion:'Proceso confirmado'},disciple,'POST',201)
  assert.equal((await request(`management/groups/${group}/processes`,undefined,admin)).data.items[0].proposito,'apertura_iglesia')
  const eventValues={tipo_actividad:'evento',titulo:'Evento de prueba',fecha:'2026-01-01',hora:'09:00',lugar:'Iglesia',estado_actividad:'programada',publicado:1,requiere_inscripcion:1,url_inscripcion:'https://example.invalid/inscripcion'}
  const first=(await request('management/activities',eventValues,media,'POST',201)).data.id
  const second=(await request('management/activities',{...eventValues,titulo:'Segundo',fecha:'2026-01-02'},media,'POST',201)).data.id
  const third=(await request('management/activities',{...eventValues,titulo:'Tercero',fecha:'2026-01-03'},media,'POST',201)).data.id
  await request('management/activities',eventValues,disciple,'POST',403)
  const meeting=(await request('management/activities',{tipo_actividad:'reunion_grupo',titulo:'Reunión',fecha:'2026-01-03',hora:'19:30',lugar:'Grupo',estado_actividad:'programada',id_grupo:group},disciple,'POST',201)).data.id
  await request('management/activities',{tipo_actividad:'reunion_grupo',titulo:'Ajena',fecha:'2026-01-03',hora:'19:30',lugar:'Grupo',estado_actividad:'programada',id_grupo:otherGroup},disciple,'POST',404)
  await request('management/attendance',{id_actividad:first,id_miembro:member,estado_asistencia:'presente'},disciple,'POST',404)
  await request('management/attendance',{id_actividad:meeting,id_miembro:outsider,estado_asistencia:'presente'},disciple,'POST',404)
  const attendance=(activity,state)=>({id_actividad:activity,id_miembro:member,estado_asistencia:state})
  // Enter records out of order: alerts must follow scheduled activity dates.
  const a2=(await request('management/attendance',attendance(second,'ausente'),media,'POST',201)).data.id
  const a1=(await request('management/attendance',attendance(first,'ausente'),media,'POST',201)).data.id
  assert.equal((await request('management/alerts',undefined,pastor)).data.items.length,1)
  await request('management/attendance',attendance(first,'presente'),media,'POST',409)
  await request(`management/attendance/${a1}`,{estado_asistencia:'presente'},media,'PATCH',403)
  await request(`management/attendance/${a1}`,{estado_asistencia:'justificado'},assistant,'PATCH')
  assert.equal((await request('management/alerts',undefined,pastor)).data.items.length,0)
  await request('management/attendance',attendance(third,'ausente'),assistant,'POST',201)
  assert.equal((await request('management/alerts',undefined,assistant)).data.items.length,1)
  await request('management/alerts',undefined,disciple,undefined,403)
  await request(`management/activities/${second}`,{estado_actividad:'cancelada'},media,'PATCH')
  assert.equal((await request('management/alerts',undefined,pastor)).data.items.length,0)
  await request(`management/activities/${second}`,{estado_actividad:'programada',fecha:'2026-01-04'},media,'PATCH')
  const [keptRegistration]=await pool.execute('SELECT requiere_inscripcion,url_inscripcion FROM evento WHERE id_actividad=?',[second])
  assert.equal(keptRegistration[0].requiere_inscripcion,1);assert.equal(keptRegistration[0].url_inscripcion,eventValues.url_inscripcion)
  await request(`management/activities/${second}`,{publicado:0},media,'PATCH')
  await request(`management/activities/${second}`,{url_inscripcion:'https://example.invalid/nueva-inscripcion'},media,'PATCH')
  assert.equal((await request('management/alerts',undefined,pastor)).data.items.length,1)
  await request('management/attendance',{id_actividad:first,estado_asistencia:'visitante',nombre_visitante:'Visita'},media,'POST',201)
  const [qr]=await pool.execute('SELECT codigo_qr FROM miembro WHERE id_miembro=?',[leader])
  await request('management/attendance',{id_actividad:meeting,estado_asistencia:'presente',metodo_registro:'qr',codigo_qr:qr[0].codigo_qr},disciple,'POST',201)
  const consent={version_politica:'1',medio:'papel',estado_consentimiento:'aceptado',acepta_politica_privacidad:1,acepta_datos_religiosos:1,fecha_aceptacion:'2026-01-01T15:00:00.000Z'}
  await request(`management/members/${member}/consents`,consent,admin,'POST',201)
  await request(`management/members/${member}/consents`,{...consent,estado_consentimiento:'revocado',fecha_revocacion:'2026-02-01T15:00:00.000Z'},admin,'POST',201)
  assert.equal((await request(`management/members/${member}/consents`,undefined,admin)).data.items.length,2)
  const [kept]=await pool.execute('SELECT estado_miembro FROM miembro WHERE id_miembro=?',[member]);assert.equal(kept[0].estado_miembro,'inactivo')
  await request(`management/members/${member}/consents`,{...consent,acepta_datos_religiosos:0},admin,'POST',201)
  const independentConsent=(await request(`management/members/${member}/consents`,undefined,admin)).data.items.find(row=>row.acepta_datos_religiosos===0)
  assert.ok(independentConsent,'Las autorizaciones se conservan de manera independiente')
  for(const type of ['asistencia','cumpleanos','grupos']) for(const format of ['pdf','xlsx']) {
    const response=await fetch(`${base}/api/management/reports/${type}?format=${format}`,{headers:{Cookie:admin}})
    assert.equal(response.status,200)
    const data=Buffer.from(await response.arrayBuffer())
    if(format==='pdf') assert.equal(data.subarray(0,5).toString(),'%PDF-')
    else { const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(data);assert.ok(workbook.worksheets[0].rowCount>1);if(type==='asistencia'){assert.ok(workbook.worksheets[0].getRow(1).values.includes('Discípulo'));assert.ok(workbook.worksheets[0].getColumn(4).values.slice(2).some(Boolean))} }
  }
  const mediaExport=await fetch(`${base}/api/management/reports/asistencia?format=xlsx`,{headers:{Cookie:media}})
  const mediaWorkbook=new ExcelJS.Workbook();await mediaWorkbook.xlsx.load(Buffer.from(await mediaExport.arrayBuffer()))
  assert.ok(!JSON.stringify(mediaWorkbook.worksheets[0].getSheetValues()).includes('Miembro Prueba'))
  await request(`management/attendance/${a2}`,{},media,'DELETE')
  assert.equal((await request('management/alerts',undefined,pastor)).data.items.length,0)
  const [snapshotBefore]=await pool.execute('SELECT COUNT(*) AS total FROM miembro')
  const [grantsBefore]=await pool.execute('SELECT * FROM usuario_rol ORDER BY id_usuario,id_rol')
  const permissionCatalog=(await request('management/permissions',undefined,admin)).data
  const mediaRole=permissionCatalog.roles.find(role=>role.nombre==='Multimedia').id_rol
  const discipleRole=permissionCatalog.roles.find(role=>role.nombre==='Discipulador').id_rol
  const mediaGrants=permissionCatalog.grants.filter(grant=>grant.id_rol===mediaRole).map(grant=>({codigo:grant.codigo_permiso,alcance:grant.alcance}))
  await request(`management/permissions/${mediaRole}`,{grants:[{codigo:'estadisticas.ver',alcance:'grupo'}]},admin,'PUT',400)
  await request(`management/permissions/${discipleRole}`,{grants:[{codigo:'grupos.ver',alcance:'todos'}]},admin,'PUT',400)
  // Consult-only attendance and event editing must work without permission to register attendance.
  await request(`management/permissions/${mediaRole}`,{grants:[{codigo:'gestion.acceder',alcance:'todos'},{codigo:'asistencia.ver',alcance:'todos'}]},admin,'PUT')
  await request('management/activities',undefined,media)
  await request(`management/attendance?activityId=${first}`,undefined,media)
  await request(`management/attendance/roster?activityId=${first}`,undefined,media,undefined,403)
  await request('management/attendance',attendance(first,'presente'),media,'POST',403)
  await request(`management/permissions/${mediaRole}`,{grants:[{codigo:'gestion.acceder',alcance:'todos'},{codigo:'eventos.editar',alcance:'todos'}]},admin,'PUT')
  await request('management/activities',undefined,media)
  await request(`management/attendance?activityId=${first}`,undefined,media,undefined,403)
  await request(`management/permissions/${mediaRole}`,{grants:mediaGrants.filter(grant=>grant.codigo!=='grupos.ver')},admin,'PUT')
  await applyMigrations(connection)
  const [snapshotAfter]=await pool.execute('SELECT COUNT(*) AS total FROM miembro')
  const [grantsAfter]=await pool.execute('SELECT * FROM usuario_rol ORDER BY id_usuario,id_rol')
  assert.deepEqual(snapshotBefore,snapshotAfter);assert.deepEqual(grantsBefore,grantsAfter)
  const [removedPermission]=await pool.execute("SELECT * FROM rol_permiso rp JOIN rol_sistema r ON r.id_rol=rp.id_rol WHERE r.nombre='Multimedia' AND rp.codigo_permiso='grupos.ver'")
  assert.equal(removedPermission.length,0,'Rerunning migrations must preserve permission revocation')
  await pool.query('ALTER TABLE miembro RENAME COLUMN eps TO eps_legacy')
  await assert.rejects(applyMigrations(connection),/Esquema incompatible: miembro.eps/)
  await pool.query('ALTER TABLE miembro RENAME COLUMN eps_legacy TO eps')
  // New permissions are checked on existing sessions, without logging in again.
  await pool.execute('UPDATE usuario_rol ur JOIN rol_sistema r ON r.id_rol=ur.id_rol SET ur.activo=0 WHERE ur.id_usuario=? AND r.nombre=?',[accounts.Discipulador.id,'Discipulador'])
  await request('management/groups',undefined,disciple,undefined,403)
  console.log('PASS: migration idempotence, data preservation, required fields, sensitive-data projection, scoped disciples, group/cobertura history, multiple ministries, opening process, manual/QR/visitor attendance, duplicate/correction permissions, chronological alerts, cancellation/rescheduling, consent without invented effects, all six PDF/XLSX exports and live permission revocation.')
} finally {
  if(server) await new Promise(resolve=>server.close(resolve))
  if(pool) await pool.end()
  await connection.query(`DROP DATABASE IF EXISTS \`${testDatabase}\``)
  await connection.end()
  console.log('Base temporal eliminada; cuentas locales intactas.')
}
