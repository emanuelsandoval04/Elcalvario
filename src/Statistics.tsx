import { useEffect, useRef, useState } from 'react'
import { managementRequest as api } from './management-api'
import AppSelect from './AppSelect'
import ValidatedForm from './ValidatedForm'
import './community-tools.css'

type Counts={presente:number;ausente:number;justificado:number;visitante:number;total:number;percentage:number|null}
type Point=Counts&{date:string;from:string;to:string;active:number|null;newMembers:number|null}
type Stats={from:string;to:string;interval:string;summary:Counts;previous:Counts&{from:string;to:string};series:Point[];groups:{id_grupo:number;nombre:string;presente:number;ausente:number;justificado:number;visitante:number}[];groupOptions:{id_grupo:number;nombre:string}[];baseline:string|null;methodology:string}
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const start=()=>new Date(Date.parse(`${today()}T12:00:00Z`)-89*86400000).toISOString().slice(0,10)
const label=(value:string)=>new Intl.DateTimeFormat('es-CO',{day:'numeric',month:'short',timeZone:'America/Bogota'}).format(new Date(`${value}T12:00:00-05:00`))
function SeriesChart({points,keys,title}:{points:Point[];keys:('presente'|'ausente'|'active'|'newMembers')[];title:string}) {
  const colors={presente:'#ec681b',ausente:'#b34f66',active:'#377f70',newMembers:'#4f79bd'}
  const names={presente:'Presentes',ausente:'Ausentes',active:'Discípulos activos',newMembers:'Nuevos discípulos'}
  const max=Math.max(1,...points.flatMap(point=>keys.map(key=>point[key]||0)))
  const x=(index:number)=>44+index*(628/Math.max(1,points.length-1)),y=(value:number)=>206-value/max*170
  return <div className="statistics-chart"><h3>{title}</h3><div className="chart-legend">{keys.map(key=><span key={key}><i style={{background:colors[key]}}/>{names[key]}</span>)}</div><svg viewBox="0 0 720 250" role="img" aria-label={`${title}. Consulta los valores exactos en la tabla de datos.`}>
    {[0,.5,1].map(fraction=><g key={fraction}><line x1="44" x2="686" y1={y(max*fraction)} y2={y(max*fraction)} stroke="#e7ebf1"/><text x="34" y={y(max*fraction)+4} textAnchor="end">{Math.round(max*fraction)}</text></g>)}
    {keys.map(key=><g key={key}>{points.map((point,index)=>point[key]!==null?<circle key={point.date} cx={x(index)} cy={y(point[key]||0)} r={key==='active'?6:4} fill={colors[key]}><title>{label(point.date)}: {point[key]} {names[key]}</title></circle>:null)}{points.slice(1).map((point,index)=>point[key]!==null&&points[index][key]!==null?<line key={point.date} x1={x(index)} y1={y(points[index][key]||0)} x2={x(index+1)} y2={y(point[key]||0)} stroke={colors[key]} strokeWidth="2.5"/>:null)}</g>)}
    {points.filter((_,index)=>index%Math.max(1,Math.ceil(points.length/6))===0).map(point=><text key={point.date} x={x(points.indexOf(point))} y="235" textAnchor="middle">{label(point.date)}</text>)}
  </svg></div>
}
export default function Statistics() {
  const [filters,setFilters]=useState({from:start(),to:today(),interval:'week',groupId:'',type:''}),[applied,setApplied]=useState(filters)
  const [data,setData]=useState<Stats|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('')
  const version=useRef(0)
  useEffect(()=>{const current=++version.current;setLoading(true);setError('');api<Stats>(`statistics?${new URLSearchParams(applied)}`).then(result=>{if(current===version.current)setData(result)}).catch(cause=>{if(current===version.current)setError(cause instanceof Error?cause.message:'No pudimos cargar las estadísticas.')}).finally(()=>{if(current===version.current)setLoading(false)});return()=>{version.current++}},[applied])
  const change=(key:keyof typeof filters,value:string)=>setFilters(previous=>({...previous,[key]:value}))
  const difference=data&&data.summary.percentage!==null&&data.previous.percentage!==null?Math.round((data.summary.percentage-data.previous.percentage)*10)/10:null
  return <section className="statistics-page community-tool"><div className="tool-heading"><div><h2>Estadísticas de la comunidad</h2><p>Compara periodos y observa la participación con datos registrados.</p></div></div>
    <ValidatedForm className="tool-filters" onSubmit={event=>{event.preventDefault();if(filters.to<filters.from){setError('La fecha final no puede ser anterior al inicio.');return}setApplied({...filters})}}>
      <label>Desde<input name="from" type="date" required value={filters.from} max={today()} onChange={event=>change('from',event.target.value)}/></label><label>Hasta<input name="to" type="date" required value={filters.to} min={filters.from} max={today()} onChange={event=>change('to',event.target.value)}/></label>
      <label>Agrupar por<AppSelect name="interval" value={filters.interval} onChange={event=>change('interval',event.target.value)}><option value="week">Semana</option><option value="month">Mes</option></AppSelect></label>
      <label>Grupo<AppSelect name="groupId" value={filters.groupId} onChange={event=>change('groupId',event.target.value)}><option value="">Todos los grupos disponibles</option>{data?.groupOptions.map(group=><option key={group.id_grupo} value={group.id_grupo}>{group.nombre}</option>)}</AppSelect></label>
      <label>Tipo de actividad<AppSelect name="type" value={filters.type} onChange={event=>change('type',event.target.value)}><option value="">Todas</option><option value="culto">Cultos</option><option value="evento">Eventos</option><option value="reunion_grupo">Reuniones de grupo</option></AppSelect></label><button type="submit" disabled={loading}>Consultar</button>
    </ValidatedForm>
    {error&&<p className="tool-error" role="alert">{error}</p>}{loading&&<p role="status">Calculando estadísticas…</p>}
    {data&&!loading&&<><div className="statistics-summary"><article><small>Asistencia registrada</small><strong>{data.summary.percentage===null?'Sin datos':`${data.summary.percentage}%`}</strong><span>{difference===null?'Sin comparación disponible':`${difference>0?'+':''}${difference} puntos frente al periodo anterior`}</span></article><article><small>Presencias</small><strong>{data.summary.presente}</strong><span>Anterior: {data.previous.presente}</span></article><article><small>Ausencias</small><strong>{data.summary.ausente}</strong><span>Justificaciones: {data.summary.justificado}</span></article><article><small>Visitas registradas</small><strong>{data.summary.visitante}</strong><span>Anterior: {data.previous.visitante}</span></article></div>
      <p className="tool-caption">Periodo consultado: {data.from} a {data.to}. Comparación: {data.previous.from} a {data.previous.to}.</p>
      <SeriesChart points={data.series} keys={['presente','ausente']} title="Asistencia por periodo"/>
      {data.baseline&&<><SeriesChart points={data.series} keys={['active','newMembers']} title="Evolución de discípulos"/><p className="tool-caption">El historial de estados comienza el {data.baseline}. Los periodos anteriores no se estiman. Los nuevos registros utilizan su fecha de creación.</p></>}
      <details className="statistics-data"><summary>Ver datos de las gráficas</summary><div className="tool-table-wrap"><table><caption>Valores por periodo</caption><thead><tr><th>Periodo</th><th>Presentes</th><th>Ausentes</th><th>Justificados</th><th>Visitantes</th><th>Activos</th><th>Nuevos</th></tr></thead><tbody>{data.series.map(point=><tr key={point.date}><th scope="row">{point.from} – {point.to}</th><td>{point.presente}</td><td>{point.ausente}</td><td>{point.justificado}</td><td>{point.visitante}</td><td>{point.active??'Sin historial'}</td><td>{point.newMembers??'Sin acceso'}</td></tr>)}</tbody></table></div></details>
      <section className="statistics-groups"><h3>Comparación entre grupos</h3>{data.groups.length?<div className="tool-table-wrap"><table><thead><tr><th>Grupo actual</th><th>Presencias</th><th>Ausencias</th><th>Justificaciones</th><th>Visitantes</th><th>Asistencia</th></tr></thead><tbody>{data.groups.map(group=><tr key={group.id_grupo}><th scope="row">{group.nombre}</th><td>{group.presente}</td><td>{group.ausente}</td><td>{group.justificado}</td><td>{group.visitante}</td><td>{group.presente+group.ausente?`${Math.round(group.presente/(group.presente+group.ausente)*1000)/10}%`:'Sin datos'}</td></tr>)}</tbody></table></div>:<p>No hay asistencias registradas para estos filtros.</p>}</section>
      <p className="tool-caption">{data.methodology}</p>
    </>}
  </section>
}
