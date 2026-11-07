import { pool } from './db.js'
import { bogotaToday } from './entities.js'
import { recurrenceHorizon, weeklyDates } from './recurrence-dates.js'

export const recurrenceColumns = "ar.id_serie,s.dia_semana,CAST(s.fecha_inicio AS CHAR) AS repeticion_inicio,CAST(s.fecha_fin AS CHAR) AS repeticion_fin,s.activa AS repeticion_activa,JSON_UNQUOTE(JSON_EXTRACT(s.plantilla,'$.activity.hora')) AS repeticion_hora,CAST(ar.fecha_programada AS CHAR) AS fecha_programada"
export const recurrenceJoins = 'LEFT JOIN actividad_repetida ar ON ar.id_actividad=ac.id_actividad LEFT JOIN serie_actividad s ON s.id_serie=ar.id_serie'

// One nearest public date per series. Other dates keep independent attendance IDs.
export const nearestPublicDate = `AND (ar.id_serie IS NULL OR (TIMESTAMP(ac.fecha,ac.hora)>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 HOUR) AND NOT EXISTS (
  SELECT 1 FROM actividad_repetida prior JOIN actividad pa ON pa.id_actividad=prior.id_actividad
  WHERE prior.id_serie=ar.id_serie AND pa.archivado=0 AND pa.publicado=1
    AND TIMESTAMP(pa.fecha,pa.hora)>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 HOUR)
    AND (pa.fecha<ac.fecha OR (pa.fecha=ac.fecha AND (pa.hora<ac.hora OR (pa.hora=ac.hora AND pa.id_actividad<ac.id_actividad))))
)))`

export function seriesTemplate(type, values, eventValues) {
  const { fecha: ignored, ...activity } = values
  return { activity: { ...activity, tipo_actividad: type }, event: eventValues || null }
}

async function generateDates(connection, series, today) {
  const from = series.fecha_inicio > today ? series.fecha_inicio : today
  const through = recurrenceHorizon(from)
  if (series.generada_hasta && series.generada_hasta >= through) return []
  const template = typeof series.plantilla === 'string' ? JSON.parse(series.plantilla) : series.plantilla
  const dates = weeklyDates(series.fecha_inicio, Number(series.dia_semana), series.fecha_fin, from, through)
  const [existing] = await connection.execute('SELECT CAST(fecha_programada AS CHAR) AS fecha FROM actividad_repetida WHERE id_serie=? AND fecha_programada>=? AND fecha_programada<=?', [series.id_serie, from, through])
  const known = new Set(existing.map(row => row.fecha))
  const generated = []
  for (const fecha of dates) {
    if (known.has(fecha)) continue
    const [activity] = await connection.query('INSERT INTO actividad SET ?', { ...template.activity, fecha, id_usuario_creacion: series.id_usuario_creacion })
    const id = activity.insertId
    if (template.activity.tipo_actividad === 'evento') await connection.query('INSERT INTO evento SET ?', { id_actividad: id, ...template.event })
    else await connection.execute('INSERT INTO culto(id_actividad) VALUES (?)', [id])
    await connection.execute('INSERT INTO actividad_repetida(id_actividad,id_serie,fecha_programada) VALUES (?,?,?)', [id, series.id_serie, fecha])
    generated.push(id)
  }
  await connection.execute('UPDATE serie_actividad SET generada_hasta=? WHERE id_serie=?', [through, series.id_serie])
  return generated
}

export async function createRecurringActivity(connection, rule, template, actorId, today = bogotaToday(), existingId = null) {
  const [result] = await connection.execute('INSERT INTO serie_actividad(dia_semana,fecha_inicio,fecha_fin,plantilla,id_usuario_creacion) VALUES (?,?,?,?,?)', [rule.dayOfWeek, rule.start, rule.until, JSON.stringify(template), actorId])
  if(existingId) {
    const from=rule.start>today ? rule.start : today
    const first=weeklyDates(rule.start,rule.dayOfWeek,rule.until,from,recurrenceHorizon(from))[0]
    await connection.query('UPDATE actividad SET ? WHERE id_actividad=?',[{...template.activity,fecha:first,fecha_actualizacion:new Date()},existingId])
    if(template.event) await connection.query('UPDATE evento SET ? WHERE id_actividad=?',[template.event,existingId])
    await connection.execute('INSERT INTO actividad_repetida(id_actividad,id_serie,fecha_programada) VALUES (?,?,?)',[existingId,result.insertId,first])
  }
  const generated = await generateDates(connection, { id_serie: result.insertId, dia_semana: rule.dayOfWeek, fecha_inicio: rule.start, fecha_fin: rule.until, plantilla: template, id_usuario_creacion: actorId }, today)
  return { id: existingId || generated[0], seriesId: result.insertId, occurrences: generated.length+(existingId ? 1 : 0) }
}

