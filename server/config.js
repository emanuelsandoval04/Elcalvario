import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { readEnvironment } from './environment.js'

// Hosted deployments use the provider's variables. Loading .env is opt-in there.
if (process.env.NODE_ENV !== 'production' || process.env.ENV_FILE) {
  dotenv.config({ path: process.env.ENV_FILE || fileURLToPath(new URL('../.env', import.meta.url)), quiet: true })
}

const env = { ...process.env }
if (!env.DB_SSL_CA && env.DB_SSL_CA_FILE) {
  env.DB_SSL_CA = readFileSync(env.DB_SSL_CA_FILE, 'utf8')
}

export const { databaseConfig, connectionLimit, apiPort, apiHost, trustProxy, sessionMilliseconds } = readEnvironment(env)
