import { useEffect, useState } from 'react'
import { managementRequest as api } from './management-api'
import { memberCode } from './auth'
import type { TrainingBook } from './Training'

type Row = Record<string, string | number | null>
const searchable = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const fullName = (row: Row) => `${row.nombres || ''} ${row.apellidos || ''}`.trim()
const bookIds = (row: Row) => [row.id_libro].map(Number).filter(id => Number.isInteger(id) && id > 0)

// Assign one training book to several disciples at once: search, tick and confirm.
export default function BookAssign({ book, books, onDone, onCancel }: { book: TrainingBook; books: TrainingBook[]; onDone: (message: string) => Promise<void>; onCancel: () => void }) {
  const [people, setPeople] = useState<Row[] | null>(null), [truncated, setTruncated] = useState(false)
  const [search, setSearch] = useState(''), [onlyWithout, setOnlyWithout] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    let current = true
    api<{ items: Row[]; truncated?: boolean }>('members').then(result => { if (current) { setPeople(result.items.filter(row => row.estado_miembro !== 'retirado')); setTruncated(Boolean(result.truncated)) } }).catch(cause => { if (current) setError(cause instanceof Error ? cause.message : 'No pudimos cargar los discípulos.') })
    return () => { current = false }
  }, [])
  const names = new Map(books.map(item => [Number(item.id_libro), item.nombre]))
  const term = searchable(search.trim())
  const has = (row: Row) => bookIds(row).includes(Number(book.id_libro))
  const list = (people || []).filter(row => (!onlyWithout || !bookIds(row).length) && (!term || searchable(`${fullName(row)} ${memberCode(row.codigo_miembro as number | null) || ''} ${row.numero_identificacion || ''}`).includes(term)))
    .sort((a, b) => Number(has(a)) - Number(has(b)) || Number(bookIds(a).length > 0) - Number(bookIds(b).length > 0) || fullName(a).localeCompare(fullName(b), 'es'))
  const selectable = list.filter(row => !has(row)).map(row => Number(row.id_miembro))
  const allShown = selectable.length > 0 && selectable.every(id => selected.includes(id))
  function toggle(id: number) { setSelected(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]); setError('') }
  function toggleAll() { setSelected(previous => allShown ? previous.filter(id => !selectable.includes(id)) : [...new Set([...previous, ...selectable])]) }
  async function assign() {
    if (busy || !selected.length) return
    setBusy(true); setError('')
    try {
      const result = await api<{ assigned: number; already: number; replaced: number }>(`training/books/${book.id_libro}/assign`, { ids: selected })
      await onDone(`${book.nombre}: ${result.assigned === 1 ? 'asignado a 1 discípulo' : `asignado a ${result.assigned} discípulos`}${result.replaced ? ` (${result.replaced} cambiaron de libro)` : ''}${result.already ? ` · ${result.already} ya lo tenía${result.already === 1 ? '' : 'n'}` : ''}.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos asignar el libro.') }
    finally { setBusy(false) }
  }
  return <section className="manage-editor book-assign" aria-labelledby="book-assign-title">
    <h3 id="book-assign-title">Asignar “{book.nombre}” a discípulos</h3>
    <p className="training-hint">Selecciona a varios discípulos. Cada persona tiene un solo libro: a quien ya tenga otro, se le cambia por este.</p>
    <div className="book-assign-tools">
      <label className="training-search">Buscar discípulo<input type="search" value={search} maxLength={100} placeholder="Nombre, ID o identificación" disabled={busy} onChange={event => setSearch(event.target.value)} autoFocus/></label>
      <label className="book-assign-filter"><input type="checkbox" checked={onlyWithout} disabled={busy} onChange={event => setOnlyWithout(event.target.checked)}/> Solo quienes no tienen libro</label>
    </div>
    {!people && !error && <p role="status">Cargando discípulos…</p>}
    {truncated && <p className="training-hint">La lista muestra solo una parte de los discípulos. Usa la búsqueda o asigna el libro desde la ficha de cada persona.</p>}
    {people && <>
      <div className="book-assign-summary"><button type="button" className="secondary" disabled={busy || !selectable.length} onClick={toggleAll}>{allShown ? 'Quitar selección' : `Seleccionar los ${selectable.length} mostrados`}</button><span role="status">{selected.length === 1 ? '1 seleccionado' : `${selected.length} seleccionados`}</span></div>
      {list.length ? <ul className="book-assign-list">{list.map(row => {
        const id = Number(row.id_miembro), owned = has(row), current = bookIds(row).map(item => names.get(item)).filter(Boolean)
        return <li key={id}><label data-owned={owned || undefined}><input type="checkbox" checked={owned || selected.includes(id)} disabled={busy || owned} onChange={() => toggle(id)}/>
          <span className="book-assign-name">{memberCode(row.codigo_miembro as number | null) && <span className="member-code">{memberCode(row.codigo_miembro as number | null)}</span>}{fullName(row)}</span>
          <small>{owned ? 'Ya tiene este libro' : current.length ? `Cambiará: ${current.join(', ')}` : 'Sin libro'}</small></label></li>
      })}</ul> : <p className="app-empty">No hay discípulos con esa búsqueda.</p>}
    </>}
    {error && <p role="alert">{error}</p>}
    <div className="manage-actions"><button type="button" disabled={busy || !selected.length} onClick={() => void assign()}>{busy ? 'Asignando…' : selected.length ? `Asignar a ${selected.length === 1 ? '1 discípulo' : `${selected.length} discípulos`}` : 'Asignar libro'}</button><button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancelar</button></div>
  </section>
}
