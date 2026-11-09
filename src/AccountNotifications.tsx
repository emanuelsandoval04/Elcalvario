import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { authRequest } from './auth'
import type { AuthUser } from './auth'
import './account-notifications.css'

type Notice = { id: string; type: 'account' | 'event'; title: string; message: string; createdAt: string; href: string }
type Notifications = { total: number; items: Notice[]; canManageAccounts: boolean }

function SwipeNotice({ item, busy, onDismiss, onVisit }: { item: Notice; busy: boolean; onDismiss: () => void; onVisit: () => void }) {
  const [offset, setOffset] = useState(0)
  const drag = useRef<{ x: number; y: number; pointer: number } | null>(null)
  const suppressClick = useRef(false)
  function finish(event: ReactPointerEvent<HTMLDivElement>) {
    const start = drag.current
    drag.current = null
    setOffset(0)
    if (!start || start.pointer !== event.pointerId || busy) return
    const dx = event.clientX - start.x, dy = event.clientY - start.y
    if (Math.abs(dx) >= 72 && Math.abs(dx) > Math.abs(dy) * 1.3) { suppressClick.current = true; onDismiss() }
  }
  return <li className="notification-swipe">
    <div className="notification-swipe-hint" aria-hidden="true">Descartar</div>
    <div className={`notification-card${offset ? ' is-dragging' : ''}`} style={{ transform: `translateX(${offset}px)` }}
      onPointerDown={event => {
        if (busy || !event.isPrimary || event.button !== 0) return
        suppressClick.current = false
        if ((event.target as Element).closest('button')) return
        drag.current = { x: event.clientX, y: event.clientY, pointer: event.pointerId }
      }}
      onPointerMove={event => {
        const start = drag.current
        if (!start || start.pointer !== event.pointerId) return
        const dx = event.clientX - start.x, dy = event.clientY - start.y
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) {
          event.currentTarget.setPointerCapture(event.pointerId)
          suppressClick.current = true
          setOffset(Math.max(-240, Math.min(240, dx)))
        }
      }}
      onPointerUp={finish}
      onPointerCancel={() => { drag.current = null; setOffset(0) }}
      onLostPointerCapture={event => { if (event.target === event.currentTarget) { drag.current = null; setOffset(0) } }}
      onClickCapture={event => { if (suppressClick.current && event.detail > 0) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false } }}>
      <div className="notification-content"><small>{item.type === 'account' ? 'Solicitud de cuenta' : 'Eventos y cultos'}</small><strong>{item.title}</strong><span>{item.message}</span><small>{new Date(item.createdAt).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}</small><a href={item.href} draggable={false} onClick={onVisit}>{item.type === 'account' ? 'Revisar cuenta' : 'Ver evento'}</a></div>
      <button className="notification-dismiss" type="button" aria-label={`Descartar notificación: ${item.title}`} title="Descartar notificación" disabled={busy} onClick={onDismiss}>×</button>
    </div>
  </li>
}

