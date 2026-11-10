import { useEffect, useId, useRef, useState } from 'react'
import { managementRequest as api } from './management-api'
import { downloadReport } from './report-download'
import ValidatedForm from './ValidatedForm'
import './disciple-consent.css'

type Evidence = { id_consentimiento: number; estado_consentimiento: string; id_documento: number | null; fecha_subida: string | null; fecha_revocacion: string | null; nombre_archivo: string | null }
type Consent = { signed: boolean; uploadedAt: string | null; revoked: boolean; currentId: number | null; canManage: boolean; canPrepare: boolean; canReadFiles: boolean; items: Evidence[] }
type PreparedFile = { name: string; type: string; data: string; size: number }
const colombiaDate = (value: string) => new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long', timeStyle: 'short' }).format(new Date(value))
const errorMessage = (cause: unknown) => cause instanceof Error ? cause.message : 'No pudimos completar la operación.'
function dataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('No pudimos leer el archivo.')); reader.readAsDataURL(file) })
}
export async function prepareConsentFiles(files: File[]): Promise<PreparedFile[]> {
  if (!files.length || files.length > 6) throw new Error('Selecciona un PDF o hasta seis fotos, en el orden de las páginas.')
  const prepared: PreparedFile[] = []
  for (const file of files) {
    let blob: Blob = file
    if (file.type === 'application/pdf') {
      if (files.length !== 1 || file.size > 2 * 1024 * 1024) throw new Error('Selecciona un único PDF de hasta 2 MB con todas las páginas.')
    } else {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Usa fotos JPG, PNG o WebP de hasta 10 MB cada una, o un PDF de hasta 2 MB.')
      const url = URL.createObjectURL(file)
      try {
        const image = new Image(); image.src = url
        await image.decode().catch(() => { throw new Error('No pudimos abrir la foto. Selecciona otra imagen.') })
        if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('La imagen es demasiado grande. Usa una foto más pequeña.')
        const scale = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight))
        const canvas = document.createElement('canvas'); canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale)
        const context = canvas.getContext('2d'); if (!context) throw new Error('No pudimos preparar la foto.')
        context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height)
        // Preserve the entire page, including signatures near the edges.
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('No pudimos preparar la foto.')), 'image/jpeg', .82))
      } finally { URL.revokeObjectURL(url) }
    }
    const value = await dataUrl(blob)
    prepared.push({ name: file.name, type: blob.type, data: value.slice(value.indexOf(',') + 1), size: blob.size })
  }
  if (prepared.reduce((sum, file) => sum + file.size, 0) > 2 * 1024 * 1024) throw new Error('Las páginas preparadas superan 2 MB. Usa fotos más ligeras o un PDF comprimido y legible.')
  return prepared
}

