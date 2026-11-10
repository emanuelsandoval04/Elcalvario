import { useCallback, useEffect, useRef, useState } from 'react'
import AppSelect from './AppSelect'
import { managementRequest } from './management-api'
import type { AuthUser } from './auth'
import './access-management.css'

type Grant = { codigo: string; alcance: string }
type Permission = { codigo: string; descripcion: string; admite_grupo: boolean }
type Role = { id_rol: number; nombre: string; editable: boolean; groupOnly: boolean; reason: string | null }
type Catalog = { roles: Role[]; permissions: Permission[]; grants: { id_rol: number; codigo_permiso: string; alcance: string }[] }
type Props = { user: AuthUser; roleId: string; onChooseRole: (id: string) => void; onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void; onSaved: (role: string) => void }
const signature = (grants: Grant[]) => JSON.stringify(grants.map(grant => [grant.codigo, grant.alcance]).sort(([a], [b]) => a.localeCompare(b)))
const toGrants = (values: Record<string, string>): Grant[] => Object.entries(values).filter(([, scope]) => scope).map(([codigo, alcance]) => ({ codigo, alcance }))
const groupNames: Record<string, string> = { gestion: 'Acceso al panel', miembros: 'Discípulos', grupos: 'Grupos de Comunión', eventos: 'Eventos y cultos', asistencia: 'Asistencia', alertas: 'Alertas', seguimiento: 'Seguimiento pastoral', reportes: 'Reportes y exportaciones', ministerios: 'Ministerios', adiestramiento: 'Adiestramiento', transmisiones: 'Transmisiones de Facebook', consentimientos: 'Autorizaciones y documentos', usuarios: 'Administración de accesos', permisos: 'Administración de accesos' }

function PermissionForm({ role, permissions, initial, onSaved, onDirtyChange, onBusyChange, onReload }: { role: Role; permissions: Permission[]; initial: Grant[]; onSaved: (grants: Grant[]) => void; onReload: () => void; onDirtyChange: Props['onDirtyChange']; onBusyChange: Props['onBusyChange'] }) {
  const [baseline, setBaseline] = useState(initial)
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(initial.map(grant => [grant.codigo, grant.alcance])))
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const dirty = signature(toGrants(values)) !== signature(baseline)
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false) }, [dirty, onDirtyChange])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const groups = new Map<string, Permission[]>()
  const query = search.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
  for (const permission of permissions) {
    const group = groupNames[permission.codigo.split('.')[0]] || 'Otras herramientas'
    if (query && !`${group} ${permission.descripcion}`.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().includes(query)) continue
    groups.set(group, [...(groups.get(group) || []), permission])
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !role.editable || !dirty) return
    const grants = toGrants(values)
    setBusy(true); onBusyChange(true); setError(''); setFeedback('')
    try {
      await managementRequest(`permissions/${role.id_rol}`, { grants, expectedGrants: baseline }, 'PUT')
      setBaseline(grants)
      setFeedback(`Permisos de ${role.nombre} guardados.`)
      onSaved(grants)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar los permisos.') }
    finally { setBusy(false); onBusyChange(false) }
  }
  return <form className="profile-permissions-form" onSubmit={save} aria-label={`Permisos del perfil ${role.nombre}`}>
    <div className="profile-summary"><strong>{role.nombre}</strong><span>{toGrants(values).length} de {permissions.length} permisos habilitados</span></div>
    <p className="profile-impact">Los cambios se aplican a todas las cuentas que tengan este perfil, incluidas sus sesiones abiertas.</p>
    {role.reason && <p className="profile-policy">{role.reason}</p>}
    <label className="profile-search">Buscar permiso<input type="search" value={search} maxLength={100} onChange={event => setSearch(event.target.value)} placeholder="Asistencia, discípulos, reportes…"/></label>
    {!groups.size && <p>No hay permisos que coincidan con la búsqueda.</p>}
    {[...groups].map(([name, items]) => <fieldset className="profile-permission-group" key={name} disabled={busy || !role.editable}>
      <legend>{name}</legend>
      {items.map(permission => <label className="profile-permission" key={permission.codigo}>
        <span>{permission.descripcion}</span>
        <AppSelect aria-label={permission.descripcion} disabled={busy || !role.editable || role.groupOnly && !permission.admite_grupo && permission.codigo !== 'adiestramiento.gestionar'} value={values[permission.codigo] || ''} onChange={event => { setValues(previous => ({ ...previous, [permission.codigo]: event.target.value })); setError(''); setFeedback('') }}>
          <option value="">Sin permiso</option>
          {(!role.groupOnly || permission.codigo === 'adiestramiento.gestionar') && <option value="todos">Todos</option>}
          {permission.admite_grupo && <option value="grupo">Grupos a cargo</option>}
        </AppSelect>
      </label>)}
    </fieldset>)}
    {error && <div className="profile-error" role="alert"><p>{error}</p><button type="button" className="admin-save admin-secondary" disabled={busy} onClick={onReload}>Recargar permisos</button></div>}
    <p className="profile-feedback" role="status" aria-live="polite">{feedback}</p>
    {role.editable && <div className="profile-save-bar"><span>{dirty ? 'Cambios sin guardar' : 'Configuración guardada'}</span><div>
      <button type="button" className="admin-save admin-secondary" disabled={busy || !dirty} onClick={() => { setValues(Object.fromEntries(baseline.map(grant => [grant.codigo, grant.alcance]))); setError(''); setFeedback('') }}>Deshacer</button>
      <button type="submit" className="admin-save" disabled={busy || !dirty}>{busy ? 'Guardando…' : 'Guardar permisos'}</button>
    </div></div>}
  </form>
}

