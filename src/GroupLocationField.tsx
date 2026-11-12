import { useEffect, useRef, useState } from 'react'
import { defaultCenter, loadGoogleMaps, pinIcon } from './google-maps'
import type { LatLngLiteral, MapsMap, MapsMarker } from './google-maps'
import './groups-map.css'

const toPoint = (lat: unknown, lng: unknown): LatLngLiteral | null => {
  if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') return null
  const point = { lat: Number(lat), lng: Number(lng) }
  return Number.isFinite(point.lat) && Number.isFinite(point.lng) ? point : null
}
const rounded = (value: number) => Math.round(value * 1e7) / 1e7

// Small map inside the group form: a click places a draggable pin; latitude and longitude go in hidden fields.
export default function GroupLocationField({ initialLat, initialLng, color, disabled, labelledBy }: { initialLat: unknown; initialLng: unknown; color: string; disabled: boolean; labelledBy: string }) {
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<MapsMap | null>(null), marker = useRef<MapsMarker | null>(null)
  const [point, setPoint] = useState<LatLngLiteral | null>(() => toPoint(initialLat, initialLng))
  const [error, setError] = useState(''), [ready, setReady] = useState(false)
  const disabledRef = useRef(disabled); disabledRef.current = disabled
  useEffect(() => {
    let cancelled = false
    void loadGoogleMaps().then(api => {
      if (cancelled || !host.current) return
      const start = toPoint(initialLat, initialLng)
      const instance = new api.Map(host.current, { center: start || defaultCenter, zoom: start ? 16 : 13, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false, gestureHandling: 'cooperative' })
      map.current = instance
      const place = (next: LatLngLiteral) => {
        if (!marker.current) {
          marker.current = new api.Marker({ map: instance, position: next, draggable: true, icon: pinIcon(color, { active: true }), title: 'Ubicación del grupo (arrástrala para ajustar)' })
          marker.current.addListener('dragend', () => { const position = marker.current?.getPosition(); if (position) setPoint({ lat: rounded(position.lat()), lng: rounded(position.lng()) }) })
        } else { marker.current.setMap(instance); marker.current.setPosition(next) }
        setPoint({ lat: rounded(next.lat), lng: rounded(next.lng) })
      }
      if (start) place(start)
      instance.addListener('click', event => { if (!disabledRef.current && event.latLng) place({ lat: event.latLng.lat(), lng: event.latLng.lng() }) })
      setReady(true)
    }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'No fue posible cargar el mapa.') })
    return () => { cancelled = true; marker.current?.setMap(null); marker.current = null; map.current = null }
  }, [])
  useEffect(() => { marker.current?.setIcon(pinIcon(color, { active: true })) }, [color])
  function clear() { marker.current?.setMap(null); setPoint(null) }
  return <div className="group-location" aria-labelledby={labelledBy}>
    <input type="hidden" name="latitud" value={point ? String(point.lat) : ''}/>
    <input type="hidden" name="longitud" value={point ? String(point.lng) : ''}/>
    <p className="group-location-hint">Haz clic en el mapa para marcar dónde se reúne el grupo. Puedes arrastrar el marcador para ajustarlo. Marca el punto o escribe la dirección: una de las dos es obligatoria.</p>
    {error ? <p className="group-location-error" role="alert">{error} Escribe la dirección del grupo.</p> : <div ref={host} className="group-location-map" role="application" aria-label="Mapa para ubicar el grupo"/>}
    {!error && !ready && <p role="status" className="group-location-hint">Cargando mapa…</p>}
    <div className="group-location-status" role="status">{point ? <><span>Punto marcado: {point.lat.toFixed(5)}, {point.lng.toFixed(5)}</span><button type="button" className="secondary" disabled={disabled} onClick={clear}>Quitar punto</button></> : <span>Sin punto marcado.</span>}</div>
  </div>
}
