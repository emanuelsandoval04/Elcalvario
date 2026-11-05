CREATE TABLE IF NOT EXISTS rol_sistema (
  id_rol INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(60) NOT NULL UNIQUE,
  descripcion VARCHAR(255),
  estado TINYINT NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS usuario (
  id_usuario INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_miembro INT NULL,
  correo_login VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  estado_usuario ENUM('activo','inactivo','bloqueado') NOT NULL DEFAULT 'activo',
  ultimo_acceso DATETIME NULL,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_usuario_miembro (id_miembro)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS usuario_rol (
  id_usuario INT NOT NULL,
  id_rol INT NOT NULL,
  fecha_asignacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activo TINYINT NOT NULL DEFAULT 1,
  PRIMARY KEY (id_usuario,id_rol),
  FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  FOREIGN KEY (id_rol) REFERENCES rol_sistema(id_rol) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sesion_usuario (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  id_usuario INT NOT NULL,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_expiracion DATETIME NOT NULL,
  FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  INDEX idx_sesion_expiracion (fecha_expiracion)
) ENGINE=InnoDB;

INSERT INTO rol_sistema (nombre, descripcion)
SELECT 'Usuario', 'Acceso básico sin permisos administrativos'
WHERE NOT EXISTS (SELECT 1 FROM rol_sistema WHERE nombre = 'Usuario');
