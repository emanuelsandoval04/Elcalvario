-- Elimina cuentas sin eliminar fichas ni historial operativo.
-- Descubre los nombres existentes y usa nombres nuevos para reemplazarlas en un solo ALTER.
SET @account_deletion_group_concat = @@SESSION.group_concat_max_len;
SET SESSION group_concat_max_len = 16384;

SET @account_deletion_sql = COALESCE((
  SELECT CONCAT('ALTER TABLE `miembro` ', GROUP_CONCAT(CONCAT(
    'DROP FOREIGN KEY `', k.CONSTRAINT_NAME, '`, MODIFY COLUMN `', k.COLUMN_NAME,
    '` INT NULL, ADD CONSTRAINT `fk_acct_del_miembro_', k.COLUMN_NAME, '` FOREIGN KEY (`', k.COLUMN_NAME,
    '`) REFERENCES usuario(id_usuario) ON DELETE SET NULL'
  ) ORDER BY k.ORDINAL_POSITION, k.COLUMN_NAME SEPARATOR ', '))
  FROM information_schema.KEY_COLUMN_USAGE k
  JOIN information_schema.REFERENTIAL_CONSTRAINTS r
    ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.TABLE_NAME=k.TABLE_NAME AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME
  WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME='miembro' AND k.REFERENCED_TABLE_NAME='usuario' AND r.DELETE_RULE<>'SET NULL'
), 'SELECT 1');
PREPARE account_deletion_stmt FROM @account_deletion_sql;
EXECUTE account_deletion_stmt;
DEALLOCATE PREPARE account_deletion_stmt;

SET @account_deletion_sql = COALESCE((
  SELECT CONCAT('ALTER TABLE `historial_miembro` ', GROUP_CONCAT(CONCAT(
    'DROP FOREIGN KEY `', k.CONSTRAINT_NAME, '`, MODIFY COLUMN `', k.COLUMN_NAME,
    '` INT NULL, ADD CONSTRAINT `fk_acct_del_historial_miembro_', k.COLUMN_NAME, '` FOREIGN KEY (`', k.COLUMN_NAME,
    '`) REFERENCES usuario(id_usuario) ON DELETE SET NULL'
  ) ORDER BY k.ORDINAL_POSITION, k.COLUMN_NAME SEPARATOR ', '))
  FROM information_schema.KEY_COLUMN_USAGE k
  JOIN information_schema.REFERENTIAL_CONSTRAINTS r
    ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.TABLE_NAME=k.TABLE_NAME AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME
  WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME='historial_miembro' AND k.REFERENCED_TABLE_NAME='usuario' AND r.DELETE_RULE<>'SET NULL'
), 'SELECT 1');
PREPARE account_deletion_stmt FROM @account_deletion_sql;
EXECUTE account_deletion_stmt;
DEALLOCATE PREPARE account_deletion_stmt;

SET @account_deletion_sql = COALESCE((
  SELECT CONCAT('ALTER TABLE `actividad` ', GROUP_CONCAT(CONCAT(
    'DROP FOREIGN KEY `', k.CONSTRAINT_NAME, '`, MODIFY COLUMN `', k.COLUMN_NAME,
    '` INT NULL, ADD CONSTRAINT `fk_acct_del_actividad_', k.COLUMN_NAME, '` FOREIGN KEY (`', k.COLUMN_NAME,
    '`) REFERENCES usuario(id_usuario) ON DELETE SET NULL'
  ) ORDER BY k.ORDINAL_POSITION, k.COLUMN_NAME SEPARATOR ', '))
  FROM information_schema.KEY_COLUMN_USAGE k
  JOIN information_schema.REFERENTIAL_CONSTRAINTS r
    ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.TABLE_NAME=k.TABLE_NAME AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME
  WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME='actividad' AND k.REFERENCED_TABLE_NAME='usuario' AND r.DELETE_RULE<>'SET NULL'
), 'SELECT 1');
PREPARE account_deletion_stmt FROM @account_deletion_sql;
EXECUTE account_deletion_stmt;
DEALLOCATE PREPARE account_deletion_stmt;

SET @account_deletion_sql = COALESCE((
  SELECT CONCAT('ALTER TABLE `asistencia` ', GROUP_CONCAT(CONCAT(
    'DROP FOREIGN KEY `', k.CONSTRAINT_NAME, '`, MODIFY COLUMN `', k.COLUMN_NAME,
    '` INT NULL, ADD CONSTRAINT `fk_acct_del_asistencia_', k.COLUMN_NAME, '` FOREIGN KEY (`', k.COLUMN_NAME,
    '`) REFERENCES usuario(id_usuario) ON DELETE SET NULL'
  ) ORDER BY k.ORDINAL_POSITION, k.COLUMN_NAME SEPARATOR ', '))
  FROM information_schema.KEY_COLUMN_USAGE k
  JOIN information_schema.REFERENTIAL_CONSTRAINTS r
    ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.TABLE_NAME=k.TABLE_NAME AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME
  WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME='asistencia' AND k.REFERENCED_TABLE_NAME='usuario' AND r.DELETE_RULE<>'SET NULL'
), 'SELECT 1');
PREPARE account_deletion_stmt FROM @account_deletion_sql;
EXECUTE account_deletion_stmt;
DEALLOCATE PREPARE account_deletion_stmt;

