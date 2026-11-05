import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'

const titles={asistencia:'Asistencia',cumpleanos:'Listado de cumpleaños',grupos:'Grupos de Comunión Familiar'}
const columns={asistencia:['Actividad','Fecha','Tipo','Discípulo','Estado','Metodo'],cumpleanos:['Nombre','Cumpleanos'],grupos:['Codigo','Grupo','Direccion','Barrio','Dia','Hora','Estado']}
export async function sendReport(response,type,format,rows) {
  const headers=columns[type]
  response.set('Content-Disposition',`attachment; filename="${type}.${format}"`)
  if(format==='xlsx') {
    const workbook=new ExcelJS.Workbook()
    workbook.creator='Nexus Corp'
    const sheet=workbook.addWorksheet(titles[type].slice(0,31))
    sheet.columns=headers.map(key=>({header:key,key,width:key==='Nombre'||key==='Actividad'?35:24}))
    sheet.addRows(rows.map(row=>Object.fromEntries(headers.map(key=>[key,row[key] == null?'':String(row[key])]))))
    sheet.getRow(1).font={bold:true}
    sheet.views=[{state:'frozen',ySplit:1}]
    const buffer=await workbook.xlsx.writeBuffer()
    response.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(buffer))
  } else {
    const document=new PDFDocument({size:'A4',layout:'landscape',margin:36})
    const chunks=[]
    const complete=new Promise((resolve,reject)=>{document.on('data',chunk=>chunks.push(chunk));document.on('end',()=>resolve(Buffer.concat(chunks)));document.on('error',reject)})
    const width=(document.page.width-72)/headers.length
    const pageHeading=()=>{
      document.font('Helvetica-Bold').fontSize(15).text(titles[type])
      document.font('Helvetica').fontSize(9).text('Misión Cristiana El Calvario Villavicencio · Nexus Corp')
      document.moveDown()
      const top=document.y
      headers.forEach((header,i)=>document.font('Helvetica-Bold').text(header,36+i*width,top,{width:width-8}))
      document.y=top+24
    }
    pageHeading()
    for(const row of rows) {
      const cells=headers.map(key=>String(row[key]??''))
      document.font('Helvetica').fontSize(9)
      const height=Math.max(20,...cells.map(cell=>document.heightOfString(cell,{width:width-8})+8))
      if(document.y+height>document.page.height-36){document.addPage();pageHeading()}
      const top=document.y
      cells.forEach((cell,i)=>document.font('Helvetica').fontSize(9).text(cell,36+i*width,top,{width:width-8}))
      document.y=top+height
    }
    if(!rows.length) document.font('Helvetica').text('Sin registros para los filtros seleccionados.',36,document.y)
    document.end()
    response.type('application/pdf').send(await complete)
  }
}
