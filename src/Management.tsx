import AppSelect from './AppSelect'
import ProfilePhoto from './ProfilePhoto'
import DiscipleConsent from './DiscipleConsent'
import { AttendanceActivityPicker, MemberAttendance } from './AttendanceTools'
import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { authRequest, hasPermission, memberCode, useAuthSession } from './auth'
import type { AuthUser } from './auth'
import { managementRequest as api } from './management-api'
import './management.css'
import './app-dashboard.css'
import './community-tools.css'
import AdminFrame, { AdminIcon } from './AdminFrame'
import AdminNavigation, { allowedModules, currentModule } from './admin-navigation'
import { welcomeEmailMessage } from './account-mail'
import type { WelcomeEmailStatus } from './account-mail'
import EventRecurrence, { weeklySchedule } from './EventRecurrence'
import { CoverageAssignments, GroupTerritory, canManageCoverage } from './CoverageAssignments'
import GroupNeighborhoodField from './GroupNeighborhoodField'
import type { Barrio } from './GroupNeighborhoodField'
import Training, { TrainingBookPicker, canCreateTrainingBooks } from './Training'
import type { TrainingBook } from './Training'
import { downloadReport } from './report-download'
import ValidatedForm, { reportFormErrors, requestFieldErrors } from './ValidatedForm'
const CoverageMap = lazy(() => import('./CoverageMap'))
const EventCalendar = lazy(() => import('./EventCalendar'))
const PastoralFollowup = lazy(() => import('./PastoralFollowup'))
const MemberImport = lazy(() => import('./MemberImport'))
const Transmissions = lazy(() => import('./Transmissions'))

type Row = Record<string, string | number | null>
type Catalogs = { roles: Row[]; ministerios: Row[]; grupos: Row[]; registrationGroups?: Row[]; barrios?: Barrio[]; libros?: TrainingBook[] }
type Option = { value: string | number; label: string }
type Field = { key: string; label: string; type?: string; required?: boolean; max?: number; options?: Option[]; step?: string; virtual?: boolean; render?: (props: { initial: Row; disabled: boolean; labelId: string; onBusy: (busy: boolean) => void }) => ReactNode }
type Message = (message: string) => void
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'No pudimos completar la operación.'
const searchable = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const has = hasPermission
const emptyCatalogs: Catalogs = { roles: [], ministerios: [], grupos: [] }
const options = (values: string[]) => values.map(value => ({ value, label: value }))
const catalogOptions = (rows: Row[], id: string) => rows.map(row => ({ value: Number(row[id]), label: String(row.nombre) }))
const attendanceStates = ['presente', 'ausente', 'justificado', 'visitante']
const typeNames: Record<string, string> = { culto: 'Culto', evento: 'Evento especial', reunion_grupo: 'Reunión de grupo' }

