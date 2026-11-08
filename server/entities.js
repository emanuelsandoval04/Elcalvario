// Entidades y validaciones compartidas por la API. No hay un ORM en este proyecto.
export function invalid(message, status = 400) { return Object.assign(new Error(message), { status }) }
export function identifier(value, optional = false) {
  if (optional && (value === null || value === undefined || value === '')) return null
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id < 1) throw invalid('Identificador inválido.')
  return id
}
export function text(value, max, required = false) {
  if (value === null || value === undefined || value === '') {
    if (required) throw invalid('Completa los campos obligatorios.')
    return null
  }
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw invalid(`Texto inválido (máximo ${max} caracteres).`)
  return value.trim() || null
}
export function choice(value, options) {
  if (!options.includes(value)) throw invalid(`Selecciona un valor válido: ${options.join(', ')}.`)
  return value
}
export function boolean(value) {
  if (![true, false, 0, 1].includes(value)) throw invalid('Valor booleano inválido.')
  return Number(value)
}
export function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value || value < '1000-01-01') throw invalid('Fecha inválida.')
  return value
}
export function time(value, optional = false) {
  if (optional && !value) return null
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) throw invalid('Hora inválida.')
  return value
}
export function phone(value, required = false) {
  const result = text(value, 20, required)
  if (result && (!/^[+\d ()-]+$/.test(result) || result.replace(/\D/g, '').length < 7)) throw invalid('Celular inválido: mínimo siete dígitos.')
  return result
}
export function url(value) {
  const result = text(value, 500)
  if (!result) return null
  try { if (new URL(result).protocol === 'https:') return result } catch { /* handled below */ }
  throw invalid('Usa una URL HTTPS válida.')
}
const optionalId = value => identifier(value, true)
export const sensitiveMemberFields = ['grupo_sanguineo_rh','eps','contacto_emergencia_nombre','contacto_emergencia_celular']
export const memberFields = {
  nombres: v => text(v,100,true), apellidos: v => text(v,100),
  tipo_identificacion: v => text(v,30,true), numero_identificacion: v => text(v,30,true),
  celular: v => phone(v,true), correo: v => {
    const result = text(v,120)
    if (result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw invalid('Correo inválido.')
    return result
  },
  fecha_nacimiento: v => { const result=date(v); if(result>bogotaToday()) throw invalid('La fecha de nacimiento no puede estar en el futuro.'); return result },
  grupo_sanguineo_rh: v => v ? choice(v,['A+','A-','B+','B-','AB+','AB-','O+','O-']) : null,
  eps: v => text(v,100), contacto_emergencia_nombre: v => text(v,150), contacto_emergencia_celular: v => phone(v),
  funcion_iglesia: v => text(v,150), id_sede: optionalId, id_rol_eclesiastico: optionalId,
  id_grupo: optionalId, id_cobertura_pastoral: optionalId, id_libro: optionalId,
}
export const groupFields = {
  codigo_grupo: v => text(v,30,true), nombre: v => text(v,150,true), id_discipulador: optionalId,
  id_zona: optionalId, id_grupo_origen: optionalId, direccion: v => text(v,200), barrio: v => text(v,10000),
  latitud: v => coordinate(v,90), longitud: v => coordinate(v,180),
  dia_reunion: v => v ? choice(v,['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']) : null,
  hora_reunion: v => time(v,true), estado_grupo: v => choice(v,['activo','inactivo']),
}
function coordinate(value, limit) {
  if (value === '' || value == null) return null
  const n = Number(value)
  if (!Number.isFinite(n) || Math.abs(n)>limit) throw invalid('Coordenada inválida.')
  return n
}
export const activityFields = {
  titulo: v => text(v,150,true), fecha: date, hora: time, lugar: v => text(v,200,true),
  imagen: v => typeof v === 'string' && /^\/[a-zA-Z0-9_./-]+$/.test(v) && !v.startsWith('//') ? text(v,500) : url(v),
  descripcion: v => text(v,10000), estado_actividad: v => choice(v,['programada','cancelada']),
}
export function fields(body, definition, create = false, allowEmpty = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('Solicitud inválida.')
  const result = {}
  for (const [key, validate] of Object.entries(definition)) if (create || Object.hasOwn(body,key)) {
    try { result[key] = validate(body[key]) } catch (error) { throw Object.assign(invalid(`${key}: ${error.message}`),{fieldErrors:{[key]:error.message}}) }
  }
  if (!allowEmpty && !Object.keys(result).length) throw invalid('No hay cambios para guardar.')
  return result
}
export function bogotaToday() {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
}
