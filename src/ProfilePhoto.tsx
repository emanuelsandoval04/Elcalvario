import { useEffect, useId, useRef, useState } from 'react'
import './profile-photo.css'

export async function prepareProfilePhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Selecciona una imagen JPG, PNG o WebP.')
  if (file.size > 10 * 1024 * 1024) throw new Error('La imagen debe pesar como máximo 10 MB.')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode().catch(() => { throw new Error('No pudimos abrir esta imagen. Elige otra foto.') })
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('La imagen es demasiado grande. Elige una foto más pequeña.')
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 512
    const context = canvas.getContext('2d')
    if (!context) throw new Error('No pudimos preparar la foto. Inténtalo de nuevo.')
    const size = Math.min(image.naturalWidth, image.naturalHeight)
    context.fillStyle = '#fff'
    context.fillRect(0, 0, 512, 512)
    context.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 0, 0, 512, 512)
    return canvas.toDataURL('image/jpeg', .85)
  } finally { URL.revokeObjectURL(url) }
}

export function ProfileAvatar({ photoUrl, name }: { photoUrl?: string | null; name: string }) {
  const [failed, setFailed] = useState('')
  return <span className="panel-avatar" aria-hidden="true">{photoUrl && failed !== photoUrl ? <img src={photoUrl} alt="" onError={() => setFailed(photoUrl)}/> : name.slice(0, 1).toUpperCase()}</span>
}

export default function ProfilePhoto({ value, defaultValue = null, onChange, onBusyChange, name, disabled = false }: {
  value?: string | null; defaultValue?: string | null; onChange?: (value: string | null) => void; onBusyChange?: (busy: boolean) => void; name?: string; disabled?: boolean;
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const request = useRef(0)
  const [internal, setInternal] = useState(defaultValue)
  const photo = value === undefined ? internal : value
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  function update(next: string | null) { setInternal(next); setError(''); onChange?.(next) }
  useEffect(() => {
    const form = input.current?.form
    const reset = () => { setInternal(defaultValue); setError('') }
    form?.addEventListener('reset', reset)
    return () => { request.current++; form?.removeEventListener('reset', reset) }
  }, [defaultValue])
  async function load(file: File) {
    const currentRequest = ++request.current
    setError(''); setProcessing(true); onBusyChange?.(true)
    try { const next = await prepareProfilePhoto(file); if (currentRequest === request.current) update(next) }
    catch (cause) { if (currentRequest === request.current) setError(cause instanceof Error ? cause.message : 'No pudimos preparar la foto.') }
    finally { if (currentRequest === request.current) { setProcessing(false); onBusyChange?.(false) } }
  }
  return <fieldset className="profile-photo-field" disabled={disabled || processing}>
    <legend>Foto de perfil <span>(opcional)</span></legend>
    <div className="profile-photo-layout">
      <span className="profile-photo-preview">{photo ? <img src={photo} alt="Vista previa de la foto de perfil"/> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/></svg>}</span>
      <div className="profile-photo-controls">
        <div className="profile-photo-actions"><button type="button" className="profile-photo-choose" onClick={() => input.current?.click()}>{processing ? 'Preparando…' : photo ? 'Cambiar foto' : 'Elegir foto'}</button>{photo && <button type="button" className="profile-photo-remove" onClick={() => { update(null); if (input.current) input.current.value = '' }}>Quitar foto</button>}</div>
        <p id={`${id}-help`}>JPG, PNG o WebP · Hasta 10 MB.<br/>Se mostrará centrada en el icono de tu cuenta.</p>
      </div>
    </div>
    <input ref={input} id={`${id}-file`} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Foto de perfil" aria-describedby={`${id}-help`} hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void load(file) }}/>
    {name && <input type="hidden" name={name} value={photo || ''}/>}
    {processing && <p className="profile-photo-status" role="status">Preparando tu foto…</p>}
    {error && <p className="profile-photo-error" role="alert">{error}</p>}
  </fieldset>
}
