-- Adición de varios barrios por grupo. Conserva el vínculo anterior y su identidad.
CREATE TABLE IF NOT EXISTS grupo_barrio_cobertura (
  id_grupo INT NOT NULL,
  id_barrio INT NOT NULL,
  estado TINYINT NOT NULL DEFAULT 1,
  id_usuario_actualizacion INT NOT NULL,
  fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id_grupo,id_barrio),
  INDEX idx_grupo_cobertura_barrio(id_barrio,estado),
  FOREIGN KEY(id_grupo) REFERENCES grupo_comunion(id_grupo),
  FOREIGN KEY(id_barrio) REFERENCES barrio(id_barrio),
  FOREIGN KEY(id_usuario_actualizacion) REFERENCES usuario(id_usuario)
) ENGINE=InnoDB;
INSERT INTO grupo_barrio_cobertura(id_grupo,id_barrio,id_usuario_actualizacion)
SELECT id_grupo,id_barrio,id_usuario_actualizacion FROM grupo_barrio
WHERE NOT EXISTS (SELECT 1 FROM migracion_aplicada WHERE nombre='011-group-neighborhoods.sql')
ON DUPLICATE KEY UPDATE id_grupo=grupo_barrio_cobertura.id_grupo;
INSERT INTO migracion_aplicada(nombre) VALUES ('011-group-neighborhoods.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
