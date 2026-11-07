import { pool } from './db.js'
import { canAdministerAccounts } from './pastoral-policy.js'
import { invalid } from './entities.js'
import { ensureRecurringActivities, recurrenceJoins, nearestPublicDate } from './recurring-activities.js'

const accountQuery = `SELECT CONCAT('account:',id_usuario) AS id, 'account' AS type,
  correo_login AS title, 'Registro pendiente de habilitación' AS message,
  fecha_creacion AS createdAt, '#usuarios' AS href
  FROM usuario WHERE estado_usuario='pendiente'`

// Public events are available to every profile. Private activities and group
// meetings never enter this feed. A changed schedule/cancellation is a new notice.
const eventQuery = `SELECT CONCAT('event:',ac.id_actividad,':',LEFT(SHA2(JSON_ARRAY(
  tipo_actividad,titulo,CAST(fecha AS CHAR),hora,lugar,estado_actividad,descripcion),256),32)) AS id,
  'event' AS type, titulo AS title,
  CONCAT(IF(estado_actividad='cancelada','Cancelado',IF(tipo_actividad='culto','Próximo culto','Próximo evento')),
    ' · ',DATE_FORMAT(fecha,'%d/%m/%Y'),' · ',LEFT(hora,5),' · ',lugar) AS message,
  ac.fecha_actualizacion AS createdAt, '#eventos' AS href
  FROM actividad ac ${recurrenceJoins} WHERE publicado=1 AND archivado=0 AND tipo_actividad IN ('culto','evento')
    AND fecha>=DATE(DATE_SUB(UTC_TIMESTAMP(),INTERVAL 5 HOUR)) ${nearestPublicDate}`

function visibleQuery(user, accountsOnly = false) {
  const accounts = canAdministerAccounts(user)
  if (accountsOnly) {
    if (!accounts) throw invalid('No tienes permiso para consultar solicitudes de cuentas.',403)
    return accountQuery
  }
  return accounts ? `${accountQuery} UNION ALL ${eventQuery}` : eventQuery
}

export async function readNotifications(user, { accountsOnly = false } = {}, connection = pool) {
  if(!accountsOnly) await ensureRecurringActivities()
  const query = `FROM (${visibleQuery(user,accountsOnly)}) n
    LEFT JOIN notificacion_descartada d ON d.id_usuario=? AND d.id_notificacion=n.id
    WHERE d.id_notificacion IS NULL`
  const [counts] = await connection.execute(`SELECT COUNT(*) AS total ${query}`, [user.id])
  const [items] = await connection.execute(`SELECT n.* ${query} ORDER BY n.type='account' DESC,n.createdAt DESC,n.id DESC LIMIT 50`, [user.id])
  return { total: counts[0].total, items, canManageAccounts: canAdministerAccounts(user) }
}

export async function dismissNotification(user, id, connection = pool) {
  if (typeof id !== 'string' || !/^(?:account:[1-9]\d{0,9}|event:[1-9]\d{0,9}:[a-f0-9]{32})$/.test(id)) throw invalid('Notificación inválida.')
  if(id.startsWith('event:')) await ensureRecurringActivities()
  const [items] = await connection.execute(`SELECT n.id FROM (${visibleQuery(user)}) n WHERE n.id=? LIMIT 1`, [id])
  if (!items.length) throw invalid('Notificación no disponible.',404)
  await connection.execute(`INSERT INTO notificacion_descartada(id_usuario,id_notificacion) VALUES (?,?)
    ON DUPLICATE KEY UPDATE id_notificacion=notificacion_descartada.id_notificacion`, [user.id,id])
}
