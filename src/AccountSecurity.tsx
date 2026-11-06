import { useEffect, useState } from 'react'
import { authRequest } from './auth'
import type { AuthUser } from './auth'
import './security.css'

type SecurityEvent = { id?: number; userId?: number; action: string; resource?: string; status: number; date: string; ip: string; device?: string }
type Session = { id: string; device: string; ip: string; current: number; lastSeen: string; created: string }
type SecurityData = { sessions: Session[]; events: SecurityEvent[] }
const localDate = (value: string) => new Date(value.endsWith('Z') ? value : value.replace(' ', 'T')+'Z').toLocaleString('es-CO')
const eventName = (action: string) => ({'login.success':'Inicio de sesión','login.mfa_success':'Inicio de sesión con doble factor','login.factor_requested':'Verificación de acceso solicitada','login.factor_failed':'Código de acceso incorrecto','session.logout':'Sesión cerrada','session.revoke':'Dispositivo desconectado','session.revoke_others':'Otras sesiones cerradas','mfa.enabled':'Doble factor activado','mfa.setup_started':'Configuración del autenticador iniciada','mfa.disabled':'Doble factor desactivado','mfa.recovery_regenerated':'Códigos de recuperación renovados','account.password_changed':'Contraseña actualizada','account.email_changed':'Correo actualizado','account.profile_updated':'Perfil actualizado','security.verification_failed':'Verificación de seguridad rechazada','audit.read':'Consulta de auditoría'}[action] || action)

export default function AccountSecurity({ user, onBusy }: { user: AuthUser; onBusy?: (value:boolean) => void }) {
  const [data, setData] = useState<SecurityData | null>(null), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [message, setMessage] = useState('')
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
  return <section className="security-panel" aria-label="Seguridad de la cuenta" aria-busy={busy}>
    <h3>Seguridad y dispositivos</h3>
    {error && <p className="account-feedback is-error" role="alert">{error}</p>}{message && <p className="account-feedback" role="status">{message}</p>}
      <h3>Dispositivos con sesión activa</h3><p>La sesión vence después de 30 minutos sin consultas o al alcanzar su duración máxima. La IP identifica la conexión y puede cambiar.</p>
      <button type="button" disabled={busy} onClick={() => void perform(load)}>Actualizar sesiones</button>
      {data?.sessions.map(session => <article className="security-session" key={session.id}><strong>{session.current ? 'Este dispositivo' : 'Otro dispositivo'}</strong><span>{session.device || 'Navegador sin identificar'}</span><small>IP: {session.ip || 'No disponible'} · Última actividad: {localDate(session.lastSeen)}</small>{!session.current && <button type="button" disabled={busy} onClick={() => setConfirmRevoke(session.id)}>Cerrar esta sesión</button>}</article>)}
      {Boolean(data?.sessions.some(session => !session.current)) && <button type="button" disabled={busy} onClick={() => setConfirmRevoke('others')}>Cerrar todas las otras sesiones</button>}
      {confirmRevoke && <div className="security-confirm" role="group" aria-label="Confirmar cierre de sesiones"><p>¿Quieres desconectar {confirmRevoke==='others'?'los otros dispositivos':'este dispositivo'}? Tendrán que iniciar sesión de nuevo.</p><button type="button" disabled={busy} onClick={() => void perform(async () => {await authRequest('account/security/sessions/revoke',{sessionId:confirmRevoke});setConfirmRevoke(null);await load();setMessage('Sesión revocada.')})}>Confirmar cierre</button><button type="button" disabled={busy} onClick={() => setConfirmRevoke(null)}>Cancelar</button></div>}
      <h3>Actividad reciente de tu cuenta</h3>{data?.events.map((event,index) => <p key={index}><strong>{eventName(event.action)}</strong><br/>{localDate(event.date)} · IP {event.ip || 'No disponible'}{event.status>=400?' · Rechazado':''}</p>)}
      {user.registration?.canManageAccounts && <><button type="button" disabled={busy} onClick={() => void perform(async () => {setAudit((await authRequest<{events:SecurityEvent[]}>('account/security/audit')).events)})}>Consultar auditoría administrativa</button>{audit && <div className="security-audit" aria-label="Auditoría administrativa">{audit.map(event => <p key={event.id}><strong>{eventName(event.action)}</strong><br/>{localDate(event.date)} · Cuenta {event.userId ?? 'sin identificar'} · Estado {event.status}<br/>{event.resource}</p>)}</div>}</>}
  </section>
}