// Keep attendance-bearing records accessible, including any entered in advance.
export async function retireFutureDates(connection, seriesId, detach = false) {
  const [targets] = await connection.execute(`SELECT ac.id_actividad,EXISTS(SELECT 1 FROM asistencia a WHERE a.id_actividad=ac.id_actividad) AS has_attendance
    FROM actividad ac JOIN actividad_repetida ar ON ar.id_actividad=ac.id_actividad
    WHERE ar.id_serie=? AND TIMESTAMP(ac.fecha,ac.hora)>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 HOUR) ORDER BY ac.id_actividad FOR UPDATE`, [seriesId])
  for (const row of targets) {
    await connection.execute("UPDATE actividad SET archivado=?,publicado=0,estado_actividad='cancelada',fecha_actualizacion=UTC_TIMESTAMP() WHERE id_actividad=?", [row.has_attendance ? 0 : 1, row.id_actividad])
    if (detach) await connection.execute('DELETE FROM actividad_repetida WHERE id_actividad=?', [row.id_actividad])
  }
}

export async function reviseFixedActivity(connection, series, rule, template) {
  const previous = typeof series.plantilla === 'string' ? JSON.parse(series.plantilla) : series.plantilla
  const rebuild = Number(series.dia_semana) !== rule.dayOfWeek || String(previous.activity.hora).slice(0,5) !== String(template.activity.hora).slice(0,5) || !series.activa
  if (rebuild) await retireFutureDates(connection, series.id_serie, true)
  else {
    const [targets] = await connection.execute(`SELECT ac.id_actividad FROM actividad ac JOIN actividad_repetida ar ON ar.id_actividad=ac.id_actividad
      WHERE ar.id_serie=? AND ac.archivado=0 AND TIMESTAMP(ac.fecha,ac.hora)>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 HOUR) ORDER BY ac.id_actividad FOR UPDATE`, [series.id_serie])
    for (const row of targets) {
      await connection.query('UPDATE actividad SET ? WHERE id_actividad=?', [{ ...template.activity, fecha_actualizacion: new Date() }, row.id_actividad])
      if (template.event) await connection.query('UPDATE evento SET ? WHERE id_actividad=?', [template.event, row.id_actividad])
    }
  }
  await connection.execute('UPDATE serie_actividad SET dia_semana=?,fecha_inicio=?,fecha_fin=NULL,plantilla=?,activa=1,generada_hasta=NULL,fecha_actualizacion=UTC_TIMESTAMP() WHERE id_serie=?', [rule.dayOfWeek, rule.start, JSON.stringify(template), series.id_serie])
  const generated = await generateDates(connection, { ...series, dia_semana: rule.dayOfWeek, fecha_inicio: rule.start, fecha_fin: null, generada_hasta: null, plantilla: template }, bogotaToday())
  return { seriesId: series.id_serie, occurrences: generated.length }
}

export async function ensureRecurringActivities(today = bogotaToday()) {
  const [series] = await pool.execute(`SELECT id_serie FROM serie_actividad WHERE activa=1
    AND (fecha_fin IS NULL OR fecha_fin>=?) AND (generada_hasta IS NULL OR generada_hasta<?) ORDER BY id_serie`, [today, recurrenceHorizon(today)])
  for (const row of series) {
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      const [locked] = await connection.execute(`SELECT id_serie,dia_semana,CAST(fecha_inicio AS CHAR) AS fecha_inicio,CAST(fecha_fin AS CHAR) AS fecha_fin,
        CAST(generada_hasta AS CHAR) AS generada_hasta,plantilla,id_usuario_creacion FROM serie_actividad WHERE id_serie=? AND activa=1 FOR UPDATE`, [row.id_serie])
      if (locked.length) await generateDates(connection, locked[0], today)
      await connection.commit()
    } catch (error) { await connection.rollback(); throw error }
    finally { connection.release() }
  }
}
