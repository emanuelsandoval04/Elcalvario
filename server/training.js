import { pool } from './db.js'
import { identifier, invalid } from './entities.js'

export const canManageTraining = user => user?.state === 'activo' && Boolean(user.permissions['gestion.acceder']) && Boolean(user.permissions['adiestramiento.gestionar']) && user.roles.some(role => !['Usuario', 'Discípulo', 'Discipulo'].includes(role))

export function requireTraining(req, _res, next) {
  if (!canManageTraining(req.authUser)) throw invalid('Tu cuenta no puede gestionar libros de adiestramiento.', 403)
  next()
}

// Each disciple has one training book (miembro.id_libro); a new assignment replaces the previous one.
export const bookAssignmentsSql = alias => `(SELECT COUNT(*) FROM miembro m WHERE m.id_libro=${alias}.id_libro)`
export const allBookNamesSql = alias => `(SELECT l.nombre FROM libro_adiestramiento l WHERE l.id_libro=${alias}.id_libro)`
// Each book has a color that also marks its disciples (#rrggbb).
export const bookPalette = ['#e4572e', '#2e86ab', '#3bb273', '#9b5de5', '#f4a259', '#d1495b', '#00a6a6', '#7a6c5d', '#c2185b', '#5c6bc0', '#8bc34a', '#ff8f00']
export function bookColor(value, required = false) {
  if ((value === undefined || value === null || value === '') && !required) return null
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) throw invalid('Elige un color válido para el libro.')
  return value.toLowerCase()
}
// A color not used yet by another book (or the least used one).
export async function nextBookColor(connection) {
  const [rows] = await connection.execute('SELECT LOWER(color) AS color,COUNT(*) AS total FROM libro_adiestramiento WHERE color IS NOT NULL GROUP BY LOWER(color)')
  const used = new Map(rows.map(row => [row.color, Number(row.total)]))
  return [...bookPalette].sort((x, y) => (used.get(x) || 0) - (used.get(y) || 0))[0]
}

export async function trainingBooks(connection = pool) {
  const [rows] = await connection.execute(`SELECT l.id_libro,l.nombre,l.descripcion,l.color,l.fecha_creacion,${bookAssignmentsSql('l')} AS asignaciones FROM libro_adiestramiento l ORDER BY l.nombre,l.id_libro`)
  return rows
}

export async function trainingBook(connection, value, lock = false) {
  const [rows] = await connection.execute(`SELECT id_libro,nombre,descripcion,color FROM libro_adiestramiento WHERE id_libro=? ${lock ? 'FOR UPDATE' : ''}`, [identifier(value)])
  if (!rows.length) throw invalid('Libro de adiestramiento no disponible.', 404)
  return rows[0]
}

export function checkBookVersion(body, book) {
  if (Object.hasOwn(body || {}, 'expectedName') && body.expectedName !== book.nombre || Object.hasOwn(body || {}, 'expectedDescription') && body.expectedDescription !== book.descripcion) {
    throw invalid('Otro usuario actualizó este libro. Vuelve a abrirlo antes de guardar o eliminar.', 409)
  }
}

export async function validateTrainingBook(connection, value, required = false) {
  const id = identifier(value, true)
  if (id) {
    const [books] = await connection.execute('SELECT id_libro FROM libro_adiestramiento WHERE id_libro=? FOR SHARE', [id])
    if (!books.length) throw invalid('El libro seleccionado no está disponible. Actualiza el catálogo.')
  } else if (required) {
    const [books] = await connection.execute('SELECT id_libro FROM libro_adiestramiento LIMIT 1')
    if (books.length) throw invalid('Selecciona el libro de adiestramiento del discípulo.')
  }
  return id
}


export async function memberBookIds(connection, member) {
  return [member.id_libro].filter(Boolean)
}

// The request may still send a list: one book at most.
export function bookList(value) {
  if (!Array.isArray(value) || value.length > 1) throw invalid('Cada discípulo tiene un solo libro de adiestramiento.')
  return value.map(item => identifier(item))
}

export async function saveMemberBooks(connection, memberId, ids) {
  if (ids.length > 1) throw invalid('Cada discípulo tiene un solo libro de adiestramiento.')
  const book = await validateTrainingBook(connection, ids[0] ?? null, true)
  await connection.execute('DELETE FROM miembro_libro_adicional WHERE id_miembro=?', [memberId])
  return book
}

// The main book changed elsewhere (general edit): no other books are kept.
export async function tidyMemberBooks(connection, memberId, mainBook) {
  await connection.execute('DELETE FROM miembro_libro_adicional WHERE id_miembro=?', [memberId])
  return mainBook || null
}
