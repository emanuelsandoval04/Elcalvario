import AppSelect from './AppSelect'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import ValidatedForm from './ValidatedForm'

const confirmedMinistries = ['Alabanza / Adoración', 'Multimedia', 'Servidores / Ujieres']

export default function Participation() {
  const [ministries, setMinistries] = useState(confirmedMinistries)
  useEffect(() => { const controller = new AbortController(); fetch('/api/public/ministries', { signal: controller.signal }).then(async response => { if (response.ok) { const data = await response.json(); setMinistries(data.items.map((item: { nombre: string }) => item.nombre)) } }).catch(() => {}); return () => controller.abort() }, [])
  const dialog = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => () => { document.body.style.overflow = '' }, [])

  function open() {
    setMessage('')
    setSent(false)
    dialog.current?.showModal()
    document.body.style.overflow = 'hidden'
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form))
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/participation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data), signal: AbortSignal.timeout(10000),
      })
      if ([502, 504].includes(response.status)) throw new Error('No pudimos conectar con el servidor. Inténtalo nuevamente.')
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No pudimos guardar tu solicitud. Inténtalo nuevamente.')
      form.reset()
      setSent(true)
    } catch (error) {
      setMessage(error instanceof Error && error.name === 'Error' ? error.message : 'No pudimos conectar con el servidor. Inténtalo nuevamente.')
    } finally { setBusy(false) }
  }

  return (
    <>
      <div className="serve-invitation">
        <div><h3>¿Quieres servir?</h3><p>Descubre dónde puedes poner tus dones al servicio de la comunidad.</p></div>
        <button className="nav-login serve-button" type="button" onClick={open}>Quiero participar</button>
      </div>
      <dialog className="participation-dialog" ref={dialog} aria-labelledby="participation-title" onClose={() => { document.body.style.overflow = '' }} onClick={event => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect()
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.current?.close()
        }
      }}>
        <button className="participation-close" type="button" aria-label="Cerrar formulario" onClick={() => dialog.current?.close()}>×</button>
        <span className="events-eyebrow">UN LUGAR PARA TUS DONES</span>
        <h2 id="participation-title">Quiero participar</h2>
        {sent ? <div role="status" className="participation-success"><p>¡Gracias por querer servir! Tu solicitud quedó registrada.</p><button className="nav-login serve-button" onClick={() => dialog.current?.close()}>Listo</button></div> : <>
          <p className="participation-intro">Cuéntanos un poco de ti y del área en la que te gustaría servir.</p>
          <ValidatedForm className="participation-form" onSubmit={submit}>
            <label htmlFor="participation-name">Nombre<input id="participation-name" name="name" autoComplete="name" required maxLength={120} disabled={busy} /></label>
            <label htmlFor="participation-phone">Teléfono<input id="participation-phone" name="phone" type="tel" autoComplete="tel" required minLength={7} maxLength={30} pattern="[+0-9 ()\-]{7,30}" title="Ingresa un teléfono de 7 a 30 caracteres, con números, espacios, paréntesis o +." disabled={busy} /></label>
            <label htmlFor="participation-ministry">Ministerio de interés<AppSelect id="participation-ministry" name="ministry" required defaultValue="" disabled={busy}><option value="" disabled>Selecciona un ministerio</option>{ministries.map(name => <option key={name}>{name}</option>)}</AppSelect></label>
            <label htmlFor="participation-message">Mensaje <span>(opcional)</span><textarea id="participation-message" name="message" rows={3} maxLength={2000} disabled={busy} /></label>
            {message && <p className="participation-error" role="alert">{message}</p>}
            <button className="nav-login serve-button" type="submit" disabled={busy} aria-busy={busy}>{busy ? 'Enviando…' : 'Enviar solicitud'}</button>
          </ValidatedForm>
        </>}
      </dialog>
    </>
  )
}
