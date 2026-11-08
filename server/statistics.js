import { Router } from 'express'
import { pool } from './db.js'
import { requirePermission, hasPermission } from './auth.js'
import { bogotaToday, choice, identifier, invalid } from './entities.js'
import { addDays, boundedRange, daysBetween, periodBuckets } from './date-ranges.js'

const tally=rows=>{
  const counts={presente:0,ausente:0,justificado:0,visitante:0}
  for(const row of rows)counts[row.estado_asistencia]=Number(row.total)
  const denominator=counts.presente+counts.ausente
  return {...counts,total:Object.values(counts).reduce((a,b)=>a+b,0),percentage:denominator?Math.round(counts.presente/denominator*1000)/10:null}
}

export function statisticsRouter({activityFilter,memberFilter,groupFilter,getGroup}) {
  const router=Router()
  router.get('/statistics',requirePermission('estadisticas.ver'),async(req,res)=>{
    const today=bogotaToday()
    const {from,to}=boundedRange(req.query.from || addDays(today,-89),req.query.to || today)
    if(to>today)throw invalid('Las estadísticas incluyen únicamente fechas realizadas, hasta hoy.')
    const interval=choice(req.query.interval || 'week',['week','month'])
    const groupId=identifier(req.query.groupId,true)
    const type=req.query.type?choice(req.query.type,['culto','evento','reunion_grupo']):null
    const scopedCodes=['estadisticas.ver','asistencia.ver'].filter(code=>req.authUser.permissions[code]==='grupo')
    const scopes=scopedCodes.map(code=>activityFilter(req,code))
    const groupCode=['estadisticas.ver','grupos.ver'].find(code=>req.authUser.permissions[code]==='grupo') || 'estadisticas.ver'
    if(groupId)await getGroup(req,groupId,groupCode)
    const clauses=scopes.map(scope=>scope.sql).join('')+(type?' AND ac.tipo_actividad=?':'')+(groupId?' AND m.id_grupo=?':'')
    const parameters=[...scopes.flatMap(scope=>scope.params),...(type?[type]:[]),...(groupId?[groupId]:[])]
    const joins=`FROM asistencia a JOIN actividad ac ON ac.id_actividad=a.id_actividad LEFT JOIN miembro m ON m.id_miembro=a.id_miembro
      WHERE a.archivado=0 AND ac.archivado=0 AND ac.estado_actividad<>'cancelada' AND TIMESTAMP(ac.fecha,ac.hora)<=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 HOUR)
      AND ac.fecha BETWEEN ? AND ? ${clauses}`
    const count=async(start,end)=>(await pool.execute(`SELECT a.estado_asistencia,COUNT(*) AS total ${joins} GROUP BY a.estado_asistencia`,[start,end,...parameters]))[0]
    const previousTo=addDays(from,-1),previousFrom=addDays(from,-(daysBetween(from,to)+1))
    const expression=interval==='month'?"DATE_FORMAT(ac.fecha,'%Y-%m-01')":"DATE_FORMAT(DATE_SUB(ac.fecha,INTERVAL WEEKDAY(ac.fecha) DAY),'%Y-%m-%d')"
    const summary=tally(await count(from,to)),previous=tally(await count(previousFrom,previousTo))
    const [periods]=await pool.execute(`SELECT ${expression} AS period,a.estado_asistencia,COUNT(*) AS total ${joins} GROUP BY period,a.estado_asistencia ORDER BY period`,[from,to,...parameters])
    const [groups]=await pool.execute(`SELECT COALESCE(m.id_grupo,0) AS id_grupo,COALESCE((SELECT g.nombre FROM grupo_comunion g WHERE g.id_grupo=m.id_grupo),'Sin grupo / visitantes') AS nombre,
      SUM(a.estado_asistencia='presente') AS presente,SUM(a.estado_asistencia='ausente') AS ausente,SUM(a.estado_asistencia='justificado') AS justificado,SUM(a.estado_asistencia='visitante') AS visitante
      ${joins} GROUP BY m.id_grupo ORDER BY presente DESC,nombre`,[from,to,...parameters])
    const series=periodBuckets(from,to,interval).map(bucket=>({...bucket,...tally(periods.filter(row=>row.period===bucket.date)),active:null,newMembers:null}))
    let baseline=null
    if(hasPermission(req.authUser,'miembros.ver')) {
      const scope=memberFilter(req,req.authUser.permissions['estadisticas.ver']==='grupo'?'estadisticas.ver':'miembros.ver')
      const [migrations]=await pool.execute("SELECT DATE_FORMAT(DATE_SUB(fecha_aplicacion,INTERVAL 5 HOUR),'%Y-%m-%d') AS baseline FROM migracion_aplicada WHERE nombre='020-pastoral-followup.sql'")
      baseline=migrations[0]?.baseline || today
      const memberClause=scope.sql+(groupId?' AND m.id_grupo=?':'')
      const memberParameters=[...scope.params,...(groupId?[groupId]:[])]
      for(const bucket of series) {
        const [created]=await pool.execute(`SELECT COUNT(*) AS total FROM miembro m WHERE DATE(DATE_SUB(m.fecha_creacion,INTERVAL 5 HOUR)) BETWEEN ? AND ? ${memberClause}`,[bucket.from,bucket.to,...memberParameters])
        bucket.newMembers=Number(created[0].total)
        if(bucket.to>=baseline) {
          const [active]=await pool.execute(`SELECT COUNT(*) AS total FROM miembro m WHERE (SELECT h.estado FROM historial_estado_miembro h WHERE h.id_miembro=m.id_miembro AND h.fecha<=? ORDER BY h.fecha DESC,h.id_cambio DESC LIMIT 1)='activo' ${memberClause}`,[new Date(`${bucket.to}T23:59:59-05:00`),...memberParameters])
          bucket.active=Number(active[0].total)
        }
      }
    }
    const groupScope=groupFilter(req,groupCode)
    const [options]=await pool.execute(`SELECT g.id_grupo,g.nombre FROM grupo_comunion g WHERE g.archivado=0 ${groupScope.sql} ORDER BY g.nombre`,groupScope.params)
    res.json({from,to,interval,summary,previous:{from:previousFrom,to:previousTo,...previous},series,groups:groups.map(row=>({...row,presente:Number(row.presente),ausente:Number(row.ausente),justificado:Number(row.justificado),visitante:Number(row.visitante)})),groupOptions:options,baseline,
      methodology:'Porcentaje: presentes ÷ (presentes + ausentes). Justificaciones y visitantes se muestran por separado. Solo se cuentan asistencias registradas de actividades realizadas y no canceladas. Los grupos corresponden a la vinculación actual del discípulo.'})
  })
  return router
}
