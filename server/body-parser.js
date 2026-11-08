import express from 'express'

const ordinary = express.json({ limit: '16kb', inflate: false })
const photo = express.json({ limit: '384kb', inflate: false })
const spreadsheet = express.json({ limit: '1mb', inflate: false })
const photoPaths = new Set(['/api/auth/admin/users', '/api/auth/account/photo', '/api/management/members'])

export function jsonBody(request, response, next) {
  const path=request.path.replace(/\/$/, '')
  const parser = request.method === 'POST' && ['/api/management/members/import/preview','/api/management/members/import/commit'].includes(path) ? spreadsheet : request.method === 'POST' && photoPaths.has(path) ? photo : ordinary
  return parser(request, response, next)
}
