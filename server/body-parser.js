import express from 'express'

const ordinary = express.json({ limit: '16kb' })
const photo = express.json({ limit: '384kb' })
const photoPaths = new Set(['/api/auth/register', '/api/auth/account/photo', '/api/management/members'])

export function jsonBody(request, response, next) {
  const parser = request.method === 'POST' && photoPaths.has(request.path.replace(/\/$/, '')) ? photo : ordinary
  return parser(request, response, next)
}
