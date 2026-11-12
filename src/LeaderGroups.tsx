import { useEffect, useRef, useState } from 'react'
import { managementRequest as api } from './management-api'
import { hasPermission } from './auth'
import type { AuthUser } from './auth'
import { CoverageAssignments, canManageCoverage } from './CoverageAssignments'
import GroupMembers from './GroupMembers'

type Row = Record<string, string | number | null>

// "Grupos a cargo" tab of a disciple leader's record: per group, its neighborhoods and its disciples.
export default function LeaderGroups({ leader, user, notify, onChanged }: { leader: Row; user: AuthUser; notify: (text: string) => void; onChanged: () => Promise<void> }) {
  const leaderId = Number(leader.id_miembro)
  const [groups, setGroups] = useState<Row[] | null>(null)
  const [allGroups, setAllGroups] = useState<Row[]>([])
  const [people, setPeople] = useState<Row[]>([])
  const [error, setError] = useState('')
  const request = useRef(0)
  async function load() {
    const current = ++request.current
    try {
      const [groupList, memberList] = await Promise.all([api<{ items: Row[] }>('groups'), hasPermission(user, 'miembros.ver') ? api<{ items: Row[] }>('members') : Promise.resolve({ items: [] as Row[] })])
      if (current !== request.current) return
      setAllGroups(groupList.items); setGroups(groupList.items.filter(group => Number(group.id_discipulador) === leaderId)); setPeople(memberList.items); setError('')
    } catch (cause) { if (current === request.current) setError(cause instanceof Error ? cause.message : 'No pudimos cargar los grupos.') }
  }
  useEffect(() => {
    void load()
    const refresh = () => { void load() }
    window.addEventListener('calvario-coverage-updated', refresh)
    return () => { request.current++; window.removeEventListener('calvario-coverage-updated', refresh) }
  }, [leaderId])
  async function changed() { await load(); await onChanged() }
  const canAdd = hasPermission(user, 'grupos.editar') && hasPermission(user, 'miembros.editar')
  const canRemove = canAdd && user.permissions['miembros.editar'] === 'todos'
  const groupNames = new Map(allGroups.map(group => [Number(group.id_grupo), String(group.nombre)]))
  if (error) return <p role="alert">{error} <button type="button" className="secondary" onClick={() => void load()}>Reintentar</button></p>
  if (!groups) return <p role="status">Cargando grupos a cargo…</p>
  if (!groups.length) return <div className="leader-groups-empty"><p>{String(leader.nombres)} todavía no tiene Grupos de Comunión a cargo.</p><p>Para asignarlo, abre el grupo en <a href="#gestion/groups">Grupos de Comunión</a> y elige su nombre en “Discipulador” al editarlo.</p></div>
  return <div className="leader-groups">{groups.map(group => <section key={group.id_grupo} className="leader-group" aria-labelledby={`leader-group-${group.id_grupo}`}>
    <div className="leader-group-heading"><h4 id={`leader-group-${group.id_grupo}`}>{group.nombre}</h4><a className="app-action secondary" href={`#gestion/groups/ficha/${group.id_grupo}`}>Abrir ficha del grupo</a></div>
    <p className="leader-group-barrios"><strong>Barrios:</strong> {group.barrio || 'Sin barrios asignados'}</p>
    {canManageCoverage(user) && <CoverageAssignments id={leaderId} groupId={Number(group.id_grupo)} name={String(group.nombre)} user={user}/>}
    {hasPermission(user, 'miembros.ver') && <GroupMembers group={group} members={people} groupNames={groupNames} canAdd={canAdd} canRemove={canRemove} notify={notify} onChanged={changed}/>}
  </section>)}</div>
}