function DataForm({ fields, initial = {}, onSave, onCancel, label = 'Guardar', memberWizard = false, groupNeighborhoods = false, availableBarrios, submitDisabled = false }: { fields: Field[]; initial?: Row; onSave: (values: Row) => Promise<void>; onCancel?: () => void; label?: string; memberWizard?: boolean; groupNeighborhoods?: boolean; availableBarrios?: Barrio[]; submitDisabled?: boolean }) {
  const formId = useId()
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [inlineBusy, setInlineBusy] = useState(false)
  const [neighborhoodBusy, setNeighborhoodBusy] = useState(groupNeighborhoods)
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(0)
  const [review, setReview] = useState<Record<string, string>>({})
  const heading = useRef<HTMLHeadingElement>(null)
  const basic = ['nombres', 'apellidos', 'tipo_identificacion', 'numero_identificacion', 'celular', 'fecha_nacimiento']
  const emergency = ['contacto_emergencia_nombre', 'contacto_emergencia_celular', 'account_email', 'account_password', 'account_confirmation', 'account_photo']
  const steps = memberWizard ? [
    { title: 'Datos básicos', fields: fields.filter(field => basic.includes(field.key)) },
    { title: 'Información adicional', fields: fields.filter(field => !basic.includes(field.key) && !emergency.includes(field.key)) },
    { title: fields.some(field => field.key === 'account_email') ? 'Cuenta de acceso' : fields.some(field => emergency.includes(field.key)) ? 'Contacto de emergencia' : 'Revisar y guardar', fields: fields.filter(field => emergency.includes(field.key)) },
  ] : [{ title: '', fields }]
  useEffect(() => { if (memberWizard) heading.current?.focus({ preventScroll: true }) }, [page, memberWizard])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || photoBusy || neighborhoodBusy || inlineBusy || submitDisabled) return
    const form = event.currentTarget
    if (memberWizard) {
      const activeFields = form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[data-form-step="${page}"] input, [data-form-step="${page}"] select, [data-form-step="${page}"] textarea`)
      for (const field of activeFields) if (!field.reportValidity()) return
      if (page < steps.length - 1) { setReview(Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, String(value)]))); setPage(page + 1); setMessage(''); return }
    }
    const data = new FormData(form)
    const values: Row = {}
    for (const field of fields) {
      const raw = String(data.get(field.key) || '')
      values[field.key] = field.type === 'checkbox' ? Number(data.has(field.key)) : field.key.startsWith('id_') || field.type === 'number' ? (raw ? Number(raw) : null) : raw || null
    }
    if (groupNeighborhoods) values.barrios_seleccion = String(data.get('barrios_seleccion') || '')
    setBusy(true); setMessage('')
    try { await onSave(values) } catch (error) {
      const failed=Object.keys(requestFieldErrors(error)||{})
      if(memberWizard&&failed.length){const step=steps.findIndex(group=>group.fields.some(field=>failed.includes(field.key)));if(step>=0)setPage(step)}
      if(!reportFormErrors(form,error))setMessage(errorMessage(error))
    } finally { setBusy(false) }
  }
  return <ValidatedForm className={`manage-form${memberWizard ? ' member-wizard' : ''}`} onSubmit={submit} onChange={() => { if (message) setMessage('') }} aria-busy={busy}>
    {memberWizard && <div className="wizard-progress manage-wide"><span>Paso {page + 1} de {steps.length}</span><span>{['Lo esencial', 'Un poco más de ti', 'Último paso'][page]}</span><progress value={page + 1} max={steps.length} aria-label="Progreso del registro"/></div>}
    {steps.map((group, index) => <fieldset key={index} data-form-step={index} hidden={index !== page} className="manage-form-fields manage-wide">
    {memberWizard && <div className="wizard-step-heading manage-wide"><h3 ref={index === page ? heading : undefined} tabIndex={-1}>{group.title}</h3><p>{['Empecemos por conocer a la persona.', 'Completa los datos que tengas disponibles.', 'Ya casi está. Revisa y guarda su información.'][index]}</p></div>}
    {group.fields.filter(field => !field.virtual).map(field => field.render ? <div key={field.key} className="manage-wide"><span id={`${formId}-${field.key}`}>{field.label}{field.required ? ' *' : ''}</span>{field.render({ initial, disabled: busy, labelId: `${formId}-${field.key}`, onBusy: setInlineBusy })}</div> : field.type === 'photo' ? <div key={field.key} className="manage-wide"><ProfilePhoto name={field.key} defaultValue={initial[field.key] ? String(initial[field.key]) : null} onBusyChange={setPhotoBusy} disabled={busy}/></div> : <label key={field.key} className={field.type === 'textarea' ? 'manage-wide' : ''}>
      <span id={`${formId}-${field.key}`}>{field.label}{field.required && <span className="field-required"> *</span>}</span>
      {field.options ? <AppSelect aria-labelledby={`${formId}-${field.key}`} name={field.key} required={field.required} defaultValue={String(initial[field.key] ?? '')} disabled={busy}>
        <option value="">{field.required ? 'Selecciona…' : 'Sin asignar'}</option>
        {initial[field.key] != null && initial[field.key] !== '' && !field.options.some(option => String(option.value) === String(initial[field.key])) && <option value={String(initial[field.key])}>Asignación actual · {initial[field.key]}</option>}
        {field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </AppSelect> : field.type === 'textarea' ? <textarea aria-labelledby={`${formId}-${field.key}`} name={field.key} defaultValue={String(initial[field.key] ?? '')} maxLength={field.max} disabled={busy} />
        : field.type === 'checkbox' ? <input name={field.key} type="checkbox" defaultChecked={Boolean(initial[field.key])} disabled={busy} />
          : <input name={field.key} type={field.type || 'text'} autoComplete={field.type === 'password' ? 'new-password' : undefined} minLength={field.type === 'password' ? 10 : undefined} required={field.required} maxLength={field.max} step={field.step} placeholder={field.type === 'date' || field.type === 'time' ? undefined : `Ingresa ${field.label.toLowerCase()}`} defaultValue={String(initial[field.key] ?? '')} disabled={busy} />}
    </label>)}
    {memberWizard && index === 2 && <><div className="wizard-review manage-wide"><span className="member-avatar" aria-hidden="true">{review.nombres?.[0]}{review.apellidos?.[0]}</span><div><strong>{review.nombres} {review.apellidos}</strong><span>{review.tipo_identificacion} {review.numero_identificacion}</span><span>{review.celular}</span></div></div><p className="wizard-note manage-wide"><AdminIcon name="warning"/><span>Los campos marcados con <b>*</b> son obligatorios. La información adicional puede completarse después.</span></p></>}
    </fieldset>)}
    {groupNeighborhoods && <GroupNeighborhoodField groupId={initial.id_grupo ? Number(initial.id_grupo) : null} legacyText={String(initial.barrio || '')} disabled={busy} onBusy={setNeighborhoodBusy} availableBarrios={availableBarrios}/>}
    <div className="manage-wide manage-actions form-footer">
      {memberWizard && page > 0 ? <button type="button" className="secondary" disabled={busy} onClick={() => { setPage(page - 1); setMessage('') }}><AdminIcon name="back"/>Atrás</button> : onCancel && <button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancelar</button>}
      <button disabled={busy || photoBusy || neighborhoodBusy || inlineBusy || submitDisabled}>{busy ? 'Guardando…' : memberWizard && page < 2 ? <>Continuar <span aria-hidden="true">→</span></> : label}</button>
    </div>
    {message && <p className="manage-wide manage-message" role="alert">{message}</p>}
  </ValidatedForm>
}

function Records({ resource, user, catalogs, reloadCatalogs, notify }: { resource: 'members' | 'groups' | 'activities'; user: AuthUser; catalogs: Catalogs; reloadCatalogs: () => Promise<void>; notify: Message }) {
  const [items, setItems] = useState<Row[]>([])
  const [members, setMembers] = useState<Row[]>([])
  const [edit, setEdit] = useState<Row | null>(null)
  const [detail, setDetail] = useState<Row | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('todos')
  const [activityView,setActivityView]=useState<'list'|'calendar'>('list')
  const [importing,setImporting]=useState(false)
  const [exporting, setExporting] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const listRequest = useRef(0)
  const [activityType, setActivityType] = useState('evento')
  const [stoppingRepeat, setStoppingRepeat] = useState(false)
  const [registrationType, setRegistrationType] = useState<'discipulo' | 'administrativo'>('discipulo')
  const editorRef = useRef<HTMLDivElement>(null)
  const canServices = Boolean(user.registration?.canAssignServices)
  const canAdministrative = Boolean(user.registration?.canCreateAdministrative)
  useEffect(() => {
    const openNewGroup = () => {
      if (resource === 'groups' && window.location.hash === '#gestion/groups/nuevo' && canServices && has(user, 'grupos.editar')) {
        setDetail(null)
        setEdit(current => current || { estado_grupo: 'activo', id_discipulador: user.permissions['grupos.editar'] === 'grupo' ? user.memberId : null })
      }
    }
    openNewGroup()
    window.addEventListener('hashchange', openNewGroup)
    return () => window.removeEventListener('hashchange', openNewGroup)
  }, [resource, canServices, user])
  const titles = { members: 'Discípulos', groups: 'Grupos de Comunión', activities: 'Eventos y Cultos' }
  const ids = { members: 'id_miembro', groups: 'id_grupo', activities: 'id_actividad' }
  const write = { members: 'miembros.editar', groups: 'grupos.editar', activities: activityType === 'reunion_grupo' ? 'grupos.editar' : 'eventos.editar' }
  const registrationPermission = has(user, 'miembros.registrar') ? 'miembros.registrar' : 'miembros.editar'
  const remove = { members: 'miembros.eliminar', groups: 'grupos.eliminar', activities: 'eventos.eliminar' }
  const memberOptions = (resource === 'members' ? items : members).map(row => ({ value: Number(row.id_miembro), label: `${row.nombres} ${row.apellidos || ''}`.trim() }))
  if (user.memberId && !memberOptions.some(option => option.value === user.memberId)) memberOptions.push({ value: user.memberId, label: 'Mi ficha de discípulo' })
  async function load(silent = false) {
    const request = ++listRequest.current
    if (!silent) setLoading(true)
    try {
      if (resource === 'members' && !has(user, 'miembros.ver')) { setItems([]); return }
      const result = await api<{ items: Row[] }>(`${resource}${resource === 'members' ? `?q=${encodeURIComponent(search)}` : resource === 'activities' ? '?view=agenda' : ''}`)
      if (request !== listRequest.current) return
      setItems(result.items)
      const detailId = window.location.hash.split('/')[2] === 'ficha' ? Number(window.location.hash.split('/')[3]) : null
      setDetail(previous => detailId ? result.items.find(row => Number(row[ids[resource]]) === detailId) || null : previous ? result.items.find(row => row[ids[resource]] === previous[ids[resource]]) || null : null)
      if (resource === 'groups' && has(user, 'miembros.ver')) setMembers((await api<{ items: Row[] }>('members')).items)
    } catch (error) { if (request === listRequest.current) notify(errorMessage(error)) } finally { if (request === listRequest.current) setLoading(false) }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), resource === 'members' && search ? 250 : 0)
    return () => { window.clearTimeout(timer); listRequest.current++ }
  }, [resource, resource === 'members' ? search : ''])
  useEffect(() => {
    if (resource !== 'activities' || edit || detail || activityView !== 'list') return
    const refresh = () => { if (document.visibilityState === 'visible') void load(true) }
    const timer = window.setInterval(refresh, 60000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [resource, Boolean(edit), Boolean(detail), activityView])
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true })
    if (edit || detail) titleRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }, [Boolean(edit), Boolean(detail)])
  let formFields: Field[] = []
  if (resource === 'members') {
    formFields = [
      { key: 'nombres', label: 'Nombres', required: true, max: 100 }, { key: 'apellidos', label: 'Apellidos', max: 100 },
      { key: 'tipo_identificacion', label: 'Tipo de identificación', required: true, options: [{ value: 'CC', label: 'Cédula de ciudadanía' }, { value: 'TI', label: 'Tarjeta de identidad' }, { value: 'CE', label: 'Cédula de extranjería' }, { value: 'PA', label: 'Pasaporte' }, { value: 'RC', label: 'Registro civil' }, { value: 'PPT', label: 'Permiso por protección temporal' }, { value: 'Otro', label: 'Otro documento' }] }, { key: 'numero_identificacion', label: 'Número de identificación', required: true, max: 30 },
      { key: 'celular', label: 'Celular', type: 'tel', required: true, max: 20 }, { key: 'correo', label: 'Correo', type: 'email', max: 120 },
      { key: 'fecha_nacimiento', label: 'Fecha de nacimiento / cumpleaños', type: 'date', required: true },
      { key: 'id_grupo', label: 'Grupo de Comunión Familiar (opcional)', options: catalogOptions(catalogs.registrationGroups || catalogs.grupos, 'id_grupo') },
      { key: 'id_libro', label: 'Libro de adiestramiento', required: registrationType === 'discipulo' && Boolean(catalogs.libros?.length), render: ({ initial, disabled, labelId, onBusy }) => <TrainingBookPicker books={catalogs.libros || []} initialId={initial.id_libro} disabled={disabled} required={registrationType === 'discipulo' && Boolean(catalogs.libros?.length)} canCreate={canCreateTrainingBooks(user)} onCreated={reloadCatalogs} onBusy={onBusy} labelledBy={labelId}/> },
    ]
    if (canServices && (edit?.id_miembro || registrationType === 'administrativo')) formFields.push({ key: 'funcion_iglesia', label: 'Función o servicio en la iglesia', max: 150 }, { key: 'id_cobertura_pastoral', label: 'Cobertura pastoral', options: memberOptions.filter(option => option.value !== edit?.id_miembro) })
    if (canAdministrative && registrationType === 'administrativo' && !edit?.id_miembro) formFields.push(
      { key: 'id_rol_eclesiastico', label: 'Cargo pastoral', required: true, options: catalogOptions(catalogs.roles, 'id_rol_eclesiastico') },
      { key: 'account_email', label: 'Correo de acceso', type: 'email', required: true, max: 120 },
      { key: 'account_password', label: 'Contraseña de acceso', type: 'password', required: true, max: 128 },
      { key: 'account_confirmation', label: 'Confirmar contraseña de acceso', type: 'password', required: true, max: 128 },
      { key: 'account_photo', label: 'Foto de perfil', type: 'photo' },
      ...(has(user, 'grupos.editar') && (catalogs.registrationGroups || catalogs.grupos).length ? [{ key: 'responsable_grupo', label: 'Asignar como responsable del grupo seleccionado', type: 'checkbox' }] : []),
    )
    if (canServices && has(user, 'ministerios.gestionar') && !edit?.id_miembro) formFields.push({ key: 'id_ministerio', label: 'Servicio en ministerio', options: catalogOptions(catalogs.ministerios, 'id_ministerio') })
    if (has(user, 'miembros.sensibles')) formFields.push(
      { key: 'grupo_sanguineo_rh', label: 'Grupo sanguíneo / RH', options: options(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']) },
      { key: 'eps', label: 'EPS', max: 100 }, { key: 'contacto_emergencia_nombre', label: 'Contacto de emergencia', max: 150 },
      { key: 'contacto_emergencia_celular', label: 'Celular de emergencia', type: 'tel', max: 20 },
    )
  } else if (resource === 'groups') formFields = [
    { key: 'codigo_grupo', label: 'Código del grupo', required: true, max: 30 }, { key: 'nombre', label: 'Nombre', required: true, max: 150 },
    { key: 'id_discipulador', label: 'Discipulador', options: user.permissions['grupos.editar'] === 'grupo' ? memberOptions.filter(option => option.value === user.memberId) : memberOptions },
    { key: 'estado_grupo', label: 'Estado del grupo', required: true, options: options(['activo', 'inactivo']) },
  ]
  else {
    formFields = [
      { key: 'titulo', label: 'Título', required: true, max: 150 },
      ...(activityType === 'reunion_grupo' ? [{ key: 'fecha', label: 'Fecha', type: 'date', required: true }, { key: 'hora', label: 'Hora (Colombia)', type: 'time', required: true }] : [
        { key: 'fecha', label: 'Fecha y horario', render: ({ initial, disabled, labelId }: { initial: Row; disabled: boolean; labelId: string }) => <EventRecurrence initial={initial} disabled={disabled} labelledBy={labelId}/> },
        { key: 'hora', label: '', virtual: true }, { key: 'recurrence', label: '', virtual: true }, { key: 'fixed', label: '', type: 'number', virtual: true }, { key: 'edit_scope', label: '', virtual: true },
      ]),
      { key: 'lugar', label: 'Lugar', required: true, max: 200 },
      { key: 'imagen', label: 'Imagen: URL HTTPS o archivo del sitio', max: 500 }, { key: 'descripcion', label: 'Descripción', type: 'textarea', max: 10000 },
      { key: 'estado_actividad', label: 'Estado', required: true, options: options(['programada', 'cancelada']) },
    ]
    if (activityType === 'reunion_grupo') formFields.push({ key: 'id_grupo', label: 'Grupo', required: true, options: catalogOptions(catalogs.grupos, 'id_grupo') })
    else if (has(user, 'eventos.publicar')) formFields.push({ key: 'publicado', label: 'Visible en la web pública', type: 'checkbox' })
    if (activityType === 'evento') formFields.push({ key: 'requiere_inscripcion', label: 'Requiere inscripción', type: 'checkbox' }, { key: 'url_inscripcion', label: 'Enlace de inscripción', type: 'url', max: 500 })
  }
  if (resource === 'groups' && !canServices) formFields = formFields.filter(field => field.key !== 'id_discipulador')
  if (resource === 'groups' && !edit?.id_grupo) formFields = formFields.filter(field => !['id_grupo_origen', 'direccion', 'dia_reunion', 'hora_reunion'].includes(field.key))
  async function save(values: Row) {
    const id = edit?.[ids[resource]]
    const { barrios_seleccion, ...recordValues } = values
    const selection = barrios_seleccion ? JSON.parse(String(barrios_seleccion)) : null
    if (selection?.removedNames?.length && !window.confirm(`¿Quitar estos barrios del grupo: ${selection.removedNames.join(', ')}?`)) throw new Error('Guardado cancelado. Se conservan tus cambios en el formulario.')
    const groupValues = { ...recordValues, ...(selection ? { barrios: { ...selection, confirmRemoval: Boolean(selection.removedNames?.length) } } : {}) }
    if (resource === 'members' && registrationType === 'administrativo' && !id && values.account_password !== values.account_confirmation) throw new Error('Las contraseñas de la cuenta no coinciden.')
    const result = await api<{ id?: number; accountCreated?: boolean; emailDelivery?: WelcomeEmailStatus; seriesId?: number; occurrences?: number }>(id ? `${resource}/${id}` : resource, resource === 'groups' ? groupValues : resource === 'activities' ? { ...values, tipo_actividad: activityType, ...(Object.hasOwn(values, 'recurrence') ? { recurrence: values.recurrence ? JSON.parse(String(values.recurrence)) : null } : {}) } : resource === 'members' && !id ? { ...values, tipo_registro: registrationType } : values, id ? 'PATCH' : 'POST')
    if (result.seriesId) { setEdit(null); notify(id ? 'Programación semanal guardada. Se conservan las asistencias de cada fecha.' : 'Programación semanal creada. Las próximas fechas se prepararán automáticamente.'); await load(); return }
    if (resource === 'groups') window.dispatchEvent(new Event('calvario-coverage-updated'))
    if (resource === 'groups' && !id && result.id) {
      window.location.hash = `#gestion/groups/ficha/${result.id}`
      setEdit(null); notify('Grupo de Comunión creado. Los barrios seleccionados ya están vinculados al mapa.'); await load(); await reloadCatalogs(); return
    }
    setEdit(null); notify(result.accountCreated ? `Administrativo y cuenta de acceso creados. Ya puede iniciar sesión con sus credenciales. ${welcomeEmailMessage(result.emailDelivery)}` : resource === 'members' && !has(user, 'miembros.ver') ? values.id_grupo ? 'Discípulo registrado y asignado al Grupo de Comunión Familiar.' : 'Discípulo registrado. El grupo puede asignarse después.' : 'Cambios guardados.'); await load(); await reloadCatalogs()
  }
  async function archive(row: Row) {
    try { await api(`${resource}/${row[ids[resource]]}`, {}, 'DELETE'); setDetail(null); notify('Registro archivado. Se conserva su historial.'); await load(); await reloadCatalogs() } catch (error) { notify(errorMessage(error)) }
  }
  const createLabels = { members: 'Registrar discípulo', groups: 'Nuevo grupo', activities: 'Nuevo evento' }
  const groupId = window.location.hash.split('/')[2] === 'grupo' ? Number(window.location.hash.split('/')[3]) : null
  const scopedItems = resource === 'members' && groupId ? items.filter(item => Number(item.id_grupo) === groupId) : items
  const visibleItems = scopedItems.filter(row => {
    const matches = searchable(`${row.nombres || ''} ${row.apellidos || ''} ${row.numero_identificacion || ''} ${memberCode(row.codigo_miembro) || ''} ${row.nombre || ''} ${row.titulo || ''}`).includes(searchable(search))
    if (!matches) return false
    if (resource === 'members') return filter === 'todos' || (filter === 'sin_libro' ? !row.id_libro : row.estado_miembro === filter)
    return true
  })
  const openEdit = (row: Row) => { setRegistrationType(row.id_rol_eclesiastico ? 'administrativo' : 'discipulo'); setActivityType(String(row.tipo_actividad || 'evento')); setEdit({ ...row, edit_scope: 'single' }); setDetail(null) }
  async function stopRepetition(row: Row) {
    if (stoppingRepeat || !window.confirm(`¿Eliminar el evento fijo «${row.titulo}» de las próximas fechas? Las fechas ya realizadas y sus asistencias se conservan.`)) return
    setStoppingRepeat(true)
    try { await api(`activities/${row.id_actividad}`, { scope: 'series' }, 'DELETE'); setDetail(null); notify('Evento fijo eliminado de la agenda. Las asistencias anteriores se conservan.'); await load() }
    catch (error) { notify(errorMessage(error)) }
    finally { setStoppingRepeat(false) }
  }
  const canEdit = (row: Row) => has(user, resource === 'activities' ? row.tipo_actividad === 'reunion_grupo' ? 'grupos.editar' : 'eventos.editar' : write[resource])
  const createOnly = resource === 'members' && !has(user, 'miembros.ver')
  if(importing)return <Suspense fallback={<p>Cargando importación…</p>}><MemberImport books={catalogs.libros||[]} onClose={()=>setImporting(false)} onImported={async count=>{await load();await reloadCatalogs();setImporting(false);notify(`${count} discípulos importados. No se modificaron las fichas existentes.`)}}/></Suspense>
  return <section className={`records-page records-${resource}`}>
    <div className="manage-section-heading"><div><h2 ref={titleRef} tabIndex={-1}>{edit ? edit[ids[resource]] ? 'Editar registro' : createLabels[resource] : detail ? 'Detalle' : titles[resource]}</h2>{!edit && !detail && <p className="section-caption">{resource === 'members' ? 'Cada persona, parte de nuestra familia.' : resource === 'groups' ? 'La fe se vive en comunidad.' : 'Nos encontramos para crecer juntos.'}</p>}</div>
    {!edit && !detail && (resource !== 'groups' || canServices) && (has(user, resource === 'members' ? registrationPermission : write[resource]) || resource === 'activities' && has(user, 'grupos.editar')) && <div className="record-heading-actions">{resource==='members'&&<button type="button" className="secondary" onClick={()=>setImporting(true)}>Importar desde Excel</button>}<button className="record-create" onClick={() => { setRegistrationType('discipulo'); setActivityType(has(user, 'eventos.editar') ? 'evento' : 'reunion_grupo'); setEdit(resource === 'groups' ? { estado_grupo: 'activo', id_discipulador: user.permissions['grupos.editar'] === 'grupo' ? user.memberId : null } : resource === 'activities' ? { estado_actividad: 'programada' } : {}) }}><AdminIcon name="plus"/>{createLabels[resource]}</button></div>}
    {detail && <button className="secondary" onClick={() => setDetail(null)}><AdminIcon name="back"/>Volver</button>}
    </div>
    {!edit&&!detail&&resource==='activities'&&<div className="tool-toggle activity-view-toggle" role="group" aria-label="Vista de eventos"><button type="button" aria-pressed={activityView==='list'} onClick={()=>setActivityView('list')}>Lista</button><button type="button" aria-pressed={activityView==='calendar'} onClick={()=>setActivityView('calendar')}>Calendario</button></div>}
    {!edit&&!detail&&resource==='activities'&&activityView==='calendar'&&<Suspense fallback={<p>Cargando calendario…</p>}><EventCalendar onSelect={row=>setDetail(row)}/></Suspense>}
    {!edit && !detail && (resource!=='activities'||activityView==='list') && <>
      {groupId && <p className="group-filter">Mostrando discípulos del grupo seleccionado. <a href="#gestion/members">Ver todos</a></p>}
      {!createOnly && <form className="record-search" onSubmit={event => { event.preventDefault() }}><AdminIcon name="search"/><label className="sr-only" htmlFor={`search-${resource}`}>Buscar {resource === 'members' ? 'por nombre, identificación o ID' : titles[resource].toLowerCase()}</label><input id={`search-${resource}`} value={search} type="search" placeholder={resource === 'members' ? 'Buscar por nombre o identificación' : resource === 'groups' ? 'Buscar grupo' : 'Buscar evento o culto'} maxLength={100} onChange={event => setSearch(event.target.value)} /></form>}
      {resource === 'members' && !createOnly && <><div className="record-filters" role="group" aria-label="Filtrar discípulos">{[['todos', 'Todos'], ['activo', 'Activos'], ['inactivo', 'Inactivos'], ['retirado', 'Retirados'], ['sin_libro', 'Sin libro']].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label} <span>({value === 'todos' ? scopedItems.length : scopedItems.filter(item => value === 'sin_libro' ? !item.id_libro : item.estado_miembro === value).length})</span></button>)}</div>{has(user, 'reportes.discipulos') && <button type="button" className="secondary" disabled={exporting} onClick={() => {
        const query = new URLSearchParams({ format: 'xlsx', ...(search ? { q: search } : {}), ...(['activo', 'inactivo', 'retirado'].includes(filter) ? { estado: filter } : {}), ...(filter === 'sin_libro' ? { sin_libro: '1' } : {}), ...(groupId ? { id_grupo: String(groupId) } : {}) })
        setExporting(true); void downloadReport(`reports/discipulos?${query}`, 'discipulos.xlsx').then(() => notify('Excel de discípulos descargado.')).catch(cause => notify(errorMessage(cause))).finally(() => setExporting(false))
      }}>{exporting ? 'Preparando Excel…' : 'Descargar discípulos en Excel'}</button>}</>}
      {resource === 'activities' && <p className="section-caption">Cada evento fijo muestra solo su próxima fecha. Los encuentros pasados se conservan en Asistencia y en el calendario.</p>}
    </>}
    {edit && <div className="manage-editor record-editor" ref={editorRef}>
      {resource === 'members' && !edit.id_miembro && <div className="registration-choice">
        {canAdministrative ? <><label htmlFor="registration-type">Tipo de registro</label><AppSelect id="registration-type" value={registrationType} onChange={event => {
          const form = editorRef.current?.querySelector('form')
          if (form) {
            const draft = Object.fromEntries(new FormData(form)) as Row
            for (const checkbox of form.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) draft[checkbox.name] = Number(checkbox.checked)
            setEdit(previous => ({ ...previous, ...draft }))
          }
          setRegistrationType(event.target.value as 'discipulo' | 'administrativo')
        }}><option value="discipulo">Discípulo normal</option><option value="administrativo">Administrativo con cuenta de acceso</option></AppSelect><p>{registrationType === 'administrativo' ? 'Se crearán la ficha, el cargo pastoral y una cuenta activa para la persona.' : 'Registra la ficha y selecciona su Grupo de Comunión Familiar.'}</p></> : <p>Tu cargo permite registrar discípulos para sus Grupos de Comunión Familiar. La asignación de cargos y servicios corresponde a los niveles pastorales 1 al 5.</p>}
      </div>}
      {resource === 'activities' && !edit.id_actividad && <label>Tipo de actividad <AppSelect value={activityType} onChange={event => setActivityType(event.target.value)}>{(has(user, 'eventos.editar') ? ['culto', 'evento'] : []).concat(has(user, 'grupos.editar') ? ['reunion_grupo'] : []).map(type => <option key={type} value={type}>{typeNames[type]}</option>)}</AppSelect></label>}
      {resource === 'activities' && edit.id_serie && <p className="event-repeat-note">Evento fijo. Los cambios de programación se aplican a las próximas fechas y conservan el historial de asistencia.</p>}
      <DataForm key={`${edit[ids[resource]] || 'new'}-${activityType}-${registrationType}`} fields={formFields} initial={edit} onSave={save} onCancel={() => { setEdit(null); if (resource === 'groups' && window.location.hash === '#gestion/groups/nuevo') window.location.hash = '#gestion/groups' }} memberWizard={resource === 'members'} groupNeighborhoods={resource === 'groups' && Boolean(canManageCoverage(user))} availableBarrios={catalogs.barrios} label={resource === 'members' ? registrationType === 'administrativo' && !edit.id_miembro ? 'Crear administrativo y cuenta' : 'Guardar discípulo' : resource === 'groups' ? 'Guardar grupo' : 'Guardar'} />
    </div>}
    {!edit && !detail && (resource!=='activities'||activityView==='list') && (loading ? <div className="app-empty" role="status"><span className="auth-spinner"/>Cargando tu comunidad…</div> : !visibleItems.length ? <div className="app-empty"><span className="empty-icon"><AdminIcon name={resource}/></span><h3>{createOnly ? 'Registra un discípulo' : items.length ? 'No encontramos coincidencias' : resource === 'members' ? 'Aquí comienza tu comunidad' : resource === 'groups' ? 'Un lugar para compartir la fe' : 'Preparemos el próximo encuentro'}</h3><p>{createOnly ? 'Crea su ficha y selecciona el Grupo de Comunión Familiar al que pertenece.' : items.length ? 'Prueba otra búsqueda o cambia el filtro.' : 'Los registros que crees aparecerán aquí.'}</p></div> : <div className="manage-records app-record-list">{visibleItems.map(row => {
      const name = String(row.nombres ? `${row.nombres} ${row.apellidos || ''}` : row.nombre || row.titulo)
      return <article key={row[ids[resource]]}>
      <button className="record-open" aria-label={`Ver ficha de ${name}`} onClick={() => { setDetail(row); setEdit(null) }}>
        {resource === 'members' ? <span className="member-avatar" aria-hidden="true">{`${String(row.nombres || '').slice(0, 1)}${String(row.apellidos || '').slice(0, 1)}`}</span> : resource === 'groups' ? <span className="group-avatar"><AdminIcon name="members"/></span> : <span className="event-cover">{row.imagen ? <img src={String(row.imagen)} alt="" loading="lazy"/> : <AdminIcon name="activities"/>}<span className="event-date"><small>{new Date(`${row.fecha}T12:00:00-05:00`).toLocaleDateString('es-CO', { month: 'short', timeZone: 'America/Bogota' }).replace('.', '')}</small><b>{String(row.fecha).slice(8, 10)}</b></span></span>}
        <span className="record-copy"><strong>{name}</strong>{resource === 'members' ? <>{memberCode(row.codigo_miembro) && <span className="member-code">ID {memberCode(row.codigo_miembro)}</span>}<span>{row.tipo_identificacion} {row.numero_identificacion}</span><span>Libro: {row.libro_actual || 'Sin asignar'}</span><span className="record-state" data-state={row.estado_miembro}>{row.estado_miembro}</span></> : resource === 'groups' ? <><span>{row.miembros} discípulos</span><span>{row.dia_reunion || 'Día por definir'}{row.hora_reunion ? ` · ${String(row.hora_reunion).slice(0, 5)}` : ''}</span></> : <><span>{row.fecha} · {String(row.hora).slice(0, 5)}</span>{row.id_serie && <span>{weeklySchedule(Number(row.dia_semana), String(row.repeticion_hora || row.hora), Boolean(row.repeticion_activa))}</span>}<span>{row.lugar}</span><span className="event-type" data-state={row.estado_actividad}>{row.estado_actividad === 'cancelada' ? 'Cancelada' : typeNames[String(row.tipo_actividad)]}</span></>}</span>
        <AdminIcon name="chevron"/>
      </button>
      {(canEdit(row) || has(user, remove[resource])) && <details className="record-menu"><summary aria-label={`Acciones de ${name}`}>•••</summary><div>{canEdit(row) && <button className="secondary" onClick={() => openEdit(row)}>Editar</button>}{has(user, remove[resource]) && <button className="secondary" onClick={() => void (resource === 'activities' && row.id_serie ? stopRepetition(row) : archive(row))}>{resource === 'activities' && row.id_serie ? 'Eliminar fijo' : 'Archivar'}</button>}</div></details>}
    </article>})}</div>)}
    {detail && resource === 'activities' && <aside className="manage-editor activity-detail">{detail.imagen && <img className="activity-detail-image" src={String(detail.imagen)} alt=""/>}<span className="event-type">{typeNames[String(detail.tipo_actividad)]}</span><h3>{detail.titulo}</h3><p>{detail.fecha} · {String(detail.hora).slice(0, 5)} · {detail.lugar}</p>{detail.id_serie && <p className="event-repeat-note">{weeklySchedule(Number(detail.dia_semana), String(detail.repeticion_hora || detail.hora), Boolean(detail.repeticion_activa))}{detail.repeticion_fin ? ` · Hasta ${detail.repeticion_fin}` : ''}</p>}<p>{detail.descripcion || 'Sin descripción adicional.'}</p><p>Estado: {detail.estado_actividad}</p><div className="manage-actions">{canEdit(detail) && <button onClick={() => openEdit(detail)}>Editar actividad</button>}{detail.id_serie && has(user, 'eventos.eliminar') && <button className="secondary" disabled={stoppingRepeat} onClick={() => void stopRepetition(detail)}>{stoppingRepeat ? 'Eliminando…' : 'Eliminar evento fijo'}</button>}{(has(user, 'asistencia.registrar') || has(user, 'asistencia.ver')) && <a className="app-action secondary" href={`#gestion/falls/registro/actividad/${detail.id_actividad}`}>Ver asistencia</a>}</div></aside>}
    {detail && resource === 'members' && <MemberDetail key={detail.id_miembro} row={detail} user={user} catalogs={catalogs} reloadCatalogs={reloadCatalogs} notify={notify} onSaved={load} onClose={() => setDetail(null)} />}
    {detail && resource === 'groups' && <GroupDetail key={detail.id_grupo} row={detail} user={user} onClose={() => setDetail(null)} onEdit={canEdit(detail) ? () => openEdit(detail) : undefined} />}
  </section>
}

