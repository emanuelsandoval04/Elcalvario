import { Router } from 'express'
import { createHash } from 'node:crypto'
import { pool } from './db.js'
import { hasPermission, requirePermission } from './auth.js'
import { invalid, identifier, choice, text } from './entities.js'
import { refreshAlerts } from './alerts.js'

export async function attendanceRoster(connection,activity) {
  const [items]=await connection.execute(`SELECT m.id_miembro,m.codigo_miembro,CONCAT_WS(' ',m.nombres,m.apellidos) AS nombre,
    EXISTS(SELECT 1 FROM asistencia saved WHERE saved.id_actividad=? AND saved.id_miembro=m.id_miembro AND saved.archivado=0) AS registrado FROM miembro m
    WHERE m.archivado=0 AND m.estado_miembro='activo' ${activity.id_grupo?'AND m.id_grupo=?':''}
    AND NOT EXISTS(SELECT 1 FROM asistencia a WHERE a.id_actividad=? AND a.id_miembro=m.id_miembro AND a.archivado=1)
    ORDER BY m.id_miembro`,[activity.id_actividad,...(activity.id_grupo?[activity.id_grupo]:[]),activity.id_actividad])
  const version=createHash('sha256').update(JSON.stringify([activity.id_actividad,activity.fecha,activity.hora,activity.id_grupo,items.map(item=>item.id_miembro)])).digest('hex')
  return {items,version,activity}
}

export function attendanceToolsRouter({transaction,currentActor,getActivity,getMember,activityFilter}) {
  const router=Router()
  router.post('/attendance/save',requirePermission('asistencia.registrar'),async(req,res)=>{
    const activityId=identifier(req.body?.activityId),states=req.body?.states
    if(!states || typeof states!=='object' || Array.isArray(states) || Object.keys(states).length>2000)throw invalid('Las selecciones de asistencia no son válidas.')
    const requested=new Map(Object.entries(states).map(([id,state])=>[identifier(id),choice(state,['presente','ausente','justificado'])]))
    const result=await transaction(async connection=>{
      await currentActor(req,connection)
      if(!hasPermission(req.authUser,'asistencia.registrar'))throw invalid('Ya no tienes permiso para registrar asistencia.',403)
      const activity=await getActivity(req,activityId,'asistencia.registrar',connection)
      await connection.execute('SELECT id_actividad FROM actividad WHERE id_actividad=? FOR UPDATE',[activityId])
      if(activity.estado_actividad==='cancelada')throw invalid('No se registra asistencia en una actividad cancelada.',409)
      // Any date is allowed (late records of past events, or early ones). Absence alerts only count
      // events that already happened, so an early save does not raise alerts before the date.
      const roster=await attendanceRoster(connection,activity)
      if(req.body.rosterVersion!==roster.version)throw invalid('El listado de discípulos cambió. Revisa el listado actualizado antes de guardar.',409)
      if(!roster.items.length)throw invalid('No hay discípulos activos en este listado.')
      if(roster.items.length>2000)throw invalid('Este listado supera 2000 discípulos. Utiliza el registro individual.')
      const eligible=new Set(roster.items.map(item=>item.id_miembro))
      if([...requested.keys()].some(id=>!eligible.has(id)))throw invalid('Una selección no pertenece al listado disponible.',404)
      const [existing]=await connection.execute('SELECT id_miembro,estado_asistencia FROM asistencia WHERE id_actividad=? AND archivado=0 AND id_miembro IS NOT NULL FOR UPDATE',[activityId])
      const saved=new Map(existing.map(item=>[item.id_miembro,item.estado_asistencia]))
      for(const [id,state] of requested)if(saved.has(id) && saved.get(id)!==state)throw invalid('Otra persona ya guardó un registro. Para modificarlo utiliza la corrección autorizada.',409)
      const missing=roster.items.filter(item=>!saved.has(item.id_miembro))
      const rows=missing.map(item=>[activityId,item.id_miembro,req.authUser.id,requested.get(item.id_miembro) || 'ausente','manual','administracion',text(req.get('user-agent')?.slice(0,150),150)])
      if(rows.length) {
        await connection.query('INSERT INTO asistencia(id_actividad,id_miembro,id_usuario_registro,estado_asistencia,metodo_registro,origen_registro,dispositivo_origen) VALUES ?',[rows])
        await refreshAlerts(connection,missing.map(item=>item.id_miembro))
      }
      return {created:rows.length,absent:rows.filter(row=>row[3]==='ausente').length,present:rows.filter(row=>row[3]==='presente').length,justified:rows.filter(row=>row[3]==='justificado').length}
    })
    res.status(201).json(result)
  })
  router.get('/members/:id/attendance',requirePermission('miembros.ver'),requirePermission('asistencia.ver'),async(req,res)=>{
    const member=await getMember(req,req.params.id,'miembros.ver')
    const page=identifier(req.query.page || 1)
    if(page>10000)throw invalid('Selecciona una página válida.')
    const scope=activityFilter(req,'asistencia.ver')
    const [items]=await pool.execute(`SELECT a.id_asistencia,a.id_actividad,a.estado_asistencia,a.metodo_registro,
      ac.titulo,CAST(ac.fecha AS CHAR) AS fecha,ac.hora,ac.tipo_actividad,ac.estado_actividad,ac.archivado AS actividad_archivada
      FROM asistencia a JOIN actividad ac ON ac.id_actividad=a.id_actividad
      WHERE a.id_miembro=? AND a.archivado=0 ${scope.sql}
      ORDER BY ac.fecha DESC,ac.hora DESC,a.id_asistencia DESC LIMIT 26 OFFSET ${(page-1)*25}`,[member.id_miembro,...scope.params])
    res.json({items:items.slice(0,25),hasMore:items.length>25,page})
  })
  return router
}
