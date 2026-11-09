import PDFKit from 'pdfkit'
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib'
import jpeg from 'jpeg-js'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { invalid } from './entities.js'
import { discipleColumns, discipleReportRows } from './reports.js'
import { reportLogoPath } from './export-presentation.js'

export const consentVersion = 'base-2026-11-08'
export const maxConsentBytes = 2 * 1024 * 1024
export function authorizationText(institution) {
  return [
    `Responsable: ${institution.nombre}. Atención al titular: ${institution.direccion}, ${institution.ciudad}.`,
    'Autorizo de forma previa, informada y expresa la recolección, almacenamiento, consulta y actualización de los datos de esta ficha para mi vinculación, organización de grupos y ministerios, registro de asistencia, comunicaciones sobre actividades y acompañamiento pastoral. El acceso se limita al personal autorizado según sus funciones. Esta autorización no comprende la publicación de mi ficha, imágenes o testimonios ni el uso comercial de mis datos.',
    'Puedo conocer, actualizar y rectificar mis datos, solicitar prueba de esta autorización e información sobre su uso, presentar consultas y reclamos ante el responsable y solicitar la revocación o supresión cuando proceda. Puedo acudir a la Superintendencia de Industria y Comercio conforme al procedimiento aplicable. Para ejercer mis derechos puedo presentar mi solicitud en la dirección del responsable indicada arriba.',
    'Los datos sobre creencias o vinculación religiosa y los de salud (EPS y grupo sanguíneo) son sensibles. Su entrega y autorización son voluntarias; puedo negarme a suministrarlos y mi participación no se condiciona a autorizar datos sensibles. Las opciones siguientes permiten expresar mi decisión por separado. Los datos de emergencia se usarán para contactar a la persona indicada en una necesidad de asistencia, sin sustituir atención médica.',
    'El responsable debe conservar esta evidencia con acceso restringido durante el tiempo necesario para las finalidades autorizadas y las obligaciones aplicables. Para menores de edad firma su representante, teniendo en cuenta el interés superior, sus derechos y su opinión según su madurez.',
  ].join('\n\n')
}
const colombiaTime = value => new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',dateStyle:'long',timeStyle:'short'}).format(value)
function collect(document) {
  const chunks=[]
  return new Promise((resolve,reject)=>{document.on('data',chunk=>chunks.push(chunk));document.on('end',()=>resolve(Buffer.concat(chunks)));document.on('error',reject)})
}
export async function discipleConsentPdf(member,institution,sensitive,now=new Date()) {
  const document=new PDFKit({size:'A4',margin:42,bufferPages:true,info:{Title:'Ficha del discípulo y autorización de datos',Author:institution.nombre}})
  const complete=collect(document), width=document.page.width-84
  const fullName=`${member.nombres} ${member.apellidos || ''}`.trim()
  function heading(title) {
    document.image(reportLogoPath,42,32,{fit:[150,64]})
    document.image(fileURLToPath(new URL('./mail-assets/nexus.png',import.meta.url)),document.page.width-132,42,{fit:[90,36]})
    document.fillColor('#142e49').font('Helvetica-Bold').fontSize(18).text(title,42,112,{width})
    document.fillColor('#42556b').font('Helvetica').fontSize(9).text(institution.nombre,{width}).moveDown(.5)
  }
  heading('Ficha del discípulo')
  document.fontSize(9).text(`Datos registrados al ${colombiaTime(now)} (Colombia).`).moveDown()
  const row=discipleReportRows([member])[0]
  for(const label of discipleColumns(sensitive).filter(label=>!['Código QR','Fecha de creación','Fecha de actualización'].includes(label))) {
    const value=String(row[label] || 'Sin registrar').replace(/[\x00-\x1f]/g,' ')
    document.font('Helvetica').fontSize(10)
    const height=Math.max(23,document.heightOfString(value,{width:width-170})+12)
    if(document.y+height>735){document.addPage();heading('Ficha del discípulo · continuación')}
    const y=document.y
    document.rect(42,y,width,height).fill(label==='Nombres'||label==='Apellidos'?'#eef4f9':'#f6f8fa')
    document.fillColor('#42556b').font('Helvetica-Bold').fontSize(9).text(label,50,y+6,{width:154})
    document.fillColor('#172c40').font('Helvetica').fontSize(10).text(value,212,y+6,{width:width-178})
    document.y=y+height+2
  }
  if(!sensitive)document.moveDown().fontSize(9).text('Los campos de salud y contacto de emergencia no se incluyen en esta copia por el permiso de acceso.')
  document.addPage();heading('Autorización de datos y firma')
  document.fillColor('#526174').font('Helvetica').fontSize(8).text(`Texto base para revisión institucional · ${consentVersion}`).moveDown(.8)
  document.fillColor('#172c40').fontSize(9).text(`Titular: ${fullName} · ${member.tipo_identificacion || ''} ${member.numero_identificacion || ''}`,{width}).moveDown(.8)
  document.fontSize(9).text(authorizationText(institution),{width,lineGap:2,paragraphGap:7}).moveDown(.8)
  document.font('Helvetica-Bold').fontSize(10).text('Decisiones sobre datos sensibles')
  document.font('Helvetica').fontSize(9).text('Datos religiosos para vinculación y acompañamiento:  [  ] Sí autorizo   [  ] No autorizo',{paragraphGap:6})
  document.text('Datos de salud para apoyo en emergencias:  [  ] Sí autorizo   [  ] No autorizo').moveDown(.8)
  document.text('Declaro que revisé los datos de la ficha y autorizo su tratamiento para las finalidades indicadas, respetando mis decisiones sobre datos sensibles.').moveDown()
  // Keep the complete signature block together even with unusually long institutional data.
  if(document.y+135>755){document.addPage();heading('Firma de la autorización')}
  const y=document.y+25
  document.moveTo(42,y).lineTo(310,y).strokeColor('#526174').stroke()
  document.fontSize(9).text('Firma del titular o representante legal',42,y+7,{width})
  document.text('Nombre y documento del firmante: __________________________________________',42,y+32,{width})
  document.text('Si es representante, parentesco / calidad: _____________________________________',42,y+56,{width})
  document.text('Lugar y fecha de firma: __________________________________________________',42,y+80,{width})
  const {count}=document.bufferedPageRange()
  for(let i=0;i<count;i++) {
    document.switchToPage(i)
    document.font('Helvetica').fontSize(8).fillColor('#526174').text(`Ficha #${member.id_miembro} · ${fullName} · Página ${i+1} de ${count}`,42,780,{width,height:20,lineBreak:false})
  }
  document.end();return complete
}

