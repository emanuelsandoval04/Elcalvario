import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { inflateRawSync } from 'node:zlib'
import ExcelJS from 'exceljs'
import { pool } from './db.js'
import { hasPermission } from './auth.js'
import { invalid, memberFields, identifier, sensitiveMemberFields, choice } from './entities.js'
import { hasPastoralAuthority } from './pastoral-policy.js'
import importFields from '../shared/member-import-fields.json' with { type: 'json' }
import { databaseRateLimit } from './rate-limit.js'
import { validateTrainingBook } from './training.js'
import { createExportWorkbook, setupExportSheet, addExportTable, styleExportRows, exportColors } from './export-presentation.js'

export const importColumns=Object.fromEntries(Object.entries(importFields).map(([key,field])=>[key,field.label]))
const normalize=value=>String(value??'').trim().normalize('NFD').replace(/\p{Diacritic}/gu,'').toUpperCase()
const header=value=>normalize(value).replace(/[^A-Z0-9]/g,'')
const aliases=new Map(Object.entries(importColumns).flatMap(([key,label])=>[[header(label),key],[header(key),key]]))
for(const [label,key] of Object.entries({'Grupo de Comunión Familiar':'grupo_comunion','Grupo sanguíneo':'grupo_sanguineo_rh','Función':'funcion_iglesia','Libro actual':'libro_adiestramiento','Estado del discípulo':'estado_miembro','grupo_nombre':'grupo_comunion','sede_nombre':'sede','rol_nombre':'rol_eclesiastico','cobertura_nombre':'cobertura_pastoral','libro_actual':'libro_adiestramiento','Nombre':'nombres'}))aliases.set(header(label),key)
const identity=row=>`${normalize(row.tipo_identificacion)}\0${normalize(row.numero_identificacion)}`

// Inspect the ZIP before ExcelJS expands it. Limit bytes, entries and sheet dimensions.
export function inspectSpreadsheet(bytes) {
  if(bytes.length>512*1024 || bytes.length<22)throw invalid('El archivo debe ser XLSX y pesar como máximo 512 KB.')
  let end=-1
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break}
  if(end<0 || bytes.readUInt16LE(end+4)!==0 || bytes.readUInt16LE(end+6)!==0)throw invalid('El archivo XLSX no es válido.')
  const count=bytes.readUInt16LE(end+10),central=bytes.readUInt32LE(end+16)
  if(count>200 || count===0 || central>=end)throw invalid('El libro tiene demasiados elementos o un formato no admitido.')
  let position=central,total=0,worksheets=0
  for(let i=0;i<count;i++) {
    if(position+46>end || bytes.readUInt32LE(position)!==0x02014b50)throw invalid('El libro está dañado.')
    const flags=bytes.readUInt16LE(position+8),method=bytes.readUInt16LE(position+10),compressed=bytes.readUInt32LE(position+20),expanded=bytes.readUInt32LE(position+24)
    const nameLength=bytes.readUInt16LE(position+28),extra=bytes.readUInt16LE(position+30),comment=bytes.readUInt16LE(position+32),offset=bytes.readUInt32LE(position+42)
    const filename=bytes.subarray(position+46,position+46+nameLength).toString('utf8')
    position+=46+nameLength+extra+comment;total+=expanded
    if(position>end || flags&1 || ![0,8].includes(method) || expanded>4*1024*1024 || total>8*1024*1024 || offset+30>central)throw invalid('El libro excede los límites de lectura o está protegido.')
    if(bytes.readUInt32LE(offset)!==0x04034b50)throw invalid('El libro está dañado.')
    const start=offset+30+bytes.readUInt16LE(offset+26)+bytes.readUInt16LE(offset+28)
    if(start+compressed>central)throw invalid('El libro está dañado.')
    const content=method===0 ? bytes.subarray(start,start+compressed) : inflateRawSync(bytes.subarray(start,start+compressed),{maxOutputLength:4*1024*1024})
    if(content.length!==expanded)throw invalid('El libro está dañado.')
    if(/^xl\/worksheets\/[^/]+\.xml$/.test(filename)) {
      worksheets++
      const xml=content.toString('utf8')
      if((xml.match(/<row\b/g)||[]).length>501 || [...xml.matchAll(/\b(?:r|ref)="(?:[A-Z]+[0-9]+:)?([A-Z]+)([0-9]+)"/g)].some(match=>Number(match[2])>501 || match[1].length>2 || (match[1].length===2 && match[1]>'AF')))throw invalid('Usa hasta 500 filas de discípulos y 32 columnas, sin filas o columnas vacías adicionales con formato.')
    }
  }
  if(!worksheets)throw invalid('No se encontró una hoja de cálculo.')
}

