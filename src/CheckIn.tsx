import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './checkin.css'

type EventInfo = { titulo: string; fecha: string; hora: string; lugar: string; grupo: boolean }
type Result = { result: 'registered' | 'already' | 'visitor' | 'not_found'; nombre?: string }
const longDate = (fecha: string) => new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${fecha}T12:00:00-05:00`))
const closedMessages: Record<string, string> = {
  cancelled: 'Este encuentro fue cancelado, así que no se registra asistencia.',
}

async function checkin<T>(token: string, body?: Record<string, string>): Promise<T> {
  const response = await fetch(`/api/public/checkin/${encodeURIComponent(token)}`, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin', signal: AbortSignal.timeout(20000),
    headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'No pudimos completar el registro. Inténtalo de nuevo.')
  return data as T
}

// Public page opened from the event's QR: document number first, visitor registration otherwise.
export default function CheckIn({ token }: { token: string }) {
  const [info, setInfo] = useState<{ event: EventInfo; state: string } | null>(null)
  const [loadError, setLoadError] = useState('')
  const [step, setStep] = useState<'document' | 'visitor' | 'done'>('document')
  const [documento, setDocumento] = useState('')
  const [nombre, setNombre] = useState('')
  const [fromLookup, setFromLookup] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<Result | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    let active = true
    void checkin<{ event: EventInfo; state: string }>(token).then(result => { if (active) setInfo(result) }).catch(cause => { if (active) setLoadError(cause instanceof Error ? cause.message : 'No pudimos abrir el registro.') })
    return () => { active = false }
  }, [token])
  useEffect(() => { if (info) heading.current?.focus({ preventScroll: true }) }, [step, Boolean(info)])
  async function send(body: Record<string, string>) {
    setBusy(true); setError('')
    try {
      const result = await checkin<Result>(token, body)
      if (result.result === 'not_found') { setFromLookup(true); setStep('visitor'); return }
      setDone(result); setStep('done')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos completar el registro.') }
    finally { setBusy(false) }
  }
  function submitDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (!documento.trim()) { setError('Escribe tu número de cédula.'); return }
    void send({ documento })
  }
  function submitVisitor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    if (nombre.trim().split(/\s+/).length < 2) { setError('Escribe tu nombre completo (nombre y apellido).'); return }
    void send({ nombre, ...(documento.trim() ? { documento } : {}) })
  }
  function again() { setDocumento(''); setNombre(''); setFromLookup(false); setDone(null); setError(''); setStep('document') }
  const event = info?.event
  return <main className="checkin-page">
    <div className="checkin-card">
      <header className="checkin-brand"><img src="/app-icon.svg" alt="" width="40" height="40"/><div><strong>El Calvario</strong><span>Registro de asistencia</span></div></header>
      {!info && !loadError && <p className="checkin-status" role="status"><span className="checkin-spinner" aria-hidden="true"/>Abriendo el registro…</p>}
      {loadError && <div className="checkin-message" role="alert"><h1>Código no disponible</h1><p>{loadError}</p><a className="checkin-secondary" href="#inicio">Ir a la página de la iglesia</a></div>}
      {event && <div className="checkin-event">
        <span>{event.grupo ? 'Reunión de grupo' : 'Encuentro'}</span>
        <strong>{event.titulo}</strong>
        <small>{longDate(event.fecha)} · {event.hora}{event.lugar ? ` · ${event.lugar}` : ''}</small>
      </div>}
      {info && info.state !== 'open' && <div className="checkin-message" role="status"><h1 ref={heading} tabIndex={-1}>Registro no disponible</h1><p>{closedMessages[info.state] || 'El registro no está disponible.'}</p></div>}
      {info?.state === 'open' && step === 'document' && <form className="checkin-form" onSubmit={submitDocument} noValidate>
        <h1 ref={heading} tabIndex={-1}>Registra tu asistencia</h1>
        <p>Escribe tu número de cédula. Si ya estás en nuestra base de datos, tu asistencia quedará registrada al instante.</p>
        <label htmlFor="checkin-document">Número de cédula</label>
        <input id="checkin-document" inputMode="numeric" autoComplete="off" maxLength={30} placeholder="Ej.: 1020304050" value={documento} disabled={busy} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? 'checkin-error' : undefined} onChange={event => { setDocumento(event.target.value); setError('') }}/>
        {error && <p id="checkin-error" className="checkin-error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Registrando…' : 'Registrar mi asistencia'}</button>
        <div className="checkin-divider"><span>¿Es tu primera vez o no tienes cédula registrada?</span></div>
        <button type="button" className="checkin-secondary" disabled={busy} onClick={() => { setFromLookup(false); setError(''); setStep('visitor') }}>Registrarme como visitante</button>
      </form>}
      {info?.state === 'open' && step === 'visitor' && <form className="checkin-form" onSubmit={submitVisitor} noValidate>
        <h1 ref={heading} tabIndex={-1}>Registro de visitante</h1>
        <p>{fromLookup ? <>No encontramos la cédula <b>{documento}</b> en nuestra base de datos. Escribe tu nombre completo y quedarás en la lista de este encuentro como visitante.</> : 'Escribe tu nombre completo y quedarás en la lista de este encuentro como visitante.'}</p>
        <label htmlFor="checkin-name">Nombre completo</label>
        <input id="checkin-name" autoComplete="name" autoCapitalize="words" maxLength={150} placeholder="Nombre y apellido" value={nombre} disabled={busy} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? 'checkin-error' : undefined} onChange={event => { setNombre(event.target.value); setError('') }} autoFocus/>
        {!fromLookup && <><label htmlFor="checkin-visitor-document">Número de documento <span>(opcional)</span></label>
        <input id="checkin-visitor-document" inputMode="numeric" autoComplete="off" maxLength={30} value={documento} disabled={busy} onChange={event => { setDocumento(event.target.value); setError('') }}/></>}
        {error && <p id="checkin-error" className="checkin-error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Registrando…' : 'Registrarme como visitante'}</button>
        <button type="button" className="checkin-secondary" disabled={busy} onClick={again}>Volver</button>
      </form>}
      {step === 'done' && done && <div className="checkin-message checkin-success" role="status">
        <span className="checkin-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></span>
        <h1 ref={heading} tabIndex={-1}>{done.result === 'already' ? 'Tu asistencia ya estaba registrada' : done.result === 'visitor' ? '¡Registro de visitante listo!' : '¡Asistencia registrada!'}</h1>
        <p className="checkin-name">{done.nombre}</p>
        <p>{done.result === 'already' ? 'No necesitas hacer nada más. ¡Gracias por estar aquí!' : done.result === 'visitor' ? 'Quedaste en la lista de este encuentro como visitante. ¡Gracias por acompañarnos!' : 'Te damos la bienvenida. ¡Qué bueno tenerte aquí!'}</p>
        <button type="button" onClick={again}>Registrar a otra persona</button>
      </div>}
      <p className="checkin-privacy">Usamos estos datos solo para el registro de asistencia de la iglesia.</p>
    </div>
  </main>
}
