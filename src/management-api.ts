export async function managementRequest<T = Record<string, unknown>>(path: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(`/api/management/${path}`, {
    method: method || (body === undefined ? 'GET' : 'POST'), credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(path === 'members' && body !== undefined && (!method || method === 'POST') ? 45000 : 20000),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'No pudimos completar la solicitud.')
  return result as T
}
