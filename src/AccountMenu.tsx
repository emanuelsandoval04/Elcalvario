import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { authRequest } from './auth'
import type { AuthUser } from './auth'
import { gsap, useGSAP, useMediaQuery } from './admin-motion'
import './account.css'
import ProfilePhoto, { ProfileAvatar } from './ProfilePhoto'
import { displaySizes } from './display-size'
import type { DisplaySize } from './display-size'

type Section = 'profile' | 'password' | 'photo' | 'display'
const describeError = (cause: unknown) => cause instanceof Error && cause.name !== 'TimeoutError' ? cause.message : 'No pudimos conectar con el servidor. Inténtalo nuevamente.'

function AccountSettings({ user, initialSection, onClose, onUpdate }: { user: AuthUser; initialSection: Section; onClose: () => void; onUpdate: (user: AuthUser) => void }) {
  const dialog = useRef<HTMLDivElement>(null)
  const [section, setSection] = useState(initialSection)
  const [name, setName] = useState(user.name || '')
  const [email, setEmail] = useState(user.email)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [photo, setPhoto] = useState<string | null>(user.photoUrl)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [displaySize, setDisplaySize] = useState<DisplaySize>(user.displaySize || 'normal')
  const [message, setMessage] = useState('')
  const [failure, setFailure] = useState(false)
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const emailChanged = email.trim().toLowerCase() !== user.email

  useGSAP(() => {
    if (!reduced) gsap.fromTo(dialog.current, { y: 18, scale: .98, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: .3, ease: 'power3.out', clearProps: 'transform,opacity' })
  }, { scope: dialog, dependencies: [reduced], revertOnUpdate: true })

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const application = document.getElementById('root')
    const previousInert = application?.inert
    document.body.style.overflow = 'hidden'
    if (application) application.inert = true
    dialog.current?.querySelector<HTMLElement>(initialSection === 'profile' ? '#account-name' : initialSection === 'photo' ? '.profile-photo-choose' : initialSection === 'display' ? 'input[name=display-size]:checked' : '#account-current-password')?.focus({ preventScroll: true })
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose(); return }
      if (event.key !== 'Tab') return
      const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]') || [])].filter(control => control.getClientRects().length)
      const first = controls[0], last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keyboard, true)
    return () => { document.body.style.overflow = previousOverflow; if (application) application.inert = previousInert || false; document.removeEventListener('keydown', keyboard, true) }
  }, [initialSection, onClose])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || photoBusy || section === 'photo' && photo === user.photoUrl || section === 'display' && displaySize === user.displaySize) return
    setMessage(''); setFailure(false)
    if (section === 'password' && newPassword !== confirmation) { setMessage('Las contraseñas no coinciden.'); setFailure(true); return }
    setBusy(true)
    try {
      const result = await authRequest(`account/${section === 'display' ? 'preferences' : section}`, section === 'display' ? { displaySize } : section === 'photo' ? { photo } : section === 'profile' ? { name, email, currentPassword } : { currentPassword, newPassword })
      if (result.user) {
        onUpdate(result.user)
        setName(result.user.name || ''); setEmail(result.user.email)
        setPhoto(result.user.photoUrl)
        setDisplaySize(result.user.displaySize)
        window.dispatchEvent(new Event('calvario-account-updated'))
      }
      setCurrentPassword(''); setNewPassword(''); setConfirmation(''); setVisible(false)
      setMessage(section === 'display' ? 'Tamaño de la interfaz guardado en tu cuenta.' : section === 'photo' ? photo ? 'Foto de perfil actualizada.' : 'Foto de perfil eliminada.' : section === 'profile' ? 'Datos de la cuenta actualizados.' : 'Contraseña actualizada.')
    } catch (cause) { setMessage(describeError(cause)); setFailure(true) }
    finally { setBusy(false) }
  }
  function select(next: Section) { setSection(next); setCurrentPassword(''); setNewPassword(''); setConfirmation(''); setMessage(''); setVisible(false) }

  return createPortal(<div className="account-overlay" onClick={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <div ref={dialog} className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title">
      <div className="account-dialog-heading"><div><span className="account-eyebrow">TU PERFIL</span><h2 id="account-title">Opciones de la cuenta</h2></div><button type="button" className="account-close" aria-label="Cerrar opciones de la cuenta" disabled={busy} onClick={onClose}>×</button></div>
      <nav className="account-tabs" aria-label="Secciones de la cuenta"><button type="button" aria-pressed={section === 'profile'} disabled={busy || photoBusy} onClick={() => select('profile')}>Nombre y correo</button><button type="button" aria-pressed={section === 'photo'} disabled={busy || photoBusy} onClick={() => select('photo')}>Foto de perfil</button><button type="button" aria-pressed={section === 'password'} disabled={busy || photoBusy} onClick={() => select('password')}>Contraseña</button><button type="button" aria-pressed={section === 'display'} disabled={busy || photoBusy} onClick={() => select('display')}>Tamaño de la interfaz</button></nav>
      <form className="account-form" onSubmit={save} aria-busy={busy}>
        {section === 'display' && <><p className="account-help">Ajusta textos, botones e iconos para leer con más comodidad. La elección se guardará solo en tu cuenta.</p><fieldset className="display-size-options" disabled={busy}><legend>Tamaño de la interfaz</legend>{displaySizes.map(size => <label key={size.value} className="display-size-choice"><input type="radio" name="display-size" value={size.value} checked={displaySize === size.value} onChange={() => { setDisplaySize(size.value); setMessage('') }}/><span><strong>{size.label}</strong><small>{size.detail}</small></span><span className="display-size-example" data-size={size.value} aria-hidden="true">Aa</span></label>)}</fieldset></>}
        {section === 'photo' && <ProfilePhoto value={photo} onChange={setPhoto} onBusyChange={setPhotoBusy} disabled={busy}/>}
        {section === 'profile' && <>
          {user.memberId && <p className="account-help"><strong>Libro de adiestramiento actual:</strong> {user.trainingBook?.name || 'Sin libro asignado'}</p>}
          <label htmlFor="account-name">Nombre<input id="account-name" name="name" autoComplete="name" required maxLength={100} value={name} onChange={event => setName(event.target.value)} disabled={busy}/></label>
          <label htmlFor="account-email">Correo electrónico<input id="account-email" name="email" type="email" autoComplete="username" required maxLength={120} value={email} onChange={event => setEmail(event.target.value)} disabled={busy}/></label>
          {emailChanged && <p className="account-help">Confirma tu contraseña actual para cambiar el correo con el que inicias sesión.</p>}
        </>}
        {section === 'password' && <p className="account-help">Elige una contraseña de entre 10 y 128 caracteres.</p>}
        {(section === 'password' || section === 'profile' && emailChanged) && <label htmlFor="account-current-password">Contraseña actual<input id="account-current-password" name="currentPassword" type={visible ? 'text' : 'password'} autoComplete="current-password" required maxLength={128} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} disabled={busy}/></label>}
        {section === 'password' && <>
          <label htmlFor="account-new-password">Nueva contraseña<input id="account-new-password" name="newPassword" type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={10} maxLength={128} value={newPassword} onChange={event => setNewPassword(event.target.value)} disabled={busy}/></label>
          <label htmlFor="account-confirmation">Confirmar nueva contraseña<input id="account-confirmation" name="confirmation" type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={10} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy}/></label>
        </>}
        {(section === 'password' || section === 'profile' && emailChanged) && <button className="account-show-password" type="button" aria-pressed={visible} disabled={busy} onClick={() => setVisible(!visible)}>{visible ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}</button>}
        <div className={`account-feedback${failure ? ' is-error' : ''}`} role={failure ? 'alert' : 'status'} aria-live="polite">{message}</div>
        <button className="account-primary" type="submit" disabled={busy || photoBusy || section === 'photo' && photo === user.photoUrl || section === 'display' && displaySize === user.displaySize}>{busy ? 'Guardando…' : section === 'display' ? 'Guardar tamaño' : section === 'photo' ? 'Guardar foto' : section === 'profile' ? 'Guardar datos' : 'Actualizar contraseña'}</button>
      </form>
    </div>
  </div>, document.body)
}

