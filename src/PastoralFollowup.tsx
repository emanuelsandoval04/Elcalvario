import { useEffect, useRef, useState } from 'react'
import { managementRequest as api } from './management-api'
import AppSelect from './AppSelect'
import ValidatedForm from './ValidatedForm'
import './community-tools.css'

type Case={id_alerta:number;id_miembro:number;nombre:string;celular:string;titulo:string;fecha_actividad:string;grupo:string|null;vigente:number;estado:string;id_responsable:number|null;responsable:string|null;proximo_contacto:string|null;revision:number;contactos:number}
type Details={canManage:boolean;nextBefore:number|null;case:{estado:string;id_responsable:number|null;proximo_contacto:string|null;revision:number};notes:{id_nota:number;tipo:string;detalle:string;fecha_contacto:string;autor:string}[];responsibles:{id:number;nombre:string}[]}
const labels:Record<string,string>={pendiente:'Pendiente',en_seguimiento:'En seguimiento',atendido:'Atendido',llamada:'Llamada',visita:'Visita',mensaje:'Mensaje',nota:'Nota de atención'}
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const now=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T')
export default function PastoralFollowup({notify}:{notify:(message:string)=>void}) {
  const [items,setItems]=useState<Case[]>([]),[state,setState]=useState(''),[search,setSearch]=useState(''),[hasMore,setHasMore]=useState(false)
  const [appliedSearch,setAppliedSearch]=useState(''),[page,setPage]=useState(1),[historyLoading,setHistoryLoading]=useState(false)
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[selected,setSelected]=useState<Case|null>(null),[details,setDetails]=useState<Details|null>(null)
  const [caseLoading,setCaseLoading]=useState(false),[busy,setBusy]=useState(false),[writing,setWriting]=useState(false)
  const [status,setStatus]=useState('pendiente'),[responsible,setResponsible]=useState(''),[nextDate,setNextDate]=useState('')
  const caseVersion=useRef(0),listVersion=useRef(0),editor=useRef<HTMLElement>(null)
  async function load(){const version=++listVersion.current;setLoading(true);setError('');try{const data=await api<{items:Case[];hasMore:boolean}>(`pastoral/cases?${new URLSearchParams({state,q:appliedSearch,page:String(page)})}`);if(version!==listVersion.current)return;setItems(data.items);setHasMore(data.hasMore)}catch(cause){if(version===listVersion.current)setError(cause instanceof Error?cause.message:'No pudimos cargar los casos.')}finally{if(version===listVersion.current)setLoading(false)}}
  useEffect(()=>{void load();return()=>{listVersion.current++}},[state,appliedSearch,page])
  async function open(row:Case) {
    const version=++caseVersion.current
    setSelected(row);setCaseLoading(true);setDetails(null);setError('');setWriting(false);setHistoryLoading(false)
    try{const data=await api<Details>(`pastoral/cases/${row.id_alerta}`);if(version!==caseVersion.current)return;setDetails(data);setStatus(data.case.estado);setResponsible(String(data.case.id_responsable||''));setNextDate(data.case.proximo_contacto||'');requestAnimationFrame(()=>editor.current?.focus())}
    catch(cause){if(version===caseVersion.current)setError(cause instanceof Error?cause.message:'No pudimos consultar el historial.')}
    finally{if(version===caseVersion.current)setCaseLoading(false)}
  }
  async function save(form:HTMLFormElement) {
    if(!selected||!details||busy)return
    const values=new FormData(form);setBusy(true);setError('')
    try {
      await api(`pastoral/cases/${selected.id_alerta}`,{revision:details.case.revision,estado:status,id_responsable:responsible?Number(responsible):null,proximo_contacto:nextDate||null,...(writing?{note:{tipo:values.get('tipo'),detalle:values.get('detalle'),fecha:values.get('fecha')}}:{})},'PATCH')
      notify('Seguimiento guardado. El historial de atención se conserva.');await load();await open(selected)
    }catch(cause){setError(cause instanceof Error?cause.message:'No pudimos guardar el seguimiento.')}
    finally{setBusy(false)}
  }
  async function olderNotes(){if(!selected||!details?.nextBefore||historyLoading)return;const version=caseVersion.current;setHistoryLoading(true);try{const result=await api<Details>(`pastoral/cases/${selected.id_alerta}?before=${details.nextBefore}`);if(version===caseVersion.current)setDetails(previous=>previous?{...previous,notes:[...previous.notes,...result.notes],nextBefore:result.nextBefore}:previous)}catch(cause){if(version===caseVersion.current)setError(cause instanceof Error?cause.message:'No pudimos cargar los contactos anteriores.')}finally{if(version===caseVersion.current)setHistoryLoading(false)}}
  const visible=items
  return <section className="pastoral-page community-tool"><div className="tool-heading"><div><h2>Seguimiento pastoral</h2><p>Asigna responsables y registra el acompañamiento de quienes presentan dos ausencias consecutivas.</p></div><button type="button" className="secondary" disabled={loading||busy} onClick={()=>void load()}>Actualizar casos</button></div>
    <form className="tool-filters" onSubmit={event=>{event.preventDefault();setAppliedSearch(search.trim());setPage(1)}}><label>Buscar discípulo o responsable<input type="search" maxLength={120} value={search} onChange={event=>setSearch(event.target.value)}/></label><label>Estado del seguimiento<AppSelect value={state} disabled={busy} onChange={event=>{setState(event.target.value);setPage(1);setSelected(null);setDetails(null);caseVersion.current++}}><option value="">Todos los casos</option>{['pendiente','en_seguimiento','atendido'].map(value=><option key={value} value={value}>{labels[value]}</option>)}</AppSelect></label><button type="submit" disabled={busy||loading}>Buscar casos</button></form>
    {error&&<div className="tool-error" role="alert"><p>{error}</p>{selected&&<button type="button" className="secondary" disabled={busy} onClick={()=>void open(selected)}>Recargar caso</button>}</div>}
    {loading?<p role="status">Consultando alertas y seguimientos…</p>:<div className="pastoral-layout"><div className="pastoral-case-list">{visible.length?visible.map(item=><button type="button" className={`pastoral-case${selected?.id_alerta===item.id_alerta?' is-selected':''}`} key={item.id_alerta} disabled={busy} onClick={()=>void open(item)}><span className={`tool-status is-${item.estado}`}>{labels[item.estado]}</span><strong>{item.nombre}</strong><span>{item.grupo||'Sin grupo asignado'}</span><small>{item.responsable?`Responsable: ${item.responsable}`:'Sin responsable asignado'}</small>{item.proximo_contacto&&<small className={item.proximo_contacto<today()&&item.estado!=='atendido'?'is-overdue':''}>Próximo contacto: {item.proximo_contacto}</small>}<small>{item.contactos} registros de atención{!item.vigente?' · Alerta de ausencias finalizada':''}</small></button>):<p className="tool-empty">No hay casos para estos filtros.</p>}<div className="tool-actions"><button type="button" className="secondary" disabled={page<=1||busy} onClick={()=>setPage(previous=>previous-1)}>Casos anteriores</button><button type="button" className="secondary" disabled={!hasMore||busy} onClick={()=>setPage(previous=>previous+1)}>Más casos</button></div><p className="tool-caption">Página {page}</p></div>
      <section className="pastoral-editor" ref={editor} tabIndex={-1} aria-label="Ficha de seguimiento">{caseLoading?<p role="status">Cargando historial…</p>:selected&&details?<><div className="tool-heading"><div><h3>{selected.nombre}</h3><p>{selected.titulo} · {selected.fecha_actividad}</p></div><button type="button" className="secondary" disabled={busy} onClick={()=>{setSelected(null);setDetails(null);caseVersion.current++}}>Cerrar ficha</button></div><p>{selected.celular&&<>Teléfono: <a href={`tel:${selected.celular.replace(/[^+\d]/g,'')}`}>{selected.celular}</a></>}</p>
        {!selected.vigente&&<p className="tool-caption">La alerta de ausencias ya no está vigente. Se conserva el acompañamiento registrado.</p>}
        {details.canManage?<ValidatedForm className="pastoral-form" onSubmit={event=>{event.preventDefault();void save(event.currentTarget)}}><fieldset disabled={busy}>
          <label>Responsable<AppSelect name="id_responsable" value={responsible} onChange={event=>setResponsible(event.target.value)}><option value="">Sin asignar</option>{responsible&&!details.responsibles.some(person=>String(person.id)===responsible)&&<option value={responsible}>Responsable anterior sin acceso vigente</option>}{details.responsibles.map(person=><option value={person.id} key={person.id}>{person.nombre}</option>)}</AppSelect></label>
          <label>Estado del caso<AppSelect name="estado" value={status} onChange={event=>setStatus(event.target.value)}>{['pendiente','en_seguimiento','atendido'].map(value=><option value={value} key={value}>{labels[value]}</option>)}</AppSelect></label>
          {status!=='atendido'&&<label>Próximo contacto (opcional)<input name="proximo_contacto" type="date" value={nextDate} onChange={event=>setNextDate(event.target.value)}/></label>}
          <label className="tool-check"><input type="checkbox" checked={writing} onChange={event=>setWriting(event.target.checked)}/>Registrar una llamada, visita o nota</label>
          {writing&&<><label>Tipo de contacto<AppSelect name="tipo" defaultValue="llamada"><option value="llamada">Llamada</option><option value="visita">Visita</option><option value="mensaje">Mensaje</option><option value="nota">Nota de atención</option></AppSelect></label><label>Fecha y hora del contacto (Colombia)<input name="fecha" type="datetime-local" required defaultValue={now()} max={now()}/></label><label className="tool-wide">Resultado y observaciones<textarea name="detalle" required maxLength={2000} rows={4} placeholder="Describe el contacto realizado y los acuerdos para el próximo acompañamiento."/></label></>}
          {status==='atendido'&&!details.notes.length&&!writing&&<p className="tool-caption tool-wide">Registra una nota de atención para poder cerrar este caso.</p>}
        </fieldset><div className="tool-actions"><button type="submit" disabled={busy||(status==='atendido'&&!details.notes.length&&!writing)}>{busy?'Guardando…':'Guardar seguimiento'}</button></div></ValidatedForm>:<p className="tool-caption">Tu rol permite consultar el historial. La asignación y el registro de contactos requieren permiso de seguimiento pastoral.</p>}
        <section className="pastoral-history"><h4>Historial de atención</h4>{details.notes.length?details.notes.map(note=><article key={note.id_nota}><span className="tool-status">{labels[note.tipo]}</span><strong>{new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Bogota'}).format(new Date(note.fecha_contacto))}</strong><p>{note.detalle}</p><small>Registró: {note.autor}</small></article>):<p>Todavía no hay contactos registrados.</p>}{details.nextBefore&&<button type="button" className="secondary" disabled={historyLoading} onClick={()=>void olderNotes()}>{historyLoading?'Cargando…':'Cargar contactos anteriores'}</button>}</section>
      </>:<p className="tool-empty">Selecciona un caso para asignar un responsable o consultar su historial.</p>}</section>
    </div>}
  </section>
}
