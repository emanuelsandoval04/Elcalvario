import { useEffect, useRef, useState } from 'react'

const links = [
  { label: 'Inicio', href: '#inicio' },
  { label: 'Eventos', href: '#eventos' },
  { label: 'Nosotros', href: '#nosotros' },
  { label: 'Ministerios', href: '#ministerios' },
  { label: 'Grupos de Comunión', href: '#grupos-de-comunion' },
  { label: 'Contacto', href: '#contacto' },
]

function Arrow() {
  return <svg className="nav-arrow" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9" /></svg>
}

export default function Navbar({ onNavigate }: { onNavigate: (label: string) => void }) {
  const [open, setOpen] = useState(false)
  const [compact, setCompact] = useState(() => window.scrollY > 48)
  const header = useRef<HTMLElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const updateLogo = () => setCompact(window.scrollY > 48)
    updateLogo()
    window.addEventListener('scroll', updateLogo, { passive: true })
    return () => window.removeEventListener('scroll', updateLogo)
  }, [])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        toggle.current?.focus()
      }
    }
    const desktop = window.matchMedia('(min-width: 1200px)')
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false) }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeWithEscape)
    desktop.addEventListener('change', closeOnDesktop)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeWithEscape)
      desktop.removeEventListener('change', closeOnDesktop)
    }
  }, [open])

  const navigate = (label: string) => {
    onNavigate(label)
    if (open) toggle.current?.focus()
    setOpen(false)
  }

  return (
    <header className={`site-header${compact ? ' is-compact' : ''}`} ref={header}>
      <nav className="navbar" aria-label="Navegación principal">
        <a className="nav-brand" href="#inicio" onClick={() => navigate('Inicio')} aria-label="El Calvario, inicio">
          <svg className="brand-full-logo" viewBox="60 285 1340 550" aria-hidden="true">
            <image href="/media/logo-wide.webp" width="1448" height="1086" />
          </svg>
          <img className="brand-logo" src="/media/logo-compact.webp" width="320" height="276" alt="" aria-hidden="true" decoding="async" />
        </a>
        <div className="nav-capsule">
          <div className="nav-desktop-links" inert={compact}>
            <div className="nav-desktop-inner">
          {links.map(({ label, href }) => <a className="nav-link desktop-link" key={href} href={href} onClick={() => navigate(label)}><span>{label}<Arrow /></span></a>)}
            </div>
          </div>
          <a className="nav-login" href="#login" aria-label="Login" onClick={() => navigate('Login')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>
            <span>Login</span>
          </a>
          <button className="nav-toggle" ref={toggle} aria-label={open ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">{open ? <path d="m6 6 12 12M6 18 18 6"/> : <path d="M4 6h16M4 12h16M4 18h16"/>}</svg>
          </button>
        </div>
        <div id="mobile-navigation" className="mobile-navigation" hidden={!open}>
          {links.map(({ label, href }) => <a className="nav-link" key={href} href={href} onClick={() => navigate(label)}><span>{label}<Arrow /></span></a>)}
        </div>
      </nav>
    </header>
  )
}
