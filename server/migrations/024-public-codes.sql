-- Visible identifiers: every disciple record gets 0101, 0102... and every account ADM-0001, ADM-0002...
-- Numbers come from secuencia_codigo, are assigned once and are never reused, even after deletions.
CREATE TABLE IF NOT EXISTS secuencia_codigo (
  nombre VARCHAR(30) NOT NULL PRIMARY KEY,
  ultimo INT NOT NULL
) ENGINE=InnoDB;

SET @code_column = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='miembro' AND COLUMN_NAME='codigo_miembro'), 'SELECT 1', 'ALTER TABLE miembro ADD COLUMN codigo_miembro INT NULL, ADD UNIQUE KEY uq_miembro_codigo(codigo_miembro)');
PREPARE code_stmt FROM @code_column;
EXECUTE code_stmt;
DEALLOCATE PREPARE code_stmt;

SET @code_column = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='usuario' AND COLUMN_NAME='codigo_usuario'), 'SELECT 1', 'ALTER TABLE usuario ADD COLUMN codigo_usuario INT NULL, ADD UNIQUE KEY uq_usuario_codigo(codigo_usuario)');
PREPARE code_stmt FROM @code_column;
EXECUTE code_stmt;
DEALLOCATE PREPARE code_stmt;

-- Existing records are numbered in creation order. Reruns only number records still without a code.
SET @member_base = (SELECT GREATEST(COALESCE(MAX(codigo_miembro),100),COALESCE((SELECT ultimo FROM secuencia_codigo WHERE nombre='miembro'),100)) FROM miembro);
UPDATE miembro m JOIN (SELECT id_miembro, ROW_NUMBER() OVER (ORDER BY id_miembro) AS position FROM miembro WHERE codigo_miembro IS NULL) pending ON pending.id_miembro=m.id_miembro
SET m.codigo_miembro=@member_base+pending.position;
INSERT INTO secuencia_codigo(nombre,ultimo) SELECT 'miembro',COALESCE(MAX(codigo_miembro),100) FROM miembro
ON DUPLICATE KEY UPDATE ultimo=GREATEST(ultimo,VALUES(ultimo));

SET @account_base = (SELECT GREATEST(COALESCE(MAX(codigo_usuario),0),COALESCE((SELECT ultimo FROM secuencia_codigo WHERE nombre='usuario'),0)) FROM usuario);
UPDATE usuario u JOIN (SELECT id_usuario, ROW_NUMBER() OVER (ORDER BY id_usuario) AS position FROM usuario WHERE codigo_usuario IS NULL) pending ON pending.id_usuario=u.id_usuario
SET u.codigo_usuario=@account_base+pending.position;
INSERT INTO secuencia_codigo(nombre,ultimo) SELECT 'usuario',COALESCE(MAX(codigo_usuario),0) FROM usuario
ON DUPLICATE KEY UPDATE ultimo=GREATEST(ultimo,VALUES(ultimo));

INSERT INTO migracion_aplicada(nombre) VALUES ('024-public-codes.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