function MemberDetail({ row, user, catalogs, reloadCatalogs, notify, onSaved, onClose }: { row: Row; user: AuthUser; catalogs: Catalogs; reloadCatalogs: () => Promise<void>; notify: Message; onSaved: () => Promise<void>; onClose: () => void }) {
  const [ministries, setMinistries] = useState<number[]>([])
  const [history, setHistory] = useState<Row[]>([])
  const [coverageOptions, setCoverageOptions] = useState<Option[]>([])
  const [state, setState] = useState(String(row.estado_miembro))
  const [exporting, setExporting] = useState(false)
  async function loadDetails() {
    try {
      const [membership, changes] = await Promise.all([api<{ items: Row[] }>(`members/${row.id_miembro}/ministries`), api<{ items: Row[] }>(`members/${row.id_miembro}/history`)])
      setMinistries(membership.items.map(item => Number(item.id_ministerio))); setHistory(changes.items)
      if (has(user, 'grupos.editar') && user.permissions['grupos.editar'] === 'todos') {
        const people = (await api<{ items: Row[] }>('members')).items
        setCoverageOptions(people.filter(person => person.id_miembro !== row.id_miembro).map(person => ({ value: Number(person.id_miembro), label: `${person.nombres} ${person.apellidos || ''}`.trim() })))
      }
    } catch (error) { notify(errorMessage(error)) }
  }
  useEffect(() => { void loadDetails() }, [row.id_miembro])
  const labels: Record<string, string> = { nombres: 'Nombres', apellidos: 'Apellidos', tipo_identificacion: 'Tipo de identificación', numero_identificacion: 'Identificación', celular: 'Celular', correo: 'Correo', fecha_nacimiento: 'Nacimiento / cumpleaños', funcion_iglesia: 'Función', grupo_sanguineo_rh: 'Grupo sanguíneo / RH', eps: 'EPS', contacto_emergencia_nombre: 'Contacto de emergencia', contacto_emergencia_celular: 'Celular de emergencia', id_grupo: 'ID de grupo', id_rol_eclesiastico: 'ID de rol eclesiástico', id_cobertura_pastoral: 'ID de cobertura pastoral', codigo_qr: 'Identificador QR', fecha_creacion: 'Creación', fecha_actualizacion: 'Actualización' }
  return <aside className="manage-editor"><div className="manage-section-heading"><h3>Ficha de {row.nombres}{memberCode(row.codigo_miembro) && <span className="member-code">ID {memberCode(row.codigo_miembro)}</span>}</h3><button className="secondary" onClick={onClose}>Cerrar ficha</button></div>
    <section className="training-member-current" aria-label="Adiestramiento del discípulo"><h4>Libro actual</h4><p><strong>{row.libro_actual || 'Sin libro asignado'}</strong></p>
      {canCreateTrainingBooks(user) && <DataForm fields={[{ key: 'id_libro', label: 'Seleccionar libro de adiestramiento', required: Boolean(catalogs.libros?.length), render: ({ disabled, labelId, onBusy }) => <TrainingBookPicker key={`${row.id_miembro}-${row.id_libro || 'none'}`} books={catalogs.libros || []} initialId={row.id_libro} required={Boolean(catalogs.libros?.length)} disabled={disabled} canCreate onCreated={reloadCatalogs} onBusy={onBusy} labelledBy={labelId}/> }]} initial={row} label={row.id_libro ? 'Actualizar libro actual' : 'Asignar libro'} submitDisabled={!catalogs.libros?.length} onSave={async values => { await api(`members/${row.id_miembro}/book`, { id_libro: values.id_libro, expectedId: row.id_libro || null }, 'PUT'); await onSaved(); notify('Libro de adiestramiento asignado.'); }}/>}
    </section>
    {has(user, 'reportes.discipulos') && <button type="button" className="secondary" disabled={exporting} onClick={() => { setExporting(true); void downloadReport(`members/${row.id_miembro}/excel`, `discipulo-${memberCode(row.codigo_miembro) || row.id_miembro}.xlsx`).then(() => notify('Ficha completa descargada en Excel.')).catch(cause => notify(errorMessage(cause))).finally(() => setExporting(false)) }}>{exporting ? 'Preparando Excel…' : 'Descargar ficha en Excel'}</button>}
    <dl className="manage-details">{Object.entries(labels).filter(([key]) => Object.hasOwn(row, key)).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{String(row[key] || 'Sin registrar')}</dd></div>)}</dl>
    {has(user,'asistencia.ver') && <MemberAttendance key={row.id_miembro} memberId={Number(row.id_miembro)}/>}
    {has(user, 'miembros.estado') && <form className="manage-actions" onSubmit={event => { event.preventDefault(); void api(`members/${row.id_miembro}/state`, { estado_miembro: state }).then(() => { notify('Estado actualizado.'); void onSaved() }).catch(error => notify(errorMessage(error))) }}><label>Estado del discípulo <AppSelect value={state} onChange={event => setState(event.target.value)}>{['activo', 'inactivo', 'retirado'].map(value => <option key={value}>{value}</option>)}</AppSelect></label><button>Actualizar estado</button></form>}
    {has(user, 'grupos.editar') && !has(user, 'miembros.editar') && <><h4>Grupo y cobertura</h4><DataForm fields={[
      { key: 'id_grupo', label: 'Grupo', options: catalogOptions(catalogs.grupos, 'id_grupo') },
      ...(user.permissions['grupos.editar'] === 'todos' ? [{ key: 'id_cobertura_pastoral', label: 'Cobertura pastoral', options: coverageOptions }] : []),
    ]} initial={row} onSave={async values => { await api(`members/${row.id_miembro}/relations`, values); notify('Relaciones actualizadas.'); await onSaved(); await loadDetails() }} /></>}
    <h4>Ministerios</h4><div className="manage-actions">{catalogs.ministerios.map(ministry => <label key={ministry.id_ministerio}><input type="checkbox" checked={ministries.includes(Number(ministry.id_ministerio))} disabled={!has(user, 'ministerios.gestionar') || !user.registration?.canAssignServices} onChange={event => setMinistries(event.target.checked ? [...ministries, Number(ministry.id_ministerio)] : ministries.filter(id => id !== ministry.id_ministerio))} /> {ministry.nombre}</label>)}</div>
    {has(user, 'ministerios.gestionar') && user.registration?.canAssignServices && <button onClick={() => void api(`members/${row.id_miembro}/ministries`, { ids: ministries }, 'PUT').then(() => notify('Ministerios guardados.')).catch(error => notify(errorMessage(error)))}>Guardar ministerios</button>}
    <h4>Historial de grupo y cobertura</h4>{history.length ? history.map(item => <p key={item.id_historial}>{item.concepto}: {item.id_anterior || 'Sin asignar'} → {item.id_nuevo || 'Sin asignar'} · {item.fecha_cambio}</p>) : <p>Sin cambios registrados.</p>}
    {canManageCoverage(user) && catalogs.roles.some(role => role.id_rol_eclesiastico === row.id_rol_eclesiastico && Number(role.nivel_jerarquico) === 6) && <CoverageAssignments id={Number(row.id_miembro)} name={`${row.nombres} ${row.apellidos || ''}`} user={user}/>}
    <DiscipleConsent memberId={Number(row.id_miembro)} sensitive={has(user, 'miembros.sensibles')} notify={notify}/>
  </aside>
}

