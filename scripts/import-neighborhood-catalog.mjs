import { readFile } from 'node:fs/promises'
import { pool } from '../server/db.js'

// Explicit municipal catalog import. Geometry import NEVER creates neighborhoods.
let connection
try {
  const rows=JSON.parse(await readFile('database/geodata/catalogo_municipal.json','utf8'))
  if(!Array.isArray(rows) || !rows.length || rows.length>5000) throw new Error('Catálogo municipal inválido.')
  const codes=new Set()
  for(const row of rows) {
    if(!/^\d+$/.test(row.id) || typeof row.denominacion!=='string' || !row.denominacion.trim() || row.denominacion.length>150 || typeof row.comuna!=='string' || row.comuna.length>80 || codes.has(row.id)) throw new Error('Revisa el catálogo: campos o códigos inválidos.')
    codes.add(row.id)
  }
  connection=await pool.getConnection()
  const [existing]=await connection.execute('SELECT id_barrio,nombre,codigo FROM barrio')
  const creates=[],conflicts=[]
  for(const row of rows) {
    const code=`municipio-50001-${row.id}`
    if(existing.some(item=>item.codigo===code)) continue
    const same=existing.filter(item=>item.nombre.normalize('NFC').trim().toLowerCase()===row.denominacion.normalize('NFC').trim().toLowerCase())
    if(same.length) conflicts.push({nombre:row.denominacion,ids:same.map(item=>item.id_barrio)})
    else creates.push([row.denominacion.trim(),row.comuna,code])
  }
  if(process.argv.includes('--apply')) {
    await connection.beginTransaction()
    try {
      if(creates.length) await connection.query('INSERT INTO barrio(nombre,comuna,codigo) VALUES ?',[creates])
      await connection.commit()
    } catch(error) { await connection.rollback(); throw error }
  }
  console.log(JSON.stringify({source:'https://www.datos.gov.co/resource/x5yx-u8uk.json',catalog:rows.length,create:creates.length,conflicts,applied:process.argv.includes('--apply')}))
} catch(error) { console.error(error.message); process.exitCode=1 }
finally { connection?.release(); await pool.end() }
