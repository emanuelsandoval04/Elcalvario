// Call inside a transaction holding the member row lock to serialize attendance changes.
export async function recalculateAlerts(connection, memberId) {
  const [rows] = await connection.execute(`SELECT a.id_actividad,a.estado_asistencia FROM asistencia a
    JOIN actividad ac ON ac.id_actividad=a.id_actividad
    WHERE a.id_miembro=? AND a.archivado=0 AND ac.archivado=0 AND ac.estado_actividad<>'cancelada'
      AND TIMESTAMP(ac.fecha,ac.hora)<=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 HOUR)
    ORDER BY ac.fecha,ac.hora,ac.id_actividad`, [memberId])
  await connection.execute('UPDATE alerta_ausencia SET vigente=0 WHERE id_miembro=?',[memberId])
  let consecutive = 0
  for (const row of rows) {
    consecutive = row.estado_asistencia === 'ausente' ? consecutive + 1 : 0
    if (consecutive === 2) await connection.execute(`INSERT INTO alerta_ausencia(id_miembro,id_actividad) VALUES (?,?)
      ON DUPLICATE KEY UPDATE vigente=1`,[memberId,row.id_actividad])
  }
}
