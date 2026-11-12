import { Router } from 'express'
import { pool } from './db.js'
import { hasPermission, requirePermission } from './auth.js'
import { identifier, invalid } from './entities.js'
import { maskedNumber, mobileNumber } from './contact-rules.js'
import { phoneAuthConfigured, verifyPhoneToken } from './firebase-phone.js'

// Data-treatment authorization: Firebase Phone Auth sends a code by SMS to the disciple's mobile phone.
// When the person dictates it and it is typed in their record, the browser receives a signed token that the
// server verifies (same phone as the record) before registering the authorization.
export const consentVersion = 'firebase-sms-2026-11-12'
export const authorizationText = 'Al dictar el código que recibe por SMS, la persona acepta que la Iglesia El Calvario trate sus datos personales según la Ley 1581 de 2012.'
const actorName = alias => `COALESCE(NULLIF(TRIM((SELECT p.nombre FROM perfil_usuario p WHERE p.id_usuario=${alias})),''),(SELECT NULLIF(TRIM(CONCAT_WS(' ',am.nombres,am.apellidos)),'') FROM usuario u JOIN miembro am ON am.id_miembro=u.id_miembro WHERE u.id_usuario=${alias}))`

export function discipleConsentRouter({transaction,currentActor,getMember}) {
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
    const [latest]=await pool.execute(`SELECT c.id_consentimiento,c.estado_consentimiento,c.medio,c.fecha_aceptacion,d.fecha_subida,s.celular
      FROM consentimiento_datos c LEFT JOIN documento_consentimiento d ON d.id_consentimiento=c.id_consentimiento
      LEFT JOIN verificacion_consentimiento_telefono s ON s.id_consentimiento=c.id_consentimiento
      WHERE c.id_miembro=? ORDER BY c.id_consentimiento DESC LIMIT 1`,[member.id_miembro])
    const canManage=await manageable(req,'consentimientos.gestionar')
    const canReadFiles=can(req,'miembros.sensibles') && canManage
    let items=[]
    if(canManage) {
      // Metadata only: no file bytes or code hashes.
      ;[items]=await pool.execute(`SELECT c.id_consentimiento,c.estado_consentimiento,c.medio,c.fecha_aceptacion,c.fecha_revocacion,
          d.id_documento,d.fecha_subida,d.nombre_archivo,s.celular,${actorName('s.id_usuario_confirmacion')} AS registrado_por
        FROM consentimiento_datos c LEFT JOIN documento_consentimiento d ON d.id_consentimiento=c.id_consentimiento
        LEFT JOIN verificacion_consentimiento_telefono s ON s.id_consentimiento=c.id_consentimiento
        WHERE c.id_miembro=? ORDER BY c.id_consentimiento DESC LIMIT 50`,[member.id_miembro])
      items=items.map(({celular,...item})=>({...item,celular:maskedNumber(celular)}))
    }
    const current=latest[0], phone=mobileNumber(member.celular)
    res.json({accepted:current?.estado_consentimiento==='aceptado',revoked:current?.estado_consentimiento==='revocado',
      method:current?.medio || null,acceptedAt:current?.fecha_aceptacion || current?.fecha_subida || null,acceptedPhone:maskedNumber(current?.celular),
      currentId:current?.id_consentimiento || null,canManage,canReadFiles,items,
      // Managers get the full number: the browser asks Firebase to send the SMS to it.
      ...(canManage ? {phoneReady:phoneAuthConfigured(),phone:maskedNumber(phone),phoneNumber:phone,authorizationText} : {})})
  })
  router.post('/members/:id/consents/phone',requirePermission('miembros.ver'),requirePermission('consentimientos.gestionar'),async(req,res)=>{
    const verified=await verifyPhoneToken(req.body?.idToken)
    const result=await transaction(async connection=>{
      const actor=await currentActor(req,connection)
      if(!hasPermission(actor,'consentimientos.gestionar'))throw invalid('Ya no tienes permiso para registrar autorizaciones.',403)
      const member=await access(req,'consentimientos.gestionar',connection,true)
      const phone=mobileNumber(member.celular)
      if(!phone)throw invalid('El celular de la ficha no es un número móvil válido. Corrígelo antes de verificar.')
      if(verified.phone!==phone)throw invalid('El celular verificado no coincide con el de la ficha. Envía el código al celular registrado.',409)
      const [used]=await connection.execute('SELECT id_verificacion FROM verificacion_consentimiento_telefono WHERE firebase_uid=? AND fecha_autenticacion=? FOR UPDATE',[verified.uid,verified.authTime])
      if(used.length)throw invalid('Esta verificación ya se usó. Envía un código nuevo.',409)
      const [consent]=await connection.execute(`INSERT INTO consentimiento_datos(id_miembro,version_politica,acepta_politica_privacidad,acepta_datos_religiosos,medio,estado_consentimiento,fecha_aceptacion)
        VALUES (?,?,1,0,'sms','aceptado',UTC_TIMESTAMP())`,[member.id_miembro,consentVersion])
      await connection.execute(`INSERT INTO verificacion_consentimiento_telefono(id_miembro,id_consentimiento,celular,firebase_uid,fecha_autenticacion,texto_autorizacion,id_usuario_confirmacion)
        VALUES (?,?,?,?,?,?,?)`,[member.id_miembro,consent.insertId,phone,verified.uid,verified.authTime,authorizationText,actor.id])
      return {id:consent.insertId}
    })
    res.status(201).json(result)
  })
  // Signed forms uploaded before the SMS authorization remain available as evidence.
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
