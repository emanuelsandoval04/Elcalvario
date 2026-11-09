import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { gsap, useGSAP, useAdminMotion, useMediaQuery } from './admin-motion'
import AccountMenu from './AccountMenu'
import AccountNotifications from './AccountNotifications'
import type { AuthUser } from './auth'
import { hasPermission } from './auth'
import { InstallApp, ConnectionStatus } from './pwa'
import './admin-frame.css'
import './app-theme.css'

const iconPaths: Record<string, ReactNode> = {
  training: <><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1ZM12 5v15"/><path d="M6 8h3M15 8h3M6 12h3M15 12h3"/></>,
  mapa: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3ZM9 3v15M15 6v15"/></>,
  home: <><path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/></>,
  more: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  back: <><path d="m12 5-7 7 7 7M5 12h15"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  chevron: <path d="m9 5 7 7-7 7"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  birthday: <><path d="M4 14h16v7H4zM3 14v-3h18v3M8 6v5M12 6v5M16 6v5M8 3v1M12 3v1M16 3v1"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  warning: <><path d="m12 3 10 18H2Z"/><path d="M12 9v5M12 17h.01"/></>,
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  members: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M17 15a5 5 0 0 1 4 5"/></>,
  groups: <><path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-6v-7h-4v7H4a1 1 0 0 1-1-1Z"/></>,
  activities: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18M8 15h2M14 15h2"/></>,
  attendance: <><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="m8 13 3 3 5-6"/></>,
  falls: <><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="m8 13 3 3 5-6"/></>,
  alerts: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  permissions: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/></>,
  reports: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 17v-3M12 17v-5M16 17v-2"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 9l2 2 4-4"/></>,
}
export function AdminIcon({ name }: { name: string }) {
  return <svg className="panel-nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name] || iconPaths.dashboard}</svg>
}

