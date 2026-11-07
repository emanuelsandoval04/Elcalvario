import test from 'node:test'
import assert from 'node:assert/strict'
import { weeklyDates, parseRecurrence, recurrenceHorizon, fixedStart } from '../server/recurrence-dates.js'

test('fixed schedules use Colombia time and skip a Sunday whose time has passed', () => {
  assert.equal(fixedStart(0,'09:00',new Date('2026-11-08T13:59:00Z')),'2026-11-08')
  assert.equal(fixedStart(0,'09:00',new Date('2026-11-08T14:00:00Z')),'2026-11-09')
  assert.equal(fixedStart(0,'09:00:30',new Date('2026-11-08T14:00:00Z')),'2026-11-08')
  assert.equal(fixedStart(4,'09:00',new Date('2026-11-08T14:00:00Z')),'2026-11-08')
  assert.equal(fixedStart(0,'23:00',new Date('2026-11-09T03:00:00Z')),'2026-11-08')
  assert.throws(()=>fixedStart(7,'09:00'),{status:400})
})

test('a Sunday service follows the chosen weekday and includes the optional end date', () => {
  assert.deepEqual(weeklyDates('2026-11-07', 0, '2026-11-29', '2026-11-07', '2026-12-10'), ['2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29'])
  assert.deepEqual(weeklyDates('2026-11-07', 4, null, '2026-11-07', '2026-11-26'), ['2026-11-12', '2026-11-19', '2026-11-26'])
})

test('weekly dates handle year changes, leap years and old starts without creating past history', () => {
  assert.deepEqual(weeklyDates('2026-12-31', 4, null, '2026-12-31', '2027-01-14'), ['2026-12-31', '2027-01-07', '2027-01-14'])
  assert.deepEqual(weeklyDates('2028-02-23', 2, null, '2028-02-23', '2028-03-07'), ['2028-02-29', '2028-03-07'])
  assert.deepEqual(weeklyDates('2020-01-01', 0, null, '2026-11-08', '2026-11-15'), ['2026-11-08', '2026-11-15'])
  assert.equal(recurrenceHorizon('2026-11-07'), '2027-01-30')
  assert.equal(recurrenceHorizon('9999-12-01'), '9999-12-31')
})

test('recurrence validates weekdays, date intervals and the existence of an upcoming occurrence', () => {
  assert.equal(parseRecurrence(null, '2026-11-07', '2026-11-07'), null)
  assert.deepEqual(parseRecurrence({ dayOfWeek: 0 }, '2026-11-07', '2026-11-07'), { dayOfWeek: 0, start: '2026-11-07', until: null })
  for (const input of [[], 'weekly', { dayOfWeek: '0' }, { dayOfWeek: -1 }, { dayOfWeek: 7 }, { dayOfWeek: 0, until: '2026-11-06' }, { dayOfWeek: 0, until: '2026-11-07' }, { dayOfWeek: 0, until: '2026-02-30' }]) assert.throws(() => parseRecurrence(input, '2026-11-07', '2026-11-07'), { status: 400 })
})
