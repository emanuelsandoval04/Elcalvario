import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { pool } from './db.js'
import { requireSession, requirePermission, hasPermission, protectMutation, readUser, hashPassword, credentials } from './auth.js'
import { hasPastoralAuthority, pastoralRoles } from './pastoral-policy.js'
import { invalid, identifier, text, choice, boolean, date, url, fields, memberFields, sensitiveMemberFields, groupFields, activityFields, bogotaToday } from './entities.js'
import { recalculateAlerts } from './alerts.js'
import { facebookTransmission } from './facebook.js'
import { sendReport, discipleReportRows, discipleColumns } from './reports.js'
import { canManageTraining, requireTraining, trainingBooks, trainingBook, checkBookVersion, validateTrainingBook } from './training.js'
import { parseProfilePhoto, saveProfilePhoto } from './profile-photo.js'
import { mapRouter } from './map.js'
import { applyGroupCoverage } from './group-coverage.js'
import { readNeighborhoodCatalog } from './neighborhood-catalog.js'

export const managementRouter = Router()
export const publicRouter = Router()
const can = (req, code) => hasPermission(req.authUser,code)
const scoped = (req, code) => req.authUser.permissions[code] === 'grupo'
const memberId = req => req.authUser.memberId || -1
const groupScopedPermissions=new Set(['gestion.acceder','miembros.ver','miembros.registrar','miembros.editar','miembros.estado','miembros.eliminar',
  'grupos.ver','grupos.editar','grupos.eliminar','eventos.eliminar','asistencia.registrar','asistencia.ver',
  'asistencia.corregir','asistencia.eliminar','alertas.ver','reportes.asistencia','reportes.cumpleanos','reportes.grupos',
  'ministerios.gestionar','consentimientos.gestionar','reportes.discipulos'])
const groupFilter = (req,code,alias='g') => scoped(req,code) ? {sql:` AND ${alias}.id_discipulador=?`,params:[memberId(req)]} : {sql:'',params:[]}
const memberFilter = (req,code,alias='m') => scoped(req,code) ? {sql:` AND (EXISTS(SELECT 1 FROM grupo_comunion sg WHERE sg.id_grupo=${alias}.id_grupo AND sg.id_discipulador=? AND sg.archivado=0) OR (${alias}.id_grupo IS NULL AND ${alias}.id_usuario_creacion=?))`,params:[memberId(req),req.authUser.id]} : {sql:'',params:[]}
const activityFilter = (req,code,alias='ac') => scoped(req,code) ? {sql:` AND EXISTS(SELECT 1 FROM reunion_grupo sr JOIN grupo_comunion sg ON sg.id_grupo=sr.id_grupo WHERE sr.id_actividad=${alias}.id_actividad AND sg.id_discipulador=? AND sg.archivado=0)`,params:[memberId(req)]} : {sql:'',params:[]}
const registrationPermission=req=>can(req,'miembros.registrar')?'miembros.registrar':'miembros.editar'

async function transaction(action) {
  const connection = await pool.getConnection()
  try { await connection.beginTransaction(); const result=await action(connection); await connection.commit(); return result }
  catch(error) { await connection.rollback(); throw error }
  finally { connection.release() }
}
async function insert(connection,table,values) {
  const [result] = await connection.query('INSERT INTO ?? SET ?', [table,values])
  return result.insertId
}
async function update(connection,table,key,id,values) {
  await connection.query('UPDATE ?? SET ? WHERE ??=?',[table,values,key,id])
}
async function getMember(req,id,code,connection=pool,lock=false) {
  const filter = memberFilter(req,code)
  const [rows] = await connection.execute(`SELECT m.* FROM miembro m WHERE m.id_miembro=? AND m.archivado=0 ${filter.sql} ${lock?'FOR UPDATE':''}`,[identifier(id),...filter.params])
  if (!rows.length) throw invalid('Discípulo no disponible en tu alcance.',404)
  return rows[0]
}
async function getGroup(req,id,code,connection=pool) {
  const filter = groupFilter(req,code)
  const [rows] = await connection.execute(`SELECT g.* FROM grupo_comunion g WHERE g.id_grupo=? AND g.archivado=0 ${filter.sql}`,[identifier(id),...filter.params])
  if (!rows.length) throw invalid('Grupo no disponible en tu alcance.',404)
  return rows[0]
}
async function getActivity(req,id,code,connection=pool) {
  const filter = activityFilter(req,code)
  const [rows] = await connection.execute(`SELECT ac.*,rg.id_grupo,e.requiere_inscripcion,e.url_inscripcion FROM actividad ac LEFT JOIN reunion_grupo rg ON rg.id_actividad=ac.id_actividad LEFT JOIN evento e ON e.id_actividad=ac.id_actividad WHERE ac.id_actividad=? AND ac.archivado=0 ${filter.sql}`,[identifier(id),...filter.params])
  if (!rows.length) throw invalid('Actividad no disponible en tu alcance.',404)
  return rows[0]
}
function cleanMember(req,row) {
  const result = {...row}
  if (!can(req,'miembros.sensibles')) for(const key of sensitiveMemberFields) delete result[key]
  return result
}
async function currentActor(req,connection) {
  await connection.execute('SELECT id FROM configuracion_sistema WHERE id=1 FOR UPDATE')
  const actor=await readUser(req.authUser.id,connection)
  if(!actor || !hasPermission(actor,'gestion.acceder')) throw invalid('Tu acceso ha cambiado. Actualiza la sesión.',403)
  req.authUser=actor
  return actor
}
function checkMemberServices(actor,values,old=null) {
  const changed=key=>Object.hasOwn(values,key) && values[key]!==old?.[key] && (old || values[key]!=null)
  if(!hasPastoralAuthority(actor) && ['id_rol_eclesiastico','funcion_iglesia','id_cobertura_pastoral'].some(changed)) {
    throw invalid('Solo los cinco cargos pastorales autorizados pueden asignar cargos y servicios.',403)
  }
}
async function memberRelations(req,values,connection,id=null,old=null,creating=false) {
  if (values.id_grupo && values.id_grupo!==old?.id_grupo) {
    if(!creating && !can(req,'grupos.editar')) throw invalid('Sin permiso para asignar grupos.',403)
    const group=await getGroup(req,values.id_grupo,creating?registrationPermission(req):'grupos.editar',connection)
    if(scoped(req,creating?registrationPermission(req):'miembros.editar') && group.id_discipulador!==req.authUser.memberId) throw invalid('El grupo debe estar a tu cargo.',403)
  }
  if (values.id_cobertura_pastoral && values.id_cobertura_pastoral!==old?.id_cobertura_pastoral) {
    if (values.id_cobertura_pastoral===id) throw invalid('Un discípulo no puede ser su propia cobertura.')
    const [rows]=await connection.execute('SELECT id_miembro FROM miembro WHERE id_miembro=? AND archivado=0',[values.id_cobertura_pastoral])
    if (!rows.length) throw invalid('Cobertura no disponible.')
  }
}
async function recordRelations(connection,old,values,actorId) {
  for(const [key,concepto] of [['id_grupo','grupo'],['id_cobertura_pastoral','cobertura']]) if(Object.hasOwn(values,key) && old[key]!==values[key]) {
    await insert(connection,'historial_miembro',{id_miembro:old.id_miembro,concepto,id_anterior:old[key],id_nuevo:values[key],id_usuario:actorId})
  }
}

