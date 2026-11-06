CREATE TABLE IF NOT EXISTS seguridad_mfa (
  id_usuario INT NOT NULL PRIMARY KEY,
  secreto_cifrado TEXT NOT NULL,
  habilitada TINYINT NOT NULL DEFAULT 0,
  recuperacion_confirmada TINYINT NOT NULL DEFAULT 0,
  vence_configuracion DATETIME NULL,
  ultimo_paso BIGINT NOT NULL DEFAULT -1,
  fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mfa_recuperacion (
  id_usuario INT NOT NULL,
  codigo_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  usado_en DATETIME NULL,
  PRIMARY KEY (id_usuario,codigo_hash),
  FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reto_mfa (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  id_usuario INT NOT NULL,
  intentos INT NOT NULL DEFAULT 0,
  vence_en DATETIME NOT NULL,
  FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  INDEX idx_reto_vencimiento (vence_en)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sesion_detalle (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  id_sesion CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  agente VARCHAR(255) NOT NULL,
  ip VARCHAR(64) NOT NULL,
  mfa_verificada TINYINT NOT NULL DEFAULT 0,
  ultima_actividad DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  FOREIGN KEY (token_hash) REFERENCES sesion_usuario(token_hash) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS auditoria_seguridad (
  id_evento INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NULL,
  accion VARCHAR(80) NOT NULL,
  recurso VARCHAR(220) NOT NULL,
  resultado INT NOT NULL,
  ip VARCHAR(64) NOT NULL,
  agente VARCHAR(255) NOT NULL,
  fecha DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  INDEX idx_auditoria_usuario_fecha (id_usuario,fecha),
  INDEX idx_auditoria_fecha (fecha)
) ENGINE=InnoDB;

INSERT INTO migracion_aplicada(nombre) VALUES ('015-account-security.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
