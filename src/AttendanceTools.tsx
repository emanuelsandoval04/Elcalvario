import { useEffect, useRef, useState } from 'react'
import AppSelect from './AppSelect'
import { managementRequest as api } from './management-api'
import './attendance-tools.css'

type Row=Record<string,string|number|null>
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
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
  const options=selected&&!items.some(item=>String(item.id_actividad)===value)?[selected,...items]:items
  return <div className="attendance-picker">
    <div className="record-filters" role="group" aria-label="Fechas de asistencia">{([['upcoming','Hoy y próximos'],['past','Eventos anteriores']] as const).map(([key,label])=><button type="button" key={key} disabled={disabled} aria-pressed={period===key} onClick={()=>{setPeriod(key);setPage(1);setItems([]);onChange(null)}}>{label}</button>)}</div>
    <label>Buscar evento para asistencia<input type="search" maxLength={100} value={search} disabled={disabled} placeholder="Nombre del evento o culto" onChange={event=>{setSearch(event.target.value);setPage(1)}}/></label>
    <label>Actividad<AppSelect aria-label="Actividad" value={value} disabled={disabled||busy||Boolean(error)} onChange={event=>onChange(options.find(item=>String(item.id_actividad)===event.target.value)||null)}><option value="">Selecciona una actividad</option>{options.map(item=><option key={item.id_actividad} value={String(item.id_actividad)}>{item.fecha} · {String(item.hora).slice(0,5)} · {item.titulo}{item.estado_actividad==='cancelada'?' · Cancelada':''}</option>)}</AppSelect></label>
    {busy&&<p role="status">Consultando eventos…</p>}
    {error&&<p role="alert">{error} <button type="button" className="secondary" disabled={disabled||busy} onClick={()=>setRetry(value=>value+1)}>Reintentar</button></p>}
    {!busy&&!error&&!items.length&&<p>No hay eventos en esta búsqueda.</p>}
    {hasMore&&!error&&<button type="button" className="secondary" disabled={disabled||busy} onClick={()=>setPage(value=>value+1)}>Mostrar más eventos</button>}
  </div>
}

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