export default function AccountMenu({ user, onUpdate, disabled = false }: { user?: AuthUser | null; onUpdate?: (user: AuthUser | null) => void; disabled?: boolean }) {
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const dropdown = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<Section | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  useEffect(() => {
    if (disabled || !user) setOpen(false)
    if (!user) setSection(null)
  }, [disabled, user])
  useEffect(() => {
    if (!open) return
    dropdown.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus({ preventScroll: true })
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false) }
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); setOpen(false); trigger.current?.focus(); return }
      const items = [...(dropdown.current?.querySelectorAll<HTMLElement>('[role=menuitem]') || [])]
      const index = items.findIndex(item => item === document.activeElement)
      if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
        event.preventDefault()
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length-1 : (index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length
        items[next]?.focus()
      } else if (event.key === 'Tab') setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', keyboard, true)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keyboard, true) }
  }, [open])
  useGSAP(() => {
    if (open && !reduced) gsap.fromTo(dropdown.current, { y: -8, opacity: .2 }, { y: 0, opacity: 1, duration: .22, ease: 'power2.out', clearProps: 'transform,opacity' })
  }, { scope: container, dependencies: [open, reduced], revertOnUpdate: true })
  // Stable callback prevents focus/scroll setup from restarting after each keystroke.
  const closeDialog = useRef(() => { setSection(null); requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true })) }).current
  function edit(next: Section) { setOpen(false); setSection(next); setError('') }
  async function logout() {
    setBusy(true); setError('')
    try { await authRequest('logout', {}); onUpdate?.(null); window.dispatchEvent(new Event('calvario-account-updated')); window.location.hash = '#login' }
    catch (cause) { setError(describeError(cause)) }
    finally { setBusy(false) }
  }
  if (!user) return <a className="panel-account" href="#login" aria-label="Iniciar sesión"><span className="panel-avatar" aria-hidden="true">C</span><span className="panel-account-label">Iniciar sesión</span></a>
  return <div ref={container} className="panel-account-menu">
    <button ref={trigger} type="button" className="panel-account" aria-label="Mi cuenta" title={user.email} aria-haspopup="menu" aria-expanded={open} aria-controls="account-menu" disabled={disabled || busy} onClick={() => setOpen(!open)} onKeyDown={event => { if (['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true) } }}><ProfileAvatar photoUrl={user.photoUrl} name={user.name || user.email}/><span className="panel-account-label">{user.name || 'Mi cuenta'}<small>{user.email}</small></span></button>
    {open && <div ref={dropdown} className="account-dropdown" id="account-menu" role="menu" aria-label="Opciones de la cuenta">
      <div className="account-menu-summary" role="presentation"><strong>{user.name || 'Mi cuenta'}</strong><span>{user.email}</span></div>
      <button type="button" role="menuitem" onClick={() => edit('profile')}>Actualizar nombre y correo</button>
      <button type="button" role="menuitem" onClick={() => edit('photo')}>Actualizar foto de perfil</button>
      <button type="button" role="menuitem" onClick={() => edit('password')}>Cambiar contraseña</button>
      <button type="button" role="menuitem" onClick={() => edit('display')}>Tamaño de la interfaz</button>
      <button type="button" role="menuitem" className="account-menu-logout" disabled={busy} onClick={() => void logout()}>{busy ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
      {error && <p className="account-feedback is-error" role="alert">{error}</p>}
    </div>}
    {section && <AccountSettings user={user} initialSection={section} onClose={closeDialog} onUpdate={updated => onUpdate?.(updated)}/>}
  </div>
}
