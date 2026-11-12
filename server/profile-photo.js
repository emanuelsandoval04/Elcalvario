import { createHash } from 'node:crypto'

export const maxPhotoBytes = 256 * 1024
const photoError = (message = 'Selecciona una foto JPG, PNG o WebP válida.', status = 400) => Object.assign(new Error(message), { status })

// Validates a JPEG produced by the browser canvas: baseline/progressive 8-bit, bounded size
// and dimensions. Never accepts URLs, SVG or HTML. Shared by profile photos and event images.
export function parseJpegDataUrl(value, { maxBytes, maxSide, error, tooLarge, foreign }) {
  if (typeof value !== 'string') throw error()
  const prefix = 'data:image/jpeg;base64,'
  if (value.length > prefix.length + Math.ceil(maxBytes / 3) * 4) throw tooLarge()
  if (!value.startsWith(prefix)) throw error()
  const encoded = value.slice(prefix.length)
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw error()
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.toString('base64') !== encoded || bytes.length < 32 || bytes.length > maxBytes || bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) throw error()
  let offset = 2, width = 0, height = 0, scan = false
  while (offset + 3 < bytes.length - 2) {
    if (bytes[offset++] !== 0xff) throw error()
    while (bytes[offset] === 0xff) offset++
    const marker = bytes[offset++]
    if (offset + 2 > bytes.length) throw error()
    const length = bytes.readUInt16BE(offset)
    if (length < 2 || offset + length > bytes.length - 2) throw error()
    if (marker === 0xc0 || marker === 0xc2) {
      if (length < 8) throw error()
      height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5)
      if (!width || !height || width > maxSide || height > maxSide || bytes[offset + 2] !== 8) throw foreign()
    }
    if (marker === 0xda) { scan = true; break }
    offset += length
  }
  if (!width || !scan) throw error()
  return { bytes, version: createHash('sha256').update(bytes).digest('hex'), width, height }
}

export function parseProfilePhoto(value) {
  if (value == null || value === '') return null
  return parseJpegDataUrl(value, {
    maxBytes: maxPhotoBytes, maxSide: 512, error: () => photoError(),
    tooLarge: () => photoError('La foto preparada supera el tamaño permitido. Elige otra imagen.', 413),
    foreign: () => photoError('La foto debe prepararse desde el selector de la aplicación.'),
  })
}

export async function saveProfilePhoto(connection, id, photo) {
  if (!photo) return connection.execute('DELETE FROM foto_perfil_usuario WHERE id_usuario=?', [id])
  return connection.execute('INSERT INTO foto_perfil_usuario(id_usuario,contenido,version) VALUES (?,?,?) ON DUPLICATE KEY UPDATE contenido=?,version=?', [id, photo.bytes, photo.version, photo.bytes, photo.version])
}
