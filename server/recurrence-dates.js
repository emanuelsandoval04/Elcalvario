import { bogotaToday, date, time, invalid } from './entities.js'

const dayMilliseconds = 86400000
const timestamp = value => Date.parse(`${date(value)}T00:00:00Z`)
const dayString = value => new Date(value).toISOString().slice(0, 10)

export function fixedStart(weekday, hour, now = new Date()) {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw invalid('Selecciona el día de la semana.')
  const normalized = time(hour).padEnd(8, ':00')
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(part => [part.type, part.value]))
  const today = `${parts.year}-${parts.month}-${parts.day}`
  return new Date(timestamp(today)).getUTCDay() === weekday && normalized <= `${parts.hour}:${parts.minute}:${parts.second}` ? dayString(timestamp(today) + dayMilliseconds) : today
}

export function recurrenceHorizon(from) {
  const end = timestamp(from) + 84 * dayMilliseconds
  return Math.min(end, timestamp('9999-12-31')) === end ? dayString(end) : '9999-12-31'
}

export function weeklyDates(start, weekday, until, from, through) {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw invalid('Selecciona el día de la semana.')
  let current = Math.max(timestamp(start), timestamp(from))
  const end = Math.min(timestamp(through), until ? timestamp(until) : Infinity)
  current += ((weekday - new Date(current).getUTCDay() + 7) % 7) * dayMilliseconds
  const result = []
  for (; current <= end; current += 7 * dayMilliseconds) result.push(dayString(current))
  return result
}

export function parseRecurrence(value, start, today = bogotaToday()) {
  if (value == null) return null
  if (typeof value !== 'object' || Array.isArray(value) || !Number.isInteger(value.dayOfWeek) || value.dayOfWeek < 0 || value.dayOfWeek > 6) throw invalid('Selecciona una repetición semanal y un día válido.')
  const until = value.until == null || value.until === '' ? null : date(value.until)
  date(start)
  if (until && until < start) throw invalid('La fecha final no puede ser anterior al inicio de la repetición.')
  const from = start > today ? start : today
  if (!weeklyDates(start, value.dayOfWeek, until, from, recurrenceHorizon(from)).length) throw invalid('El intervalo no contiene una próxima fecha del día seleccionado.')
  return { dayOfWeek: value.dayOfWeek, start, until }
}
