// Local test harness for the actual Vercel entry, without Vercel's HTTP edge.
import app from '../api/index.js'
import { pool } from '../server/db.js'

const server = app.listen(Number(process.env.PORT), '127.0.0.1')
process.once('SIGTERM', () => server.close(async () => { await pool.end() }))
process.once('SIGINT', () => server.close(async () => { await pool.end() }))
