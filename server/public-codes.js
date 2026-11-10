// Visible identifiers: disciples 0101, 0102... and accounts ADM-0001, ADM-0002...
// Numbers come from secuencia_codigo (migration 024) and are never reused.
export const memberCode = value => value == null ? null : String(value).padStart(4, '0')
export const memberCodeSql = alias => `IF(${alias}.codigo_miembro IS NULL,'',IF(${alias}.codigo_miembro<10000,LPAD(${alias}.codigo_miembro,4,'0'),CAST(${alias}.codigo_miembro AS CHAR)))`
export const accountCode = value => value == null ? null : `ADM-${String(value).padStart(4, '0')}`

// Must run inside the caller's transaction: the row lock serializes concurrent registrations.
export async function reserveCodes(connection, sequence, count = 1) {
  if (!['miembro', 'usuario'].includes(sequence) || !Number.isSafeInteger(count) || count < 1) throw new Error('Secuencia de códigos inválida.')
  const [rows] = await connection.execute('SELECT ultimo FROM secuencia_codigo WHERE nombre=? FOR UPDATE', [sequence])
  if (!rows.length) throw Object.assign(new Error('Falta aplicar la migración 024 de códigos (npm run db:migrate).'), { status: 503 })
  const first = Number(rows[0].ultimo) + 1
  await connection.execute('UPDATE secuencia_codigo SET ultimo=? WHERE nombre=?', [first + count - 1, sequence])
  return Array.from({ length: count }, (_, index) => first + index)
}
export const reserveCode = async (connection, sequence) => (await reserveCodes(connection, sequence))[0]

// Accepts "0105", "105", "ADM-0003", "adm3"; returns the stored number or null.
export function parseMemberCode(value) {
  const match = String(value || '').trim().match(/^0*(\d{1,9})$/)
  return match ? Number(match[1]) : null
}
export function parseAccountCode(value) {
  const match = String(value || '').trim().match(/^adm-?0*(\d{1,9})$/i)
  return match ? Number(match[1]) : null
}