// Originals are kept as private attachments. No SVG/HTML, scripts or remote URLs.
export async function parseConsentFiles(files) {
  if(!Array.isArray(files) || !files.length || files.length>6)throw invalid('Selecciona un PDF o hasta seis fotos de las páginas firmadas.')
  let total=0
  const parsed=[]
  for(const file of files) {
    if(!file || typeof file.data!=='string' || file.data.length>Math.ceil(maxConsentBytes/3)*4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(file.data))throw invalid('El archivo no es válido.')
    const bytes=Buffer.from(file.data,'base64');total+=bytes.length
    if(!bytes.length || bytes.toString('base64')!==file.data)throw invalid('El archivo no es válido.')
    if(total>maxConsentBytes)throw invalid('Los archivos preparados deben pesar como máximo 2 MB en total.',413)
    if(file.type==='application/pdf' && files.length===1 && bytes.subarray(0,5).toString()==='%PDF-' && bytes.subarray(-1024).includes(Buffer.from('%%EOF'))) {
      try {
        const pdf=await PDFDocument.load(bytes,{throwOnInvalidObject:true,updateMetadata:false})
        if(pdf.isEncrypted || pdf.getPageCount()<1 || pdf.getPageCount()>12)throw new Error('pages')
        const objects=pdf.context.enumerateIndirectObjects()
        if(objects.length>10000)throw new Error('objects')
        const blocked=new Set(['JS','JavaScript','AA','OpenAction','Launch','EmbeddedFiles','RichMedia','XFA'])
        const seen=new Set()
        function inspect(object) {
          if(!object || seen.has(object))return
          seen.add(object)
          if(object instanceof PDFName && blocked.has(object.decodeText()))throw new Error('active')
          if(object instanceof PDFDict)for(const [key,value] of object.entries()){inspect(key);inspect(value)}
          else if(object.dict)inspect(object.dict)
          else if(typeof object.asArray==='function')for(const value of object.asArray())inspect(value)
        }
        for(const [,object] of objects)inspect(object)
      }catch{throw invalid('El PDF está dañado, protegido, contiene contenido activo o supera 12 páginas. Sube un PDF simple del documento firmado.')}
    } else if(file.type==='image/jpeg' && bytes.length>32 && bytes.readUInt16BE(0)===0xffd8 && bytes.readUInt16BE(bytes.length-2)===0xffd9) {
      try {
        const image=jpeg.decode(bytes,{maxResolutionInMP:8,maxMemoryUsageInMB:64,tolerantDecoding:false})
        if(!image.width || !image.height || image.width>3000 || image.height>3000)throw new Error('dimensions')
      }catch{throw invalid('La foto no es válida. Vuelve a seleccionarla desde la aplicación.')}
    } else throw invalid('Selecciona un PDF o fotos JPG, PNG o WebP. Las fotos se preparan como JPG sin recortar.')
    parsed.push({bytes,type:file.type})
  }
  let bytes=parsed[0].bytes,type=parsed[0].type
  if(parsed.length>1) {
    const document=new PDFKit({size:'A4',margin:20}),complete=collect(document)
    parsed.forEach((file,index)=>{if(index)document.addPage();document.image(file.bytes,20,20,{fit:[document.page.width-40,document.page.height-40],align:'center',valign:'center'})})
    document.end();bytes=await complete;type='application/pdf'
  }
  return {bytes,type,sha256:createHash('sha256').update(bytes).digest('hex')}
}
