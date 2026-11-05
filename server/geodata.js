// GeoJSON RFC 7946: longitude, latitude, WGS84. Reject projected coordinates.
export function validateGeometry(geometry) {
  if (!geometry || !['Polygon','MultiPolygon'].includes(geometry.type)) throw new Error('Solo se admiten Polygon y MultiPolygon.')
  const polygons=geometry.type==='Polygon' ? [geometry.coordinates] : geometry.coordinates
  if(!Array.isArray(polygons) || !polygons.length) throw new Error('Geometría vacía.')
  let points=0
  for(const polygon of polygons) {
    if(!Array.isArray(polygon) || !polygon.length) throw new Error('Polígono vacío.')
    for(const ring of polygon) {
      if(!Array.isArray(ring) || ring.length<4) throw new Error('Anillo incompleto.')
      for(const point of ring) {
        if(!Array.isArray(point) || point.length<2 || !point.every(Number.isFinite) || point[0]<-74.3 || point[0]>-72.8 || point[1]<3.5 || point[1]>4.7) throw new Error('Coordenadas fuera de Villavicencio o CRS distinto de WGS84.')
        if(++points>200000) throw new Error('Geometría demasiado grande.')
      }
      if(ring[0][0]!==ring.at(-1)[0] || ring[0][1]!==ring.at(-1)[1]) throw new Error('El anillo no está cerrado.')
      let area=0
      for(let i=1;i<ring.length;i++) area+=ring[i-1][0]*ring[i][1]-ring[i][0]*ring[i-1][1]
      if(Math.abs(area)<1e-14) throw new Error('Anillo sin área.')
    }
  }
  return geometry
}

// Deliberately conservative: spelling/accent differences need explicit review.
const nameKey = value => String(value || '').normalize('NFC').trim().toLocaleLowerCase('es')
export function planGeometryImport(collection, barrios, { nameProperty='DNOCION', mappings={} }={}) {
  if(collection?.type!=='FeatureCollection' || !Array.isArray(collection.features) || collection.features.length>5000) throw new Error('Se requiere un FeatureCollection de hasta 5000 barrios.')
  if(collection.crs && !/4326|CRS84/i.test(JSON.stringify(collection.crs))) throw new Error('Convierte el archivo a WGS84 (EPSG:4326).')
  const report={matched:[],unmatched:[],ambiguous:[],invalid:[]}, candidates=new Map()
  for(const feature of collection.features) {
    const name=feature.properties?.[nameProperty]
    if(typeof name!=='string' || !name.trim()) { report.invalid.push({name:'',reason:'Nombre ausente.'}); continue }
    try { validateGeometry(feature.geometry) } catch(error) { report.invalid.push({name,reason:error.message}); continue }
    const mapped=Object.hasOwn(mappings,name) ? mappings[name] : undefined
    const matches=mapped!==undefined ? barrios.filter(row=>row.id_barrio===mapped) : barrios.filter(row=>nameKey(row.nombre)===nameKey(name))
    if(!matches.length) { report.unmatched.push({name}); continue }
    if(matches.length!==1) { report.ambiguous.push({name,ids:matches.map(row=>row.id_barrio)}); continue }
    const id=matches[0].id_barrio
    if(!candidates.has(id)) candidates.set(id,[])
    candidates.get(id).push({id,name,geometry:feature.geometry})
  }
  for(const [id,features] of candidates) {
    // Duplicate source names can be different sectors. Never guess which one wins.
    if(features.length!==1) report.ambiguous.push({id,names:features.map(feature=>feature.name),reason:'Varias geometrías para el mismo barrio.'})
    else report.matched.push(features[0])
  }
  return report
}
