CREATE TABLE IF NOT EXISTS limite_solicitud (
  clave CHAR(64) PRIMARY KEY,
  intentos INT NOT NULL,
  vence_en DATETIME NOT NULL,
  INDEX idx_limite_vencimiento(vence_en)
) ENGINE=InnoDB;
INSERT INTO migracion_aplicada(nombre) VALUES ('013-shared-rate-limits.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
