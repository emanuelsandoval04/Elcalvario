import { useEffect, useState } from 'react'
import { managementRequest as api } from './management-api'
import NeighborhoodChoices from './NeighborhoodChoices'

export type Barrio = { id_barrio: number; nombre: string; comuna: string | null; tiene_geometria: number }

export default function GroupNeighborhoodField({ groupId, legacyText, disabled, onBusy, availableBarrios }: { groupId: number | null; legacyText?: string; disabled: boolean; onBusy: (busy: boolean) => void; availableBarrios?: Barrio[] }) {
  const [barrios, setBarrios] = useState<Barrio[]>([]), [selected, setSelected] = useState<number[]>([]), [original, setOriginal] = useState<number[]>([])
  const [leaderId, setLeaderId] = useState<number | null>(null), [search, setSearch] = useState(''), [error, setError] = useState('')
  const [ready, setReady] = useState(false), [changed, setChanged] = useState(false), [retry, setRetry] = useState(0)
  const [assignmentsReady, setAssignmentsReady] = useState(false)
  useEffect(() => {
    let active = true
    setReady(false); setAssignmentsReady(false); setError(''); onBusy(true)
    const catalogRequest = availableBarrios?.length && retry === 0 ? Promise.resolve({ items: availableBarrios }) : api<{ items: Barrio[] }>('mapa/barrios')
    void catalogRequest.then(catalog => { if (active) { setBarrios(catalog.items); setReady(true) } }, () => {})
    void Promise.allSettled([
      catalogRequest,
      groupId ? api<{ items: { id_barrio: number }[]; id_discipulador: number | null }>(`mapa/grupos/${groupId}/barrios`) : Promise.resolve({ items: [], id_discipulador: null }),
    ]).then(([catalogResult, assignmentResult]) => {
      if (!active) return
      if (catalogResult.status === 'rejected' || assignmentResult.status === 'rejected') {
        setError(catalogResult.status === 'rejected' ? `No se pudieron cargar los barrios: ${catalogResult.reason.message}` : `Los barrios están disponibles, pero no se pudo cargar la selección guardada del grupo: ${assignmentResult.status === 'rejected' ? assignmentResult.reason.message : ''}`)
        return
      }
      const catalog = catalogResult.value, current = assignmentResult.value
      const ids = current.items.map(item => item.id_barrio)
      setBarrios(catalog.items); setOriginal(ids); setSelected(ids); setLeaderId(current.id_discipulador); setReady(true); setAssignmentsReady(true); setChanged(false); onBusy(false)
    }).catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [groupId, retry, onBusy, availableBarrios])
  const removedNames = barrios.filter(item => original.includes(item.id_barrio) && !selected.includes(item.id_barrio)).map(item => item.nombre)
  return <section className="coverage-assignment manage-wide" aria-labelledby="group-neighborhoods-title">
    <h3 id="group-neighborhoods-title">Barrios del grupo</h3>
    <p>Busca y selecciona uno o varios barrios donde se reúne o al que pertenece el grupo.</p>
    {!!legacyText && !original.length && !changed && <p>Barrios escritos anteriormente: {legacyText}. Selecciona sus nombres en el catálogo para vincularlos al grupo.</p>}
    <label>Buscar barrio o comuna<input type="search" value={search} maxLength={150} disabled={disabled || !ready} onChange={event => setSearch(event.target.value)}/></label>
    {!ready && !error && <p role="status">Cargando barrios…</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" className="secondary" onClick={() => setRetry(value => value + 1)}>Reintentar barrios</button></div>}
    {ready && <>{assignmentsReady && <input type="hidden" name="barrios_seleccion" value={JSON.stringify({ ids: selected, expectedIds: original, expectedLeaderId: leaderId, replaceText: changed || original.length > 0, removedNames })}/>}
      <p aria-live="polite">{barrios.length} barrios disponibles · {selected.length} seleccionados</p>
      <NeighborhoodChoices barrios={barrios} selected={selected} search={search} disabled={disabled || !assignmentsReady} onChange={ids => { setSelected(ids); setChanged(true) }}/>
      {!barrios.length && <p role="status">No hay barrios disponibles en el catálogo. Reintenta su carga.</p>}
    </>}
  </section>
}
