import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
import { readEnvironment } from '../server/environment.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const binaryDirectory = process.env.MYSQL_BIN_DIR || 'C:/Program Files/MySQL/MySQL Workbench 8.0 CE'
const extension = process.platform === 'win32' ? '.exe' : ''
const dumpBinary = process.env.MYSQLDUMP_PATH || (process.platform === 'win32' ? join(binaryDirectory, `mysqldump${extension}`) : 'mysqldump')
const clientBinary = process.env.MYSQL_CLIENT_PATH || (process.platform === 'win32' ? join(binaryDirectory, `mysql${extension}`) : 'mysql')
const sourceEnv = dotenv.parse(await readFile(new URL('../.env', import.meta.url)))
const targetEnv = dotenv.parse(await readFile(new URL('../.env.aiven.local', import.meta.url)))
if (targetEnv.DB_SSL_CA_FILE) targetEnv.DB_SSL_CA = await readFile(resolve(root, targetEnv.DB_SSL_CA_FILE), 'utf8')
const sourceConfig = readEnvironment(sourceEnv).databaseConfig
const targetConfig = readEnvironment(targetEnv).databaseConfig
if (!['localhost', '127.0.0.1', '::1'].includes(sourceConfig.host)) throw new Error('La fuente de esta transferencia debe ser MySQL local.')
if (!targetConfig.host.endsWith('.aivencloud.com') || !targetConfig.ssl?.verifyIdentity) throw new Error('El destino debe ser Aiven con verificación TLS.')

function commandArguments(config) {
  return [`--host=${config.host}`, `--port=${config.port}`, `--user=${config.user}`, '--default-character-set=utf8mb4']
}

async function dataset(connection, database) {
  const [tables] = await connection.execute('SELECT TABLE_NAME AS name,TABLE_TYPE AS type,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME', [database])
  const result = []
  for (const table of tables) {
    if (table.type !== 'BASE TABLE' || table.engine !== 'InnoDB') throw new Error('La transferencia automática admite únicamente tablas InnoDB; revisa vistas u otros motores antes de continuar.')
    const [rows] = await connection.query(`SELECT * FROM ${mysql.escapeId(database)}.${mysql.escapeId(table.name)}`)
    const rowHashes = rows.map(row => createHash('sha256').update(JSON.stringify(row)).digest('hex')).sort()
    result.push({ table: table.name, rows: rows.length, hash: createHash('sha256').update(rowHashes.join('\n')).digest('hex') })
  }
  return result
}

async function runWithFile(binary, args, config, file, direction) {
  const child = spawn(binary, args, {
    cwd: root,
    env: { ...process.env, MYSQL_PWD: config.password },
    windowsHide: true,
    stdio: direction === 'export' ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'ignore', 'pipe'],
  })
  const finished = once(child, 'close')
  let errorText = ''
  child.stderr.on('data', chunk => { errorText += chunk })
  try {
    if (direction === 'export') await pipeline(child.stdout, createWriteStream(file, { flags: 'wx', mode: 0o600 }))
    else await pipeline(createReadStream(file), child.stdin)
    const [code] = await finished
    if (code !== 0) {
      // Diagnostics stay local because a duplicate-entry error may contain data.
      await writeFile(`${file}.${direction}.log`, errorText, { mode: 0o600 })
      throw new Error(`${direction === 'export' ? 'El respaldo' : 'La importación'} falló. Revisa el registro privado junto al respaldo; no se borraron tablas.`)
    }
  } catch (error) {
    if (child.exitCode === null) child.kill()
    throw error
  }
}

let source, target
try {
  source = await mysql.createConnection(sourceConfig)
  target = await mysql.createConnection(targetConfig)
  const [existing] = await target.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=?', [targetConfig.database])
  if (existing.length) throw new Error('Aiven ya contiene tablas. La transferencia se detiene para no sobrescribir datos.')
  const snapshot = await dataset(source, sourceConfig.database)
  if (!snapshot.length) throw new Error('La base local no contiene tablas para transferir.')
  const [triggers] = await source.execute('SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=?', [sourceConfig.database])
  const [routines] = await source.execute('SELECT ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=?', [sourceConfig.database])
  if (triggers.length || routines.length) throw new Error('Hay rutinas o triggers personalizados: revisa sus permisos antes de una transferencia automática.')
  const backupDirectory = join(root, '.backups')
  await mkdir(backupDirectory, { recursive: true })
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const backup = join(backupDirectory, `el_calvario-${stamp}.sql`)
  await runWithFile(dumpBinary, [
    ...commandArguments(sourceConfig), '--single-transaction', '--skip-lock-tables', '--no-tablespaces',
    '--set-gtid-purged=OFF', '--column-statistics=0', '--hex-blob', '--complete-insert',
    '--skip-add-drop-table', '--skip-add-locks', '--skip-comments', sourceConfig.database,
  ], sourceConfig, backup, 'export')
  console.log(`Respaldo privado generado: .backups/${backup.split(/[\\/]/).at(-1)} (${(await stat(backup)).size} bytes).`)
  // No --databases flag above: the dump cannot create/select the local schema.
  const dump = await readFile(backup, 'utf8')
  if (/^\s*(?:CREATE DATABASE|USE |DROP TABLE)/mi.test(dump)) throw new Error('El respaldo contiene instrucciones de esquema no permitidas para esta transferencia.')
  await runWithFile(clientBinary, [
    ...commandArguments(targetConfig), '--connect-timeout=15', '--ssl-mode=VERIFY_IDENTITY',
    `--ssl-ca=${resolve(root, targetEnv.DB_SSL_CA_FILE)}`, targetConfig.database,
  ], targetConfig, backup, 'import')
  const transferred = await dataset(target, targetConfig.database)
  if (JSON.stringify(snapshot) !== JSON.stringify(transferred)) throw new Error('Los registros no coinciden con la instantánea inicial. Conserva el respaldo y revisa cambios locales simultáneos antes de publicar.')
  await writeFile(`${backup}.verification.json`, JSON.stringify({ source: sourceConfig.database, target: targetConfig.database, tables: transferred, verifiedAt: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 })
  console.log(`Transferencia verificada: ${transferred.length} tablas y ${transferred.reduce((total, table) => total + table.rows, 0)} registros idénticos. La base local se conserva.`)
} catch (error) {
  console.error('No se completó la transferencia:', error.code || error.message)
  process.exitCode = 1
} finally {
  if (source) await source.end()
  if (target) await target.end()
}
