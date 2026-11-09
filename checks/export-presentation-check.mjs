import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'
import { PDFDocument } from 'pdf-lib'
import { sendReport, discipleColumns, discipleReportRows } from '../server/reports.js'
import { reportTable } from './report-table.mjs'

const output = '.backups/export-preview'
await mkdir(output, { recursive: true })
async function generate(type, format, rows, configuration = {}, filename = `${type}.${format}`) {
  const response = { headers: {}, set(key, value) { this.headers[key] = value; return this }, type(value) { this.mime = value; return this }, send(value) { this.bytes = value } }
  await sendReport(response, type, format, rows, configuration)
  assert.equal(response.headers['Content-Disposition'], `attachment; filename="${type}.${format}"`)
  assert.ok(response.bytes.length > 1000)
  await writeFile(`${output}/${filename}`, response.bytes)
  if (format === 'pdf') return PDFDocument.load(response.bytes)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(response.bytes)
  const sheet = workbook.worksheets[0], table = reportTable(sheet)
  assert.equal(table.count, rows.length, 'Decorative rows must not add or remove records')
  assert.ok(workbook.creator.includes('El Calvario'))
  assert.equal(sheet.getImages().length, 1, 'Church logo is embedded, without an external link')
  assert.equal(sheet.getTables()[0].table.columns.every(column => column.filterButton), true)
  assert.ok(sheet.views[0].ySplit >= 1)
  assert.ok(sheet.pageSetup.printArea)
  assert.ok(sheet.getCell(5, headersLength(sheet)).fill.fgColor, 'Brand accent covers the complete table width')
  return workbook
}

function headersLength(sheet) { return sheet.getTables()[0].table.columns.length }

const attendees = Array.from({ length: 75 }, (_, index) => ({ Actividad: 'Encuentro de ejemplo · El Calvario', Fecha: '2026-11-08', Tipo: 'culto', Discípulo: `Persona de ejemplo ${String(index + 1).padStart(3, '0')}`, Estado: ['presente', 'ausente', 'justificado', 'visitante'][index % 4], Metodo: 'manual' }))
const birthday = [{ Nombre: 'María José · Ejemplo', Cumpleanos: '02-29' }]
const groups = [{ Codigo: '00007', Grupo: 'Grupo de ejemplo', Direccion: 'Dirección de ejemplo para verificar el ajuste de texto sin recortes', Barrio: 'Barrio de ejemplo', Dia: 'Miércoles', Hora: '19:30', Estado: 'activo' }]
const member = { id_miembro: 7, nombres: 'Ana María', apellidos: 'Ejemplo', tipo_identificacion: 'CC', numero_identificacion: '00012345', celular: '03001234567', correo: 'ejemplo@example.invalid', fecha_nacimiento: '1990-03-05', grupo_sanguineo_rh: 'O+', eps: 'EPS de ejemplo', contacto_emergencia_nombre: 'Contacto de ejemplo', contacto_emergencia_celular: '03007654321', funcion_iglesia: 'Servicio de ejemplo', sede_nombre: 'El Calvario Villavicencio', rol_nombre: 'Discípulo', grupo_nombre: 'Grupo de ejemplo', cobertura_nombre: 'Responsable de ejemplo', libro_actual: 'Fundamentos', ministerios: 'Servidores, Multimedia', estado_miembro: 'activo', codigo_qr: 'QR-EJEMPLO-00007' }
for (const [type, rows] of [['asistencia', attendees], ['cumpleanos', birthday], ['grupos', groups]]) {
  const workbook = await generate(type, 'xlsx', rows)
  const table = reportTable(workbook.worksheets[0])
  if (type === 'grupos') assert.equal(table.rows[0].getCell(1).value, '00007')
  if (type === 'cumpleanos') assert.equal(table.rows[0].getCell(2).value, '02-29')
  const pdf = await generate(type, 'pdf', rows)
  assert.ok(pdf.getPageCount() >= 1)
  if (type === 'asistencia') assert.ok(pdf.getPageCount() >= 2, 'Attendance table continues across pages')
  else assert.equal(pdf.getPageCount(), 1, 'Short reports must not add blank footer pages')
}