export default function AdminFrame({ title, sectionName, navigation, children, viewKey, user, onUserChange }: {
  title: string; sectionName: string; navigation: ReactNode; children: ReactNode; viewKey: string; user?: AuthUser | null; onUserChange?: (user: AuthUser | null) => void;
}) {
  const root = useRef<HTMLDivElement>(null)
  const sidebar = useRef<HTMLElement>(null)
  const view = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const moreToggle = useRef<HTMLButtonElement>(null)
  const header = useRef<HTMLElement>(null)
  const mobile = useMediaQuery('(max-width: 900px)')
  const [mobileOpen,setMobileOpen]=useState(false)
  const [desktopCompact,setDesktopCompact]=useState(false)
  const open=mobile?mobileOpen:!desktopCompact
  const compact=!mobile&&desktopCompact
  const navigationVisible=!mobile||mobileOpen
  const reduced = useAdminMotion(root)
  const initialized = useRef(false)
  function closeNavigation() {
    setMobileOpen(false)
    requestAnimationFrame(() => (mobile ? moreToggle : toggle).current?.focus({ preventScroll: true }))
  }
  function toggleNavigation() {
    if(mobile){setMobileOpen(value=>!value);return}
    const next=!desktopCompact
    setDesktopCompact(next)
    if(user?.id)try{localStorage.setItem(`calvario-sidebar-${user.id}`,next?'compact':'expanded')}catch{ /* Navigation works when browser storage is unavailable. */ }
  }
  useEffect(()=>{setMobileOpen(false)},[mobile])
  useEffect(()=>{try{setDesktopCompact(Boolean(user?.id&&localStorage.getItem(`calvario-sidebar-${user.id}`)==='compact'))}catch{setDesktopCompact(false)}},[user?.id])
  useEffect(()=>{
    const measure=()=>{if(header.current)root.current?.style.setProperty('--panel-header-height',`${header.current.getBoundingClientRect().height}px`)}
    measure()
    const observer=new ResizeObserver(measure)
    if(header.current)observer.observe(header.current)
    return()=>observer.disconnect()
  },[])

  useGSAP(() => {
    const duration = reduced || !initialized.current ? 0 : .38
    initialized.current = true
    if (mobile) {
      gsap.set(root.current, { '--panel-nav-width': '0px' })
      // Visibility and hit testing belong to React/CSS; GSAP only moves the drawer.
      // This avoids a hidden inline visibility surviving a resize or interrupted tap.
      gsap.to(sidebar.current, { xPercent: 0, yPercent: open ? 0 : 110, clearProps: 'visibility,opacity', duration, ease: 'power3.inOut', overwrite: true })
    } else {
      gsap.set(sidebar.current, { xPercent: 0, yPercent: 0, clearProps: 'visibility,opacity' })
      gsap.to(root.current, { '--panel-nav-width': compact ? '5rem' : '15.5rem', duration, ease: 'power3.inOut', overwrite: true })
    }
  }, { scope: root, dependencies: [open, mobile, compact, reduced] })

  useGSAP(() => {
    if (reduced) return
    gsap.fromTo(view.current, { y: 14, opacity: .2 }, { y: 0, opacity: 1, duration: .4, ease: 'power3.out', clearProps: 'transform,opacity', overwrite: true })
    const active = sidebar.current?.querySelector('[aria-current="page"] .panel-nav-icon')
    if (active) gsap.fromTo(active, { scale: .7, rotation: -12 }, { scale: 1, rotation: 0, duration: .45, ease: 'back.out(1.8)', clearProps: 'transform' })
  }, { scope: root, dependencies: [viewKey, reduced], revertOnUpdate: true })

  useEffect(() => {
    if (!mobile || !open) return
    const previousOverflow = document.body.style.overflow
    if (mobile) {
      document.body.style.overflow = 'hidden'
      sidebar.current?.querySelector<HTMLElement>('button, a[href]')?.focus({ preventScroll: true })
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeNavigation(); return }
      if (!mobile || event.key !== 'Tab') return
      const elements = [...(sidebar.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') || [])]
      const first = elements[0], last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); if (mobile) document.body.style.overflow = previousOverflow }
  }, [open, mobile])

  function selectModule(event: React.MouseEvent) {
    if (!(event.target instanceof Element) || !event.target.closest('[data-panel-item]')) return
    if (mobile) { setMobileOpen(false); requestAnimationFrame(() => view.current?.focus({ preventScroll: true })) }
  }
  const canUse = (codes: string[]) => hasPermission(user || null, 'gestion.acceder') && codes.some(code => hasPermission(user || null, code))
  const home = viewKey === 'dashboard' || viewKey === 'pending'
  const alertPage = window.location.hash.includes('alertas') || window.location.hash === '#gestion/alerts'
  const bottomItems = [
    { key: 'dashboard', label: 'Inicio', icon: 'home', href: '#gestion', allowed: canUse(['gestion.acceder']) },
    { key: 'members', label: 'Discípulos', icon: 'members', href: '#gestion/members', allowed: canUse(['miembros.ver', 'miembros.editar', 'miembros.registrar']) },
    { key: 'falls', label: 'Asistencia', icon: 'attendance', href: '#gestion/falls/registro', allowed: canUse(['asistencia.registrar', 'asistencia.ver']) },
    { key: 'activities', label: 'Eventos', icon: 'activities', href: '#gestion/activities', allowed: canUse(['eventos.editar', 'eventos.publicar', 'grupos.editar', 'asistencia.registrar', 'asistencia.ver']) },
    { key: 'mapa', label: 'Mapa', icon: 'mapa', href: '#gestion/mapa', allowed: canUse(['grupos.ver']) },
  ]
  const moreActive = !bottomItems.some(item => item.key === viewKey) || alertPage
  return <div className="admin-workspace" ref={root} data-navigation-open={open} data-navigation-compact={compact} data-view={viewKey}>
    <header className="panel-topbar" ref={header}>
      <button type="button" ref={toggle} className="panel-menu-toggle" aria-label={mobile ? open ? 'Ocultar navegación del panel' : 'Mostrar navegación del panel' : compact ? 'Expandir menú lateral' : 'Encoger menú lateral'} title={compact?'Expandir menú lateral':'Encoger menú lateral'} aria-expanded={open} aria-controls="panel-navigation" onClick={toggleNavigation}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/>{open && <path d="m8 9-3 3 3 3"/>}</svg>
      </button>
      {!home && <a href="#gestion" className="panel-mobile-back" aria-label="Volver al inicio"><AdminIcon name="back"/></a>}
      <a className={`panel-brand${!home ? ' panel-brand-section' : ''}`} href="#gestion" aria-label="El Calvario, panel de gestión"><img src="/media/logo-compact.webp" alt=""/><span><span className="panel-brand-name">El Calvario</span><span className="panel-mobile-title">{sectionName}</span><small>MI COMUNIDAD · VILLAVICENCIO</small></span></a>
      <AccountNotifications user={user} disabled={mobile && open}/>
      <AccountMenu user={user} onUpdate={onUserChange} disabled={mobile && open}/>
    </header>
    <div className="panel-body">
      {mobile && open && <div className="panel-backdrop" aria-hidden="true" onClick={closeNavigation} />}
      <aside ref={sidebar} id="panel-navigation" className="panel-sidebar" inert={!navigationVisible} aria-hidden={!navigationVisible} role={mobile ? 'dialog' : undefined} aria-modal={mobile && open ? true : undefined} aria-label="Navegación de administración" onClick={selectModule}>
        <div className="panel-sidebar-inner"><div className="panel-sheet-handle"/><div className="panel-sidebar-heading"><span>{mobile ? 'Más opciones' : 'TU COMUNIDAD'}</span>{mobile && <button className="panel-close" aria-label="Cerrar menú" onClick={closeNavigation}>×</button>}</div>
          {navigation}
          <InstallApp/>
          <span className="panel-sidebar-signature">NEXUS CORP</span>
        </div>
      </aside>
      <main className="panel-main" inert={mobile && open}>
        <ConnectionStatus/>
        <div className="panel-page-heading"><span className="panel-breadcrumb">Administración <span>/</span> {sectionName}</span><h1 id="panel-page-title">{title}</h1></div>
        <div ref={view} className="panel-view" tabIndex={-1}>{children}</div>
        <footer className="panel-footer"><span>Misión Cristiana El Calvario Villavicencio</span><span>Desarrollada por <strong>Nexus Corp</strong></span></footer>
      </main>
    </div>
    <nav className="app-bottom-nav" aria-label="Navegación principal" inert={mobile && open}>
      {bottomItems.map(item => item.allowed ? <a key={item.key} href={item.href} aria-current={viewKey === item.key && !(item.key === 'falls' && alertPage) && !open ? 'page' : undefined}><AdminIcon name={item.icon}/><span>{item.label}</span></a> : <span key={item.key} className="app-nav-disabled" aria-disabled="true"><AdminIcon name={item.icon}/><span>{item.label}</span></span>)}
      <button ref={moreToggle} type="button" aria-label="Más opciones" aria-expanded={mobileOpen} aria-controls="panel-navigation" data-active={mobileOpen || moreActive} onClick={()=>setMobileOpen(value=>!value)}><AdminIcon name="more"/><span>Más</span></button>
    </nav>
  </div>
}