export default function DiscipleConsent({ memberId, code, sensitive, notify }: { memberId: number; code?: string | null; sensitive: boolean; notify: (message: string) => void }) {
  const id = useId(), input = useRef<HTMLInputElement>(null), request = useRef(0)
  const [consent, setConsent] = useState<Consent | null>(null)
  const [files, setFiles] = useState<PreparedFile[]>([])
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [loadError, setLoadError] = useState('')
  const [confirmed, setConfirmed] = useState(false), [religious, setReligious] = useState(false), [health, setHealth] = useState(false), [revoking, setRevoking] = useState(false)
  async function load() {
    try { const data = await api<Consent>(`members/${memberId}/consents`); setConsent(data); setLoadError('') }
    catch (cause) { setLoadError(errorMessage(cause)) }
  }
  useEffect(() => { void load(); return () => { request.current++ } }, [memberId])
  async function choose(selected: File[]) {
    const current = ++request.current
    setBusy('preparing'); setError(''); setFiles([]); setConfirmed(false)
    try { const result = await prepareConsentFiles(selected); if (current === request.current) setFiles(result) }
    catch (cause) { if (current === request.current) setError(errorMessage(cause)) }
    finally { if (current === request.current) setBusy('') }
  }
  async function download(path: string, name: string) {
    setBusy('download'); setError('')
    try { await downloadReport(path, name) } catch (cause) { setError(errorMessage(cause)) } finally { setBusy('') }
  }
  async function upload() {
    if (!files.length || !confirmed) { setError('Selecciona las páginas firmadas y confirma su revisión.'); return }
    setBusy('upload'); setError('')
    try {
      const result = await api<{ id: number; uploadedAt: string }>(`members/${memberId}/consents`, { files: files.map(({ type, data }) => ({ type, data })), confirmSigned: confirmed, religious, health })
      setConsent(previous => previous ? { ...previous, signed: true, revoked: false, currentId: result.id, uploadedAt: result.uploadedAt } : previous)
      setFiles([]); setConfirmed(false); setReligious(false); setHealth(false); if (input.current) input.current.value = ''
      notify('Documento firmado guardado. La aceptación quedó registrada con la fecha de subida.'); await load()
    } catch (cause) { setError(errorMessage(cause)) } finally { setBusy('') }
  }
  async function revoke() {
    setBusy('revoke'); setError('')
    try { await api(`members/${memberId}/consents/${consent?.currentId}/revoke`, {}); setRevoking(false); notify('Revocación registrada. El documento anterior permanece en el historial.'); await load() }
    catch (cause) { setError(errorMessage(cause)) } finally { setBusy('') }
  }
  return <section className="disciple-consent" aria-labelledby={`${id}-title`}>
    <div className="consent-heading"><div><h4 id={`${id}-title`}>Autorización y ficha firmada</h4><p>Descarga la ficha actual, solicita la firma y guarda todas sus páginas aquí.</p></div>
      {consent && <span className={`consent-badge ${consent.signed ? 'is-signed' : 'is-missing'}`} role="status">{consent.signed ? 'Firmado · consentimiento aceptado' : consent.revoked ? 'Consentimiento revocado' : 'Sin documento firmado'}</span>}
    </div>
    {loadError ? <div role="alert" className="consent-error">{loadError} <button type="button" className="secondary" onClick={() => void load()}>Reintentar</button></div> : !consent && <p role="status">Consultando documento…</p>}
    {consent && <>
      <p className="consent-date"><strong>Fecha de subida (Colombia):</strong> {consent.uploadedAt ? colombiaDate(consent.uploadedAt) : 'Pendiente de subir el documento firmado.'}</p>
      {consent.canPrepare && <div className="consent-download"><button type="button" disabled={Boolean(busy)} onClick={() => void download(`members/${memberId}/consent.pdf`, `ficha-discipulo-${code || memberId}.pdf`)}>Descargar ficha en PDF para firmar</button><p>Incluye los datos actuales, autorización y espacio de firma. El texto base de privacidad está pendiente de revisión por la iglesia.</p></div>}
      {consent.canManage && <ValidatedForm className="consent-upload" onSubmit={event => { event.preventDefault(); void upload() }}>
        <fieldset disabled={Boolean(busy)}><legend>{consent.signed ? 'Subir una nueva ficha firmada' : 'Subir ficha firmada'}</legend>
          <label htmlFor={`${id}-files`}>Documento firmado (PDF o fotos de todas las páginas) *</label>
          <input ref={input} id={`${id}-files`} name="signed_files" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple required aria-describedby={`${id}-help`} onChange={event => { if (event.target.files?.length) void choose(Array.from(event.target.files)); else { request.current++; setFiles([]); setConfirmed(false) } }}/>
          <p id={`${id}-help`}>Un PDF de hasta 2 MB o hasta seis fotos en orden. Las fotos se preparan sin recortar; deben sumar hasta 2 MB. Comprueba que todos los datos y la firma se lean.</p>
          {!!files.length && <ol className="consent-files">{files.map((file, index) => <li key={index}>{file.type === 'image/jpeg' && <img src={`data:image/jpeg;base64,${file.data}`} alt={`Página ${index + 1} preparada completa`}/>}<span>{index + 1}. {file.name} · {Math.ceil(file.size / 1024)} KB</span></li>)}</ol>}
          <div className="consent-decisions"><p>Según las casillas marcadas en el documento firmado:</p>
            <label><input name="religious" type="checkbox" checked={religious} onChange={event => setReligious(event.target.checked)}/> El titular autorizó expresamente los datos religiosos.</label>
            {sensitive && <label><input name="health" type="checkbox" checked={health} onChange={event => setHealth(event.target.checked)}/> El titular autorizó expresamente los datos de salud.</label>}
          </div>
          <label className="consent-confirm"><input name="confirm_signed" type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/> Revisé todas las páginas: corresponden al discípulo, incluyen la autorización y están firmadas por el titular o su representante. *</label>
          <button disabled={!files.length || !confirmed} type="submit">{busy === 'upload' ? 'Guardando documento…' : busy === 'preparing' ? 'Preparando páginas…' : 'Guardar documento firmado'}</button>
        </fieldset>
      </ValidatedForm>}
      {consent.canManage && !!consent.items.length && <details className="consent-history"><summary>Documentos e historial ({consent.items.length})</summary><ul>{consent.items.map(item => <li key={item.id_consentimiento}><div><strong>{item.id_documento ? 'Documento firmado' : 'Registro anterior sin archivo firmado'}</strong><p>{item.fecha_subida ? `Subido el ${colombiaDate(item.fecha_subida)}` : 'No acredita una ficha firmada subida.'} · {item.estado_consentimiento}</p>{item.fecha_revocacion && <p>Revocado el {colombiaDate(item.fecha_revocacion)}</p>}</div>{item.id_documento && (consent.canReadFiles ? <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => void download(`members/${memberId}/consents/${item.id_documento}/file`, item.nombre_archivo || 'ficha-firmada.pdf')}>Descargar documento firmado</button> : <p>Archivo reservado a quienes gestionan consentimientos y tienen acceso a datos sensibles.</p>)}</li>)}</ul></details>}
      {consent.canManage && consent.signed && <div className="consent-revoke">{revoking ? <><p>Registra esta acción únicamente si el titular solicitó revocar la autorización. La evidencia quedará en el historial.</p><button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => void revoke()}>Confirmar revocación</button><button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => setRevoking(false)}>Cancelar</button></> : <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => setRevoking(true)}>Registrar revocación solicitada</button>}</div>}
    </>}
    {error && <p role="alert" className="consent-error">{error}</p>}
  </section>
}
