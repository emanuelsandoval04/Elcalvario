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
export function periodStart(day,interval) {
  if(interval==='month')return day.slice(0,7)+'-01'
  const weekday=new Date(`${day}T00:00:00Z`).getUTCDay()
  return addDays(day,-((weekday+6)%7))
}
export function periodBuckets(from,to,interval) {
  const result=[]
  for(let day=periodStart(from,interval);day<=to;) {
    const next=interval==='month'?new Date(Date.UTC(Number(day.slice(0,4)),Number(day.slice(5,7)),1)).toISOString().slice(0,10):addDays(day,7)
    result.push({date:day,from:day<from?from:day,to:addDays(next,-1)>to?to:addDays(next,-1)})
    day=next
  }
  return result
}
