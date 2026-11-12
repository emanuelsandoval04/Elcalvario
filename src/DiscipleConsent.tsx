import { useEffect, useId, useRef, useState } from 'react'
import { managementRequest as api } from './management-api'
import { downloadReport } from './report-download'
import { phoneAuthError, phoneAuthReady, sendPhoneCode } from './phone-auth'
import type { PhoneVerification } from './phone-auth'
import './disciple-consent.css'

type Evidence = { id_consentimiento: number; estado_consentimiento: string; medio: string; fecha_aceptacion: string | null; fecha_revocacion: string | null; id_documento: number | null; fecha_subida: string | null; nombre_archivo: string | null; celular: string | null; registrado_por: string | null }
type Consent = { accepted: boolean; revoked: boolean; method: string | null; acceptedAt: string | null; acceptedPhone: string | null; currentId: number | null; canManage: boolean; canReadFiles: boolean; items: Evidence[]; phoneReady?: boolean; phone?: string | null; phoneNumber?: string | null; authorizationText?: string }
const colombiaDate = (value: string) => new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long', timeStyle: 'short' }).format(new Date(value))
const errorMessage = (cause: unknown) => cause instanceof Error ? cause.message : 'No pudimos completar la operación.'
const methodLabel = (item: Evidence) => item.medio === 'sms' ? 'Autorización por SMS' : item.id_documento ? 'Ficha firmada (registro anterior)' : 'Registro anterior'
const resendSeconds = 60

