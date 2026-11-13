import AppSelect from './AppSelect'
import ProfilePhoto from './ProfilePhoto'
import DiscipleConsent from './DiscipleConsent'
import { AttendanceActivityPicker, AttendanceQrPanel, MemberAttendance, today as bogotaToday } from './AttendanceTools'
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
import EventImageField from './EventImageField'
import { canManageCoverage } from './CoverageAssignments'
import GroupNeighborhoodField from './GroupNeighborhoodField'
import GroupMembers from './GroupMembers'
import LeaderGroups from './LeaderGroups'
import type { Barrio } from './GroupNeighborhoodField'
import Training, { TrainingBookPicker, canCreateTrainingBooks } from './Training'
import MemberBooks from './MemberBooks'
import GroupLocationField from './GroupLocationField'
import { groupColor } from './group-colors'
import { colombiaToday, fieldRules, oldestBirthDate } from './contact-rules'
import type { TrainingBook } from './Training'
import { downloadReport } from './report-download'
import ValidatedForm, { reportFormErrors, requestFieldErrors } from './ValidatedForm'
const EventCalendar = lazy(() => import('./EventCalendar'))
const GroupsMap = lazy(() => import('./GroupsMap'))
const MemberImport = lazy(() => import('./MemberImport'))

type Row = Record<string, string | number | null>
type Catalogs = { roles: Row[]; ministerios: Row[]; grupos: Row[]; registrationGroups?: Row[]; barrios?: Barrio[]; libros?: TrainingBook[] }
type Option = { value: string | number; label: string }
type Field = { key: string; label: string; type?: string; required?: boolean; max?: number; options?: Option[]; step?: string; placeholder?: string; virtual?: boolean; section?: string; wide?: boolean; hint?: string; render?: (props: { initial: Row; disabled: boolean; labelId: string; onBusy: (busy: boolean) => void }) => ReactNode }
type Message = (message: string) => void
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'No pudimos completar la operación.'
const searchable = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const has = hasPermission
const emptyCatalogs: Catalogs = { roles: [], ministerios: [], grupos: [] }
const options = (values: string[]) => values.map(value => ({ value, label: value }))
const catalogOptions = (rows: Row[], id: string) => rows.map(row => ({ value: Number(row[id]), label: String(row.nombre) }))
const attendanceStates = ['presente', 'ausente', 'justificado', 'visitante']

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
    {(() => {
      const visible = group.fields.filter(field => !field.virtual)
      const renderField = (field: Field) => field.render ? <div key={field.key} className="manage-wide"><span id={`${formId}-${field.key}`} className={field.label ? undefined : 'sr-only'}>{field.label || field.section}{field.required ? ' *' : ''}</span>{field.render({ initial, disabled: busy, labelId: `${formId}-${field.key}`, onBusy: setInlineBusy })}</div> : field.type === 'photo' ? <div key={field.key} className="manage-wide"><ProfilePhoto name={field.key} defaultValue={initial[field.key] ? String(initial[field.key]) : null} onBusyChange={setPhotoBusy} disabled={busy}/></div> : field.type === 'checkbox' ? <label key={field.key} className={`form-switch${field.wide ? ' manage-wide' : ''}`} data-field={field.key}><input name={field.key} type="checkbox" defaultChecked={Boolean(initial[field.key])} disabled={busy} /><span className="form-switch-copy"><strong>{field.label}</strong>{field.hint && <small>{field.hint}</small>}</span></label> : <label key={field.key} className={field.type === 'textarea' || field.wide ? 'manage-wide' : ''} data-field={field.key}>
      <span id={`${formId}-${field.key}`}>{field.label}{field.required && <span className="field-required"> *</span>}</span>
      {field.options ? <AppSelect aria-labelledby={`${formId}-${field.key}`} name={field.key} required={field.required} defaultValue={String(initial[field.key] ?? '')} disabled={busy}>
        <option value="">{field.required ? 'Selecciona…' : 'Sin asignar'}</option>
        {initial[field.key] != null && initial[field.key] !== '' && !field.options.some(option => String(option.value) === String(initial[field.key])) && <option value={String(initial[field.key])}>Asignación actual · {initial[field.key]}</option>}
        {field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </AppSelect> : field.type === 'textarea' ? <textarea aria-labelledby={`${formId}-${field.key}`} name={field.key} defaultValue={String(initial[field.key] ?? '')} maxLength={field.max} disabled={busy} />
        : field.type === 'checkbox' ? <input name={field.key} type="checkbox" defaultChecked={Boolean(initial[field.key])} disabled={busy} />
          : <input name={field.key} type={field.type || 'text'} data-rule={fieldRules[field.key]} {...(fieldRules[field.key] === 'phone' ? { inputMode: 'numeric' as const } : fieldRules[field.key] === 'birthdate' ? { min: oldestBirthDate(), max: colombiaToday() } : {})} autoComplete={field.type === 'password' ? 'new-password' : fieldRules[field.key] === 'phone' ? 'tel-national' : undefined} minLength={field.type === 'password' ? 10 : undefined} required={field.required} maxLength={field.max} step={field.step} placeholder={field.type === 'date' || field.type === 'time' ? undefined : field.placeholder || `Ingresa ${field.label.toLowerCase()}`} defaultValue={String(initial[field.key] ?? '')} disabled={busy} />}
    </label>
      if (!visible.some(field => field.section)) return visible.map(renderField)
      // Section cards: fields keep their order inside the section where they first appear.
      const sections: { title: string; fields: Field[] }[] = []
      for (const field of visible) { const title = field.section || ''; const found = sections.find(item => item.title === title); if (found) found.fields.push(field); else sections.push({ title, fields: [field] }) }
      return sections.map(section => <section key={section.title} className="form-card manage-wide" aria-label={section.title || undefined}>{section.title && <h4 className="form-card-title">{section.title}</h4>}<div className="form-card-fields">{section.fields.map(renderField)}</div></section>)
    })()}
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
  const [truncated, setTruncated] = useState(0)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('todos')
  // Disciples and disciple leaders (discipuladores) are listed separately; both open the same disciple record.
  const [memberKind, setMemberKind] = useState<'discipulos' | 'discipuladores'>(() => window.location.hash === '#gestion/members/discipuladores' ? 'discipuladores' : 'discipulos')
  const [activityView,setActivityView]=useState<'list'|'calendar'>('list')
  const [importing,setImporting]=useState(false)
  const [exporting, setExporting] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const listRequest = useRef(0)
  const [activityType, setActivityType] = useState('evento')
  const [stoppingRepeat, setStoppingRepeat] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const canServices = Boolean(user.registration?.canAssignServices)
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
  const memberOptions = (resource === 'members' ? items : members).map(row => ({ value: Number(row.id_miembro), label: `${memberCode(row.codigo_miembro) ? `${memberCode(row.codigo_miembro)} · ` : ''}${row.nombres} ${row.apellidos || ''}`.trim() }))
  if (user.memberId && !memberOptions.some(option => option.value === user.memberId)) memberOptions.push({ value: user.memberId, label: 'Mi ficha de discípulo' })
  // A Grupo de Comunión is led by a discipulador: only they appear in the group form.
  const leaderOptions = members.filter(row => Number(row.es_discipulador)).map(row => ({ value: Number(row.id_miembro), label: `${memberCode(row.codigo_miembro) ? `${memberCode(row.codigo_miembro)} · ` : ''}${row.nombres} ${row.apellidos || ''}`.trim() }))
  async function load(silent = false) {
    const request = ++listRequest.current
    if (!silent) setLoading(true)
    try {
      if (resource === 'members' && !has(user, 'miembros.ver')) { setItems([]); return }
      const result = await api<{ items: Row[]; truncated?: boolean; limit?: number }>(`${resource}${resource === 'members' ? `?q=${encodeURIComponent(search)}` : resource === 'activities' ? '?view=agenda' : ''}`)
      if (request !== listRequest.current) return
      setItems(result.items); setTruncated(result.truncated ? result.limit || result.items.length : 0)
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
      { key: 'celular', label: 'Celular', type: 'tel', required: true, max: 20, placeholder: '10 dígitos, ej. 3001234567' }, { key: 'correo', label: 'Correo', type: 'email', max: 120, placeholder: 'nombre@gmail.com' },
      { key: 'fecha_nacimiento', label: 'Fecha de nacimiento / cumpleaños', type: 'date', required: true },
      { key: 'id_grupo', label: 'Grupo de Comunión Familiar (opcional)', options: catalogOptions(catalogs.registrationGroups || catalogs.grupos, 'id_grupo') },
      { key: 'id_libro', label: 'Libro de adiestramiento', required: !edit?.id_rol_eclesiastico && Boolean(catalogs.libros?.length), render: ({ initial, disabled, labelId, onBusy }) => <TrainingBookPicker books={catalogs.libros || []} initialId={initial.id_libro} disabled={disabled} required={!edit?.id_rol_eclesiastico && Boolean(catalogs.libros?.length)} canCreate={canCreateTrainingBooks(user)} onCreated={reloadCatalogs} onBusy={onBusy} labelledBy={labelId}/> },
    ]
    if (canServices && edit?.id_miembro) formFields.push({ key: 'funcion_iglesia', label: 'Función o servicio en la iglesia', max: 150 }, { key: 'id_cobertura_pastoral', label: 'Cobertura pastoral', options: memberOptions.filter(option => option.value !== edit?.id_miembro) })
    // A discipulador can be registered without an access account (accounts are created in Usuarios y roles).
    if (canServices && (!edit?.id_miembro || !Number(edit.tiene_cuenta) && (!edit.id_rol_eclesiastico || Number(edit.cargo_discipulador)))) formFields.push({ key: 'cargo_discipulador', label: 'Es discipulador (podrá tener Grupos de Comunión a cargo; no necesita cuenta de acceso)', type: 'checkbox' })
    if (canServices && has(user, 'ministerios.gestionar') && !edit?.id_miembro) formFields.push({ key: 'id_ministerio', label: 'Servicio en ministerio', options: catalogOptions(catalogs.ministerios, 'id_ministerio') })
    if (has(user, 'miembros.sensibles')) formFields.push(
      { key: 'grupo_sanguineo_rh', label: 'Grupo sanguíneo / RH', options: options(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']) },
      { key: 'eps', label: 'EPS', max: 100 }, { key: 'contacto_emergencia_nombre', label: 'Contacto de emergencia', max: 150 },
      { key: 'contacto_emergencia_celular', label: 'Celular de emergencia', type: 'tel', max: 20, placeholder: '10 dígitos' },
    )
  } else if (resource === 'groups') formFields = [
    // codigo_grupo (GR-01, GR-02...) is assigned by the server and kept internal: it is not shown.
    { key: 'nombre', label: 'Nombre', required: true, max: 150 },
    { key: 'id_discipulador', label: leaderOptions.length ? 'Discipulador' : 'Discipulador (registra primero un discipulador en Discípulos)', options: user.permissions['grupos.editar'] === 'grupo' ? memberOptions.filter(option => option.value === user.memberId) : leaderOptions },
    { key: 'estado_grupo', label: 'Estado del grupo', required: true, options: options(['activo', 'inactivo']) },
    { key: 'direccion', label: 'Dirección (opcional si marcas el punto en el mapa)', max: 200, placeholder: 'Ej.: Calle 10 # 20-30, barrio La Esperanza' },
    { key: 'latitud', label: 'Ubicación en el mapa', type: 'number', render: ({ initial, disabled, labelId }) => <GroupLocationField initialLat={initial.latitud} initialLng={initial.longitud} color={groupColor(initial.nombre)} disabled={disabled} labelledBy={labelId}/> },
    { key: 'longitud', label: '', type: 'number', virtual: true },
  ]
  else {
    formFields = [
      { key: 'titulo', label: 'Nombre del evento', required: true, max: 150, wide: true, section: 'Información del evento', placeholder: activityType === 'reunion_grupo' ? 'Ej.: Reunión del grupo' : 'Ej.: Culto dominical, Vigilia, Retiro' },
      ...(activityType === 'reunion_grupo' ? [{ key: 'fecha', label: 'Fecha', type: 'date', required: true, section: 'Fecha y horario' }, { key: 'hora', label: 'Hora (Colombia)', type: 'time', required: true, section: 'Fecha y horario' }] : [
        { key: 'fecha', label: '', section: 'Fecha y horario', render: ({ initial, disabled, labelId }: { initial: Row; disabled: boolean; labelId: string }) => <EventRecurrence initial={initial} disabled={disabled} labelledBy={labelId}/> },
        { key: 'hora', label: '', virtual: true }, { key: 'recurrence', label: '', virtual: true }, { key: 'fixed', label: '', type: 'number', virtual: true }, { key: 'edit_scope', label: '', virtual: true },
      ]),
      { key: 'lugar', label: 'Lugar', required: true, max: 200, section: 'Información del evento', placeholder: 'Ej.: Templo principal' },
      { key: 'estado_actividad', label: 'Estado', required: true, section: 'Información del evento', options: options(['programada', 'cancelada']) },
      { key: 'imagen', label: '', section: 'Imagen del evento', render: ({ initial, disabled, labelId, onBusy }) => <EventImageField initial={String(initial.imagen || '')} disabled={disabled} labelledBy={labelId} onBusy={onBusy}/> }, { key: 'descripcion', label: 'Descripción', type: 'textarea', max: 10000, section: 'Información del evento' },
    ]
    if (activityType === 'reunion_grupo') formFields.push({ key: 'id_grupo', label: 'Grupo', required: true, section: 'Información del evento', options: catalogOptions(catalogs.grupos, 'id_grupo') })
    else if (has(user, 'eventos.publicar')) formFields.push({ key: 'publicado', label: 'Visible en la web pública', type: 'checkbox', wide: true, section: 'Publicación e inscripción', hint: 'Aparece en la sección de eventos de la página de la iglesia.' })
    if (activityType === 'evento') formFields.push({ key: 'requiere_inscripcion', label: 'Requiere inscripción', type: 'checkbox', wide: true, section: 'Publicación e inscripción', hint: 'Muestra un botón para inscribirse con el enlace que indiques.' }, { key: 'url_inscripcion', label: 'Enlace de inscripción', type: 'url', max: 500, wide: true, section: 'Publicación e inscripción', placeholder: 'https://…' })
  }
  if (resource === 'groups' && !canServices) formFields = formFields.filter(field => field.key !== 'id_discipulador')
  if (resource === 'groups' && !edit?.id_grupo) formFields = formFields.filter(field => !['id_grupo_origen', 'dia_reunion', 'hora_reunion'].includes(field.key))
  async function save(values: Row) {
    const id = edit?.[ids[resource]]
    const { barrios_seleccion, ...recordValues } = values
    const selection = barrios_seleccion ? JSON.parse(String(barrios_seleccion)) : null
    if (selection?.removedNames?.length && !window.confirm(`¿Quitar estos barrios del grupo: ${selection.removedNames.join(', ')}?`)) throw new Error('Guardado cancelado. Se conservan tus cambios en el formulario.')
    // A group needs its point on the map or a written address (one of the two).
    if (resource === 'groups' && recordValues.latitud == null && !String(recordValues.direccion || '').trim()) throw new Error('Marca la ubicación del grupo en el mapa o escribe su dirección.')
    const groupValues = { ...recordValues, ...(selection ? { barrios: { ...selection, confirmRemoval: Boolean(selection.removedNames?.length) } } : {}) }
    const result = await api<{ id?: number; accountCreated?: boolean; emailDelivery?: WelcomeEmailStatus; seriesId?: number; occurrences?: number; codigo_grupo?: string }>(id ? `${resource}/${id}` : resource, resource === 'groups' ? groupValues : resource === 'activities' ? { ...values, tipo_actividad: activityType, ...(Object.hasOwn(values, 'recurrence') ? { recurrence: values.recurrence ? JSON.parse(String(values.recurrence)) : null } : {}) } : resource === 'members' && !id ? { ...values, tipo_registro: 'discipulo' } : values, id ? 'PATCH' : 'POST')
    if (result.seriesId) { setEdit(null); notify(id ? 'Programación semanal guardada. Se conservan las asistencias de cada fecha.' : 'Programación semanal creada. Las próximas fechas se prepararán automáticamente.'); await load(); return }
    if (resource === 'groups') window.dispatchEvent(new Event('calvario-coverage-updated'))
    if (resource === 'groups' && !id && result.id) {
      window.location.hash = `#gestion/groups/ficha/${result.id}`
      setEdit(null); notify('Grupo de Comunión creado. Ya puedes agregar sus discípulos.'); await load(); await reloadCatalogs(); return
    }
    setEdit(null); notify(result.accountCreated ? `Administrativo y cuenta de acceso creados. Ya puede iniciar sesión con sus credenciales. ${welcomeEmailMessage(result.emailDelivery)}` : resource === 'members' && !has(user, 'miembros.ver') ? values.id_grupo ? 'Discípulo registrado y asignado al Grupo de Comunión Familiar.' : 'Discípulo registrado. El grupo puede asignarse después.' : 'Cambios guardados.'); await load(); await reloadCatalogs()
  }
  async function archive(row: Row) {
    if (resource === 'groups' && !window.confirm(`¿Eliminar el grupo «${row.nombre}»? Sus discípulos quedarán sin grupo. Su historial de grupos y las asistencias registradas se conservan.`)) return
    try {
      const result = await api<{ released?: number }>(`${resource}/${row[ids[resource]]}`, {}, 'DELETE'); setDetail(null)
      notify(resource === 'groups' ? `Grupo eliminado.${result.released ? ` ${result.released === 1 ? '1 discípulo quedó' : `${result.released} discípulos quedaron`} sin grupo.` : ''} El historial se conserva.` : 'Registro archivado. Se conserva su historial.'); await load(); await reloadCatalogs()
    } catch (error) { notify(errorMessage(error)) }
  }
  const createLabels = { members: 'Registrar discípulo', groups: 'Nuevo grupo', activities: 'Nuevo evento' }
  const groupId = window.location.hash.split('/')[2] === 'grupo' ? Number(window.location.hash.split('/')[3]) : null
  const createOnlyList = resource === 'members' && !has(user, 'miembros.ver')
  const isLeader = (row: Row) => Boolean(Number(row.es_discipulador))
  const kindCounts = { discipulos: items.filter(row => !isLeader(row)).length, discipuladores: items.filter(isLeader).length }
  const scopedItems = resource === 'members' && groupId ? items.filter(item => Number(item.id_grupo) === groupId) : resource === 'members' && !createOnlyList ? items.filter(row => isLeader(row) === (memberKind === 'discipuladores')) : items
  const visibleItems = scopedItems.filter(row => {
    const matches = searchable(`${row.nombres || ''} ${row.apellidos || ''} ${row.numero_identificacion || ''} ${memberCode(row.codigo_miembro) || ''} ${row.nombre || ''} ${row.titulo || ''}`).includes(searchable(search))
    if (!matches) return false
    if (resource === 'members') return filter === 'todos' || (filter === 'sin_libro' ? !row.id_libro : row.estado_miembro === filter)
    return true
  })
  const openEdit = (row: Row) => { setActivityType(String(row.tipo_actividad || 'evento')); setEdit({ ...row, edit_scope: 'single' }); setDetail(null) }
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
    <div className="manage-section-heading"><div><h2 ref={titleRef} tabIndex={-1} className={edit || detail ? undefined : 'sr-only'}>{edit ? edit[ids[resource]] ? 'Editar registro' : createLabels[resource] : detail ? 'Detalle' : titles[resource]}</h2>{!edit && !detail && <p className="section-caption">{resource === 'members' ? 'Cada persona, parte de nuestra familia.' : resource === 'groups' ? 'La fe se vive en comunidad.' : 'Nos encontramos para crecer juntos.'}</p>}</div>
    {!edit && !detail && (resource !== 'groups' || canServices) && (has(user, resource === 'members' ? registrationPermission : write[resource]) || resource === 'activities' && has(user, 'grupos.editar')) && <div className="record-heading-actions">{resource==='members'&&<button type="button" className="secondary" onClick={()=>setImporting(true)}>Importar desde Excel</button>}<button className="record-create" onClick={() => { setActivityType(has(user, 'eventos.editar') ? 'evento' : 'reunion_grupo'); setEdit(resource === 'groups' ? { estado_grupo: 'activo', id_discipulador: user.permissions['grupos.editar'] === 'grupo' ? user.memberId : null } : resource === 'activities' ? { estado_actividad: 'programada' } : {}) }}><AdminIcon name="plus"/>{createLabels[resource]}</button></div>}
    {detail && <button className="secondary" onClick={() => setDetail(null)}><AdminIcon name="back"/>Volver</button>}
    </div>
    {!edit&&!detail&&resource==='activities'&&<div className="tool-toggle activity-view-toggle" role="group" aria-label="Vista de eventos"><button type="button" aria-pressed={activityView==='list'} onClick={()=>setActivityView('list')}>Lista</button><button type="button" aria-pressed={activityView==='calendar'} onClick={()=>setActivityView('calendar')}>Calendario</button></div>}
    {!edit&&!detail&&resource==='activities'&&activityView==='calendar'&&<Suspense fallback={<p>Cargando calendario…</p>}><EventCalendar onSelect={row=>setDetail(row)}/></Suspense>}
    {!edit && !detail && (resource!=='activities'||activityView==='list') && <>
      {groupId && <p className="group-filter">Mostrando los discípulos de {String(catalogs.grupos.find(group => Number(group.id_grupo) === groupId)?.nombre || 'este grupo')}. <a href={`#gestion/groups/ficha/${groupId}`}>Volver al grupo</a> · <a href="#gestion/members">Ver todos los discípulos</a></p>}
      {resource === 'members' && !createOnly && !groupId && <div className="tool-toggle member-kind-toggle" role="group" aria-label="Elegir listado">{([['discipulos', 'Discípulos'], ['discipuladores', 'Discipuladores']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={memberKind === value} onClick={() => { setMemberKind(value); setFilter('todos'); window.history.replaceState(null, '', value === 'discipuladores' ? '#gestion/members/discipuladores' : '#gestion/members') }}>{label} <span>({kindCounts[value]})</span></button>)}</div>}
      {!createOnly && <form className="record-search" onSubmit={event => { event.preventDefault() }}><AdminIcon name="search"/><label className="sr-only" htmlFor={`search-${resource}`}>Buscar {resource === 'members' ? 'por nombre, identificación o ID' : titles[resource].toLowerCase()}</label><input id={`search-${resource}`} value={search} type="search" placeholder={resource === 'members' ? 'Buscar por nombre o identificación' : resource === 'groups' ? 'Buscar grupo' : 'Buscar evento o culto'} maxLength={100} onChange={event => setSearch(event.target.value)} /></form>}
      {resource === 'members' && !createOnly && <><div className="record-filters" role="group" aria-label="Filtrar discípulos">{[['todos', 'Todos'], ['activo', 'Activos'], ['inactivo', 'Inactivos'], ['retirado', 'Retirados'], ['sin_libro', 'Sin libro']].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label} <span>({value === 'todos' ? scopedItems.length : scopedItems.filter(item => value === 'sin_libro' ? !item.id_libro : item.estado_miembro === value).length})</span></button>)}</div>{has(user, 'reportes.discipulos') && <button type="button" className="secondary" disabled={exporting} onClick={() => {
        const query = new URLSearchParams({ format: 'xlsx', ...(search ? { q: search } : {}), ...(['activo', 'inactivo', 'retirado'].includes(filter) ? { estado: filter } : {}), ...(filter === 'sin_libro' ? { sin_libro: '1' } : {}), ...(groupId ? { id_grupo: String(groupId) } : {}) })
        setExporting(true); void downloadReport(`reports/discipulos?${query}`, 'discipulos.xlsx').then(() => notify('Excel de discípulos descargado.')).catch(cause => notify(errorMessage(cause))).finally(() => setExporting(false))
      }}>{exporting ? 'Preparando Excel…' : 'Descargar discípulos en Excel'}</button>}</>}
      {resource === 'activities' && <p className="section-caption">Cada evento fijo muestra solo su próxima fecha. Los encuentros pasados se conservan en Asistencia y en el calendario.</p>}
    </>}
    {edit && <div className="manage-editor record-editor" ref={editorRef}>
      {resource === 'activities' && edit.id_serie && <p className="event-repeat-note">Evento fijo. Los cambios de programación se aplican a las próximas fechas y conservan el historial de asistencia.</p>}
      <DataForm key={`${edit[ids[resource]] || 'new'}-${activityType}`} fields={formFields} initial={edit} onSave={save} onCancel={() => { setEdit(null); if (resource === 'groups' && window.location.hash === '#gestion/groups/nuevo') window.location.hash = '#gestion/groups' }} memberWizard={resource === 'members'} groupNeighborhoods={resource === 'groups' && Boolean(canManageCoverage(user))} availableBarrios={catalogs.barrios} label={resource === 'members' ? 'Guardar discípulo' : resource === 'groups' ? 'Guardar grupo' : 'Guardar'} />
    </div>}
    {resource === 'members' && truncated > 0 && !edit && !detail && !loading && <p className="training-hint" role="status">Se muestran los primeros {truncated} discípulos. Usa la búsqueda para encontrar a los demás.</p>}
    {!edit && !detail && (resource!=='activities'||activityView==='list') && (loading ? <div className="app-empty" role="status"><span className="auth-spinner"/>Cargando tu comunidad…</div> : resource === 'members' && groupId && !scopedItems.length && !createOnly ? <div className="app-empty"><span className="empty-icon"><AdminIcon name="groups"/></span><h3>Este grupo todavía no tiene discípulos</h3><p>Puedes agregarlos desde la ficha del grupo con “Agregar discípulos”.</p><a className="app-action" href={`#gestion/groups/ficha/${groupId}`}>Ir al grupo</a></div> : resource === 'members' && !groupId && !createOnly && memberKind === 'discipuladores' && !scopedItems.length ? <div className="app-empty"><span className="empty-icon"><AdminIcon name="groups"/></span><h3>Aún no hay discipuladores</h3><p>Un discípulo aparece aquí cuando tiene un Grupo de Comunión a cargo o el cargo pastoral de Discipulador.</p></div> : !visibleItems.length ? <div className="app-empty"><span className="empty-icon"><AdminIcon name={resource}/></span><h3>{createOnly ? 'Registra un discípulo' : items.length ? 'No encontramos coincidencias' : resource === 'members' ? 'Aquí comienza tu comunidad' : resource === 'groups' ? 'Un lugar para compartir la fe' : 'Preparemos el próximo encuentro'}</h3><p>{createOnly ? 'Crea su ficha y selecciona el Grupo de Comunión Familiar al que pertenece.' : items.length ? 'Prueba otra búsqueda o cambia el filtro.' : 'Los registros que crees aparecerán aquí.'}</p></div> : <div className="manage-records app-record-list">{visibleItems.map(row => {
      const name = String(row.nombres ? `${row.nombres} ${row.apellidos || ''}` : row.nombre || row.titulo)
      return <article key={row[ids[resource]]}>
      <button className="record-open" aria-label={`Ver ficha de ${name}`} onClick={() => { setDetail(row); setEdit(null) }}>
        {resource === 'members' ? <span className="member-avatar" aria-hidden="true" data-book={row.libro_color ? '' : undefined} style={row.libro_color ? { background: `${row.libro_color}26`, color: String(row.libro_color), boxShadow: `inset 0 0 0 2px ${row.libro_color}` } : undefined}>{`${String(row.nombres || '').slice(0, 1)}${String(row.apellidos || '').slice(0, 1)}`}</span> : resource === 'groups' ? <span className="group-avatar"><AdminIcon name="members"/></span> : <span className="event-cover">{row.imagen ? <img src={String(row.imagen)} alt="" loading="lazy"/> : <AdminIcon name="activities"/>}<span className="event-date"><small>{new Date(`${row.fecha}T12:00:00-05:00`).toLocaleDateString('es-CO', { month: 'short', timeZone: 'America/Bogota' }).replace('.', '')}</small><b>{String(row.fecha).slice(8, 10)}</b></span></span>}
        <span className="record-copy">{resource === 'members' && memberCode(row.codigo_miembro) && <span className="member-code">ID {memberCode(row.codigo_miembro)}</span>}<strong>{name}</strong>{resource === 'members' ? <>{isLeader(row) && <span className="member-leader">Discipulador{row.grupos_a_cargo ? ` · ${row.grupos_a_cargo}` : ' · Sin grupo a cargo'}</span>}<span>{row.tipo_identificacion} {row.numero_identificacion}</span><span className="member-book"><span className="member-book-dot" style={{ background: String(row.libro_color || '#c9ced6') }} aria-hidden="true"/>Libro: {row.libro_actual || 'Sin asignar'}</span><span className="record-state" data-state={row.estado_miembro}>{row.estado_miembro}</span></> : resource === 'groups' ? <><span>{row.miembros === 1 || row.miembros === '1' ? '1 discípulo' : `${row.miembros} discípulos`}</span><span>Discipulador: {row.discipulador_nombre || 'Sin asignar'}</span><span className="group-attendance" data-level={row.asistencia_porcentaje == null ? 'none' : Number(row.asistencia_porcentaje) >= 75 ? 'high' : Number(row.asistencia_porcentaje) >= 50 ? 'mid' : 'low'}>{row.asistencia_porcentaje == null ? 'Asistencia: sin registros' : `Asistencia ${Number(row.asistencia_porcentaje)}%`}</span></> : <><span>{row.fecha} · {String(row.hora).slice(0, 5)}</span>{row.id_serie && <span>{weeklySchedule(Number(row.dia_semana), String(row.repeticion_hora || row.hora), Boolean(row.repeticion_activa))}</span>}<span>{row.lugar}</span>{(row.estado_actividad === 'cancelada' || row.tipo_actividad === 'reunion_grupo') && <span className="event-type" data-state={row.estado_actividad}>{row.estado_actividad === 'cancelada' ? 'Cancelada' : 'Reunión de grupo'}</span>}</>}</span>
        <AdminIcon name="chevron"/>
      </button>
      {resource === 'groups' && row.latitud != null && row.longitud != null && <a className="app-action secondary record-map-link" href={`#gestion/mapa/grupo/${row.id_grupo}`}>Ver en el mapa</a>}
      {(canEdit(row) || has(user, remove[resource])) && <details className="record-menu"><summary aria-label={`Acciones de ${name}`}>•••</summary><div>{canEdit(row) && <button className="secondary" onClick={() => openEdit(row)}>Editar</button>}{has(user, remove[resource]) && <button className="secondary" onClick={() => void (resource === 'activities' && row.id_serie ? stopRepetition(row) : archive(row))}>{resource === 'activities' && row.id_serie ? 'Eliminar fijo' : resource === 'groups' ? 'Eliminar' : 'Archivar'}</button>}</div></details>}
    </article>})}</div>)}
    {detail && resource === 'activities' && <aside className="manage-editor activity-detail">{detail.imagen && <img className="activity-detail-image" src={String(detail.imagen)} alt=""/>}{detail.tipo_actividad === 'reunion_grupo' && <span className="event-type">Reunión de grupo</span>}<h3>{detail.titulo}</h3><p>{detail.fecha} · {String(detail.hora).slice(0, 5)} · {detail.lugar}</p>{detail.id_serie && <p className="event-repeat-note">{weeklySchedule(Number(detail.dia_semana), String(detail.repeticion_hora || detail.hora), Boolean(detail.repeticion_activa))}{detail.repeticion_fin ? ` · Hasta ${detail.repeticion_fin}` : ''}</p>}<p>{detail.descripcion || 'Sin descripción adicional.'}</p><p>Estado: {detail.estado_actividad}</p><div className="manage-actions">{canEdit(detail) && <button onClick={() => openEdit(detail)}>Editar actividad</button>}{detail.id_serie && has(user, 'eventos.eliminar') && <button className="secondary" disabled={stoppingRepeat} onClick={() => void stopRepetition(detail)}>{stoppingRepeat ? 'Eliminando…' : 'Eliminar evento fijo'}</button>}{(has(user, 'asistencia.registrar') || has(user, 'asistencia.ver')) && <a className="app-action secondary" href={`#gestion/falls/registro/actividad/${detail.id_actividad}`}>Ver asistencia</a>}</div></aside>}
    {detail && resource === 'members' && <MemberDetail key={detail.id_miembro} row={detail} user={user} catalogs={catalogs} reloadCatalogs={reloadCatalogs} notify={notify} onSaved={load} onClose={() => setDetail(null)} />}
    {detail && resource === 'groups' && <GroupDetail key={detail.id_grupo} row={detail} user={user} onClose={() => setDetail(null)} onEdit={canEdit(detail) ? () => openEdit(detail) : undefined} onDelete={has(user, 'grupos.eliminar') ? () => void archive(detail) : undefined} members={has(user, 'miembros.ver') ? members : null} groupNames={new Map(items.map(item => [Number(item.id_grupo), String(item.nombre)]))} notify={notify} onMembersChanged={async () => { await load(true); await reloadCatalogs() }} />}
  </section>
}

function MemberDetail({ row, user, catalogs, reloadCatalogs, notify, onSaved, onClose }: { row: Row; user: AuthUser; catalogs: Catalogs; reloadCatalogs: () => Promise<void>; notify: Message; onSaved: () => Promise<void>; onClose: () => void }) {
  const [history, setHistory] = useState<Row[]>([])
  const [coverageOptions, setCoverageOptions] = useState<Option[]>([])
  const [state, setState] = useState(String(row.estado_miembro))
  const [exporting, setExporting] = useState(false)
  // A disciple leader's record is split: their own information, and the groups they lead.
  const leader = Boolean(Number(row.es_discipulador))
  const [section, setSection] = useState<'info' | 'grupos'>('info')
  async function loadDetails() {
    try {
      setHistory((await api<{ items: Row[] }>(`members/${row.id_miembro}/history`)).items)
      if (has(user, 'grupos.editar') && user.permissions['grupos.editar'] === 'todos') {
        const people = (await api<{ items: Row[] }>('members')).items
        setCoverageOptions(people.filter(person => person.id_miembro !== row.id_miembro).map(person => ({ value: Number(person.id_miembro), label: `${person.nombres} ${person.apellidos || ''}`.trim() })))
      }
    } catch (error) { notify(errorMessage(error)) }
  }
  useEffect(() => { void loadDetails() }, [row.id_miembro])
  const labels: Record<string, string> = { nombres: 'Nombres', apellidos: 'Apellidos', tipo_identificacion: 'Tipo de identificación', numero_identificacion: 'Identificación', celular: 'Celular', correo: 'Correo', fecha_nacimiento: 'Nacimiento / cumpleaños', funcion_iglesia: 'Función', grupo_sanguineo_rh: 'Grupo sanguíneo / RH', eps: 'EPS', contacto_emergencia_nombre: 'Contacto de emergencia', contacto_emergencia_celular: 'Celular de emergencia', id_grupo: 'ID de grupo', id_rol_eclesiastico: 'ID de rol eclesiástico', id_cobertura_pastoral: 'ID de cobertura pastoral', codigo_qr: 'Identificador QR', fecha_creacion: 'Creación', fecha_actualizacion: 'Actualización' }
  // The record carries the color of the disciple's training book.
  return <aside className="manage-editor member-detail" style={row.libro_color ? { borderTop: `5px solid ${row.libro_color}` } : undefined}><div className="manage-section-heading"><h3>{row.libro_color && <span className="member-book-dot member-book-dot-large" style={{ background: String(row.libro_color) }} title={`Libro: ${row.libro_actual}`} aria-hidden="true"/>}Ficha de {row.nombres}</h3><button className="secondary" onClick={onClose}>Cerrar ficha</button></div>
    {Boolean(Number(row.es_discipulador)) && <p className="member-leader-note"><strong>Discipulador</strong>{row.grupos_a_cargo ? ` de: ${row.grupos_a_cargo}` : ' (sin grupo a cargo por ahora)'}</p>}
    {leader && <div className="tool-toggle leader-sections" role="tablist" aria-label="Secciones de la ficha">{([['info', 'Información'], ['grupos', `Grupos a cargo (${row.grupos_a_cargo ? String(row.grupos_a_cargo).split(', ').length : 0})`]] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={section === value} aria-pressed={section === value} onClick={() => setSection(value)}>{label}</button>)}</div>}
    {leader && section === 'grupos' ? <LeaderGroups leader={row} user={user} notify={notify} onChanged={onSaved}/> : <>
    <MemberBooks key={`${row.id_miembro}-${row.id_libro || ''}`} row={row} books={catalogs.libros || []} canEdit={canCreateTrainingBooks(user)} onCreated={reloadCatalogs} onSaved={onSaved} notify={notify}/>
    {has(user, 'reportes.discipulos') && <button type="button" className="secondary" disabled={exporting} onClick={() => { setExporting(true); void downloadReport(`members/${row.id_miembro}/excel`, `discipulo-${memberCode(row.codigo_miembro) || row.id_miembro}.xlsx`).then(() => notify('Ficha completa descargada en Excel.')).catch(cause => notify(errorMessage(cause))).finally(() => setExporting(false)) }}>{exporting ? 'Preparando Excel…' : 'Descargar ficha en Excel'}</button>}
    <dl className="manage-details">{memberCode(row.codigo_miembro) && <div><dt>ID</dt><dd>{memberCode(row.codigo_miembro)}</dd></div>}{Object.entries(labels).filter(([key]) => Object.hasOwn(row, key)).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{String(row[key] || 'Sin registrar')}</dd></div>)}</dl>
    {has(user,'asistencia.ver') && <MemberAttendance key={row.id_miembro} memberId={Number(row.id_miembro)}/>}
    {has(user, 'miembros.estado') && <form className="manage-actions" onSubmit={event => { event.preventDefault(); void api(`members/${row.id_miembro}/state`, { estado_miembro: state }).then(() => { notify('Estado actualizado.'); void onSaved() }).catch(error => notify(errorMessage(error))) }}><label>Estado del discípulo <AppSelect value={state} onChange={event => setState(event.target.value)}>{['activo', 'inactivo', 'retirado'].map(value => <option key={value}>{value}</option>)}</AppSelect></label><button>Actualizar estado</button></form>}
    {has(user, 'grupos.editar') && !has(user, 'miembros.editar') && <><h4>Grupo y cobertura</h4><DataForm fields={[
      { key: 'id_grupo', label: 'Grupo', options: catalogOptions(catalogs.grupos, 'id_grupo') },
      ...(user.permissions['grupos.editar'] === 'todos' ? [{ key: 'id_cobertura_pastoral', label: 'Cobertura pastoral', options: coverageOptions }] : []),
    ]} initial={row} onSave={async values => { await api(`members/${row.id_miembro}/relations`, values); notify('Relaciones actualizadas.'); await onSaved(); await loadDetails() }} /></>}
    <MemberGroupHistory items={history}/>
    <DiscipleConsent memberId={Number(row.id_miembro)} notify={notify}/>
    </>}
  </aside>
}

