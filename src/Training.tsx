import { useId, useState } from 'react'
import type { AuthUser } from './auth'
import { hasPermission } from './auth'
import { managementRequest as api } from './management-api'
import AppSelect from './AppSelect'
import { AdminIcon } from './AdminFrame'
import BookAssign from './BookAssign'
import './training.css'

export type TrainingBook = { id_libro: number; nombre: string; descripcion: string | null; color?: string | null; asignaciones?: number }
// Each book has a color that also marks its disciples.
export const bookPalette = ['#e4572e', '#2e86ab', '#3bb273', '#9b5de5', '#f4a259', '#d1495b', '#00a6a6', '#7a6c5d', '#c2185b', '#5c6bc0', '#8bc34a', '#ff8f00']
export const bookColorOf = (book: { color?: string | null } | null | undefined) => book?.color || '#9aa3af'
const suggestColor = (books: TrainingBook[]) => { const used = new Map<string, number>(); for (const book of books) if (book.color) used.set(book.color.toLowerCase(), (used.get(book.color.toLowerCase()) || 0) + 1); return [...bookPalette].sort((a, b) => (used.get(a) || 0) - (used.get(b) || 0))[0] }
export const canCreateTrainingBooks = (user: AuthUser | null) => hasPermission(user, 'adiestramiento.gestionar') && Boolean(user?.roles.some(role => !['Usuario', 'Discípulo', 'Discipulo'].includes(role)))

export function BookEditor({ onCreated, onCancel, disabled = false, onBusy, initial, books = [] }: { onCreated: (book: TrainingBook) => Promise<void>; onCancel: () => void; disabled?: boolean; onBusy?: (value: boolean) => void; initial?: TrainingBook; books?: TrainingBook[] }) {
  const [name, setName] = useState(initial?.nombre || ''), [description, setDescription] = useState(initial?.descripcion || '')
  const [color, setColor] = useState(() => initial?.color || suggestColor(books))
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function create() {
    if (busy || disabled) return
    if (!name.trim()) { setError('Escribe el nombre del libro.'); return }
    setBusy(true); onBusy?.(true); setError('')
    try {
      const result = await api<{ id: number; nombre: string; descripcion: string | null; color: string | null }>(initial ? `training/books/${initial.id_libro}` : 'training/books', { nombre: name.trim(), descripcion: description.trim() || null, color, ...(initial ? { expectedName: initial.nombre, expectedDescription: initial.descripcion } : {}) }, initial ? 'PATCH' : 'POST')
      await onCreated({ id_libro: result.id, nombre: result.nombre, descripcion: result.descripcion, color: result.color })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar el libro.') }
    finally { setBusy(false); onBusy?.(false) }
  }
  return <fieldset className="training-book-editor" aria-label={initial ? 'Editar libro de adiestramiento' : 'Crear libro de adiestramiento'} disabled={busy || disabled}>
    <legend>{initial ? 'Editar libro' : 'Nuevo libro'}</legend>
    <label>Nombre del libro <span aria-hidden="true">*</span><input value={name} maxLength={150} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void create() } }} autoComplete="off"/></label>
    <label>Descripción (opcional)<textarea value={description} maxLength={2000} onChange={event => setDescription(event.target.value)}/></label>
    <div className="book-color-field" role="radiogroup" aria-label="Color del libro"><span>Color del libro (identifica a sus discípulos)</span><div className="book-color-swatches">{bookPalette.map(option => <button key={option} type="button" role="radio" aria-checked={color === option} aria-label={`Color ${option}`} className="book-color-swatch" style={{ background: option }} onClick={() => setColor(option)}/>)}</div></div>
    {error && <p role="alert">{error}</p>}
    <div className="manage-actions"><button type="button" disabled={busy || disabled} onClick={() => void create()}>{busy ? 'Guardando libro…' : initial ? 'Guardar cambios' : 'Guardar libro'}</button><button type="button" className="secondary" disabled={busy || disabled} onClick={onCancel}>{initial ? 'Cancelar edición' : 'Cancelar libro'}</button></div>
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
    {creating && <BookEditor books={books} disabled={disabled} onBusy={onBusy} onCancel={() => setCreating(false)} onCreated={async book => {
      setAdded(current => [...current, book]); setSelected(String(book.id_libro)); setCreating(false); await onCreated()
    }}/>}
  </div>
}

