import express from 'express'
import { trustProxy } from './config.js'
import { checkDatabase } from './db.js'
import { authRouter } from './auth.js'
import { participationRouter } from './participation.js'
import { managementRouter, publicRouter } from './management.js'
import { jsonBody } from './body-parser.js'

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', trustProxy)
app.use((_request, response, next) => {
  response.set('Cache-Control', 'no-store')
  response.set('X-Content-Type-Options', 'nosniff')
  next()
})
app.use(jsonBody)

app.get('/api/health', async (_request, response) => {
  try {
    await checkDatabase()
    response.json({ status: 'ok', database: 'connected' })
  } catch (error) {
    console.error('MySQL no disponible:', error.code || 'DATABASE_ERROR')
    response.status(503).json({ status: 'unavailable', database: 'disconnected' })
  }
})

app.use('/api/auth', authRouter)
app.use('/api/participation', participationRouter)
app.use('/api/public', publicRouter)
app.use('/api/management', managementRouter)
app.use((_request, response) => response.status(404).json({ error: 'Recurso no encontrado.' }))
app.use((error, _request, response, _next) => {
  const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500
  if (status === 500) console.error('Error de API:', error.code || 'INTERNAL_ERROR')
  response.status(status).json({ error: status === 500 ? 'No pudimos completar la solicitud.' : 'Solicitud inválida.' })
})

// Both the local listener and Vercel use this app. Importing never opens a port,
// applies migrations or requires MySQL to be reachable during the build.
export default app
