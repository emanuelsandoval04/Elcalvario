import ExcelJS from 'exceljs'
import { fileURLToPath } from 'node:url'

export const churchName = 'Misión Cristiana El Calvario Villavicencio'
export const reportLogoPath = fileURLToPath(new URL('./mail-assets/el-calvario-report.png', import.meta.url))
export const exportColors = { ink: '172E49', muted: '65758A', accent: 'E96527', pale: 'F3F6FA', line: 'DDE5EE', white: 'FFFFFF' }
const imageIds = new WeakMap()
export const colombiaTimestamp = date => new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(date)
export const exportLabel = label => ({ Codigo: 'Código', Direccion: 'Dirección', Dia: 'Día', Metodo: 'Método', Cumpleanos: 'Cumpleaños' })[label] || label
const normalized = value => String(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const fill = color => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } })

export function exportColumnWidth(label) {
  const key = normalized(label)
  if (key === 'id') return 10
  if (/^(codigo|tipo|estado|metodo|dia|hora)/.test(key) && !/identificacion|qr/.test(key)) return key === 'estado' ? 29 : 20
  if (/correo|direccion|ministerios|cobertura|detalle|instruccion/.test(key)) return 42
  if (/nombre|discipulo|actividad|grupo|libro|funcion|contacto/.test(key)) return 34
  if (/fecha|cumpleanos|identificacion|celular/.test(key)) return 25
  return 26
}

export function createExportWorkbook(now = new Date()) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = churchName
  workbook.lastModifiedBy = 'El Calvario · Nexus Corp'
  workbook.created = now
  workbook.modified = now
  workbook.company = churchName
  workbook.views = [{ activeTab: 0, firstSheet: 0, visibility: 'visible' }]
  return workbook
}

export function setupExportSheet(sheet, columns, { headerRow = 7, freezeColumns = 1 } = {}) {
  sheet.columns = columns.map(label => ({ width: exportColumnWidth(label), style: { font: { name: 'Calibri', size: 11, color: { argb: `FF${exportColors.ink}` } }, numFmt: '@', alignment: { vertical: 'middle', wrapText: true } } }))
  if (columns.length <= 3) sheet.getColumn(1).width = Math.max(31, sheet.getColumn(1).width)
  sheet.properties.tabColor = { argb: `FF${exportColors.accent}` }
  sheet.views = [{ state: 'frozen', ySplit: headerRow, xSplit: freezeColumns, showGridLines: false, zoomScale: 90 }]
  sheet.pageSetup = {
    paperSize: 9, orientation: columns.length > 4 ? 'landscape' : 'portrait',
    fitToPage: true, fitToWidth: columns.length > 10 ? 3 : 1, fitToHeight: 0,
    horizontalCentered: true, printTitlesRow: `1:${headerRow}`,
    margins: { left: .3, right: .3, top: .45, bottom: .5, header: .2, footer: .25 },
  }
  if (columns.length > 10) sheet.pageSetup.printTitlesColumn = 'A:B'
  sheet.headerFooter.oddFooter = '&L&"Calibri"&8El Calvario · Uso interno&CGenerado en Colombia&RPágina &P de &N'
}

export function addExportHeading(workbook, sheet, { title, subtitle = 'Uso interno · Comparte este archivo únicamente con personas autorizadas.', count, now = new Date() }) {
  const end = Math.max(2, sheet.columns.length)
  const textStart = end >= 4 ? 3 : 2
  if (!imageIds.has(workbook)) imageIds.set(workbook, workbook.addImage({ filename: reportLogoPath, extension: 'png' }))
  sheet.addImage(imageIds.get(workbook), { tl: { col: .12, row: .2 }, ext: { width: 170, height: 70 }, editAs: 'absolute' })
  sheet.mergeCells(1, textStart, 2, end)
  const heading = sheet.getCell(1, textStart)
  heading.value = title
  heading.font = { name: 'Calibri', size: 18, bold: true, color: { argb: `FF${exportColors.ink}` } }
  heading.alignment = { vertical: 'middle', wrapText: true }
  sheet.mergeCells(3, textStart, 3, end)
  sheet.getCell(3, textStart).value = churchName
  sheet.getCell(3, textStart).font = { name: 'Calibri', size: 10, color: { argb: `FF${exportColors.muted}` } }
  sheet.getCell(3, textStart).alignment = { vertical: 'middle', wrapText: true }
  sheet.mergeCells(4, 1, 4, end)
  sheet.getCell(4, 1).value = `Generado: ${colombiaTimestamp(now)} (Colombia)${count === undefined ? '' : `   ·   ${count} ${count === 1 ? 'registro' : 'registros'}`}`
  sheet.getCell(4, 1).font = { name: 'Calibri', size: 10, color: { argb: `FF${exportColors.muted}` } }
  for (let col = 1; col <= end; col++) sheet.getCell(5, col).fill = fill(exportColors.accent)
  sheet.mergeCells(6, 1, 6, end)
  sheet.getCell(6, 1).value = subtitle
  sheet.getCell(6, 1).font = { name: 'Calibri', size: 10, italic: true, color: { argb: `FF${exportColors.muted}` } }
  sheet.getCell(6, 1).alignment = { vertical: 'middle', wrapText: true }
  ;[26, 22, 24, 24, 3, 30].forEach((height, index) => { sheet.getRow(index + 1).height = height })
}

