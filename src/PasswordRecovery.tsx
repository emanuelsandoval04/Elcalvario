import { photoSources } from './photo-sources'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { authRequest } from './auth'
import './login.css'
import ValidatedForm from './ValidatedForm'

export default function PasswordRecovery({ reset = false }: { reset?: boolean }) {
  const [token, setToken] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] || '').get('token') || '')
  const [checking, setChecking] = useState(reset)
  const [valid, setValid] = useState(false)
  const [busy, setBusy] = useState(false)
  const [visible, setVisible] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)
  const [sent, setSent] = useState(false)
  const [validationVersion, setValidationVersion] = useState(0)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [complete, sent])
  useEffect(() => {
    if (!reset || complete) return
    let active = true
    setChecking(true); setError(''); setValid(false)
    void authRequest('reset-password/validate', { token }).then(() => {
      if (active) setValid(true)
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'No pudimos verificar el enlace.')
    }).finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [reset, token, validationVersion, complete])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || checking) return
    const form = event.currentTarget
    const values = new FormData(form)
    const newPassword = String(values.get('newPassword') || '')
    const confirmation = String(values.get('confirmation') || '')
    if (reset && newPassword !== confirmation) { setError('Las contraseñas no coinciden.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      if (reset) {
        await authRequest('reset-password', { token, newPassword, confirmation })
        form.reset(); setVisible(false); setComplete(true)
        window.history.replaceState(null, '', '#restablecer')
        // The successful view unmounts the form; discard the token from memory.
        setToken('')
        setMessage('Tu contraseña fue actualizada. Inicia sesión con tu nueva contraseña.')
      } else {
        const result = await authRequest<{ message: string }>('forgot-password', { email: String(values.get('email') || '') })
        setMessage(result.message); setSent(true)
      }
    } catch (cause) {
      const failure = cause instanceof Error && cause.name !== 'TimeoutError' ? cause.message : 'No pudimos conectar con el servidor. Inténtalo nuevamente.'
      setError(failure)
      if (reset && failure.startsWith('El enlace no es válido o ya venció.')) setValid(false)
    } finally { setBusy(false) }
  }

  return <main className="login-page recovery-page" id={reset ? 'restablecer' : 'recuperar'}>
    <div className="login-layout">
      <section className="login-story" aria-label="Comunidad El Calvario">
        <img {...photoSources('660789788_122300754752230206_1313097966135355932_n.jpg')} sizes="(max-width: 767px) 100vw, 520px" width="1280" height="960" decoding="async" alt="La comunidad de El Calvario reunida" />
        <div className="login-story-content">
          <span className="login-story-label"><span /> Una iglesia. Una familia.</span>
          <h2>Juntos en la fe.<br /><em>Cerca de cada persona.</em></h2>
          <p>Un espacio para acompañar, servir y cuidar de nuestra comunidad.</p>
          <div className="login-story-footer"><span>Misión Cristiana El Calvario</span><span>Villavicencio, Meta</span></div>
        </div>
      </section>
      <section className="login-form-panel" aria-labelledby="recovery-title">
        <a className="login-back" href="#login">← Volver al inicio de sesión</a>
        <span className="login-eyebrow">CUIDAMOS TU ACCESO</span>
        <h1 id="recovery-title" ref={heading} tabIndex={-1}>{complete ? 'Contraseña actualizada.' : reset ? 'Elige tu nueva contraseña.' : sent ? 'Revisa tu correo.' : 'Recupera tu acceso.'}</h1>
        <p className="login-intro">{complete ? 'Ya puedes volver a tu comunidad.' : reset ? 'El enlace solo puede usarse una vez y vence 15 minutos después de solicitarlo.' : 'Escribe el correo de tu cuenta. Te enviaremos un enlace para cambiar tu contraseña, válido por 15 minutos.'}</p>
        {checking && !complete ? <p role="status" className="recovery-checking"><span className="auth-spinner" aria-hidden="true"/>Verificando enlace…</p> : complete ? <a className="login-submit recovery-action" href="#login">Iniciar sesión</a> : reset && !valid ? <div className="recovery-options"><a className="login-submit recovery-action" href="#recuperar">Solicitar un nuevo enlace</a><button className="account-logout" type="button" onClick={() => setValidationVersion(version => version + 1)}>Volver a verificar</button></div> : sent ? <button className="account-logout" type="button" onClick={() => { setSent(false); setMessage('') }}>Usar otro correo o solicitar otro enlace</button> : <ValidatedForm className="login-form" onSubmit={submit}>
          {reset ? <>
            <div className="login-field"><label htmlFor="recovery-password">Nueva contraseña</label><div className="login-input-wrap"><input id="recovery-password" name="newPassword" type={visible ? 'text' : 'password'} required minLength={10} maxLength={128} autoComplete="new-password" placeholder="Entre 10 y 128 caracteres" disabled={busy} /><button type="button" className="login-eye" aria-label={visible ? 'Ocultar contraseñas' : 'Mostrar contraseñas'} aria-pressed={visible} onClick={() => setVisible(previous => !previous)}>{visible ? 'Ocultar' : 'Ver'}</button></div></div>
            <div className="login-field"><label htmlFor="recovery-confirmation">Confirmar nueva contraseña</label><div className="login-input-wrap"><input id="recovery-confirmation" name="confirmation" type={visible ? 'text' : 'password'} required minLength={10} maxLength={128} autoComplete="new-password" placeholder="Repite tu nueva contraseña" disabled={busy} /></div></div>
          </> : <div className="login-field"><label htmlFor="recovery-email">Correo electrónico</label><div className="login-input-wrap"><input id="recovery-email" name="email" type="email" required maxLength={120} autoComplete="email" placeholder="tu@correo.com" disabled={busy} /></div></div>}
          <button className="login-submit" type="submit" disabled={busy} aria-busy={busy}>{busy ? reset ? 'Guardando contraseña…' : 'Solicitando enlace…' : reset ? 'Guardar nueva contraseña' : 'Enviar enlace de recuperación'}{busy && <span className="auth-spinner" aria-hidden="true"/>}</button>
        </ValidatedForm>}
        {error && !complete && <p className="login-message recovery-feedback" role="alert">{error}</p>}
        {message && <p className="login-message recovery-feedback" role="status">{message}</p>}
        {!reset && <p className="login-access-note">Si no tienes una cuenta, comunícate con la administración o el equipo pastoral.</p>}
      </section>
    </div>
  </main>
}
