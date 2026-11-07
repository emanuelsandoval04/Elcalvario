import {pool} from '../server/db.js'

// Run separately with the migration/administration account. The web account
// deliberately has no permission to modify or delete the audit trail.
const retentionDays=Number(process.env.SECURITY_AUDIT_RETENTION_DAYS || 90)
if(!Number.isInteger(retentionDays) || retentionDays<30 || retentionDays>3650)throw new Error('SECURITY_AUDIT_RETENTION_DAYS debe estar entre 30 y 3650.')
try{
 const tasks=[
  ['sesiones vencidas','DELETE FROM sesion_usuario WHERE fecha_expiracion<=UTC_TIMESTAMP() LIMIT 1000',[]],
  ['retos vencidos','DELETE FROM reto_mfa WHERE vence_en<=UTC_TIMESTAMP() LIMIT 1000',[]],
  ['enlaces de recuperación vencidos','DELETE FROM recuperacion_contrasena WHERE fecha_expiracion<=UTC_TIMESTAMP() LIMIT 1000',[]],
  ['límites vencidos','DELETE FROM limite_solicitud WHERE vence_en<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) LIMIT 1000',[]],
  ['eventos fuera de retención','DELETE FROM auditoria_seguridad WHERE fecha<DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? DAY) LIMIT 1000',[retentionDays]],
 ]
 for(const [label,sql,parameters] of tasks){const [result]=await pool.execute(sql,parameters);console.log(`${label}: ${result.affectedRows}`)}
}finally{await pool.end()}
