import { useState } from 'react'
import { managementRequest as api } from './management-api'
import AppSelect from './AppSelect'
import { AdminIcon } from './AdminFrame'
import { BookEditor } from './Training'
import type { TrainingBook } from './Training'

type Row = Record<string, string | number | null>

// Books of a disciple in order: the first one is the main book (miembro.id_libro), the rest are kept after it.
export const memberBookIds = (row: Row) => [row.id_libro, ...String(row.libros_adicionales || '').split(',')].map(Number).filter(id => Number.isInteger(id) && id > 0)

export default function MemberBooks({ row, books, canEdit, onCreated, onSaved, notify }: { row: Row; books: TrainingBook[]; canEdit: boolean; onCreated: () => Promise<void>; onSaved: () => Promise<void>; notify: (text: string) => void }) {
  const current = memberBookIds(row)
  const [editing, setEditing] = useState(false)
  const [rows, setRows] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [added, setAdded] = useState<TrainingBook[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const catalog = [...new Map([...books, ...added].map(book => [Number(book.id_libro), book])).values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const names = new Map(catalog.map(book => [Number(book.id_libro), book.nombre]))
  const nameOf = (id: number, index: number) => names.get(id) || (index === 0 && row.libro_actual ? String(row.libro_actual) : 'Libro no disponible')
  const chosen = rows.filter(Boolean)
  function start() { setRows(current.length ? current.map(String) : ['']); setEditing(true); setError(''); setCreating(false) }
  function close() { setEditing(false); setCreating(false); setError('') }
  function change(index: number, value: string) { setRows(list => list.map((item, position) => position === index ? value : item)); setError('') }
  function remove(index: number) { setRows(list => list.length > 1 ? list.filter((_, position) => position !== index) : ['']); setError('') }
  function moveUp(index: number) { setRows(list => { const next = [...list];[next[index - 1], next[index]] = [next[index], next[index - 1]]; return next }) }
  async function save() {
    if (busy) return
    if (!chosen.length) { setError('Selecciona al menos un libro.'); return }
    setBusy(true); setError('')
    try {
      await api(`members/${row.id_miembro}/book`, { ids: chosen.map(Number), expectedIds: current }, 'PUT')
      await onSaved()
      notify(current.length ? 'Libros de adiestramiento actualizados.' : chosen.length > 1 ? 'Libros de adiestramiento asignados.' : 'Libro de adiestramiento asignado.')
      close()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar los libros.') }
    finally { setBusy(false) }
  }
  const remaining = catalog.filter(book => !chosen.includes(String(book.id_libro))).length
  return <section className="training-member-current member-books" aria-label="Adiestramiento del discípulo">
    <h4>{current.length > 1 ? 'Libros de adiestramiento' : 'Libro de adiestramiento'}</h4>
    {!editing && (current.length ? <ul className="member-books-list">{current.map((id, index) => <li key={id}>{nameOf(id, index)}</li>)}</ul> : <p><strong>Sin libro asignado</strong></p>)}
    {canEdit && !editing && <button type="button" className={current.length ? 'secondary' : undefined} onClick={start}>{current.length ? 'Actualizar libros' : 'Agregar libro'}</button>}
    {editing && <div className="member-books-editor">
      {catalog.length ? <ol className="member-books-rows">{rows.map((value, index) => {
        const label = `Libro ${index + 1}`
        const options = catalog.filter(book => String(book.id_libro) === value || !chosen.includes(String(book.id_libro)))
        return <li key={index} className="member-books-row">
          <AppSelect aria-label={label} value={value} disabled={busy} onChange={event => change(index, event.target.value)}>
            <option value="">Selecciona un libro…</option>
            {options.map(book => <option key={book.id_libro} value={book.id_libro}>{book.nombre}</option>)}
          </AppSelect>
          <div className="member-books-row-actions">
            {index > 0 && <button type="button" className="secondary" disabled={busy} aria-label={`Subir ${label}`} title="Subir" onClick={() => moveUp(index)}>↑</button>}
            {(rows.length > 1 || value) && <button type="button" className="secondary" disabled={busy} aria-label={`Quitar ${label}`} onClick={() => remove(index)}>Quitar</button>}
          </div>
        </li>
      })}</ol> : <p className="training-hint">Todavía no hay libros registrados. Crea el primero aquí.</p>}
      <div className="member-books-tools">
        {catalog.length > 0 && remaining > 0 && rows.every(Boolean) && <button type="button" className="secondary training-add" disabled={busy} onClick={() => setRows(list => [...list, ''])}><AdminIcon name="plus"/>Agregar otro libro</button>}
        {!creating && <button type="button" className="secondary training-add" disabled={busy} onClick={() => setCreating(true)}><AdminIcon name="plus"/>Crear libro aquí</button>}
      </div>
      {creating && <BookEditor disabled={busy} onBusy={setBusy} onCancel={() => setCreating(false)} onCreated={async book => {
        setAdded(list => [...list, book])
        setRows(list => { const empty = list.indexOf(''); return empty >= 0 ? list.map((item, index) => index === empty ? String(book.id_libro) : item) : [...list, String(book.id_libro)] })
        setCreating(false); await onCreated()
      }}/>}
      {error && <p role="alert">{error}</p>}
      <div className="manage-actions"><button type="button" disabled={busy || !chosen.length} onClick={() => void save()}>{busy ? 'Guardando…' : chosen.length > 1 ? 'Guardar libros' : 'Guardar libro'}</button><button type="button" className="secondary" disabled={busy} onClick={close}>Cancelar</button></div>
    </div>}
  </section>
}
