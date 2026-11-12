import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { managementRequest as api } from './management-api'
import QrCode from './QrCode'
import './attendance-tools.css'

type Row=Record<string,string|number|null>
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const longDate=(fecha:string)=>new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',weekday:'long',day:'numeric',month:'long'}).format(new Date(`${fecha}T12:00:00-05:00`))

// QR for self check-in: members type their document number, everyone else registers as a visitor.
export function AttendanceQrPanel({activity,notify}:{activity:Row;notify:(text:string)=>void}) {
  const [link,setLink]=useState(''),[busy,setBusy]=useState(false),[enlarged,setEnlarged]=useState(false),[copied,setCopied]=useState(false)
  const fecha=String(activity.fecha)
  async function load(renew=false) {
    if(renew&&!window.confirm('Se creará un código nuevo y el anterior dejará de funcionar. ¿Continuar?'))return
    setBusy(true)
    try{const result=await api<{token:string}>('attendance/checkin-link',{activityId:Number(activity.id_actividad),...(renew?{renew:true}:{})});setLink(`${window.location.origin}/#asistencia/${result.token}`);if(renew)notify('Código QR renovado. El anterior ya no funciona.')}
    catch(cause){notify(message(cause))}finally{setBusy(false)}
  }
  useEffect(()=>{if(!enlarged)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setEnlarged(false)};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[enlarged])
  async function copy(){try{await navigator.clipboard.writeText(link);setCopied(true);window.setTimeout(()=>setCopied(false),2000)}catch{notify('No pudimos copiar el enlace. Selecciónalo y cópialo manualmente.')}}
  const qr=<QrCode value={link} label={`Código QR de asistencia para ${activity.titulo}`}/>
  return <section className="attendance-qr" aria-labelledby={`attendance-qr-${activity.id_actividad}`}>
    <div className="attendance-qr-heading"><h3 id={`attendance-qr-${activity.id_actividad}`}>Registro con código QR</h3><p>Las personas escanean el código con su celular y registran su asistencia con su número de cédula. Si no están en la base de datos, se registran como visitantes con su nombre completo y quedan en la lista de este evento.</p></div>
    {!link?<button type="button" disabled={busy} onClick={()=>void load()}>{busy?'Preparando código…':'Mostrar código QR'}</button>:<div className="attendance-qr-body">
      <div className="attendance-qr-image">{qr}</div>
      <div className="attendance-qr-actions">
        <button type="button" onClick={()=>setEnlarged(true)}>Ampliar para proyectar</button>
        <button type="button" className="secondary" onClick={()=>void copy()}>{copied?'Enlace copiado':'Copiar enlace'}</button>
        <a className="app-action secondary" href={link} target="_blank" rel="noopener noreferrer">Abrir página de registro</a>
        <button type="button" className="secondary" disabled={busy} onClick={()=>void load(true)}>Generar código nuevo</button>
        <p className="attendance-qr-link">{link}</p>
        {/^(localhost|127\.|\[::1\])/.test(window.location.hostname)&&<p className="attendance-qr-local" role="note">Este código apunta a tu computador ({window.location.host}) y los celulares no podrán abrirlo. Genera el código desde la versión publicada (elcalvario.vercel.app).</p>}
      </div>
    </div>}
    {enlarged&&link&&createPortal(<div className="attendance-qr-overlay" role="dialog" aria-modal="true" aria-label={`Código QR de ${activity.titulo}`} onClick={()=>setEnlarged(false)}>
      <div className="attendance-qr-poster" onClick={event=>event.stopPropagation()}>
        <span>Registra tu asistencia</span><strong>{activity.titulo}</strong><small>{longDate(fecha)} · {String(activity.hora).slice(0,5)}</small>
        <div className="attendance-qr-image">{qr}</div>
        <p>Escanea con la cámara de tu celular</p>
        <button type="button" className="secondary" autoFocus onClick={()=>setEnlarged(false)}>Cerrar</button>
      </div>
    </div>,document.body)}
  </section>
}
const message=(cause:unknown)=>cause instanceof Error?cause.message:'No pudimos consultar las asistencias.'
const labels:Record<string,string>={presente:'Presente',ausente:'Ausente sin justificación',justificado:'Justificado',visitante:'Visitante'}

