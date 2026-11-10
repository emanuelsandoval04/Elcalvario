import { useEffect, useState } from 'react'
import { managementRequest as api } from './management-api'
import ValidatedForm from './ValidatedForm'
import './community-tools.css'
import './transmissions.css'

type Settings = { mode: 'automatico' | 'manual'; pageId: string; graphVersion: string; hasToken: boolean; tokenEnding: string | null; environmentToken: boolean; manualVideo: string; lastStatus: string | null; checkedAt: string | null; updatedAt: string | null; encryptionReady: boolean }
type Current = { videoUrl: string | null; pageUrl: string; automatic: boolean; live: boolean; title: string | null }
type Video = { id: string; live: boolean; title: string | null; createdAt: string | null; url: string }
type Response = { settings: Settings; current: Current }

const embed = (url: string) => `https://www.facebook.com/plugins/video.php?height=314&href=${encodeURIComponent(url)}&show_text=false&width=560`
const when = (value: string | null) => value ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(value)) : ''
const message = (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : fallback

export default function Transmissions({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<Response | null>(null)
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [testing, setTesting] = useState(false)
  const [error, setError] = useState(''), [testResult, setTestResult] = useState<{ ok: boolean; message: string; videos: Video[] } | null>(null)
  const [mode, setMode] = useState<'automatico' | 'manual'>('automatico'), [pageId, setPageId] = useState(''), [version, setVersion] = useState('')
  const [token, setToken] = useState(''), [removeToken, setRemoveToken] = useState(false), [manualVideo, setManualVideo] = useState('')

  function apply(result: Response) {
    setData(result); setMode(result.settings.mode); setPageId(result.settings.pageId); setVersion(result.settings.graphVersion)
    setManualVideo(result.settings.manualVideo); setToken(''); setRemoveToken(false)
  }
  useEffect(() => {
    let active = true
    api<Response>('transmission/settings').then(result => { if (active) apply(result) }).catch(cause => { if (active) setError(message(cause, 'No pudimos consultar la configuración.')) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function save() {
    if (busy) return
    setBusy(true); setError('')
    try {
      apply(await api<Response>('transmission/settings', { mode, pageId, graphVersion: version, manualVideo, ...(token ? { token } : {}), ...(removeToken ? { removeToken: true } : {}) }, 'PUT'))
      notify('Configuración de transmisiones guardada. La página pública se actualiza en menos de un minuto.')
    } catch (cause) { setError(message(cause, 'No pudimos guardar la configuración.')) }
    finally { setBusy(false) }
  }
  async function test() {
    if (testing) return
    setTesting(true); setError(''); setTestResult(null)
    try {
      const result = await api<{ ok: boolean; message: string; videos: Video[]; settings: Settings }>('transmission/test', {})
      setTestResult(result); setData(previous => previous && { ...previous, settings: result.settings })
    } catch (cause) { setTestResult({ ok: false, message: message(cause, 'No fue posible conectar con Meta.'), videos: [] }) }
    finally { setTesting(false) }
  }

  if (loading) return <p role="status">Consultando la configuración de transmisiones…</p>
  if (!data) return <div className="tool-error community-tool" role="alert"><p>{error}</p></div>
  const { settings, current } = data
  const tokenLabel = settings.hasToken ? `Token guardado (termina en …${settings.tokenEnding})` : settings.environmentToken ? 'Se usa el token configurado en el servidor' : 'Sin token guardado'

  return <section className="community-tool transmissions-page" aria-labelledby="transmissions-title">
    <div className="tool-heading"><div><h2 id="transmissions-title">Transmisiones de Facebook</h2>
      <p>Conecta la página de Facebook de la iglesia con la API de Meta para que la web muestre sola la última transmisión en vivo o grabada. También puedes elegir un video a mano.</p></div>
      <a className="transmission-guide-link" href="#guia-transmisiones">Ver paso a paso</a></div>

    {error && <div className="tool-error" role="alert"><p>{error}</p></div>}

    <div className="transmission-layout">
      <section className="transmission-card" aria-labelledby="transmission-now">
        <div className="transmission-card-head"><h3 id="transmission-now">Lo que ve el público ahora</h3>
          <span className={`tool-status ${current.live ? 'is-live' : current.automatic ? '' : 'is-pendiente'}`}>{current.live ? '● En vivo' : current.automatic ? 'Automático (API de Meta)' : 'Video manual'}</span></div>
        {current.videoUrl ? <div className="transmission-player"><iframe src={embed(current.videoUrl)} title="Vista previa de la transmisión pública" width="560" height="314" scrolling="no" allowFullScreen allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" loading="lazy"/></div> : <p className="tool-empty">Aún no hay un video para mostrar.</p>}
        {current.title && <p className="tool-caption">{current.title}</p>}
        {current.videoUrl && <a className="transmission-external" href={current.videoUrl} target="_blank" rel="noopener noreferrer">Abrir en Facebook ↗</a>}
      </section>

      <section className="transmission-card" aria-labelledby="transmission-connection">
        <div className="transmission-card-head"><h3 id="transmission-connection">Conexión con Meta</h3><span className={`tool-status ${settings.hasToken || settings.environmentToken ? '' : 'is-pendiente'}`}>{tokenLabel}</span></div>
        {settings.lastStatus && <p className="tool-caption">Última prueba: {settings.lastStatus}{settings.checkedAt ? ` · ${when(settings.checkedAt)}` : ''}</p>}
        <button type="button" className="secondary" disabled={testing || !(settings.hasToken || settings.environmentToken)} onClick={() => void test()}>{testing ? 'Consultando a Meta…' : 'Probar conexión y ver últimas transmisiones'}</button>
        {testResult && <div className={testResult.ok ? 'transmission-ok' : 'tool-error'} role="status"><p>{testResult.message}</p></div>}
        {testResult?.videos.length ? <ul className="transmission-videos">{testResult.videos.map(video => <li key={video.id}>
          <div><strong>{video.title || 'Transmisión sin título'}</strong><small>{video.live ? '● En vivo ahora' : 'Grabada'}{video.createdAt ? ` · ${when(video.createdAt)}` : ''}</small></div>
          <div className="transmission-video-actions"><a href={video.url} target="_blank" rel="noopener noreferrer">Ver ↗</a><button type="button" className="secondary" onClick={() => { setManualVideo(video.url); setMode('manual') }}>Fijar este</button></div>
        </li>)}</ul> : null}
      </section>
    </div>

    <ValidatedForm className="transmission-form" onSubmit={event => { event.preventDefault(); void save() }}>
      <h3>Configuración</h3>
      <div className="tool-toggle" role="group" aria-label="Cómo se elige el video">
        <button type="button" aria-pressed={mode === 'automatico'} onClick={() => setMode('automatico')}>Automático con la API de Meta</button>
        <button type="button" aria-pressed={mode === 'manual'} onClick={() => setMode('manual')}>Video fijo (manual)</button>
      </div>
      <p className="tool-caption">{mode === 'automatico' ? 'La web consulta a Meta cada minuto: si hay un en vivo lo muestra; si no, la última transmisión grabada. Si Meta falla, se muestra el video de respaldo.' : 'La web siempre muestra el video que pegues abajo, aunque haya un en vivo.'}</p>
      <fieldset disabled={busy}>
        <label>ID de la página de Facebook<input inputMode="numeric" value={pageId} maxLength={30} placeholder="61556906195984" onChange={event => setPageId(event.target.value.replace(/\D/g, ''))}/></label>
        <label>Versión de la API Graph<input value={version} maxLength={10} placeholder="v23.0" onChange={event => setVersion(event.target.value.trim())}/></label>
        <label className="tool-wide">Token de acceso de la página (Page Access Token)
          <input type="password" autoComplete="off" spellCheck={false} value={token} maxLength={1000} disabled={removeToken || !settings.encryptionReady} placeholder={settings.hasToken ? `Guardado …${settings.tokenEnding}. Escribe uno nuevo solo para reemplazarlo` : 'Pega aquí el token que empieza por EAA…'} onChange={event => setToken(event.target.value.trim())}/>
        </label>
        {!settings.encryptionReady && <p className="tool-error tool-wide">El servidor aún no tiene la variable TRANSMISSION_SECRET_KEY, que se usa para cifrar el token. Pide al administrador que la agregue en Vercel (paso 6 de la guía). Mientras tanto puedes usar el modo de video fijo.</p>}
        {settings.hasToken && <label className="tool-check tool-wide"><input type="checkbox" checked={removeToken} onChange={event => { setRemoveToken(event.target.checked); setToken('') }}/>Borrar el token guardado</label>}
        <label className="tool-wide">{mode === 'manual' ? 'Video que se muestra' : 'Video de respaldo (si Meta no responde)'}
          <textarea rows={3} value={manualVideo} maxLength={3000} placeholder="Pega el enlace del video o el código de «Insertar» completo (<iframe …>)" onChange={event => setManualVideo(event.target.value)}/>
          <small className="transmission-hint">En Facebook: abre el video → ⋯ → «Insertar» → copia el código. Sirve tal cual, también con enlaces web.facebook.com.</small>
        </label>
      </fieldset>
      <div className="tool-actions"><button type="submit" disabled={busy || mode === 'manual' && !manualVideo.trim()}>{busy ? 'Guardando…' : 'Guardar configuración'}</button></div>
      {settings.updatedAt && <p className="tool-caption">Última modificación: {when(settings.updatedAt)}</p>}
    </ValidatedForm>

    <details className="transmission-guide" id="guia-transmisiones">
      <summary>Paso a paso: conectar Facebook con la API de Meta</summary>
      <ol>
        <li><strong>Requisitos.</strong> Tu cuenta personal de Facebook debe ser <em>administradora</em> de la página de la iglesia (Configuración de la página → Acceso a la página).</li>
        <li><strong>Crea una cuenta de desarrollador.</strong> Entra a <a href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer">developers.facebook.com</a> → «Comenzar» y verifica tu cuenta.</li>
        <li><strong>Crea una app.</strong> «Mis apps» → «Crear app» → tipo <em>Empresa</em> (o «Otro») → nombre «Web El Calvario».</li>
        <li><strong>Genera el token.</strong> Abre <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer">Graph API Explorer</a>, elige tu app, agrega los permisos <code>pages_show_list</code>, <code>pages_read_engagement</code> y <code>pages_read_user_content</code>, pulsa «Generate Access Token» y en «Usuario o página» elige la página de la iglesia. Copia el token (empieza por EAA…).</li>
        <li><strong>Hazlo de larga duración.</strong> Pega el token en <a href="https://developers.facebook.com/tools/debug/accesstoken/" target="_blank" rel="noopener noreferrer">Depurador de tokens</a> → «Extender token de acceso». Vuelve al Explorer con ese token y consulta <code>me/accounts</code>: el <code>access_token</code> de la página que aparece ahí no vence.</li>
        <li><strong>Solo la primera vez (administrador):</strong> en Vercel → Settings → Environment Variables, agregar <code>TRANSMISSION_SECRET_KEY</code> con un texto aleatorio de 32+ caracteres y volver a publicar.</li>
        <li><strong>Pega los datos aquí.</strong> ID de la página (sale en <code>me/accounts</code> como <code>id</code>), la versión que muestra el Explorer (por ejemplo v23.0) y el token. Elige «Automático» y guarda.</li>
        <li><strong>Prueba.</strong> Pulsa «Probar conexión»: deben aparecer las últimas transmisiones. La página pública se actualiza en menos de un minuto.</li>
      </ol>
      <p className="tool-caption">¿Sin tiempo para la API? Usa «Video fijo»: en Facebook abre el video → ⋯ → «Insertar», copia el código y pégalo en el campo de video. La guía completa está en docs/transmisiones-facebook.md.</p>
    </details>
  </section>
}
