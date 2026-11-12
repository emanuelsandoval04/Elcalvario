import { useEffect, useId, useRef, useState } from 'react'
import { managementRequest } from './management-api'
import './event-image-field.css'

// Same limits as server/activity-images.js.
const maxSide = 1600
const maxBytes = 900 * 1024
const uploadedPrefix = '/api/public/event-images/'
const dataUrlBytes = (value: string) => Math.floor((value.length - value.indexOf(',') - 1) * 3 / 4)

// Resizes in the browser so the server only stores a light JPEG (max 1600 px, 900 KB).
export async function prepareEventImage(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Selecciona una imagen JPG, PNG o WebP.')
  if (file.size > 15 * 1024 * 1024) throw new Error('La imagen debe pesar como máximo 15 MB.')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode().catch(() => { throw new Error('No pudimos abrir esta imagen. Elige otra.') })
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 60_000_000) throw new Error('La imagen es demasiado grande. Elige una más pequeña.')
    let scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
    for (let attempt = 0; attempt < 6; attempt++) {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('No pudimos preparar la imagen. Inténtalo de nuevo.')
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      for (const quality of [.85, .75, .65]) {
        const result = canvas.toDataURL('image/jpeg', quality)
        if (!result.startsWith('data:image/jpeg;base64,')) throw new Error('Tu navegador no pudo preparar la imagen. Prueba con otro navegador.')
        if (dataUrlBytes(result) <= maxBytes) return result
      }
      scale *= .8
    }
    throw new Error('La imagen tiene demasiado detalle. Elige otra o recórtala antes de subirla.')
  } finally { URL.revokeObjectURL(url) }
}

export default function EventImageField({ initial, disabled, labelledBy, onBusy }: { initial: string; disabled: boolean; labelledBy: string; onBusy: (busy: boolean) => void }) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const request = useRef(0)
  const [value, setValue] = useState(initial)
  const [preview, setPreview] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [linkOpen, setLinkOpen] = useState(Boolean(initial) && !initial.startsWith(uploadedPrefix))
  const uploaded = value.startsWith(uploadedPrefix)
  useEffect(() => () => { request.current++; onBusy(false) }, [])
  async function upload(file: File) {
    const current = ++request.current
    setError(''); setUploading(true); onBusy(true)
    try {
      const prepared = await prepareEventImage(file)
      if (current !== request.current) return
      setPreview(prepared)
      const result = await managementRequest<{ url: string }>('activities/images', { image: prepared })
      if (current !== request.current) return
      setValue(result.url); setLinkOpen(false)
    } catch (cause) {
      if (current === request.current) { setPreview(''); setError(cause instanceof Error ? cause.message : 'No pudimos subir la imagen.') }
    } finally {
      if (current === request.current) { setUploading(false); onBusy(false) }
    }
  }
  function clear() { request.current++; setValue(''); setPreview(''); setError(''); setUploading(false); onBusy(false) }
  const shown = preview || value
  const busy = disabled || uploading
  return <div className="event-image-field" role="group" aria-labelledby={labelledBy}>
    <input type="hidden" name="imagen" value={value}/>
    <div className="event-image-layout">
      <span className="event-image-preview">{shown ? <img src={shown} alt="Vista previa de la imagen del evento"/> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>}</span>
      <div className="event-image-controls">
        <div className="event-image-actions">
          <button type="button" className="event-image-choose" disabled={busy} onClick={() => input.current?.click()}>{uploading ? 'Subiendo…' : shown ? 'Cambiar imagen' : 'Subir imagen'}</button>
          {(shown || uploading) && <button type="button" className="event-image-remove" disabled={disabled} onClick={clear}>Quitar imagen</button>}
        </div>
        <p id={`${id}-help`}>JPG, PNG o WebP · Hasta 15 MB. Se ajusta automáticamente para la web.</p>
        {!linkOpen && !uploading && <button type="button" className="event-image-link-toggle" disabled={busy} onClick={() => setLinkOpen(true)}>Usar un enlace en su lugar</button>}
      </div>
    </div>
    {linkOpen && <label className="event-image-link">Enlace de la imagen (HTTPS o archivo del sitio)
      <input type="text" inputMode="url" maxLength={500} placeholder="https://…" disabled={busy} value={uploaded ? '' : value} onChange={event => { request.current++; setPreview(''); setError(''); setValue(event.target.value.trim()) }}/>
    </label>}
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Archivo de imagen del evento" aria-describedby={`${id}-help`} hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file) }}/>
    {uploading && <p className="event-image-status" role="status">Preparando y subiendo la imagen…</p>}
    {error && <p className="event-image-error" role="alert">{error}</p>}
  </div>
}
