import AppSelect from './AppSelect'
import { useCallback, useEffect, useRef, useState } from 'react'
import { hasPermission, memberCode, useAuthSession } from './auth'
import type { AuthUser } from './auth'
import './admin.css'
import { managementRequest } from './management-api'
import AdminFrame, { AdminIcon } from './AdminFrame'
import AdminNavigation from './admin-navigation'
import ProfilePhoto from './ProfilePhoto'
import type { FormEvent } from 'react'
import { welcomeEmailMessage } from './account-mail'
import type { WelcomeEmailStatus } from './account-mail'
import ValidatedForm from './ValidatedForm'
import RolePermissions from './RolePermissions'

type ManagedUser = AuthUser & { createdAt: string; lastAccess: string | null }
type Role = { id: number; name: string }
const accountStates: Record<string, string> = { activo: 'Activa', pendiente: 'Pendiente de habilitación', inactivo: 'Inactiva', bloqueado: 'Bloqueada' }
const requestedProfile = () => /^#usuarios\/perfiles\/(\d+)$/.exec(window.location.hash)?.[1] || ''

async function adminRequest(path = '', body?: object, method = body ? 'POST' : 'GET') {
  const response = await fetch(`/api/auth/admin/users${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(path === '' && method === 'POST' ? 45000 : 10000),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'No pudimos completar la solicitud.')
  return result as { users: ManagedUser[]; roles: Role[]; total: number; pageSize: number; emailDelivery?: WelcomeEmailStatus }
}

export default function AdminUsers() {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const { user: sessionUser, checking, error, setUser } = useAuthSession()
  const accessKey = JSON.stringify([sessionUser?.id, sessionUser?.memberId, sessionUser?.state, sessionUser?.permissions, sessionUser?.registration])
  const [choices, setChoices] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [members, setMembers] = useState<{ id_miembro: number; nombres: string; apellidos: string | null; codigo_miembro?: number | null; correo?: string | null; es_discipulador?: number; tiene_cuenta?: number; grupos_a_cargo?: string | null }[]>([])
  // Account form prefilled for a discipulador without login (name, email, linked record and role).
  const [prefill, setPrefill] = useState<{ name: string; email: string; memberId: string; roleId: string } | null>(null)
  const [links, setLinks] = useState<Record<number, string>>({})
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ q: '', state: '', page: 1 })
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [removal, setRemoval] = useState<ManagedUser | null>(null)
  const [removalError, setRemovalError] = useState('')
  const [creating, setCreating] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [profileId, setProfileId] = useState(requestedProfile)
  const [profilesOpen, setProfilesOpen] = useState(() => window.location.hash.startsWith('#usuarios/perfiles'))
  const [profileSaving, setProfileSaving] = useState(false)
  const profileDirty = useRef(false)
  const updateProfileDirty = useCallback((dirty: boolean) => { profileDirty.current = dirty }, [])
  const canAccounts = hasPermission(sessionUser, 'usuarios.gestionar') && Boolean(sessionUser?.registration?.canManageAccounts)
  const canProfiles = hasPermission(sessionUser, 'gestion.acceder') && hasPermission(sessionUser, 'permisos.gestionar')
  const section = canProfiles && (profilesOpen || !canAccounts) ? 'profiles' : 'users'
  const removalDialog = useRef<HTMLDialogElement>(null)
  // Discipuladores without a login account wait here. Giving them one is optional.
  const canLinkRecords = hasPermission(sessionUser, 'gestion.acceder') && sessionUser?.permissions['miembros.ver'] === 'todos'
  const pendingLeaders = canLinkRecords ? members.filter(member => Number(member.es_discipulador) && !Number(member.tiene_cuenta)) : []
  function openAccountFor(member: typeof members[number]) {
    const leaderRole = roles.find(role => role.name === 'Discipulador')
    setCreateError(''); setPhoto(null)
    setPrefill({ name: `${member.nombres} ${member.apellidos || ''}`.trim(), email: member.correo || '', memberId: String(member.id_miembro), roleId: leaderRole ? String(leaderRole.id) : '' })
    setCreating(true)
    requestAnimationFrame(() => document.getElementById('create-account-title')?.scrollIntoView({ block: 'start' }))
  }
  const loadVersion = useRef(0)
  // The server only lists roles below the actor's rank; an account holding any other role outranks the actor.
  const protectedOwner = (user: ManagedUser) => !sessionUser?.roles.includes('Administrador') && user.roles.some(name => !roles.some(role => role.name === name))
  const cannotDelete = (user: ManagedUser) => user.id === sessionUser?.id || protectedOwner(user)
  const displayDate = (date: string | null) => date ? new Date(date).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' }) : 'Nunca'

  useEffect(() => {
    const update = () => {
      setProfilesOpen(window.location.hash.startsWith('#usuarios/perfiles'))
      const selected = requestedProfile()
      if (selected) setProfileId(selected)
    }
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])

  function chooseProfile(id: string) {
    if (profileSaving) return
    if (id !== profileId && profileDirty.current && !window.confirm('Este perfil tiene cambios sin guardar. ¿Descartarlos y abrir otro perfil?')) return
    setProfileId(id); setProfilesOpen(true)
    window.location.hash = id ? `#usuarios/perfiles/${id}` : '#usuarios/perfiles'
    requestAnimationFrame(() => document.getElementById('role-permissions-title')?.focus({ preventScroll: true }))
  }

  async function load() {
    const version = ++loadVersion.current
    setLoading(true)
    try {
      const result = await adminRequest(`?${new URLSearchParams({ q: filters.q, state: filters.state, page: String(filters.page) })}`)
      if (version !== loadVersion.current) return
      if (filters.page > 1 && !result.users.length) { setFilters(previous => ({ ...previous, page: previous.page - 1 })); return }
      setUsers(result.users)
      setTotal(result.total); setPageSize(result.pageSize)
      setRoles(result.roles)
      setLinks(Object.fromEntries(result.users.map(user => [user.id, String(user.memberId || '')])))
      setChoices(Object.fromEntries(result.users.map(user => [user.id, result.roles.find(role => user.roles.includes(role.name))?.id || 0])))
      if (hasPermission(sessionUser, 'gestion.acceder') && hasPermission(sessionUser, 'miembros.ver')) {
        const memberList = await managementRequest<{ items: typeof members }>('members')
        if (version === loadVersion.current) setMembers(memberList.items)
      }
    } catch (error) { if (version === loadVersion.current) setMessage(error instanceof Error ? error.message : 'No pudimos cargar los usuarios.') }
    finally { if (version === loadVersion.current) setLoading(false) }
  }
  useEffect(() => {
    if (hasPermission(sessionUser, 'usuarios.gestionar') && sessionUser?.registration?.canManageAccounts) void load()
    else { setUsers([]); setMembers([]); setRemoval(null); setCreating(false); setPhoto(null) }
    return () => { loadVersion.current++ }
  }, [accessKey, filters])

  useEffect(() => {
    const refresh = () => { if (saving === null && sessionUser?.registration?.canManageAccounts) void load() }
    window.addEventListener('calvario-users-updated', refresh)
    return () => window.removeEventListener('calvario-users-updated', refresh)
  }, [accessKey, filters, saving])

  useEffect(() => { if (removal && !removalDialog.current?.open) removalDialog.current?.showModal() }, [removal])

  function dismissRemoval() {
    if (saving !== null) return
    removalDialog.current?.close()
    setRemoval(null)
  }

  async function save(user: ManagedUser) {
    setSaving(user.id)
    setMessage('')
    try {
      await adminRequest(`/${user.id}/role`, { roleId: choices[user.id] })
      window.dispatchEvent(new Event('calvario-users-updated'))
      await load()
      setMessage(user.state === 'pendiente' ? `Cuenta habilitada para ${user.email}. Rol asignado.` : `Rol actualizado para ${user.email}.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No pudimos guardar el rol.') }
    finally { setSaving(null) }
  }

  async function remove() {
    if (!removal || saving !== null) return
    setSaving(removal.id); setRemovalError(''); setMessage('')
    try {
      await adminRequest(`/${removal.id}`, { action: removal.state === 'pendiente' ? 'reject' : 'delete', expectedEmail: removal.email, expectedState: removal.state }, 'DELETE')
      removalDialog.current?.close()
      setRemoval(null)
      window.dispatchEvent(new Event('calvario-users-updated'))
      await load()
      setMessage(removal.state === 'pendiente' ? `Solicitud rechazada. La cuenta ${removal.email} fue eliminada de la base de datos.` : `La cuenta ${removal.email} fue eliminada de la base de datos.`)
    } catch (cause) { setRemovalError(cause instanceof Error ? cause.message : 'No pudimos eliminar la cuenta.') }
    finally { setSaving(null) }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (createBusy || photoBusy) return
    const values = new FormData(event.currentTarget)
    if (values.get('password') !== values.get('confirmation')) { setCreateError('Las contraseñas no coinciden.'); return }
    setCreateBusy(true); setCreateError(''); setMessage('')
    try {
      const result = await adminRequest('', { name: values.get('name'), email: values.get('email'), password: values.get('password'), confirmation: values.get('confirmation'), roleId: Number(values.get('roleId')), memberId: values.get('memberId') ? Number(values.get('memberId')) : null, photo })
      setCreating(false); setPhoto(null); setPrefill(null)
      await load()
      window.dispatchEvent(new Event('calvario-users-updated'))
      setMessage(`Cuenta creada para ${values.get('email')}. Ya puede iniciar sesión con el correo y la contraseña asignados. ${welcomeEmailMessage(result.emailDelivery)}`)
    } catch (error) { setCreateError(error instanceof Error ? error.message : 'No pudimos crear la cuenta.') }
    finally { setCreateBusy(false) }
  }

  return (
    <AdminFrame title="Usuarios, roles y permisos" sectionName="Usuarios, roles y permisos" user={sessionUser} onUserChange={setUser} viewKey="users" navigation={<AdminNavigation user={sessionUser} active="users"/>}>
      <section className="admin-panel admin-users-panel" aria-labelledby="panel-page-title">
        <div className="admin-message" role="status" aria-live="polite">{message || error}</div>
        {checking ? <p>Verificando acceso…</p> : !canAccounts && !canProfiles ? <p>Solo los administradores y cargos pastorales autorizados pueden crear cuentas y asignar roles. <a href="#login">Ir a mi cuenta</a></p> : <>
        <nav className="access-tabs" aria-label="Administración de accesos">
          {canAccounts && <a href="#usuarios" aria-current={section === 'users' ? 'page' : undefined} onClick={event => { if (profileSaving) event.preventDefault() }}>Usuarios y asignación de roles</a>}
          {canProfiles && <a href={profileId ? `#usuarios/perfiles/${profileId}` : '#usuarios/perfiles'} aria-current={section === 'profiles' ? 'page' : undefined} onClick={event => { if (profileSaving) event.preventDefault() }}>Perfiles y permisos</a>}
        </nav>
        <div className="access-layout" data-profiles={canProfiles && canAccounts} data-section={section}>
        {canAccounts && <div className="access-users">
        <div className="admin-users-heading"><div><h2>Administración de cuentas</h2><p>Crea accesos y asigna roles. Abre los permisos junto a cada perfil para configurar sus herramientas.</p></div>
          {!creating && <button className="admin-save" disabled={loading || saving !== null} onClick={() => { setCreateError(''); setPhoto(null); setPrefill(null); setCreating(true) }}><AdminIcon name="plus"/>Crear cuenta</button>}
        </div>
        {pendingLeaders.length > 0 && !creating && <section className="pending-leaders" aria-labelledby="pending-leaders-title">
          <div className="pending-leaders-heading"><h2 id="pending-leaders-title">Discipuladores sin cuenta de inicio de sesión <span>{pendingLeaders.length}</span></h2>
            <p>Pueden seguir como discipuladores sin cuenta. Si quieres que entren a la plataforma, créales una aquí: quedará vinculada a su ficha.</p></div>
          <ul>{pendingLeaders.map(member => <li key={member.id_miembro}><div><strong>{memberCode(member.codigo_miembro ?? null) && <span className="member-code">{memberCode(member.codigo_miembro ?? null)}</span>}{member.nombres} {member.apellidos || ''}</strong><span>{member.grupos_a_cargo ? `Grupos a cargo: ${member.grupos_a_cargo}` : 'Sin grupo a cargo por ahora'}</span></div>
            <button type="button" className="admin-save admin-secondary" disabled={loading || saving !== null} onClick={() => openAccountFor(member)}>Asignar cuenta</button></li>)}</ul>
        </section>}
        {creating && <ValidatedForm key={prefill?.memberId || 'new'} className="admin-create-account" aria-labelledby="create-account-title" onSubmit={createAccount}>
          <h2 id="create-account-title">{prefill ? `Crear cuenta para ${prefill.name}` : 'Crear cuenta'}</h2>
          <p>Asigna los datos de acceso y un rol. La cuenta quedará activa y enviaremos un correo con sus credenciales, vinculación y funciones.</p>
          <fieldset disabled={createBusy}>
            <label>Nombre completo<input name="name" required maxLength={100} autoComplete="off" defaultValue={prefill?.name} /></label>
            <label>Correo de acceso<input name="email" type="email" required maxLength={120} autoComplete="off" defaultValue={prefill?.email} /></label>
            <label>Contraseña de acceso<input name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" placeholder="Mínimo 10 caracteres" /></label>
            <label>Confirmar contraseña de acceso<input name="confirmation" type="password" required minLength={10} maxLength={128} autoComplete="new-password" /></label>
            <label>Rol de la cuenta<AppSelect name="roleId" defaultValue={prefill?.roleId || ''} required><option value="" disabled>Selecciona un rol…</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</AppSelect></label>
            {hasPermission(sessionUser, 'gestion.acceder') && sessionUser?.permissions['miembros.ver'] === 'todos' && <label>Ficha del discípulo (opcional)<AppSelect name="memberId" defaultValue={prefill?.memberId || ''}><option value="">Sin vincular</option>{members.map(member => <option key={member.id_miembro} value={member.id_miembro}>{member.nombres} {member.apellidos || ''} · ID {member.id_miembro}</option>)}</AppSelect></label>}
            <ProfilePhoto value={photo} onChange={setPhoto} onBusyChange={setPhotoBusy} disabled={createBusy} />
          </fieldset>
          {hasPermission(sessionUser, 'gestion.acceder') && hasPermission(sessionUser, 'miembros.editar') && <p>Completa los demás datos personales en <a href="#gestion/members">Discípulos</a> y vincula aquí su ficha.</p>}
          {createError && <p role="alert">{createError}</p>}
          <div className="admin-create-actions"><button type="button" className="admin-save admin-secondary" disabled={createBusy || photoBusy} onClick={() => { setCreating(false); setPhoto(null); setPrefill(null) }}>Cancelar</button><button type="submit" className="admin-save" disabled={createBusy || photoBusy}>{createBusy ? 'Creando cuenta…' : 'Guardar cuenta'}</button></div>
        </ValidatedForm>}
        <form className="admin-user-filters" onSubmit={event => { event.preventDefault(); setFilters(previous => ({ ...previous, q: search.trim(), page: 1 })) }}>
          <label className="admin-user-search">Buscar por correo o ID<span className="admin-search-input"><AdminIcon name="search"/><input type="search" maxLength={120} placeholder="correo@ejemplo.com o ADM-0001" value={search} disabled={saving !== null} onChange={event => setSearch(event.target.value)}/></span></label>
          <label>Estado de la cuenta<AppSelect value={filters.state} disabled={saving !== null} onChange={event => setFilters(previous => ({ ...previous, state: event.target.value, page: 1 }))}><option value="">Todos los estados</option><option value="pendiente">Pendientes de habilitación</option><option value="activo">Activas</option><option value="inactivo">Inactivas</option><option value="bloqueado">Bloqueadas</option></AppSelect></label>
          <div className="admin-filter-actions"><button className="admin-save" disabled={loading || saving !== null} type="submit">Buscar</button><button type="button" className="admin-save admin-secondary" disabled={loading || saving !== null} onClick={() => void load()}>Actualizar usuarios</button></div>
        </form>
        <div className="admin-list-heading"><h2>Cuentas registradas</h2><span>{loading ? 'Cargando…' : `${total} ${total === 1 ? 'cuenta' : 'cuentas'}`}</span></div>
        {loading ? <p className="admin-users-empty">Cargando usuarios…</p> : users.length > 0 ? <div className="admin-user-list">
          {users.map(user => <article className="admin-user-row" key={user.id}>
            <header className="admin-user-header"><span className="admin-user-avatar" aria-hidden="true">{(user.name || user.email).slice(0, 1).toUpperCase()}</span><div className="admin-user-info">{user.code && <span className="account-code">{user.code}</span>}<strong>{user.name || user.email}</strong>{user.name && <span className="admin-user-email">{user.email}</span>}<span>{user.roles.join(', ') || 'Sin rol asignado'}{user.id === sessionUser?.id && ' · Tu cuenta'}</span></div><span className={`admin-user-state is-${user.state}`}>{accountStates[user.state] || user.state}</span></header>
            <div className="admin-user-controls"><div className="admin-user-control"><label className="admin-role-label"><span>Rol de la cuenta</span><AppSelect aria-label={`Rol de ${user.email}`} value={choices[user.id] || 0} disabled={user.id === sessionUser?.id || protectedOwner(user) || saving !== null} onChange={event => setChoices({ ...choices, [user.id]: Number(event.target.value) })}><option value={0} disabled>Selecciona un rol…</option>{roles.map(role => <option value={role.id} key={role.id}>{role.name}</option>)}</AppSelect></label>
            <button className="admin-save" disabled={user.id === sessionUser?.id || protectedOwner(user) || saving !== null || !choices[user.id] || user.state !== 'pendiente' && user.roles.length === 1 && user.roles[0] === roles.find(role => role.id === choices[user.id])?.name} onClick={() => void save(user)}>{saving === user.id ? 'Guardando…' : user.state === 'pendiente' ? 'Habilitar cuenta' : 'Guardar'}</button>
            {canProfiles && <button type="button" className="admin-role-permissions" aria-label={`Permisos del perfil de ${user.email}`} disabled={!choices[user.id] || profileSaving} onClick={() => chooseProfile(String(choices[user.id]))}><AdminIcon name="permissions"/>Permisos del perfil</button>}
            </div>
            {hasPermission(sessionUser, 'gestion.acceder') && hasPermission(sessionUser, 'miembros.ver') && <div className="admin-user-control"><label className="admin-member-link">Ficha del discípulo<AppSelect value={links[user.id] || ''} disabled={protectedOwner(user) || saving !== null} onChange={event => setLinks({ ...links, [user.id]: event.target.value })}><option value="">Sin vincular</option>{members.map(member => <option key={member.id_miembro} value={member.id_miembro}>{member.nombres} {member.apellidos || ''} · ID {member.id_miembro}</option>)}</AppSelect></label>
            <button className="admin-save admin-secondary" disabled={protectedOwner(user) || saving !== null || String(user.memberId || '') === (links[user.id] || '')} onClick={() => { setSaving(user.id); void managementRequest(`users/${user.id}/member`, { memberId: links[user.id] ? Number(links[user.id]) : null }).then(async () => { await load(); setMessage('Cuenta vinculada a la ficha del discípulo.') }).catch(error => setMessage(error instanceof Error ? error.message : 'No pudimos vincular la cuenta.')).finally(() => setSaving(null)) }}>Vincular</button>
            </div>}</div>
            <footer className="admin-user-footer"><dl className="admin-user-dates"><div><dt>Registro</dt><dd>{displayDate(user.createdAt)}</dd></div><div><dt>Último acceso</dt><dd>{displayDate(user.lastAccess)}</dd></div></dl><div className="admin-user-removal">{cannotDelete(user) && <small><AdminIcon name="permissions"/>{user.id === sessionUser?.id ? 'Tu cuenta está protegida.' : 'Cargo igual o superior al tuyo.'}</small>}<button type="button" className="admin-delete" disabled={cannotDelete(user) || saving !== null} onClick={() => { setRemovalError(''); setRemoval(user) }}>{user.state === 'pendiente' ? 'Rechazar solicitud' : 'Eliminar cuenta'}</button></div></footer>
          </article>)}
        </div> : <p className="admin-users-empty">No hay cuentas que coincidan con la búsqueda.</p>}
        <div className="admin-user-pagination"><span>Página {filters.page} de {Math.max(1, Math.ceil(total / pageSize))}</span><div className="admin-pagination-actions"><button className="admin-save admin-secondary" disabled={loading || saving !== null || filters.page <= 1} onClick={() => setFilters(previous => ({ ...previous, page: previous.page - 1 }))}>Anterior</button><button className="admin-save admin-secondary" disabled={loading || saving !== null || filters.page * pageSize >= total} onClick={() => setFilters(previous => ({ ...previous, page: previous.page + 1 }))}>Siguiente</button></div></div>
        <p className="admin-note">El rol Usuario ofrece acceso básico. Los roles operativos muestran los módulos autorizados. Vincula a cada discipulador con su ficha para delimitar los grupos a su cargo. Las cuentas pendientes anteriores se habilitan asignándoles un rol.</p>
        </div>}
        {canProfiles && sessionUser && <RolePermissions user={sessionUser} roleId={profileId} onChooseRole={chooseProfile} onDirtyChange={updateProfileDirty} onBusyChange={setProfileSaving} onSaved={name => {
          setMessage(`Permisos de ${name} actualizados para todas las cuentas con ese perfil.`)
          window.dispatchEvent(new Event('calvario-account-updated'))
          window.dispatchEvent(new Event('calvario-users-updated'))
        }}/>}
        </div>
        </>}
        {removal && <dialog ref={removalDialog} className="admin-removal-dialog" aria-labelledby="admin-removal-title" aria-describedby="admin-removal-description" onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation() }} onCancel={event => { event.preventDefault(); dismissRemoval() }}>
          <h2 id="admin-removal-title">{removal.state === 'pendiente' ? 'Rechazar solicitud de cuenta' : 'Eliminar cuenta definitivamente'}</h2>
          <p id="admin-removal-description">Se eliminará de la base de datos la cuenta <strong>{removal.email}</strong>, junto con sus sesiones, roles y datos de perfil. Esta acción no se puede deshacer. La ficha del discípulo y los registros de la iglesia se conservan.</p>
          {removalError && <p role="alert">{removalError}</p>}
          <div className="admin-removal-actions"><button type="button" autoFocus className="admin-save" disabled={saving !== null} onClick={dismissRemoval}>Cancelar</button><button type="button" className="admin-delete" disabled={saving !== null} onClick={() => void remove()}>{saving !== null ? 'Eliminando…' : removal.state === 'pendiente' ? 'Confirmar rechazo' : 'Eliminar definitivamente'}</button></div>
        </dialog>}
      </section>
    </AdminFrame>
  )
}
