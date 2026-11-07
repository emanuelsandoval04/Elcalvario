CREATE TABLE IF NOT EXISTS recuperacion_contrasena (
  id_usuario INT NOT NULL PRIMARY KEY,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  credencial_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  enviado TINYINT NOT NULL DEFAULT 0,
  fecha_creacion DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  fecha_expiracion DATETIME NOT NULL,
  FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  INDEX idx_recuperacion_expiracion (fecha_expiracion)
) ENGINE=InnoDB;

INSERT INTO migracion_aplicada(nombre) VALUES ('018-password-recovery.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