// Only the times a group was assigned, with who assigned it (removals and coverage changes are not listed).
const historyDate = (value: string | number | null) => { const date = new Date(String(value || '')); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long', timeStyle: 'short' }).format(date) }
function MemberGroupHistory({ items }: { items: Row[] }) {
  const assignments = items.filter(item => item.concepto === 'grupo' && item.id_nuevo)
  return <section className="member-group-history" aria-labelledby="member-group-history-title"><h4 id="member-group-history-title">Historial de grupos</h4>
    {assignments.length ? <ul>{assignments.map(item => <li key={item.id_historial}><strong>{item.grupo_nuevo || 'Grupo eliminado'}{item.grupo_nuevo && Number(item.grupo_nuevo_eliminado) ? <span className="history-removed">Grupo eliminado</span> : null}</strong><span>Asignado por {item.asignado_por || 'una cuenta que ya no existe'}</span>{historyDate(item.fecha_cambio) && <time dateTime={String(item.fecha_cambio)}>{historyDate(item.fecha_cambio)}</time>}</li>)}</ul>
      : <p>Aún no tiene asignaciones de grupo registradas.</p>}
  </section>
}

function GroupDetail({ row, user, onClose, onEdit, onDelete, members, groupNames, notify, onMembersChanged }: { row: Row; user: AuthUser; onClose: () => void; onEdit?: () => void; onDelete?: () => void; members: Row[] | null; groupNames: Map<number, string>; notify: Message; onMembersChanged: () => Promise<void> }) {
  const mapQuery = row.latitud != null && row.longitud != null ? `${row.latitud},${row.longitud}` : row.direccion ? `${row.direccion}, ${row.barrio || ''}, Villavicencio, Meta` : null
  return <aside className="manage-editor group-detail"><div className="group-detail-banner" aria-hidden="true"><AdminIcon name="groups"/><span>LA FE NOS REÚNE</span></div><div className="manage-section-heading"><h3>{row.nombre}</h3><button className="secondary" onClick={onClose}>Cerrar ficha</button></div>
    <p style={{ whiteSpace: 'pre-line' }}><strong>Barrio o barrios:</strong> {row.barrio || 'Sin asignar'}</p>
    {(row.direccion || row.dia_reunion || row.hora_reunion) && <p>{[row.direccion, row.dia_reunion, String(row.hora_reunion || '').slice(0, 5)].filter(Boolean).join(' · ')}</p>}
    <p>Discípulos registrados: {row.miembros}. Discipulador: ID {row.id_discipulador || 'sin asignar'}.</p>
    {!row.id_discipulador && onEdit && <button type="button" className="secondary" onClick={onEdit}>Asignar discipulador</button>}
    {members && <GroupMembers group={row} members={members} groupNames={groupNames} canAdd={has(user, 'grupos.editar') && has(user, 'miembros.editar')} canRemove={has(user, 'grupos.editar') && has(user, 'miembros.editar') && user.permissions['miembros.editar'] === 'todos'} notify={notify} onChanged={onMembersChanged}/>}
    <div className="group-detail-actions">{has(user, 'miembros.ver') && <a className="app-action secondary" href={`#gestion/members/grupo/${row.id_grupo}`}><span className="dashboard-card-icon"><AdminIcon name="members"/></span>Ver discípulos<AdminIcon name="chevron"/></a>}{onEdit && <button type="button" className="secondary" onClick={onEdit}><span className="dashboard-card-icon"><AdminIcon name="groups"/></span>Editar grupo<AdminIcon name="chevron"/></button>}{row.latitud != null && row.longitud != null ? <a className="app-action secondary" href={`#gestion/mapa/grupo/${row.id_grupo}`}><span className="dashboard-card-icon"><AdminIcon name="mapa"/></span>Ver en el mapa<AdminIcon name="chevron"/></a> : mapQuery && <a className="app-action secondary" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noopener noreferrer"><span className="dashboard-card-icon"><AdminIcon name="home"/></span>Buscar dirección en Google Maps<AdminIcon name="chevron"/></a>}</div>
    {onDelete && <div className="group-delete"><p>Al eliminar el grupo, sus discípulos quedan sin grupo. Su historial de grupos y las asistencias se conservan.</p><button type="button" className="secondary danger" onClick={onDelete}>Eliminar grupo</button></div>}
  </aside>
}

// Green check: attended. Red X: did not attend. Grey alert: has an excuse.
function AttendanceIcon({ state }: { state: string }) {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {state === 'presente' ? <path d="m5 12.5 4.5 4.5L19 7.5"/> : state === 'ausente' ? <path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/> : state === 'justificado' ? <><path d="M12 3.5 2.8 19.5h18.4Z"/><path d="M12 9.5v4.5M12 17h.01"/></> : <><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/></>}
  </svg>
}

function Attendance({ user, notify }: { user: AuthUser; notify: Message }) {
  const [selectedActivity, setSelectedActivity] = useState<Row | null>(null)
  const [rosterVersion,setRosterVersion] = useState('')
  const [exporting,setExporting] = useState(false)
  const [activityId, setActivityId] = useState(() => window.location.hash.split('/')[3] === 'actividad' ? window.location.hash.split('/')[4] || '' : '')
  const [roster, setRoster] = useState<Row[]>([])
  const [records, setRecords] = useState<Row[]>([])
  const [marking, setMarking] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)
  async function load() {
    const request = ++requestId.current
    if (!activityId) { setRoster([]); setRecords([]); return }
    setLoading(true)
    try {
      const [people, attendance] = await Promise.all([has(user, 'asistencia.registrar') ? api<{ items: Row[]; version?:string; activity?:Row }>(`attendance/roster?activityId=${activityId}`) : Promise.resolve({ items: [],version:'',activity:undefined }), has(user, 'asistencia.ver') ? api<{ items: Row[]; activity?:Row }>(`attendance?activityId=${activityId}`) : Promise.resolve({ items: [],activity:undefined })])
      if (request !== requestId.current) return
      setRoster(people.items);setRosterVersion(people.version || ''); setRecords(attendance.items)
      setSelectedActivity(attendance.activity || people.activity || null)
    } catch (error) { if (request === requestId.current) { notify(errorMessage(error)); setRoster([]); setRecords([]) } }
    finally { if (request === requestId.current) setLoading(false) }
  }
  useEffect(() => { setMarking({}); setSearch(''); void load(); return () => { requestId.current++ } }, [activityId])
  // The chosen event stays in the address, so reloading the page reopens it (with its QR).
  useEffect(() => {
    const parts = window.location.hash.split('/')
    if (parts[1] !== 'falls') return
    const wanted = activityId ? `#gestion/falls/registro/actividad/${activityId}` : '#gestion/falls/registro'
    if (window.location.hash !== wanted) window.history.replaceState(null, '', wanted)
  }, [activityId])
  const selected = selectedActivity && String(selectedActivity.id_actividad)===activityId ? selectedActivity : null
  // QR check-ins and other devices' marks keep arriving: both lists refresh every few seconds while the page is visible.
  const refreshing = useRef(0)
  async function refresh() {
    const base = requestId.current, request = ++refreshing.current
    try {
      const [people, attendance] = await Promise.all([has(user, 'asistencia.registrar') ? api<{ items: Row[]; version?: string }>(`attendance/roster?activityId=${activityId}`) : Promise.resolve(null), has(user, 'asistencia.ver') ? api<{ items: Row[] }>(`attendance?activityId=${activityId}`) : Promise.resolve(null)])
      if (base !== requestId.current || request !== refreshing.current) return
      if (people) { setRoster(people.items); setRosterVersion(people.version || '') }
      if (attendance) setRecords(attendance.items)
    } catch { /* the next refresh retries */ }
  }
  useEffect(() => {
    if (!activityId) return
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 5000)
    const visible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', visible)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visible) }
  }, [activityId])
  const states: Record<string, string> = { presente: 'Presente', ausente: 'Ausente sin justificación', justificado: 'Justificado', visitante: 'Visitante' }
  const outstanding=roster.filter(person=>!Number(person.registrado)&&!records.some(record=>record.id_miembro===person.id_miembro))
  // Attendance can be saved for any date: past events (late records) or future ones.
  const blockedReason=!selected ? '' : selected.estado_actividad === 'cancelada' ? 'Este evento está cancelado: no se registra asistencia.' : !roster.length ? 'No hay discípulos activos en este listado. Los visitantes se registran con el código QR.' : ''
  // One tap saves the person's attendance at once; they leave the pending list and join the saved records.
  async function mark(person: Row, state: 'presente' | 'ausente' | 'justificado') {
    const id = String(person.id_miembro)
    if (marking[id]) return
    setMarking(previous => ({ ...previous, [id]: true }))
    try { await api('attendance', { id_actividad: Number(activityId), id_miembro: Number(person.id_miembro), estado_asistencia: state, metodo_registro: 'manual' }); await refresh() }
    catch (error) { notify(errorMessage(error)); await refresh() }
    finally { setMarking(previous => { const next = { ...previous }; delete next[id]; return next }) }
  }
  async function correct(row: Row, state: string) {
    if (String(row.estado_asistencia) === state) return
    try { await api(`attendance/${row.id_asistencia}`, { estado_asistencia: state }, 'PATCH'); notify('Asistencia corregida.'); await refresh() }
    catch (error) { notify(errorMessage(error)) }
  }
  // Ending the event: whoever is still pending is saved as absent without justification.
  // With nobody pending it simply confirms that everything is saved. If the list changed meanwhile
  // (a QR check-in, another device), it reloads the list and tries once more.
  async function finish() {
    if (saving) return
    if (outstanding.length && !window.confirm(`Quedan ${outstanding.length === 1 ? '1 persona sin marcar; quedará' : `${outstanding.length} personas sin marcar; quedarán`} como ausente sin justificación. ¿Finalizar el evento?`)) return
    setSaving(true)
    const save = (version: string) => api<{ created: number; absent: number }>('attendance/save', { activityId: Number(activityId), rosterVersion: version, states: {} })
    try {
      let result = { created: 0, absent: 0 }
      if (roster.length) {
        try { result = await save(rosterVersion) }
        catch (error) {
          if (!(error instanceof Error) || !error.message.includes('El listado de discípulos cambió')) throw error
          result = await save((await api<{ version?: string }>(`attendance/roster?activityId=${activityId}`)).version || '')
        }
      }
      await load()
      notify(result.absent ? `Evento finalizado. ${result.absent === 1 ? '1 persona quedó' : `${result.absent} personas quedaron`} como ausente sin justificación.` : 'Evento finalizado. Todas las asistencias quedaron guardadas.')
    } catch (error) { notify(errorMessage(error)); await load() } finally { setSaving(false) }
  }
  return <section className="attendance-page"><p className="section-caption">Consulta encuentros actuales y anteriores, guarda la asistencia o descarga el registro de un evento.</p><AttendanceActivityPicker value={activityId} selected={selected} disabled={saving||loading} onChange={activity=>{setSelectedActivity(activity);setActivityId(activity?String(activity.id_actividad):'')}}/>
    {!activityId && <div className="app-empty"><span className="empty-icon"><AdminIcon name="attendance"/></span><h3>¿En qué encuentro estamos?</h3><p>Selecciona una actividad para consultar o registrar su asistencia.</p></div>}
    {activityId && <>
      {selected && <div className="attendance-event"><span className="dashboard-card-icon"><AdminIcon name="activities"/></span><div><strong>{selected.titulo}</strong><span>{selected.fecha} · {String(selected.hora).slice(0, 5)}</span></div><span className="app-count">{selected.estado_actividad === 'cancelada' ? 'Cancelada' : 'Encuentro'}</span></div>}
      {has(user, 'asistencia.registrar') && selected && selected.estado_actividad !== 'cancelada' && <AttendanceQrPanel key={String(selected.id_actividad)} activity={selected} notify={notify}/>}
      {has(user,'reportes.asistencia') && selected && <div className="attendance-export"><p>Descargar los registros guardados de este evento y esta fecha.</p>{(['pdf','xlsx'] as const).map(format=><button type="button" className="secondary" key={format} disabled={exporting||saving||loading} onClick={()=>{setExporting(true);void downloadReport(`reports/asistencia?${new URLSearchParams({activityId,format})}`,`asistencia-${selected.fecha}-${activityId}.${format}`).catch(error=>notify(errorMessage(error))).finally(()=>setExporting(false))}}>Descargar asistencia en {format==='pdf'?'PDF':'Excel'}</button>)}</div>}
      {has(user, 'asistencia.registrar') && <>
        <h3 className="attendance-record-heading">Por confirmar <span>{outstanding.length}</span></h3>
        {outstanding.length > 6 && <form className="record-search" onSubmit={event => event.preventDefault()}><AdminIcon name="search"/><label className="sr-only" htmlFor="attendance-search">Buscar discípulo para asistencia</label><input id="attendance-search" value={search} placeholder="Buscar discípulo" type="search" onChange={event => setSearch(event.target.value)}/></form>}
        {loading ? <p role="status">Cargando asistencia…</p> : <div className="attendance-roster">{outstanding.filter(person => String(person.nombre).toLowerCase().includes(search.toLowerCase())).map(person => {
          const id = String(person.id_miembro), busy = Boolean(marking[id]) || saving || selected?.estado_actividad === 'cancelada'
          return <div key={id} className="attendance-person"><span className="member-avatar" aria-hidden="true">{String(person.nombre).split(' ').slice(0, 2).map(word => word[0]).join('')}</span><strong>{memberCode(person.codigo_miembro) && <span className="member-code">{memberCode(person.codigo_miembro)}</span>} {person.nombre}</strong>
            <span className="attendance-marks" role="group" aria-label={`Asistencia de ${person.nombre}`}>
              <button type="button" className="attendance-mark" data-state="presente" disabled={busy} aria-label={`Asistió: ${person.nombre}`} title="Asistió" onClick={() => void mark(person, 'presente')}><AttendanceIcon state="presente"/></button>
              <button type="button" className="attendance-mark" data-state="ausente" disabled={busy} aria-label={`No asistió: ${person.nombre}`} title="No asistió" onClick={() => void mark(person, 'ausente')}><AttendanceIcon state="ausente"/></button>
              <button type="button" className="attendance-mark" data-state="justificado" disabled={busy} aria-label={`Tiene excusa: ${person.nombre}`} title="Tiene excusa" onClick={() => void mark(person, 'justificado')}><AttendanceIcon state="justificado"/></button>
            </span></div>
        })}{!outstanding.length && roster.length > 0 && <p className="attendance-done">Todos los discípulos de este listado ya tienen su asistencia.</p>}</div>}
        {blockedReason && !loading && <p className="attendance-blocked" role="status">{blockedReason}</p>}
      </>}
      <h3 className="attendance-record-heading">Asistencias registradas <span>{records.length}</span></h3>
      {!records.length && <p className="attendance-empty-records">Aún no hay registros. Aparecerán aquí a medida que se marquen o se registren con el código QR.</p>}
      <div className="manage-records attendance-records">{records.map(row => <article key={row.id_asistencia}><span className="attendance-state-icon" data-state={row.estado_asistencia} aria-hidden="true"><AttendanceIcon state={String(row.estado_asistencia)}/></span><div><strong>{row.nombre || row.nombre_visitante || 'Visitante'}</strong><p>{states[String(row.estado_asistencia)] || row.estado_asistencia} · {row.origen_registro === 'autoregistro_qr' ? 'Con código QR' : row.metodo_registro === 'qr' ? 'QR' : 'Marcado por el equipo'}{row.documento_visitante ? ` · Doc. ${row.documento_visitante}` : ''}</p></div>
        {has(user, 'asistencia.corregir') && row.id_miembro && <span className="attendance-marks attendance-corrections" role="group" aria-label={`Corregir asistencia de ${row.nombre}`}>{(['presente', 'ausente', 'justificado'] as const).map(state => <button key={state} type="button" className="attendance-mark" data-state={state} aria-pressed={String(row.estado_asistencia) === state} aria-label={`${states[state]}: ${row.nombre}`} title={states[state]} onClick={() => void correct(row, state)}><AttendanceIcon state={state}/></button>)}</span>}
      </article>)}</div>
      {has(user, 'asistencia.registrar') && selected && selected.estado_actividad !== 'cancelada' && (roster.length > 0 || records.length > 0) && <div className="attendance-finish">
        <p className="attendance-save-note">{outstanding.length ? 'Al finalizar, quienes sigan por confirmar quedarán como ausentes sin justificación. Si alguien se registra después con el código QR, pasa a presente.' : 'Todas las asistencias ya están guardadas. Puedes finalizar el evento.'}</p>
        <button type="button" className="attendance-save" disabled={saving || loading} onClick={() => void finish()}>{saving ? 'Finalizando…' : 'Finalizar evento y guardar asistencia'}</button>
      </div>}
    </>}
  </section>
}