export default function Training({ books, onReload, notify, canSeeMembers }: { books: TrainingBook[]; onReload: () => Promise<void>; notify: (message: string) => void; canSeeMembers: boolean }) {
  const [creating, setCreating] = useState(false), [search, setSearch] = useState('')
  const [editing, setEditing] = useState<TrainingBook | null>(null), [deleting, setDeleting] = useState<TrainingBook | null>(null)
  const [assigning, setAssigning] = useState<TrainingBook | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function prepareEdit(book: TrainingBook) {
    if (busy) return
    setBusy(true); setError(''); setDeleting(null); setCreating(false); setEditing(null)
    try { setEditing(await api<TrainingBook>(`training/books/${book.id_libro}`)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos consultar el libro.') }
    finally { setBusy(false) }
  }
  async function prepareDelete(book: TrainingBook) {
    if (busy) return
    setBusy(true); setError(''); setEditing(null); setCreating(false)
    try { setDeleting(await api<TrainingBook>(`training/books/${book.id_libro}`)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos consultar el libro.') }
    finally { setBusy(false) }
  }
  async function remove() {
    if (!deleting || busy || deleting.asignaciones) return
    setBusy(true); setError('')
    try {
      await api(`training/books/${deleting.id_libro}`, { expectedName: deleting.nombre, expectedDescription: deleting.descripcion }, 'DELETE')
      setDeleting(null); await onReload(); notify('Libro eliminado del catálogo.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos eliminar el libro.') }
    finally { setBusy(false) }
  }
  const query = search.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const filtered = books.filter(book => `${book.nombre} ${book.descripcion || ''}`.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().includes(query))
  return <section className="training-page">
    <div className="manage-section-heading"><div><p className="section-caption">Los libros que acompañan el crecimiento de nuestra comunidad.</p></div>{!creating && !editing && <button type="button" className="record-create" disabled={busy} onClick={() => { setDeleting(null); setError(''); setCreating(true) }}><AdminIcon name="plus"/>Nuevo libro</button>}</div>
    {creating && <div className="manage-editor"><BookEditor books={books} onBusy={setBusy} onCancel={() => setCreating(false)} onCreated={async () => { await onReload(); setCreating(false); notify('Libro de adiestramiento creado.') }}/></div>}
    {editing && <div className="manage-editor"><BookEditor key={editing.id_libro} initial={editing} onBusy={setBusy} onCancel={() => setEditing(null)} onCreated={async () => { await onReload(); setEditing(null); notify('Libro actualizado. Sus asignaciones se conservan.') }}/></div>}
    {assigning && <BookAssign key={assigning.id_libro} book={assigning} books={books} onCancel={() => setAssigning(null)} onDone={async message => { setAssigning(null); await onReload(); notify(message) }}/>}
    {deleting && <section className="manage-editor training-delete" aria-label="Confirmar eliminación de libro"><h3>Eliminar {deleting.nombre}</h3><p>{deleting.asignaciones ? `Este libro está asignado a ${deleting.asignaciones} discípulo(s). Primero reasigna sus libros para poder eliminarlo.` : '¿Quieres eliminar este libro del catálogo?'}</p><div className="manage-actions"><button type="button" disabled={busy || Boolean(deleting.asignaciones)} onClick={() => void remove()}>{busy ? 'Eliminando…' : 'Confirmar eliminación'}</button><button type="button" className="secondary" disabled={busy} onClick={() => { setDeleting(null); setError('') }}>Cancelar eliminación</button></div></section>}
    {error && <p role="alert">{error}</p>}
    <label className="training-search">Buscar libro<input type="search" value={search} maxLength={150} onChange={event => setSearch(event.target.value)} placeholder="Nombre o descripción"/></label>
    {filtered.length ? <div className="training-books">{filtered.map(book => <article className="manage-editor training-book" key={book.id_libro}><span className="training-book-icon" style={{ background: `${bookColorOf(book)}22`, color: bookColorOf(book) }}><AdminIcon name="training"/></span><div className="training-book-copy"><h3>{book.nombre}</h3><p>{book.descripcion || 'Sin descripción adicional.'}</p><p className="training-hint">{book.asignaciones || 0} discípulo(s) con este libro</p><div className="manage-actions">{canSeeMembers && <button type="button" aria-label={`Asignar ${book.nombre} a discípulos`} disabled={busy} onClick={() => { setEditing(null); setDeleting(null); setCreating(false); setAssigning(book); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Asignar a discípulos</button>}<button type="button" className="secondary" aria-label={`Editar ${book.nombre}`} disabled={busy} onClick={() => void prepareEdit(book)}>Editar</button><button type="button" className="secondary" aria-label={`Eliminar ${book.nombre}`} disabled={busy} onClick={() => void prepareDelete(book)}>Eliminar</button></div></div></article>)}</div> : <div className="app-empty"><span className="empty-icon"><AdminIcon name="training"/></span><h3>{books.length ? 'No encontramos ese libro' : 'Aún no hay libros de adiestramiento'}</h3><p>{books.length ? 'Prueba con otro nombre.' : 'Crea el primer libro para poder seleccionarlo en las fichas de los discípulos.'}</p></div>}
    {canSeeMembers && <div className="manage-editor training-assignment-note"><h3>Asignar libros a discípulos</h3><p>Usa “Asignar a discípulos” en cada libro para elegir a varias personas a la vez, o abre la ficha de una persona en Discípulos para actualizar sus libros.</p><a className="app-action secondary" href="#gestion/members">Ir a Discípulos</a></div>}
  </section>
}
