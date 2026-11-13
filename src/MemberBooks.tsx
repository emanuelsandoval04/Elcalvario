import { useState } from 'react'
import { managementRequest as api } from './management-api'
import AppSelect from './AppSelect'
import { AdminIcon } from './AdminFrame'
import { BookEditor, bookColorOf } from './Training'
import type { TrainingBook } from './Training'

type Row = Record<string, string | number | null>

// A disciple's training book: one per person. Assigning another one replaces it. The book's color marks the record.
export default function MemberBooks({ row, books, canEdit, onCreated, onSaved, notify }: { row: Row; books: TrainingBook[]; canEdit: boolean; onCreated: () => Promise<void>; onSaved: () => Promise<void>; notify: (text: string) => void }) {
  const currentId = row.id_libro ? Number(row.id_libro) : null
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [creating, setCreating] = useState(false)
  const [added, setAdded] = useState<TrainingBook[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const catalog = [...new Map([...books, ...added].map(book => [Number(book.id_libro), book])).values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const current = catalog.find(book => Number(book.id_libro) === currentId)
  const color = currentId ? bookColorOf(current || { color: row.libro_color ? String(row.libro_color) : null }) : null
  const currentName = current?.nombre || (row.libro_actual ? String(row.libro_actual) : '')
  function start() { setValue(currentId ? String(currentId) : ''); setEditing(true); setError(''); setCreating(false) }
  function close() { setEditing(false); setCreating(false); setError('') }
  async function save() {
    if (busy) return
    if (!value) { setError('Selecciona un libro.'); return }
    if (Number(value) === currentId) { close(); return }
    setBusy(true); setError('')
    try {
      await api(`members/${row.id_miembro}/book`, { id_libro: Number(value), expectedId: currentId }, 'PUT')
      await onSaved()
      notify(currentId ? 'Libro de adiestramiento actualizado.' : 'Libro de adiestramiento asignado.')
      close()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar el libro.') }
    finally { setBusy(false) }
  }
  return <section className="training-member-current member-books" aria-label="Adiestramiento del discípulo" style={color ? { borderColor: color, background: `${color}14` } : undefined}>
    <h4>Libro de adiestramiento</h4>
    {!editing && (currentId ? <p className="member-book-current"><span className="member-book-swatch" style={{ background: color || undefined }} aria-hidden="true"/><strong>{currentName || 'Libro no disponible'}</strong></p> : <p><strong>Sin libro asignado</strong></p>)}
    {canEdit && !editing && <button type="button" className={currentId ? 'secondary' : undefined} onClick={start}>{currentId ? 'Actualizar libro' : 'Agregar libro'}</button>}
    {editing && <div className="member-books-editor">
      {catalog.length ? <div className="member-books-row">
        <AppSelect aria-label="Libro de adiestramiento" value={value} disabled={busy} onChange={event => { setValue(event.target.value); setError('') }}>
          <option value="">Selecciona un libro…</option>
          {catalog.map(book => <option key={book.id_libro} value={book.id_libro}>{book.nombre}</option>)}
        </AppSelect>
      </div> : <p className="training-hint">Todavía no hay libros registrados. Crea el primero aquí.</p>}
      {currentId && value && Number(value) !== currentId && <p className="training-hint">Cada discípulo tiene un solo libro: “{currentName}” se cambiará por el nuevo.</p>}
      <div className="member-books-tools">
        {!creating && <button type="button" className="secondary training-add" disabled={busy} onClick={() => setCreating(true)}><AdminIcon name="plus"/>Crear libro aquí</button>}
      </div>
      {creating && <BookEditor books={catalog} disabled={busy} onBusy={setBusy} onCancel={() => setCreating(false)} onCreated={async book => {
        setAdded(list => [...list, book]); setValue(String(book.id_libro)); setCreating(false); await onCreated()
      }}/>}
      {error && <p role="alert">{error}</p>}
      <div className="manage-actions"><button type="button" disabled={busy || !value} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar libro'}</button><button type="button" className="secondary" disabled={busy} onClick={close}>Cancelar</button></div>
    </div>}
  </section>
}
