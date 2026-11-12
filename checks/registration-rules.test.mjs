import test from 'node:test'
import assert from 'node:assert/strict'
import { memberFields, memberPhone, registrationEmail, birthDate, bogotaToday } from '../server/entities.js'
import { emailDomains, maxAge, oldestBirthDate, tenDigitPhone } from '../server/contact-rules.js'
import * as browser from '../src/contact-rules.ts'

test('celular: exactamente 10 dígitos (se aceptan espacios, guiones y +57)', () => {
  assert.equal(memberPhone('3001234567', true), '3001234567')
  assert.equal(memberPhone('300 123 4567'), '3001234567')
  assert.equal(memberPhone('(300) 123-4567'), '3001234567')
  assert.equal(memberPhone('+57 300 123 4567'), '3001234567')
  assert.equal(memberPhone('6015551234'), '6015551234', 'Fijos de 10 dígitos también')
  for (const value of ['300123456', '30012345678', '+1 300 123 4567', '300-ABC-4567', '1234567']) assert.throws(() => memberPhone(value), /exactamente 10 dígitos/, value)
  assert.equal(memberPhone(''), null)
  assert.throws(() => memberPhone('', true))
  assert.equal(memberFields.contacto_emergencia_celular('310 000 0000'), '3100000000')
  assert.equal(tenDigitPhone('+573001234567'), '3001234567')
})

test('correo: solo proveedores conocidos', () => {
  for (const value of ['Ana@Gmail.com', 'ana@hotmail.com', 'ana@outlook.es', 'ana@yahoo.com', 'ana@icloud.com', 'ana@live.com']) assert.equal(registrationEmail(value), value.toLowerCase())
  for (const value of ['ana@empresa.com', 'ana@gmail.co', 'ana@gmial.com', 'ana@example.invalid']) assert.throws(() => registrationEmail(value), /proveedor conocido/, value)
  assert.throws(() => registrationEmail('sin-arroba'), /Correo inválido/)
  assert.equal(registrationEmail(''), null)
})

test('fecha de nacimiento: no futura y edad máxima de 99 años', () => {
  assert.equal(oldestBirthDate('2026-11-12'), '1926-11-13')
  assert.equal(oldestBirthDate('2028-02-29'), '1928-03-01')
  const today = bogotaToday(), oldest = oldestBirthDate(today)
  assert.equal(birthDate(today), today)
  assert.equal(birthDate(oldest), oldest)
  const dayBefore = new Date(`${oldest}T00:00:00Z`); dayBefore.setUTCDate(dayBefore.getUTCDate() - 1)
  assert.throws(() => birthDate(dayBefore.toISOString().slice(0, 10)), /mayor de 99 años/)
  assert.throws(() => birthDate('1900-01-01'), /mayor de 99 años/)
  const tomorrow = new Date(`${today}T00:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  assert.throws(() => birthDate(tomorrow.toISOString().slice(0, 10)), /futuro/)
})

test('el navegador aplica las mismas reglas', () => {
  assert.equal(browser.phoneError('300 123 4567'), '')
  assert.match(browser.phoneError('12345'), /10 dígitos/)
  assert.equal(browser.emailError('ana@gmail.com'), '')
  assert.match(browser.emailError('ana@empresa.com'), /proveedor conocido/)
  assert.equal(browser.oldestBirthDate('2026-11-12'), oldestBirthDate('2026-11-12'))
  assert.match(browser.birthDateError('1900-01-01'), /99 años/)
  assert.deepEqual(browser.emailDomains, emailDomains)
  assert.equal(browser.maxAge, maxAge)
})
