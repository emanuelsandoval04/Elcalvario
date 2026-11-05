import test from 'node:test'
import assert from 'node:assert/strict'
import { networkInterfaces } from 'node:os'
import { isAllowedOrigin } from '../server/origin.js'

test('accepts Vite on alternate loopback ports when origin and forwarded host match', () => {
  for (const host of ['127.0.0.1:5174', 'localhost:5174', '[::1]:5174']) {
    assert.equal(isAllowedOrigin(`http://${host}`, host), true)
  }
})
test('rejects external origins, mismatched ports, null and malformed origins', () => {
  for (const origin of ['https://attacker.example', 'http://localhost:5174', 'null', 'http://localhost:5174/path', 'http://localhost.attacker.example:5174', 'http://127.0.0.1:5174@attacker.example']) {
    assert.equal(isAllowedOrigin(origin, '127.0.0.1:5174'), false)
  }
})
test('production requires configured origins and does not inherit development ports', () => {
  assert.equal(isAllowedOrigin('http://localhost:5174', 'localhost:5174', 'https://iglesia.example', true), false)
  assert.equal(isAllowedOrigin('https://iglesia.example', '127.0.0.1:3001', 'https://iglesia.example', true), true)
})

test('accepts this PC network address through Vite only in development and with matching Host', () => {
  for (const address of Object.values(networkInterfaces()).flat().filter(value => value?.family === 'IPv4' && !value.internal)) {
    const host = `${address.address}:5174`
    assert.equal(isAllowedOrigin(`http://${host}`, host), true)
    assert.equal(isAllowedOrigin(`http://${host}`, `${address.address}:5173`), false)
    assert.equal(isAllowedOrigin(`http://${host}`, host, 'https://iglesia.example', true), false)
  }
  assert.equal(isAllowedOrigin('http://203.0.113.1:5174', '203.0.113.1:5174'), false)
})
