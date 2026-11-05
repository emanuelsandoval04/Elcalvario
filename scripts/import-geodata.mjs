import { readFile,writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { planGeometryImport } from '../server/geodata.js'

export async function importGeodata(connection,collection,options={}) {
  const [barrios]=await connection.execute('SELECT id_barrio,nombre FROM barrio WHERE estado=1')
  const plan=planGeometryImport(collection,barrios,options)
  let retired=[]
  if(options.retireSource) {
    if(typeof options.retireSource!=='string' || options.retireSource===options.source) throw new Error('La fuente retirada debe ser distinta de la fuente nueva.')
    const [previous]=await connection.execute('SELECT id_barrio,nombre FROM barrio WHERE geojson IS NOT NULL AND fuente_geojson=?',[options.retireSource])
    const matchedIds=new Set(plan.matched.map(item=>item.id))
    retired=previous.filter(item=>!matchedIds.has(item.id_barrio))
  }
  if(options.apply) {
    if(typeof options.source!=='string' || !options.source.trim() || options.source.length>500) throw new Error('Indica --source con la procedencia cartográfica (máximo 500 caracteres).')
    if(options.retireSource && !plan.matched.length) throw new Error('No se retira una fuente si el archivo nuevo no tiene ninguna coincidencia válida.')
    await connection.beginTransaction()
    try {
      for(const item of plan.matched) await connection.execute('UPDATE barrio SET geojson=?,fuente_geojson=?,fecha_geometria=UTC_TIMESTAMP() WHERE id_barrio=?',[JSON.stringify(item.geometry),options.source,item.id])
      // A known block/service-footprint source must not remain visible as if it
      // were a whole-neighborhood boundary. Keep barrio IDs and assignments.
      if(options.retireSource) await connection.execute('UPDATE barrio SET geojson=NULL,fecha_geometria=UTC_TIMESTAMP() WHERE fuente_geojson=? AND geojson IS NOT NULL',[options.retireSource])
      await connection.commit()
    } catch(error) { await connection.rollback(); throw error }
  }
  return {...plan,matched:plan.matched.map(({geometry,...item})=>item),retired,applied:Boolean(options.apply)}
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const args=process.argv.slice(2),option=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined
  const {pool}=await import('../server/db.js')
  let connection
  try {
    const file=option('--file') || 'database/geodata/barrios_limites_villavicencio.geojson'
    const collection=JSON.parse(await readFile(file,'utf8'))
    const mappingFile=option('--mapping') || (!option('--file') ? 'database/geodata/limites_revision.mappings.json' : null)
    const mappings=mappingFile ? JSON.parse(await readFile(mappingFile,'utf8')) : {}
    connection=await pool.getConnection()
    const result=await importGeodata(connection,collection,{apply:args.includes('--apply'),source:option('--source'),retireSource:option('--retire-source'),nameProperty:option('--name-property') || (Object.hasOwn(collection.features?.[0]?.properties || {},'BARRIO') ? 'BARRIO' : 'DNOCION'),mappings})
    const report=option('--report') || 'database/geodata/reporte-importacion.json'
    await writeFile(report,JSON.stringify(result,null,2)+'\n')
    console.log(JSON.stringify({matched:result.matched.length,unmatched:result.unmatched.length,ambiguous:result.ambiguous.length,invalid:result.invalid.length,retired:result.retired.length,applied:result.applied,report}))
  } catch(error) { console.error(error.message); process.exitCode=1 }
  finally { connection?.release(); await pool.end() }
}