export function AttendanceActivityPicker({value,selected,disabled,onChange}:{value:string;selected:Row|null;disabled:boolean;onChange:(activity:Row|null)=>void}) {
  const [period,setPeriod]=useState<'upcoming'|'past'>('upcoming'),[search,setSearch]=useState(''),[page,setPage]=useState(1)
  const [items,setItems]=useState<Row[]>([]),[hasMore,setHasMore]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0)
  useEffect(()=>{if(selected){const next=String(selected.fecha)<today()?'past':'upcoming';setPeriod(next);setPage(1)}},[selected?.id_actividad])
  useEffect(()=>{
    let active=true
    setBusy(true)
    const timer=window.setTimeout(()=>{void api<{items:Row[];hasMore:boolean}>(`activities?${new URLSearchParams({view:'attendance',period,page:String(page),q:search})}`).then(result=>{
      if(!active)return
      setItems(previous=>page===1?result.items:[...new Map([...previous,...result.items].map(item=>[item.id_actividad,item])).values()]);setHasMore(result.hasMore);setError('')
    }).catch(cause=>{if(active)setError(message(cause))}).finally(()=>{if(active)setBusy(false)})},search?250:0)
    return()=>{active=false;window.clearTimeout(timer)}
  },[period,search,page,retry])
  // Once an event is chosen the grid folds away so the roster sits right below.
  if(value)return <div className="attendance-picker attendance-picker-chosen"><button type="button" className="secondary" disabled={disabled} onClick={()=>onChange(null)}>Cambiar evento</button></div>
  const current=today()
  return <div className="attendance-picker">
    <div className="record-filters" role="group" aria-label="Fechas de asistencia">{([['upcoming','Hoy y próximos'],['past','Eventos anteriores']] as const).map(([key,label])=><button type="button" key={key} disabled={disabled} aria-pressed={period===key} onClick={()=>{setPeriod(key);setPage(1);setItems([]);onChange(null)}}>{label}</button>)}</div>
    <label>Buscar evento para asistencia<input type="search" maxLength={100} value={search} disabled={disabled} placeholder="Nombre del evento o culto" onChange={event=>{setSearch(event.target.value);setPage(1)}}/></label>
    {period==='upcoming'&&<p className="attendance-picker-note">Los eventos fijos muestran solo su fecha de esta semana.</p>}
    {!!items.length&&<div className="attendance-cards" role="list" aria-label="Elige el evento para tomar asistencia">{items.map(item=>{
      const fecha=String(item.fecha),day=new Date(`${fecha}T12:00:00-05:00`)
      return <div role="listitem" key={item.id_actividad}><button type="button" className="attendance-card" data-state={item.estado_actividad} data-today={fecha===current||undefined} disabled={disabled} onClick={()=>onChange(item)}>
        <span className="attendance-card-date" aria-hidden="true"><small>{dateFormat({month:'short'}).format(day).replace('.','')}</small><b>{fecha.slice(8,10)}</b></span>
        <span className="attendance-card-copy">
          <strong>{item.titulo}</strong>
          <span className="attendance-card-when">{dateFormat({weekday:'long',day:'numeric',month:'long',year:fecha.slice(0,4)===current.slice(0,4)?undefined:'numeric'}).format(day)} · {String(item.hora).slice(0,5)}</span>
          <span className="attendance-card-tags">{fecha===current&&<span data-tag="hoy">Hoy</span>}{item.id_serie&&<span data-tag="fijo">Fijo</span>}{item.tipo_actividad==='reunion_grupo'&&<span>Reunión de grupo</span>}{item.estado_actividad==='cancelada'&&<span data-tag="cancelada">Cancelada</span>}</span>
        </span>
      </button></div>})}</div>}
    {busy&&<p role="status">Consultando eventos…</p>}
    {error&&<p role="alert">{error} <button type="button" className="secondary" disabled={disabled||busy} onClick={()=>setRetry(value=>value+1)}>Reintentar</button></p>}
    {!busy&&!error&&!items.length&&<p>No hay eventos en esta búsqueda.</p>}
    {hasMore&&!error&&<button type="button" className="secondary" disabled={disabled||busy} onClick={()=>setPage(value=>value+1)}>Mostrar más eventos</button>}
  </div>
}
const dateFormat=(options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',...options})

export function MemberAttendance({memberId}:{memberId:number}) {
  const [items,setItems]=useState<Row[]>([]),[page,setPage]=useState(1),[more,setMore]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0)
  const revision=useRef(0)
  useEffect(()=>{
    const request=++revision.current;setBusy(true)
    void api<{items:Row[];hasMore:boolean}>(`members/${memberId}/attendance?page=${page}`).then(result=>{
      if(request!==revision.current)return
      setItems(previous=>page===1?result.items:[...new Map([...previous,...result.items].map(item=>[item.id_asistencia,item])).values()]);setMore(result.hasMore);setError('')
    }).catch(cause=>{if(request===revision.current)setError(message(cause))}).finally(()=>{if(request===revision.current)setBusy(false)})
    return()=>{revision.current++}
  },[memberId,page,retry])
  return <section className="member-attendance" aria-label="Historial de asistencia del discípulo"><h4>Historial de asistencia</h4><p>Los registros se vinculan a cada evento y fecha. Al guardar el listado, los discípulos sin marcar quedan como ausentes sin justificación.</p>
    {!!items.length&&<ul>{items.map(item=><li key={item.id_asistencia}><div><strong>{item.titulo}</strong><span>{item.fecha} · {String(item.hora).slice(0,5)}{item.estado_actividad==='cancelada'?' · Evento cancelado':''}{item.actividad_archivada?' · Evento archivado':''}</span></div><span className="attendance-history-state" data-state={item.estado_asistencia}>{labels[String(item.estado_asistencia)]||item.estado_asistencia}</span>{!item.actividad_archivada&&<a href={`#gestion/falls/registro/actividad/${item.id_actividad}`}>Ver asistencia del evento</a>}</li>)}</ul>}
    {busy&&<p role="status">Consultando historial…</p>}
    {error&&<p role="alert">{error} <button type="button" className="secondary" disabled={busy} onClick={()=>setRetry(value=>value+1)}>Reintentar</button></p>}
    {!busy&&!error&&!items.length&&<p>No hay asistencias guardadas para este discípulo dentro de tu alcance.</p>}
    {more&&!error&&<button type="button" className="secondary" disabled={busy} onClick={()=>setPage(value=>value+1)}>Ver más asistencias</button>}
  </section>
}
