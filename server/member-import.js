import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { inflateRawSync } from 'node:zlib'
import ExcelJS from 'exceljs'
import { pool } from './db.js'
import { hasPermission } from './auth.js'
import { invalid, memberFields, identifier } from './entities.js'
import { databaseRateLimit } from './rate-limit.js'
import { validateTrainingBook } from './training.js'

export const importColumns={nombres:'Nombres',apellidos:'Apellidos',tipo_identificacion:'Tipo de identificación',numero_identificacion:'Identificación',celular:'Celular',correo:'Correo',fecha_nacimiento:'Fecha de nacimiento',codigo_grupo:'Código de grupo'}
const normalize=value=>String(value??'').trim().normalize('NFD').replace(/\p{Diacritic}/gu,'').toUpperCase()
const header=value=>normalize(value).replace(/[^A-Z0-9]/g,'')
const aliases=new Map(Object.entries(importColumns).flatMap(([key,label])=>[[header(label),key],[header(key),key]]))
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

export async function validateImportRows(rows,groups,connection=pool) {
  if(!Array.isArray(rows) || rows.length<1 || rows.length>500)throw invalid('Selecciona entre 1 y 500 filas para importar.')
  const seen=new Set()
  const results=rows.map((source,index)=>{
    if(!source || typeof source!=='object' || Array.isArray(source))throw invalid('Una fila no tiene un formato válido.')
    const data={},errors={}
    for(const key of Object.keys(importColumns)) {
      let raw=source[key] ?? ''
      if(typeof raw!=='string' || raw.length>200) {errors[key]='Usa texto de hasta 200 caracteres.';raw=''}
      if(key==='fecha_nacimiento' && /^\d{2}\/\d{2}\/\d{4}$/.test(raw))raw=`${raw.slice(6)}-${raw.slice(3,5)}-${raw.slice(0,2)}`
      data[key]=raw.trim()
      if(key!=='codigo_grupo')try {data[key]=memberFields[key](raw) ?? ''}catch(error){errors[key]=error.message}
    }
    if(source.cellErrors && typeof source.cellErrors==='object')for(const key of Object.keys(source.cellErrors))if(Object.hasOwn(importColumns,key))errors[key]='La celda contiene una fórmula o un valor no admitido. Corrígela antes de importar.'
    const group=data.codigo_grupo ? groups.find(item=>normalize(item.codigo_grupo)===normalize(data.codigo_grupo)) : null
    if(data.codigo_grupo && !group)errors.codigo_grupo='El código no corresponde a un grupo disponible para tu cuenta.'
    const key=identity(data)
    if(!errors.tipo_identificacion&&!errors.numero_identificacion) {
      if(seen.has(key))errors.numero_identificacion='La identificación está repetida en este archivo.'
      seen.add(key)
    }
    return {sourceRow:Number.isSafeInteger(source.sourceRow)?source.sourceRow:index+2,data:{...data,id_grupo:group?.id_grupo || null},errors}
  })
  const candidates=results.filter(row=>!row.errors.tipo_identificacion&&!row.errors.numero_identificacion)
  if(candidates.length) {
    const [duplicates]=await connection.execute(`SELECT tipo_identificacion,numero_identificacion FROM miembro WHERE (tipo_identificacion,numero_identificacion) IN (${candidates.map(()=>'(?,?)').join(',')})`,candidates.flatMap(row=>[row.data.tipo_identificacion,row.data.numero_identificacion]))
    const existing=new Set(duplicates.map(identity))
    for(const row of results)if(existing.has(identity(row.data)))row.errors.numero_identificacion='Ya existe una ficha con esta identificación, incluida una posible ficha archivada.'
  }
  return results.map(row=>({...row,valid:Object.keys(row.errors).length===0}))
}

