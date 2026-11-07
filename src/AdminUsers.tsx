import AppSelect from './AppSelect'
import { useEffect, useRef, useState } from 'react'
import { hasPermission, useAuthSession } from './auth'
import type { AuthUser } from './auth'
import './admin.css'
import { managementRequest } from './management-api'
import AdminFrame from './AdminFrame'
import AdminNavigation from './admin-navigation'
import ProfilePhoto from './ProfilePhoto'
import type { FormEvent } from 'react'
import { welcomeEmailMessage } from './account-mail'
import type { WelcomeEmailStatus } from './account-mail'

type ManagedUser = AuthUser & { createdAt: string; lastAccess: string | null }
type Role = { id: number; name: string }

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
  const [members, setMembers] = useState<{ id_miembro: number; nombres: string; apellidos: string | null }[]>([])
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
  const removalDialog = useRef<HTMLDialogElement>(null)
  const loadVersion = useRef(0)
  const protectedOwner = (user: ManagedUser) => user.roles.includes('Superadmin') && !sessionUser?.roles.includes('Superadmin')
  const cannotDelete = (user: ManagedUser) => user.id === sessionUser?.id || user.roles.includes('Superadmin')
  const displayDate = (date: string | null) => date ? new Date(date).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' }) : 'Nunca'

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
      setCreating(false); setPhoto(null)
      await load()
      window.dispatchEvent(new Event('calvario-users-updated'))
      setMessage(`Cuenta creada para ${values.get('email')}. Ya puede iniciar sesión con el correo y la contraseña asignados. ${welcomeEmailMessage(result.emailDelivery)}`)
    } catch (error) { setCreateError(error instanceof Error ? error.message : 'No pudimos crear la cuenta.') }
    finally { setCreateBusy(false) }
  }

  return (
    <AdminFrame title="Usuarios y roles" sectionName="Usuarios y roles" user={sessionUser} onUserChange={setUser} viewKey="users" navigation={<AdminNavigation user={sessionUser} active="users"/>}>
      <section className="admin-panel" aria-labelledby="panel-page-title">
        <div className="admin-message" role="status" aria-live="polite">{message || error}</div>
        {checking ? <p>Verificando acceso…</p> : !hasPermission(sessionUser, 'usuarios.gestionar') || !sessionUser?.registration?.canManageAccounts ? <p>Solo los administradores y cargos pastorales autorizados pueden crear cuentas y asignar roles. <a href="#login">Ir a mi cuenta</a></p> : <>
        <p>La administración y el equipo pastoral crean las cuentas y asignan sus datos de acceso. Las cuentas pendientes anteriores pueden habilitarse seleccionando un rol.</p>
        {!creating ? <button className="admin-save" disabled={loading || saving !== null} onClick={() => { setCreateError(''); setPhoto(null); setCreating(true) }}>Crear cuenta</button> : <form className="admin-create-account" aria-labelledby="create-account-title" onSubmit={createAccount}>
          <h2 id="create-account-title">Crear cuenta</h2>
          <p>Asigna los datos de acceso y un rol. La cuenta quedará activa y enviaremos un correo con sus credenciales, vinculación y funciones.</p>
          <fieldset disabled={createBusy}>
            <label>Nombre completo<input name="name" required maxLength={100} autoComplete="off" /></label>
            <label>Correo de acceso<input name="email" type="email" required maxLength={120} autoComplete="off" /></label>
            <label>Contraseña de acceso<input name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" placeholder="Mínimo 10 caracteres" /></label>
            <label>Confirmar contraseña de acceso<input name="confirmation" type="password" required minLength={10} maxLength={128} autoComplete="new-password" /></label>
            <label>Rol de la cuenta<AppSelect name="roleId" defaultValue="" required><option value="" disabled>Selecciona un rol…</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</AppSelect></label>
            {hasPermission(sessionUser, 'gestion.acceder') && sessionUser.permissions['miembros.ver'] === 'todos' && <label>Ficha del discípulo (opcional)<AppSelect name="memberId" defaultValue=""><option value="">Sin vincular</option>{members.map(member => <option key={member.id_miembro} value={member.id_miembro}>{member.nombres} {member.apellidos || ''} · ID {member.id_miembro}</option>)}</AppSelect></label>}
            <ProfilePhoto value={photo} onChange={setPhoto} onBusyChange={setPhotoBusy} disabled={createBusy} />
          </fieldset>
          {hasPermission(sessionUser, 'gestion.acceder') && hasPermission(sessionUser, 'miembros.editar') && <p>Completa los demás datos personales en <a href="#gestion/members">Discípulos</a> y vincula aquí su ficha.</p>}
          {createError && <p role="alert">{createError}</p>}
          <div className="admin-create-actions"><button type="submit" className="admin-save" disabled={createBusy || photoBusy}>{createBusy ? 'Creando cuenta…' : 'Guardar cuenta'}</button><button type="button" className="admin-save" disabled={createBusy || photoBusy} onClick={() => { setCreating(false); setPhoto(null) }}>Cancelar</button></div>
        </form>}
        <form className="admin-user-filters" onSubmit={event => { event.preventDefault(); setFilters(previous => ({ ...previous, q: search.trim(), page: 1 })) }}>
          <label>Buscar por correo<input type="search" maxLength={120} value={search} disabled={saving !== null} onChange={event => setSearch(event.target.value)}/></label>
          <label>Estado de la cuenta<AppSelect value={filters.state} disabled={saving !== null} onChange={event => setFilters(previous => ({ ...previous, state: event.target.value, page: 1 }))}><option value="">Todos los estados</option><option value="pendiente">Pendientes de habilitación</option><option value="activo">Activas</option><option value="inactivo">Inactivas</option><option value="bloqueado">Bloqueadas</option></AppSelect></label>
          <button className="admin-save" disabled={loading || saving !== null} type="submit">Buscar</button>
        </form>
        <button className="admin-save" disabled={loading || saving !== null} onClick={() => void load()}>Actualizar usuarios</button>
        {loading ? <p>Cargando usuarios…</p> : users.length > 0 ? <div className="admin-user-list">
          {users.map(user => <div className="admin-user-row" key={user.id}>
            <div className="admin-user-info"><strong>{user.email}</strong><span>{user.roles.join(', ') || 'Sin rol asignado'}{user.id === sessionUser?.id && ' · Tu cuenta'}</span><span className={`admin-user-state${user.state === 'pendiente' ? ' is-pending' : ''}`}>{user.state === 'pendiente' ? 'Pendiente de habilitación' : user.state}</span><span>Registro: {displayDate(user.createdAt)} · Último acceso: {displayDate(user.lastAccess)}</span></div>
            <label className="admin-role-label"><span className="sr-only">Rol de {user.email}</span><AppSelect value={choices[user.id] || 0} disabled={user.id === sessionUser?.id || protectedOwner(user) || saving !== null} onChange={event => setChoices({ ...choices, [user.id]: Number(event.target.value) })}><option value={0} disabled>Selecciona un rol…</option>{roles.map(role => <option value={role.id} key={role.id}>{role.name}</option>)}</AppSelect></label>
            <button className="admin-save" disabled={user.id === sessionUser?.id || protectedOwner(user) || saving !== null || !choices[user.id] || user.state !== 'pendiente' && user.roles.length === 1 && user.roles[0] === roles.find(role => role.id === choices[user.id])?.name} onClick={() => void save(user)}>{saving === user.id ? 'Guardando…' : user.state === 'pendiente' ? 'Habilitar cuenta' : 'Guardar'}</button>
            {hasPermission(sessionUser, 'gestion.acceder') && hasPermission(sessionUser, 'miembros.ver') && <><label className="admin-member-link">Ficha del discípulo<AppSelect value={links[user.id] || ''} disabled={protectedOwner(user) || saving !== null} onChange={event => setLinks({ ...links, [user.id]: event.target.value })}><option value="">Sin vincular</option>{members.map(member => <option key={member.id_miembro} value={member.id_miembro}>{member.nombres} {member.apellidos || ''} · ID {member.id_miembro}</option>)}</AppSelect></label>
            <button className="admin-save" disabled={protectedOwner(user) || saving !== null} onClick={() => { setSaving(user.id); void managementRequest(`users/${user.id}/member`, { memberId: links[user.id] ? Number(links[user.id]) : null }).then(async () => { await load(); setMessage('Cuenta vinculada a la ficha del discípulo.') }).catch(error => setMessage(error instanceof Error ? error.message : 'No pudimos vincular la cuenta.')).finally(() => setSaving(null)) }}>Vincular</button>
            </>}
            <div className="admin-user-removal"><button type="button" className="admin-delete" disabled={cannotDelete(user) || saving !== null} onClick={() => { setRemovalError(''); setRemoval(user) }}>{user.state === 'pendiente' ? 'Rechazar solicitud' : 'Eliminar cuenta'}</button>{cannotDelete(user) && <small>{user.id === sessionUser?.id ? 'Tu cuenta está protegida.' : 'Propietario técnico protegido.'}</small>}</div>
          </div>)}
        </div> : <p>No hay cuentas que coincidan con la búsqueda.</p>}
        <div className="admin-user-pagination"><span>{total} cuentas · Página {filters.page} de {Math.max(1, Math.ceil(total / pageSize))}</span><button className="admin-save" disabled={loading || saving !== null || filters.page <= 1} onClick={() => setFilters(previous => ({ ...previous, page: previous.page - 1 }))}>Anterior</button><button className="admin-save" disabled={loading || saving !== null || filters.page * pageSize >= total} onClick={() => setFilters(previous => ({ ...previous, page: previous.page + 1 }))}>Siguiente</button></div>
        <p className="admin-note">Tu propio rol está protegido. Las cuentas nuevas se crean activas con el rol asignado. El rol Usuario permite una cuenta básica; los roles operativos muestran sus módulos autorizados. Vincula cada discipulador a su ficha para delimitar los grupos a su cargo.</p>
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
