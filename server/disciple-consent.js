import { Router } from 'express'
import { pool } from './db.js'
import { hasPermission, requirePermission } from './auth.js'
import { identifier, invalid } from './entities.js'
import { authorizationText, consentVersion, discipleConsentPdf, parseConsentFiles } from './disciple-consent-document.js'

export function discipleConsentRouter({transaction,currentActor,getMember,cleanMember}) {
  const router=Router()
  const can=(req,code)=>hasPermission(req.authUser,code)
  async function access(req,code,connection=pool,lock=false) {
    if(!can(req,'miembros.ver') || !can(req,code))throw invalid('No tienes permiso para esta operación.',403)
    await getMember(req,req.params.id,'miembros.ver',connection)
    return getMember(req,req.params.id,code,connection,lock)
  }
  async function manageable(req,code) {
    if(!can(req,code))return false
    try{await access(req,code);return true}catch(error){if(error.status===404)return false;throw error}
  }
  router.get('/members/:id/consents',requirePermission('miembros.ver'),async(req,res)=>{
    const member=await getMember(req,req.params.id,'miembros.ver')
    // Metadata only: no file bytes, hashes or previous private checkbox decisions.
    const [latest]=await pool.execute(`SELECT c.id_consentimiento,c.estado_consentimiento,d.id_documento,d.fecha_subida
      FROM consentimiento_datos c LEFT JOIN documento_consentimiento d ON d.id_consentimiento=c.id_consentimiento
      WHERE c.id_miembro=? ORDER BY c.id_consentimiento DESC LIMIT 1`,[member.id_miembro])
    const canManage=await manageable(req,'consentimientos.gestionar')
    const canPrepare=canManage || await manageable(req,'reportes.discipulos')
    const canReadFiles=can(req,'miembros.sensibles') && canManage
    let items=[]
    if(canManage) {
      ;[items]=await pool.execute(`SELECT c.id_consentimiento,c.estado_consentimiento,c.acepta_datos_religiosos,
        c.fecha_aceptacion,c.fecha_revocacion,d.id_documento,d.fecha_subida,d.nombre_archivo,d.tipo_archivo,d.autoriza_salud
        FROM consentimiento_datos c LEFT JOIN documento_consentimiento d ON d.id_consentimiento=c.id_consentimiento
        WHERE c.id_miembro=? ORDER BY c.id_consentimiento DESC LIMIT 50`,[member.id_miembro])
      if(!can(req,'miembros.sensibles'))items=items.map(({autoriza_salud,...item})=>item)
    }
    const current=latest[0]
    res.json({signed:Boolean(current?.id_documento && current.estado_consentimiento==='aceptado'),
      uploadedAt:current?.fecha_subida || null,revoked:current?.estado_consentimiento==='revocado',
      currentId:current?.id_consentimiento || null,canManage,canPrepare,canReadFiles,items})
  })
  router.get('/members/:id/consent.pdf',requirePermission('miembros.ver'),async(req,res)=>{
    const code=await manageable(req,'consentimientos.gestionar')?'consentimientos.gestionar':'reportes.discipulos'
    const member=await access(req,code)
    const [rows]=await pool.execute(`SELECT CAST(m.fecha_nacimiento AS CHAR) AS fecha_nacimiento,
      l.nombre AS libro_actual,g.nombre AS grupo_nombre,r.nombre AS rol_nombre,s.nombre AS sede_nombre,
      CONCAT_WS(' ',c.nombres,c.apellidos) AS cobertura_nombre,
      (SELECT GROUP_CONCAT(mt.nombre ORDER BY mt.nombre SEPARATOR ', ') FROM miembro_ministerio mm JOIN ministerio mt ON mt.id_ministerio=mm.id_ministerio WHERE mm.id_miembro=m.id_miembro AND mm.activo=1) AS ministerios
      FROM miembro m LEFT JOIN libro_adiestramiento l ON l.id_libro=m.id_libro
      LEFT JOIN grupo_comunion g ON g.id_grupo=m.id_grupo LEFT JOIN rol_eclesiastico r ON r.id_rol_eclesiastico=m.id_rol_eclesiastico
      LEFT JOIN sede s ON s.id_sede=m.id_sede LEFT JOIN miembro c ON c.id_miembro=m.id_cobertura_pastoral WHERE m.id_miembro=?`,[member.id_miembro])
    const [institutions]=await pool.execute('SELECT nombre,direccion,ciudad FROM institucion WHERE id=1')
    const bytes=await discipleConsentPdf(cleanMember(req,{...member,...rows[0]}),institutions[0],can(req,'miembros.sensibles'))
    res.set('Content-Disposition',`attachment; filename="ficha-discipulo-${member.id_miembro}.pdf"`).type('application/pdf').send(bytes)
  })
  router.post('/members/:id/consents',requirePermission('miembros.ver'),requirePermission('consentimientos.gestionar'),async(req,res)=>{
    // Check scope before spending time decoding an upload.
    await access(req,'consentimientos.gestionar')
    const body=req.body || {}
    if(body.confirmSigned!==true)throw invalid('Confirma que revisaste todas las páginas y la firma del titular o representante.')
    if(typeof body.religious!=='boolean' || typeof body.health!=='boolean')throw invalid('Indica las decisiones marcadas en el documento sobre datos sensibles.')
    if(body.health && !can(req,'miembros.sensibles'))throw invalid('No tienes permiso para registrar datos de salud.',403)
    const file=await parseConsentFiles(body.files)
    const result=await transaction(async connection=>{
      await currentActor(req,connection)
      const member=await access(req,'consentimientos.gestionar',connection,true)
      if(body.health && !can(req,'miembros.sensibles'))throw invalid('Tu permiso de datos sensibles ha cambiado.',403)
      const [institutions]=await connection.execute('SELECT nombre,direccion,ciudad FROM institucion WHERE id=1')
      const now=new Date()
      const [consent]=await connection.execute(`INSERT INTO consentimiento_datos
        (id_miembro,version_politica,acepta_politica_privacidad,acepta_datos_religiosos,medio,estado_consentimiento,fecha_aceptacion)
        VALUES (?,?,1,?,'digital','aceptado',?)`,[member.id_miembro,consentVersion,Number(body.religious),now])
      const name=`ficha-firmada-${member.id_miembro}-${consent.insertId}.${file.type==='application/pdf'?'pdf':'jpg'}`
      const [document]=await connection.execute(`INSERT INTO documento_consentimiento
        (id_consentimiento,id_usuario,nombre_archivo,tipo_archivo,contenido,sha256,autoriza_salud,texto_autorizacion,fecha_subida)
        VALUES (?,?,?,?,?,?,?,?,?)`,[consent.insertId,req.authUser.id,name,file.type,file.bytes,file.sha256,Number(body.health),authorizationText(institutions[0]),now])
      return {id:consent.insertId,documentId:document.insertId,uploadedAt:now}
    })
    res.status(201).json(result)
  })
  router.get('/members/:id/consents/:documentId/file',requirePermission('miembros.ver'),requirePermission('consentimientos.gestionar'),requirePermission('miembros.sensibles'),async(req,res)=>{
    const member=await access(req,'consentimientos.gestionar')
    const [files]=await pool.execute(`SELECT d.nombre_archivo,d.tipo_archivo,d.contenido FROM documento_consentimiento d
      JOIN consentimiento_datos c ON c.id_consentimiento=d.id_consentimiento
      WHERE d.id_documento=? AND c.id_miembro=?`,[identifier(req.params.documentId),member.id_miembro])
    if(!files.length)throw invalid('Documento no disponible en esta ficha.',404)
    res.set('Content-Disposition',`attachment; filename="${files[0].nombre_archivo}"`)
      .set('Content-Security-Policy',"sandbox; default-src 'none'").type(files[0].tipo_archivo).send(files[0].contenido)
  })
  router.post('/members/:id/consents/:consentId/revoke',requirePermission('miembros.ver'),requirePermission('consentimientos.gestionar'),async(req,res)=>{
    await transaction(async connection=>{
      await currentActor(req,connection)
      const member=await access(req,'consentimientos.gestionar',connection,true)
      const [latest]=await connection.execute('SELECT id_consentimiento,estado_consentimiento FROM consentimiento_datos WHERE id_miembro=? ORDER BY id_consentimiento DESC LIMIT 1 FOR UPDATE',[member.id_miembro])
      if(latest[0]?.id_consentimiento!==identifier(req.params.consentId) || latest[0].estado_consentimiento!=='aceptado')throw invalid('El consentimiento cambió. Actualiza la ficha.',409)
      await connection.execute("UPDATE consentimiento_datos SET estado_consentimiento='revocado',fecha_revocacion=UTC_TIMESTAMP() WHERE id_consentimiento=?",[latest[0].id_consentimiento])
    })
    res.json({revoked:true})
  })
  return router
}
