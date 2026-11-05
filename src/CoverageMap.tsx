import { useEffect, useRef, useState } from 'react'
import type { AuthUser } from './auth'
import { hasPermission } from './auth'
import { managementRequest as api } from './management-api'
import { AdminIcon } from './AdminFrame'
import { CoverageAssignments, canManageCoverage } from './CoverageAssignments'
import { loadGoogleMaps } from './google-maps'
import type { CoverageMap as GoogleMap, MapsApi } from './google-maps'
import { createCoverageMarker } from './coverage-marker'
import AppSelect from './AppSelect'
import './map.css'

type Coverage = { barrio: { id: number; nombre: string; comuna: string | null; ubicacion: { lat: number; lng: number } | null }; discipuladores: { id: number; nombre: string; color: string; propio: boolean; fotoUrl: string | null }[]; grupos: { id_grupo: number; nombre: string; id_discipulador: number; dia_reunion: string | null; hora_reunion: string | null; miembros: number }[]; cantidadMiembros: number }
const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

function LeaderAvatar({ photo, name }: { photo: string | null; name: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  return <span className="coverage-person-avatar" aria-hidden="true">{photo && failed !== photo ? <img src={photo} alt="" onError={() => setFailed(photo)}/> : name.split(/\s+/).filter(Boolean).map(word => word[0]).slice(0, 2).join('')}</span>
}

function NeighborhoodSheet({ coverage, leaderId, user, onClose }: { coverage: Coverage; leaderId: number | null; user: AuthUser; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'; dialog.current?.showModal()
    return () => { document.body.style.overflow = oldOverflow; previous?.focus({ preventScroll: true }) }
  }, [])
  return <dialog ref={dialog} className="coverage-sheet" aria-labelledby="coverage-sheet-title" onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === dialog.current) onClose() }}>
    <div className="coverage-sheet-body"><div className="manage-section-heading"><div><p>{coverage.barrio.comuna || 'Comuna sin registrar'}</p><h2 id="coverage-sheet-title">Barrio {coverage.barrio.nombre}</h2></div><button type="button" className="secondary" autoFocus onClick={onClose}>Cerrar</button></div>
      <p>{leaderId ? coverage.grupos.filter(group => group.id_discipulador === leaderId).reduce((sum, group) => sum + Number(group.miembros), 0) : coverage.cantidadMiembros} discípulos activos en grupos de esta zona</p>
      {coverage.discipuladores.filter(leader => !leaderId || leader.id === leaderId).map(leader => <section key={leader.id} className="coverage-responsible"><div className="coverage-person-heading"><LeaderAvatar photo={leader.fotoUrl} name={leader.nombre}/><div><h3>Discipulador</h3><p><strong>{leader.nombre}</strong> {leader.propio && <span className="coverage-own">Tus zonas</span>}</p></div></div>
        {coverage.grupos.filter(group => group.id_discipulador === leader.id).map(group => <article key={group.id_grupo}><h4>Grupo de Comunión · {group.nombre}</h4><p>{group.miembros} discípulos · {group.dia_reunion || 'Día pendiente'} / {group.hora_reunion?.slice(0, 5) || 'Horario pendiente'}</p><div className="manage-actions"><a className="app-action secondary" href={`#gestion/groups/ficha/${group.id_grupo}`} onClick={onClose}>Ver grupo</a>{hasPermission(user, 'miembros.ver') && <a className="app-action secondary" href={`#gestion/members/grupo/${group.id_grupo}`} onClick={onClose}>Ver miembros</a>}</div></article>)}
        {!coverage.grupos.some(group => group.id_discipulador === leader.id) && <p>Sin grupos vinculados a este barrio.</p>}
      </section>)}
      {!coverage.barrio.ubicacion && <p>La ubicación de referencia de este barrio está pendiente.</p>}
    </div>
  </dialog>
}

