-- Cada persona descarta sus propios avisos sin modificar cuentas ni eventos.
CREATE TABLE IF NOT EXISTS notificacion_descartada (
  id_usuario INT NOT NULL,
  id_notificacion VARCHAR(96) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  fecha_descartada DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  PRIMARY KEY (id_usuario,id_notificacion),
  FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO migracion_aplicada(nombre) VALUES ('017-notification-dismissals.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
