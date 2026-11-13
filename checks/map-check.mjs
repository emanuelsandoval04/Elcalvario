import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import mysql from 'mysql2/promise'
import express from 'express'
import { applyMigrations } from '../server/migration-runner.js'
import { planGeometryImport, validateGeometry } from '../server/geodata.js'
import { importGeodata } from '../scripts/import-geodata.mjs'
import { pickOption } from './select-helper.mjs'

const testDatabase=`calvario_map_test_${randomUUID().replaceAll('-','')}`
assert.match(testDatabase,/^calvario_map_test_[a-f0-9]{32}$/)
process.env.DB_NAME=testDatabase
const {databaseConfig}=await import('../server/config.js')
const {database,...config}=databaseConfig
const connection=await mysql.createConnection(config)
let pool,server,browser
try {
  await connection.query(`CREATE DATABASE \`${testDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
  await connection.query(`USE \`${testDatabase}\``); await applyMigrations(connection)
  pool=(await import('../server/db.js')).pool
  const {authRouter}=await import('../server/auth.js')
  const {managementRouter}=await import('../server/management.js')
  const app=express(); app.use(express.json()); app.use('/api/auth',authRouter); app.use('/api/management',managementRouter)
  server=app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve))
  const base=`http://127.0.0.1:${server.address().port}`
  process.env.APP_ORIGINS=base
  async function request(path,body,cookie='',method,expected=200) {
    const response=await fetch(`${base}/api/${path}`,{method:method || (body===undefined?'GET':'POST'),headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)})
    const data=await response.json(); assert.equal(response.status,expected,`${path}: ${JSON.stringify(data)}`)
    return {data,cookie:response.headers.get('set-cookie')?.split(';')[0]}
  }
  const password=`Check-${randomUUID()}`,accounts={}
  for(const role of ['Administrador','Discipulador','Multimedia','Asistencia Pastoral','Usuario']) {
    const result=await request('auth/register',{email:`${role.replaceAll(' ','-')}@example.invalid`,password},'','POST',201)
    accounts[role]={id:result.data.user.id,cookie:result.cookie}
    if(!['Administrador','Usuario'].includes(role)) {
      const [roles]=await pool.execute('SELECT id_rol FROM rol_sistema WHERE nombre=?',[role])
      await request(`auth/admin/users/${result.data.user.id}/role`,{roleId:roles[0].id_rol},accounts.Administrador.cookie)
    }
  }
  const admin=accounts.Administrador.cookie,disciple=accounts.Discipulador.cookie,media=accounts.Multimedia.cookie,assistant=accounts['Asistencia Pastoral'].cookie
  const endpoint='management/mapa/'
  await request(endpoint+'coberturas',undefined,'',undefined,401)
  await request(endpoint+'coberturas',undefined,accounts.Usuario.cookie,undefined,403)
  const makeMember=async (name,number)=> (await request('management/members',{nombres:name,apellidos:'Prueba',tipo_identificacion:'CC',numero_identificacion:number,celular:'3001234567',fecha_nacimiento:'1990-01-01'},admin,'POST',201)).data.id
  const leader=await makeMember('Carlos','1'),other=await makeMember('María','2'),member=await makeMember('Persona privada','3')
  await request(`management/users/${accounts.Discipulador.id}/member`,{memberId:leader},admin)
  const group=(await request('management/groups',{codigo_grupo:'T1',nombre:'Esperanza',id_discipulador:leader,dia_reunion:'Domingo',hora_reunion:'19:00',estado_grupo:'activo'},admin,'POST',201)).data.id
  const otherGroup=(await request('management/groups',{codigo_grupo:'T2',nombre:'Otro grupo',id_discipulador:other,estado_grupo:'activo'},admin,'POST',201)).data.id
  await request(`management/members/${member}`,{id_grupo:group},admin,'PATCH')
  const source=JSON.parse(await readFile('database/geodata/barrios_villavicencio.geojson','utf8'))
  const geometry=source.features[0].geometry
  await pool.execute('INSERT INTO barrio(nombre,comuna,codigo,geojson) VALUES (?,?,?,?)',['Barrio de prueba','Comuna 5','T1',JSON.stringify(geometry)])
  await pool.execute('INSERT INTO barrio(nombre,comuna,codigo) VALUES (?,?,?)',['Sin geometría','Comuna 2','T2'])
  await pool.execute('INSERT INTO barrio(nombre,comuna,codigo) VALUES (?,?,?)',['Sin cobertura','Comuna 2','T3'])
  const path=id=>endpoint+`discipuladores/${id}/barrios`
  await request(path(leader),{ids:[1,2],expectedIds:[]},disciple,'PUT',403)
  await request(path(leader),{ids:[1,2],expectedIds:[]},media,'PUT',403)
  await request(path(leader),{ids:[1,2],expectedIds:[]},assistant,'PUT')
  await request(path(other),{ids:[1],expectedIds:[]},admin,'PUT')
  await request(endpoint+`grupos/${group}/barrio`,{id_barrio:1},admin,'PUT')
  await request(endpoint+`grupos/${otherGroup}/barrio`,{id_barrio:1},admin,'PUT')
  const all=(await request(endpoint+'coberturas',undefined,admin)).data.items
  assert.equal(all.length,2); assert.equal(all[0].discipuladores.length,2); assert.equal(all[0].grupos.length,2); assert.equal(all[0].cantidadMiembros,1)
  assert.equal(all[1].cantidadMiembros,0,'No repetir grupos en todos los barrios del responsable')
  assert.ok(all[0].barrio.ubicacion)
  assert.equal(all[1].barrio.ubicacion,null)
  assert.ok(!Object.hasOwn(all[0].barrio,'geojson'),'El mapa de ubicadores no necesita enviar polígonos al navegador')
  assert.equal(all[0].discipuladores[0].fotoUrl,null)
  const samplePhoto=await readFile('public/754579914_122321841752230206_8530800205667427058_n.jpg')
  await pool.execute('INSERT INTO foto_perfil_usuario(id_usuario,contenido,version) VALUES (?,?,?)',[accounts.Discipulador.id,samplePhoto,'a'.repeat(64)])
  await pool.execute('UPDATE usuario SET id_miembro=? WHERE id_usuario=?',[other,accounts['Asistencia Pastoral'].id])
  await pool.execute('INSERT INTO foto_perfil_usuario(id_usuario,contenido,version) VALUES (?,?,?)',[accounts['Asistencia Pastoral'].id,samplePhoto,'b'.repeat(64)])
  const photographed=(await request(endpoint+'coberturas',undefined,admin)).data.items[0].discipuladores.find(item=>item.id===leader)
  assert.ok(photographed.fotoUrl.startsWith(`/api/management/mapa/discipuladores/${leader}/foto`))
  const photoResponse=await fetch(base+photographed.fotoUrl,{headers:{Cookie:admin}})
  assert.equal(photoResponse.status,200);assert.equal(photoResponse.headers.get('content-type'),'image/jpeg');assert.match(photoResponse.headers.get('cache-control'),/no-store/)
  assert.deepEqual(Buffer.from(await photoResponse.arrayBuffer()),samplePhoto)
  await request(endpoint+`discipuladores/${leader}/foto`,undefined,'',undefined,401)
  await request(endpoint+`discipuladores/${other}/foto`,undefined,disciple,undefined,404)
  await request(endpoint+`discipuladores/${member}/foto`,undefined,admin,undefined,404)
  const privateJSON=JSON.stringify((await request(endpoint+'coberturas',undefined,media)).data)
  for(const forbidden of ['celular','direccion','eps','numero_identificacion','fecha_nacimiento','Persona privada','latitud','longitud','codigo_qr','contacto_emergencia']) assert.ok(!privateJSON.includes(forbidden),forbidden)
  const own=(await request(endpoint+'coberturas',undefined,disciple)).data.items
  assert.equal(own.length,2);assert.equal(own[0].discipuladores.length,1);assert.equal(own[0].grupos.length,1);assert.ok(own[0].discipuladores[0].propio)
  assert.equal(own[0].discipuladores[0].color,own[1].discipuladores[0].color)
  await request(path(other),undefined,disciple,undefined,404)
  await request(endpoint+`grupos/${otherGroup}/barrio`,undefined,disciple,undefined,404)
  await request(path(leader),{ids:[1],expectedIds:[1,2]},admin,'PUT',409)
  await request(path(leader),{ids:[1],expectedIds:[1,2],confirmRemoval:true},admin,'PUT')
  await request(path(leader),{ids:[2],expectedIds:[1,2],confirmRemoval:true},admin,'PUT',409)
  await request(path(leader),{ids:[1,9999],expectedIds:[1]},admin,'PUT',409)
  await request(path(leader),{ids:[1,2],expectedIds:[1]},admin,'PUT')
  const [history]=await pool.execute('SELECT * FROM discipulador_barrio WHERE id_discipulador=? AND id_barrio=2 ORDER BY id_asignacion',[leader])
  assert.equal(history.length,2);assert.equal(history[0].estado,0);assert.equal(history[0].id_usuario_finaliza,accounts.Administrador.id);assert.ok(history[0].fecha_finalizacion);assert.equal(history[1].estado,1)
  await pool.execute("UPDATE miembro SET estado_miembro='inactivo' WHERE id_miembro=?",[leader])
  assert.equal((await request(endpoint+'coberturas',undefined,disciple)).data.items.length,0)
  await request(endpoint+`discipuladores/${leader}/foto`,undefined,admin,undefined,404)
  await pool.execute("UPDATE miembro SET estado_miembro='activo' WHERE id_miembro=?",[leader])

  // Import never creates a barrio, and a geometry replacement preserves identity/history.
  const collection={type:'FeatureCollection',features:[{type:'Feature',properties:{DNOCION:'Barrio de prueba'},geometry},{type:'Feature',properties:{DNOCION:'Nombre desconocido'},geometry}]}
  const preview=await importGeodata(connection,collection)
  assert.equal(preview.matched.length,1);assert.equal(preview.unmatched.length,1);assert.equal(preview.applied,false)
  await importGeodata(connection,collection,{apply:true,source:'Fuente de prueba'})
  const boundaries=JSON.parse(await readFile('database/geodata/barrios_limites_villavicencio.geojson','utf8'))
  const wholeNeighborhood=boundaries.features.find(item=>item.properties.BARRIO==='Doña Luz')
  assert.equal(wholeNeighborhood.geometry.type,'Polygon')
  assert.equal(wholeNeighborhood.geometry.coordinates.length,1)
  await connection.execute('UPDATE barrio SET geojson=?,fuente_geojson=? WHERE id_barrio=2',[JSON.stringify(geometry),'Fuente de prueba'])
  const replacement=await importGeodata(connection,{type:'FeatureCollection',features:[{type:'Feature',properties:{DNOCION:'Barrio de prueba'},geometry:wholeNeighborhood.geometry}]},{apply:true,source:'Contorno completo de prueba',retireSource:'Fuente de prueba'})
  assert.deepEqual(replacement.retired,[{id_barrio:2,nombre:'Sin geometría'}])
  const [replaced]=await connection.execute('SELECT id_barrio,geojson FROM barrio WHERE id_barrio IN (1,2) ORDER BY id_barrio')
  assert.equal(replaced[0].geojson.type,'Polygon');assert.equal(replaced[0].geojson.coordinates.length,1)
  assert.equal(replaced[1].geojson,null)
  assert.equal((await connection.execute('SELECT COUNT(*) AS n FROM barrio'))[0][0].n,3)
  assert.equal((await connection.execute('SELECT COUNT(*) AS n FROM discipulador_barrio'))[0][0].n,4)
  assert.equal(planGeometryImport({...collection,features:[collection.features[0],collection.features[0]]},[{id_barrio:1,nombre:'Barrio de prueba'}]).ambiguous.length,1)
  assert.throws(()=>validateGeometry({type:'Point',coordinates:[0,0]}))
  assert.throws(()=>validateGeometry({type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,0]]]}))
  await applyMigrations(connection)
  assert.equal((await connection.execute('SELECT COUNT(*) AS n FROM discipulador_barrio'))[0][0].n,4)

  const draft=(await request('management/groups',{codigo_grupo:'BORRADOR',nombre:'Grupo sin zonas',estado_grupo:'activo'},admin,'POST',201)).data.id
  const groupZones=endpoint+`grupos/${draft}/barrios`
  assert.deepEqual((await request(groupZones,undefined,admin)).data.items,[])
  await request(groupZones,{ids:[1,2],expectedIds:[],expectedLeaderId:null},admin,'PUT',409)
  await request(`management/groups/${draft}`,{id_discipulador:leader},admin,'PATCH')
  await request(groupZones,{ids:[1,2],expectedIds:[],expectedLeaderId:leader},media,'PUT',403)
  await request(groupZones,{ids:[1,2],expectedIds:[],expectedLeaderId:leader},admin,'PUT')
  assert.deepEqual((await request(groupZones,undefined,admin)).data.items,[{id_barrio:1},{id_barrio:2}])
  await request(groupZones,{ids:[1],expectedIds:[1,2],expectedLeaderId:other,confirmRemoval:true},admin,'PUT',409)
  await request(groupZones,{ids:[1],expectedIds:[1,2],expectedLeaderId:leader},admin,'PUT',409)
  await request(groupZones,{ids:[1],expectedIds:[1,2],expectedLeaderId:leader,confirmRemoval:true},admin,'PUT')
  await applyMigrations(connection)
  assert.deepEqual((await request(groupZones,undefined,admin)).data.items,[{id_barrio:1}])
  assert.equal((await connection.execute('SELECT estado FROM grupo_barrio_cobertura WHERE id_grupo=? AND id_barrio=2',[draft]))[0][0].estado,0)
  const writtenBarrios=Array.from({length:12},(_,index)=>`Barrio escrito número ${index+1}`).join(', ')
  assert.ok(writtenBarrios.length>100)
  const writtenGroup=(await request('management/groups',{codigo_grupo:'TEXTO',nombre:'Barrios escritos',barrio:writtenBarrios,estado_grupo:'activo'},admin,'POST',201)).data.id
  await request(`management/groups/${writtenGroup}`,{nombre:'Nombre actualizado'},admin,'PATCH')
  assert.equal((await request('management/groups',undefined,admin)).data.items.find(item=>item.id_grupo===writtenGroup).barrio,writtenBarrios)
  await request(`management/groups/${writtenGroup}`,{barrio:'Nuevo barrio, Segundo barrio\nTercer barrio'},admin,'PATCH')
  await applyMigrations(connection)
  assert.equal((await request('management/groups',undefined,admin)).data.items.find(item=>item.id_grupo===writtenGroup).barrio,'Nuevo barrio, Segundo barrio\nTercer barrio')
  await request(`management/groups/${writtenGroup}`,{barrio:'x'.repeat(10001)},admin,'PATCH',400)
  const totalGroupsBefore=(await request('management/groups',undefined,admin)).data.items.length
  await request('management/groups',{codigo_grupo:'ATOMICO-ERROR',nombre:'No debe guardarse',id_discipulador:leader,estado_grupo:'activo',barrios:{ids:[9999],expectedIds:[],expectedLeaderId:null}},admin,'POST',409)
  await request('management/groups',{codigo_grupo:'SIN-RESPONSABLE',nombre:'Sin responsable',estado_grupo:'activo',barrios:{ids:[1],expectedIds:[],expectedLeaderId:null}},admin,'POST',409)
  assert.equal((await request('management/groups',undefined,admin)).data.items.length,totalGroupsBefore,'La selección inválida no debe dejar un grupo parcial')
  await request(`management/groups/${group}`,{nombre:'No autorizado',barrios:{ids:[1],expectedIds:[1],expectedLeaderId:leader}},disciple,'PATCH',403)
  assert.equal((await request('management/groups',undefined,admin)).data.items.find(item=>item.id_grupo===group).nombre,'Esperanza')
  const selectedGroup=(await request('management/groups',{codigo_grupo:'ATOMICO-OK',nombre:'Grupo con selección integrada',id_discipulador:leader,estado_grupo:'activo',barrios:{ids:[1,2],expectedIds:[],expectedLeaderId:null}},admin,'POST',201)).data.id
  const savedCoverage=(await request(endpoint+'coberturas',undefined,admin)).data.items
  for(const id of [1,2]) assert.ok(savedCoverage.find(item=>item.barrio.id===id).grupos.some(item=>item.id_grupo===selectedGroup))

  if(process.argv.includes('--ui')) {
    const {createRequire}=await import('node:module');const require=createRequire(import.meta.url)
    const {chromium}=require('../.secrets/browser-tools/node_modules/playwright-core')
    browser=await chromium.launch({headless:true,channel:'msedge'})
    const ui=process.env.UI_ORIGIN || 'http://127.0.0.1:5173';process.env.APP_ORIGINS=`${base},${ui}`
    const context=await browser.newContext({viewport:{width:390,height:844}})
    await context.route('**/api/**',async route=>{const url=new URL(route.request().url());const response=await route.fetch({url:`${base}${url.pathname}${url.search}`});await route.fulfill({response})})
    // Deterministic network failure validates the required fallback even with a real key configured.
    if (!process.argv.includes('--google')) await context.route('https://maps.googleapis.com/**',route=>route.abort())
    else await context.route(/https:\/\/(?:maps\.(?:googleapis|gstatic|google)\.com)\//,async route=>{
      // Forward real Google responses through Node: Edge has restricted external
      // networking in this runner. No SDK responses or map tiles are fabricated.
      try {
        const response=await fetch(route.request().url(),{headers:{Referer:ui+'/', 'User-Agent':route.request().headers()['user-agent'] || ''},signal:AbortSignal.timeout(12000)})
        await route.fulfill({status:response.status,contentType:response.headers.get('content-type') || 'application/octet-stream',body:Buffer.from(await response.arrayBuffer())})
      } catch { await route.abort() }
    })
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
    const googleErrors=[]
    page.on('requestfailed',request=>{if(request.url().startsWith('https://maps.googleapis.com/')) googleErrors.push(request.failure()?.errorText)})
    page.on('console',message=>{const match=message.text().match(/Google Maps JavaScript API (?:error|warning): (\w+)/);if(match) googleErrors.push(match[1])})
    await page.goto(`${ui}/#login`)
    const markerPhoto=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#dbe9fa';ctx.fillRect(0,0,128,128);ctx.fillStyle='#486da0';ctx.beginPath();ctx.arc(64,43,23,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(64,112,44,Math.PI,Math.PI*2);ctx.fill();return canvas.toDataURL('image/jpeg')})
    await request('auth/account/photo',{photo:markerPhoto},disciple)
    await page.getByLabel('Correo electrónico',{exact:true}).fill('Administrador@example.invalid');await page.getByLabel('Contraseña',{exact:true}).fill(password)
    await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.waitForURL(`${ui}/#gestion`)
    assert.equal(await page.locator('script[src*="maps.googleapis.com"]').count(),0,'Carga diferida')
    await page.locator('.app-bottom-nav a').filter({hasText:'Mapa'}).click()
    if (process.argv.includes('--google')) {
      try { await page.locator('.coverage-map .gm-style').waitFor() }
      catch(error) { console.log('Diagnóstico Google:',JSON.stringify(googleErrors));await page.screenshot({path:'checks/map-google-error.png',fullPage:true});throw error }
      await page.waitForTimeout(4000)
      assert.equal(await page.getByText('No fue posible cargar el mapa.',{exact:true}).count(),0,'Google debe autorizar la clave configurada')
      const marker=page.getByRole('button',{name:'Ver grupos de Carlos Prueba en Barrio de prueba',exact:true})
      await marker.waitFor()
      await marker.locator('img').waitFor()
      assert.equal(await marker.locator('img').evaluate(img=>img.complete && img.naturalWidth>0),true)
      await page.screenshot({path:'checks/map-google-390.png',fullPage:true})
      await marker.click()
      await page.getByRole('dialog').getByRole('heading',{name:'Grupo de Comunión · Esperanza',exact:true}).waitFor()
      assert.equal(await page.getByRole('dialog').getByRole('heading',{name:'Grupo de Comunión · Otro grupo',exact:true}).count(),0,'El marcador abre los grupos del responsable elegido')
      await page.getByRole('dialog').getByRole('button',{name:'Cerrar',exact:true}).click()
      await page.getByRole('button',{name:'Lista',exact:true}).click()
    } else await page.getByText('No fue posible cargar el mapa.',{exact:true}).waitFor()
    await page.getByRole('button',{name:/Barrio de prueba/}).click()
    await page.getByRole('dialog').waitFor();await page.getByRole('heading',{name:'Barrio Barrio de prueba'}).waitFor()
    await page.getByRole('link',{name:'Ver grupo',exact:true}).first().click()
    await page.getByRole('heading',{name:'Esperanza',exact:true}).waitFor()
    for(const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:900});await page.goto(`${ui}/#gestion/mapa`)
      await page.getByRole('button',{name:'Lista',exact:true}).click()
      await page.getByRole('button',{name:/Barrio de prueba/}).waitFor()
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Overflow ${width}`)
      await page.screenshot({path:`checks/map-${width}.png`,fullPage:true})
    }
    await pickOption(page.getByRole('combobox',{name:'Discipulador',exact:true}),String(leader))
    await page.getByRole('button',{name:'+ Administrar barrios',exact:true}).click()
    assert.equal(await page.getByRole('checkbox').count(),0)
    await page.getByLabel('Buscar barrio',{exact:true}).fill('sin geometría')
    await page.getByRole('checkbox',{name:'Sin geometría'}).uncheck()
    await page.getByRole('button',{name:'Guardar cambios',exact:true}).click()
    await page.getByRole('heading',{name:'Confirmar retiro de cobertura'}).waitFor()
    await page.getByRole('button',{name:'Quitar y guardar cambios'}).click()
    await page.getByText('Zonas asignadas guardadas.',{exact:true}).waitFor()
    assert.deepEqual((await request(path(leader),undefined,admin)).data.items,[{id_barrio:1}])
    await page.setViewportSize({width:390,height:844})
    assert.equal(await page.getByRole('link',{name:'Agregar Grupo de Comunión',exact:true}).count(),0)
    await page.goto(`${ui}/#gestion/groups`)
    await page.getByRole('button',{name:'Nuevo grupo',exact:true}).click()
    await page.getByRole('heading',{name:'Nuevo grupo',exact:true}).waitFor()
    await page.getByText('Se asigna automáticamente al guardar',{exact:false}).waitFor()
    for(const label of ['Dirección','Latitud','Longitud','Día de reunión','Hora de reunión']) assert.equal(await page.getByLabel(label,{exact:true}).count(),0)
    await page.getByLabel('Buscar barrio o comuna',{exact:true}).fill('prueba')
    await page.getByRole('checkbox',{name:'Barrio de prueba',exact:true}).check()
    assert.equal(await page.getByLabel('Barrio',{exact:true}).count(),0)
    await page.getByLabel('Nombre',{exact:false}).fill('Grupo creado desde su sección')
    await pickOption(page.getByRole('combobox',{name:'Discipulador',exact:true}),String(leader))
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Formulario de grupo en móvil')
    await page.screenshot({path:'checks/group-create-390.png',fullPage:true})
    await page.getByRole('button',{name:'Guardar grupo',exact:true}).click()
    await page.getByRole('heading',{name:'Grupo creado desde su sección',exact:true}).waitFor()
    const created=(await request('management/groups',undefined,admin)).data.items.find(item=>item.nombre==='Grupo creado desde su sección')
    assert.ok(created);assert.match(created.codigo_grupo,/^GR-\d{2,}$/);assert.equal(created.id_discipulador,leader);assert.equal(created.estado_grupo,'activo')
    assert.equal(created.barrio,'Barrio de prueba')
    assert.deepEqual((await request(endpoint+`grupos/${created.id_grupo}/barrios`,undefined,admin)).data.items,[{id_barrio:1}])
    await page.getByRole('button',{name:'Editar grupo',exact:true}).click()
    await page.getByRole('heading',{name:'Editar registro',exact:true}).waitFor()
    assert.equal(await page.getByRole('checkbox').count(),0)
    await page.getByLabel('Buscar barrio o comuna',{exact:true}).fill('prueba')
    await page.getByRole('checkbox',{name:'Barrio de prueba',exact:true}).waitFor()
    assert.equal(await page.getByRole('checkbox',{name:'Barrio de prueba',exact:true}).isChecked(),true)
    for(const label of ['Dirección','Latitud','Longitud','Día de reunión','Hora de reunión']) assert.equal(await page.getByLabel(label,{exact:true}).count(),0)
    await page.getByLabel('Buscar barrio o comuna',{exact:true}).fill('sin geometría')
    await page.getByRole('checkbox',{name:/Sin geometría/}).check()
    await page.getByRole('button',{name:'Guardar grupo',exact:true}).click()
    await page.getByText('Barrio de prueba, Sin geometría',{exact:false}).waitFor()
    assert.equal((await request('management/groups',undefined,admin)).data.items.find(item=>item.id_grupo===created.id_grupo).barrio,'Barrio de prueba, Sin geometría')
    assert.deepEqual((await request(endpoint+`grupos/${created.id_grupo}/barrios`,undefined,admin)).data.items,[{id_barrio:1},{id_barrio:2}])
    const updatedCoverage=(await request(endpoint+'coberturas',undefined,admin)).data.items
    for(const id of [1,2]) {
      const zone=updatedCoverage.find(item=>item.barrio.id===id)
      assert.ok(zone.grupos.some(item=>item.id_grupo===created.id_grupo))
      assert.equal(zone.discipuladores.find(item=>item.id===leader).color,updatedCoverage[0].discipuladores.find(item=>item.id===leader).color)
    }
    // Exercise the production-sized municipal catalog, rather than only fixtures.
    const municipalCatalog=JSON.parse(await readFile('database/geodata/catalogo_municipal.json','utf8'))
    await connection.query('INSERT INTO barrio(nombre,comuna,codigo) VALUES ?',[municipalCatalog.map(item=>[item.denominacion,item.comuna,`test-municipal-${item.id}`])])
    // The real JSON geometries must be present to reproduce ER_OUT_OF_SORTMEMORY.
    // A catalog made only of names or NULL geometries does not expose this bug.
    const geographicImport=await importGeodata(connection,source,{apply:true,source:'Cartografía de prueba para regresión de memoria'})
    assert.ok(geographicImport.matched.length>400)
    const [geometrySizes]=await connection.execute('SELECT id_barrio,JSON_STORAGE_SIZE(geojson) AS bytes FROM barrio WHERE geojson IS NOT NULL')
    const largest=geometrySizes.reduce((best,item)=>item.bytes>best.bytes?item:best)
    assert.ok(largest.bytes>262144,'Usar un polígono mayor que el buffer de ordenación predeterminado')
    assert.equal((await request(endpoint+'barrios',undefined,admin)).data.items.length,671)
    assert.equal((await request('management/catalogs',undefined,admin)).data.barrios.length,671)
    const currentIds=(await request(path(leader),undefined,admin)).data.items.map(item=>item.id_barrio)
    await request(path(leader),{ids:[...currentIds,largest.id_barrio],expectedIds:currentIds},admin,'PUT')
    const largeCoverage=(await request(endpoint+'coberturas',undefined,admin)).data.items.find(item=>item.barrio.id===largest.id_barrio)
    assert.ok(largeCoverage?.barrio.ubicacion,'El mapa debe calcular una referencia de zona sin ordenar su JSON en MySQL')
    assert.ok(!Object.hasOwn(largeCoverage.barrio,'geojson'))
    await page.goto(`${ui}/#gestion/groups`);await page.reload()
    await page.getByRole('button',{name:'Nuevo grupo',exact:true}).click()
    // The shared catalog is sufficient even if the extra map catalog request fails.
    await context.route('**/api/management/mapa/barrios',route=>route.abort())
    await page.getByText('671 barrios disponibles · 0 seleccionados',{exact:true}).waitFor()
    assert.equal(await page.getByRole('checkbox').count(),0,'El catálogo debe permanecer recogido hasta buscar')
    await page.getByLabel('Buscar barrio o comuna',{exact:true}).fill('olimpico')
    assert.equal(await page.getByRole('checkbox').count(),2,'Solo mostrar coincidencias de la búsqueda')
    await page.getByRole('checkbox',{name:/^POPULAR OLIMPICO/}).first().check()
    await page.screenshot({path:'checks/group-catalog-390.png',fullPage:true})
    await page.getByLabel('Buscar barrio o comuna',{exact:true}).fill('sin coincidencia de prueba')
    assert.equal(await page.getByRole('checkbox').count(),0)
    await page.getByLabel('Buscar barrio o comuna',{exact:true}).fill('')
    assert.equal(await page.getByRole('checkbox').count(),0,'Al limpiar la búsqueda se recogen los resultados')
    await page.locator('details.coverage-selected > summary').click()
    await page.getByRole('button',{name:'Quitar barrio POPULAR OLIMPICO',exact:true}).waitFor()
    assert.deepEqual(errors,[])
  }
  console.log('Mapa: permisos, alcance, privacidad, conteos, historial, concurrencia, importador y migración verificados.')
} finally {
  await browser?.close();if(server) await new Promise(resolve=>server.close(resolve));await pool?.end()
  await connection.query(`DROP DATABASE IF EXISTS \`${testDatabase}\``);await connection.end()
}
