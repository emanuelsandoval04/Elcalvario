import { useEffect, useRef, useState } from 'react'
import { managementRequest } from './management-api'
import { weeklySchedule } from './EventRecurrence'
import './community-tools.css'

export type CalendarEvent = Record<string,string|number|null>
const addDays=(day:string,count:number)=>new Date(Date.parse(`${day}T12:00:00Z`)+count*86400000).toISOString().slice(0,10)
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const dayName=(day:string,options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('es-CO',{...options,timeZone:'America/Bogota'}).format(new Date(`${day}T12:00:00-05:00`))
const monday=(day:string)=>addDays(day,-((new Date(`${day}T12:00:00Z`).getUTCDay()+6)%7))
export default function EventCalendar({publicView=false,onSelect}:{publicView?:boolean;onSelect?:(event:CalendarEvent)=>void}) {
  const [anchor,setAnchor]=useState(today),[view,setView]=useState<'month'|'week'>('month'),[selected,setSelected]=useState(today)
  const [items,setItems]=useState<CalendarEvent[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
  const [detail,setDetail]=useState<CalendarEvent|null>(null)
  const detailRef=useRef<HTMLDivElement>(null)
  const first=view==='week'?monday(anchor):monday(anchor.slice(0,7)+'-01')
  const count=view==='week'?7:42,last=addDays(first,count-1)
  const dates=Array.from({length:count},(_,index)=>addDays(first,index))
  const upcomingLimit=addDays(today(),365)
  const selectedItems=items.filter(item=>item.fecha===selected)
  useEffect(()=>{
    const controller=new AbortController()
    setLoading(true);setError('');setItems([]);setDetail(null)
    const query=new URLSearchParams({from:first,to:last})
    const request=publicView ? fetch(`/api/public/calendar?${query}`,{signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'No pudimos consultar el calendario.');return data}) : managementRequest<{items:CalendarEvent[]}>(`activities/calendar?${query}`)
    request.then(result=>{if(!controller.signal.aborted)setItems(result.items)}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'No pudimos consultar el calendario.')}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>controller.abort()
  },[first,last,publicView])
  function move(direction:number) {
    const next=view==='week'?addDays(anchor,direction*7):new Date(Date.UTC(Number(anchor.slice(0,4)),Number(anchor.slice(5,7))-1+direction,1)).toISOString().slice(0,10)
    setAnchor(next);setSelected(next)
  }
  function choose(event:CalendarEvent) {if(onSelect)onSelect(event);else {setDetail(event);requestAnimationFrame(()=>detailRef.current?.focus())}}
  return <section className={`event-calendar community-tool${publicView?' public-calendar':''}`} aria-label="Calendario de eventos y cultos">
    <div className="tool-heading"><div><h3>{view==='month'?dayName(anchor,{month:'long',year:'numeric'}):`${dayName(first,{day:'numeric',month:'short'})} – ${dayName(last,{day:'numeric',month:'short',year:'numeric'})}`}</h3><p>Horarios de Colombia · Cada fecha conserva su propia asistencia.</p></div><div className="tool-toggle" role="group" aria-label="Vista del calendario"><button type="button" aria-pressed={view==='month'} onClick={()=>setView('month')}>Mes</button><button type="button" aria-pressed={view==='week'} onClick={()=>{setView('week');setAnchor(selected)}}>Semana</button></div></div>
    <div className="calendar-navigation"><button type="button" className="secondary" onClick={()=>move(-1)} aria-label="Periodo anterior">← Anterior</button><button type="button" className="secondary" onClick={()=>{setAnchor(today());setSelected(today())}}>Hoy</button><button type="button" className="secondary" disabled={addDays(last,view==='week'?7:31)>upcomingLimit} onClick={()=>move(1)} aria-label="Periodo siguiente">Siguiente →</button></div>
    {error&&<p role="alert" className="tool-error">{error}</p>}
    {loading&&<p role="status">Cargando encuentros…</p>}
    <div className={`calendar-grid ${view==='week'?'is-week':''}`} aria-busy={loading}>
      {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(label=><span className="calendar-weekday" key={label}>{label}</span>)}
      {dates.map(day=>{const events=items.filter(item=>item.fecha===day);return <div key={day} className={`calendar-day${day===today()?' is-today':''}${day===selected?' is-selected':''}${day.slice(0,7)!==anchor.slice(0,7)&&view==='month'?' is-outside':''}`}>
        <button type="button" className="calendar-date" aria-pressed={day===selected} aria-label={`${dayName(day,{dateStyle:'full'})}, ${events.length} encuentros`} onClick={()=>{setSelected(day);setDetail(null)}}><span>{dayName(day,{weekday:'short'})}</span><b>{Number(day.slice(8))}</b>{events.length>0&&<small>{events.length}</small>}</button>
        <div className="calendar-day-events">{events.slice(0,view==='month'?3:20).map(event=><button key={event.id_actividad} type="button" className={`calendar-event ${event.estado_actividad==='cancelada'?'is-cancelled':''}`} onClick={()=>choose(event)} title={`${event.hora} ${event.titulo}`}><span>{String(event.hora).slice(0,5)}</span><strong>{event.titulo}</strong></button>)}{events.length>3&&view==='month'&&<button type="button" className="calendar-more" onClick={()=>setSelected(day)}>+{events.length-3} más</button>}</div>
      </div>})}
    </div>
    <section className="calendar-agenda" aria-label="Encuentros del día seleccionado"><h4>{dayName(selected,{dateStyle:'full'})}</h4>{!selectedItems.length?<p>{loading?'Consultando…':'No hay encuentros para este día.'}</p>:selectedItems.map(event=><button key={event.id_actividad} type="button" className="calendar-agenda-event" onClick={()=>choose(event)}><time>{String(event.hora).slice(0,5)}</time><span><strong>{event.titulo}</strong><small>{event.lugar}{event.estado_actividad==='cancelada'?' · Cancelado':''}</small></span><span aria-hidden="true">↗</span></button>)}</section>
    {detail&&<div className="calendar-detail" ref={detailRef} tabIndex={-1}><h4>{detail.titulo}</h4><p>{detail.fecha} · {String(detail.hora).slice(0,5)} · {detail.lugar}</p>{detail.id_serie!=null&&detail.dia_semana!=null&&<p>{weeklySchedule(Number(detail.dia_semana),String(detail.repeticion_hora||detail.hora),Boolean(detail.repeticion_activa))}</p>}<p>{detail.descripcion}</p>{detail.estado_actividad==='cancelada'?<p>Encuentro cancelado.</p>:detail.requiere_inscripcion&&detail.url_inscripcion?<a href={String(detail.url_inscripcion)} target="_blank" rel="noopener noreferrer">Inscribirme ↗</a>:null}<button type="button" className="secondary" onClick={()=>setDetail(null)}>Cerrar detalle</button></div>}
  </section>
}
