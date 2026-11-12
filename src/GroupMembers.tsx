import { useState } from 'react'
import { managementRequest as api } from './management-api'
import { memberCode } from './auth'

type Row = Record<string, string | number | null>
const searchable = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const fullName = (row: Row) => `${row.nombres || ''} ${row.apellidos || ''}`.trim()

// Group disciples: list (with removal) and a picker to add more (someone in another group is moved here).
export default function GroupMembers({ group, members, groupNames, canAdd, canRemove = false, notify, onChanged }: { group: Row; members: Row[]; groupNames: Map<number, string>; canAdd: boolean; canRemove?: boolean; notify: (text: string) => void; onChanged: () => Promise<void> }) {
  const groupId = Number(group.id_grupo)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const current = members.filter(row => Number(row.id_grupo) === groupId)
  const term = searchable(search.trim())
  const candidates = members.filter(row => Number(row.id_grupo) !== groupId && (!term || searchable(`${fullName(row)} ${memberCode(row.codigo_miembro as number | null) || ''} ${row.numero_identificacion || ''}`).includes(term)))
    .sort((a, b) => Number(Boolean(a.id_grupo)) - Number(Boolean(b.id_grupo)) || fullName(a).localeCompare(fullName(b), 'es'))
  const shown = candidates.slice(0, 60)
  const moving = members.filter(row => selected.includes(Number(row.id_miembro)) && row.id_grupo).length
  function toggle(id: number) { setSelected(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]); setError('') }
  function close() { setOpen(false); setSearch(''); setSelected([]); setError('') }
  async function add() {
    if (busy || !selected.length) return
    setBusy(true); setError('')
    try {
      const result = await api<{ added: number; moved: number }>(`groups/${groupId}/members`, { ids: selected })
      await onChanged()
      notify(`${result.added === 1 ? 'Se agregó 1 discípulo' : `Se agregaron ${result.added} discípulos`} al grupo${result.moved ? ` (${result.moved} cambiaron de grupo)` : ''}.`)
      close()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos agregar los discípulos.') }
    finally { setBusy(false) }
  }
  async function remove(row: Row) {
    if (busy || !window.confirm(`¿Quitar a ${fullName(row)} de ${group.nombre}? Quedará sin grupo y su historial se conserva.`)) return
    setBusy(true); setError('')
    try { await api(`groups/${groupId}/members/${row.id_miembro}`, {}, 'DELETE'); await onChanged(); notify(`${fullName(row)} ya no pertenece a ${group.nombre}.`) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos quitar al discípulo.') }
    finally { setBusy(false) }
  }
  return <section className="group-members" aria-labelledby={`group-members-${groupId}`}>
    <div className="group-members-heading"><h4 id={`group-members-${groupId}`}>Discípulos del grupo <span>{current.length}</span></h4>{canAdd && !open && <button type="button" onClick={() => setOpen(true)}>Agregar discípulos</button>}</div>
    {current.length ? <ul className="group-members-list">{current.map(row => <li key={row.id_miembro}>{memberCode(row.codigo_miembro as number | null) && <span className="member-code">{memberCode(row.codigo_miembro as number | null)}</span>}<span>{fullName(row)}</span>{row.estado_miembro !== 'activo' && <small>{row.estado_miembro}</small>}{canRemove && <button type="button" className="group-members-remove" disabled={busy} aria-label={`Quitar a ${fullName(row)} del grupo`} onClick={() => void remove(row)}>Quitar</button>}</li>)}</ul>
      : <p className="group-members-empty">Este grupo todavía no tiene discípulos.{canAdd ? ' Usa “Agregar discípulos” para asignarlos.' : ''}</p>}
    {error && !open && <p className="group-members-error" role="alert">{error}</p>}
    {open && <div className="group-members-picker">
      <label>Buscar discípulo<input type="search" value={search} maxLength={100} placeholder="Nombre, ID o identificación" disabled={busy} onChange={event => setSearch(event.target.value)} autoFocus/></label>
      <p className="group-members-hint">{candidates.length ? `Primero aparecen quienes no tienen grupo. Quien ya está en otro grupo pasará a este.${candidates.length > shown.length ? ` Mostrando ${shown.length} de ${candidates.length}; escribe para buscar.` : ''}` : term ? 'No hay discípulos con esa búsqueda.' : 'Todos los discípulos disponibles ya están en este grupo.'}</p>
      {!!shown.length && <ul className="group-members-options">{shown.map(row => {
        const id = Number(row.id_miembro), other = row.id_grupo ? groupNames.get(Number(row.id_grupo)) || 'otro grupo' : null
        return <li key={id}><label><input type="checkbox" checked={selected.includes(id)} disabled={busy} onChange={() => toggle(id)}/><span className="group-members-name">{memberCode(row.codigo_miembro as number | null) && <span className="member-code">{memberCode(row.codigo_miembro as number | null)}</span>}{fullName(row)}</span><small>{other ? `En: ${other}` : 'Sin grupo'}</small></label></li>
      })}</ul>}
      {moving > 0 && <p className="group-members-warning" role="status">{moving === 1 ? '1 discípulo seleccionado está en otro grupo y pasará a este.' : `${moving} discípulos seleccionados están en otro grupo y pasarán a este.`}</p>}
      {error && <p className="group-members-error" role="alert">{error}</p>}
      <div className="group-members-actions"><button type="button" disabled={busy || !selected.length} onClick={() => void add()}>{busy ? 'Agregando…' : selected.length ? `Agregar ${selected.length} al grupo` : 'Agregar al grupo'}</button><button type="button" className="secondary" disabled={busy} onClick={close}>Cancelar</button></div>
    </div>}
  </section>
}