export function styleExportRows(sheet, headerRow, lastRow, count = sheet.columnCount) {
  const heading = sheet.getRow(headerRow)
  heading.height = 34
  for (let col = 1; col <= count; col++) {
    const cell = heading.getCell(col)
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = fill(exportColors.ink)
    cell.alignment = { vertical: 'middle', wrapText: true, indent: 1 }
  }
  for (let index = headerRow + 1; index <= lastRow; index++) {
    const row = sheet.getRow(index)
    let lines = 1
    for (let col = 1; col <= count; col++) {
      const cell = row.getCell(col)
      cell.font = { name: 'Calibri', size: 11, color: { argb: `FF${exportColors.ink}` } }
      cell.fill = fill(index % 2 === headerRow % 2 ? exportColors.pale : exportColors.white)
      cell.alignment = { vertical: 'middle', wrapText: true, indent: 1 }
      cell.border = { bottom: { style: 'hair', color: { argb: `FF${exportColors.line}` } } }
      cell.numFmt = typeof cell.value === 'number' ? '0' : '@'
      lines = Math.max(lines, ...String(cell.value ?? '').split('\n').map(line => Math.ceil(line.length / Math.max(8, sheet.getColumn(col).width - 4))))
    }
    row.height = Math.min(409, Math.max(28, lines * 15 + 10))
  }
}

export function addExportTable(workbook, sheet, { title, headers, rows, tableName = 'DatosExportados', subtitle, now }) {
  setupExportSheet(sheet, headers, { freezeColumns: headers.length > 10 ? 2 : 1 })
  addExportHeading(workbook, sheet, { title, subtitle, count: rows.length, now })
  const values = rows.map(row => headers.map(key => row[key] == null ? '' : String(row[key])))
  sheet.addTable({ name: tableName, ref: 'A7', headerRow: true, totalsRow: false, style: { theme: 'TableStyleMedium2', showRowStripes: true }, columns: headers.map(key => ({ name: exportLabel(key), filterButton: true })), rows: values })
  styleExportRows(sheet, 7, 7 + rows.length, headers.length)
  if (!rows.length) {
    sheet.mergeCells(9, 1, 9, headers.length)
    sheet.getCell('A9').value = 'Sin registros para los filtros seleccionados.'
    sheet.getCell('A9').font = { name: 'Calibri', size: 11, italic: true, color: { argb: `FF${exportColors.muted}` } }
    sheet.getRow(9).height = 30
  }
  sheet.pageSetup.printArea = `A1:${sheet.getColumn(headers.length).letter}${Math.max(9, 7 + rows.length)}`
}

export function addDiscipleProfile(workbook, row, headers, now) {
  const sheet = workbook.addWorksheet('Ficha del discípulo')
  setupExportSheet(sheet, ['Campo', 'Detalle'], { freezeColumns: 0 })
  sheet.getColumn(1).width = 31
  sheet.getColumn(2).width = 72
  addExportHeading(workbook, sheet, { title: 'Ficha del discípulo', subtitle: `${row.Nombres || ''} ${row.Apellidos || ''}`.trim(), now })
  const sections = [
    ['Identificación y datos personales', ['ID', 'Nombres', 'Apellidos', 'Tipo de identificación', 'Identificación', 'Fecha de nacimiento']],
    ['Contacto y emergencia', ['Celular', 'Correo', 'Grupo sanguíneo / RH', 'EPS', 'Contacto de emergencia', 'Celular de emergencia']],
    ['Vida en comunidad', ['Sede', 'Rol eclesiástico', 'Grupo de Comunión', 'Cobertura pastoral', 'Función en la iglesia', 'Libro de adiestramiento', 'Ministerios', 'Estado']],
    ['Información del registro', ['Código QR', 'Fecha de creación', 'Fecha de actualización']],
  ]
  let index = 7
  for (const [title, labels] of sections) {
    const visible = labels.filter(label => headers.includes(label))
    if (!visible.length) continue
    if (title === 'Vida en comunidad') sheet.getRow(index - 1).addPageBreak()
    sheet.mergeCells(index, 1, index, 2)
    sheet.getCell(index, 1).value = title
    styleExportRows(sheet, index, index + visible.length, 2)
    index++
    for (const label of visible) {
      sheet.getCell(index, 1).value = label
      sheet.getCell(index, 1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: `FF${exportColors.ink}` } }
      sheet.getCell(index, 2).value = row[label] === '' || row[label] == null ? 'Sin registrar' : String(row[label])
      const lines = Math.max(Math.ceil(label.length / 27), Math.ceil(String(sheet.getCell(index, 2).value).length / 65))
      sheet.getRow(index).height = Math.min(409, Math.max(28, lines * 15 + 10))
      index++
    }
    sheet.getRow(index++).height = 10
  }
  sheet.pageSetup.printTitlesRow = '1:6'
  sheet.pageSetup.printArea = `A1:B${index - 1}`
  workbook.views[0].activeTab = workbook.worksheets.indexOf(sheet)
  return sheet
}
