CREATE TABLE IF NOT EXISTS documento_consentimiento (
  id_documento INT AUTO_INCREMENT PRIMARY KEY,
  id_consentimiento INT NOT NULL UNIQUE,
  id_usuario INT NULL,
  nombre_archivo VARCHAR(150) NOT NULL,
  tipo_archivo VARCHAR(50) NOT NULL,
  contenido MEDIUMBLOB NOT NULL,
  sha256 CHAR(64) NOT NULL,
  autoriza_salud TINYINT NOT NULL DEFAULT 0,
  texto_autorizacion TEXT NOT NULL,
  fecha_subida DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  FOREIGN KEY (id_consentimiento) REFERENCES consentimiento_datos(id_consentimiento),
  FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  CHECK (autoriza_salud IN (0,1))
) ENGINE=InnoDB;
INSERT INTO migracion_aplicada(nombre) VALUES ('021-signed-consent.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
