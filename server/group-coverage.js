import { hasPermission } from './auth.js'
import { hasPastoralAuthority } from './pastoral-policy.js'
import { identifier, invalid, text } from './entities.js'

// Called inside the existing group/RBAC transaction: never commit a partial group.
export async function applyGroupCoverage(connection,actor,id,selection,{allowEmptyWithoutLeader=false,skipLeaderCheck=false}={}) {
  if(!hasPermission(actor,'grupos.ver') || !hasPastoralAuthority(actor) || actor.permissions['grupos.editar']!=='todos') throw invalid('No tienes autorización para administrar barrios.',403)
  if(!selection || !Array.isArray(selection.ids) || selection.ids.length>2000) throw invalid('Selecciona barrios válidos.')
  const ids=[...new Set(selection.ids.map(value=>identifier(value)))]
  const legacy=selection.legacy===true
  const [groups]=await connection.execute('SELECT id_grupo,id_discipulador FROM grupo_comunion WHERE id_grupo=? AND archivado=0 FOR UPDATE',[id])
  if(!groups.length) throw invalid('Grupo no disponible.',404)
  const leader=groups[0].id_discipulador
  if(!leader && (ids.length || !allowEmptyWithoutLeader)) throw invalid('Selecciona un discipulador antes de asignar los barrios.',409)
  if(!legacy && !skipLeaderCheck && selection.expectedLeaderId!==leader) throw invalid('El discipulador cambió. Vuelve a abrir la ficha del grupo.',409)
  if(leader && ids.length) {
    const [leaders]=await connection.execute("SELECT id_miembro FROM miembro WHERE id_miembro=? AND archivado=0 AND estado_miembro='activo' FOR UPDATE",[leader])
    if(!leaders.length) throw invalid('El grupo necesita un discipulador activo.',409)
  }
  let names=[]
  if(ids.length) {
    const [valid]=await connection.query('SELECT id_barrio,nombre FROM barrio WHERE estado=1 AND id_barrio IN (?) ORDER BY nombre,id_barrio FOR UPDATE',[ids])
    if(valid.length!==ids.length) throw invalid('Algún barrio ya no está disponible.',409)
    names=valid.map(row=>row.nombre)
  }
  const [previous]=await connection.execute('SELECT id_barrio FROM grupo_barrio_cobertura WHERE id_grupo=? AND estado=1 FOR UPDATE',[id])
  const before=previous.map(row=>row.id_barrio)
  if(!legacy && (!Array.isArray(selection.expectedIds) || JSON.stringify([...new Set(selection.expectedIds.map(value=>identifier(value)))].sort((a,b)=>a-b))!==JSON.stringify([...before].sort((a,b)=>a-b)))) throw invalid('Los barrios cambiaron. Vuelve a abrir el formulario.',409)
  const removed=before.filter(value=>!ids.includes(value))
  if(!legacy && removed.length && selection.confirmRemoval!==true) throw invalid('Confirma los barrios que vas a quitar.',409)
  if(removed.length) await connection.query('UPDATE grupo_barrio_cobertura SET estado=0,id_usuario_actualizacion=? WHERE id_grupo=? AND estado=1 AND id_barrio IN (?)',[actor.id,id,removed])
  if(ids.length) {
    await connection.query('INSERT INTO grupo_barrio_cobertura(id_grupo,id_barrio,id_usuario_actualizacion) VALUES ? ON DUPLICATE KEY UPDATE estado=1,id_usuario_actualizacion=VALUES(id_usuario_actualizacion)',[ids.map(value=>[id,value,actor.id])])
    const [coverage]=await connection.execute('SELECT id_barrio FROM discipulador_barrio WHERE id_discipulador=? AND estado=1 FOR UPDATE',[leader])
    const added=ids.filter(value=>!coverage.some(row=>row.id_barrio===value))
    if(added.length) await connection.query('INSERT INTO discipulador_barrio(id_discipulador,id_barrio,id_usuario_asigna) VALUES ?',[added.map(value=>[leader,value,actor.id])])
  }
  if(selection.replaceText!==false) await connection.execute('UPDATE grupo_comunion SET barrio=? WHERE id_grupo=?',[text(names.join(', '),10000),id])
}
