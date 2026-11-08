INSERT INTO permiso(codigo,descripcion) VALUES ('seguimiento.gestionar','Asignar responsables y registrar seguimiento pastoral')
ON DUPLICATE KEY UPDATE codigo=permiso.codigo;

INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance)
SELECT r.id_rol,'seguimiento.gestionar','todos' FROM rol_sistema r
WHERE r.nombre IN ('Superadmin','Administrador','Pastor','Apóstol General','Asistencia Apostólica','Pastor de Distrito','Pastor Local','Asistencia Pastoral')
AND NOT EXISTS(SELECT 1 FROM migracion_aplicada WHERE nombre='020-pastoral-followup.sql')
ON DUPLICATE KEY UPDATE codigo_permiso=rol_permiso.codigo_permiso;

CREATE TABLE IF NOT EXISTS seguimiento_pastoral (
  id_alerta INT NOT NULL PRIMARY KEY,
  id_responsable INT NULL,
  estado ENUM('pendiente','en_seguimiento','atendido') NOT NULL DEFAULT 'pendiente',
  proximo_contacto DATE NULL,
  revision INT NOT NULL DEFAULT 1,
  id_usuario_actualizacion INT NULL,
  fecha_actualizacion DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  FOREIGN KEY (id_alerta) REFERENCES alerta_ausencia(id_alerta),
  FOREIGN KEY (id_responsable) REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  FOREIGN KEY (id_usuario_actualizacion) REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  INDEX idx_seguimiento_estado (estado,proximo_contacto)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS nota_seguimiento (
  id_nota INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_alerta INT NOT NULL,
  id_usuario INT NULL,
  tipo ENUM('llamada','visita','mensaje','nota') NOT NULL,
  detalle TEXT NOT NULL,
  fecha_contacto DATETIME NOT NULL,
  fecha_registro DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  FOREIGN KEY (id_alerta) REFERENCES seguimiento_pastoral(id_alerta),
  FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  INDEX idx_nota_alerta (id_alerta,id_nota)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS historial_estado_miembro (
  id_cambio INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_miembro INT NOT NULL,
  estado ENUM('activo','inactivo','retirado','archivado') NOT NULL,
  id_usuario INT NULL,
  fecha DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  FOREIGN KEY (id_miembro) REFERENCES miembro(id_miembro),
  FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  INDEX idx_estado_miembro_fecha (id_miembro,fecha,id_cambio)
) ENGINE=InnoDB;

INSERT INTO historial_estado_miembro(id_miembro,estado)
SELECT m.id_miembro,IF(m.archivado=1,'archivado',m.estado_miembro) FROM miembro m
WHERE NOT EXISTS(SELECT 1 FROM historial_estado_miembro h WHERE h.id_miembro=m.id_miembro);

INSERT INTO migracion_aplicada(nombre,fecha_aplicacion) VALUES ('020-pastoral-followup.sql',UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