SET @account_deletion_sql = COALESCE((
  SELECT CONCAT('ALTER TABLE `discipulador_barrio` ', GROUP_CONCAT(CONCAT(
    'DROP FOREIGN KEY `', k.CONSTRAINT_NAME, '`, MODIFY COLUMN `', k.COLUMN_NAME,
    '` INT NULL, ADD CONSTRAINT `fk_acct_del_discipulador_barrio_', k.COLUMN_NAME, '` FOREIGN KEY (`', k.COLUMN_NAME,
    '`) REFERENCES usuario(id_usuario) ON DELETE SET NULL'
  ) ORDER BY k.ORDINAL_POSITION, k.COLUMN_NAME SEPARATOR ', '))
  FROM information_schema.KEY_COLUMN_USAGE k
  JOIN information_schema.REFERENTIAL_CONSTRAINTS r
    ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.TABLE_NAME=k.TABLE_NAME AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME
  WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME='discipulador_barrio' AND k.REFERENCED_TABLE_NAME='usuario' AND r.DELETE_RULE<>'SET NULL'
), 'SELECT 1');
PREPARE account_deletion_stmt FROM @account_deletion_sql;
EXECUTE account_deletion_stmt;
DEALLOCATE PREPARE account_deletion_stmt;

SET @account_deletion_sql = COALESCE((
  SELECT CONCAT('ALTER TABLE `grupo_barrio` ', GROUP_CONCAT(CONCAT(
    'DROP FOREIGN KEY `', k.CONSTRAINT_NAME, '`, MODIFY COLUMN `', k.COLUMN_NAME,
    '` INT NULL, ADD CONSTRAINT `fk_acct_del_grupo_barrio_', k.COLUMN_NAME, '` FOREIGN KEY (`', k.COLUMN_NAME,
    '`) REFERENCES usuario(id_usuario) ON DELETE SET NULL'
  ) ORDER BY k.ORDINAL_POSITION, k.COLUMN_NAME SEPARATOR ', '))
  FROM information_schema.KEY_COLUMN_USAGE k
  JOIN information_schema.REFERENTIAL_CONSTRAINTS r
    ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.TABLE_NAME=k.TABLE_NAME AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME
  WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME='grupo_barrio' AND k.REFERENCED_TABLE_NAME='usuario' AND r.DELETE_RULE<>'SET NULL'
), 'SELECT 1');
PREPARE account_deletion_stmt FROM @account_deletion_sql;
EXECUTE account_deletion_stmt;
DEALLOCATE PREPARE account_deletion_stmt;

SET @account_deletion_sql = COALESCE((
  SELECT CONCAT('ALTER TABLE `grupo_barrio_cobertura` ', GROUP_CONCAT(CONCAT(
    'DROP FOREIGN KEY `', k.CONSTRAINT_NAME, '`, MODIFY COLUMN `', k.COLUMN_NAME,
    '` INT NULL, ADD CONSTRAINT `fk_acct_del_grupo_barrio_cobertura_', k.COLUMN_NAME, '` FOREIGN KEY (`', k.COLUMN_NAME,
    '`) REFERENCES usuario(id_usuario) ON DELETE SET NULL'
  ) ORDER BY k.ORDINAL_POSITION, k.COLUMN_NAME SEPARATOR ', '))
  FROM information_schema.KEY_COLUMN_USAGE k
  JOIN information_schema.REFERENTIAL_CONSTRAINTS r
    ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.TABLE_NAME=k.TABLE_NAME AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME
  WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME='grupo_barrio_cobertura' AND k.REFERENCED_TABLE_NAME='usuario' AND r.DELETE_RULE<>'SET NULL'
), 'SELECT 1');
PREPARE account_deletion_stmt FROM @account_deletion_sql;
EXECUTE account_deletion_stmt;
DEALLOCATE PREPARE account_deletion_stmt;

SET @account_deletion_sql = COALESCE((
  SELECT CONCAT('ALTER TABLE `libro_adiestramiento` ', GROUP_CONCAT(CONCAT(
    'DROP FOREIGN KEY `', k.CONSTRAINT_NAME, '`, MODIFY COLUMN `', k.COLUMN_NAME,
    '` INT NULL, ADD CONSTRAINT `fk_acct_del_libro_adiestramiento_', k.COLUMN_NAME, '` FOREIGN KEY (`', k.COLUMN_NAME,
    '`) REFERENCES usuario(id_usuario) ON DELETE SET NULL'
  ) ORDER BY k.ORDINAL_POSITION, k.COLUMN_NAME SEPARATOR ', '))
  FROM information_schema.KEY_COLUMN_USAGE k
  JOIN information_schema.REFERENTIAL_CONSTRAINTS r
    ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.TABLE_NAME=k.TABLE_NAME AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME
  WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME='libro_adiestramiento' AND k.REFERENCED_TABLE_NAME='usuario' AND r.DELETE_RULE<>'SET NULL'
), 'SELECT 1');
PREPARE account_deletion_stmt FROM @account_deletion_sql;
EXECUTE account_deletion_stmt;
DEALLOCATE PREPARE account_deletion_stmt;

SET SESSION group_concat_max_len = @account_deletion_group_concat;
INSERT INTO migracion_aplicada(nombre) VALUES ('016-account-deletion.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
