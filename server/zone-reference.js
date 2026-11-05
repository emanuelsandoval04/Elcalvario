// A reference point inside the imported zone, never a member's home address.
export function zoneReference(geometry) {
  if(!geometry || !['Polygon','MultiPolygon'].includes(geometry.type)) return null
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates
  const area=ring=>ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1]},0)
  const insideRing=(point,ring)=>{
    let inside=false
    for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
      const [x,y]=ring[i],[px,py]=ring[j]
      if((y>point[1])!==(py>point[1]) && point[0]<(px-x)*(point[1]-y)/(py-y)+x) inside=!inside
    }
    return inside
  }
  const sorted=[...polygons].sort((a,b)=>Math.abs(area(b[0]))-Math.abs(area(a[0])))
  for(const polygon of sorted) {
    const ring=polygon[0]
    if(!ring?.length) continue
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity
    for(const [x,y] of ring){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y)}
    const inside=p=>insideRing(p,ring) && !polygon.slice(1).some(hole=>insideRing(p,hole))
    const center=[(minX+maxX)/2,(minY+maxY)/2]
    if(inside(center)) return {lat:center[1],lng:center[0]}
    // Scan several interior lines, choosing a segment whose midpoint is inside.
    for(const fraction of [.5,.25,.75,.125,.875,.375,.625]) {
      const y=minY+(maxY-minY)*fraction,xs=[]
      for(const boundary of polygon) for(let i=1;i<boundary.length;i++) {
        const a=boundary[i-1],b=boundary[i]
        if((a[1]>y)!==(b[1]>y)) xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]))
      }
      xs.sort((a,b)=>a-b)
      const intervals=xs.slice(1).map((x,i)=>({width:x-xs[i],point:[(x+xs[i])/2,y]})).sort((a,b)=>b.width-a.width)
      const match=intervals.find(item=>inside(item.point))
      if(match) return {lat:match.point[1],lng:match.point[0]}
    }
  }
  return null
}
