-- Preserve existing accounts, pastoral ranks and customized grants.
INSERT INTO permiso(codigo,descripcion) VALUES ('miembros.registrar','Registrar discípulos')
ON DUPLICATE KEY UPDATE codigo=permiso.codigo;
INSERT INTO rol_sistema(nombre,descripcion) VALUES
  ('Apóstol General','Jerarquía pastoral: nivel 1'),
  ('Asistencia Apostólica','Jerarquía pastoral: nivel 2'),
  ('Pastor de Distrito','Jerarquía pastoral: nivel 3'),
  ('Pastor Local','Jerarquía pastoral: nivel 4')
ON DUPLICATE KEY UPDATE nombre=rol_sistema.nombre;

INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance)
SELECT r.id_rol,p.codigo,'todos' FROM rol_sistema r CROSS JOIN permiso p
WHERE r.nombre IN ('Apóstol General','Asistencia Apostólica','Pastor de Distrito','Pastor Local')
AND p.codigo<>'sedes.gestionar'
AND NOT EXISTS (SELECT 1 FROM migracion_aplicada WHERE nombre='007-pastoral-registration.sql')
ON DUPLICATE KEY UPDATE codigo_permiso=rol_permiso.codigo_permiso;

INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance)
SELECT r.id_rol,p.codigo,'todos' FROM rol_sistema r CROSS JOIN permiso p
WHERE r.nombre='Asistencia Pastoral'
AND p.codigo IN ('miembros.registrar','usuarios.gestionar','ministerios.gestionar')
AND NOT EXISTS (SELECT 1 FROM migracion_aplicada WHERE nombre='007-pastoral-registration.sql')
ON DUPLICATE KEY UPDATE codigo_permiso=rol_permiso.codigo_permiso;

INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance)
SELECT r.id_rol,'miembros.registrar','grupo' FROM rol_sistema r
WHERE r.nombre='Discipulador'
AND NOT EXISTS (SELECT 1 FROM migracion_aplicada WHERE nombre='007-pastoral-registration.sql')
ON DUPLICATE KEY UPDATE codigo_permiso=rol_permiso.codigo_permiso;

INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance)
SELECT r.id_rol,'miembros.registrar','todos' FROM rol_sistema r
WHERE r.nombre='Multimedia'
AND NOT EXISTS (SELECT 1 FROM migracion_aplicada WHERE nombre='007-pastoral-registration.sql')
ON DUPLICATE KEY UPDATE codigo_permiso=rol_permiso.codigo_permiso;

INSERT INTO migracion_aplicada(nombre) VALUES ('007-pastoral-registration.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
