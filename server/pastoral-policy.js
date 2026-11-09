export const pastoralRoles = [
  { name: 'Apóstol General', level: 1, systemRole: 'Apóstol General' },
  { name: 'Asistencia Apostólica', level: 2, systemRole: 'Asistencia Apostólica' },
  { name: 'Pastor de Distrito', level: 3, systemRole: 'Pastor de Distrito' },
  { name: 'Pastor Local', level: 4, systemRole: 'Pastor Local' },
  { name: 'Asistencia Pastoral', level: 5, systemRole: 'Asistencia Pastoral' },
  { name: 'Discipuladores', level: 6, systemRole: 'Discipulador' },
]

export function rolePermissionPolicy(name) {
  if (name === 'Usuario') return { editable: false, groupOnly: false, reason: 'Usuario conserva el acceso básico. Asigna un perfil operativo para habilitar herramientas.' }
  if (['Administrador', 'Pastor', ...pastoralRoles.filter(role => role.level <= 4).map(role => role.systemRole)].includes(name)) {
    return { editable: false, groupOnly: false, reason: 'Este perfil administrativo conserva su configuración protegida.' }
  }
  return { editable: true, groupOnly: name === 'Discipulador', reason: name === 'Discipulador' ? 'El alcance se limita a los grupos a cargo; el catálogo de adiestramiento conserva su alcance general.' : null }
}

export function pastoralRoleFor(systemRoles, linkedRole) {
  const assigned = pastoralRoles.filter(role => systemRoles.includes(role.systemRole)).sort((a, b) => a.level - b.level)[0]
  if (assigned) return { name: assigned.name, level: assigned.level }
  return linkedRole ? { name: linkedRole.nombre, level: Number(linkedRole.nivel_jerarquico) } : null
}

export function hasPastoralAuthority(user) {
  if (user?.state !== 'activo') return false
  // Technical ownership remains valid even when its linked member has rank 6.
  if (user.roles.includes('Administrador')) return true
  const level = user.pastoralRole?.level
  if (level != null) return level >= 1 && level <= 5
  return false
}

export function registrationCapabilities(user) {
  const authority = hasPastoralAuthority(user)
  return {
    canCreateAdministrative: authority && Boolean(user.permissions['miembros.editar'] || user.permissions['miembros.registrar']) && Boolean(user.permissions['usuarios.gestionar']),
    canAssignServices: authority,
    canManageAccounts: canAdministerAccounts(user),
  }
}

export function canAdministerAccounts(user) {
  return user?.state === 'activo' && Boolean(user.permissions['usuarios.gestionar']) && hasPastoralAuthority(user)
}

// Hierarchy rank of a system role: 0 is Administrador, 1-6 the pastoral ranks.
// 'Pastor' grants every permission, so it ranks with Pastor Local. Other roles have no rank.
export function roleLevel(name) {
  if (name === 'Administrador') return 0
  if (name === 'Pastor') return 4
  return pastoralRoles.find(role => role.systemRole === name)?.level ?? null
}

// Highest rank (lowest number) among an account's system roles and its linked member rank.
export function accountLevel(roles, linkedLevel = null) {
  const levels = [...roles.map(roleLevel), linkedLevel == null ? null : Number(linkedLevel)].filter(level => level != null)
  return levels.length ? Math.min(...levels) : null
}

// Only Administrador acts on its own rank or above. Everyone else acts strictly below their rank.
export function outranks(actor, level) {
  if (actor?.roles?.includes('Administrador')) return true
  const own = accountLevel(actor?.roles || [], actor?.pastoralRole?.level)
  return own != null && (level == null || level > own)
}
