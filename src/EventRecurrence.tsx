import { useState } from 'react'
import AppSelect from './AppSelect'

export const weekdays = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

export function weeklySchedule(day: number, time: string, active: boolean = true) {
  if (!active) return 'Repetición detenida'
  const hour = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Bogota' }).format(new Date(`2000-01-01T${time}-05:00`))
  return `Cada ${weekdays[day]} · ${hour}`
}

export default function EventRecurrence({ disabled, labelledBy, initial = {} }: { disabled: boolean; labelledBy: string; initial?: Record<string, string | number | null> }) {
  const series = Boolean(initial.id_serie)
  const [enabled, setEnabled] = useState(series)
  const [day, setDay] = useState(String(initial.dia_semana ?? 0))
  const [scope, setScope] = useState(series ? 'following' : 'single')
  const [date, setDate] = useState(String(initial.fecha || ''))
  const [hour, setHour] = useState(String((series ? initial.repeticion_hora : initial.hora) || initial.hora || '').slice(0, 5))
  const fixed = enabled && (!series || scope === 'following')
  return <div className="event-recurrence" role="group" aria-labelledby={labelledBy}>
    <input name="recurrence" type="hidden" value={fixed ? JSON.stringify({ dayOfWeek: Number(day), until: null }) : ''}/>
    <input name="fixed" type="hidden" value={fixed ? '1' : '0'}/>
    {fixed && <input name="fecha" type="hidden" value=""/>}
    <label className="event-repeat-toggle"><input type="checkbox" checked={enabled} disabled={disabled || series} onChange={event => setEnabled(event.target.checked)}/><span>Fijo</span></label>
    {series && <label className="event-edit-scope">Aplicar cambios a<AppSelect name="edit_scope" value={scope} disabled={disabled} onChange={event => { setScope(event.target.value); setHour(String(event.target.value === 'single' ? initial.hora || '' : initial.repeticion_hora || initial.hora || '').slice(0, 5)) }}><option value="following">Todas las próximas fechas</option><option value="single">Solo esta fecha</option></AppSelect></label>}
    <div className="event-repeat-fields">
      {fixed ? <label>Día de la semana *<AppSelect value={day} required disabled={disabled} onChange={event => setDay(event.target.value)}>{weekdays.map((name, index) => <option key={name} value={index}>{name[0].toUpperCase() + name.slice(1)}</option>)}</AppSelect></label> : <label>Fecha *<input name="fecha" type="date" value={date} required disabled={disabled} onChange={event => setDate(event.target.value)}/></label>}
      <label>Hora (Colombia) *<input name="hora" type="time" value={hour} required disabled={disabled} onChange={event => setHour(event.target.value)}/></label>
      {fixed && <p>Se repetirá cada {weekdays[Number(day)]} a la hora indicada. La próxima fecha se calcula automáticamente.</p>}
      {series && scope === 'single' && <p>Este cambio se aplica únicamente a la fecha seleccionada.</p>}
    </div>
  </div>
}
