-- Administrador and Superadmin were the same profile. They become one role named Administrador.
-- Existing installations merge both rows. New installations already seed only Administrador.
-- Every statement joins on the old Superadmin row, so once it is renamed reruns change nothing.
INSERT INTO usuario_rol(id_usuario,id_rol)
SELECT ur.id_usuario,s.id_rol FROM usuario_rol ur
JOIN rol_sistema a ON a.id_rol=ur.id_rol AND a.nombre='Administrador'
JOIN rol_sistema s ON s.nombre='Superadmin'
WHERE ur.activo=1
ON DUPLICATE KEY UPDATE activo=1,fecha_asignacion=UTC_TIMESTAMP();

INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance)
SELECT s.id_rol,rp.codigo_permiso,'todos' FROM rol_permiso rp
JOIN rol_sistema a ON a.id_rol=rp.id_rol AND a.nombre='Administrador'
JOIN rol_sistema s ON s.nombre='Superadmin'
ON DUPLICATE KEY UPDATE alcance='todos';

DELETE ur FROM usuario_rol ur JOIN rol_sistema a ON a.id_rol=ur.id_rol AND a.nombre='Administrador' JOIN rol_sistema s ON s.nombre='Superadmin';
DELETE rp FROM rol_permiso rp JOIN rol_sistema a ON a.id_rol=rp.id_rol AND a.nombre='Administrador' JOIN rol_sistema s ON s.nombre='Superadmin';
DELETE a FROM rol_sistema a JOIN rol_sistema s ON s.nombre='Superadmin' WHERE a.nombre='Administrador';

UPDATE rol_sistema SET nombre='Administrador',descripcion='Administración general: todos los permisos, usuarios y roles' WHERE nombre='Superadmin';

INSERT INTO migracion_aplicada(nombre) VALUES ('022-unify-admin-role.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
