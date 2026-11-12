import { useEffect, useRef, useState } from 'react'
import { managementRequest as api } from './management-api'
import { defaultCenter, loadGoogleMaps, pinIcon } from './google-maps'
import type { MapsApi, MapsInfoWindow, MapsMap, MapsMarker } from './google-maps'
import { groupColor } from './group-colors'
import './groups-map.css'

type Row = Record<string, string | number | null>
const located = (row: Row) => row.latitud != null && row.longitud != null && row.latitud !== '' && row.longitud !== ''
const position = (row: Row) => ({ lat: Number(row.latitud), lng: Number(row.longitud) })
const hashGroup = () => { const match = window.location.hash.match(/^#gestion\/mapa\/grupo\/(\d+)/); return match ? Number(match[1]) : null }

// Card shown inside the map over the pin: group name and its discipulador; tapping it opens the group.
// Built as DOM (never as HTML text).
function details(row: Row) {
  const card = document.createElement('a'); card.className = 'groups-map-info'; card.href = `#gestion/groups/ficha/${row.id_grupo}`
  card.setAttribute('aria-label', `Abrir el grupo ${row.nombre}`)
  const title = document.createElement('strong'); title.textContent = String(row.nombre)
  const leader = document.createElement('span'); leader.className = 'groups-map-info-leader'; leader.textContent = row.discipulador_nombre ? `Discipulador: ${row.discipulador_nombre}` : 'Sin discipulador asignado'
  const extra = document.createElement('small'); extra.textContent = [`${row.miembros ?? 0} discípulos`, row.direccion ? String(row.direccion) : ''].filter(Boolean).join(' · ')
  const open = document.createElement('span'); open.className = 'groups-map-info-open'; open.textContent = 'Abrir grupo →'
  card.append(title, leader, extra, open)
  return card
}

export default function GroupsMap() {
  const host = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapsMap | null>(null), info = useRef<MapsInfoWindow | null>(null)
  const markers = useRef(new Map<number, { marker: MapsMarker; row: Row }>())
  const [groups, setGroups] = useState<Row[] | null>(null)
  const [error, setError] = useState(''), [mapError, setMapError] = useState(''), [ready, setReady] = useState(false)
  const [active, setActive] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  async function load() {
    try { setGroups((await api<{ items: Row[] }>('groups')).items); setError('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos cargar los grupos.') }
  }
  useEffect(() => { void load() }, [])

  function paint(openId: number | null) {
    for (const [id, { marker, row }] of markers.current) {
      marker.setIcon(pinIcon(groupColor(row.nombre), { active: id === openId, muted: openId !== null && id !== openId }))
      marker.setZIndex(id === openId ? 1000 : 1)
    }
  }
  function open(id: number, focusMap = true) {
    const entry = markers.current.get(id), map = mapRef.current
    if (!entry || !map || !info.current) return
    info.current.setContent(details(entry.row))
    info.current.open({ map, anchor: entry.marker })
    map.panTo(position(entry.row))
    if ((map.getZoom() || 0) < 15) map.setZoom(15)
    paint(id); setActive(id)
    if (focusMap) host.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
  const openRef = useRef(open); openRef.current = open

  // Map with one colored pin per located group, fitted so every pin is visible.
  useEffect(() => {
    if (!groups || !host.current) return
    let cancelled = false
    void loadGoogleMaps().then((maps: MapsApi) => {
      if (cancelled || !host.current) return
      const map = mapRef.current || new maps.Map(host.current, { center: defaultCenter, zoom: 13, mapTypeControl: false, streetViewControl: false, fullscreenControl: true, clickableIcons: false })
      mapRef.current = map
      if (!info.current) { info.current = new maps.InfoWindow({ maxWidth: 280 }); info.current.addListener('closeclick', () => { paint(null); setActive(null) }) }
      for (const { marker } of markers.current.values()) { marker.setMap(null); maps.event.clearInstanceListeners(marker) }
      markers.current.clear()
      const placed = groups.filter(located)
      const bounds = new maps.LatLngBounds()
      for (const row of placed) {
        const id = Number(row.id_grupo)
        const marker = new maps.Marker({ map, position: position(row), title: String(row.nombre), icon: pinIcon(groupColor(row.nombre)), zIndex: 1 })
        marker.addListener('click', () => openRef.current(id, false))
        markers.current.set(id, { marker, row })
        bounds.extend(position(row))
      }
      if (placed.length === 1) { map.setCenter(position(placed[0])); map.setZoom(16) }
      else if (placed.length > 1) map.fitBounds(bounds, 60)
      setReady(true)
      const wanted = hashGroup()
      if (wanted && markers.current.has(wanted)) openRef.current(wanted, false)
    }).catch(cause => { if (!cancelled) setMapError(cause instanceof Error ? cause.message : 'No fue posible cargar el mapa.') })
    return () => { cancelled = true }
  }, [groups])

  useEffect(() => {
    const follow = () => { const id = hashGroup(); if (id) openRef.current(id) }
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [])

  const term = search.trim().toLowerCase()
  const list = (groups || []).filter(row => !term || `${row.nombre} ${row.direccion || ''} ${row.discipulador_nombre || ''}`.toLowerCase().includes(term))
  const placedCount = (groups || []).filter(located).length
  return <section className="groups-map-page">
    <p className="section-caption">Cada Grupo de Comunión con su color. Toca un pin o “Ver en el mapa” para ver sus datos.</p>
    {error && <p role="alert">{error} <button type="button" className="secondary" onClick={() => void load()}>Reintentar</button></p>}
    <div className="groups-map-layout">
      <div className="groups-map-frame">
        {mapError ? <p className="groups-map-error" role="alert">{mapError}</p> : <div ref={host} className="groups-map" role="application" aria-label="Mapa de los Grupos de Comunión"/>}
        {!mapError && !ready && <p role="status" className="groups-map-loading">Cargando mapa…</p>}
        {groups && <p className="groups-map-count">{placedCount === 1 ? '1 grupo ubicado' : `${placedCount} grupos ubicados`}{groups.length > placedCount ? ` · ${groups.length - placedCount} sin ubicación` : ''}</p>}
      </div>
      <div className="groups-map-list">
        <label className="groups-map-search">Buscar grupo<input type="search" value={search} maxLength={100} placeholder="Nombre, dirección o discipulador" onChange={event => setSearch(event.target.value)}/></label>
        {!groups && !error && <p role="status">Cargando grupos…</p>}
        {groups && !list.length && <p className="app-empty">{groups.length ? 'No hay grupos con esa búsqueda.' : 'Aún no hay Grupos de Comunión.'}</p>}
        <ul>{list.map(row => {
          const id = Number(row.id_grupo)
          return <li key={id} className="groups-map-card" data-active={active === id || undefined}>
            <span className="groups-map-dot" style={{ background: groupColor(row.nombre) }} aria-hidden="true"/>
            <div><strong>{row.nombre}</strong><span>{row.miembros} discípulos{row.discipulador_nombre ? ` · ${row.discipulador_nombre}` : ''}</span><span>{row.direccion || (located(row) ? 'Ubicado en el mapa' : 'Sin ubicación')}</span></div>
            {located(row) ? <button type="button" className="secondary" disabled={!ready} onClick={() => open(id)}>Ver en el mapa</button> : <a className="app-action secondary" href={`#gestion/groups/ficha/${id}`}>Ubicar</a>}
          </li>
        })}</ul>
      </div>
    </div>
  </section>
}
