INSERT INTO rol_sistema (nombre, descripcion)
SELECT 'Superadmin', 'Administra usuarios y asigna los roles del sistema'
WHERE NOT EXISTS (SELECT 1 FROM rol_sistema WHERE nombre = 'Superadmin');

CREATE TABLE IF NOT EXISTS configuracion_sistema (
  id TINYINT NOT NULL PRIMARY KEY,
  bootstrap_completado TINYINT NOT NULL DEFAULT 0,
  id_superadmin_inicial INT NULL,
  fecha_inicializacion DATETIME NULL,
  FOREIGN KEY (id_superadmin_inicial) REFERENCES usuario(id_usuario) ON DELETE SET NULL,
  CONSTRAINT chk_configuracion_unica CHECK (id = 1)
) ENGINE=InnoDB;

INSERT INTO configuracion_sistema (id)
SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM configuracion_sistema WHERE id = 1);

INSERT INTO usuario_rol (id_usuario, id_rol)
SELECT u.id_usuario, r.id_rol
FROM usuario u JOIN rol_sistema r ON r.nombre = 'Superadmin'
JOIN configuracion_sistema c ON c.id = 1 AND c.bootstrap_completado = 0
WHERE u.id_usuario = (SELECT MIN(id_usuario) FROM usuario)
AND NOT EXISTS (SELECT 1 FROM usuario_rol ur WHERE ur.id_usuario = u.id_usuario AND ur.id_rol = r.id_rol);

UPDATE configuracion_sistema c
SET c.bootstrap_completado = 1,
    c.id_superadmin_inicial = (SELECT MIN(id_usuario) FROM usuario),
    c.fecha_inicializacion = UTC_TIMESTAMP()
WHERE c.id = 1 AND c.bootstrap_completado = 0
AND EXISTS (SELECT 1 FROM usuario);