function GroupDetail({ row, user, onClose, onEdit }: { row: Row; user: AuthUser; onClose: () => void; onEdit?: () => void }) {
  const mapQuery = row.latitud != null && row.longitud != null ? `${row.latitud},${row.longitud}` : row.direccion ? `${row.direccion}, ${row.barrio || ''}, Villavicencio, Meta` : null
  return <aside className="manage-editor group-detail"><div className="group-detail-banner" aria-hidden="true"><AdminIcon name="groups"/><span>LA FE NOS REÚNE</span></div><div className="manage-section-heading"><h3>{row.nombre}</h3><button className="secondary" onClick={onClose}>Cerrar ficha</button></div>
    <p style={{ whiteSpace: 'pre-line' }}><strong>Barrio o barrios:</strong> {row.barrio || 'Sin asignar'}</p>
    {(row.direccion || row.dia_reunion || row.hora_reunion) && <p>{[row.direccion, row.dia_reunion, String(row.hora_reunion || '').slice(0, 5)].filter(Boolean).join(' · ')}</p>}
    <p>Discípulos registrados: {row.miembros}. Discipulador: ID {row.id_discipulador || 'sin asignar'}.</p>
    <GroupTerritory key={String(row.id_discipulador || 'sin-discipulador')} id={Number(row.id_grupo)} leaderId={row.id_discipulador ? Number(row.id_discipulador) : null} user={user}/>
    {!row.id_discipulador && onEdit && <button type="button" className="secondary" onClick={onEdit}>Asignar discipulador</button>}
    <div className="group-detail-actions">{has(user, 'miembros.ver') && <a className="app-action secondary" href={`#gestion/members/grupo/${row.id_grupo}`}><span className="dashboard-card-icon"><AdminIcon name="members"/></span>Ver discípulos<AdminIcon name="chevron"/></a>}{onEdit && <button type="button" className="secondary" onClick={onEdit}><span className="dashboard-card-icon"><AdminIcon name="groups"/></span>Editar grupo<AdminIcon name="chevron"/></button>}{has(user, 'grupos.ver') && <a className="app-action secondary" href="#gestion/mapa"><span className="dashboard-card-icon"><AdminIcon name="mapa"/></span>Ver barrios en el mapa<AdminIcon name="chevron"/></a>}{mapQuery && <a className="app-action secondary" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noopener noreferrer"><span className="dashboard-card-icon"><AdminIcon name="home"/></span>Ubicación en mapa<AdminIcon name="chevron"/></a>}</div>
  </aside>
}

function Attendance({ user, notify }: { user: AuthUser; notify: Message }) {
  const [selectedActivity, setSelectedActivity] = useState<Row | null>(null)
  const [rosterVersion,setRosterVersion] = useState('')
  const [exporting,setExporting] = useState(false)
  const [clock,setClock] = useState(Date.now())
  const [activityId, setActivityId] = useState(() => window.location.hash.split('/')[3] === 'actividad' ? window.location.hash.split('/')[4] || '' : '')
  const [roster, setRoster] = useState<Row[]>([])
  const [records, setRecords] = useState<Row[]>([])
  const [method, setMethod] = useState('manual')
  const [corrections, setCorrections] = useState<Record<string, string>>({})
  const [pending, setPending] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)
  useEffect(() => { const timer=window.setInterval(()=>setClock(Date.now()),60000);return()=>window.clearInterval(timer) },[])
  async function load() {
    const request = ++requestId.current
    if (!activityId) { setRoster([]); setRecords([]); return }
    setLoading(true)
    try {
      const [people, attendance] = await Promise.all([has(user, 'asistencia.registrar') ? api<{ items: Row[]; version?:string; activity?:Row }>(`attendance/roster?activityId=${activityId}`) : Promise.resolve({ items: [],version:'',activity:undefined }), has(user, 'asistencia.ver') ? api<{ items: Row[]; activity?:Row }>(`attendance?activityId=${activityId}`) : Promise.resolve({ items: [],activity:undefined })])
      if (request !== requestId.current) return
      setRoster(people.items);setRosterVersion(people.version || ''); setRecords(attendance.items); setCorrections({})
      setSelectedActivity(attendance.activity || people.activity || null)
    } catch (error) { if (request === requestId.current) { notify(errorMessage(error)); setRoster([]); setRecords([]) } }
    finally { if (request === requestId.current) setLoading(false) }
  }
  useEffect(() => { setPending({}); setSearch(''); void load(); return () => { requestId.current++ } }, [activityId])
  const selected = selectedActivity && String(selectedActivity.id_actividad)===activityId ? selectedActivity : null
  const states: Record<string, string> = { presente: 'Presente', ausente: 'Ausente sin justificación', justificado: 'Justificado', visitante: 'Visitante' }
  const outstanding=roster.filter(person=>!person.registrado&&!records.some(record=>record.id_miembro===person.id_miembro))
  const started=selected ? new Date(`${selected.fecha}T${selected.hora}-05:00`).getTime()<=clock : false
  async function saveRoster() {
    if (saving || !outstanding.length) return
    setSaving(true)
    try {
      const eligible=new Set(outstanding.map(person=>String(person.id_miembro)))
      const result=await api<{created:number;absent:number;present:number;justified:number}>('attendance/save',{activityId:Number(activityId),rosterVersion,states:Object.fromEntries(Object.entries(pending).filter(([id])=>eligible.has(id)))})
      setPending({});await load()
      notify(`Asistencia guardada. Presentes: ${result.present}; justificados: ${result.justified}; ausentes sin justificación: ${result.absent}.`)
    }catch(error){notify(errorMessage(error));await load()}finally{setSaving(false)}
  }
  return <section className="attendance-page"><h2>Asistencia</h2><p className="section-caption">Consulta encuentros actuales y anteriores, guarda la asistencia o descarga el registro de un evento.</p><AttendanceActivityPicker value={activityId} selected={selected} disabled={saving||loading} onChange={activity=>{setSelectedActivity(activity);setActivityId(activity?String(activity.id_actividad):'')}}/>
    {!activityId && <div className="app-empty"><span className="empty-icon"><AdminIcon name="attendance"/></span><h3>¿En qué encuentro estamos?</h3><p>Selecciona una actividad para consultar o registrar su asistencia.</p></div>}
    {activityId && <>
      {selected && <div className="attendance-event"><span className="dashboard-card-icon"><AdminIcon name="activities"/></span><div><strong>{selected.titulo}</strong><span>{selected.fecha} · {String(selected.hora).slice(0, 5)}</span></div><span className="app-count">{selected.estado_actividad === 'cancelada' ? 'Cancelada' : 'Encuentro'}</span></div>}
      {has(user,'reportes.asistencia') && selected && <div className="attendance-export"><p>Descargar los registros guardados de este evento y esta fecha.</p>{(['pdf','xlsx'] as const).map(format=><button type="button" className="secondary" key={format} disabled={exporting||saving||loading} onClick={()=>{setExporting(true);void downloadReport(`reports/asistencia?${new URLSearchParams({activityId,format})}`,`asistencia-${selected.fecha}-${activityId}.${format}`).catch(error=>notify(errorMessage(error))).finally(()=>setExporting(false))}}>Descargar asistencia en {format==='pdf'?'PDF':'Excel'}</button>)}</div>}
      {has(user, 'asistencia.registrar') && <>
        <form className="record-search" onSubmit={event => event.preventDefault()}><AdminIcon name="search"/><label className="sr-only" htmlFor="attendance-search">Buscar discípulo para asistencia</label><input id="attendance-search" value={search} placeholder="Buscar discípulo" type="search" onChange={event => setSearch(event.target.value)}/></form>
        {loading ? <p role="status">Cargando asistencia…</p> : <div className="attendance-roster">{roster.filter(person => String(person.nombre).toLowerCase().includes(search.toLowerCase())).map(person => {
          const id = String(person.id_miembro)
          const existing = records.find(record => String(record.id_miembro) === id)
          return <div key={id} className="attendance-person"><span className="member-avatar" aria-hidden="true">{String(person.nombre).split(' ').slice(0, 2).map(word => word[0]).join('')}</span><strong>{person.nombre}</strong>{existing ? <span className="attendance-saved" data-state={existing.estado_asistencia}>{states[String(existing.estado_asistencia)] || existing.estado_asistencia}<small>Guardado</small></span> : person.registrado ? <span className="attendance-saved">Asistencia guardada</span> : <AppSelect aria-label={`Asistencia de ${person.nombre}`} data-state={pending[id] || 'ausente'} disabled={saving || selected?.estado_actividad === 'cancelada'} value={pending[id] || ''} onChange={event => setPending(previous => { const next = { ...previous }; if (event.target.value) next[id] = event.target.value; else delete next[id]; return next })}><option value="">Ausente sin justificación (sin marcar)</option>{['presente', 'ausente', 'justificado'].map(state => <option key={state} value={state}>{states[state]}</option>)}</AppSelect>}</div>
        })}{!roster.length && <p>No hay discípulos disponibles para esta actividad. Puedes registrar un visitante a continuación.</p>}</div>}
        <p className="attendance-save-note">Al guardar, quienes queden sin marcar se registrarán como ausentes sin justificación. Los justificados se seleccionan aparte. {!started&&'El guardado completo se habilita al comenzar el evento.'}</p>
        <button className="attendance-save" disabled={saving || loading || !outstanding.length || !started || selected?.estado_actividad === 'cancelada'} onClick={() => void saveRoster()}>{saving ? 'Guardando asistencia…' : 'Guardar asistencia y registrar ausentes'}</button>
      </>}
      {has(user, 'asistencia.registrar') && <details className="attendance-other"><summary>Registrar visitante, identificador QR u otro estado</summary><div className="manage-editor"><label>Método <AppSelect value={method} disabled={saving} onChange={event => setMethod(event.target.value)}><option value="manual">Manual</option><option value="qr">QR: ingresar identificador</option></AppSelect></label>
      <DataForm key={`${activityId}-${method}`} fields={[
        ...(method === 'manual' ? [{ key: 'id_miembro', label: 'Discípulo (sin asignar para visitante)', options: roster.map(item => ({ value: Number(item.id_miembro), label: String(item.nombre) })) }] : [{ key: 'codigo_qr', label: 'Identificador QR del discípulo', required: true, max: 36 }]),
        { key: 'estado_asistencia', label: 'Estado de asistencia', required: true, options: options(attendanceStates) },
        { key: 'nombre_visitante', label: 'Nombre del visitante, si aplica', max: 150 },
      ]} initial={{ estado_asistencia: 'presente' }} onSave={async values => { await api('attendance', { ...values, id_actividad: Number(activityId), metodo_registro: method }); notify('Asistencia registrada.'); await load() }} label="Registrar asistencia" />
    </div></details>}
    {records.length > 0 && <h3 className="attendance-record-heading">Asistencias guardadas <span>{records.length}</span></h3>}
    <div className="manage-records">{records.map(row => <article key={row.id_asistencia}><div><strong>{row.nombre || row.nombre_visitante || 'Visitante'}</strong><p>{states[String(row.estado_asistencia)] || row.estado_asistencia} · {row.metodo_registro}</p></div><div className="manage-actions">
      {has(user, 'asistencia.corregir') && <><label>Corregir <AppSelect aria-label="Corregir" value={corrections[String(row.id_asistencia)] || String(row.estado_asistencia)} onChange={event => setCorrections({ ...corrections, [String(row.id_asistencia)]: event.target.value })}>{attendanceStates.map(value => <option key={value}>{value}</option>)}</AppSelect></label><button onClick={() => void api(`attendance/${row.id_asistencia}`, { estado_asistencia: corrections[String(row.id_asistencia)] || row.estado_asistencia }, 'PATCH').then(() => { notify('Asistencia corregida; alertas recalculadas.'); void load() }).catch(error => notify(errorMessage(error)))}>Guardar corrección</button></>}
      {has(user, 'asistencia.eliminar') && <button className="secondary" onClick={() => void api(`attendance/${row.id_asistencia}`, {}, 'DELETE').then(() => { notify('Asistencia archivada.'); void load() }).catch(error => notify(errorMessage(error)))}>Archivar</button>}
    </div></article>)}</div></>}
  </section>
}

