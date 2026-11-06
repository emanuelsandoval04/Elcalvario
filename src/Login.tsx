import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { authRequest, hasPermission, useAuthSession } from './auth'
import './login.css'
import ProfilePhoto from './ProfilePhoto'

export default function Login({ registration = false }: { registration?: boolean }) {
  const [visible, setVisible] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [mfa, setMfa] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const { checking, user, setUser, error, refresh } = useAuthSession()
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || photoBusy || checking) return
    const form = event.currentTarget
    const values = new FormData(form)
    const email = String(values.get('email') || '')
    const password = String(values.get('password') || '')
    if (registration && password !== values.get('confirmation')) {
      setMessage('Las contraseñas no coinciden.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const result = await authRequest(mfa ? 'login/mfa' : registration ? 'register' : 'login', mfa ? {code:String(values.get('code') || '')} : { email, password, ...(registration ? { photo } : {}) })
      form.reset()
      if(result.mfaRequired) { setMfa(true); setMessage('Confirma el código de tu autenticador para completar el acceso.'); return }
      setPhoto(null)
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
    <main className={`login-page${registration ? ' register-page' : ''}`} id={registration ? 'registro' : 'login'}>
      <div className="login-layout">
        <section className="login-story" aria-label="Comunidad El Calvario">
          <img src="/660789788_122300754752230206_1313097966135355932_n.jpg" alt="La comunidad de El Calvario reunida" />
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
          <h1 id="login-title" ref={heading} tabIndex={-1}>{user ? <>Ya estás<br />en casa.</> : registration ? <>Tu comunidad,<br />un paso más cerca.</> : <>Qué bueno<br />verte de nuevo.</>}</h1>
          <p className="login-intro">{user?.state === 'pendiente' ? 'Tu cuenta fue creada y está esperando la habilitación de la administración.' : user ? 'Tu sesión está activa en El Calvario.' : registration ? 'Crea tu cuenta para formar parte de nuestra comunidad. La administración habilitará tu acceso.' : 'Inicia sesión con tu cuenta de El Calvario.'}</p>

          {user ? (
            <div className="account-summary">
              <span className={`account-status${user.state === 'pendiente' ? ' is-pending' : ''}`}>{user.state === 'pendiente' ? 'Cuenta pendiente de habilitación' : 'Sesión iniciada'}</span>
              <strong>{user.email}</strong>
              <p>Rol: {user.roles.join(', ') || 'Pendiente de asignación'}</p>
              <p>{user.state === 'pendiente' ? 'Un administrador, pastor o Superadmin debe asignarte tu rol. Hasta entonces, las herramientas de gestión estarán deshabilitadas.' : hasPermission(user, 'gestion.acceder') ? 'Las herramientas disponibles corresponden a los permisos de tu rol.' : 'Tu cuenta requiere la asignación de un rol autorizado para acceder a gestión.'}</p>
              {user.state === 'pendiente' && <button className="account-logout" disabled={busy} onClick={() => { setBusy(true); void refresh().then(updated => setMessage(updated?.state === 'pendiente' ? 'Tu cuenta sigue pendiente de habilitación.' : 'Estado de la cuenta actualizado.')).catch(cause => setMessage(cause instanceof Error ? cause.message : 'No pudimos consultar tu cuenta.')).finally(() => setBusy(false)) }}>Consultar habilitación</button>}
              {hasPermission(user, 'gestion.acceder') && <a className="login-submit" href="#gestion">Entrar a gestión</a>}
              {hasPermission(user, 'usuarios.gestionar') && user.registration?.canManageAccounts && <a className="login-submit" href="#usuarios">Administrar usuarios y roles</a>}
              <a className="login-submit" href="#inicio">Volver a la iglesia</a>
              <button className="account-logout" onClick={logout} disabled={busy}>{busy ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
              <div className="login-message" role="status" aria-live="polite">{message || error}</div>
            </div>
          ) : mfa ? <form className="login-form" onSubmit={submit}><p>Escribe el código de tu aplicación de autenticación o uno de tus códigos de recuperación. La verificación vence en 5 minutos.</p><div className="login-field"><label htmlFor="login-code">Código de autenticación o recuperación</label><div className="login-input-wrap"><input id="login-code" name="code" autoComplete="one-time-code" required maxLength={25} disabled={busy}/></div></div><button className="login-submit" disabled={busy}>Verificar e iniciar sesión</button><button className="login-forgot" type="button" disabled={busy} onClick={() => {void authRequest('logout',{}).then(()=>{setMfa(false);setMessage('')}).catch(()=>setMessage('No pudimos reiniciar el acceso. Inténtalo nuevamente.'))}}>Volver a ingresar correo y contraseña</button><div className="login-message" role="status">{message || error}</div></form> : <>
          <form className="login-form" onSubmit={submit}>
            {registration && <ProfilePhoto value={photo} onChange={setPhoto} onBusyChange={setPhotoBusy} disabled={busy}/>}
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
                <input id="login-password" name="password" type={visible ? 'text' : 'password'} autoComplete={registration ? 'new-password' : 'current-password'} placeholder={registration ? 'Mínimo 10 caracteres' : 'Escribe tu contraseña'} required minLength={registration ? 10 : undefined} maxLength={128} disabled={busy} onChange={() => setMessage('')} />
                <button className="login-eye" type="button" aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={visible} onClick={() => setVisible(!visible)}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{visible && <path d="m3 3 18 18"/>}</svg>
                </button>
              </div>
            </div>
            {registration && <div className="login-field">
              <label htmlFor="register-confirmation">Confirmar contraseña</label>
              <div className="login-input-wrap"><input id="register-confirmation" name="confirmation" type={visible ? 'text' : 'password'} autoComplete="new-password" placeholder="Repite tu contraseña" required minLength={10} maxLength={128} disabled={busy} onChange={() => setMessage('')} /></div>
            </div>}
            {!registration && <button className="login-forgot" type="button" onClick={() => setMessage('Para recuperar tu acceso, comunícate con la administración de la iglesia.')}>¿Olvidaste tu contraseña?</button>}
            <button className="login-submit" type="submit" disabled={busy || photoBusy || checking} aria-busy={busy || photoBusy || checking}><span>{checking ? 'Verificando sesión…' : busy ? (registration ? 'Creando cuenta…' : 'Iniciando sesión…') : registration ? 'Crear cuenta' : 'Iniciar sesión'}</span>{busy || checking ? <span className="auth-spinner" aria-hidden="true" /> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>}</button>
            <div className="login-message" role="status" aria-live="polite">{message || error}</div>
          </form>

          <p className="login-access-note">{registration ? '¿Ya tienes una cuenta?' : '¿Necesitas una cuenta?'}<br /><a href={registration ? '#login' : '#registro'}>{registration ? 'Iniciar sesión' : 'Crear mi cuenta'}</a></p>
          </>}
          <div className="login-signature"><span className="login-signature-line" />Al servicio de nuestra comunidad<span className="login-signature-line" /></div>
        </section>
      </div>
    </main>
  )
}
