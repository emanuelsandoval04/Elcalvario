import type { CoverageMap, MapsApi } from './google-maps'

type Person = { id: number; nombre: string; color: string; fotoUrl: string | null }
export function createCoverageMarker(api: MapsApi, map: CoverageMap, location: { lat: number; lng: number }, zone: string, people: Person[], onSelect: (personId: number) => void) {
  const overlay = new api.OverlayView(), root = document.createElement('div')
  root.className = 'coverage-photo-pin'
  root.style.setProperty('--pin-color', people[0].color)
  const zoneLabel = document.createElement('span'); zoneLabel.className = 'coverage-pin-zone'; zoneLabel.textContent = zone; root.appendChild(zoneLabel)
  for (const person of people) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'coverage-pin-person'
    button.setAttribute('aria-label', `Ver grupos de ${person.nombre} en ${zone}`)
    const avatar = document.createElement('span'); avatar.className = 'coverage-pin-avatar'; avatar.style.backgroundColor = person.color
    const initials = person.nombre.split(/\s+/).filter(Boolean).map(word => word[0]); avatar.textContent = `${initials[0] || ''}${initials.length > 1 ? initials.at(-1) : ''}`.toUpperCase()
    avatar.setAttribute('aria-hidden', 'true')
    if (person.fotoUrl) {
      const photo = document.createElement('img'); photo.src = person.fotoUrl; photo.alt = ''; photo.width = 56; photo.height = 56
      photo.onerror = () => photo.remove(); avatar.appendChild(photo)
    }
    const name = document.createElement('span'); name.className = 'coverage-pin-name'; name.textContent = person.nombre
    const hint = document.createElement('small'); hint.textContent = 'Ver grupo'; name.appendChild(hint)
    button.append(avatar, name); button.onclick = () => onSelect(person.id)
    root.appendChild(button)
  }
  api.OverlayView.preventMapHitsAndGesturesFrom(root)
  overlay.onAdd = () => { overlay.getPanes()?.overlayMouseTarget.appendChild(root) }
  overlay.draw = () => {
    const pixel = overlay.getProjection().fromLatLngToDivPixel(new api.LatLng(location.lat, location.lng))
    if (pixel) { root.style.left = `${pixel.x}px`; root.style.top = `${pixel.y}px` }
  }
  overlay.onRemove = () => root.remove()
  overlay.setMap(map)
  return { remove: () => overlay.setMap(null), highlight: (value: boolean) => { root.dataset.selected = String(value) }, show: (visible: boolean) => { root.style.display = visible ? '' : 'none' } }
}