export default function CoverageMap({ user }: { user: AuthUser }) {
  const [items, setItems] = useState<Coverage[]>([]), [loading, setLoading] = useState(true), [dataError, setDataError] = useState('')
  const [mode, setMode] = useState<'map' | 'list'>('map'), [search, setSearch] = useState(''), [selected, setSelected] = useState<Coverage | null>(null)
  const [selectedLeaderId, setSelectedLeaderId] = useState<number | null>(null)
  const [mapError, setMapError] = useState(false), [mapReady, setMapReady] = useState(false), [retry, setRetry] = useState(0)
  const [leaders, setLeaders] = useState<{ id_miembro: number; nombre: string }[]>([]), [leaderId, setLeaderId] = useState('')
  const host = useRef<HTMLDivElement>(null), map = useRef<GoogleMap | null>(null), maps = useRef<MapsApi | null>(null)
  const markers = useRef<Map<number, ReturnType<typeof createCoverageMarker>>>(new Map()), highlightTimer = useRef<number | undefined>(undefined)
  const fitted = useRef(false)
  const selectRef = useRef<(item: Coverage, leaderId?: number) => void>(() => {})
  async function load() {
    setLoading(true); setDataError('')
    try { setItems((await api<{ items: Coverage[] }>('mapa/coberturas')).items) }
    catch (error) { setItems([]); setDataError((error as Error).message) } finally { setLoading(false) }
  }
  useEffect(() => {
    void load()
    const refresh = () => void load()
    window.addEventListener('calvario-coverage-updated', refresh)
    return () => window.removeEventListener('calvario-coverage-updated', refresh)
  }, [])
  useEffect(() => {
    if (!canManageCoverage(user)) return
    void api<{ items: { id_miembro: number; nombre: string }[] }>('mapa/discipuladores').then(result => setLeaders(result.items)).catch(error => setDataError(error.message))
  }, [user])
  useEffect(() => {
    let active = true
    const failed = () => { if (active) { setMapError(true); setMode('list'); setMapReady(false) } }
    window.addEventListener('calvario-map-error', failed)
    void loadGoogleMaps().then(api => {
      if (!active || !host.current) return
      maps.current = api
      const instance = new api.Map(host.current, { center: { lat: 4.142, lng: -73.6266 }, zoom: 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: true, gestureHandling: 'cooperative', clickableIcons: false })
      map.current = instance
      setMapReady(true)
    }).catch(failed)
    return () => {
      active = false; window.removeEventListener('calvario-map-error', failed); window.clearTimeout(highlightTimer.current)
      markers.current.forEach(marker => marker.remove()); markers.current.clear(); fitted.current = false
      if (map.current && maps.current) maps.current.event.clearInstanceListeners(map.current)
      map.current = null
    }
  }, [retry])
  const filtered = items.filter(item => normalize(`${item.barrio.nombre} ${item.barrio.comuna || ''} ${item.discipuladores.map(leader => leader.nombre).join(' ')} ${item.grupos.map(group => group.nombre).join(' ')}`).includes(normalize(search)))
  const filterIds = filtered.map(item => item.barrio.id).join(',')
  useEffect(() => {
    const instance = map.current, api = maps.current
    if (!instance || !api || !mapReady) return
    window.clearTimeout(highlightTimer.current); markers.current.forEach(marker => marker.remove()); markers.current.clear()
    const bounds = new api.LatLngBounds()
    let located = 0
    for (const item of items) {
      if (!item.barrio.ubicacion) continue
      markers.current.set(item.barrio.id, createCoverageMarker(api, instance, item.barrio.ubicacion, item.barrio.nombre, item.discipuladores, personId => selectRef.current(item, personId)))
      bounds.extend(item.barrio.ubicacion); located++
    }
    if (located && !fitted.current) {
      fitted.current = true; instance.fitBounds(bounds, 100)
      api.event.addListenerOnce(instance, 'idle', () => { if ((instance.getZoom() || 0) > 15) instance.setZoom(15) })
    }
  }, [items, mapReady])
  useEffect(() => {
    const visible = new Set(filtered.map(item => item.barrio.id))
    markers.current.forEach((marker, id) => marker.show(visible.has(id)))
  }, [items, filterIds, mapReady])
  function select(item: Coverage, leaderId?: number) {
    setSelected(item); setSelectedLeaderId(leaderId || null)
    if (!mapError) setMode('map')
    const marker = markers.current.get(item.barrio.id), instance = map.current
    if (!item.barrio.ubicacion || !marker || !instance) return
    window.requestAnimationFrame(() => {
      instance.panTo(item.barrio.ubicacion!); instance.setZoom(15)
      markers.current.forEach(item => item.highlight(false)); marker.highlight(true)
      window.clearTimeout(highlightTimer.current)
      highlightTimer.current = window.setTimeout(() => marker.highlight(false), 3500)
    })
  }
  selectRef.current = select
  const legend = [...new Map(filtered.flatMap(item => item.discipuladores).map(leader => [leader.id, leader])).values()]
  return <section className="coverage-page"><div className="manage-section-heading"><div><h2>Mapa de zonas</h2><p className="section-caption">Cobertura pastoral de nuestra comunidad en Villavicencio.</p></div></div>
    <label className="coverage-search"><span>Buscar barrio o discipulador</span><input type="search" placeholder="Barrio, comuna, discipulador o grupo" value={search} maxLength={150} onChange={event => setSearch(event.target.value)}/></label>
    <div className="coverage-tabs" role="group" aria-label="Vista de cobertura"><button type="button" aria-pressed={mode === 'map'} disabled={mapError} onClick={() => setMode('map')}><AdminIcon name="mapa"/>Mapa</button><button type="button" aria-pressed={mode === 'list'} onClick={() => setMode('list')}><AdminIcon name="more"/>Lista</button></div>
    {dataError && <div role="alert"><p>{dataError}</p><button type="button" onClick={() => void load()}>Volver a cargar coberturas</button></div>}
    {mapError && <div className="coverage-fallback" role="status"><p>No fue posible cargar el mapa.</p><button type="button" className="secondary" onClick={() => { setMapError(false); setMapReady(false); setMode('map'); setRetry(value => value + 1) }}>Reintentar</button></div>}
    <div hidden={mode !== 'map'}><div ref={host} className="coverage-map" aria-label="Mapa de cobertura pastoral de Villavicencio"/>{!mapReady && !mapError && <p role="status">Cargando Google Maps…</p>}<p className="coverage-note">Toca la foto o el nombre del discipulador para ver sus grupos en esa zona.</p></div>
    {loading ? <p role="status">Cargando coberturas…</p> : !dataError && !filtered.length ? <p className="app-empty">{search ? 'No encontramos coberturas para esta búsqueda.' : 'Todavía no hay barrios con un discipulador activo asignado.'}</p> : (mode === 'list' || Boolean(search)) && <div className="coverage-list" aria-label="Barrios con cobertura">{filtered.map(item => <button type="button" key={item.barrio.id} onClick={() => select(item)}><LeaderAvatar photo={item.discipuladores[0].fotoUrl} name={item.discipuladores[0].nombre}/><span><strong>{item.barrio.nombre}</strong><span>{item.barrio.comuna}</span><span>{item.discipuladores.map(leader => `${leader.nombre}${leader.propio ? ' · Tus zonas' : ''}`).join(' / ')}</span><span>{item.cantidadMiembros} discípulos en grupos vinculados{!item.barrio.ubicacion ? ' · Ubicación pendiente' : ''}</span></span><AdminIcon name="chevron"/></button>)}</div>}
    {!!legend.length && <div className="coverage-legend" aria-label="Discipuladores y colores">{legend.map(leader => <span key={leader.id}><span className="coverage-dot" style={{ backgroundColor: leader.color }}/>{leader.nombre}{leader.propio && <b> · Tus zonas</b>}</span>)}</div>}
    <p className="coverage-note">Los marcadores representan zonas de cobertura, no viviendas ni ubicaciones personales.</p>
    {canManageCoverage(user) && <section className="manage-editor"><h3>Administrar zonas de discipuladores</h3><label>Discipulador<AppSelect value={leaderId} onChange={event => setLeaderId(event.target.value)}><option value="">Selecciona un discipulador</option>{leaders.map(leader => <option key={leader.id_miembro} value={leader.id_miembro}>{leader.nombre}</option>)}</AppSelect></label>{leaderId && <CoverageAssignments key={leaderId} id={Number(leaderId)} name={leaders.find(leader => leader.id_miembro === Number(leaderId))?.nombre || ''} user={user}/>}</section>}
    {selected && <NeighborhoodSheet coverage={selected} leaderId={selectedLeaderId} user={user} onClose={() => setSelected(null)}/>}
  </section>
}
