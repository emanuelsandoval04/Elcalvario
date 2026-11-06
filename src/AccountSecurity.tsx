import { useEffect, useState } from 'react'
import { authRequest } from './auth'
import type { AuthUser } from './auth'
import './security.css'

type SecurityEvent = { id?: number; userId?: number; action: string; resource?: string; status: number; date: string; ip: string; device?: string }
type Session = { id: string; device: string; ip: string; current: number; lastSeen: string; created: string }
type SecurityData = { sessions: Session[]; events: SecurityEvent[]; remainingCodes: number }
const localDate = (value: string) => new Date(value.endsWith('Z') ? value : value.replace(' ', 'T')+'Z').toLocaleString('es-CO')
const eventName = (action: string) => ({'login.success':'Inicio de sesión','login.mfa_success':'Inicio de sesión con doble factor','login.factor_requested':'Verificación de acceso solicitada','login.factor_failed':'Código de acceso incorrecto','session.logout':'Sesión cerrada','session.revoke':'Dispositivo desconectado','session.revoke_others':'Otras sesiones cerradas','mfa.enabled':'Doble factor activado','mfa.setup_started':'Configuración del autenticador iniciada','mfa.disabled':'Doble factor desactivado','mfa.recovery_regenerated':'Códigos de recuperación renovados','account.password_changed':'Contraseña actualizada','account.email_changed':'Correo actualizado','account.profile_updated':'Perfil actualizado','security.verification_failed':'Verificación de seguridad rechazada','audit.read':'Consulta de auditoría'}[action] || action)

