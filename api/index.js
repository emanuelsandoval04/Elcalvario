import { attachDatabasePool } from '@vercel/functions'
import app from '../server/app.js'
import { pool, poolIdleTimeout } from '../server/db.js'

// PromisePool exposes events but not config. Supply the public event API and
// leave one extra second for mysql2's periodic idle-connection reaper.
attachDatabasePool({ config: { idleTimeout: poolIdleTimeout + 1000 }, on: pool.on.bind(pool) })
export default app
