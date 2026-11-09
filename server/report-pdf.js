import PDFDocument from 'pdfkit'
import { churchName, reportLogoPath, exportColors as colors, exportLabel, exportColumnWidth, colombiaTimestamp } from './export-presentation.js'

function wrapCell(document, value, width) {
  const lines = []
  for (const paragraph of String(value ?? '').split(/\r?\n/)) {
    let line = ''
    for (const word of paragraph.match(/\S+/g) || []) {
      if (line && document.widthOfString(`${line} ${word}`) <= width) { line += ` ${word}`; continue }
      if (line) { lines.push(line); line = '' }
      for (const character of word) {
        if (line && document.widthOfString(line + character) > width) { lines.push(line); line = '' }
        line += character
      }
    }
    lines.push(line)
  }
  return lines.length ? lines : ['']
}

export async function createReportPdf({ title, headers, rows, metadata = [], now = new Date() }) {
  const document = new PDFDocument({ size: 'A4', layout: headers.length > 4 ? 'landscape' : 'portrait', margin: 36, bufferPages: true, info: { Title: title, Author: churchName, Subject: 'Reporte de uso interno', Creator: 'El Calvario · Nexus Corp', CreationDate: now } })
  const chunks = []
  const complete = new Promise((resolve, reject) => { document.on('data', chunk => chunks.push(chunk)); document.on('end', () => resolve(Buffer.concat(chunks))); document.on('error', reject) })
  const margin = 36, bodyWidth = document.page.width - margin * 2, bottom = document.page.height - 54
  const weights = headers.map(exportColumnWidth), total = weights.reduce((sum, weight) => sum + weight, 0)
  const widths = weights.map(weight => weight / total * bodyWidth)
  const lineHeight = 13

  function brandPage() {
    document.image(reportLogoPath, margin, 26, { fit: [138, 57] })
    document.font('Helvetica-Bold').fontSize(19).fillColor(`#${colors.ink}`).text(title, margin + 158, 30, { width: bodyWidth - 158, height: 48 })
    document.font('Helvetica').fontSize(8).fillColor(`#${colors.muted}`).text(churchName, margin + 158, 78, { width: bodyWidth - 158 })
    document.fontSize(8).text(`Generado: ${colombiaTimestamp(now)} (Colombia)`, margin, 98, { width: bodyWidth - 120, lineBreak: false })
    document.text(`${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}`, margin + bodyWidth - 120, 98, { width: 120, align: 'right', lineBreak: false })
    document.moveTo(margin, 114).lineTo(margin + bodyWidth, 114).lineWidth(2).strokeColor(`#${colors.accent}`).stroke()
    document.y = 128
  }

  function tableHeader() {
    document.font('Helvetica-Bold').fontSize(9)
    const labels = headers.map((header, index) => wrapCell(document, exportLabel(header), widths[index] - 16))
    const height = Math.max(32, ...labels.map(lines => lines.length * lineHeight + 14))
    const top = document.y
    document.rect(margin, top, bodyWidth, height).fill(`#${colors.ink}`)
    let left = margin
    labels.forEach((lines, index) => {
      document.fillColor('#FFFFFF').text(lines.join('\n'), left + 8, top + 7, { width: widths[index] - 16, height: height - 12, lineGap: 2 })
      left += widths[index]
    })
    document.y = top + height
  }

  brandPage()
  // Metadata is kept complete and can continue onto another page when necessary.
  for (const [label, value] of metadata) {
    document.font('Helvetica').fontSize(9)
    const lines = wrapCell(document, `${label}: ${value ?? ''}`, bodyWidth - 20)
    for (let offset = 0; offset < lines.length;) {
      if (document.y + 36 > bottom) { document.addPage(); brandPage() }
      const count = Math.min(lines.length - offset, Math.max(1, Math.floor((bottom - document.y - 18) / lineHeight)))
      const height = count * lineHeight + 12, top = document.y
      document.rect(margin, top, bodyWidth, height).fill(`#${colors.pale}`)
      document.font('Helvetica').fontSize(9).fillColor(`#${colors.ink}`).text(lines.slice(offset, offset + count).join('\n'), margin + 10, top + 6, { width: bodyWidth - 20, height: height - 8, lineGap: 2 })
      document.y = top + height + 2
      offset += count
    }
  }
  if (metadata.length) document.y += 12
  if (document.y + 70 > bottom) { document.addPage(); brandPage() }
  tableHeader()

  for (const [index, row] of rows.entries()) {
    document.font('Helvetica').fontSize(9)
    const lines = headers.map((header, col) => wrapCell(document, row[header], widths[col] - 16))
    const length = Math.max(...lines.map(value => value.length))
    for (let offset = 0; offset < length;) {
      if (document.y + 30 > bottom) { document.addPage(); brandPage(); tableHeader() }
      const count = Math.min(length - offset, Math.max(1, Math.floor((bottom - document.y - 16) / lineHeight)))
      const height = Math.max(29, count * lineHeight + 16), top = document.y
      document.rect(margin, top, bodyWidth, height).fill(index % 2 ? `#${colors.pale}` : '#FFFFFF')
      let left = margin
      lines.forEach((value, col) => {
        document.font('Helvetica').fontSize(9).fillColor(`#${colors.ink}`).text(value.slice(offset, offset + count).join('\n'), left + 8, top + 8, { width: widths[col] - 16, height: height - 12, lineGap: 2 })
        left += widths[col]
      })
      document.moveTo(margin, top + height).lineTo(margin + bodyWidth, top + height).lineWidth(.4).strokeColor(`#${colors.line}`).stroke()
      document.y = top + height
      offset += count
    }
  }
  if (!rows.length) document.font('Helvetica').fontSize(10).fillColor(`#${colors.muted}`).text('Sin registros para los filtros seleccionados.', margin + 10, document.y + 16, { width: bodyWidth - 20 })
  const { count } = document.bufferedPageRange()
  for (let index = 0; index < count; index++) {
    document.switchToPage(index)
    const bottomMargin = document.page.margins.bottom
    document.page.margins.bottom = 0
    const y = document.page.height - 32
    document.moveTo(margin, y - 8).lineTo(margin + bodyWidth, y - 8).lineWidth(.5).strokeColor(`#${colors.line}`).stroke()
    document.font('Helvetica').fontSize(8).fillColor(`#${colors.muted}`).text('El Calvario · Uso interno', margin, y, { width: bodyWidth / 2, lineBreak: false })
    document.text(`Página ${index + 1} de ${count}`, margin + bodyWidth / 2, y, { width: bodyWidth / 2, align: 'right', lineBreak: false })
    document.page.margins.bottom = bottomMargin
  }
  document.end()
  return complete
}
