-- Adición territorial. Conserva zona, miembros, grupos y permisos existentes.
CREATE TABLE IF NOT EXISTS barrio (
  id_barrio INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  comuna VARCHAR(80) NULL,
  codigo VARCHAR(80) NOT NULL UNIQUE,
  geojson JSON NULL,
  fuente_geojson VARCHAR(500) NULL,
  fecha_geometria DATETIME NULL,
  estado TINYINT NOT NULL DEFAULT 1,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_barrio_nombre(nombre),
  INDEX idx_barrio_comuna(comuna)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS discipulador_barrio (
  id_asignacion INT AUTO_INCREMENT PRIMARY KEY,
  id_discipulador INT NOT NULL,
  id_barrio INT NOT NULL,
  estado TINYINT NOT NULL DEFAULT 1,
  id_usuario_asigna INT NOT NULL,
  id_usuario_finaliza INT NULL,
  fecha_asignacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_finalizacion DATETIME NULL,
  vigente TINYINT GENERATED ALWAYS AS (IF(estado=1,1,NULL)) STORED,
  UNIQUE KEY uq_cobertura_vigente(id_discipulador,id_barrio,vigente),
  INDEX idx_cobertura_barrio(id_barrio,estado,id_discipulador),
  FOREIGN KEY(id_discipulador) REFERENCES miembro(id_miembro),
  FOREIGN KEY(id_barrio) REFERENCES barrio(id_barrio),
  FOREIGN KEY(id_usuario_asigna) REFERENCES usuario(id_usuario),
  FOREIGN KEY(id_usuario_finaliza) REFERENCES usuario(id_usuario),
  CHECK(estado IN (0,1)),
  CHECK((estado=1 AND fecha_finalizacion IS NULL) OR (estado=0 AND fecha_finalizacion IS NOT NULL))
) ENGINE=InnoDB;

-- Relación opcional separada: no altera el barrio libre ni las coordenadas previas.
CREATE TABLE IF NOT EXISTS grupo_barrio (
  id_grupo INT PRIMARY KEY,
  id_barrio INT NOT NULL,
  id_usuario_actualizacion INT NOT NULL,
  fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_grupo_barrio(id_barrio),
  FOREIGN KEY(id_grupo) REFERENCES grupo_comunion(id_grupo),
  FOREIGN KEY(id_barrio) REFERENCES barrio(id_barrio),
  FOREIGN KEY(id_usuario_actualizacion) REFERENCES usuario(id_usuario)
) ENGINE=InnoDB;

INSERT INTO migracion_aplicada(nombre) VALUES ('010-map-coverage.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
