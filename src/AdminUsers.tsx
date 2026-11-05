import AppSelect from './AppSelect'
import { useEffect, useState } from 'react'
import { hasPermission, useAuthSession } from './auth'
import type { AuthUser } from './auth'
import './admin.css'
import { managementRequest } from './management-api'
import AdminFrame from './AdminFrame'
import AdminNavigation from './admin-navigation'

type ManagedUser = AuthUser & { state: string }
type Role = { id: number; name: string }

async function adminRequest(path = '', roleId?: number) {
  const response = await fetch(`/api/auth/admin/users${path}`, {
    method: roleId === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: roleId === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: roleId === undefined ? undefined : JSON.stringify({ roleId }),
    signal: AbortSignal.timeout(10000),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'No pudimos completar la solicitud.')
  return result as { users: ManagedUser[]; roles: Role[] }
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
  const protectedOwner = (user: ManagedUser) => user.roles.includes('Superadmin') && !sessionUser?.roles.includes('Superadmin')

  async function load() {
    setLoading(true)
    try {
      const result = await adminRequest()
      setUsers(result.users)
      setRoles(result.roles)
      setLinks(Object.fromEntries(result.users.map(user => [user.id, String(user.memberId || '')])))
      setChoices(Object.fromEntries(result.users.map(user => [user.id, result.roles.find(role => user.roles.includes(role.name))?.id || 0])))
      if (hasPermission(sessionUser, 'gestion.acceder') && hasPermission(sessionUser, 'miembros.ver')) {
        const memberList = await managementRequest<{ items: typeof members }>('members')
        setMembers(memberList.items)
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No pudimos cargar los usuarios.') }
    finally { setLoading(false) }
  }
  useEffect(() => {
    if (hasPermission(sessionUser, 'usuarios.gestionar') && sessionUser?.registration?.canManageAccounts) void load()
    else { setUsers([]); setMembers([]) }
  }, [accessKey])

  async function save(user: ManagedUser) {
    setSaving(user.id)
    setMessage('')
    try {
      await adminRequest(`/${user.id}/role`, choices[user.id])
      await load()
      setMessage(user.state === 'pendiente' ? `Cuenta habilitada para ${user.email}. Rol asignado.` : `Rol actualizado para ${user.email}.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No pudimos guardar el rol.') }
    finally { setSaving(null) }
  }

  return (
    <AdminFrame title="Usuarios y roles" sectionName="Usuarios y roles" user={sessionUser} onUserChange={setUser} viewKey="users" navigation={<AdminNavigation user={sessionUser} active="users"/>}>
      <section className="admin-panel" aria-labelledby="panel-page-title">
        <div className="admin-message" role="status" aria-live="polite">{message || error}</div>
        {checking ? <p>Verificando acceso…</p> : !hasPermission(sessionUser, 'usuarios.gestionar') || !sessionUser?.registration?.canManageAccounts ? <p>Solo los cinco cargos pastorales autorizados pueden habilitar cuentas y asignar roles. <a href="#login">Ir a mi cuenta</a></p> : <>
        <p>Las cuentas pendientes aparecen primero. Selecciona su rol y pulsa Habilitar cuenta para permitir el acceso correspondiente.</p>
        <button className="admin-save" disabled={loading || saving !== null} onClick={() => void load()}>Actualizar usuarios</button>
        {loading ? <p>Cargando usuarios…</p> : users.length > 0 ? <div className="admin-user-list">
          {users.map(user => <div className="admin-user-row" key={user.id}>
            <div className="admin-user-info"><strong>{user.email}</strong><span>{user.roles.join(', ') || 'Sin rol asignado'}{user.id === sessionUser?.id && ' · Tu cuenta'}</span><span className={`admin-user-state${user.state === 'pendiente' ? ' is-pending' : ''}`}>{user.state === 'pendiente' ? 'Pendiente de habilitación' : user.state}</span></div>
            <label className="admin-role-label"><span className="sr-only">Rol de {user.email}</span><AppSelect value={choices[user.id] || 0} disabled={user.id === sessionUser?.id || protectedOwner(user) || saving !== null} onChange={event => setChoices({ ...choices, [user.id]: Number(event.target.value) })}><option value={0} disabled>Selecciona un rol…</option>{roles.map(role => <option value={role.id} key={role.id}>{role.name}</option>)}</AppSelect></label>
            <button className="admin-save" disabled={user.id === sessionUser?.id || protectedOwner(user) || saving !== null || !choices[user.id] || user.state !== 'pendiente' && user.roles.length === 1 && user.roles[0] === roles.find(role => role.id === choices[user.id])?.name} onClick={() => void save(user)}>{saving === user.id ? 'Guardando…' : user.state === 'pendiente' ? 'Habilitar cuenta' : 'Guardar'}</button>
            {hasPermission(sessionUser, 'gestion.acceder') && hasPermission(sessionUser, 'miembros.ver') && <><label className="admin-member-link">Ficha del discípulo<AppSelect value={links[user.id] || ''} disabled={protectedOwner(user) || saving !== null} onChange={event => setLinks({ ...links, [user.id]: event.target.value })}><option value="">Sin vincular</option>{members.map(member => <option key={member.id_miembro} value={member.id_miembro}>{member.nombres} {member.apellidos || ''} · ID {member.id_miembro}</option>)}</AppSelect></label>
            <button className="admin-save" disabled={protectedOwner(user) || saving !== null} onClick={() => { setSaving(user.id); void managementRequest(`users/${user.id}/member`, { memberId: links[user.id] ? Number(links[user.id]) : null }).then(async () => { await load(); setMessage('Cuenta vinculada a la ficha del discípulo.') }).catch(error => setMessage(error instanceof Error ? error.message : 'No pudimos vincular la cuenta.')).finally(() => setSaving(null)) }}>Vincular</button>
            </>}
          </div>)}
        </div> : <a className="facebook-link" href="#login">Ir a iniciar sesión</a>}
        <p className="admin-note">Tu propio rol está protegido. Las cuentas nuevas quedan pendientes y sin rol hasta que las habilites. El rol Usuario permite una cuenta básica; los roles operativos muestran sus módulos autorizados. Vincula cada discipulador a su ficha para delimitar los grupos a su cargo.</p>
        </>}
      </section>
    </AdminFrame>
  )
}
