import { pool } from './db.js'
import { identifier, invalid } from './entities.js'

export const canManageTraining = user => user?.state === 'activo' && Boolean(user.permissions['gestion.acceder']) && Boolean(user.permissions['adiestramiento.gestionar']) && user.roles.some(role => !['Usuario', 'Discípulo', 'Discipulo'].includes(role))

export function requireTraining(req, _res, next) {
  if (!canManageTraining(req.authUser)) throw invalid('Tu cuenta no puede gestionar libros de adiestramiento.', 403)
  next()
}

// Disciples who have the book, as their main book or as one of their other books.
export const bookAssignmentsSql = alias => `(SELECT COUNT(*) FROM miembro m WHERE m.id_libro=${alias}.id_libro OR EXISTS(SELECT 1 FROM miembro_libro_adicional x WHERE x.id_miembro=m.id_miembro AND x.id_libro=${alias}.id_libro))`
// Additional books of a disciple, in order, as "3,8,5" (the main book is miembro.id_libro).
export const additionalBooksSql = alias => `(SELECT GROUP_CONCAT(x.id_libro ORDER BY x.posicion SEPARATOR ',') FROM miembro_libro_adicional x WHERE x.id_miembro=${alias}.id_miembro)`
// Every book name of a disciple, main book first.
export const allBookNamesSql = alias => `CONCAT_WS(', ',(SELECT l.nombre FROM libro_adiestramiento l WHERE l.id_libro=${alias}.id_libro),(SELECT GROUP_CONCAT(l.nombre ORDER BY x.posicion SEPARATOR ', ') FROM miembro_libro_adicional x JOIN libro_adiestramiento l ON l.id_libro=x.id_libro WHERE x.id_miembro=${alias}.id_miembro))`

export async function trainingBooks(connection = pool) {
  const [rows] = await connection.execute(`SELECT l.id_libro,l.nombre,l.descripcion,l.fecha_creacion,${bookAssignmentsSql('l')} AS asignaciones FROM libro_adiestramiento l ORDER BY l.nombre,l.id_libro`)
  return rows
}

export async function trainingBook(connection, value, lock = false) {
  const [rows] = await connection.execute(`SELECT id_libro,nombre,descripcion FROM libro_adiestramiento WHERE id_libro=? ${lock ? 'FOR UPDATE' : ''}`, [identifier(value)])
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
  const [rows] = await connection.execute('SELECT id_libro FROM miembro_libro_adicional WHERE id_miembro=? ORDER BY posicion', [member.id_miembro])
  return [member.id_libro, ...rows.map(row => row.id_libro)].filter(Boolean)
}

// Ordered list of books from the request: the first one is the main book.
export function bookList(value) {
  if (!Array.isArray(value) || value.length > 20) throw invalid('Puedes asignar hasta 20 libros a la vez.')
  const ids = value.map(item => identifier(item))
  if (new Set(ids).size !== ids.length) throw invalid('Cada libro solo se puede seleccionar una vez.')
  return ids
}

export async function saveMemberBooks(connection, memberId, ids) {
  for (const id of ids) await validateTrainingBook(connection, id, true)
  if (!ids.length) await validateTrainingBook(connection, null, true)
  await connection.execute('DELETE FROM miembro_libro_adicional WHERE id_miembro=?', [memberId])
  for (const [index, id] of ids.slice(1).entries()) await connection.execute('INSERT INTO miembro_libro_adicional(id_miembro,id_libro,posicion) VALUES (?,?,?)', [memberId, id, index + 1])
  return ids[0] || null
}

// After the main book changes elsewhere (general edit), keep the additional list consistent.
export async function tidyMemberBooks(connection, memberId, mainBook) {
  if (mainBook) { await connection.execute('DELETE FROM miembro_libro_adicional WHERE id_miembro=? AND id_libro=?', [memberId, mainBook]); return mainBook }
  const [rows] = await connection.execute('SELECT id_libro FROM miembro_libro_adicional WHERE id_miembro=? ORDER BY posicion LIMIT 1', [memberId])
  if (!rows.length) return null
  await connection.execute('DELETE FROM miembro_libro_adicional WHERE id_miembro=? AND id_libro=?', [memberId, rows[0].id_libro])
  return rows[0].id_libro
}