// Data-treatment authorization: Firebase sends a code by SMS to the disciple; typing it back registers the authorization.
export default function DiscipleConsent({ memberId, notify }: { memberId: number; notify: (message: string) => void }) {
  const id = useId()
  const recaptcha = useRef<HTMLDivElement>(null)
  const verification = useRef<PhoneVerification | null>(null)
  const [consent, setConsent] = useState<Consent | null>(null)
  const [code, setCode] = useState('')
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [loadError, setLoadError] = useState('')
  const [revoking, setRevoking] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  async function load() {
    try { setConsent(await api<Consent>(`members/${memberId}/consents`)); setLoadError('') }
    catch (cause) { setLoadError(errorMessage(cause)) }
  }
  function reset() { verification.current?.cancel(); verification.current = null; setSentAt(null); setCode('') }
  useEffect(() => { setConsent(null); reset(); setError(''); void load(); return reset }, [memberId])
  useEffect(() => { if (!sentAt) return; const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [sentAt])
  const waitSeconds = sentAt ? Math.max(0, Math.ceil((sentAt + resendSeconds * 1000 - now) / 1000)) : 0
  async function send() {
    if (!consent?.phoneNumber || !recaptcha.current) return
    setBusy('send'); setError('')
    try {
      verification.current?.cancel()
      verification.current = await sendPhoneCode(consent.phoneNumber, recaptcha.current)
      setSentAt(Date.now()); setNow(Date.now()); setCode('')
      notify(`Código enviado por SMS al ${consent.phone}.`)
    } catch (cause) { verification.current = null; setError(phoneAuthError(cause)) } finally { setBusy('') }
  }
  async function confirm() {
    if (!/^\d{6}$/.test(code)) { setError('Escribe los 6 dígitos del código.'); return }
    if (!verification.current) { setError('Envía un código primero.'); return }
    setBusy('confirm'); setError('')
    let token: string
    try { token = await verification.current.confirm(code) }
    catch (cause) { setError(phoneAuthError(cause)); setBusy(''); return }
    try { await api(`members/${memberId}/consents/phone`, { idToken: token }); reset(); notify('Autorización de datos registrada.'); await load() }
    catch (cause) { reset(); setError(errorMessage(cause)) } finally { setBusy('') }
  }
  async function revoke() {
    setBusy('revoke'); setError('')
    try { await api(`members/${memberId}/consents/${consent?.currentId}/revoke`, {}); setRevoking(false); notify('Revocación registrada. La autorización anterior queda en el historial.'); await load() }
    catch (cause) { setError(errorMessage(cause)) } finally { setBusy('') }
  }
  async function download(item: Evidence) {
    setBusy('download'); setError('')
    try { await downloadReport(`members/${memberId}/consents/${item.id_documento}/file`, item.nombre_archivo || 'ficha-firmada.pdf') } catch (cause) { setError(errorMessage(cause)) } finally { setBusy('') }
  }
  const status = !consent ? '' : consent.accepted ? 'Autorizado' : consent.revoked ? 'Autorización revocada' : 'Sin autorización'
  const ready = Boolean(consent?.phoneReady) && phoneAuthReady()
  return <section className="disciple-consent" aria-labelledby={`${id}-title`}>
    <div className="consent-heading"><div><h4 id={`${id}-title`}>Autorización de tratamiento de datos</h4><p>Se confirma con un código que llega por SMS al celular del discípulo.</p></div>
      {consent && <span className={`consent-badge ${consent.accepted ? 'is-signed' : 'is-missing'}`} role="status">{status}</span>}
    </div>
    {loadError ? <div role="alert" className="consent-error">{loadError} <button type="button" className="secondary" onClick={() => void load()}>Reintentar</button></div> : !consent && <p role="status">Consultando autorización…</p>}
    {consent && <>
      <p className="consent-date">{consent.accepted && consent.acceptedAt
        ? <><strong>Autorizó el {colombiaDate(consent.acceptedAt)}</strong>{consent.method === 'sms' ? ` · código verificado en el ${consent.acceptedPhone || 'celular registrado'}` : ' · con ficha firmada'}</>
        : consent.revoked ? 'La persona revocó su autorización. Puedes solicitarla de nuevo con un código.' : 'Todavía no ha autorizado el tratamiento de sus datos.'}</p>
      {consent.canManage && !consent.accepted && <div className="consent-sms">
        {!ready ? <p className="consent-note">La verificación por SMS aún no está configurada (Firebase).</p>
          : !consent.phoneNumber ? <p className="consent-note">Para enviar el código, la ficha necesita un celular válido de 10 dígitos que empiece por 3.</p>
          : <>
            {consent.authorizationText && <p className="consent-preview"><span>Léele esto a la persona:</span> {consent.authorizationText}</p>}
            {sentAt ? <form className="consent-code" onSubmit={event => { event.preventDefault(); void confirm() }}>
              <p>Enviamos un código al <strong>{consent.phone}</strong>. Pide a la persona que te lo dicte.</p>
              <label htmlFor={`${id}-code`}>Código de 6 dígitos</label>
              <div className="consent-code-row">
                <input id={`${id}-code`} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} disabled={Boolean(busy)} onChange={event => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }} placeholder="000000"/>
                <button type="submit" disabled={Boolean(busy) || code.length !== 6}>{busy === 'confirm' ? 'Confirmando…' : 'Confirmar autorización'}</button>
              </div>
              <button type="button" className="secondary" disabled={Boolean(busy) || waitSeconds > 0} onClick={() => void send()}>{waitSeconds > 0 ? `Reenviar código (${waitSeconds} s)` : busy === 'send' ? 'Enviando…' : 'Reenviar código'}</button>
            </form>
              : <button type="button" disabled={Boolean(busy)} onClick={() => void send()}>{busy === 'send' ? 'Enviando código…' : `Enviar código por SMS al ${consent.phone}`}</button>}
          </>}
        <div ref={recaptcha} className="consent-recaptcha"/>
      </div>}
      {consent.canManage && consent.accepted && <div className="consent-revoke">{revoking ? <><p>Registra esta acción únicamente si el titular solicitó revocar la autorización. Quedará en el historial.</p><button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => void revoke()}>Confirmar revocación</button><button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => setRevoking(false)}>Cancelar</button></> : <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => setRevoking(true)}>Registrar revocación</button>}</div>}
      {consent.canManage && !!consent.items.length && <details className="consent-history"><summary>Historial de autorizaciones ({consent.items.length})</summary><ul>{consent.items.map(item => <li key={item.id_consentimiento}><div><strong>{methodLabel(item)}</strong>
        <p>{item.fecha_aceptacion || item.fecha_subida ? colombiaDate(String(item.fecha_aceptacion || item.fecha_subida)) : 'Sin fecha'}{item.celular ? ` · ${item.celular}` : ''}{item.registrado_por ? ` · registró ${item.registrado_por}` : ''} · {item.estado_consentimiento}</p>
        {item.fecha_revocacion && <p>Revocado el {colombiaDate(item.fecha_revocacion)}</p>}</div>
        {item.id_documento && consent.canReadFiles && <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => void download(item)}>Descargar ficha firmada</button>}</li>)}</ul></details>}
    </>}
    {error && <p role="alert" className="consent-error">{error}</p>}
  </section>
}