async function exportDisciples(req,res,id=null) {
  if(!can(req,'miembros.ver')) throw invalid('No tienes permiso para consultar fichas de discípulos.',403)
  const reportScope=memberFilter(req,'reportes.discipulos'), viewScope=memberFilter(req,'miembros.ver')
  const clauses=[], params=[...reportScope.params,...viewScope.params]
  if(id) { clauses.push('m.id_miembro=?'); params.push(id) }
  if(req.query.q) { const search=text(req.query.q,100,true); clauses.push("(CONCAT_WS(' ',m.nombres,m.apellidos) LIKE ? OR m.numero_identificacion LIKE ?)"); params.push(`%${search}%`,`%${search}%`) }
  if(req.query.estado) { clauses.push('m.estado_miembro=?'); params.push(choice(req.query.estado,['activo','inactivo','retirado'])) }
  if(req.query.sin_libro==='1') clauses.push('m.id_libro IS NULL')
  if(req.query.id_grupo) { clauses.push('m.id_grupo=?'); params.push(identifier(req.query.id_grupo)) }
  const [rows]=await pool.execute(`SELECT m.*,CAST(m.fecha_nacimiento AS CHAR) AS fecha_nacimiento,
    l.nombre AS libro_actual,g.nombre AS grupo_nombre,r.nombre AS rol_nombre,s.nombre AS sede_nombre,
    CONCAT_WS(' ',c.nombres,c.apellidos) AS cobertura_nombre,
    (SELECT GROUP_CONCAT(mt.nombre ORDER BY mt.nombre SEPARATOR ', ') FROM miembro_ministerio mm JOIN ministerio mt ON mt.id_ministerio=mm.id_ministerio WHERE mm.id_miembro=m.id_miembro AND mm.activo=1) AS ministerios
    FROM miembro m LEFT JOIN libro_adiestramiento l ON l.id_libro=m.id_libro
    LEFT JOIN grupo_comunion g ON g.id_grupo=m.id_grupo LEFT JOIN rol_eclesiastico r ON r.id_rol_eclesiastico=m.id_rol_eclesiastico
    LEFT JOIN sede s ON s.id_sede=m.id_sede LEFT JOIN miembro c ON c.id_miembro=m.id_cobertura_pastoral
    WHERE m.archivado=0 ${reportScope.sql} ${viewScope.sql} ${clauses.length?'AND '+clauses.join(' AND '):''} ORDER BY m.nombres,m.apellidos,m.id_miembro`,params)
  if(id && !rows.length) throw invalid('Discípulo no disponible en tu alcance.',404)
  await sendReport(res,'discipulos','xlsx',discipleReportRows(rows.map(row=>cleanMember(req,row))),{title:'Ficha de discípulos',columns:discipleColumns(can(req,'miembros.sensibles'))})
}

publicRouter.get('/institution',async (_req,res) => {
  const [rows]=await pool.execute('SELECT * FROM institucion WHERE id=1')
  res.json(rows[0])
})
publicRouter.get('/events',async (_req,res) => {
  const [rows]=await pool.execute(`SELECT ac.id_actividad,ac.tipo_actividad,ac.titulo,CAST(ac.fecha AS CHAR) AS fecha,ac.hora,ac.lugar,ac.imagen,ac.descripcion,ac.estado_actividad,e.requiere_inscripcion,e.url_inscripcion
    FROM actividad ac LEFT JOIN evento e ON e.id_actividad=ac.id_actividad
    WHERE ac.publicado=1 AND ac.archivado=0 AND ac.tipo_actividad IN ('culto','evento')
      AND ac.fecha>=DATE(DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 HOUR)) ORDER BY ac.fecha,ac.hora LIMIT 100`)
  res.json({items:rows})
})
publicRouter.get('/ministries',async (_req,res) => {
  const [rows]=await pool.execute('SELECT id_ministerio,nombre,descripcion FROM ministerio ORDER BY nombre')
  res.json({items:rows})
})
publicRouter.get('/transmission',async (_req,res) => res.json(await facebookTransmission()))

