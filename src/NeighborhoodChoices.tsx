import type { Barrio } from './GroupNeighborhoodField'

const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export default function NeighborhoodChoices({ barrios, selected, search, disabled, onChange }: { barrios: Barrio[]; selected: number[]; search: string; disabled: boolean; onChange: (ids: number[]) => void }) {
  const query = normalize(search.trim())
  const matches = query ? barrios.filter(item => normalize(`${item.nombre} ${item.comuna || ''}`).includes(query)) : []
  const comunas = [...new Set(matches.map(item => item.comuna || 'Sin comuna registrada'))]
  const chosen = barrios.filter(item => selected.includes(item.id_barrio))
  return <>
    {!!chosen.length && <details className="coverage-selected"><summary>Ver barrios seleccionados ({chosen.length})</summary><div className="manage-actions">{chosen.map(item => <button key={item.id_barrio} type="button" className="secondary" disabled={disabled} aria-label={`Quitar barrio ${item.nombre}`} onClick={() => onChange(selected.filter(id => id !== item.id_barrio))}>{item.nombre} <span aria-hidden="true">×</span></button>)}</div></details>}
    {!query ? <p className="coverage-note">Escribe el nombre de un barrio o comuna para ver las coincidencias.</p> : !matches.length ? <p role="status">No encontramos barrios para esta búsqueda.</p> : <div className="coverage-choices">{comunas.map(comuna => <fieldset key={comuna} disabled={disabled}><legend>{comuna}</legend>{matches.filter(item => (item.comuna || 'Sin comuna registrada') === comuna).map(item => <label key={item.id_barrio}><input type="checkbox" checked={selected.includes(item.id_barrio)} onChange={event => onChange(event.target.checked ? [...selected, item.id_barrio] : selected.filter(id => id !== item.id_barrio))}/><span>{item.nombre}{!item.tiene_geometria && <small>Ubicación de zona pendiente</small>}</span></label>)}</fieldset>)}</div>}
  </>
}
