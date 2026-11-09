import assert from 'node:assert/strict'

// Read the declared Excel table so assertions do not depend on decorative rows.
export function reportTable(sheet, name = 'DatosExportados') {
  const table = sheet.getTable(name)
  assert.ok(table, `Missing export table: ${name}`)
  const reference = table.table.tableRef
  const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(reference)
  assert.ok(match, `Invalid table range: ${reference}`)
  const first = Number(match[2]), last = Number(match[4])
  return { header: sheet.getRow(first).values, rows: Array.from({ length: last - first }, (_, index) => sheet.getRow(first + index + 1)), count: last - first }
}