const metadata = [['Evento', 'Encuentro de ejemplo'], ['Fecha', '2026-11-08'], ['Hora (Colombia)', '09:00'], ['Lugar', 'El Calvario · Villavicencio'], ['ID de actividad', 15], ['Registros guardados', 3]]
const attendanceConfiguration = { title: 'Registro de asistencia', columns: ['Discípulo', 'Estado', 'Método'], metadata }
const activityRows = attendees.slice(0, 3).map(row => ({ ...row, Método: row.Metodo }))
const event = await generate('asistencia', 'xlsx', activityRows, attendanceConfiguration, 'asistencia-evento.xlsx')
assert.deepEqual(reportTable(event.worksheets[0]).header.slice(1), attendanceConfiguration.columns)
assert.ok(event.getWorksheet('Evento').getColumn(2).values.includes('Encuentro de ejemplo'))
assert.equal(event.getWorksheet('Evento').getImages().length, 1)
assert.equal((await generate('asistencia', 'pdf', activityRows, attendanceConfiguration, 'asistencia-evento.pdf')).getPageCount(), 1)

const rows = discipleReportRows([member])
const full = await generate('discipulos', 'xlsx', rows, { title: 'Ficha del discípulo', columns: discipleColumns(true), profile: true })
const fullData = reportTable(full.worksheets[0])
assert.equal(fullData.rows[0].getCell(fullData.header.indexOf('Identificación')).value, '00012345')
assert.equal(fullData.rows[0].getCell(fullData.header.indexOf('Celular')).value, '03001234567')
const profile = full.getWorksheet('Ficha del discípulo')
assert.ok(profile && profile.getImages().length === 1)
assert.equal(full.views[0].activeTab, full.worksheets.indexOf(profile))
assert.ok(profile.getColumn(2).values.includes('Fundamentos'))
const restricted = await generate('discipulos', 'xlsx', rows, { title: 'Ficha del discípulo', columns: discipleColumns(false), profile: true }, 'discipulos-sin-datos-sensibles.xlsx')
const contents = JSON.stringify(restricted.worksheets.map(sheet => sheet.getSheetValues()))
for (const value of ['EPS de ejemplo', '03007654321', 'Contacto de ejemplo']) assert.equal(contents.includes(value), false, 'Sensitive fields must also be absent from the profile sheet')

const formula = await generate('grupos', 'xlsx', [{ ...groups[0], Grupo: '=HYPERLINK("https://example.invalid")' }], {}, 'texto-seguro.xlsx')
assert.equal(reportTable(formula.worksheets[0]).rows[0].getCell(2).type, ExcelJS.ValueType.String)
const empty = await generate('asistencia', 'xlsx', [], attendanceConfiguration, 'asistencia-vacia.xlsx')
assert.equal(reportTable(empty.worksheets[0]).count, 0)
assert.ok(JSON.stringify(empty.worksheets[0].getSheetValues()).includes('Sin registros'))
assert.equal((await generate('asistencia', 'pdf', [], attendanceConfiguration, 'asistencia-vacia.pdf')).getPageCount(), 1)
const longText = 'Texto largo de ejemplo que debe continuar sin perder contenido. '.repeat(150)
const longPdf = await generate('grupos', 'pdf', [{ ...groups[0], Direccion: longText + 'FIN-CONTENIDO-LARGO' }], {}, 'texto-largo.pdf')
assert.ok(longPdf.getPageCount() > 1, 'Oversized cells continue across pages')
console.log('PASS exports: all report formats, embedded logos, filterable tables, event context, individual profile, preserved zeros, permission-limited fields, literal formula text, empty results and multi-page PDFs. Examples: .backups/export-preview/')
