import { photoSources } from './photo-sources'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { authRequest, hasPermission, useAuthSession } from './auth'
import './login.css'
import ValidatedForm from './ValidatedForm'

export default function Login() {
  const [visible, setVisible] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const { checking, user, setUser, error, refresh } = useAuthSession()
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || checking) return
    const form = event.currentTarget
    const values = new FormData(form)
    const email = String(values.get('email') || '')
    const password = String(values.get('password') || '')
    setBusy(true)
    setMessage('')
    try {
      const result = await authRequest('login', { email, password })
      form.reset()
      setVisible(false)
      setUser(result.user || null)
      if (result.user) window.location.hash = '#gestion'
    } catch (error) {
      setMessage(error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'No pudimos conectar con el servidor. Inténtalo nuevamente.')
    } finally { setBusy(false) }
  }

  async function logout() {
    setBusy(true)
    setMessage('')
    try {
      await authRequest('logout', {})
      setUser(null)
      window.location.hash = '#login'
    } catch { setMessage('No pudimos cerrar tu sesión. Inténtalo nuevamente.') }
    finally { setBusy(false) }
  }

  return (
    <main className="login-page" id="login">
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

        <section className="login-form-panel" aria-labelledby="login-title">
          <a className="login-back" href="#inicio"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7"/></svg> Volver al inicio</a>
          <div className="login-welcome-icon" aria-hidden="true"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg></div>
          <span className="login-eyebrow">TU COMUNIDAD, MÁS CERCA</span>
          <h1 id="login-title" ref={heading} tabIndex={-1}>{user ? <>Ya estás<br />en casa.</> : <>Qué bueno<br />verte de nuevo.</>}</h1>
          <p className="login-intro">{user?.state === 'pendiente' ? 'Tu cuenta está esperando la habilitación de la administración.' : user ? 'Tu sesión está activa en El Calvario.' : 'Inicia sesión con tu cuenta de El Calvario.'}</p>

          {user ? (
            <div className="account-summary">
              <span className={`account-status${user.state === 'pendiente' ? ' is-pending' : ''}`}>{user.state === 'pendiente' ? 'Cuenta pendiente de habilitación' : 'Sesión iniciada'}</span>
              <strong>{user.email}</strong>
              <p>Rol: {user.roles.join(', ') || 'Pendiente de asignación'}</p>
              <p>{user.state === 'pendiente' ? 'El Administrador o un cargo pastoral autorizado debe asignarte tu rol. Hasta entonces, las herramientas de gestión estarán deshabilitadas.' : hasPermission(user, 'gestion.acceder') ? 'Las herramientas disponibles corresponden a los permisos de tu rol.' : 'Tu cuenta requiere la asignación de un rol autorizado para acceder a gestión.'}</p>
              {user.state === 'pendiente' && <button className="account-logout" disabled={busy} onClick={() => { setBusy(true); void refresh().then(updated => setMessage(updated?.state === 'pendiente' ? 'Tu cuenta sigue pendiente de habilitación.' : 'Estado de la cuenta actualizado.')).catch(cause => setMessage(cause instanceof Error ? cause.message : 'No pudimos consultar tu cuenta.')).finally(() => setBusy(false)) }}>Consultar habilitación</button>}
              {hasPermission(user, 'gestion.acceder') && <a className="login-submit" href="#gestion">Entrar a gestión</a>}
              {hasPermission(user, 'usuarios.gestionar') && user.registration?.canManageAccounts && <a className="login-submit" href="#usuarios">Administrar usuarios y roles</a>}
              <a className="login-submit" href="#inicio">Volver a la iglesia</a>
              <button className="account-logout" onClick={logout} disabled={busy}>{busy ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
              <div className="login-message" role="status" aria-live="polite">{message || error}</div>
            </div>
          ) : <>
          <ValidatedForm className="login-form" onSubmit={submit}>
            <div className="login-field">
              <label htmlFor="login-email">Correo electrónico</label>
              <div className="login-input-wrap">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/></svg>
                <input id="login-email" name="email" type="email" autoComplete="username" placeholder="tu@correo.com" required maxLength={120} disabled={busy} onChange={() => setMessage('')} />
              </div>
            </div>
            <div className="login-field">
              <label htmlFor="login-password">Contraseña</label>
              <div className="login-input-wrap">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                <input id="login-password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="Escribe tu contraseña" required maxLength={128} disabled={busy} onChange={() => setMessage('')} />
                <button className="login-eye" type="button" aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={visible} onClick={() => setVisible(!visible)}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{visible && <path d="m3 3 18 18"/>}</svg>
                </button>
              </div>
            </div>
            <a className="login-forgot" href="#recuperar">¿Olvidaste tu contraseña?</a>
            <button className="login-submit" type="submit" disabled={busy || checking} aria-busy={busy || checking}><span>{checking ? 'Verificando sesión…' : busy ? 'Iniciando sesión…' : 'Iniciar sesión'}</span>{busy || checking ? <span className="auth-spinner" aria-hidden="true" /> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>}</button>
            <div className="login-message" role="status" aria-live="polite">{message || error}</div>
          </ValidatedForm>

          <p className="login-access-note">Para obtener una cuenta, comunícate con la administración o el equipo pastoral.</p>
          </>}
          <div className="login-signature"><span className="login-signature-line" />Al servicio de nuestra comunidad<span className="login-signature-line" /></div>
        </section>
      </div>
    </main>
  )
}