export default function AccountSecurity({ user, onUpdate, onBusy }: { user: AuthUser; onUpdate: (user: AuthUser) => void; onBusy?: (value:boolean) => void }) {
  const [data, setData] = useState<SecurityData | null>(null), [busy, setBusy] = useState(false)
  const [password, setPassword] = useState(''), [code, setCode] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState('')
  const [setup, setSetup] = useState<{secret: string; qrDataUrl: string} | null>(null)
  const [codes, setCodes] = useState<string[]>([])
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null), [audit, setAudit] = useState<SecurityEvent[] | null>(null)
  async function load() { setData(await authRequest<SecurityData>('account/security')) }
  useEffect(() => { void load().catch(cause => setError(cause instanceof Error ? cause.message : 'No pudimos consultar tu seguridad.')) }, [])
  async function perform(action: () => Promise<void>) {
    if (busy) return
    setBusy(true); onBusy?.(true); setError(''); setMessage('')
    try { await action() }
    catch(cause) { setError(cause instanceof Error ? cause.message : 'No pudimos completar la operación.') }
    finally { setBusy(false); onBusy?.(false) }
  }
  function saveCodes() {
    const text = `El Calvario — códigos de recuperación\nGuárdalos en un lugar privado. Cada código se puede usar una sola vez.\n\n${codes.join('\n')}\n`
    const url = URL.createObjectURL(new Blob([text], {type:'text/plain;charset=utf-8'})), link = document.createElement('a')
    link.href=url; link.download='elcalvario-codigos-recuperacion.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  if(codes.length) return <section className="security-panel" aria-label="Códigos de recuperación"><h3>Guarda tus códigos de recuperación</h3><p>Podrás entrar con uno de estos códigos si pierdes tu autenticador. Cada uno funciona una sola vez. No los compartas.</p><div className="security-codes">{codes.map(value => <code key={value}>{value}</code>)}</div><button type="button" onClick={saveCodes}>Descargar códigos</button><button type="button" disabled={busy} onClick={() => void perform(async () => {const result=await authRequest('account/security/mfa/recovery/ack',{});setCodes([]);if(result.user)onUpdate(result.user);await load()})}>Ya guardé mis códigos. Continuar</button>{error && <p role="alert">{error}</p>}</section>
  return <section className="security-panel" aria-label="Seguridad de la cuenta" aria-busy={busy}>
    <h3>Protege tu cuenta</h3>
    <p>{user.mfaEnabled && user.mfaSetupRequired ? 'Falta confirmar tus códigos de recuperación. Si cerraste la configuración sin guardarlos, renueva los códigos y guárdalos para continuar.' : user.mfaSetupRequired ? 'Tu cargo requiere doble factor. Actívalo para continuar a las herramientas de gestión.' : user.mfaEnabled ? 'Doble factor activo. Para entrar desde otro dispositivo necesitarás tu contraseña y un código.' : 'Añade una segunda verificación para proteger tu acceso.'}</p>
    {error && <p className="account-feedback is-error" role="alert">{error}</p>}{message && <p className="account-feedback" role="status">{message}</p>}
    {setup ? <form onSubmit={event => {event.preventDefault(); void perform(async () => {
      const result=await authRequest<{recoveryCodes:string[]}>('account/security/mfa/confirm',{code})
      setCodes(result.recoveryCodes); setSetup(null); setCode(''); setPassword('')
    })}}><h4>Vincula tu autenticador</h4><p>En Google Authenticator, Microsoft Authenticator o tu aplicación de autenticación, agrega una cuenta y escanea este QR. La configuración vence en 10 minutos.</p><img className="security-qr" src={setup.qrDataUrl} alt="QR para vincular el autenticador"/><label>Clave para agregar manualmente<input value={setup.secret} readOnly autoComplete="off"/></label><label>Código de 6 dígitos<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value)} disabled={busy}/></label><button disabled={busy}>Confirmar y activar doble factor</button><button type="button" disabled={busy} onClick={() => {setSetup(null);setCode('')}}>Cancelar configuración</button></form> : <form onSubmit={event => {event.preventDefault(); void perform(async () => {
      setSetup(await authRequest<{secret:string;qrDataUrl:string}>('account/security/mfa/setup',{currentPassword:password}));setPassword('')
    })}}>
      <label>Contraseña actual<input type="password" autoComplete="current-password" required value={password} maxLength={128} onChange={event => setPassword(event.target.value)} disabled={busy}/></label>
      {user.mfaEnabled ? <><p>Quedan {data?.remainingCodes ?? '…'} códigos de recuperación sin usar. Renovarlos invalida los anteriores.</p><label>Código del autenticador o de recuperación<input autoComplete="one-time-code" value={code} maxLength={25} onChange={event => setCode(event.target.value)} disabled={busy}/></label><button type="button" disabled={busy || !password || !code} onClick={() => void perform(async () => {const result=await authRequest<{recoveryCodes:string[]}>('account/security/mfa/recovery',{currentPassword:password,code});setCodes(result.recoveryCodes);setCode('');setPassword('')})}>Renovar códigos de recuperación</button>{!user.mfaMandatory && <button type="button" disabled={busy || !password || !code} onClick={() => void perform(async () => {const result=await authRequest('account/security/mfa/disable',{currentPassword:password,code});if(result.user)onUpdate(result.user);setPassword('');setCode('');await load();setMessage('Doble factor desactivado. Las otras sesiones se cerraron.')})}>Desactivar doble factor</button>}</> : <button disabled={busy || !password}>Configurar doble factor</button>}
    </form>}
    {!user.mfaSetupRequired && <>
      <h3>Dispositivos con sesión activa</h3><p>La sesión vence después de 30 minutos sin consultas o al alcanzar su duración máxima. La IP identifica la conexión y puede cambiar.</p>
      <button type="button" disabled={busy} onClick={() => void perform(load)}>Actualizar sesiones</button>
      {data?.sessions.map(session => <article className="security-session" key={session.id}><strong>{session.current ? 'Este dispositivo' : 'Otro dispositivo'}</strong><span>{session.device || 'Navegador sin identificar'}</span><small>IP: {session.ip || 'No disponible'} · Última actividad: {localDate(session.lastSeen)}</small>{!session.current && <button type="button" disabled={busy} onClick={() => setConfirmRevoke(session.id)}>Cerrar esta sesión</button>}</article>)}
      {Boolean(data?.sessions.some(session => !session.current)) && <button type="button" disabled={busy} onClick={() => setConfirmRevoke('others')}>Cerrar todas las otras sesiones</button>}
      {confirmRevoke && <div className="security-confirm" role="group" aria-label="Confirmar cierre de sesiones"><p>¿Quieres desconectar {confirmRevoke==='others'?'los otros dispositivos':'este dispositivo'}? Tendrán que iniciar sesión de nuevo.</p><button type="button" disabled={busy} onClick={() => void perform(async () => {await authRequest('account/security/sessions/revoke',{sessionId:confirmRevoke});setConfirmRevoke(null);await load();setMessage('Sesión revocada.')})}>Confirmar cierre</button><button type="button" disabled={busy} onClick={() => setConfirmRevoke(null)}>Cancelar</button></div>}
      <h3>Actividad reciente de tu cuenta</h3>{data?.events.map((event,index) => <p key={index}><strong>{eventName(event.action)}</strong><br/>{localDate(event.date)} · IP {event.ip || 'No disponible'}{event.status>=400?' · Rechazado':''}</p>)}
      {user.registration?.canManageAccounts && <><button type="button" disabled={busy} onClick={() => void perform(async () => {setAudit((await authRequest<{events:SecurityEvent[]}>('account/security/audit')).events)})}>Consultar auditoría administrativa</button>{audit && <div className="security-audit" aria-label="Auditoría administrativa">{audit.map(event => <p key={event.id}><strong>{eventName(event.action)}</strong><br/>{localDate(event.date)} · Cuenta {event.userId ?? 'sin identificar'} · Estado {event.status}<br/>{event.resource}</p>)}</div>}</>}
    </>}
  </section>
}