export async function spreadsheetRows(encoded) {
  if(typeof encoded!=='string' || encoded.length>700000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw invalid('Selecciona un archivo XLSX válido.')
  const bytes=Buffer.from(encoded,'base64')
  try {inspectSpreadsheet(bytes)} catch(error){if(error.status)throw error;throw invalid('El archivo XLSX está dañado o excede los límites de lectura.')}
  const workbook=new ExcelJS.Workbook()
  try {await workbook.xlsx.load(bytes)}catch{throw invalid('No pudimos leer el archivo XLSX. Vuelve a guardarlo desde Excel.')}
  const sheet=workbook.getWorksheet('Discipulos') || workbook.worksheets[0]
  if(!sheet || sheet.rowCount>501 || sheet.columnCount>32)throw invalid('La hoja admite hasta 500 discípulos y 32 columnas.')
  const mapping=new Map(),seen=new Set(),ignored=[]
  sheet.getRow(1).eachCell((cell,column)=>{
    const label=String(cell.text||'').trim(),key=aliases.get(header(label))
    if(key) {if(seen.has(key))throw invalid(`La columna ${importColumns[key]} está repetida.`);seen.add(key);mapping.set(column,key)}
    else if(label)ignored.push(label.slice(0,80))
  })
  for(const key of ['nombres','tipo_identificacion','numero_identificacion','celular','fecha_nacimiento'])if(!seen.has(key))throw invalid(`Falta la columna ${importColumns[key]}. Descarga la plantilla para consultar el formato.`)
  const rows=[]
  for(let index=2;index<=sheet.rowCount;index++) {
    const result={sourceRow:index},errors={}
    for(const [column,key] of mapping) {
      const value=sheet.getRow(index).getCell(column).value
      if(value==null)result[key]=''
      else if(value instanceof Date)result[key]=Number.isFinite(value.getTime())?value.toISOString().slice(0,10):''
      else if(typeof value==='number') {
        if(!Number.isSafeInteger(value) || key==='fecha_nacimiento')errors[key]='Guarda este dato como texto o como una fecha de Excel válida.'
        result[key]=String(value)
      }else if(typeof value==='string')result[key]=value.trim()
      else {result[key]='';errors[key]='Usa un valor simple; no se admiten fórmulas ni objetos en las celdas.'}
    }
    if(Object.values(result).slice(1).some(value=>value!=='') || Object.keys(errors).length)rows.push({...result,cellErrors:errors})
  }
  return {rows,ignored}
}

function lookup(value,items,key,errors,field,description,aliases=item=>[item.nombre]) {
  if(!value)return null
  const matches=items.filter(item=>aliases(item).some(label=>normalize(label)===normalize(value)))
  if(matches.length!==1)errors[field]=matches.length ? 'La referencia coincide con varios registros. Usa un nombre único o, para cobertura, el tipo y número de identificación.' : `No corresponde a ${description} disponible. Revisa la hoja Referencias de la plantilla.`
  return matches.length===1 ? matches[0][key] : null
}

export async function validateImportRows(rows,catalogs,connection=pool) {
  if(!Array.isArray(rows) || rows.length<1 || rows.length>500)throw invalid('Selecciona entre 1 y 500 filas para importar.')
  const seen=new Set()
  const results=rows.map((source,index)=>{
    if(!source || typeof source!=='object' || Array.isArray(source))throw invalid('Una fila no tiene un formato válido.')
    const data={},errors={}
    for(const [key,field] of Object.entries(importFields)) {
      let raw=source[key] ?? ''
      if(typeof raw!=='string') {errors[key]=`Usa texto de hasta ${field.max} caracteres.`;raw=''}
      raw=raw.trim()
      if(!field.required && normalize(raw)==='SIN REGISTRAR')raw=''
      if(raw.length>field.max) {errors[key]=`Usa texto de hasta ${field.max} caracteres.`;raw=''}
      if(key==='fecha_nacimiento' && /^\d{2}\/\d{2}\/\d{4}$/.test(raw))raw=`${raw.slice(6)}-${raw.slice(3,5)}-${raw.slice(0,2)}`
      if(key==='grupo_sanguineo_rh')raw=raw.toUpperCase().replaceAll(' ','')
      if(key==='estado_miembro')raw=raw.toLowerCase() || 'activo'
      data[key]=raw
      if(Object.hasOwn(memberFields,key))try{data[key]=memberFields[key](raw) ?? ''}catch(error){errors[key]=error.message}
    }
    if(source.cellErrors && typeof source.cellErrors==='object')for(const key of Object.keys(source.cellErrors))if(Object.hasOwn(importColumns,key))errors[key]='La celda contiene una fórmula o un valor no admitido. Corrígela antes de importar.'
    const groupByCode=lookup(data.codigo_grupo,catalogs.groups,'id_grupo',errors,'codigo_grupo','un grupo',item=>[item.codigo_grupo])
    const groupByName=lookup(data.grupo_comunion,catalogs.groups,'id_grupo',errors,'grupo_comunion','un grupo',item=>[item.nombre,item.codigo_grupo])
    if(groupByCode && groupByName && groupByCode!==groupByName)errors.grupo_comunion='El nombre y el código corresponden a grupos diferentes.'
    data.id_grupo=groupByCode || groupByName
    data.id_sede=lookup(data.sede,catalogs.sites,'id_sede',errors,'sede','una sede')
    data.id_rol_eclesiastico=lookup(data.rol_eclesiastico,catalogs.roles,'id_rol_eclesiastico',errors,'rol_eclesiastico','un rol eclesiástico')
    data.id_cobertura_pastoral=lookup(data.cobertura_pastoral,catalogs.coverage,'id_miembro',errors,'cobertura_pastoral','una cobertura pastoral existente',item=>[item.nombre,`${item.tipo_identificacion} ${item.numero_identificacion}`])
    data.id_libro=data.libro_adiestramiento ? lookup(data.libro_adiestramiento,catalogs.books,'id_libro',errors,'libro_adiestramiento','un libro') : catalogs.defaultBookId
    if(!data.id_libro && !data.libro_adiestramiento && catalogs.books.length)errors.libro_adiestramiento='Indica el libro de esta fila o selecciona un libro por defecto en la web.'
    const ministryNames=data.ministerios ? data.ministerios.split(';').map(value=>value.trim()).filter(Boolean) : []
    if(ministryNames.length>100)errors.ministerios='Usa hasta 100 ministerios separados por punto y coma (;).'
    const ministryIds=[...new Set(ministryNames.map(name=>lookup(name,catalogs.ministries,'id_ministerio',errors,'ministerios','un ministerio')).filter(Boolean))]
    try{choice(data.estado_miembro,['activo','inactivo','retirado'])}catch{errors.estado_miembro='Usa activo, inactivo o retirado.'}
    if(!catalogs.capabilities.sensitive)for(const key of sensitiveMemberFields)if(data[key])errors[key]='Tu cuenta no tiene permiso para registrar datos sensibles.'
    if(!catalogs.capabilities.services)for(const key of ['funcion_iglesia','rol_eclesiastico','cobertura_pastoral'])if(data[key])errors[key]='Solo los cargos pastorales autorizados pueden asignar este dato.'
    if(data.rol_eclesiastico && !catalogs.capabilities.administrative)errors.rol_eclesiastico='Tu cuenta no tiene autorización para registrar cargos pastorales.'
    if(data.ministerios && (!catalogs.capabilities.ministries || catalogs.ministryGroups && !catalogs.ministryGroups.includes(data.id_grupo)))errors.ministerios='No tienes autorización para asignar ministerios a esta ficha.'
    if(data.estado_miembro!=='activo' && (!catalogs.capabilities.state || catalogs.stateGroups && data.id_grupo && !catalogs.stateGroups.includes(data.id_grupo)))errors.estado_miembro='No tienes permiso para registrar este estado en el grupo seleccionado.'
    const key=identity(data)
    if(!errors.tipo_identificacion&&!errors.numero_identificacion) {
      if(seen.has(key))errors.numero_identificacion='La identificación está repetida en este archivo.'
      seen.add(key)
    }
    return {sourceRow:Number.isSafeInteger(source.sourceRow)?source.sourceRow:index+2,data,errors,ministryIds}
  })
  const candidates=results.filter(row=>!row.errors.tipo_identificacion&&!row.errors.numero_identificacion)
  if(candidates.length) {
    const [duplicates]=await connection.execute(`SELECT tipo_identificacion,numero_identificacion FROM miembro WHERE (tipo_identificacion,numero_identificacion) IN (${candidates.map(()=>'(?,?)').join(',')})`,candidates.flatMap(row=>[row.data.tipo_identificacion,row.data.numero_identificacion]))
    const existing=new Set(duplicates.map(identity))
    for(const row of results)if(existing.has(identity(row.data)))row.errors.numero_identificacion='Ya existe una ficha con esta identificación, incluida una posible ficha archivada.'
  }
  return results.map(row=>({...row,valid:Object.keys(row.errors).length===0}))
}

export function memberImportRouter({transaction,currentActor,registrationPermission,groupFilter,memberFilter}) {
  const router=Router()
  const limit=databaseRateLimit({prefix:'member-import',maximum:12,key:req=>String(req.authUser.id)})
  const allowed=req=>{
    if(!hasPermission(req.authUser,'miembros.registrar')&&!hasPermission(req.authUser,'miembros.editar'))throw invalid('No tienes permiso para importar discípulos.',403)
  }
  async function groups(req,connection=pool,code=registrationPermission(req)) {
    const scope=groupFilter(req,code)
    return (await connection.execute(`SELECT g.id_grupo,g.codigo_grupo,g.nombre FROM grupo_comunion g WHERE g.archivado=0 ${scope.sql} ORDER BY g.nombre`,scope.params))[0]
  }
  async function catalogs(req,connection=pool,bookId=null) {
    const capabilities={sensitive:hasPermission(req.authUser,'miembros.sensibles'),services:hasPastoralAuthority(req.authUser),administrative:Boolean(req.authUser.registration?.canCreateAdministrative),ministries:hasPastoralAuthority(req.authUser)&&hasPermission(req.authUser,'ministerios.gestionar'),state:hasPermission(req.authUser,'miembros.estado')}
    const result={capabilities,defaultBookId:await validateTrainingBook(connection,identifier(bookId,true)),groups:await groups(req,connection)}
    for(const [key,table,id] of [['sites','sede','id_sede'],['roles','rol_eclesiastico','id_rol_eclesiastico'],['books','libro_adiestramiento','id_libro'],['ministries','ministerio','id_ministerio']])result[key]=(await connection.execute(`SELECT ${id},nombre FROM ${table} ORDER BY nombre`))[0]
    result.coverage=[]
    if(capabilities.services && hasPermission(req.authUser,'miembros.ver')) {
      const view=memberFilter(req,'miembros.ver'),registration=memberFilter(req,registrationPermission(req))
      result.coverage=(await connection.execute(`SELECT m.id_miembro,CONCAT_WS(' ',m.nombres,m.apellidos) AS nombre,m.tipo_identificacion,m.numero_identificacion FROM miembro m WHERE m.archivado=0 ${view.sql} ${registration.sql} ORDER BY m.nombres,m.id_miembro`,[...view.params,...registration.params]))[0]
    }
    for(const [key,code] of [['ministryGroups','ministerios.gestionar'],['stateGroups','miembros.estado']])result[key]=req.authUser.permissions[code]==='grupo' ? (await groups(req,connection,code)).map(group=>group.id_grupo) : null
    return result
  }
  router.get('/members/import/template',async(req,res)=>{
    allowed(req)
    const available=await catalogs(req)
    const workbook=createExportWorkbook(),sheet=workbook.addWorksheet('Discipulos')
    setupExportSheet(sheet,Object.values(importColumns),{headerRow:1,freezeColumns:2})
    sheet.columns=Object.entries(importFields).map(([key,field])=>({header:field.label,key,width:key==='ministerios'?40:26,style:{numFmt:'@',font:{name:'Calibri',size:11},alignment:{vertical:'middle',wrapText:true}}}))
    sheet.properties.defaultRowHeight=26
    styleExportRows(sheet,1,1,20)
    sheet.getRow(1).height=44;sheet.autoFilter={from:'A1',to:'T1'}
    Object.entries(importFields).forEach(([key,field],index)=>{sheet.getCell(1,index+1).note=field.required?'Obligatorio.':key==='codigo_grupo'?'Opcional. Puede usarse en lugar del nombre del grupo.':'Opcional. Deja vacío o escribe Sin registrar si no se conoce.'})
    Object.entries(importFields).forEach(([,field],index)=>{if(field.required)sheet.getCell(1,index+1).fill={type:'pattern',pattern:'solid',fgColor:{argb:`FF${exportColors.accent}`}}})
    const instructions=workbook.addWorksheet('Instrucciones')
    const guidance=[
      'Empieza en la hoja Discipulos. Los encabezados naranjas son obligatorios. Conserva los nombres de las columnas y escribe desde la fila 2.',
      'Completa la hoja Discipulos: hasta 500 filas. La plantilla incluye todos los campos de la ficha. No incluyas contraseñas. No se crean cuentas de acceso.',
      'Obligatorios: nombres, tipo de identificación, identificación, celular y fecha de nacimiento. Los demás datos pueden quedar vacíos o decir Sin registrar.',
      'Fecha de nacimiento: AAAA-MM-DD o DD/MM/AAAA. Identificaciones y celulares: texto para conservar ceros.',
      'Sede, rol eclesiástico, libro y ministerios deben existir en sus catálogos. Consulta la hoja Referencias. No se crean catálogos por escribir un nombre nuevo.',
      'Grupo de Comunión: nombre o código de un grupo disponible. Código de grupo es una alternativa compatible con plantillas anteriores. Si llenas ambos, deben coincidir.',
      'Cobertura pastoral: nombre completo de una persona ya registrada y disponible. Si hay nombres repetidos, usa su tipo y número de identificación, por ejemplo CC 123456789.',
      'Libro de adiestramiento: indica el nombre para cada fila. Puedes elegir en la web un libro por defecto para las filas vacías. Si hay libros en el catálogo, cada ficha debe recibir uno.',
      'Ministerios: separa varios nombres con punto y coma (;). Estado: activo, inactivo o retirado. Vacío equivale a activo.',
      'Los datos sensibles, cargos, funciones, coberturas, ministerios y estados se validan según tus permisos. Los datos sin autorización se marcan como error; no se descartan silenciosamente.',
      'La importación no acredita aceptación de privacidad. La autorización firmada se gestiona después en cada ficha.',
      'La vista previa no guarda registros. Corrige los errores y confirma las filas. Si hay un conflicto, no se importa ninguna de las filas seleccionadas.'
    ]
    addExportTable(workbook,instructions,{title:'Plantilla de discípulos',headers:['Paso','Instrucciones'],rows:guidance.map((value,index)=>({Paso:String(index+1).padStart(2,'0'),Instrucciones:value})),tableName:'GuiaImportacion',subtitle:'Guía de uso · Completa Discipulos y consulta los catálogos en Referencias.'})
    instructions.getColumn(1).width=31;instructions.getColumn(2).width=100
    styleExportRows(instructions,7,7+guidance.length,2)
    workbook.views[0].activeTab=1
    const references=workbook.addWorksheet('Referencias')
    const referenceLists={Sedes:available.sites.map(item=>item.nombre),'Roles eclesiásticos':available.roles.map(item=>item.nombre),'Grupos (nombre)':available.groups.map(item=>item.nombre),'Grupos (código)':available.groups.map(item=>item.codigo_grupo),'Libros de adiestramiento':available.books.map(item=>item.nombre),Ministerios:available.ministries.map(item=>item.nombre),'Grupo sanguíneo / RH':['A+','A-','B+','B-','AB+','AB-','O+','O-'],Estado:['activo','inactivo','retirado']}
    setupExportSheet(references,Object.keys(referenceLists),{headerRow:1,freezeColumns:0})
    references.columns=Object.keys(referenceLists).map(label=>({header:label,key:label,width:36,style:{numFmt:'@'}}))
    for(let index=0;index<Math.min(500,Math.max(...Object.values(referenceLists).map(list=>list.length)));index++)references.addRow(Object.fromEntries(Object.entries(referenceLists).map(([key,list])=>[key,list[index] || ''])))
    styleExportRows(references,1,references.rowCount,Object.keys(referenceLists).length)
    references.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,references.rowCount),column:Object.keys(referenceLists).length}}
    res.set('Content-Disposition','attachment; filename="plantilla-discipulos.xlsx"').type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(await workbook.xlsx.writeBuffer()))
  })
  router.post('/members/import/preview',limit,async(req,res)=>{
    allowed(req)
    const parsed=req.body?.file ? await spreadsheetRows(req.body.file) : {rows:req.body?.rows,ignored:[]}
    const available=await catalogs(req,pool,req.body?.bookId)
    const rows=await validateImportRows(parsed.rows,available)
    res.json({rows,groups:available.groups,catalogs:{sites:available.sites,roles:available.roles,books:available.books,ministries:available.ministries},capabilities:available.capabilities,ignored:parsed.ignored,valid:rows.filter(row=>row.valid).length,total:rows.length})
  })
  router.post('/members/import/commit',limit,async(req,res)=>{
    allowed(req)
    const imported=await transaction(async connection=>{
      await currentActor(req,connection);allowed(req)
      const available=await catalogs(req,connection,req.body?.bookId)
      const rows=await validateImportRows(req.body?.rows,available,connection)
      if(rows.some(row=>!row.valid))throw Object.assign(invalid('Hay errores o datos que cambiaron después de la vista previa. Vuelve a validar antes de importar.'),{rows})
      const codes=rows.map(()=>randomUUID())
      const columns=['nombres','apellidos','tipo_identificacion','numero_identificacion','celular','correo','fecha_nacimiento',...sensitiveMemberFields,'funcion_iglesia','id_sede','id_rol_eclesiastico','id_grupo','id_cobertura_pastoral','id_libro','estado_miembro','codigo_qr','id_usuario_creacion','id_usuario_actualizacion']
      const values=rows.map((row,index)=>columns.map(key=>key==='codigo_qr'?codes[index]:key.startsWith('id_usuario')?req.authUser.id:row.data[key] || null))
      await connection.query(`INSERT INTO miembro (${columns.join(',')}) VALUES ?`,[values])
      const [created]=await connection.execute(`SELECT id_miembro,codigo_qr,estado_miembro FROM miembro WHERE codigo_qr IN (${codes.map(()=>'?').join(',')})`,codes)
      await connection.query('INSERT INTO historial_estado_miembro(id_miembro,estado,id_usuario) VALUES ?',[created.map(member=>[member.id_miembro,member.estado_miembro,req.authUser.id])])
      const ids=new Map(created.map(member=>[member.codigo_qr,member.id_miembro])),ministries=rows.flatMap((row,index)=>row.ministryIds.map(ministry=>[ids.get(codes[index]),ministry,1]))
      if(ministries.length)await connection.query('INSERT INTO miembro_ministerio(id_miembro,id_ministerio,activo) VALUES ?',[ministries])
      return rows.length
    })
    res.status(201).json({imported})
  })
  router.use((error,req,res,next)=>{if(error.rows)return res.status(400).json({error:error.message,rows:error.rows});next(error)})
  return router
}
