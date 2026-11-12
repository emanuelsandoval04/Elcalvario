// Narrow adapter for the Google Maps JavaScript API used here (no extra SDK dependency).
export type LatLngLiteral = { lat: number; lng: number }
type Listener = { remove(): void }
type MapsLatLng = { lat(): number; lng(): number }
export type MapsMap = {
  fitBounds(bounds: unknown, padding?: number): void; panTo(point: LatLngLiteral): void; setCenter(point: LatLngLiteral): void
  setZoom(zoom: number): void; getZoom(): number | undefined
  addListener(event: string, callback: (event: { latLng?: MapsLatLng | null }) => void): Listener
}
export type MapsMarker = {
  setMap(map: MapsMap | null): void; setPosition(point: LatLngLiteral): void; getPosition(): MapsLatLng | null | undefined
  setIcon(icon: unknown): void; setZIndex(zIndex: number): void; addListener(event: string, callback: () => void): Listener
}
export type MapsInfoWindow = { setContent(content: string | Node): void; open(options: { map: MapsMap; anchor: MapsMarker }): void; close(): void; addListener(event: string, callback: () => void): Listener }
export type MapsApi = {
  Map: new (element: HTMLElement, options: unknown) => MapsMap
  Marker: new (options: unknown) => MapsMarker
  InfoWindow: new (options?: unknown) => MapsInfoWindow
  LatLngBounds: new () => { extend(point: LatLngLiteral): void }
  event: { clearInstanceListeners(instance: unknown): void }
}
declare global { interface Window { google?: { maps: MapsApi }; calvarioMapsReady?: () => void; gm_authFailure?: () => void } }

// Villavicencio, Meta.
export const defaultCenter: LatLngLiteral = { lat: 4.142, lng: -73.6266 }
let pending: Promise<MapsApi> | null = null
let invalidated = false

export function loadGoogleMaps(): Promise<MapsApi> {
  if (window.google?.maps?.Map && !invalidated) return Promise.resolve(window.google.maps)
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  if (!key) return Promise.reject(new Error('El mapa no está configurado (falta la clave de Google Maps).'))
  if (invalidated) { delete window.google; invalidated = false }
  if (pending) return pending
  pending = new Promise<MapsApi>((resolve, reject) => {
    const script = document.createElement('script')
    let settled = false
    const fail = () => {
      invalidated = true; pending = null; script.remove()
      if (settled) return
      settled = true; window.clearTimeout(timer); delete window.calvarioMapsReady
      reject(new Error('No fue posible cargar el mapa. Revisa tu conexión e intenta de nuevo.'))
    }
    const timer = window.setTimeout(fail, 15000)
    window.calvarioMapsReady = () => {
      if (!window.google?.maps?.Map) { fail(); return }
      if (settled) return
      settled = true; window.clearTimeout(timer); delete window.calvarioMapsReady; resolve(window.google.maps)
    }
    window.gm_authFailure = fail
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key, callback: 'calvarioMapsReady', loading: 'async', v: 'quarterly', language: 'es', region: 'CO' })}`
    script.async = true; script.onerror = fail; document.head.appendChild(script)
  })
  return pending
}

// Teardrop pin drawn as an SVG path (tip at 0,0) so it can take any color.
export function pinIcon(color: string, { active = false, muted = false } = {}) {
  return {
    path: 'M 0,0 C -2,-20 -10,-22 -10,-30 A 10,10 0 1,1 10,-30 C 10,-22 2,-20 0,0 z',
    fillColor: color, fillOpacity: muted ? 0.35 : 1,
    strokeColor: '#ffffff', strokeWeight: active ? 3 : 2, scale: active ? 1.35 : 1,
  }
}
