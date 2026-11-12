-- Data-treatment authorization confirmed with a code sent by SMS through Firebase Phone Auth
-- (replaces uploading a signed form). Signed forms already stored stay in documento_consentimiento.
ALTER TABLE consentimiento_datos MODIFY COLUMN medio ENUM('papel','digital','sms') NOT NULL;

CREATE TABLE IF NOT EXISTS verificacion_consentimiento_telefono (
  id_verificacion INT AUTO_INCREMENT PRIMARY KEY,
  id_miembro INT NOT NULL,
  id_consentimiento INT NOT NULL,
  celular VARCHAR(20) NOT NULL,
  firebase_uid VARCHAR(128) NOT NULL,
  fecha_autenticacion DATETIME NOT NULL,
  texto_autorizacion VARCHAR(500) NOT NULL,
  id_usuario_confirmacion INT NULL,
  fecha_registro DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  UNIQUE KEY uq_verificacion_telefono_uso (firebase_uid, fecha_autenticacion),
  INDEX idx_verificacion_telefono_miembro (id_miembro),
  CONSTRAINT fk_verificacion_telefono_miembro FOREIGN KEY (id_miembro) REFERENCES miembro(id_miembro) ON DELETE CASCADE,
  CONSTRAINT fk_verificacion_telefono_consentimiento FOREIGN KEY (id_consentimiento) REFERENCES consentimiento_datos(id_consentimiento),
  CONSTRAINT fk_verificacion_telefono_usuario FOREIGN KEY (id_usuario_confirmacion) REFERENCES usuario(id_usuario) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO migracion_aplicada(nombre) VALUES ('029-phone-consent.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
