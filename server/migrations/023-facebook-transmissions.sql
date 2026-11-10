-- Multimedia configures the Facebook (Meta) transmissions from the panel.
-- The page token is stored encrypted with TRANSMISSION_SECRET_KEY and it is never returned by the API.
INSERT INTO permiso(codigo,descripcion) VALUES ('transmisiones.gestionar','Configurar las transmisiones de Facebook (Meta)')
ON DUPLICATE KEY UPDATE codigo=permiso.codigo;

INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance)
SELECT r.id_rol,'transmisiones.gestionar','todos' FROM rol_sistema r
WHERE r.nombre IN ('Administrador','Multimedia')
AND NOT EXISTS(SELECT 1 FROM migracion_aplicada WHERE nombre='023-facebook-transmissions.sql')
ON DUPLICATE KEY UPDATE codigo_permiso=rol_permiso.codigo_permiso;

CREATE TABLE IF NOT EXISTS configuracion_transmision (
  id INT NOT NULL PRIMARY KEY,
  modo ENUM('automatico','manual') NOT NULL DEFAULT 'automatico',
  id_pagina VARCHAR(30) NULL,
  version_graph VARCHAR(10) NULL,
  token_cifrado TEXT NULL,
  token_final VARCHAR(8) NULL,
  video_manual VARCHAR(500) NULL,
  ultimo_estado VARCHAR(200) NULL,
  fecha_verificacion DATETIME NULL,
  id_usuario_actualizacion INT NULL,
  fecha_actualizacion DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  FOREIGN KEY (id_usuario_actualizacion) REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  CHECK (id = 1)
) ENGINE=InnoDB;

INSERT INTO configuracion_transmision(id) VALUES (1)
ON DUPLICATE KEY UPDATE id=configuracion_transmision.id;

INSERT INTO migracion_aplicada(nombre) VALUES ('023-facebook-transmissions.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
