export type PublicMinistry = { nombre: string; descripcion: string | null }
let pending: Promise<PublicMinistry[]> | null = null

// Both the public list and participation form consume the same read-only catalog.
export function getPublicMinistries() {
  if (!pending) {
    const request = fetch('/api/public/ministries', { signal: AbortSignal.timeout(10000) })
      .then(async response => {
        if (!response.ok) throw new Error('No se pudo consultar el catálogo de ministerios.')
        const data = await response.json()
        if (!Array.isArray(data.items)) throw new Error('Catálogo de ministerios no disponible.')
        return data.items as PublicMinistry[]
      })
      .finally(() => { if (pending === request) pending = null })
    pending = request
  }
  return pending
}
