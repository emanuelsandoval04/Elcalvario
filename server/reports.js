import { createExportWorkbook, addExportTable, addDiscipleProfile } from './export-presentation.js'
import { createReportPdf } from './report-pdf.js'
import { memberCode } from './public-codes.js'

const titles={asistencia:'Asistencia',cumpleanos:'Listado de cumpleaños',grupos:'Grupos de Comunión Familiar'}
const columns={asistencia:['Actividad','Fecha','Tipo','ID','Discípulo','Estado','Metodo'],cumpleanos:['ID','Nombre','Cumpleanos'],grupos:['Codigo','Grupo','Direccion','Barrio','Dia','Hora','Estado']}
const discipleFields = {
  'ID': 'codigo_miembro', 'Nombres': 'nombres', 'Apellidos': 'apellidos', 'Tipo de identificación': 'tipo_identificacion',
  'Identificación': 'numero_identificacion', 'Celular': 'celular', 'Correo': 'correo', 'Fecha de nacimiento': 'fecha_nacimiento',
  'Grupo sanguíneo / RH': 'grupo_sanguineo_rh', 'EPS': 'eps', 'Contacto de emergencia': 'contacto_emergencia_nombre', 'Celular de emergencia': 'contacto_emergencia_celular',
  'Función en la iglesia': 'funcion_iglesia', 'Sede': 'sede_nombre', 'Rol eclesiástico': 'rol_nombre', 'Grupo de Comunión': 'grupo_nombre',
  'Cobertura pastoral': 'cobertura_nombre', 'Libro de adiestramiento': 'libro_actual', 'Ministerios': 'ministerios',
  'Estado': 'estado_miembro', 'Código QR': 'codigo_qr', 'Fecha de creación': 'fecha_creacion', 'Fecha de actualización': 'fecha_actualizacion',
}
const privateColumns = new Set(['Grupo sanguíneo / RH','EPS','Contacto de emergencia','Celular de emergencia'])
export const discipleColumns = sensitive => Object.keys(discipleFields).filter(key => sensitive || !privateColumns.has(key))
export const discipleReportRows = rows => rows.map(row => Object.fromEntries(Object.entries(discipleFields).map(([label,key]) => [label, key === 'codigo_miembro' ? memberCode(row[key]) ?? '' : row[key] instanceof Date ? row[key].toISOString().replace('T',' ').replace('.000Z',' UTC') : row[key] ?? ''])))

export async function sendReport(response,type,format,rows,configuration={}) {
  const headers=configuration.columns || columns[type]
  const title=configuration.title || titles[type]
  const now=new Date()
  response.set('Content-Disposition',`attachment; filename="${type}.${format}"`)
  if(format==='xlsx') {
    const workbook=createExportWorkbook(now)
    const sheet=workbook.addWorksheet(configuration.profile ? 'Datos del discípulo' : title.slice(0,31))
    const subtitle=configuration.metadata?.length ? `Consulta los detalles en la hoja «${configuration.metadataTitle || 'Evento'}».` : type==='cumpleanos' ? 'Calendario de cumpleaños · Fechas en formato mes-día, sin año de nacimiento.' : undefined
    addExportTable(workbook,sheet,{title,headers,rows,subtitle,now})
    if(configuration.profile && rows.length===1) addDiscipleProfile(workbook,rows[0],headers,now)
    if(configuration.metadata?.length) {
      const context=workbook.addWorksheet(configuration.metadataTitle || 'Evento')
      addExportTable(workbook,context,{title:configuration.metadataTitle || 'Detalles del evento',headers:['Campo','Detalle'],rows:configuration.metadata.map(([label,value])=>({Campo:label,Detalle:String(value??'')})),tableName:'ContextoExportado',now})
      context.getColumn(1).width=31
      context.getColumn(2).width=72
    }
    const buffer=await workbook.xlsx.writeBuffer()
    response.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(buffer))
  } else {
    response.type('application/pdf').send(await createReportPdf({title,headers,rows,metadata:configuration.metadata,now}))
  }
}
