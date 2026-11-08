import CommunityIcon from './CommunityIcon'
import Participation from './Participation'
import './events.css'
import { lazy, Suspense, useEffect, useState } from 'react'
import { weeklySchedule } from './EventRecurrence'

type PublicEvent = { id_actividad: number; tipo_actividad: 'culto' | 'evento'; titulo: string; fecha: string; hora: string; lugar: string; imagen: string | null; descripcion: string | null; estado_actividad: string; requiere_inscripcion: number | null; url_inscripcion: string | null; id_serie?: number | null; dia_semana?: number | null; repeticion_activa?: number; repeticion_fin?: string | null; repeticion_hora?: string; fecha_programada?: string }
type Transmission = { videoUrl: string | null; pageUrl: string; automatic: boolean; live: boolean }
const EventCalendar=lazy(()=>import('./EventCalendar'))

export default function Events() {
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [failed, setFailed] = useState(false)
  const [calendar,setCalendar]=useState(false)
  const [transmission, setTransmission] = useState<Transmission>({ videoUrl: null, pageUrl: 'https://www.facebook.com/61556906195984', automatic: false, live: false })
  useEffect(() => {
    const controller = new AbortController()
    async function updateEvents() {
      try { const response = await fetch('/api/public/events', { signal: controller.signal }); if (!response.ok) throw new Error(); const result = await response.json(); setEvents(result.items); setFailed(false) } catch { if (!controller.signal.aborted) setFailed(true) }
    }
    async function updateTransmission() {
      try { const response = await fetch('/api/public/transmission', { signal: controller.signal }); if (response.ok) setTransmission(await response.json()) } catch { /* The page link remains available. */ }
    }
    void updateEvents(); void updateTransmission()
    const interval = window.setInterval(() => { void updateEvents(); void updateTransmission() }, 60000)
    return () => { controller.abort(); window.clearInterval(interval) }
  }, [])
  const facebookEmbedUrl = transmission.videoUrl ? `https://www.facebook.com/plugins/video.php?height=314&href=${encodeURIComponent(transmission.videoUrl)}&show_text=false&width=560` : null
  return (
    <section className="events-section" id="eventos" aria-labelledby="events-title">
      <div className="events-container">
        <div className="events-heading">
          <span className="events-eyebrow">NOS ENCONTRAMOS, CRECEMOS Y COMPARTIMOS</span>
          <h2 id="events-title">La fe también se vive <em>juntos.</em></h2>
          <p>Conoce nuestros próximos encuentros y acompáñanos desde donde estés.</p>
        </div>
        <div className="public-agenda-toggle"><button type="button" aria-pressed={calendar} onClick={()=>setCalendar(value=>!value)}>{calendar?'Ocultar calendario':'Ver calendario de encuentros'}</button></div>
        {calendar&&<Suspense fallback={<p>Cargando calendario…</p>}><EventCalendar publicView/></Suspense>}
        <div className="events-grid">
          <div className="events-column">
            <div className="events-column-heading"><span className="events-heading-icon"><CommunityIcon name="calendar" /></span><h3>Próximos eventos</h3></div>
            {events.length ? events.map(event => <article className={`event-card public-${event.tipo_actividad}`} key={event.id_actividad}>
              {event.imagen && <div className="event-image-wrap"><img src={event.imagen} alt={event.titulo} loading="lazy" /><span className="event-image-label">{event.tipo_actividad === 'culto' ? 'Culto' : 'Evento especial'}</span></div>}
              <div className="event-information"><span className="events-eyebrow">{event.tipo_actividad === 'culto' ? 'CULTO' : 'EVENTO ESPECIAL'}</span>
                <div className="event-schedule">{new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeZone: 'America/Bogota' }).format(new Date(`${event.fecha}T12:00:00-05:00`))} · {event.hora.slice(0, 5)}</div>
                {event.id_serie && event.dia_semana != null && <p className="event-repeat-note">{weeklySchedule(event.dia_semana, event.repeticion_hora || event.hora, Boolean(event.repeticion_activa))}{event.repeticion_activa && (event.fecha_programada !== event.fecha || (event.repeticion_hora || event.hora).slice(0, 5) !== event.hora.slice(0, 5)) ? ' · Horario especial para esta fecha' : ''}</p>}
                <h4>{event.titulo}</h4><p>{event.descripcion}</p><div className="event-location"><CommunityIcon name="location" /><span>{event.lugar}</span></div>
                {event.estado_actividad === 'cancelada' ? <p className="event-cancelled">Cancelado</p> : Boolean(event.requiere_inscripcion) && event.url_inscripcion && <a className="facebook-link" href={event.url_inscripcion} target="_blank" rel="noopener noreferrer">Inscribirme ↗</a>}
              </div>
            </article>) : <article className="event-card">
              <div className="event-image-wrap">
                <img src="/784197648_122328947036230206_1156999774695897129_n.jpg" alt="La comunidad de El Calvario reunida durante un encuentro" loading="lazy" />
                <span className="event-image-label">Vida en comunidad</span>
              </div>
              <div className="event-information">
                <div className="event-schedule"><span /> Agenda por anunciar</div>
                <h4>Un encuentro, muchas razones para compartir.</h4>
                <p>{failed ? 'La agenda no está disponible en este momento. Consulta nuestros horarios habituales o vuelve a intentarlo más tarde.' : 'Aquí se publicarán las fechas y los detalles de los próximos cultos y eventos especiales.'}</p>
                <div className="event-location"><CommunityIcon name="location" /><span>El Calvario · Villavicencio, Meta</span></div>
              </div>
            </article>}
          </div>
          <div className="events-column transmission-column">
            <div className="events-column-heading"><span className="events-heading-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3V9Z"/></svg></span><h3>{transmission.live ? 'En vivo' : 'Transmisiones'}</h3><span className="facebook-label">Facebook</span></div>
            <article className="transmission-card">
              {facebookEmbedUrl && <div className="facebook-player">
                <iframe src={facebookEmbedUrl} title="Transmisión de Misión Cristiana El Calvario en Facebook" width="560" height="314" scrolling="no" allowFullScreen allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" loading="lazy" />
              </div>}
              <div className="transmission-information">
                <span className="transmission-eyebrow">UN MENSAJE PARA TU VIDA</span>
                <h4>Conectados por la fe.</h4>
                <p>Comparte con nosotros este tiempo de enseñanza y comunidad. Que la Palabra de Dios te acompañe donde estés.</p>
                <a href={transmission.videoUrl || transmission.pageUrl} target="_blank" rel="noopener noreferrer" className="facebook-link">Ver en Facebook<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 17 10-10M7 7h10v10"/></svg></a>
              </div>
            </article>
          </div>
        </div>
        <Participation />
      </div>
    </section>
  )
}
