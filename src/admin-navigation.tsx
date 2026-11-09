import type { AuthUser } from './auth'
import { hasPermission } from './auth'
import { AdminIcon } from './AdminFrame'
import { canCreateTrainingBooks } from './Training'

const modules = [
  { key: 'dashboard', label: 'Inicio', permissions: ['gestion.acceder'] },
  { key: 'members', label: 'Discípulos', permissions: ['miembros.ver', 'miembros.editar', 'miembros.registrar'] },
  { key: 'groups', label: 'Grupos de Comunión', permissions: ['grupos.ver'] },
  { key: 'mapa', label: 'Mapa', permissions: ['grupos.ver'] },
  { key: 'training', label: 'Adiestramiento', permissions: ['adiestramiento.gestionar'] },
  { key: 'activities', label: 'Eventos y Cultos', permissions: ['eventos.editar', 'eventos.publicar', 'grupos.editar', 'asistencia.registrar', 'asistencia.ver'] },
  { key: 'falls', label: 'Asistencia y alertas', permissions: ['asistencia.registrar', 'asistencia.ver', 'alertas.ver'] },
  { key: 'reports', label: 'Reportes', permissions: ['reportes.asistencia', 'reportes.cumpleanos', 'reportes.grupos', 'reportes.discipulos'] },
  { key: 'users', label: 'Usuarios, roles y permisos', permissions: ['usuarios.gestionar', 'permisos.gestionar'] },
]

export function allowedModules(user: AuthUser | null) {
  return modules.filter(module => module.key === 'users'
    ? Boolean(user?.registration?.canManageAccounts) && hasPermission(user, 'usuarios.gestionar') || hasPermission(user, 'gestion.acceder') && hasPermission(user, 'permisos.gestionar')
    : (module.key !== 'training' || canCreateTrainingBooks(user)) && hasPermission(user, 'gestion.acceder') && module.permissions.some(code => hasPermission(user, code)))
}

export const currentModule = () => {
  const key = window.location.hash.split('/')[1] || 'dashboard'
  return ['attendance', 'alerts'].includes(key) ? 'falls' : key
}

export default function AdminNavigation({ user, active, onSelect }: { user: AuthUser | null; active: string; onSelect?: (key: string) => void }) {
  return <nav className="panel-nav" aria-label="Módulos de gestión">
    {allowedModules(user).map(module => {
      const content = <><AdminIcon name={module.key}/><span>{module.label}</span></>
      return onSelect && module.key !== 'users'
        ? <button key={module.key} data-panel-item title={module.label} aria-current={active === module.key ? 'page' : undefined} onClick={() => onSelect(module.key)}>{content}</button>
        : <a key={module.key} data-panel-item title={module.label} href={module.key === 'users' ? '#usuarios' : `#gestion/${module.key}`} aria-current={active === module.key ? 'page' : undefined}>{content}</a>
    })}
  </nav>
}
