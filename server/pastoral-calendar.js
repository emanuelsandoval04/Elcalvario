import { Router } from 'express'
import { pool } from './db.js'
import { hasPermission, requirePermission } from './auth.js'
import { invalid, identifier, text, choice, date, bogotaToday } from './entities.js'
import { refreshAlerts } from './alerts.js'
import { calendarRange } from './date-ranges.js'
import { ensureRecurringActivities, recurrenceColumns, recurrenceJoins } from './recurring-activities.js'

export function publicCalendar(router) {
  router.get('/calendar',async(req,res)=>{
    const {from,to}=calendarRange(req.query)
    await ensureRecurringActivities(bogotaToday(),to)
    const [items]=await pool.execute(`SELECT ac.id_actividad,ac.tipo_actividad,ac.titulo,CAST(ac.fecha AS CHAR) AS fecha,ac.hora,ac.lugar,ac.descripcion,
      ac.imagen,ac.estado_actividad,e.requiere_inscripcion,e.url_inscripcion,${recurrenceColumns}
      FROM actividad ac LEFT JOIN evento e ON e.id_actividad=ac.id_actividad ${recurrenceJoins}
      WHERE ac.archivado=0 AND ac.publicado=1 AND ac.tipo_actividad IN ('culto','evento') AND ac.fecha BETWEEN ? AND ? ORDER BY ac.fecha,ac.hora,ac.id_actividad LIMIT 2001`,[from,to])
    if(items.length>2000)throw invalid('Reduce el intervalo del calendario para consultar todos los encuentros.')
    res.json({items})
  })
}

