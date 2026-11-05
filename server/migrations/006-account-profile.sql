CREATE TABLE IF NOT EXISTS perfil_usuario (
  id_usuario INT NOT NULL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO migracion_aplicada(nombre) VALUES ('006-account-profile.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