export default function RolePermissions({ user, roleId, onChooseRole, onSaved, onDirtyChange, onBusyChange }: Props) {
  const [data, setData] = useState<Catalog | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const draft = useRef(false)
  const updateDirty = useCallback((value: boolean) => { draft.current = value; onDirtyChange(value) }, [onDirtyChange])
  const identity = JSON.stringify([user.id, user.state, user.permissions])
  useEffect(() => {
    let active = true
    setData(null); setError('')
    void managementRequest<Catalog>('permissions').then(result => { if (active) setData(result) }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'No pudimos consultar los perfiles.') })
    return () => { active = false }
  }, [identity, revision])
  const role = data?.roles.find(item => String(item.id_rol) === roleId)
  const reload = () => {
    if (busy) return
    if (draft.current && !window.confirm('Se descartarán los cambios sin guardar de este perfil. ¿Recargar los permisos?')) return
    setRevision(value => value + 1)
  }
  return <aside className="role-permissions" aria-labelledby="role-permissions-title">
    <header className="profile-editor-heading"><span className="profile-eyebrow">CONFIGURACIÓN DE ACCESOS</span><h2 id="role-permissions-title" tabIndex={-1}>Perfiles y permisos</h2><p>Configura las herramientas disponibles para cada rol del sistema.</p></header>
    {error ? <div role="alert"><p>{error}</p><button type="button" className="admin-save admin-secondary" onClick={reload}>Volver a intentar</button></div> : !data ? <p role="status">Cargando perfiles…</p> : <>
      <label className="profile-picker">Perfil a configurar<AppSelect value={roleId} disabled={busy} onChange={event => onChooseRole(event.target.value)}><option value="">Selecciona un perfil…</option>{data.roles.map(item => <option value={item.id_rol} key={item.id_rol}>{item.nombre}{!item.editable ? ' · Protegido' : ''}</option>)}</AppSelect></label>
      {role ? <PermissionForm key={`${identity}-${role.id_rol}-${revision}`} role={role} permissions={data.permissions} initial={data.grants.filter(grant => grant.id_rol === role.id_rol).map(grant => ({ codigo: grant.codigo_permiso, alcance: grant.alcance }))} onReload={reload} onDirtyChange={updateDirty} onBusyChange={value => { setBusy(value); onBusyChange(value) }} onSaved={grants => {
        setData(previous => previous ? { ...previous, grants: [...previous.grants.filter(grant => grant.id_rol !== role.id_rol), ...grants.map(grant => ({ id_rol: role.id_rol, codigo_permiso: grant.codigo, alcance: grant.alcance }))] } : previous)
        onSaved(role.nombre)
      }}/> : <div className="profile-empty"><strong>Selecciona un perfil</strong><p>Puedes elegirlo aquí o abrir «Permisos del perfil» junto al rol de cualquier cuenta.</p></div>}
    </>}
  </aside>
}
