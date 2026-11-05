import { useEffect, useState } from 'react'
import { managementRequest as api } from './management-api'
import type { AuthUser } from './auth'
import NeighborhoodChoices from './NeighborhoodChoices'
import './map.css'

type Barrio = { id_barrio: number; nombre: string; comuna: string | null; tiene_geometria: number }
export const canManageCoverage = (user: AuthUser) => user.registration?.canAssignServices && user.permissions['grupos.editar'] === 'todos' && Boolean(user.permissions['grupos.ver'])

export function CoverageAssignments({ id, name, user, groupId }: { id: number; name: string; user: AuthUser; groupId?: number }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false)
  const [barrios, setBarrios] = useState<Barrio[]>([]), [selected, setSelected] = useState<number[]>([]), [original, setOriginal] = useState<number[]>([])
  const [search, setSearch] = useState(''), [message, setMessage] = useState(''), [confirming, setConfirming] = useState(false)
  const endpoint = groupId ? `mapa/grupos/${groupId}/barrios` : `mapa/discipuladores/${id}/barrios`
  async function load() {
    setBusy(true); setMessage('')
    try {
      const [catalog, assignment] = await Promise.all([api<{ items: Barrio[] }>('mapa/barrios'), api<{ items: { id_barrio: number }[] }>(endpoint)])
      const ids = assignment.items.map(item => item.id_barrio)
      setBarrios(catalog.items); setOriginal(ids); setSelected(ids); setOpen(true)
    } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }
  const removed = barrios.filter(item => original.includes(item.id_barrio) && !selected.includes(item.id_barrio))
  async function save(confirmed = false) {
    if (removed.length && !confirmed) { setConfirming(true); return }
    setBusy(true); setMessage('')
    try {
      await api(endpoint, { ids: selected, expectedIds: original, expectedLeaderId: id, confirmRemoval: confirmed }, 'PUT')
      setOriginal(selected); setConfirming(false); setMessage(groupId ? 'Barrios del grupo guardados.' : 'Zonas asignadas guardadas.')
      window.dispatchEvent(new Event('calvario-coverage-updated'))
    } catch (error) { setMessage((error as Error).message) } finally { setBusy(false) }
  }
  return <section className="coverage-assignment" aria-label={`Zonas asignadas a ${name}`}>
    <h3>{groupId ? 'Barrios del Grupo de Comunión' : 'Zonas asignadas'}</h3>
    <button type="button" className="secondary" disabled={busy} onClick={() => void load()}>{open ? 'Actualizar selección' : '+ Administrar barrios'}</button>
    {open && <><p>{name} · {selected.length} barrios seleccionados</p><label>Buscar barrio<input type="search" value={search} maxLength={150} onChange={event => setSearch(event.target.value)} disabled={busy || confirming}/></label>
      {!barrios.length && <p>Aún no se ha importado el catálogo de barrios.</p>}
      <NeighborhoodChoices barrios={barrios} selected={selected} search={search} disabled={busy || confirming || !canManageCoverage(user)} onChange={setSelected}/>
      {confirming && <div className="coverage-confirm" role="alert"><h4>Confirmar retiro de cobertura</h4>{removed.map(item => <p key={item.id_barrio}>¿Quitar Barrio {item.nombre} de las zonas de {name}?</p>)}{groupId && <p>La cobertura independiente del discipulador se conserva.</p>}<div className="manage-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setConfirming(false)}>Cancelar</button><button type="button" disabled={busy} onClick={() => void save(true)}>Quitar y guardar cambios</button></div></div>}
      {!confirming && <div className="manage-actions"><button type="button" disabled={busy || !canManageCoverage(user)} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar cambios'}</button><button type="button" className="secondary" disabled={busy} onClick={() => { setOpen(false); setConfirming(false) }}>Cerrar</button></div>}
    </>}
    {message && <p role="status">{message}</p>}
  </section>
}

export function GroupTerritory({ id, leaderId, user }: { id: number; leaderId: number | null; user: AuthUser }) {
  if (!leaderId) return <section className="coverage-assignment"><h3>Barrios del Grupo de Comunión</h3><p>Primero asigna el discipulador del grupo. Después podrás seleccionar uno o varios barrios.</p></section>
  return <><p>El grupo ya tiene un discipulador asignado. Puedes seleccionar sus barrios; también se registrarán en la cobertura de ese discipulador.</p><CoverageAssignments id={leaderId} groupId={id} name="este Grupo de Comunión" user={user}/></>
}
