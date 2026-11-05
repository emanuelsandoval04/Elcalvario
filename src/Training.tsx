import { useId, useState } from 'react'
import type { AuthUser } from './auth'
import { hasPermission } from './auth'
import { managementRequest as api } from './management-api'
import AppSelect from './AppSelect'
import { AdminIcon } from './AdminFrame'
import './training.css'

export type TrainingBook = { id_libro: number; nombre: string; descripcion: string | null }
export const canCreateTrainingBooks = (user: AuthUser | null) => hasPermission(user, 'adiestramiento.gestionar') && Boolean(user?.roles.some(role => !['Usuario', 'Discípulo', 'Discipulo'].includes(role)))

function BookEditor({ onCreated, onCancel, disabled = false, onBusy }: { onCreated: (book: TrainingBook) => Promise<void>; onCancel: () => void; disabled?: boolean; onBusy?: (value: boolean) => void }) {
  const [name, setName] = useState(''), [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function create() {
    if (busy || disabled) return
    if (!name.trim()) { setError('Escribe el nombre del libro.'); return }
    setBusy(true); onBusy?.(true); setError('')
    try {
      const result = await api<{ id: number; nombre: string; descripcion: string | null }>('training/books', { nombre: name.trim(), descripcion: description.trim() || null })
      await onCreated({ id_libro: result.id, nombre: result.nombre, descripcion: result.descripcion })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos crear el libro.') }
    finally { setBusy(false); onBusy?.(false) }
  }
  return <fieldset className="training-book-editor" aria-label="Crear libro de adiestramiento" disabled={busy || disabled}>
    <legend>Nuevo libro</legend>
    <label>Nombre del libro <span aria-hidden="true">*</span><input value={name} maxLength={150} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void create() } }} autoComplete="off"/></label>
    <label>Descripción (opcional)<textarea value={description} maxLength={2000} onChange={event => setDescription(event.target.value)}/></label>
    {error && <p role="alert">{error}</p>}
    <div className="manage-actions"><button type="button" disabled={busy || disabled} onClick={() => void create()}>{busy ? 'Guardando libro…' : 'Guardar libro'}</button><button type="button" className="secondary" disabled={busy || disabled} onClick={onCancel}>Cancelar libro</button></div>
  </fieldset>
}

export function TrainingBookPicker({ books, initialId, required = false, disabled = false, canCreate, onCreated, onBusy, labelledBy }: {
  books: TrainingBook[]; initialId?: string | number | null; required?: boolean; disabled?: boolean; canCreate: boolean; onCreated: () => Promise<void>; onBusy?: (value: boolean) => void; labelledBy?: string;
}) {
  const id = useId()
  const [selected, setSelected] = useState(String(initialId || ''))
  const [creating, setCreating] = useState(false)
  const [added, setAdded] = useState<TrainingBook[]>([])
  const available = [...new Map([...books, ...added].map(book => [book.id_libro, book])).values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return <div className="training-book-picker">
    {!labelledBy && <span id={id}>Libro de adiestramiento{required ? ' *' : ''}</span>}
    <AppSelect name="id_libro" aria-labelledby={labelledBy || id} value={selected} onChange={event => setSelected(event.target.value)} required={required} disabled={disabled || !available.length}>
      <option value="">{available.length ? required ? 'Selecciona un libro…' : 'Sin libro asignado' : 'Todavía no hay libros registrados'}</option>
      {available.map(book => <option key={book.id_libro} value={book.id_libro}>{book.nombre}</option>)}
    </AppSelect>
    {!available.length && <p className="training-hint">Puedes guardar al discípulo sin libro y asignárselo después.</p>}
    {canCreate && !creating && <button type="button" className="secondary training-add" disabled={disabled} onClick={() => setCreating(true)}><AdminIcon name="plus"/>Crear libro aquí</button>}
    {creating && <BookEditor disabled={disabled} onBusy={onBusy} onCancel={() => setCreating(false)} onCreated={async book => {
      setAdded(current => [...current, book]); setSelected(String(book.id_libro)); setCreating(false); await onCreated()
    }}/>}
  </div>
}

export default function Training({ books, onReload, notify, canSeeMembers }: { books: TrainingBook[]; onReload: () => Promise<void>; notify: (message: string) => void; canSeeMembers: boolean }) {
  const [creating, setCreating] = useState(false), [search, setSearch] = useState('')
  const query = search.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const filtered = books.filter(book => `${book.nombre} ${book.descripcion || ''}`.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().includes(query))
  return <section className="training-page">
    <div className="manage-section-heading"><div><h2>Adiestramiento</h2><p className="section-caption">Los libros que acompañan el crecimiento de nuestra comunidad.</p></div>{!creating && <button type="button" className="record-create" onClick={() => setCreating(true)}><AdminIcon name="plus"/>Nuevo libro</button>}</div>
    {creating && <div className="manage-editor"><BookEditor onCancel={() => setCreating(false)} onCreated={async () => { await onReload(); setCreating(false); notify('Libro de adiestramiento creado.') }}/></div>}
    <label className="training-search">Buscar libro<input type="search" value={search} maxLength={150} onChange={event => setSearch(event.target.value)} placeholder="Nombre o descripción"/></label>
    {filtered.length ? <div className="training-books">{filtered.map(book => <article className="manage-editor training-book" key={book.id_libro}><span className="training-book-icon"><AdminIcon name="training"/></span><div><h3>{book.nombre}</h3><p>{book.descripcion || 'Sin descripción adicional.'}</p></div></article>)}</div> : <div className="app-empty"><span className="empty-icon"><AdminIcon name="training"/></span><h3>{books.length ? 'No encontramos ese libro' : 'Aún no hay libros de adiestramiento'}</h3><p>{books.length ? 'Prueba con otro nombre.' : 'Crea el primer libro para poder seleccionarlo en las fichas de los discípulos.'}</p></div>}
    {canSeeMembers && <div className="manage-editor training-assignment-note"><h3>Asignar libros a discípulos</h3><p>En Discípulos, usa el filtro Sin libro y abre la ficha de cada persona para seleccionar el libro que le corresponde.</p><a className="app-action secondary" href="#gestion/members">Ir a Discípulos</a></div>}
  </section>
}
