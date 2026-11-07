import express from 'express'

const ordinary = express.json({ limit: '16kb', inflate: false })
const photo = express.json({ limit: '384kb', inflate: false })
const photoPaths = new Set(['/api/auth/admin/users', '/api/auth/account/photo', '/api/management/members'])

export function jsonBody(request, response, next) {
  const parser = request.method === 'POST' && photoPaths.has(request.path.replace(/\/$/, '')) ? photo : ordinary
  return parser(request, response, next)
}
