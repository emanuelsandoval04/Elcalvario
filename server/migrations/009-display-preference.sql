CREATE TABLE IF NOT EXISTS preferencia_usuario (
  id_usuario INT NOT NULL PRIMARY KEY,
  tamano_interfaz VARCHAR(16) NOT NULL DEFAULT 'normal',
  fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO migracion_aplicada(nombre) VALUES ('009-display-preference.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
