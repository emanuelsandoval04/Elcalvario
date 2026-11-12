-- QR self check-in. Each event date gets an unguessable link token (created when someone opens its QR)
-- and visitors who register themselves may leave their document number. Both are new columns of
-- existing tables, so the web account keeps working with its current table permissions.
SET @checkin_column = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='actividad' AND COLUMN_NAME='token_asistencia'), 'SELECT 1', 'ALTER TABLE actividad ADD COLUMN token_asistencia CHAR(32) NULL, ADD UNIQUE KEY uq_actividad_token_asistencia(token_asistencia)');
PREPARE checkin_stmt FROM @checkin_column;
EXECUTE checkin_stmt;
DEALLOCATE PREPARE checkin_stmt;

SET @checkin_column = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='asistencia' AND COLUMN_NAME='documento_visitante'), 'SELECT 1', 'ALTER TABLE asistencia ADD COLUMN documento_visitante VARCHAR(30) NULL');
PREPARE checkin_stmt FROM @checkin_column;
EXECUTE checkin_stmt;
DEALLOCATE PREPARE checkin_stmt;

INSERT INTO migracion_aplicada(nombre) VALUES ('026-attendance-checkin.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
