import { pool } from './db.js'

export async function audit(connection,request,action,status=200,userId=request.authUser?.id || null) {
  await connection.execute('INSERT INTO auditoria_seguridad(id_usuario,accion,recurso,resultado,ip,agente) VALUES (?,?,?,?,?,?)',[
    userId,action.slice(0,80),(request.originalUrl || request.path || '').split('?')[0].slice(0,220),status,
    String(request.ip || '').slice(0,64),String(request.get?.('user-agent') || '').slice(0,255),
  ])
}
// Persist the outcome before returning personal records, exports or management changes.
// No passwords, request bodies, query strings, MFA secrets or session tokens enter the log.
export function auditManagement(request,response,next) {
  const path=request.originalUrl.split('?')[0]
  if(!path.startsWith('/api/management/') && !path.startsWith('/api/auth/admin/')) return next()
  if(['GET','HEAD'].includes(request.method) && !/\/(members|reports|users)(\/|$)/.test(path)) return next()
  let recorded=false
  for(const method of ['json','send']) {
    const original=response[method]
    response[method]=function(...args) {
      if(recorded) return original.apply(this,args)
      recorded=true
      audit(pool,request,`${request.method} ${path.replace(/\d+/g,':id')}`,response.statusCode).then(()=>original.apply(this,args)).catch(error=>{
        console.error('No se pudo registrar la operación:',error.code || 'AUDIT_ERROR')
        response.status(503); response.json({error:'No pudimos registrar la operación. Inténtalo nuevamente.'})
      })
      return this
    }
  }
  next()
}