export function pastoralCalendarRouter({transaction,currentActor,memberFilter,activityFilter,getMember}) {
  const router=Router()
  async function alert(req,id,connection=pool) {
    const scope=memberFilter(req,'alertas.ver')
    const [items]=await connection.execute(`SELECT al.*,m.id_grupo,m.id_usuario_creacion FROM alerta_ausencia al JOIN miembro m ON m.id_miembro=al.id_miembro
      WHERE al.id_alerta=? AND m.archivado=0 ${scope.sql}`,[identifier(id),...scope.params])
    if(!items.length)throw invalid('Caso no disponible en tu alcance.',404)
    return items[0]
  }
  async function responsibles(row,connection=pool) {
    const [items]=await connection.execute(`SELECT DISTINCT u.id_usuario AS id,COALESCE(p.nombre,u.correo_login) AS nombre FROM usuario u
      LEFT JOIN perfil_usuario p ON p.id_usuario=u.id_usuario
      JOIN usuario_rol ur ON ur.id_usuario=u.id_usuario AND ur.activo=1 JOIN rol_sistema r ON r.id_rol=ur.id_rol AND r.estado=1
      JOIN rol_permiso rp ON rp.id_rol=r.id_rol AND rp.codigo_permiso='seguimiento.gestionar'
      WHERE u.estado_usuario='activo' AND (rp.alcance='todos' OR EXISTS(SELECT 1 FROM grupo_comunion g WHERE g.id_grupo=? AND g.id_discipulador=u.id_miembro AND g.archivado=0) OR (? IS NULL AND u.id_usuario=?))
      AND EXISTS(SELECT 1 FROM usuario_rol gu JOIN rol_sistema gr ON gr.id_rol=gu.id_rol AND gr.estado=1 JOIN rol_permiso gp ON gp.id_rol=gr.id_rol AND gp.codigo_permiso='gestion.acceder' WHERE gu.id_usuario=u.id_usuario AND gu.activo=1)
      AND EXISTS(SELECT 1 FROM usuario_rol vu JOIN rol_sistema vr ON vr.id_rol=vu.id_rol AND vr.estado=1 JOIN rol_permiso vp ON vp.id_rol=vr.id_rol AND vp.codigo_permiso='alertas.ver' WHERE vu.id_usuario=u.id_usuario AND vu.activo=1 AND (vp.alcance='todos' OR EXISTS(SELECT 1 FROM grupo_comunion vg WHERE vg.id_grupo=? AND vg.id_discipulador=u.id_miembro AND vg.archivado=0) OR (? IS NULL AND u.id_usuario=?)))
      ORDER BY nombre,u.id_usuario`,[row.id_grupo,row.id_grupo,row.id_usuario_creacion,row.id_grupo,row.id_grupo,row.id_usuario_creacion])
    return items
  }
  router.get('/activities/calendar',async(req,res)=>{
    const codes=['eventos.editar','eventos.publicar','grupos.editar','asistencia.registrar','asistencia.ver'].filter(code=>hasPermission(req.authUser,code))
    if(!codes.length)throw invalid('No tienes permiso para consultar actividades.',403)
    const scope=activityFilter(req,codes.find(code=>req.authUser.permissions[code]==='todos') || codes[0])
    const {from,to}=calendarRange(req.query)
    await ensureRecurringActivities(bogotaToday(),to)
    const [items]=await pool.execute(`SELECT ac.*,CAST(ac.fecha AS CHAR) AS fecha,rg.id_grupo,e.requiere_inscripcion,e.url_inscripcion,${recurrenceColumns}
      FROM actividad ac LEFT JOIN reunion_grupo rg ON rg.id_actividad=ac.id_actividad LEFT JOIN evento e ON e.id_actividad=ac.id_actividad ${recurrenceJoins}
      WHERE ac.archivado=0 AND ac.fecha BETWEEN ? AND ? ${scope.sql} ORDER BY ac.fecha,ac.hora,ac.id_actividad LIMIT 2001`,[from,to,...scope.params])
    if(items.length>2000)throw invalid('Reduce el intervalo para consultar todos los encuentros.')
    res.json({items})
  })
  router.use('/pastoral',requirePermission('alertas.ver'))
  router.get('/pastoral/cases',async(req,res)=>{
    await transaction(async connection=>{
      const scope=memberFilter(req,'alertas.ver')
      const [members]=await connection.execute(`SELECT DISTINCT m.id_miembro FROM miembro m JOIN asistencia a ON a.id_miembro=m.id_miembro WHERE m.archivado=0 ${scope.sql} ORDER BY m.id_miembro`,scope.params)
      await refreshAlerts(connection,members.map(row=>row.id_miembro))
    })
    const scope=memberFilter(req,'alertas.ver')
    const state=req.query.state ? choice(req.query.state,['pendiente','en_seguimiento','atendido']) : null
    const page=identifier(req.query.page||1),search=text(req.query.q,120)||''
    if(page>10000)throw invalid('Selecciona una página válida.')
    const [items]=await pool.execute(`SELECT al.id_alerta,al.id_miembro,m.codigo_miembro,al.vigente,CONCAT_WS(' ',m.nombres,m.apellidos) AS nombre,m.celular,
      ac.titulo,CAST(ac.fecha AS CHAR) AS fecha_actividad,g.nombre AS grupo,
      COALESCE(s.estado,'pendiente') AS estado,s.id_responsable,COALESCE(s.revision,0) AS revision,CAST(s.proximo_contacto AS CHAR) AS proximo_contacto,
      COALESCE(p.nombre,u.correo_login) AS responsable,(SELECT COUNT(*) FROM nota_seguimiento n WHERE n.id_alerta=al.id_alerta) AS contactos
      FROM alerta_ausencia al JOIN miembro m ON m.id_miembro=al.id_miembro JOIN actividad ac ON ac.id_actividad=al.id_actividad
      LEFT JOIN grupo_comunion g ON g.id_grupo=m.id_grupo LEFT JOIN seguimiento_pastoral s ON s.id_alerta=al.id_alerta
      LEFT JOIN usuario u ON u.id_usuario=s.id_responsable LEFT JOIN perfil_usuario p ON p.id_usuario=u.id_usuario
      WHERE m.archivado=0 AND (al.vigente=1 OR s.id_alerta IS NOT NULL) ${scope.sql} ${state?"AND COALESCE(s.estado,'pendiente')=?":''}
      AND CONCAT_WS(' ',m.nombres,m.apellidos,g.nombre,p.nombre,u.correo_login) LIKE ?
      ORDER BY COALESCE(s.estado,'pendiente')='atendido',s.proximo_contacto IS NULL,s.proximo_contacto,al.id_alerta DESC LIMIT 101 OFFSET ${(page-1)*100}`,[...scope.params,...(state?[state]:[]),`%${search}%`])
    res.json({items:items.slice(0,100),hasMore:items.length>100,page})
  })
  router.get('/pastoral/cases/:id',async(req,res)=>{
    const row=await alert(req,req.params.id)
    const before=identifier(req.query.before,true)
    const [notes]=await pool.execute(`SELECT n.id_nota,n.tipo,n.detalle,n.fecha_contacto,n.fecha_registro,COALESCE(p.nombre,u.correo_login,'Cuenta eliminada') AS autor
      FROM nota_seguimiento n LEFT JOIN usuario u ON u.id_usuario=n.id_usuario LEFT JOIN perfil_usuario p ON p.id_usuario=n.id_usuario WHERE n.id_alerta=? ${before?'AND n.id_nota<?':''} ORDER BY n.id_nota DESC LIMIT 101`,[row.id_alerta,...(before?[before]:[])])
    const [current]=await pool.execute('SELECT estado,id_responsable,CAST(proximo_contacto AS CHAR) AS proximo_contacto,revision FROM seguimiento_pastoral WHERE id_alerta=?',[row.id_alerta])
    let canManage=hasPermission(req.authUser,'seguimiento.gestionar')
    if(canManage)try{await getMember(req,row.id_miembro,'seguimiento.gestionar')}catch(error){if(error.status===404)canManage=false;else throw error}
    res.json({notes:notes.slice(0,100),nextBefore:notes.length>100?notes[99].id_nota:null,canManage,responsibles:canManage?await responsibles(row):[],case:current[0] || {estado:'pendiente',id_responsable:null,proximo_contacto:null,revision:0}})
  })
  router.patch('/pastoral/cases/:id',requirePermission('seguimiento.gestionar'),async(req,res)=>{
    const state=choice(req.body?.estado,['pendiente','en_seguimiento','atendido'])
    const responsible=identifier(req.body.id_responsable,true)
    const next=req.body.proximo_contacto ? date(req.body.proximo_contacto) : null
    const revision=req.body.revision
    if(!Number.isSafeInteger(revision)||revision<0)throw invalid('Actualiza el caso antes de guardar.')
    const note=req.body.note
    let noteValues=null
    if(note) {
      const type=choice(note.tipo,['llamada','visita','mensaje','nota']),detail=text(note.detalle,2000,true)
      if(typeof note.fecha!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(note.fecha))throw invalid('Indica la fecha y hora de Colombia del contacto.')
      date(note.fecha.slice(0,10))
      if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(note.fecha.slice(11)))throw invalid('Hora del contacto inválida.')
      const when=new Date(`${note.fecha}:00-05:00`)
      if(when.getTime()>Date.now()+300000)throw invalid('Registra contactos realizados; usa próxima fecha para planificar uno futuro.')
      noteValues=[type,detail,when]
    }
    await transaction(async connection=>{
      const actor=await currentActor(req,connection)
      if(!hasPermission(actor,'alertas.ver')||!hasPermission(actor,'seguimiento.gestionar'))throw invalid('Ya no tienes permiso para gestionar el seguimiento.',403)
      const row=await alert(req,req.params.id,connection)
      await getMember(req,row.id_miembro,'alertas.ver',connection,true)
      await getMember(req,row.id_miembro,'seguimiento.gestionar',connection)
      const [existing]=await connection.execute('SELECT revision FROM seguimiento_pastoral WHERE id_alerta=? FOR UPDATE',[row.id_alerta])
      if((existing[0]?.revision||0)!==revision)throw invalid('Otra persona actualizó este caso. Recarga el historial antes de guardar.',409)
      if(responsible && !(await responsibles(row,connection)).some(item=>item.id===responsible))throw invalid('El responsable debe tener acceso vigente a este discípulo.')
      const [count]=await connection.execute('SELECT COUNT(*) AS total FROM nota_seguimiento WHERE id_alerta=?',[row.id_alerta])
      if(state==='atendido'&&!count[0].total&&!noteValues)throw invalid('Registra una nota de atención antes de marcar el caso como atendido.')
      await connection.execute(`INSERT INTO seguimiento_pastoral(id_alerta,id_responsable,estado,proximo_contacto,id_usuario_actualizacion) VALUES (?,?,?,?,?)
        ON DUPLICATE KEY UPDATE id_responsable=VALUES(id_responsable),estado=VALUES(estado),proximo_contacto=VALUES(proximo_contacto),revision=revision+1,id_usuario_actualizacion=VALUES(id_usuario_actualizacion),fecha_actualizacion=UTC_TIMESTAMP()`,[row.id_alerta,responsible,state,state==='atendido'?null:next,actor.id])
      if(noteValues)await connection.execute('INSERT INTO nota_seguimiento(id_alerta,id_usuario,tipo,detalle,fecha_contacto) VALUES (?,?,?,?,?)',[row.id_alerta,actor.id,...noteValues])
    })
    res.json({ok:true})
  })
  return router
}
