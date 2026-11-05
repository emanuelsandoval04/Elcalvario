import { Router } from 'express'
import { pool } from './db.js'
import { hasPermission, requirePermission, readUser } from './auth.js'
import { hasPastoralAuthority } from './pastoral-policy.js'
import { identifier, invalid } from './entities.js'
import { applyGroupCoverage } from './group-coverage.js'
import { readNeighborhoodCatalog, compareNeighborhoodNames } from './neighborhood-catalog.js'
import { zoneReference } from './zone-reference.js'

export const mapRouter = Router()
export const canManageCoverage = user => hasPastoralAuthority(user) && user.permissions['grupos.editar'] === 'todos'
const ownScope = req => req.authUser.permissions['grupos.ver'] === 'grupo'
const color = id => `hsl(${Math.round((id * 137.508) % 360)}, 48%, 43%)`
const activeLeader = `m.archivado=0 AND m.estado_miembro='activo' AND
  (EXISTS(SELECT 1 FROM rol_eclesiastico r WHERE r.id_rol_eclesiastico=m.id_rol_eclesiastico AND r.nivel_jerarquico=6)
   OR EXISTS(SELECT 1 FROM grupo_comunion g WHERE g.id_discipulador=m.id_miembro AND g.archivado=0 AND g.estado_grupo='activo'))`

mapRouter.use(requirePermission('grupos.ver'))
mapRouter.get('/coberturas', async (req,res) => {
  const filter = ownScope(req) ? ' AND d.id_discipulador=?' : ''
  const params = ownScope(req) ? [req.authUser.memberId || -1] : []
  // One aggregate query for group sizes. No individual member data leaves this endpoint.
  const [rows] = await pool.execute(`SELECT b.id_barrio,b.nombre,b.comuna,b.geojson,b.fuente_geojson,
    m.id_miembro,CONCAT_WS(' ',m.nombres,m.apellidos) AS discipulador
    FROM barrio b JOIN discipulador_barrio d ON d.id_barrio=b.id_barrio AND d.estado=1
    JOIN miembro m ON m.id_miembro=d.id_discipulador
    WHERE b.estado=1 AND ${activeLeader} ${filter}`,params)
  rows.sort((a,b)=>compareNeighborhoodNames(a.nombre,b.nombre) || compareNeighborhoodNames(a.discipulador,b.discipulador) || a.id_miembro-b.id_miembro)
  const leaderIds=[...new Set(rows.map(row=>row.id_miembro))]
  const [photoRows]=leaderIds.length ? await pool.query(`SELECT u.id_miembro,u.id_usuario,f.version FROM usuario u
    JOIN foto_perfil_usuario f ON f.id_usuario=u.id_usuario WHERE u.estado_usuario='activo' AND u.id_miembro IN (?)`,[leaderIds]) : [[]]
  photoRows.sort((a,b)=>a.id_usuario-b.id_usuario)
  const photos=new Map()
  for(const photo of photoRows) if(!photos.has(photo.id_miembro)) photos.set(photo.id_miembro,`/api/management/mapa/discipuladores/${photo.id_miembro}/foto?v=${photo.version}`)
  const [groups] = await pool.execute(`SELECT gb.id_barrio,g.id_grupo,g.nombre,g.id_discipulador,g.dia_reunion,g.hora_reunion,COALESCE(c.total,0) AS miembros
    FROM grupo_barrio_cobertura gb JOIN grupo_comunion g ON g.id_grupo=gb.id_grupo
    JOIN discipulador_barrio d ON d.id_barrio=gb.id_barrio AND d.id_discipulador=g.id_discipulador AND d.estado=1
    JOIN miembro m ON m.id_miembro=g.id_discipulador JOIN barrio b ON b.id_barrio=gb.id_barrio
    LEFT JOIN (SELECT id_grupo,COUNT(*) AS total FROM miembro WHERE archivado=0 AND estado_miembro='activo' GROUP BY id_grupo) c ON c.id_grupo=g.id_grupo
    WHERE gb.estado=1 AND g.archivado=0 AND g.estado_grupo='activo' AND b.estado=1 AND ${activeLeader} ${filter}
    ORDER BY g.nombre`,params)
  const grouped = new Map()
  for (const row of rows) {
    if (!grouped.has(row.id_barrio)) grouped.set(row.id_barrio,{
      barrio:{id:row.id_barrio,nombre:row.nombre,comuna:row.comuna,ubicacion:zoneReference(row.geojson)},discipuladores:[],grupos:[],cantidadMiembros:0,
    })
    grouped.get(row.id_barrio).discipuladores.push({id:row.id_miembro,nombre:row.discipulador,color:color(row.id_miembro),propio:row.id_miembro===req.authUser.memberId,fotoUrl:photos.get(row.id_miembro) || null})
  }
  for (const group of groups) {
    const coverage=grouped.get(group.id_barrio)
    if (coverage) { coverage.grupos.push(group); coverage.cantidadMiembros+=Number(group.miembros) }
  }
  res.json({items:[...grouped.values()],canManage:canManageCoverage(req.authUser)})
})