export default function AccountNotifications({ user, disabled = false }: { user?: AuthUser | null; disabled?: boolean }) {
  const allowed = Boolean(user && ['activo', 'pendiente'].includes(user.state))
  const accessKey = JSON.stringify([user?.id, allowed, user?.roles, user?.permissions, user?.registration])
  const [data, setData] = useState<Notifications | null>(null)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const dismissed = useRef(new Set<string>())
  const identity = useRef(accessKey)
  identity.current = accessKey
  const root = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    setData(null); setError(''); setOpen(false); setFeedback(''); setPending(null)
    dismissed.current.clear()
    if (!allowed) return
    let active = true, running = false, queued = false, lastStarted = -Infinity
    const refresh = async () => {
      if (!active || document.visibilityState !== 'visible' || !navigator.onLine) return
      if (running) { queued = true; return }
      running = true
      lastStarted = Date.now()
      try {
        const result = await authRequest<Notifications>('notifications')
        if (active) {
          const hidden = result.items.filter(item => dismissed.current.has(item.id)).length
          const next = { ...result, total: Math.max(0, result.total - hidden), items: result.items.filter(item => !dismissed.current.has(item.id)) }
          setData(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
          setError('')
        }
      } catch (cause) {
        if (active) { setData(null); setError(cause instanceof Error ? cause.message : 'No pudimos consultar las notificaciones.') }
      } finally {
        running = false
        if (active && queued) { queued = false; void refresh() }
      }
    }
    const resume = () => { if (Date.now() - lastStarted >= 1000) void refresh() }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 15000)
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('online', resume)
    window.addEventListener('calvario-users-updated', refresh)
    window.addEventListener('calvario-notifications-refresh', refresh)
    return () => {
      active = false; window.clearInterval(timer)
      window.removeEventListener('focus', resume)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('online', resume)
      window.removeEventListener('calvario-users-updated', refresh)
      window.removeEventListener('calvario-notifications-refresh', refresh)
    }
  }, [accessKey])

  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  useEffect(() => {
    if (!open) return
    const pointer = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); toggle.current?.focus() }
    }
    document.addEventListener('pointerdown', pointer)
    const node = root.current
    node?.addEventListener('keydown', keyboard)
    return () => { document.removeEventListener('pointerdown', pointer); node?.removeEventListener('keydown', keyboard) }
  }, [open])

  async function dismiss(item: Notice) {
    if (pending) return
    const currentIdentity = accessKey
    setPending(item.id); setFeedback('')
    try {
      await authRequest('notifications/dismiss', { id: item.id })
      if (identity.current !== currentIdentity) return
      dismissed.current.add(item.id)
      heading.current?.focus({ preventScroll: true })
      setData(previous => previous ? { ...previous, total: Math.max(0, previous.total - Number(previous.items.some(notice => notice.id === item.id))), items: previous.items.filter(notice => notice.id !== item.id) } : previous)
      setFeedback('Notificación descartada.')
      window.dispatchEvent(new Event('calvario-notifications-refresh'))
    } catch (cause) {
      if (identity.current === currentIdentity) setFeedback(cause instanceof Error ? cause.message : 'No pudimos descartar la notificación.')
    } finally { if (identity.current === currentIdentity) setPending(null) }
  }

  if (!allowed) return null
  const label = `Notificaciones${data ? `: ${data.total}` : ''}`
  const visit = () => { setOpen(false); window.dispatchEvent(new Event('calvario-users-updated')) }
  return <div className="account-notifications" ref={root} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false) }}>
    <button ref={toggle} className="panel-notifications" type="button" aria-label={label} title={label} aria-expanded={open} aria-controls="account-notifications-panel" disabled={disabled} onClick={() => { setOpen(!open); window.dispatchEvent(new Event('calvario-notifications-refresh')) }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>
      {Boolean(data?.total) && <span className="account-notifications-badge" aria-hidden="true">{data!.total > 99 ? '99+' : data!.total}</span>}
    </button>
    {open && <section className="account-notifications-panel" id="account-notifications-panel" aria-label="Notificaciones">
      <h2 ref={heading} tabIndex={-1}>Notificaciones</h2>
      {error ? <p role="alert">{error}</p> : !data ? <p role="status">Consultando notificaciones…</p> : data.total === 0 ? <p>No tienes notificaciones nuevas.</p> : <>
        <p className="notification-help">Desliza un aviso a los lados para descartarlo.{data.canManageAccounts && ' Descartar el aviso no rechaza la solicitud.'}</p>
        <p role="status">{data.total === 1 ? '1 notificación nueva.' : `${data.total} notificaciones nuevas.`}</p>
        <ul>{data.items.map(item => <SwipeNotice key={item.id} item={item} busy={pending !== null} onDismiss={() => void dismiss(item)} onVisit={visit}/>)}</ul>
      </>}
      <p role="status" aria-live="polite">{feedback}</p>
      {data?.canManageAccounts && <a href="#usuarios" onClick={visit}>Revisar usuarios y solicitudes</a>}
      <a href="#eventos" onClick={() => setOpen(false)}>Ver eventos y cultos</a>
    </section>}
  </div>
}
