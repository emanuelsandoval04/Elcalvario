export const pastoralRoles = [
  { name: 'Apóstol General', level: 1, systemRole: 'Apóstol General' },
  { name: 'Asistencia Apostólica', level: 2, systemRole: 'Asistencia Apostólica' },
  { name: 'Pastor de Distrito', level: 3, systemRole: 'Pastor de Distrito' },
  { name: 'Pastor Local', level: 4, systemRole: 'Pastor Local' },
  { name: 'Asistencia Pastoral', level: 5, systemRole: 'Asistencia Pastoral' },
  { name: 'Discipuladores', level: 6, systemRole: 'Discipulador' },
]

export function pastoralRoleFor(systemRoles, linkedRole) {
  const assigned = pastoralRoles.filter(role => systemRoles.includes(role.systemRole)).sort((a, b) => a.level - b.level)[0]
  if (assigned) return { name: assigned.name, level: assigned.level }
  return linkedRole ? { name: linkedRole.nombre, level: Number(linkedRole.nivel_jerarquico) } : null
}

export function hasPastoralAuthority(user) {
  if (user?.state !== 'activo') return false
  // Technical ownership remains valid even when its linked member has rank 6.
  if (user.roles.includes('Superadmin')) return true
  const level = user.pastoralRole?.level
  if (level != null) return level >= 1 && level <= 5
  return false
}

export function registrationCapabilities(user) {
  const authority = hasPastoralAuthority(user)
  return {
    canCreateAdministrative: authority && Boolean(user.permissions['miembros.editar'] || user.permissions['miembros.registrar']) && Boolean(user.permissions['usuarios.gestionar']),
    canAssignServices: authority,
    canManageAccounts: authority && Boolean(user.permissions['usuarios.gestionar']),
  }
}