function Reports({ user, notify }: { user: AuthUser; notify: Message }) {
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [busy, setBusy] = useState(false)
  async function download(type: string, format: string) {
    setBusy(true)
    try {
      const query = new URLSearchParams({ format, ...(from ? { from } : {}), ...(to ? { to } : {}) })
      await downloadReport(`reports/${type}?${query}`, `${type}.${format}`)
      notify('Reporte descargado.')
    } catch (error) { notify(errorMessage(error)) } finally { setBusy(false) }
  }
  return <section className="reports-page"><h2>Reportes</h2><p className="section-caption">La información que necesitas, lista para compartir.</p>
    <div className="manage-records report-cards">{[
      { type: 'asistencia', label: 'Reporte de asistencia', icon: 'activities', description: 'Consulta la asistencia registrada en un rango de fechas.' },
      { type: 'cumpleanos', label: 'Listado de cumpleaños', icon: 'birthday', description: 'Las fechas para celebrar a nuestra comunidad.' },
      { type: 'grupos', label: 'Grupos de Comunión', icon: 'members', description: 'Grupos registrados y las personas que los integran.' },
      { type: 'discipulos', label: 'Ficha completa de discípulos', icon: 'training', description: 'Datos de la ficha, ministerios y libro de adiestramiento actual.' },
    ].filter(report => has(user, `reportes.${report.type}`)).map(report => <article key={report.type} data-report={report.type}><span className="report-icon"><AdminIcon name={report.icon}/></span><div className="report-copy"><strong>{report.label}</strong><p>{report.description}</p>{report.type === 'asistencia' && <div className="report-dates"><label>Desde<input type="date" value={from} onChange={event => setFrom(event.target.value)}/></label><label>Hasta<input type="date" min={from} value={to} onChange={event => setTo(event.target.value)}/></label></div>}<div className="manage-actions">{(report.type === 'discipulos' ? ['xlsx'] : ['pdf', 'xlsx']).map(format => <button key={format} className={`report-export export-${format}`} aria-label={`${report.label}: descargar ${format === 'pdf' ? 'PDF' : 'Excel'}`} disabled={busy || Boolean(from && to && from > to) && report.type === 'asistencia'} onClick={() => void download(report.type, format)}><AdminIcon name="reports"/>{format === 'pdf' ? 'PDF' : 'Excel'}</button>)}</div></div></article>)}</div>
  </section>
}

