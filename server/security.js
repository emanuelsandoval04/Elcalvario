import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import * as OTPAuth from 'otpauth'
import { invalid } from './entities.js'

function key() {
  const value=process.env.MFA_ENCRYPTION_KEY || ''
  if(!/^[a-f0-9]{64}$/i.test(value)) throw invalid('La protección de doble factor no está configurada. Contacta con la administración.',503)
  return Buffer.from(value,'hex')
}
export function encryptSecret(secret,userId) {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key(),iv)
  cipher.setAAD(Buffer.from(`elcalvario:mfa:${userId}`))
  const encrypted=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()])
  return `v1.${Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64')}`
}
export function decryptSecret(value,userId) {
  if(!value.startsWith('v1.')) throw new Error('MFA_SECRET_FORMAT')
  const data=Buffer.from(value.slice(3),'base64'), cipher=createDecipheriv('aes-256-gcm',key(),data.subarray(0,12))
  cipher.setAAD(Buffer.from(`elcalvario:mfa:${userId}`)); cipher.setAuthTag(data.subarray(12,28))
  return Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString('utf8')
}
export const createTotp=(secret,label='Cuenta')=>new OTPAuth.TOTP({issuer:'El Calvario',label,algorithm:'SHA1',digits:6,period:30,secret:OTPAuth.Secret.fromBase32(secret)})
export const newSecret=()=>new OTPAuth.Secret({size:20}).base32
export const requiresMfa=user=>user?.state==='activo' && Boolean(user.roles.includes('Superadmin') || user.roles.includes('Administrador') || user.permissions['usuarios.gestionar'] || user.permissions['permisos.gestionar']) && (process.env.NODE_ENV==='production' || process.env.VERCEL==='1' || process.env.MFA_ENFORCE_PRIVILEGED!=='false')
const recoveryDigest=code=>createHash('sha256').update(String(code || '').toUpperCase().replace(/[-\s]/g,'')).digest('hex')
export async function recoveryCodes(connection,userId) {
  const codes=Array.from({length:8},()=>randomBytes(8).toString('hex').toUpperCase().match(/.{4}/g).join('-'))
  await connection.execute('DELETE FROM mfa_recuperacion WHERE id_usuario=?',[userId])
  for(const code of codes) await connection.execute('INSERT INTO mfa_recuperacion(id_usuario,codigo_hash) VALUES (?,?)',[userId,recoveryDigest(code)])
  return codes
}
// Caller holds the account row lock. Never accept a TOTP step twice, even across instances.
export async function verifyFactor(connection,userId,code,{pending=false}={}) {
  const [rows]=await connection.execute('SELECT * FROM seguridad_mfa WHERE id_usuario=? FOR UPDATE',[userId])
  const row=rows[0]
  if(!row || (!pending && !row.habilitada) || (pending && (row.habilitada || !row.vence_configuracion || new Date(row.vence_configuracion).getTime()<=Date.now()))) return false
  const token=typeof code==='string' ? code.replace(/\s/g,'') : ''
  if(/^\d{6}$/.test(token)) {
    const timestamp=Date.now(), delta=createTotp(decryptSecret(row.secreto_cifrado,userId)).validate({token,window:1,timestamp})
    const step=Math.floor(timestamp/30000)+(delta ?? 0)
    if(delta!==null && step>Number(row.ultimo_paso)) {
      await connection.execute('UPDATE seguridad_mfa SET ultimo_paso=? WHERE id_usuario=?',[step,userId]); return true
    }
  } else if(!pending && /^[a-f0-9-]{16,19}$/i.test(token)) {
    const [result]=await connection.execute('UPDATE mfa_recuperacion SET usado_en=UTC_TIMESTAMP() WHERE id_usuario=? AND codigo_hash=? AND usado_en IS NULL',[userId,recoveryDigest(token)])
    return result.affectedRows===1
  }
  return false
}
export async function requireFactor(connection,user,code) {
  if(user.mfaEnabled && !await verifyFactor(connection,user.id,code)) throw invalid('Escribe un código de autenticación vigente o un código de recuperación sin usar.',401)
}
