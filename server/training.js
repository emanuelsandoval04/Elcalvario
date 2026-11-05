import { pool } from './db.js'
import { identifier, invalid } from './entities.js'

export const canManageTraining = user => user?.state === 'activo' && Boolean(user.permissions['gestion.acceder']) && Boolean(user.permissions['adiestramiento.gestionar']) && user.roles.some(role => !['Usuario', 'Discípulo', 'Discipulo'].includes(role))

export function requireTraining(req, _res, next) {
  if (!canManageTraining(req.authUser)) throw invalid('Tu cuenta no puede crear ni asignar libros de adiestramiento.', 403)
  next()
}

export async function trainingBooks(connection = pool) {
  const [rows] = await connection.execute('SELECT id_libro,nombre,descripcion,fecha_creacion FROM libro_adiestramiento ORDER BY nombre,id_libro')
  return rows
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