function Dashboard({ user }: { user: AuthUser }) {
  const [widgets, setWidgets] = useState<{ key: string; label: string; value: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState('')
  const available = new Set(allowedModules(user).map(module => module.key))
  useEffect(() => {
    let active = true
    api<{ widgets: { key: string; label: string; value: number }[] }>('dashboard').then(result => { if (active) setWidgets(result.widgets) }).catch(error => { if (active) setFailure(errorMessage(error)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [JSON.stringify(user.permissions)])
  const shortcuts = [
    { key: 'members', label: 'Discípulos', icon: 'members', description: 'Registrar / Buscar', href: '#gestion/members', allowed: available.has('members') },
    { key: 'groups', label: 'Grupos de Comunión', icon: 'groups', description: 'Ver grupos', href: '#gestion/groups', allowed: available.has('groups') },
    { key: 'training', label: 'Adiestramiento', icon: 'training', description: 'Libros / Formación', href: '#gestion/training', allowed: available.has('training') },
    { key: 'attendance', label: 'Asistencia', icon: 'attendance', description: 'Tomar asistencia', href: '#gestion/falls/registro', allowed: has(user, 'asistencia.registrar') || has(user, 'asistencia.ver') },
    { key: 'activities', label: 'Eventos y Cultos', icon: 'activities', description: 'Crear / Consultar', href: '#gestion/activities', allowed: available.has('activities') },
    { key: 'alerts', label: 'Alertas', icon: 'alerts', description: 'Acompañamiento pastoral', href: '#gestion/falls/alertas', allowed: has(user, 'alertas.ver') },
    { key: 'reports', label: 'Reportes', icon: 'reports', description: 'Asistencia, cumpleaños y grupos', href: '#gestion/reports', allowed: available.has('reports') },
    ...(available.has('transmisiones') ? [{ key: 'transmisiones', label: 'Transmisiones', icon: 'transmisiones', description: 'Facebook en vivo', href: '#gestion/transmisiones', allowed: true }] : []),
  ]
  const widgetIcons: Record<string, string> = { miembros: 'members', grupos: 'groups', alertas: 'alerts', cumpleanos: 'birthday', eventos: 'activities' }
  const widgetLinks: Record<string, string> = { miembros: '#gestion/members', grupos: '#gestion/groups', alertas: '#gestion/falls/alertas', cumpleanos: '#gestion/reports', eventos: '#gestion/activities' }
  const date = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota' }).format(new Date())
  return <section className="dashboard-home" aria-labelledby="dashboard-title">
    <div className="dashboard-intro"><div><span className="dashboard-eyebrow">QUÉ BUENO TENERTE AQUÍ</span><h2 id="dashboard-title">Hola, {user.name?.trim().split(/\s+/)[0] || 'bienvenido'}<span className="greeting-dot">.</span></h2><p className="dashboard-date">{date}</p></div><span className="dashboard-welcome-mark" aria-hidden="true"><img src="/media/logo-compact.webp" alt=""/></span></div>
    <section className="today-card" aria-labelledby="today-title"><div className="today-heading"><h3 id="today-title">Hoy en tu comunidad</h3><span>EL CALVARIO</span></div>
      {loading ? <p role="status">Consultando el resumen…</p> : failure ? <p role="alert">{failure}</p> : <div className="today-stats">{widgets.filter(widget => widgetIcons[widget.key]).map(widget => <a key={widget.key} href={widgetLinks[widget.key]} className="today-stat"><AdminIcon name={widgetIcons[widget.key]}/><span><strong>{widget.value}</strong><span>{widget.label}</span></span></a>)}{!widgets.some(widget => widgetIcons[widget.key]) && <p>Tus accesos disponibles están a continuación.</p>}</div>}
    </section>
    <div className="dashboard-section-label"><h3>Tu iglesia, a un toque</h3><span>ACCESOS RÁPIDOS</span></div>
    <nav className="dashboard-shortcuts" aria-label="Accesos principales">
      {shortcuts.map(shortcut => {
        const content = <>
          <span className="dashboard-card-icon"><AdminIcon name={shortcut.icon}/></span>
          <span className="dashboard-card-copy"><strong>{shortcut.label}</strong><span>{shortcut.allowed ? shortcut.description : 'Sin acceso con tu rol'}</span></span>
          <span className="dashboard-card-arrow" aria-hidden="true">↗</span>
        </>
        return shortcut.allowed
          ? <a key={shortcut.key} className="dashboard-shortcut" data-shortcut={shortcut.key} href={shortcut.href} aria-label={shortcut.label}>{content}</a>
          : <button key={shortcut.key} type="button" className="dashboard-shortcut" data-shortcut={shortcut.key} disabled aria-label={`${shortcut.label}: sin acceso con tu rol`}>{content}</button>
      })}
    </nav>
  </section>
}
function Falls({ user, notify }: { user: AuthUser; notify: Message }) {
  const canRegister = has(user, 'asistencia.registrar') || has(user, 'asistencia.ver')
  const canSeeAlerts = has(user, 'alertas.ver')
  const readSection = () => {
    const route = window.location.hash.split('/')
    const requested = route[1] === 'alerts' || route[2] === 'alertas' ? 'alertas' : 'registro'
    return (requested === 'alertas' && canSeeAlerts) || !canRegister ? 'alertas' : 'registro'
  }
  const [section, setSection] = useState(readSection)
  useEffect(() => {
    const update = () => setSection(readSection())
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [canRegister, canSeeAlerts])
  return <section className="manage-falls" aria-labelledby="falls-title">
    <h2 id="falls-title" className="sr-only">Asistencia y alertas</h2>
    <nav className="falls-tabs" aria-label="Secciones de Fallas">
      {canRegister && <a href="#gestion/falls/registro" aria-current={section === 'registro' ? 'page' : undefined}><AdminIcon name="attendance"/>Registro de asistencia</a>}
      {canSeeAlerts && <a href="#gestion/falls/alertas" aria-current={section === 'alertas' ? 'page' : undefined}><AdminIcon name="alerts"/>Alertas</a>}
    </nav>
    <div className="falls-content" key={section}>
      {section === 'registro' && canRegister && <Attendance user={user} notify={notify}/>}
      {section === 'alertas' && canSeeAlerts && <Suspense fallback={<p>Cargando seguimiento pastoral…</p>}><PastoralFollowup notify={notify}/></Suspense>}
    </div>
  </section>
}

export default function Management() {
  const { user, checking, error, refresh, setUser } = useAuthSession()
  const accessKey = JSON.stringify([user?.id, user?.memberId, user?.state, user?.permissions, user?.pastoralRole, user?.registration])
  const [catalogs, setCatalogs] = useState<Catalogs>(emptyCatalogs)
  const [requestedTab, setRequestedTab] = useState(currentModule)
  const [message, setMessage] = useState('')
  const [accountBusy, setAccountBusy] = useState(false)
  async function checkActivation() {
    setAccountBusy(true); setMessage('')
    try {
      const updated = await refresh()
      setMessage(updated?.state === 'pendiente' ? 'Tu cuenta sigue pendiente por activación.' : updated ? 'Tu cuenta ya está habilitada.' : 'Tu sesión ha finalizado. Inicia sesión nuevamente.')
    } catch (cause) { setMessage(errorMessage(cause)) }
    finally { setAccountBusy(false) }
  }
  async function logout() {
    setAccountBusy(true); setMessage('')
    try { await authRequest('logout', {}); setUser(null); window.location.hash = '#login' }
    catch (cause) { setMessage(errorMessage(cause)) }
    finally { setAccountBusy(false) }
  }
  async function reloadCatalogs() { setCatalogs(await api<Catalogs>('catalogs')) }
  useEffect(() => {
    let active = true
    setCatalogs(emptyCatalogs)
    if (has(user, 'gestion.acceder')) void api<Catalogs>('catalogs').then(result => { if (active) setCatalogs(result) }).catch(cause => { if (active) setMessage(errorMessage(cause)) })
    return () => { active = false }
  }, [accessKey])
  useEffect(() => {
    const update = () => { setRequestedTab(currentModule()); setMessage('') }
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  const tabs = allowedModules(user).filter(module => module.key !== 'users')
  const tab = tabs.some(module => module.key === requestedTab) ? requestedTab : tabs[0]?.key || ''
  const navigation = <AdminNavigation user={user} active={tab} onSelect={key => { setRequestedTab(key); setMessage(''); window.location.hash = `#gestion/${key}` }}/>
  return <AdminFrame title={tab === 'dashboard' ? 'Mi comunidad' : tabs.find(module => module.key === tab)?.label || 'Gestión de la comunidad'} sectionName={user?.state === 'pendiente' ? 'Activación de la cuenta' : tabs.find(module => module.key === tab)?.label || 'Comunidad'} navigation={navigation} viewKey={user?.state === 'pendiente' ? 'pending' : tab} user={user} onUserChange={setUser}>
    <div className="management-shell">
    <div className="manage-message" role="status" aria-live="polite">{message || error}</div>
    {checking ? <p>Verificando acceso…</p> : user?.state === 'pendiente' ? <section className="manage-editor manage-activation" aria-labelledby="activation-title">
      <span className="manage-activation-icon"><AdminIcon name="permissions"/></span>
      <div role="status" aria-live="polite"><h2 id="activation-title">Tu cuenta está pendiente por activación.</h2>
        <p className="manage-activation-email">{user.email}</p>
        <p>Tu sesión está iniciada. El Administrador o un cargo pastoral autorizado debe activar tu cuenta y asignarte un rol para que puedas utilizar las herramientas del panel.</p>
      </div>
      <div className="manage-actions"><button type="button" disabled={accountBusy} onClick={() => void checkActivation()}>{accountBusy ? 'Consultando…' : 'Consultar activación'}</button><button type="button" className="secondary" disabled={accountBusy} onClick={() => void logout()}>Cerrar sesión</button></div>
    </section> : !user || !has(user, 'gestion.acceder') ? <p>Necesitas una cuenta con un rol autorizado. <a href="#login">Ir a mi cuenta</a></p> : <>
      <div className="manage-session"><span className="manage-session-dot"/><span>{user.roles.join(', ')}</span><span>Al servicio de nuestra comunidad</span></div>
      {tab === 'dashboard' && <Dashboard key={accessKey} user={user} />}
      {tab === 'training' && <Training books={catalogs.libros || []} onReload={reloadCatalogs} notify={setMessage} canSeeMembers={has(user, 'miembros.ver')}/>}
      {tab === 'mapa' && <Suspense fallback={<p>Cargando mapa de zonas…</p>}><CoverageMap key={accessKey} user={user}/></Suspense>}
      {(['members', 'groups', 'activities'] as const).map(resource => tab === resource && <Records key={`${resource}-${accessKey}`} resource={resource} user={user} catalogs={catalogs} reloadCatalogs={reloadCatalogs} notify={setMessage} />)}
      {tab === 'falls' && <Falls key={accessKey} user={user} notify={setMessage} />}{tab === 'reports' && <Reports user={user} notify={setMessage} />}
      {tab === 'transmisiones' && <Suspense fallback={<p>Cargando transmisiones…</p>}><Transmissions key={accessKey} notify={setMessage}/></Suspense>}
    </>}
    </div>
  </AdminFrame>
}
