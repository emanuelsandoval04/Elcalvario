// Narrow adapter for the API used here, without another SDK dependency.
export type MapFeature = { getId(): string | number | undefined; getProperty(name: string): unknown; getGeometry(): { forEachLatLng(callback: (point: unknown) => void): void } | null }
type Listener = { remove(): void }
export type CoverageMap = {
  data: { addGeoJson(data: unknown): MapFeature[]; forEach(callback: (feature: MapFeature) => void): void; remove(feature: MapFeature): void; setStyle(style: unknown): void; overrideStyle(feature: MapFeature, style: unknown): void; revertStyle(): void; addListener(event: string, callback: (event: { feature: MapFeature }) => void): Listener }
  fitBounds(bounds: unknown, padding?: number): void; getZoom(): number | undefined; setZoom(zoom: number): void
  panTo(point: { lat: number; lng: number }): void
}
export type MapOverlay = { onAdd(): void; draw(): void; onRemove(): void; setMap(map: CoverageMap | null): void; getPanes(): { overlayMouseTarget: HTMLElement } | null; getProjection(): { fromLatLngToDivPixel(point: unknown): { x: number; y: number } | null } | undefined }
export type MapsApi = { Map: new (element: HTMLElement, options: unknown) => CoverageMap; LatLng: new (lat: number, lng: number) => unknown; OverlayView: { new (): MapOverlay; preventMapHitsAndGesturesFrom(element: HTMLElement): void }; LatLngBounds: new () => { extend(point: unknown): void }; event: { clearInstanceListeners(instance: unknown): void; addListenerOnce(instance: unknown, event: string, callback: () => void): Listener } }
declare global { interface Window { google?: { maps: MapsApi }; calvarioMapsReady?: () => void; gm_authFailure?: () => void } }
let pending: Promise<MapsApi> | null = null
let invalidated = false
export function loadGoogleMaps(): Promise<MapsApi> {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  if (!key) return Promise.reject(new Error('No fue posible cargar el mapa.'))
  if (invalidated) { delete window.google; invalidated = false }
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps)
  if (pending) return pending
  pending = new Promise<MapsApi>((resolve, reject) => {
    const script = document.createElement('script')
    let settled = false
    const fail = () => {
      invalidated = true; pending = null; script.remove()
      window.dispatchEvent(new Event('calvario-map-error'))
      if (settled) return
      settled = true; clearTimeout(timer); delete window.calvarioMapsReady
      reject(new Error('No fue posible cargar el mapa.'))
    }
    const timer = window.setTimeout(fail, 15000)
    window.calvarioMapsReady = () => {
      if (!window.google?.maps?.Map) { fail(); return }
      if (settled) return
      settled = true; clearTimeout(timer); resolve(window.google.maps); delete window.calvarioMapsReady
    }
    window.gm_authFailure = fail
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key, callback: 'calvarioMapsReady', loading: 'async', v: 'quarterly', language: 'es', region: 'CO' })}`
    script.async = true; script.onerror = fail; document.head.appendChild(script)
  })
  return pending
}
