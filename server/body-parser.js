import express from 'express'

const ordinary = express.json({ limit: '16kb', inflate: false })
const photo = express.json({ limit: '384kb', inflate: false })
const spreadsheet = express.json({ limit: '3mb', inflate: false })
// Event images arrive as a base64 JPEG of up to 900 KB.
const activityImage = express.json({ limit: '1280kb', inflate: false })
const photoPaths = new Set(['/api/auth/admin/users', '/api/auth/account/photo', '/api/management/members', '/api/management/attendance/save'])

export function jsonBody(request, response, next) {
  const path=request.path.replace(/\/$/, '')
  if(request.method === 'POST' && path === '/api/management/activities/images') return activityImage(request,response,next)
  const parser = request.method === 'POST' && ['/api/management/members/import/preview','/api/management/members/import/commit'].includes(path) ? spreadsheet : request.method === 'POST' && photoPaths.has(path) ? photo : ordinary
  return parser(request, response, next)
}