mapRouter.get('/discipuladores/:id/foto',async (req,res) => {
  const id=identifier(req.params.id)
  if(ownScope(req) && id!==req.authUser.memberId) throw invalid('Discipulador fuera de tu alcance.',404)
  const [allowed]=await pool.execute(`SELECT m.id_miembro FROM miembro m WHERE m.id_miembro=? AND ${activeLeader}
    AND EXISTS(SELECT 1 FROM discipulador_barrio d JOIN barrio b ON b.id_barrio=d.id_barrio WHERE d.id_discipulador=m.id_miembro AND d.estado=1 AND b.estado=1)`,[id])
  if(!allowed.length) throw invalid('Discipulador no disponible en el mapa.',404)
  const [pictures]=await pool.execute(`SELECT f.contenido FROM foto_perfil_usuario f WHERE f.id_usuario=(
    SELECT MIN(u.id_usuario) FROM usuario u JOIN foto_perfil_usuario p ON p.id_usuario=u.id_usuario
    WHERE u.id_miembro=? AND u.estado_usuario='activo')`,[id])
  if(!pictures.length) throw invalid('El discipulador todavía no tiene foto de perfil.',404)
  res.set({'Content-Type':'image/jpeg','X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}).send(pictures[0].contenido)
})

mapRouter.get('/barrios',async (_req,res) => {
  const items=await readNeighborhoodCatalog()
  res.json({items})
})
mapRouter.get('/discipuladores',async (req,res) => {
  const [items]=await pool.execute(`SELECT m.id_miembro,CONCAT_WS(' ',m.nombres,m.apellidos) AS nombre FROM miembro m
    WHERE ${activeLeader} ${ownScope(req)?' AND m.id_miembro=?':''} ORDER BY m.nombres`,ownScope(req)?[req.authUser.memberId || -1]:[])
  res.json({items,canManage:canManageCoverage(req.authUser)})
})
mapRouter.get('/discipuladores/:id/barrios',async (req,res) => {
  const id=identifier(req.params.id)
  if (ownScope(req) && id!==req.authUser.memberId) throw invalid('Discipulador fuera de tu alcance.',404)
  const [items]=await pool.execute('SELECT id_barrio FROM discipulador_barrio WHERE id_discipulador=? AND estado=1',[id])
  res.json({items})
})

async function mutation(req,action) {
  const connection=await pool.getConnection()
  try {
    await connection.beginTransaction()
    // Reuse the RBAC lock used by account/permission changes and reread the actor.
    await connection.execute('SELECT id FROM configuracion_sistema WHERE id=1 FOR UPDATE')
    const actor=await readUser(req.authUser.id,connection)
    if (!hasPermission(actor,'gestion.acceder') || !hasPermission(actor,'grupos.ver') || !canManageCoverage(actor)) throw invalid('No tienes autorización para administrar zonas.',403)
    const result=await action(connection,actor)
    await connection.commit()
    return result
  } catch(error) { await connection.rollback(); throw error }
  finally { connection.release() }
}
mapRouter.put('/discipuladores/:id/barrios',async (req,res) => {
  const id=identifier(req.params.id)
  if (!Array.isArray(req.body?.ids) || req.body.ids.length>2000) throw invalid('Selecciona barrios válidos.')
  const ids=[...new Set(req.body.ids.map(value=>identifier(value)))]
  await mutation(req,async (connection,actor) => {
    const [leaders]=await connection.execute(`SELECT m.id_miembro FROM miembro m WHERE m.id_miembro=? AND ${activeLeader} FOR UPDATE`,[id])
    if (!leaders.length) throw invalid('Selecciona un discipulador activo.',400)
    if (ids.length) {
      const [valid]=await connection.query('SELECT id_barrio FROM barrio WHERE estado=1 AND id_barrio IN (?) FOR UPDATE',[ids])
      if(valid.length!==ids.length) throw invalid('Algún barrio ya no está disponible. Actualiza la selección.',409)
    }
    const [previous]=await connection.execute('SELECT id_barrio FROM discipulador_barrio WHERE id_discipulador=? AND estado=1 FOR UPDATE',[id])
    const before=previous.map(row=>row.id_barrio)
    // Optimistic concurrency protects another administrator's saved assignments.
    const expected=req.body.expectedIds
    if (!Array.isArray(expected) || JSON.stringify([...new Set(expected.map(value=>identifier(value)))].sort((a,b)=>a-b))!==JSON.stringify([...before].sort((a,b)=>a-b))) throw invalid('Las zonas cambiaron. Vuelve a abrir Administrar barrios.',409)
    const removed=before.filter(value=>!ids.includes(value))
    if(removed.length && req.body.confirmRemoval!==true) throw invalid('Confirma los barrios que vas a quitar.',409)
    if(removed.length) await connection.query('UPDATE discipulador_barrio SET estado=0,fecha_finalizacion=UTC_TIMESTAMP(),id_usuario_finaliza=? WHERE id_discipulador=? AND estado=1 AND id_barrio IN (?)',[actor.id,id,removed])
    const added=ids.filter(value=>!before.includes(value))
    if(added.length) await connection.query('INSERT INTO discipulador_barrio(id_discipulador,id_barrio,id_usuario_asigna) VALUES ?',[added.map(value=>[id,value,actor.id])])
  })
  res.json({ok:true})
})


async function groupNeighborhoods(req) {
  const id=identifier(req.params.id)
  const [groups]=await pool.execute(`SELECT id_grupo,id_discipulador FROM grupo_comunion WHERE id_grupo=? AND archivado=0 ${ownScope(req)?'AND id_discipulador=?':''}`,[id,...(ownScope(req)?[req.authUser.memberId || -1]:[])])
  if(!groups.length) throw invalid('Grupo fuera de tu alcance.',404)
  const [items]=await pool.execute('SELECT id_barrio FROM grupo_barrio_cobertura WHERE id_grupo=? AND estado=1 ORDER BY id_barrio',[id])
  return {items,id_discipulador:groups[0].id_discipulador}
}
mapRouter.get('/grupos/:id/barrios',async (req,res) => res.json(await groupNeighborhoods(req)))
// Compatibility for clients using the former single-neighborhood endpoint.
mapRouter.get('/grupos/:id/barrio',async (req,res) => {
  const result=await groupNeighborhoods(req)
  res.json({...result,id_barrio:result.items[0]?.id_barrio || null})
})
async function saveGroupNeighborhoods(req,res,legacy=false) {
  const id=identifier(req.params.id)
  const selection=legacy ? {ids:req.body?.id_barrio ? [req.body.id_barrio] : [],legacy:true} : {...req.body,legacy:false}
  await mutation(req,(connection,actor)=>applyGroupCoverage(connection,actor,id,selection))
  res.json({ok:true})
}
mapRouter.put('/grupos/:id/barrios',(req,res)=>saveGroupNeighborhoods(req,res))
mapRouter.put('/grupos/:id/barrio',(req,res)=>saveGroupNeighborhoods(req,res,true))