managementRouter.use(protectMutation,requireSession,requirePermission('gestion.acceder'))
managementRouter.use('/mapa',mapRouter)
managementRouter.get('/training/books', requireTraining, async (_req,res) => res.json({items:await trainingBooks()}))
managementRouter.post('/training/books', requireTraining, async (req,res) => {
  const name=text(req.body?.nombre,150,true), description=text(req.body?.descripcion,2000)
  const id=await transaction(async connection=>{
    const actor=await currentActor(req,connection)
    if(!canManageTraining(actor)) throw invalid('Ya no tienes permiso para crear libros.',403)
    const [existing]=await connection.execute('SELECT id_libro FROM libro_adiestramiento WHERE nombre=?',[name])
    if(existing.length) throw invalid('Ya existe un libro con ese nombre.',409)
    return insert(connection,'libro_adiestramiento',{nombre:name,descripcion:description,id_usuario_creacion:actor.id})
  })
  res.status(201).json({id,nombre:name,descripcion:description})
})
managementRouter.get('/training/books/:id',requireTraining,async(req,res)=>{
  const book=await trainingBook(pool,req.params.id)
  const [counts]=await pool.execute('SELECT COUNT(*) AS total FROM miembro WHERE id_libro=?',[book.id_libro])
  res.json({...book,asignaciones:counts[0].total})
})
managementRouter.patch('/training/books/:id',requireTraining,async(req,res)=>{
  const values=fields(req.body,{nombre:value=>text(value,150,true),descripcion:value=>text(value,2000)})
  const result=await transaction(async connection=>{
    const actor=await currentActor(req,connection)
    if(!canManageTraining(actor)) throw invalid('Ya no tienes permiso para actualizar libros.',403)
    const book=await trainingBook(connection,req.params.id,true)
    checkBookVersion(req.body,book)
    if(Object.hasOwn(values,'nombre')) {
      const [duplicates]=await connection.execute('SELECT id_libro FROM libro_adiestramiento WHERE nombre=? AND id_libro<>?',[values.nombre,book.id_libro])
      if(duplicates.length) throw invalid('Ya existe otro libro con ese nombre.',409)
    }
    await update(connection,'libro_adiestramiento','id_libro',book.id_libro,values)
    return {id:book.id_libro,nombre:values.nombre ?? book.nombre,descripcion:Object.hasOwn(values,'descripcion') ? values.descripcion : book.descripcion}
  })
  res.json(result)
})
managementRouter.delete('/training/books/:id',requireTraining,async(req,res)=>{
  await transaction(async connection=>{
    const actor=await currentActor(req,connection)
    if(!canManageTraining(actor)) throw invalid('Ya no tienes permiso para eliminar libros.',403)
    const book=await trainingBook(connection,req.params.id,true)
    checkBookVersion(req.body,book)
    const [counts]=await connection.execute('SELECT COUNT(*) AS total FROM miembro WHERE id_libro=?',[book.id_libro])
    if(counts[0].total) throw invalid(`Este libro está asignado a ${counts[0].total} discípulo(s). Reasigna sus libros antes de eliminarlo.`,409)
    await connection.execute('DELETE FROM libro_adiestramiento WHERE id_libro=?',[book.id_libro])
  })
  res.json({ok:true})
})
managementRouter.get('/catalogs',async (req,res) => {
  const [roles]=await pool.execute('SELECT * FROM rol_eclesiastico ORDER BY nivel_jerarquico')
  const [sedes]=await pool.execute('SELECT * FROM sede ORDER BY nombre')
  const [zonas]=await pool.execute('SELECT * FROM zona ORDER BY nombre')
  const [ministerios]=await pool.execute('SELECT * FROM ministerio ORDER BY nombre')
  const filter=groupFilter(req,'grupos.ver')
  const [grupos]= can(req,'grupos.ver') ? await pool.execute(`SELECT g.id_grupo,g.nombre FROM grupo_comunion g WHERE g.archivado=0 ${filter.sql}`,[...filter.params]) : [[]]
  const registrationFilter=groupFilter(req,registrationPermission(req))
  const [registrationGroups]=can(req,'miembros.editar') || can(req,'miembros.registrar') ? await pool.execute(`SELECT g.id_grupo,g.nombre FROM grupo_comunion g WHERE g.archivado=0 ${registrationFilter.sql}`,[...registrationFilter.params]) : [[]]
  const barrios=can(req,'grupos.ver') ? await readNeighborhoodCatalog() : []
  const libros=(can(req,'miembros.ver') || can(req,'miembros.editar') || can(req,'miembros.registrar') || canManageTraining(req.authUser)) ? await trainingBooks() : []
  res.json({roles,sedes,zonas,ministerios,grupos,registrationGroups,barrios,libros})
})
managementRouter.get('/members',requirePermission('miembros.ver'),async (req,res) => {
  const filter=memberFilter(req,'miembros.ver')
  const search=text(req.query.q,100) || ''
  const [rows]=await pool.execute(`SELECT m.*,l.nombre AS libro_actual,CAST(m.fecha_nacimiento AS CHAR) AS fecha_nacimiento FROM miembro m LEFT JOIN libro_adiestramiento l ON l.id_libro=m.id_libro WHERE m.archivado=0 ${filter.sql}
    AND (CONCAT_WS(' ',m.nombres,m.apellidos) LIKE ? OR m.numero_identificacion LIKE ?) ORDER BY m.nombres LIMIT 500`,[...filter.params,`%${search}%`,`%${search}%`])
  res.json({items:rows.map(row=>cleanMember(req,row))})
})
managementRouter.post('/members',(req,res,next)=>can(req,'miembros.registrar') || can(req,'miembros.editar') ? next() : res.status(403).json({error:'No tienes permiso para registrar discípulos.'}),async (req,res) => {
  const registrationType=choice(req.body?.tipo_registro || 'discipulo',['discipulo','administrativo'])
  if(registrationType==='administrativo' && !req.authUser.registration.canCreateAdministrative) throw invalid('Tu cargo solo permite registrar discípulos normales.',403)
  const values=fields(req.body,memberFields,true)
  checkMemberServices(req.authUser,values)
  if(registrationType==='discipulo' && values.id_rol_eclesiastico) throw invalid('El discípulo normal no recibe un cargo pastoral. Selecciona registro administrativo.',400)
  const ministryId=identifier(req.body.id_ministerio,true)
  const leadsGroup=Object.hasOwn(req.body,'responsable_grupo') ? boolean(req.body.responsable_grupo) : 0
  if((ministryId || leadsGroup) && !hasPastoralAuthority(req.authUser)) throw invalid('No tienes autorización para asignar servicios.',403)
  if(ministryId && !can(req,'ministerios.gestionar')) throw invalid('No tienes permiso para asignar ministerios.',403)
  if(leadsGroup && (registrationType!=='administrativo' || !values.id_grupo || !can(req,'grupos.editar'))) throw invalid('Selecciona un administrativo y un grupo para asignar su responsable.')
  let account, passwordHash, accountPhoto
  if(registrationType==='administrativo') {
    if(!values.id_rol_eclesiastico) throw invalid('Selecciona el cargo pastoral del administrativo.')
    account=credentials({email:req.body.account_email,password:req.body.account_password},true)
    if(account.error) throw invalid(account.error)
    if(req.body.account_confirmation!==account.password) throw invalid('Las contraseñas de la cuenta no coinciden.')
    accountPhoto=parseProfilePhoto(req.body.account_photo)
    passwordHash=await hashPassword(account.password)
  } else if(req.body.account_email || req.body.account_password || req.body.account_photo) throw invalid('El registro de discípulo normal no crea una cuenta de acceso.')
  if (!can(req,'miembros.sensibles') && sensitiveMemberFields.some(key=>values[key])) throw invalid('Sin permiso para datos sensibles.',403)
  const result=await transaction(async connection=>{
    const actor=await currentActor(req,connection)
    if(!hasPermission(actor,'miembros.editar') && !hasPermission(actor,'miembros.registrar')) throw invalid('Ya no tienes permiso para registrar discípulos.',403)
    checkMemberServices(actor,values)
    values.id_libro=await validateTrainingBook(connection,values.id_libro,registrationType==='discipulo')
    if(registrationType==='administrativo' && !actor.registration.canCreateAdministrative) throw invalid('Tu cargo no permite crear administrativos.',403)
    if((ministryId || leadsGroup) && !hasPastoralAuthority(actor)) throw invalid('Ya no tienes autorización para asignar servicios.',403)
    if(ministryId && !can(req,'ministerios.gestionar') || leadsGroup && !can(req,'grupos.editar')) throw invalid('Tus permisos para asignar servicios han cambiado.',403)
    if(leadsGroup) await getGroup(req,values.id_grupo,'grupos.editar',connection)
    if(ministryId && scoped(req,'ministerios.gestionar')) {
      if(!values.id_grupo) throw invalid('Selecciona un grupo a tu cargo para asignar el ministerio.',403)
      await getGroup(req,values.id_grupo,'ministerios.gestionar',connection)
    }
    let systemRole
    if(account) {
      const [ranks]=await connection.execute('SELECT nivel_jerarquico FROM rol_eclesiastico WHERE id_rol_eclesiastico=?',[values.id_rol_eclesiastico])
      const rank=pastoralRoles.find(role=>role.level===Number(ranks[0]?.nivel_jerarquico))
      if(!rank) throw invalid('Cargo pastoral no disponible.')
      const [roles]=await connection.execute('SELECT id_rol FROM rol_sistema WHERE nombre=? AND estado=1',[rank.systemRole])
      if(!roles.length) throw invalid('Actualiza las migraciones antes de crear administrativos.',409)
      systemRole=roles[0].id_rol
      const [existing]=await connection.execute('SELECT id_usuario FROM usuario WHERE correo_login=?',[account.email])
      if(existing.length) throw invalid('Ya existe una cuenta con ese correo de acceso.',409)
    }
    await memberRelations(req,values,connection,null,null,true)
    const id=await insert(connection,'miembro',{...values,codigo_qr:randomUUID(),id_usuario_creacion:actor.id,id_usuario_actualizacion:actor.id})
    let accountId=null
    if(account) {
      accountId=await insert(connection,'usuario',{id_miembro:id,correo_login:account.email,password_hash:passwordHash,estado_usuario:'activo'})
      await insert(connection,'perfil_usuario',{id_usuario:accountId,nombre:`${values.nombres} ${values.apellidos || ''}`.trim().slice(0,100)})
      if(accountPhoto) await saveProfilePhoto(connection,accountId,accountPhoto)
      await insert(connection,'usuario_rol',{id_usuario:accountId,id_rol:systemRole})
    }
    if(ministryId) await insert(connection,'miembro_ministerio',{id_miembro:id,id_ministerio:ministryId,activo:1})
    if(leadsGroup) await update(connection,'grupo_comunion','id_grupo',values.id_grupo,{id_discipulador:id})
    return {id,accountCreated:Boolean(accountId)}
  })
  res.status(201).json(result)
})
managementRouter.patch('/members/:id',requirePermission('miembros.editar'),async (req,res) => {
  const values=fields(req.body,memberFields)
  if (!can(req,'miembros.sensibles') && sensitiveMemberFields.some(key=>Object.hasOwn(values,key))) throw invalid('Sin permiso para datos sensibles.',403)
  const id=identifier(req.params.id)
  await transaction(async connection=>{
    const actor=await currentActor(req,connection)
    if(!hasPermission(actor,'miembros.editar')) throw invalid('Ya no tienes permiso para editar discípulos.',403)
    const old=await getMember(req,id,'miembros.editar',connection,true)
    if(Object.hasOwn(values,'id_libro')) {
      if(values.id_libro!==old.id_libro && !canManageTraining(actor)) throw invalid('Sin permiso para asignar libros.',403)
      values.id_libro=await validateTrainingBook(connection,values.id_libro,values.id_libro!==old.id_libro)
    }
    checkMemberServices(actor,values,old)
    if(Object.hasOwn(values,'id_rol_eclesiastico') && values.id_rol_eclesiastico!==old.id_rol_eclesiastico) {
      const [accounts]=await connection.execute('SELECT id_usuario FROM usuario WHERE id_miembro=?',[id])
      if(accounts.length || !old.id_rol_eclesiastico && values.id_rol_eclesiastico) throw invalid('Gestiona el cargo desde Usuarios y roles. Para una cuenta nueva usa el registro administrativo.',409)
    }
    await memberRelations(req,values,connection,id,old)
    if(scoped(req,'miembros.editar') && old.id_grupo && Object.hasOwn(values,'id_grupo') && !values.id_grupo) throw invalid('No puedes sacar discípulos de tu alcance.',403)
    await recordRelations(connection,old,values,req.authUser.id)
    await update(connection,'miembro','id_miembro',id,{...values,id_usuario_actualizacion:req.authUser.id})
  })
  res.json({ok:true})
})
managementRouter.put('/members/:id/book',requirePermission('miembros.ver'),requireTraining,async(req,res)=>{
  const id=identifier(req.params.id)
  if(!Object.hasOwn(req.body || {},'id_libro')) throw invalid('Selecciona un libro.')
  await transaction(async connection=>{
    const actor=await currentActor(req,connection)
    if(!hasPermission(actor,'miembros.ver') || !canManageTraining(actor)) throw invalid('Tus permisos para asignar libros han cambiado.',403)
    const member=await getMember(req,id,'miembros.ver',connection,true)
    if(Object.hasOwn(req.body,'expectedId') && identifier(req.body.expectedId,true)!==member.id_libro) throw invalid('Otro usuario cambió el libro. Actualiza la ficha antes de guardar.',409)
    const book=await validateTrainingBook(connection,req.body.id_libro,true)
    await update(connection,'miembro','id_miembro',id,{id_libro:book,id_usuario_actualizacion:actor.id})
  })
  res.json({ok:true})
})
managementRouter.get('/members/:id/excel',requirePermission('reportes.discipulos'),async(req,res)=>exportDisciples(req,res,identifier(req.params.id)))
managementRouter.post('/members/:id/relations',requirePermission('grupos.editar'),requirePermission('miembros.ver'),async (req,res) => {
  const values=fields(req.body,{id_grupo:memberFields.id_grupo,id_cobertura_pastoral:memberFields.id_cobertura_pastoral})
  const id=identifier(req.params.id)
  if(scoped(req,'grupos.editar') && (Object.hasOwn(values,'id_cobertura_pastoral') || !values.id_grupo)) throw invalid('La cobertura y desvinculación requieren alcance general.',403)
  await transaction(async connection=>{
    const actor=await currentActor(req,connection)
    if(!hasPermission(actor,'grupos.editar') || !hasPermission(actor,'miembros.ver')) throw invalid('Tus permisos han cambiado.',403)
    const old=await getMember(req,id,'miembros.ver',connection,true)
    checkMemberServices(actor,values,old)
    await memberRelations(req,values,connection,id,old)
    await recordRelations(connection,old,values,req.authUser.id)
    await update(connection,'miembro','id_miembro',id,{...values,id_usuario_actualizacion:req.authUser.id})
  })
  res.json({ok:true})
})
managementRouter.post('/members/:id/state',requirePermission('miembros.estado'),async (req,res) => {
  const row=await getMember(req,req.params.id,'miembros.estado')
  await update(pool,'miembro','id_miembro',row.id_miembro,{estado_miembro:choice(req.body?.estado_miembro,['activo','inactivo','retirado']),id_usuario_actualizacion:req.authUser.id})
  res.json({ok:true})
})
managementRouter.delete('/members/:id',requirePermission('miembros.eliminar'),async (req,res) => {
  const row=await getMember(req,req.params.id,'miembros.eliminar')
  await update(pool,'miembro','id_miembro',row.id_miembro,{archivado:1,id_usuario_actualizacion:req.authUser.id})
  res.json({ok:true})
})
managementRouter.get('/members/:id/history',requirePermission('miembros.ver'),async (req,res) => {
  const row=await getMember(req,req.params.id,'miembros.ver')
  const [items]=await pool.execute('SELECT * FROM historial_miembro WHERE id_miembro=? ORDER BY fecha_cambio DESC',[row.id_miembro])
  res.json({items})
})
managementRouter.get('/members/:id/ministries',requirePermission('miembros.ver'),async (req,res) => {
  const row=await getMember(req,req.params.id,'miembros.ver')
  const [items]=await pool.execute('SELECT id_ministerio FROM miembro_ministerio WHERE id_miembro=? AND activo=1',[row.id_miembro])
  res.json({items})
})
managementRouter.put('/members/:id/ministries',requirePermission('ministerios.gestionar'),async (req,res) => {
  const ids=req.body?.ids
  if(!Array.isArray(ids)||ids.length>100) throw invalid('Ministerios inválidos.')
  const unique=[...new Set(ids.map(id=>identifier(id)))]
  await transaction(async connection=>{
    const actor=await currentActor(req,connection)
    if(!hasPastoralAuthority(actor) || !hasPermission(actor,'ministerios.gestionar')) throw invalid('Solo los cinco cargos pastorales autorizados pueden asignar ministerios.',403)
    const row=await getMember(req,req.params.id,'ministerios.gestionar',connection,true)
    await connection.execute('UPDATE miembro_ministerio SET activo=0 WHERE id_miembro=?',[row.id_miembro])
    for(const id of unique) await connection.execute('INSERT INTO miembro_ministerio(id_miembro,id_ministerio) VALUES (?,?) ON DUPLICATE KEY UPDATE activo=1',[row.id_miembro,id])
  })
  res.json({ok:true})
})
managementRouter.get('/groups',requirePermission('grupos.ver'),async (req,res) => {
  const filter=groupFilter(req,'grupos.ver')
  const [items]=await pool.execute(`SELECT g.*,(SELECT COUNT(*) FROM miembro m WHERE m.id_grupo=g.id_grupo AND m.archivado=0) AS miembros FROM grupo_comunion g WHERE g.archivado=0 ${filter.sql} ORDER BY g.nombre`,filter.params)
  res.json({items})
})
async function saveGroup(req,res,create) {
  const values=fields(req.body,groupFields,create)
  const id=create?null:identifier(req.params.id)
  const result=await transaction(async connection=>{
  const actor=await currentActor(req,connection)
  if(!hasPermission(actor,'grupos.editar')) throw invalid('Ya no tienes permiso para gestionar grupos.',403)
  if(create && !hasPastoralAuthority(actor)) throw invalid('Solo los cargos pastorales autorizados pueden crear grupos y asignar responsables.',403)
  const old=create?null:await getGroup(req,id,'grupos.editar',connection)
  if(scoped(req,'grupos.editar')) {
    if(!req.authUser.memberId) throw invalid('Tu cuenta debe vincularse primero a tu ficha de discípulo.',409)
    if(Object.hasOwn(values,'id_discipulador') && values.id_discipulador!==req.authUser.memberId) throw invalid('Solo puedes gestionar grupos a tu cargo.',403)
    values.id_discipulador=req.authUser.memberId
  }
  if(values.id_grupo_origen && values.id_grupo_origen!==old?.id_grupo_origen) {
    if(values.id_grupo_origen===id) throw invalid('El grupo no puede ser su propio origen.')
    await getGroup(req,values.id_grupo_origen,'grupos.editar',connection)
  }
  if(Object.hasOwn(values,'id_discipulador') && values.id_discipulador!==old?.id_discipulador && !hasPastoralAuthority(req.authUser)) throw invalid('No tienes autorización para asignar responsables de grupo.',403)
  if(values.id_discipulador && values.id_discipulador!==old?.id_discipulador) {
    const [rows]=await connection.execute('SELECT id_miembro FROM miembro WHERE id_miembro=? AND archivado=0',[values.id_discipulador])
    if(!rows.length) throw invalid('Discipulador no disponible.')
  }
  const groupId=create ? await insert(connection,'grupo_comunion',values) : (await update(connection,'grupo_comunion','id_grupo',id,values),id)
  if(Object.hasOwn(req.body,'barrios')) {
    const selection=req.body.barrios
    if(!selection || selection.legacy || selection.expectedLeaderId!==(old?.id_discipulador || null)) throw invalid('El responsable del grupo cambió. Actualiza el formulario.',409)
    await applyGroupCoverage(connection,actor,groupId,selection,{allowEmptyWithoutLeader:true,skipLeaderCheck:true})
  }
  return groupId
  })
  res.status(create?201:200).json({id:result})
}
managementRouter.post('/groups',requirePermission('grupos.editar'),(req,res)=>saveGroup(req,res,true))
managementRouter.patch('/groups/:id',requirePermission('grupos.editar'),(req,res)=>saveGroup(req,res,false))
managementRouter.delete('/groups/:id',requirePermission('grupos.eliminar'),async(req,res)=>{
  const row=await getGroup(req,req.params.id,'grupos.eliminar')
  await update(pool,'grupo_comunion','id_grupo',row.id_grupo,{archivado:1})
  res.json({ok:true})
})
managementRouter.get('/groups/:id/processes',requirePermission('grupos.ver'),async(req,res)=>{
  const group=await getGroup(req,req.params.id,'grupos.ver')
  const [items]=await pool.execute('SELECT * FROM multiplicacion_grupo WHERE id_grupo_origen=? ORDER BY fecha_registro DESC',[group.id_grupo])
  res.json({items})
})
managementRouter.post('/groups/:id/processes',requirePermission('grupos.editar'),async(req,res)=>{
  const group=await getGroup(req,req.params.id,'grupos.editar')
  const values={id_grupo_origen:group.id_grupo,proposito:choice(req.body?.proposito,['multiplicacion_grupo','apertura_iglesia']),
    id_grupo_destino:identifier(req.body?.id_grupo_destino,true),id_sede_destino:identifier(req.body?.id_sede_destino,true),descripcion:text(req.body?.descripcion,5000)}
  if(values.id_grupo_destino) {
    if(values.id_grupo_destino===group.id_grupo) throw invalid('El grupo de destino debe ser distinto al origen.')
    await getGroup(req,values.id_grupo_destino,'grupos.editar')
  }
  res.status(201).json({id:await insert(pool,'multiplicacion_grupo',values)})
})
managementRouter.get('/activities',async(req,res)=>{
  const codes=['asistencia.registrar','asistencia.ver','eventos.editar','eventos.publicar','grupos.editar'].filter(code=>can(req,code))
  if(!codes.length) throw invalid('No tienes permiso para consultar actividades.',403)
  const accessCode=codes.find(code=>req.authUser.permissions[code]==='todos') || codes[0]
  const filter=activityFilter(req,accessCode)
  const [items]=await pool.execute(`SELECT ac.*,CAST(ac.fecha AS CHAR) AS fecha,rg.id_grupo,e.requiere_inscripcion,e.url_inscripcion FROM actividad ac
    LEFT JOIN reunion_grupo rg ON rg.id_actividad=ac.id_actividad LEFT JOIN evento e ON e.id_actividad=ac.id_actividad
    WHERE ac.archivado=0 ${filter.sql} ORDER BY ac.fecha DESC,ac.hora DESC LIMIT 500`,filter.params)
  res.json({items})
})
async function saveActivity(req,res,create) {
  const id=create?null:identifier(req.params.id)
  const existing=create?null:await getActivity(req,id,can(req,'eventos.editar')?'eventos.editar':'grupos.editar')
  const type=create?choice(req.body?.tipo_actividad,['culto','evento','reunion_grupo']):existing.tipo_actividad
  if(!create && req.body.tipo_actividad && req.body.tipo_actividad!==type) throw invalid('El tipo de una actividad existente no puede cambiar.')
  const permission=type==='reunion_grupo'?'grupos.editar':'eventos.editar'
  if(!can(req,permission)) throw invalid('No tienes permiso para gestionar esta actividad.',403)
  const values=fields(req.body,activityFields,create,!create)
  if(Object.hasOwn(req.body,'publicado')) {
    if(type==='reunion_grupo' || !can(req,'eventos.publicar')) throw invalid('No tienes permiso para publicar.',403)
    values.publicado=boolean(req.body.publicado)
  }
  const group=type==='reunion_grupo'?await getGroup(req,req.body.id_grupo || existing?.id_grupo,'grupos.editar'):null
  const eventValues=type==='evento'?{}:null
  if(eventValues) {
    if(create || Object.hasOwn(req.body,'requiere_inscripcion')) eventValues.requiere_inscripcion=boolean(req.body.requiere_inscripcion ?? false)
    if(create || Object.hasOwn(req.body,'url_inscripcion')) eventValues.url_inscripcion=url(req.body.url_inscripcion)
    const effective={...existing,...eventValues}
    if(effective.requiere_inscripcion && !effective.url_inscripcion) throw invalid('Indica el enlace de inscripción.')
  }
  if(!create && !Object.keys(values).length && !Object.keys(eventValues || {}).length && !Object.hasOwn(req.body,'id_grupo')) throw invalid('No hay cambios para guardar.')
  const result=await transaction(async connection=>{
    const resultId=create?await insert(connection,'actividad',{...values,tipo_actividad:type,id_usuario_creacion:req.authUser.id}):id
    if(!create) await update(connection,'actividad','id_actividad',id,{...values,fecha_actualizacion:new Date()})
    if(create) await insert(connection,type,{id_actividad:resultId,...(group?{id_grupo:group.id_grupo}:{}),...eventValues})
    else if(type==='evento' && Object.keys(eventValues).length) await update(connection,'evento','id_actividad',id,eventValues)
    else if(group) await update(connection,'reunion_grupo','id_actividad',id,{id_grupo:group.id_grupo})
    if(!create && (values.fecha || values.hora || values.estado_actividad)) {
      const [members]=await connection.execute('SELECT DISTINCT id_miembro FROM asistencia WHERE id_actividad=? AND id_miembro IS NOT NULL ORDER BY id_miembro',[id])
      for(const row of members) { await connection.execute('SELECT id_miembro FROM miembro WHERE id_miembro=? FOR UPDATE',[row.id_miembro]); await recalculateAlerts(connection,row.id_miembro) }
    }
    return resultId
  })
  res.status(create?201:200).json({id:result})
}
managementRouter.post('/activities',(req,res)=>saveActivity(req,res,true))
managementRouter.patch('/activities/:id',(req,res)=>saveActivity(req,res,false))
managementRouter.delete('/activities/:id',requirePermission('eventos.eliminar'),async(req,res)=>{
  const row=await getActivity(req,req.params.id,'eventos.eliminar')
  await transaction(async connection=>{
    await update(connection,'actividad','id_actividad',row.id_actividad,{archivado:1})
    const [members]=await connection.execute('SELECT DISTINCT id_miembro FROM asistencia WHERE id_actividad=? AND id_miembro IS NOT NULL ORDER BY id_miembro',[row.id_actividad])
    for(const m of members) { await connection.execute('SELECT id_miembro FROM miembro WHERE id_miembro=? FOR UPDATE',[m.id_miembro]); await recalculateAlerts(connection,m.id_miembro) }
  })
  res.json({ok:true})
})
managementRouter.get('/attendance/roster',requirePermission('asistencia.registrar'),async(req,res)=>{
  const activity=await getActivity(req,req.query.activityId,'asistencia.registrar')
  const [items]=await pool.execute(`SELECT id_miembro,CONCAT_WS(' ',nombres,apellidos) AS nombre FROM miembro WHERE archivado=0 ${activity.id_grupo?'AND id_grupo=?':''} ORDER BY nombres`,activity.id_grupo?[activity.id_grupo]:[])
  res.json({items})
})
managementRouter.get('/attendance',requirePermission('asistencia.ver'),async(req,res)=>{
  const activity=await getActivity(req,req.query.activityId,'asistencia.ver')
  const [items]=await pool.execute(`SELECT a.*,CONCAT_WS(' ',m.nombres,m.apellidos) AS nombre FROM asistencia a LEFT JOIN miembro m ON m.id_miembro=a.id_miembro WHERE a.id_actividad=? AND a.archivado=0 ORDER BY a.fecha_registro`,[activity.id_actividad])
  res.json({items})
})
managementRouter.post('/attendance',requirePermission('asistencia.registrar'),async(req,res)=>{
  const activity=await getActivity(req,req.body?.id_actividad,'asistencia.registrar')
  if(activity.estado_actividad==='cancelada') throw invalid('No se registra asistencia en una actividad cancelada.',409)
  const state=choice(req.body.estado_asistencia,['presente','ausente','justificado','visitante'])
  const method=choice(req.body.metodo_registro || 'manual',['manual','qr'])
  let id=identifier(req.body.id_miembro,true)
  if(method==='qr') {
    const qr=text(req.body.codigo_qr,36,true)
    const [rows]=await pool.execute('SELECT id_miembro FROM miembro WHERE codigo_qr=? AND archivado=0',[qr])
    if(!rows.length) throw invalid('QR no reconocido.',404)
    id=rows[0].id_miembro
  }
  if(!id && state!=='visitante') throw invalid('Selecciona un discípulo o registra un visitante.')
  const result=await transaction(async connection=>{
    if(id) {
      const [rows]=await connection.execute('SELECT id_grupo FROM miembro WHERE id_miembro=? AND archivado=0 FOR UPDATE',[id])
      if(!rows.length || (activity.id_grupo && rows[0].id_grupo!==activity.id_grupo)) throw invalid('Discípulo no disponible para esta actividad.',404)
    }
    const resultId=await insert(connection,'asistencia',{id_actividad:activity.id_actividad,id_miembro:id,nombre_visitante:!id?text(req.body.nombre_visitante,150):null,
      id_usuario_registro:req.authUser.id,estado_asistencia:state,metodo_registro:method,
      origen_registro:'administracion',dispositivo_origen:text(req.get('user-agent')?.slice(0,150),150)})
    if(id) await recalculateAlerts(connection,id)
    return resultId
  })
  res.status(201).json({id:result})
})
async function modifyAttendance(req,res,archive=false) {
  const code=archive?'asistencia.eliminar':'asistencia.corregir'
  await transaction(async connection=>{
    const [rows]=await connection.execute('SELECT * FROM asistencia WHERE id_asistencia=? AND archivado=0',[identifier(req.params.id)])
    if(!rows.length) throw invalid('Registro no disponible.',404)
    const row=rows[0]
    await getActivity(req,row.id_actividad,code,connection)
    if(row.id_miembro) await connection.execute('SELECT id_miembro FROM miembro WHERE id_miembro=? FOR UPDATE',[row.id_miembro])
    const values=archive?{archivado:1}:{estado_asistencia:choice(req.body?.estado_asistencia,['presente','ausente','justificado','visitante'])}
    if(!archive && !row.id_miembro && values.estado_asistencia!=='visitante') throw invalid('Un visitante sin ficha debe conservar el estado visitante.')
    await update(connection,'asistencia','id_asistencia',row.id_asistencia,{...values,id_usuario_modificacion:req.authUser.id,fecha_modificacion:new Date()})
    if(row.id_miembro) await recalculateAlerts(connection,row.id_miembro)
  })
  res.json({ok:true})
}
managementRouter.patch('/attendance/:id',requirePermission('asistencia.corregir'),(req,res)=>modifyAttendance(req,res))
managementRouter.delete('/attendance/:id',requirePermission('asistencia.eliminar'),(req,res)=>modifyAttendance(req,res,true))
managementRouter.get('/alerts',requirePermission('alertas.ver'),async(req,res)=>{
  // Also catches future activities becoming past without a new attendance write.
  await transaction(async connection=>{
    const [members]=await connection.execute('SELECT DISTINCT id_miembro FROM asistencia WHERE id_miembro IS NOT NULL ORDER BY id_miembro')
    for(const row of members) { await connection.execute('SELECT id_miembro FROM miembro WHERE id_miembro=? FOR UPDATE',[row.id_miembro]); await recalculateAlerts(connection,row.id_miembro) }
  })
  const filter=memberFilter(req,'alertas.ver')
  const [items]=await pool.execute(`SELECT al.*,CONCAT_WS(' ',m.nombres,m.apellidos) AS nombre,ac.titulo FROM alerta_ausencia al
    JOIN miembro m ON m.id_miembro=al.id_miembro JOIN actividad ac ON ac.id_actividad=al.id_actividad
    WHERE al.vigente=1 AND m.archivado=0 ${filter.sql} ORDER BY al.fecha_creacion DESC`,filter.params)
  res.json({items})
})
managementRouter.get('/dashboard',async(req,res)=>{
  const widgets=[]
  if(can(req,'miembros.ver')) {
    const filter=memberFilter(req,'miembros.ver')
    const [counts]=await pool.execute(`SELECT COUNT(*) AS total,SUM(m.estado_miembro='activo') AS activos FROM miembro m WHERE m.archivado=0 ${filter.sql}`,filter.params)
    widgets.push({key:'miembros',label:'Discípulos',value:counts[0].total},{key:'activos',label:'Discípulos activos',value:Number(counts[0].activos || 0)})
  }
  if(can(req,'grupos.ver')) {
    const filter=groupFilter(req,'grupos.ver')
    const [counts]=await pool.execute(`SELECT COUNT(*) AS total FROM grupo_comunion g WHERE g.archivado=0 ${filter.sql}`,filter.params)
    widgets.push({key:'grupos',label:'Grupos registrados',value:counts[0].total})
  }
  if(can(req,'estadisticas.ver')) {
    const [counts]=await pool.execute('SELECT estado_asistencia,COUNT(*) AS total FROM asistencia WHERE archivado=0 GROUP BY estado_asistencia')
    for(const row of counts) widgets.push({key:row.estado_asistencia,label:`Asistencia: ${row.estado_asistencia}`,value:row.total})
  }
  if(can(req,'alertas.ver')) {
    const filter=memberFilter(req,'alertas.ver')
    const [counts]=await pool.execute(`SELECT COUNT(*) AS total FROM alerta_ausencia al JOIN miembro m ON m.id_miembro=al.id_miembro WHERE al.vigente=1 AND m.archivado=0 ${filter.sql}`,filter.params)
    widgets.push({key:'alertas',label:'alertas vigentes',value:counts[0].total})
  }
  if(can(req,'reportes.cumpleanos')) {
    const filter=memberFilter(req,'reportes.cumpleanos')
    const today=new Date(`${bogotaToday()}T12:00:00Z`)
    const days=Array.from({length:7},(_,index)=>new Date(today.getTime()+index*86400000).toISOString().slice(5,10))
    const [counts]=await pool.execute(`SELECT COUNT(*) AS total FROM miembro m WHERE m.archivado=0 AND DATE_FORMAT(m.fecha_nacimiento,'%m-%d') IN (${days.map(()=>'?').join(',')}) ${filter.sql}`,[...days,...filter.params])
    widgets.push({key:'cumpleanos',label:'cumpleaños en 7 días',value:counts[0].total})
  }
  const activityCodes=['asistencia.registrar','asistencia.ver','eventos.editar','eventos.publicar','grupos.editar'].filter(code=>can(req,code))
  if(activityCodes.length) {
    const accessCode=activityCodes.find(code=>req.authUser.permissions[code]==='todos') || activityCodes[0]
    const filter=activityFilter(req,accessCode)
    const [counts]=await pool.execute(`SELECT COUNT(*) AS total FROM actividad ac WHERE ac.archivado=0 AND ac.estado_actividad='programada' AND ac.fecha>=? ${filter.sql}`,[bogotaToday(),...filter.params])
    widgets.push({key:'eventos',label:'próximos encuentros',value:counts[0].total})
  }
  res.json({provisional:true,widgets})
})
managementRouter.get('/members/:id/consents',requirePermission('consentimientos.gestionar'),async(req,res)=>{
  const member=await getMember(req,req.params.id,'consentimientos.gestionar')
  const [items]=await pool.execute('SELECT * FROM consentimiento_datos WHERE id_miembro=? ORDER BY fecha_registro DESC',[member.id_miembro])
  res.json({items})
})
managementRouter.post('/members/:id/consents',requirePermission('consentimientos.gestionar'),async(req,res)=>{
  const member=await getMember(req,req.params.id,'consentimientos.gestionar')
  const body=req.body
  const state=choice(body.estado_consentimiento,['aceptado','revocado','pendiente'])
  const timestamp=value=>{
    if(!value)return null
    if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw invalid('Fecha de consentimiento inválida.')
    date(value.slice(0,10))
    return new Date(value)
  }
  const values={id_miembro:member.id_miembro,version_politica:text(body.version_politica,50,true),
    acepta_politica_privacidad:boolean(body.acepta_politica_privacidad),acepta_datos_religiosos:boolean(body.acepta_datos_religiosos),
    medio:choice(body.medio,['papel','digital']),estado_consentimiento:state,
    fecha_aceptacion:timestamp(body.fecha_aceptacion),fecha_revocacion:timestamp(body.fecha_revocacion)}
  if(state==='aceptado' && !values.fecha_aceptacion) throw invalid('Indica la fecha de aceptación.')
  if(state==='revocado' && !values.fecha_revocacion) throw invalid('Indica la fecha de revocación.')
  if(values.fecha_revocacion && values.fecha_aceptacion && values.fecha_revocacion<values.fecha_aceptacion) throw invalid('La revocación no puede preceder a la aceptación.')
  res.status(201).json({id:await insert(pool,'consentimiento_datos',values)})
})
managementRouter.post('/users/:id/member',requirePermission('usuarios.gestionar'),async(req,res)=>{
  const id=identifier(req.params.id), linkedId=identifier(req.body?.memberId,true)
  await transaction(async connection=>{
  const actor=await currentActor(req,connection)
  if(!hasPastoralAuthority(actor) || !hasPermission(actor,'usuarios.gestionar')) throw invalid('Solo los cinco cargos pastorales autorizados pueden vincular cuentas.',403)
  const [users]=await connection.execute('SELECT id_usuario FROM usuario WHERE id_usuario=?',[id])
  if(!users.length) throw invalid('Cuenta no disponible.',404)
  if(!actor.roles.includes('Superadmin')) {
    const [owners]=await connection.execute("SELECT ur.id_usuario FROM usuario_rol ur JOIN rol_sistema r ON r.id_rol=ur.id_rol WHERE ur.id_usuario=? AND ur.activo=1 AND r.nombre='Superadmin'",[id])
    if(owners.length) throw invalid('La cuenta del propietario técnico está protegida.',403)
  }
  if(linkedId) {
    const [members]=await connection.execute('SELECT id_miembro FROM miembro WHERE id_miembro=? AND archivado=0',[linkedId])
    if(!members.length) throw invalid('Discípulo no disponible.',404)
  }
  await update(connection,'usuario','id_usuario',id,{id_miembro:linkedId})
  })
  res.json({ok:true})
})
managementRouter.get('/permissions',requirePermission('permisos.gestionar'),async(_req,res)=>{
  const [roles]=await pool.execute('SELECT id_rol,nombre FROM rol_sistema WHERE estado=1 ORDER BY nombre')
  const [permissions]=await pool.execute("SELECT * FROM permiso WHERE codigo<>'sedes.gestionar' ORDER BY codigo")
  const [grants]=await pool.execute("SELECT * FROM rol_permiso WHERE codigo_permiso<>'sedes.gestionar'")
  res.json({roles,permissions:permissions.map(permission=>({...permission,descripcion:permission.descripcion.replace(/\bmiembro(s)?\b/gi,(word,plural)=>`${word[0]==='M'?'Discípulo':'discípulo'}${plural || ''}`),admite_grupo:groupScopedPermissions.has(permission.codigo)})),grants})
})
managementRouter.put('/permissions/:roleId',requirePermission('permisos.gestionar'),async(req,res)=>{
  const roleId=identifier(req.params.roleId), grants=req.body?.grants
  if(!Array.isArray(grants)||grants.length>100) throw invalid('Permisos inválidos.')
  await transaction(async connection=>{
    const [roles]=await connection.execute('SELECT nombre FROM rol_sistema WHERE id_rol=? FOR UPDATE',[roleId])
    if(!roles.length) throw invalid('Rol no disponible.',404)
    if(['Superadmin','Administrador','Pastor',...pastoralRoles.filter(role=>role.level<=4).map(role=>role.systemRole)].includes(roles[0].nombre)) throw invalid('Este rol conserva todos los permisos.',409)
    if(roles[0].nombre==='Usuario') throw invalid('Usuario no tiene acceso operativo. Asigna un rol autorizado.',409)
    await connection.execute('DELETE FROM rol_permiso WHERE id_rol=?',[roleId])
    for(const grant of grants) {
      const code=text(grant.codigo,80,true),scope=choice(grant.alcance,['todos','grupo'])
      if(code==='sedes.gestionar') throw invalid('La plataforma utiliza una sola sede y una sola zona.')
      if(scope==='grupo' && !groupScopedPermissions.has(code)) throw invalid(`El permiso ${code} requiere alcance general.`)
      if(roles[0].nombre==='Discipulador' && !(code==='adiestramiento.gestionar' && scope==='todos') && (scope!=='grupo' || !groupScopedPermissions.has(code))) throw invalid('El Discipulador debe conservar el alcance de sus grupos.')
      await insert(connection,'rol_permiso',{id_rol:roleId,codigo_permiso:code,alcance:scope})
    }
  })
  res.json({ok:true})
})
managementRouter.get('/reports/:type',async(req,res)=>{
  const type=choice(req.params.type,['asistencia','cumpleanos','grupos','discipulos'])
  const code=`reportes.${type}`
  if(!can(req,code)) throw invalid('No tienes permiso para este reporte.',403)
  const format=choice(req.query.format,['pdf','xlsx'])
  if(type==='discipulos') {
    if(format!=='xlsx') throw invalid('La ficha completa de discípulos se descarga en Excel.')
    return exportDisciples(req,res)
  }
  let rows
  if(type==='cumpleanos') {
    const filter=memberFilter(req,code)
    ;[rows]=await pool.execute(`SELECT CONCAT_WS(' ',m.nombres,m.apellidos) AS Nombre,DATE_FORMAT(m.fecha_nacimiento,'%m-%d') AS Cumpleanos FROM miembro m WHERE m.archivado=0 ${filter.sql} ORDER BY MONTH(m.fecha_nacimiento),DAY(m.fecha_nacimiento),m.nombres`,filter.params)
  } else if(type==='grupos') {
    const filter=groupFilter(req,code)
    ;[rows]=await pool.execute(`SELECT g.codigo_grupo AS Codigo,g.nombre AS Grupo,g.direccion AS Direccion,g.barrio AS Barrio,g.dia_reunion AS Dia,g.hora_reunion AS Hora,g.estado_grupo AS Estado FROM grupo_comunion g WHERE g.archivado=0 ${filter.sql} ORDER BY g.nombre`,filter.params)
  } else {
    const filter=activityFilter(req,code)
    const clauses=[],params=[...filter.params]
    if(req.query.from){clauses.push('ac.fecha>=?');params.push(date(req.query.from))}
    if(req.query.to){clauses.push('ac.fecha<=?');params.push(date(req.query.to))}
    // Multimedia receives operational attendance, with no personal names in exports.
    const name=can(req,'miembros.ver')?"COALESCE(CONCAT_WS(' ',m.nombres,m.apellidos),a.nombre_visitante)":"CAST(a.id_miembro AS CHAR)"
    ;[rows]=await pool.execute(`SELECT ac.titulo AS Actividad,CAST(ac.fecha AS CHAR) AS Fecha,ac.tipo_actividad AS Tipo,${name} AS Discípulo,a.estado_asistencia AS Estado,a.metodo_registro AS Metodo
      FROM asistencia a JOIN actividad ac ON ac.id_actividad=a.id_actividad LEFT JOIN miembro m ON m.id_miembro=a.id_miembro
      WHERE a.archivado=0 AND ac.archivado=0 ${filter.sql} ${clauses.length?'AND '+clauses.join(' AND '):''} ORDER BY ac.fecha,ac.hora,a.id_asistencia`,params)
  }
  await sendReport(res,type,format,rows)
})
export function managementError(error,_req,res,_next) {
  if(res.headersSent) return res.end()
  if(error.status) return res.status(error.status).json({error:error.message})
  if(error.code==='ER_DUP_ENTRY') return res.status(409).json({error:'El registro ya existe. Para asistencia, utiliza la corrección autorizada.'})
  if(error.code?.startsWith('ER_NO_REFERENCED')) return res.status(400).json({error:'Una de las referencias seleccionadas no existe.'})
  console.error('Error de gestión:',error.code || 'MANAGEMENT_ERROR')
  res.status(503).json({error:'No pudimos completar la operación. Inténtalo nuevamente.'})
}
managementRouter.use(managementError)
publicRouter.use(managementError)
