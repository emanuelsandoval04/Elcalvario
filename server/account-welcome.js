import { mailConfiguration, deliverEmail } from './mail-delivery.js'
import { brandedEmail, mailButton, escapeHtml } from './mail-templates.js'
import { canManageTraining } from './training.js'

export function accountCapabilities(user) {
  const result = ['Actualizar tu nombre y foto, cambiar tu correo y contraseña y gestionar tus sesiones.']
  if (user.registration?.canManageAccounts) result.push('Crear y administrar cuentas de acceso, asignar roles y vincular fichas de discípulos.')
  if (!user.permissions['gestion.acceder']) {
    result.push('Tu cuenta no tiene módulos de gestión habilitados.')
    return result
  }
  const descriptions = {
    'miembros.ver': 'Consultar fichas de discípulos',
    'miembros.registrar': 'Registrar discípulos de forma individual o desde Excel',
    'miembros.editar': 'Editar los datos autorizados de discípulos',
    'miembros.sensibles': 'Consultar y editar los datos de salud y contacto de emergencia autorizados',
    'miembros.estado': 'Actualizar el estado de los discípulos',
    'miembros.eliminar': 'Archivar fichas de discípulos',
    'grupos.ver': 'Consultar Grupos de Comunión y su cobertura en el mapa',
    'grupos.editar': user.registration?.canAssignServices ? 'Crear y administrar Grupos de Comunión y asignar responsables' : 'Editar los datos autorizados de grupos y programar sus reuniones',
    'grupos.eliminar': 'Archivar grupos',
    'eventos.editar': 'Crear y editar eventos y cultos',
    'eventos.publicar': 'Publicar eventos y cultos',
    'eventos.eliminar': 'Archivar actividades',
    'asistencia.registrar': 'Registrar asistencia',
    'asistencia.ver': 'Consultar asistencia',
    'asistencia.corregir': 'Corregir registros de asistencia',
    'asistencia.eliminar': 'Archivar registros de asistencia',
    'estadisticas.ver': 'Consultar las estadísticas disponibles',
    'alertas.ver': 'Consultar alertas de acompañamiento pastoral',
    'seguimiento.gestionar': 'Asignar responsables y registrar llamadas, visitas y notas de acompañamiento pastoral',
    'reportes.asistencia': 'Exportar reportes de asistencia',
    'reportes.cumpleanos': 'Exportar reportes de cumpleaños',
    'reportes.grupos': 'Exportar reportes de grupos',
    'reportes.discipulos': 'Exportar fichas de discípulos',
    'consentimientos.gestionar': 'Registrar y consultar consentimientos de datos',
    'permisos.gestionar': 'Consultar y configurar permisos de los roles autorizados',
  }
  for (const [code, description] of Object.entries(descriptions)) {
    if(code==='seguimiento.gestionar' && !user.permissions['alertas.ver']) continue
    const scope = user.permissions[code]
    if (scope) result.push(`${description}${scope === 'grupo' ? ', solo dentro del alcance de los grupos a tu cargo' : ''}.`)
  }
  if (user.permissions['ministerios.gestionar'] && user.registration?.canAssignServices) result.push('Asignar servicios y ministerios según tus permisos.')
  if (user.registration?.canCreateAdministrative) result.push('Registrar administrativos con su ficha y cuenta de acceso.')
  if (canManageTraining(user)) result.push('Crear y administrar libros de adiestramiento y sus asignaciones autorizadas.')
  return result
}

export async function welcomeContext(connection, user, actor) {
  let member = null, groups = [], ministries = []
  if (user.memberId) {
    const [members] = await connection.execute(`SELECT m.id_miembro AS id,CONCAT_WS(' ',m.nombres,m.apellidos) AS name,
      g.nombre AS groupName,g.codigo_grupo AS groupCode,r.nombre AS pastoralRole,m.funcion_iglesia AS service,
      CONCAT_WS(' ',c.nombres,c.apellidos) AS coverageName,l.nombre AS trainingBook
      FROM miembro m LEFT JOIN grupo_comunion g ON g.id_grupo=m.id_grupo AND g.archivado=0
      LEFT JOIN rol_eclesiastico r ON r.id_rol_eclesiastico=m.id_rol_eclesiastico
      LEFT JOIN miembro c ON c.id_miembro=m.id_cobertura_pastoral AND c.archivado=0
      LEFT JOIN libro_adiestramiento l ON l.id_libro=m.id_libro WHERE m.id_miembro=? AND m.archivado=0`, [user.memberId])
    member = members[0] || null
    ;[groups] = await connection.execute('SELECT nombre,codigo_grupo FROM grupo_comunion WHERE id_discipulador=? AND archivado=0 ORDER BY nombre', [user.memberId])
    ;[ministries] = await connection.execute('SELECT m.nombre FROM miembro_ministerio mm JOIN ministerio m ON m.id_ministerio=mm.id_ministerio WHERE mm.id_miembro=? AND mm.activo=1 ORDER BY m.nombre', [user.memberId])
  }
  return { member, groups, ministries, createdBy: actor.name || actor.email, createdAt: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }) }
}

