import { useCallback, useEffect, useState } from 'react'
import { applyDisplaySize } from './display-size'
import type { DisplaySize } from './display-size'

export type AuthUser = { id: number; code?: string | null; memberId: number | null; name: string | null; photoUrl: string | null; trainingBook?: { id: number; name: string } | null; displaySize: DisplaySize; email: string; state: 'activo' | 'pendiente' | 'inactivo' | 'bloqueado'; roles: string[]; permissions: Record<string, 'todos' | 'grupo'>; pastoralRole: { name: string; level: number } | null; registration: { canCreateAdministrative: boolean; canAssignServices: boolean; canManageAccounts: boolean } }
// Disciples are numbered 0101, 0102...; the server sends the stored number.
export const memberCode = (value: unknown) => value == null || value === '' ? null : String(value).padStart(4, '0')
export const hasPermission = (user: AuthUser | null, code: string) => user?.state === 'activo' && Boolean(user.permissions[code])

type AuthResult = { user?: AuthUser | null; error?: string; ok?: boolean }
let pendingSession: Promise<AuthResult> | null = null
export function authRequest<T extends object = AuthResult>(path: string, data?: object): Promise<T & AuthResult> {
  // Share simultaneous checks, without caching permissions between requests.
  if (path === 'me' && !data) {
    if (!pendingSession) {
      const request = sendAuthRequest(path).finally(() => { if (pendingSession === request) pendingSession = null })
      pendingSession = request
    }
    return pendingSession as Promise<T & AuthResult>
  }
  if (data) pendingSession = null
  return sendAuthRequest<T>(path, data)
}

async function sendAuthRequest<T extends object = AuthResult>(path: string, data?: object): Promise<T & AuthResult> {
  const response = await fetch(`/api/auth/${path}`, {
    method: data ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: data ? { 'Content-Type': 'application/json' } : undefined,
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(10000),
  })
  if ([502, 504].includes(response.status)) {
    throw new Error('El servidor de inicio de sesión no está disponible. Inténtalo nuevamente en unos minutos.')
  }
  const result = await response.json() as T & AuthResult
  if (!response.ok) {
    if (path === 'me' && response.status === 401) { applyDisplaySize('normal'); return { user: null } as T & AuthResult }
    throw new Error(result.error || 'No pudimos completar la solicitud.')
  }
  if ('user' in result) applyDisplaySize(result.user?.displaySize)
  if (path === 'logout') applyDisplaySize('normal')
  return result
}

// Refresh permissions on return to the tab and while it remains visible.
export function useAuthSession() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    const result = await authRequest('me')
    setUser(previous => JSON.stringify(previous) === JSON.stringify(result.user || null) ? previous : result.user || null)
    setError('')
    return result.user || null
  }, [])
  useEffect(() => {
    let active = true, running = false, lastStarted = -Infinity
    const check = async () => {
      if (running) return
      running = true
      lastStarted = Date.now()
      try {
        const result = await authRequest('me')
        if (active) {
          setUser(previous => JSON.stringify(previous) === JSON.stringify(result.user || null) ? previous : result.user || null)
          setError('')
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'No pudimos verificar tu sesión.')
      } finally { running = false; if (active) setChecking(false) }
    }
    const resume = () => { if (document.visibilityState === 'visible' && navigator.onLine && Date.now() - lastStarted >= 1000) void check() }
    const accountUpdated = () => { if (document.visibilityState === 'visible') void check() }
    void check()
    const timer = window.setInterval(resume, 15000)
    window.addEventListener('focus', resume)
    window.addEventListener('calvario-account-updated', accountUpdated)
    window.addEventListener('online', resume)
    document.addEventListener('visibilitychange', resume)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', resume); window.removeEventListener('calvario-account-updated', accountUpdated); window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume) }
  }, [])
  return { user, setUser, checking, error, refresh }
}
