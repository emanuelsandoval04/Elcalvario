import { pool } from './db.js'

const spanish = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })
export const compareNeighborhoodNames = (left,right) => spanish.compare(left || '',right || '')

// MySQL filesort can carry the large JSON value used by IS NOT NULL into its
// sort tuples. Fetch the small projection without ORDER BY and sort references
// in Node, avoiding ER_OUT_OF_SORTMEMORY with the default MySQL sort buffer.
export async function readNeighborhoodCatalog(connection=pool) {
  const [items]=await connection.execute('SELECT id_barrio,nombre,comuna,(geojson IS NOT NULL) AS tiene_geometria FROM barrio WHERE estado=1')
  return items.sort((a,b)=>compareNeighborhoodNames(a.comuna,b.comuna) || compareNeighborhoodNames(a.nombre,b.nombre) || a.id_barrio-b.id_barrio)
}
