import { bogotaToday, date, invalid } from './entities.js'

export const addDays = (value, days) => new Date(Date.parse(`${date(value)}T00:00:00Z`)+days*86400000).toISOString().slice(0,10)
export const daysBetween = (a,b) => Math.round((Date.parse(`${b}T00:00:00Z`)-Date.parse(`${a}T00:00:00Z`))/86400000)
export function boundedRange(from, to, maximum=366) {
  date(from);date(to)
  if(to<from || daysBetween(from,to)>=maximum) throw invalid(`Selecciona un intervalo de hasta ${maximum} días.`)
  return {from,to}
}
export function calendarRange(query) {
  const range=boundedRange(query.from,query.to,93)
  if(range.to>addDays(bogotaToday(),365)) throw invalid('El calendario permite consultar hasta un año por adelantado.')
  return range
}
