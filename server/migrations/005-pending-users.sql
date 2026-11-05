ALTER TABLE usuario MODIFY COLUMN estado_usuario
  ENUM('activo','inactivo','bloqueado','pendiente') NOT NULL DEFAULT 'pendiente';

INSERT INTO migracion_aplicada(nombre) VALUES ('005-pending-users.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
