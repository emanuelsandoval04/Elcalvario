import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'

const titles={asistencia:'Asistencia',cumpleanos:'Listado de cumpleaños',grupos:'Grupos de Comunión Familiar'}
const columns={asistencia:['Actividad','Fecha','Tipo','Discípulo','Estado','Metodo'],cumpleanos:['Nombre','Cumpleanos'],grupos:['Codigo','Grupo','Direccion','Barrio','Dia','Hora','Estado']}
const discipleFields = {
  'ID': 'id_miembro', 'Nombres': 'nombres', 'Apellidos': 'apellidos', 'Tipo de identificación': 'tipo_identificacion',
  'Identificación': 'numero_identificacion', 'Celular': 'celular', 'Correo': 'correo', 'Fecha de nacimiento': 'fecha_nacimiento',
  'Grupo sanguíneo / RH': 'grupo_sanguineo_rh', 'EPS': 'eps', 'Contacto de emergencia': 'contacto_emergencia_nombre', 'Celular de emergencia': 'contacto_emergencia_celular',
  'Función en la iglesia': 'funcion_iglesia', 'Sede': 'sede_nombre', 'Rol eclesiástico': 'rol_nombre', 'Grupo de Comunión': 'grupo_nombre',
  'Cobertura pastoral': 'cobertura_nombre', 'Libro de adiestramiento': 'libro_actual', 'Ministerios': 'ministerios',
  'Estado': 'estado_miembro', 'Código QR': 'codigo_qr', 'Fecha de creación': 'fecha_creacion', 'Fecha de actualización': 'fecha_actualizacion',
}
const privateColumns = new Set(['Grupo sanguíneo / RH','EPS','Contacto de emergencia','Celular de emergencia'])
export const discipleColumns = sensitive => Object.keys(discipleFields).filter(key => sensitive || !privateColumns.has(key))
export const discipleReportRows = rows => rows.map(row => Object.fromEntries(Object.entries(discipleFields).map(([label,key]) => [label, row[key] instanceof Date ? row[key].toISOString().replace('T',' ').replace('.000Z',' UTC') : row[key] ?? ''])))

export async function sendReport(response,type,format,rows,configuration={}) {
  const headers=configuration.columns || columns[type]
  const title=configuration.title || titles[type]
  response.set('Content-Disposition',`attachment; filename="${type}.${format}"`)
  if(format==='xlsx') {
    const workbook=new ExcelJS.Workbook()
    workbook.creator='Nexus Corp'
    const sheet=workbook.addWorksheet(title.slice(0,31))
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
      document.font('Helvetica-Bold').fontSize(15).text(title)
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