export async function welcomeMessage(user, password, context, configuration) {
  const link = `${configuration.origin}/#login`
  const details = [
    ['Nombre', user.name || user.email], ['Correo de acceso', user.email],
    ['Contraseña inicial', password], ['Rol asignado', user.roles.join(', ')],
    ['Estado de la cuenta', 'Activa'], ['Cuenta creada por', context.createdBy], ['Fecha de vinculación (Colombia)', context.createdAt],
    ['Ficha del discípulo', context.member ? `${context.member.name} · ID ${context.member.id}` : 'Sin ficha vinculada'],
  ]
  if (context.member) {
    const member = context.member
    details.push(['Grupo de Comunión', member.groupName ? `${member.groupName}${member.groupCode ? ` (${member.groupCode})` : ''}` : 'Sin grupo asignado'])
    for (const [label, value] of [['Cargo pastoral', member.pastoralRole], ['Función o servicio', member.service], ['Cobertura pastoral', member.coverageName], ['Libro de adiestramiento', member.trainingBook]]) if (value) details.push([label, value])
  }
  if (context.groups?.length) details.push(['Grupos a tu cargo', context.groups.map(group => `${group.nombre} (${group.codigo_grupo})`).join(', ')])
  if (context.ministries?.length) details.push(['Ministerios', context.ministries.map(ministry => ministry.nombre).join(', ')])
  const capabilities = accountCapabilities(user)
  const rows = details.map(([label, value]) => `<tr><th scope="row" align="left" valign="top" style="padding:10px 8px;border-bottom:1px solid #eee9e3;width:40%;font-size:13px">${escapeHtml(label)}</th><td valign="top" style="padding:10px 8px;border-bottom:1px solid #eee9e3;font-size:13px;overflow-wrap:anywhere;word-break:break-word;white-space:pre-wrap">${escapeHtml(value)}</td></tr>`).join('')
  return brandedEmail({
    email: user.email, subject: 'Tu cuenta de El Calvario está lista', title: 'Bienvenido a El Calvario',
    text: `Hola, ${user.name || user.email}.\n\nLa administración ha creado tu cuenta en El Calvario.\n\n${details.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\nInicia sesión: ${link}\n\nQué puedes hacer en la plataforma:\n${capabilities.map(item => `- ${item}`).join('\n')}\n\nAl iniciar sesión, cambia tu contraseña desde Mi cuenta > Cambiar contraseña. Mantén estos datos en privado.\n\nTus permisos pueden cambiar si la administración actualiza tu rol. Si tienes dudas sobre tu vinculación, comunícate con quien creó tu cuenta.\n\nEl Calvario - Nexus Soporte`,
    body: `<p>Hola, <strong>${escapeHtml(user.name || user.email)}</strong>.</p><p>La administración ha creado tu cuenta. Estos son tus datos de acceso y vinculación:</p><table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;table-layout:fixed;background:#faf8f5;border-radius:10px">${rows}</table>${mailButton('Entrar a la plataforma', link)}<p><strong>Al iniciar sesión, cambia tu contraseña</strong> desde Mi cuenta → Cambiar contraseña. Mantén estos datos en privado.</p><h2 style="font-size:19px;margin-top:28px">Qué puedes hacer en la plataforma</h2><ul style="padding-left:20px">${capabilities.map(item => `<li style="margin-bottom:8px">${escapeHtml(item)}</li>`).join('')}</ul><p style="font-size:12px;color:#737b85">Los permisos corresponden a tu rol y alcance actuales; la administración puede actualizarlos. Si tienes dudas sobre tu vinculación, comunícate con quien creó tu cuenta.</p>`,
  }, configuration)
}

export async function sendAccountWelcome(user, password, context) {
  let configuration
  try { configuration = mailConfiguration() }
  catch { return 'not_configured' }
  try {
    const message = await welcomeMessage(user, password, context, configuration)
    await deliverEmail(message, configuration)
    return 'sent'
  } catch {
    // Credentials are used only for this first email; never persist or log them.
    console.error('No se pudo enviar el correo de bienvenida: WELCOME_EMAIL_FAILED')
    return 'failed'
  }
}
