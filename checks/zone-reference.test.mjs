import test from 'node:test'
import assert from 'node:assert/strict'
import { zoneReference } from '../server/zone-reference.js'

test('reference stays inside the zone, including holes and concave boundaries',()=>{
  const square=[[0,0],[4,0],[4,4],[0,4],[0,0]]
  assert.deepEqual(zoneReference({type:'Polygon',coordinates:[square]}),{lat:2,lng:2})
  const hole=[[1,1],[3,1],[3,3],[1,3],[1,1]]
  const withHole=zoneReference({type:'Polygon',coordinates:[square,hole]})
  assert.ok(withHole.lng<1 || withHole.lng>3 || withHole.lat<1 || withHole.lat>3)
  const concave=[[0,0],[4,0],[4,1],[1,1],[1,4],[0,4],[0,0]]
  const point=zoneReference({type:'Polygon',coordinates:[concave]})
  assert.ok(point.lat<1 || point.lng<1)
  assert.ok(point.lat>0 && point.lng>0 && point.lat<4 && point.lng<4)
})

test('reference uses the largest component and does not invent missing locations',()=>{
  const small=[[10,10],[11,10],[11,11],[10,11],[10,10]],large=[[0,0],[4,0],[4,4],[0,4],[0,0]]
  assert.deepEqual(zoneReference({type:'MultiPolygon',coordinates:[[small],[large]]}),{lat:2,lng:2})
  assert.equal(zoneReference(null),null)
  assert.equal(zoneReference({type:'Point',coordinates:[0,0]}),null)
})
