CREATE TABLE IF NOT EXISTS libro_adiestramiento (
  id_libro INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL UNIQUE,
  descripcion TEXT NULL,
  id_usuario_creacion INT NOT NULL,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(id_usuario_creacion) REFERENCES usuario(id_usuario)
) ENGINE=InnoDB;
SET @training_column = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='miembro' AND COLUMN_NAME='id_libro'), 'SELECT 1', 'ALTER TABLE miembro ADD COLUMN id_libro INT NULL');
PREPARE training_stmt FROM @training_column;
EXECUTE training_stmt;
DEALLOCATE PREPARE training_stmt;
SET @training_fk = IF(EXISTS(SELECT 1 FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='miembro' AND COLUMN_NAME='id_libro' AND REFERENCED_TABLE_NAME='libro_adiestramiento'), 'SELECT 1', 'ALTER TABLE miembro ADD CONSTRAINT fk_miembro_libro FOREIGN KEY(id_libro) REFERENCES libro_adiestramiento(id_libro)');
PREPARE training_stmt FROM @training_fk;
EXECUTE training_stmt;
DEALLOCATE PREPARE training_stmt;
INSERT INTO permiso(codigo,descripcion) VALUES
  ('adiestramiento.gestionar','Crear libros y gestionar adiestramiento'),
  ('reportes.discipulos','Exportar fichas de discípulos con su libro actual')
ON DUPLICATE KEY UPDATE codigo=permiso.codigo;
INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance)
SELECT id_rol,'adiestramiento.gestionar','todos' FROM rol_sistema
WHERE nombre NOT IN ('Usuario','Discípulo','Discipulo')
AND NOT EXISTS(SELECT 1 FROM migracion_aplicada WHERE nombre='014-training-books.sql')
ON DUPLICATE KEY UPDATE codigo_permiso=rol_permiso.codigo_permiso;
INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance)
SELECT existing_grant.id_rol,'reportes.discipulos',existing_grant.alcance FROM rol_permiso existing_grant
WHERE existing_grant.codigo_permiso='miembros.ver'
AND NOT EXISTS(SELECT 1 FROM migracion_aplicada WHERE nombre='014-training-books.sql')
ON DUPLICATE KEY UPDATE codigo_permiso=rol_permiso.codigo_permiso;
INSERT INTO migracion_aplicada(nombre) VALUES ('014-training-books.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
