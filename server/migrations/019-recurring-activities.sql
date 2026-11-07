CREATE TABLE IF NOT EXISTS serie_actividad (
  id_serie INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  dia_semana TINYINT NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NULL,
  activa TINYINT NOT NULL DEFAULT 1,
  plantilla JSON NOT NULL,
  generada_hasta DATE NULL,
  id_usuario_creacion INT NULL,
  fecha_creacion DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  fecha_actualizacion DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  FOREIGN KEY (id_usuario_creacion) REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  CHECK (dia_semana BETWEEN 0 AND 6),
  CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio),
  INDEX idx_serie_activa (activa,generada_hasta)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS actividad_repetida (
  id_actividad INT NOT NULL PRIMARY KEY,
  id_serie INT NOT NULL,
  fecha_programada DATE NOT NULL,
  FOREIGN KEY (id_actividad) REFERENCES actividad(id_actividad) ON DELETE CASCADE,
  FOREIGN KEY (id_serie) REFERENCES serie_actividad(id_serie),
  UNIQUE KEY uq_serie_fecha (id_serie,fecha_programada)
) ENGINE=InnoDB;

INSERT INTO migracion_aplicada(nombre) VALUES ('019-recurring-activities.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
