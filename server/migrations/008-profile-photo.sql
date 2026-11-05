CREATE TABLE IF NOT EXISTS foto_perfil_usuario (
  id_usuario INT NOT NULL PRIMARY KEY,
  contenido MEDIUMBLOB NOT NULL,
  version CHAR(64) NOT NULL,
  fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO migracion_aplicada(nombre) VALUES ('008-profile-photo.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