function Reports({ user, notify }: { user: AuthUser; notify: Message }) {
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [busy, setBusy] = useState(false)
  // Attendance report: by dates in general, or only the disciples of a training book or a Grupo de Comunión.
  const [bookId, setBookId] = useState(''), [groupId, setGroupId] = useState('')
  const [filterCatalogs, setFilterCatalogs] = useState<{ libros: Row[]; grupos: Row[] }>({ libros: [], grupos: [] })
  useEffect(() => {
    if (!has(user, 'reportes.asistencia')) return
    let current = true
    api<Catalogs>('catalogs').then(result => { if (current) setFilterCatalogs({ libros: (result.libros || []) as unknown as Row[], grupos: result.grupos || [] }) }).catch(() => {})
    return () => { current = false }
  }, [])
  async function download(type: string, format: string) {
    setBusy(true)
    try {
      const query = new URLSearchParams({ format, ...(from ? { from } : {}), ...(to ? { to } : {}), ...(type === 'asistencia' && bookId ? { id_libro: bookId } : {}), ...(type === 'asistencia' && groupId ? { id_grupo: groupId } : {}) })
      await downloadReport(`reports/${type}?${query}`, `${type}.${format}`)
      notify('Reporte descargado.')
    } catch (error) { notify(errorMessage(error)) } finally { setBusy(false) }
  }
  return <section className="reports-page"><p className="section-caption">La información que necesitas, lista para compartir.</p>
    <div className="manage-records report-cards">{[
      { type: 'asistencia', label: 'Reporte de asistencia', icon: 'activities', description: 'Asistencia por rango de fechas, en general o solo de un libro de adiestramiento o un Grupo de Comunión.' },
      { type: 'cumpleanos', label: 'Listado de cumpleaños', icon: 'birthday', description: 'Las fechas para celebrar a nuestra comunidad.' },
      { type: 'grupos', label: 'Grupos de Comunión', icon: 'members', description: 'Grupos registrados y las personas que los integran.' },
      { type: 'discipulos', label: 'Ficha completa de discípulos', icon: 'training', description: 'Datos de la ficha, ministerios y libro de adiestramiento actual.' },
    ].filter(report => has(user, `reportes.${report.type}`)).map(report => <article key={report.type} data-report={report.type}><span className="report-icon"><AdminIcon name={report.icon}/></span><div className="report-copy"><strong>{report.label}</strong><p>{report.description}</p>{report.type === 'asistencia' && <div className="report-dates"><label>Desde<input type="date" value={from} onChange={event => setFrom(event.target.value)}/></label><label>Hasta<input type="date" min={from} value={to} onChange={event => setTo(event.target.value)}/></label>
        {filterCatalogs.libros.length > 0 && <label>Libro de adiestramiento<AppSelect value={bookId} onChange={event => setBookId(event.target.value)}><option value="">Todos (general)</option>{filterCatalogs.libros.map(book => <option key={String(book.id_libro)} value={String(book.id_libro)}>{String(book.nombre)}</option>)}</AppSelect></label>}
        {filterCatalogs.grupos.length > 0 && <label>Grupo de Comunión<AppSelect value={groupId} onChange={event => setGroupId(event.target.value)}><option value="">Todos (general)</option>{filterCatalogs.grupos.map(group => <option key={String(group.id_grupo)} value={String(group.id_grupo)}>{String(group.nombre)}</option>)}</AppSelect></label>}
      </div>}<div className="manage-actions">{(report.type === 'discipulos' ? ['xlsx'] : ['pdf', 'xlsx']).map(format => <button key={format} className={`report-export export-${format}`} aria-label={`${report.label}: descargar ${format === 'pdf' ? 'PDF' : 'Excel'}`} disabled={busy || Boolean(from && to && from > to) && report.type === 'asistencia'} onClick={() => void download(report.type, format)}><AdminIcon name="reports"/>{format === 'pdf' ? 'PDF' : 'Excel'}</button>)}</div></div></article>)}</div>
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
    { key: 'reports', label: 'Reportes', icon: 'reports', description: 'Asistencia, cumpleaños y grupos', href: '#gestion/reports', allowed: available.has('reports') },
  ]
  const widgetIcons: Record<string, string> = { miembros: 'members', grupos: 'groups', cumpleanos: 'birthday', eventos: 'activities' }
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
  return <section className="manage-falls" aria-labelledby="falls-title">
    <h2 id="falls-title" className="sr-only">Asistencia</h2>
    <div className="falls-content"><Attendance user={user} notify={notify}/></div>
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
      {(['members', 'groups', 'activities'] as const).map(resource => tab === resource && <Records key={`${resource}-${accessKey}`} resource={resource} user={user} catalogs={catalogs} reloadCatalogs={reloadCatalogs} notify={setMessage} />)}
      {tab === 'mapa' && <Suspense fallback={<p role="status">Cargando mapa…</p>}><GroupsMap/></Suspense>}{tab === 'falls' && <Falls key={accessKey} user={user} notify={setMessage} />}{tab === 'reports' && <Reports user={user} notify={setMessage} />}
    </>}
    </div>
  </AdminFrame>
}
