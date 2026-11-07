import { readFile } from 'node:fs/promises'

export const migrationFiles = ['001-auth.sql', '002-superadmin.sql', '003-participation.sql', '004-church-management.sql', '005-pending-users.sql', '006-account-profile.sql', '007-pastoral-registration.sql', '008-profile-photo.sql', '009-display-preference.sql', '010-map-coverage.sql', '011-group-neighborhoods.sql', '012-group-neighborhood-text.sql', '013-shared-rate-limits.sql', '014-training-books.sql', '015-account-security.sql', '016-account-deletion.sql', '017-notification-dismissals.sql', '018-password-recovery.sql', '019-recurring-activities.sql']

export async function applyMigrations(connection) {
  const files = await Promise.all(migrationFiles.map(file => readFile(new URL(`./migrations/${file}`, import.meta.url), 'utf8')))
  // Validate BEFORE any write, including reruns of the old bootstrap migration.
  for (const sql of files) {
    for (const match of sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\) ENGINE/g)) {
      const [existing] = await connection.execute('SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [match[1]])
      if (!existing.length) continue
      const expected = [...match[2].matchAll(/^\s{2}(\w+) ((?:INT|TINYINT|VARCHAR\(\d+\)|CHAR\(\d+\)|DATE(?:TIME)?|TIME|TEXT|MEDIUMBLOB|JSON|DECIMAL\(\d+,\d+\)|ENUM\([^\n]+?\)))/gmi)]
      for (const column of expected) {
        const found = existing.find(item => item.name === column[1])
        // Migration 005 accepts both the original enum and the already upgraded enum.
        const pendingUpgrade = match[1] === 'usuario' && column[1] === 'estado_usuario' && found?.type === "enum('activo','inactivo','bloqueado','pendiente')"
        const neighborhoodTextUpgrade = match[1] === 'grupo_comunion' && column[1] === 'barrio' && found?.type === 'text'
        if (!found || !pendingUpgrade && !neighborhoodTextUpgrade && found.type.toLowerCase().replaceAll(' ', '') !== column[2].toLowerCase().replaceAll(' ', '')) {
          throw new Error(`Esquema incompatible: ${match[1]}.${column[1]}. Revisar antes de migrar; no se renombra ni duplica automáticamente.`)
        }
      }
    }
  }
  const [usersTable] = await connection.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='usuario'")
  const [memberTable] = await connection.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='miembro'")
  if (usersTable.length && !memberTable.length) {
    const [links] = await connection.query('SELECT COUNT(*) AS total FROM usuario WHERE id_miembro IS NOT NULL')
    if (links[0].total) throw new Error('Hay usuarios vinculados a miembros sin tabla miembro. Recuperar el esquema original antes de migrar.')
  }
  for (const sql of files) {
    // These migrations contain plain statements, with no procedures or semicolons in strings.
    for (const statement of sql.split(';').map(item => item.trim()).filter(Boolean)) await connection.query(statement)
  }
}
