import { createHash } from 'node:crypto'

export const maxPhotoBytes = 256 * 1024
const photoError = (message = 'Selecciona una foto JPG, PNG o WebP válida.', status = 400) => Object.assign(new Error(message), { status })

// The browser normalizes uploads to a small JPEG. Never accept URLs, SVG or HTML.
export function parseProfilePhoto(value) {
  if (value == null || value === '') return null
  if (typeof value !== 'string') throw photoError()
  const prefix = 'data:image/jpeg;base64,'
  if (value.length > prefix.length + Math.ceil(maxPhotoBytes / 3) * 4) throw photoError('La foto preparada supera el tamaño permitido. Elige otra imagen.', 413)
  if (!value.startsWith(prefix)) throw photoError()
  const encoded = value.slice(prefix.length)
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw photoError()
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.toString('base64') !== encoded || bytes.length < 32 || bytes.length > maxPhotoBytes || bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) throw photoError()
  let offset = 2, dimensions = false, scan = false
  while (offset + 3 < bytes.length - 2) {
    if (bytes[offset++] !== 0xff) throw photoError()
    while (bytes[offset] === 0xff) offset++
    const marker = bytes[offset++]
    if (offset + 2 > bytes.length) throw photoError()
    const length = bytes.readUInt16BE(offset)
    if (length < 2 || offset + length > bytes.length - 2) throw photoError()
    if (marker === 0xc0 || marker === 0xc2) {
      if (length < 8) throw photoError()
      const height = bytes.readUInt16BE(offset + 3), width = bytes.readUInt16BE(offset + 5)
      if (!width || !height || width > 512 || height > 512 || bytes[offset + 2] !== 8) throw photoError('La foto debe prepararse desde el selector de la aplicación.')
      dimensions = true
    }
    if (marker === 0xda) { scan = true; break }
    offset += length
  }
  if (!dimensions || !scan) throw photoError()
  return { bytes, version: createHash('sha256').update(bytes).digest('hex') }
}

export async function saveProfilePhoto(connection, id, photo) {
  if (!photo) return connection.execute('DELETE FROM foto_perfil_usuario WHERE id_usuario=?', [id])
  return connection.execute('INSERT INTO foto_perfil_usuario(id_usuario,contenido,version) VALUES (?,?,?) ON DUPLICATE KEY UPDATE contenido=?,version=?', [id, photo.bytes, photo.version, photo.bytes, photo.version])
}