export function memberImportRouter({transaction,currentActor,registrationPermission,groupFilter}) {
  const router=Router()
  const limit=databaseRateLimit({prefix:'member-import',maximum:12,key:req=>String(req.authUser.id)})
  const allowed=req=>{
    if(!hasPermission(req.authUser,'miembros.registrar')&&!hasPermission(req.authUser,'miembros.editar'))throw invalid('No tienes permiso para importar discípulos.',403)
  }
  async function groups(req,connection=pool) {
    const scope=groupFilter(req,registrationPermission(req))
    return (await connection.execute(`SELECT g.id_grupo,g.codigo_grupo,g.nombre FROM grupo_comunion g WHERE g.archivado=0 ${scope.sql} ORDER BY g.nombre`,scope.params))[0]
  }
  router.get('/members/import/template',async(req,res)=>{
    allowed(req)
    const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Discipulos')
    sheet.columns=Object.entries(importColumns).map(([key,label])=>({header:label,key,width:26,style:{numFmt:'@'}}))
    sheet.getRow(1).font={bold:true};sheet.views=[{state:'frozen',ySplit:1}]
    const instructions=workbook.addWorksheet('Instrucciones')
    instructions.getColumn(1).width=110
    for(const value of ['Completa la hoja Discipulos: hasta 500 filas. No incluyas contraseñas ni cargos pastorales.','Obligatorios: nombres, tipo de identificación, identificación, celular y fecha de nacimiento.','Fecha de nacimiento: AAAA-MM-DD o DD/MM/AAAA. Identificaciones y celulares: texto para conservar ceros.','Código de grupo: opcional; debe coincidir con un grupo disponible para tu cuenta.','Selecciona en la web el libro de adiestramiento que se asignará a las fichas, igual que en el registro individual.','La vista previa no guarda registros. Corrige los errores y confirma las filas antes de importar.'])instructions.addRow([value])
    res.set('Content-Disposition','attachment; filename="plantilla-discipulos.xlsx"').type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(await workbook.xlsx.writeBuffer()))
  })
  router.post('/members/import/preview',limit,async(req,res)=>{
    allowed(req)
    await validateTrainingBook(pool,identifier(req.body?.bookId,true),true)
    const parsed=req.body.file ? await spreadsheetRows(req.body.file) : {rows:req.body.rows,ignored:[]}
    const available=await groups(req)
    const rows=await validateImportRows(parsed.rows,available)
    res.json({rows,groups:available,ignored:parsed.ignored,valid:rows.filter(row=>row.valid).length,total:rows.length})
  })
  router.post('/members/import/commit',limit,async(req,res)=>{
    allowed(req)
    const imported=await transaction(async connection=>{
      await currentActor(req,connection);allowed(req)
      const bookId=await validateTrainingBook(connection,identifier(req.body?.bookId,true),true)
      const rows=await validateImportRows(req.body?.rows,await groups(req,connection),connection)
      if(rows.some(row=>!row.valid))throw Object.assign(invalid('Hay errores o identificaciones que se registraron después de la vista previa. Vuelve a validar antes de importar.'),{rows})
      const codes=rows.map(()=>randomUUID())
      const columns=['nombres','apellidos','tipo_identificacion','numero_identificacion','celular','correo','fecha_nacimiento','id_grupo','id_libro','codigo_qr','id_usuario_creacion','id_usuario_actualizacion']
      const values=rows.map((row,index)=>columns.map(key=>key==='id_libro'?bookId:key==='codigo_qr'?codes[index]:key.startsWith('id_usuario')?req.authUser.id:row.data[key] || null))
      await connection.query(`INSERT INTO miembro (${columns.join(',')}) VALUES ?`,[values])
      await connection.execute(`INSERT INTO historial_estado_miembro(id_miembro,estado,id_usuario) SELECT id_miembro,'activo',? FROM miembro WHERE codigo_qr IN (${codes.map(()=>'?').join(',')})`,[req.authUser.id,...codes])
      return rows.length
    })
    res.status(201).json({imported})
  })
  router.use((error,req,res,next)=>{if(error.rows)return res.status(400).json({error:error.message,rows:error.rows});next(error)})
  return router
}
