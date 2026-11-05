import { pool } from './db.js'
import { identifier, invalid } from './entities.js'

export const canManageTraining = user => user?.state === 'activo' && Boolean(user.permissions['gestion.acceder']) && Boolean(user.permissions['adiestramiento.gestionar']) && user.roles.some(role => !['Usuario', 'Discípulo', 'Discipulo'].includes(role))

export function requireTraining(req, _res, next) {
  if (!canManageTraining(req.authUser)) throw invalid('Tu cuenta no puede gestionar libros de adiestramiento.', 403)
  next()
}

export async function trainingBooks(connection = pool) {
  const [rows] = await connection.execute('SELECT l.id_libro,l.nombre,l.descripcion,l.fecha_creacion,(SELECT COUNT(*) FROM miembro m WHERE m.id_libro=l.id_libro) AS asignaciones FROM libro_adiestramiento l ORDER BY l.nombre,l.id_libro')
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
