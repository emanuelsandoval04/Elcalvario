-- Event images uploaded from the panel (JPEG up to 1600 px and 900 KB, prepared by the browser).
-- The SHA-256 of the content is the key, so the same picture is stored once and its public
-- address /api/public/event-images/<version>.jpg never changes.
CREATE TABLE IF NOT EXISTS imagen_actividad (
  version CHAR(64) NOT NULL PRIMARY KEY,
  contenido MEDIUMBLOB NOT NULL,
  ancho INT NOT NULL,
  alto INT NOT NULL,
  id_usuario_creacion INT NULL,
  fecha_creacion DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  INDEX idx_imagen_actividad_fecha (fecha_creacion),
  FOREIGN KEY (id_usuario_creacion) REFERENCES usuario(id_usuario) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO migracion_aplicada(nombre) VALUES ('025-activity-images.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
