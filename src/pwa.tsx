import { useEffect, useState } from 'react'

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let pendingInstall: InstallPrompt | null = null
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault()
  pendingInstall = event as InstallPrompt
  window.dispatchEvent(new Event('calvario-install-ready'))
})

export function InstallApp() {
  const [available, setAvailable] = useState(Boolean(pendingInstall))
  const [installed, setInstalled] = useState(window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  const [help, setHelp] = useState('')
  useEffect(() => {
    const ready = () => setAvailable(Boolean(pendingInstall))
    const done = () => { pendingInstall = null; setInstalled(true); setHelp('') }
    window.addEventListener('calvario-install-ready', ready)
    window.addEventListener('appinstalled', done)
    return () => { window.removeEventListener('calvario-install-ready', ready); window.removeEventListener('appinstalled', done) }
  }, [])
  async function install() {
    if (!pendingInstall) {
      setHelp(/iPad|iPhone|iPod/.test(navigator.userAgent)
        ? 'En Safari, abre Compartir y elige “Agregar a pantalla de inicio”.'
        : 'Abre el menú del navegador y busca “Instalar aplicación” o “Agregar a pantalla de inicio”. Si no aparece, esta dirección aún no permite instalarla.')
      return
    }
    try {
      const prompt = pendingInstall
      await prompt.prompt()
      await prompt.userChoice
      pendingInstall = null; setAvailable(false)
    } catch { setHelp('No se pudo abrir la instalación. Inténtalo desde el menú del navegador.') }
  }
  return <div className="app-install">
    <span className="app-install-icon" aria-hidden="true">↓</span>
    <div><strong>{installed ? 'El Calvario en tu dispositivo' : 'Tu comunidad, más cerca'}</strong><p>{installed ? 'Estás usando la aplicación.' : 'Agrega El Calvario a tu pantalla de inicio.'}</p></div>
    {!installed && <button type="button" onClick={() => void install()}>{available ? 'Instalar aplicación' : 'Cómo instalar'}</button>}
    {help && <p className="app-install-help" role="status">{help}</p>}
  </div>
}

export function ConnectionStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  return !online ? <div className="app-offline" role="status">Sin conexión. Conéctate para consultar o guardar información.</div> : null
}

export function registerPwa() {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      void navigator.serviceWorker.register('/sw.js').catch(error => console.warn('No se pudo preparar la aplicación:', error))
    })
  }
}
