-- MySQL 8.4.11. Actualización aditiva del esquema auditado de seis tablas.
-- Ejecutar después de 001, 002 y 003. Respaldar antes de aplicar DDL.
CREATE TABLE IF NOT EXISTS migracion_aplicada (
  nombre VARCHAR(100) PRIMARY KEY,
  fecha_aplicacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS institucion (
  id TINYINT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  vision VARCHAR(255) NOT NULL,
  mision VARCHAR(255) NOT NULL,
  proposito VARCHAR(255) NOT NULL,
  versiculo VARCHAR(60) NOT NULL,
  ciudad VARCHAR(100) NOT NULL,
  direccion VARCHAR(200) NOT NULL,
  grupos_confirmados INT NOT NULL,
  horarios JSON NOT NULL,
  CONSTRAINT chk_institucion_unica CHECK (id = 1)
) ENGINE=InnoDB;
INSERT INTO institucion
SELECT 1, 'Misión Cristiana El Calvario Villavicencio', 'ESTABLECER EL REINO DE DIOS EN LA TIERRA',
  'ALCANZAR LAS NACIONES PARA CRISTO', 'PRESENTAR A TODO HOMBRE PERFECTO EN CRISTO JESÚS',
  'Éxodo 25:40', 'Villavicencio, Meta', 'Carrera 16 #22-28, Barrio Olímpico', 5,
  JSON_ARRAY(
    JSON_OBJECT('nombre','Servicio General','dia','Domingos','horas',JSON_ARRAY('09:00'),'modalidad','Presencial y virtual','plataformas','YouTube y Facebook'),
    JSON_OBJECT('nombre','Discipulados','dia','Lunes','horas',JSON_ARRAY('19:30','20:30'),'modalidad','Solo virtual','plataformas','Zoom'),
    JSON_OBJECT('nombre','Adiestramiento','dia','Jueves','horas',JSON_ARRAY('19:30'),'modalidad','Presencial y virtual','plataformas','Zoom'))
WHERE NOT EXISTS (SELECT 1 FROM institucion WHERE id=1);

CREATE TABLE IF NOT EXISTS permiso (
  codigo VARCHAR(80) PRIMARY KEY,
  descripcion VARCHAR(200) NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS rol_permiso (
  id_rol INT NOT NULL,
  codigo_permiso VARCHAR(80) NOT NULL,
  alcance ENUM('todos','grupo') NOT NULL DEFAULT 'todos',
  PRIMARY KEY(id_rol,codigo_permiso),
  FOREIGN KEY(id_rol) REFERENCES rol_sistema(id_rol) ON DELETE RESTRICT,
  FOREIGN KEY(codigo_permiso) REFERENCES permiso(codigo) ON DELETE RESTRICT
) ENGINE=InnoDB;
INSERT INTO rol_sistema(nombre,descripcion) VALUES
  ('Administrador','Todos los permisos'), ('Pastor','Todos los permisos'),
  ('Asistencia Pastoral','Acompañamiento pastoral y corrección de asistencia'),
  ('Discipulador','Gestión de los grupos a su cargo'), ('Multimedia','Eventos, asistencia y estadísticas')
ON DUPLICATE KEY UPDATE nombre=rol_sistema.nombre;
INSERT INTO permiso(codigo,descripcion) VALUES
  ('gestion.acceder','Acceso a gestión privada'), ('usuarios.gestionar','Asignar roles y vincular cuentas'),
  ('permisos.gestionar','Configurar permisos granulares'),
  ('miembros.ver','Consultar datos personales'), ('miembros.editar','Registrar y editar miembros'),
  ('miembros.sensibles','Consultar y editar salud y contacto de emergencia'),
  ('miembros.estado','Cambiar activo, inactivo o retirado'), ('miembros.eliminar','Archivar miembros'),
  ('grupos.ver','Consultar grupos'), ('grupos.editar','Crear y editar grupos'), ('grupos.eliminar','Archivar grupos'),
  ('eventos.editar','Crear y editar cultos y eventos'), ('eventos.publicar','Publicar eventos'), ('eventos.eliminar','Archivar actividades'),
  ('asistencia.registrar','Registrar asistencia'), ('asistencia.ver','Consultar asistencia'),
  ('asistencia.corregir','Corregir asistencia'), ('asistencia.eliminar','Archivar registros de asistencia'),
  ('estadisticas.ver','Consultar estadísticas'), ('alertas.ver','Recibir alertas pastorales'),
  ('reportes.asistencia','Exportar asistencia'), ('reportes.cumpleanos','Exportar cumpleaños'),
  ('reportes.grupos','Exportar grupos'), ('consentimientos.gestionar','Registrar y consultar consentimiento'),
  ('ministerios.gestionar','Gestionar pertenencia a ministerios'), ('sedes.gestionar','Gestionar sedes y zonas')
ON DUPLICATE KEY UPDATE codigo=permiso.codigo;
INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance)
SELECT r.id_rol,p.codigo,'todos' FROM rol_sistema r CROSS JOIN permiso p
WHERE r.nombre IN ('Superadmin','Administrador','Pastor')
AND NOT EXISTS (SELECT 1 FROM migracion_aplicada WHERE nombre='004-church-management.sql')
ON DUPLICATE KEY UPDATE codigo_permiso=rol_permiso.codigo_permiso;
INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance)
SELECT r.id_rol,p.codigo,'todos' FROM rol_sistema r CROSS JOIN permiso p
WHERE r.nombre='Asistencia Pastoral' AND p.codigo IN
  ('gestion.acceder','miembros.ver','miembros.estado','miembros.eliminar','grupos.ver','grupos.editar','grupos.eliminar',
   'asistencia.registrar','asistencia.ver','asistencia.corregir','asistencia.eliminar','estadisticas.ver','alertas.ver',
   'reportes.asistencia','reportes.cumpleanos','reportes.grupos')
AND NOT EXISTS (SELECT 1 FROM migracion_aplicada WHERE nombre='004-church-management.sql')
ON DUPLICATE KEY UPDATE codigo_permiso=rol_permiso.codigo_permiso;
INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance)
SELECT r.id_rol,p.codigo,'grupo' FROM rol_sistema r CROSS JOIN permiso p
WHERE r.nombre='Discipulador' AND p.codigo IN
  ('gestion.acceder','miembros.ver','grupos.ver','grupos.editar','asistencia.registrar','asistencia.ver',
   'reportes.asistencia','reportes.cumpleanos','reportes.grupos')
AND NOT EXISTS (SELECT 1 FROM migracion_aplicada WHERE nombre='004-church-management.sql')
ON DUPLICATE KEY UPDATE codigo_permiso=rol_permiso.codigo_permiso;
INSERT INTO rol_permiso(id_rol,codigo_permiso,alcance)
SELECT r.id_rol,p.codigo,'todos' FROM rol_sistema r CROSS JOIN permiso p
WHERE r.nombre='Multimedia' AND p.codigo IN
  ('gestion.acceder','eventos.editar','eventos.publicar','eventos.eliminar','asistencia.registrar','asistencia.ver',
   'asistencia.eliminar','estadisticas.ver','reportes.asistencia','reportes.grupos','grupos.ver')
AND NOT EXISTS (SELECT 1 FROM migracion_aplicada WHERE nombre='004-church-management.sql')
ON DUPLICATE KEY UPDATE codigo_permiso=rol_permiso.codigo_permiso;

CREATE TABLE IF NOT EXISTS rol_eclesiastico (
  id_rol_eclesiastico INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE,
  nivel_jerarquico INT NOT NULL
) ENGINE=InnoDB;
INSERT INTO rol_eclesiastico(nombre,nivel_jerarquico) VALUES
  ('Apóstol General',1),('Asistencia Apostólica',2),('Pastor de Distrito',3),
  ('Pastor Local',4),('Asistencia Pastoral',5),('Discipuladores',6)
ON DUPLICATE KEY UPDATE nivel_jerarquico=VALUES(nivel_jerarquico);
CREATE TABLE IF NOT EXISTS sede (
  id_sede INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL UNIQUE,
  direccion VARCHAR(200) NULL
) ENGINE=InnoDB;
INSERT INTO sede(nombre,direccion)
SELECT 'Misión Cristiana El Calvario Villavicencio','Carrera 16 #22-28, Barrio Olímpico'
WHERE NOT EXISTS (SELECT 1 FROM sede WHERE nombre='Misión Cristiana El Calvario Villavicencio');
CREATE TABLE IF NOT EXISTS zona (
  id_zona INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS miembro (
  id_miembro INT AUTO_INCREMENT PRIMARY KEY,
  nombres VARCHAR(100) NOT NULL,
  apellidos VARCHAR(100) NULL,
  tipo_identificacion VARCHAR(30) NOT NULL,
  numero_identificacion VARCHAR(30) NOT NULL,
  celular VARCHAR(20) NOT NULL,
  correo VARCHAR(120) NULL,
  fecha_nacimiento DATE NOT NULL,
  grupo_sanguineo_rh VARCHAR(10) NULL,
  eps VARCHAR(100) NULL,
  contacto_emergencia_nombre VARCHAR(150) NULL,
  contacto_emergencia_celular VARCHAR(20) NULL,
  funcion_iglesia VARCHAR(150) NULL,
  id_sede INT NULL,
  id_rol_eclesiastico INT NULL,
  id_grupo INT NULL,
  id_cobertura_pastoral INT NULL,
  estado_miembro ENUM('activo','inactivo','retirado') NOT NULL DEFAULT 'activo',
  codigo_qr CHAR(36) NOT NULL UNIQUE,
  archivado TINYINT NOT NULL DEFAULT 0,
  id_usuario_creacion INT NOT NULL,
  id_usuario_actualizacion INT NOT NULL,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_miembro_identificacion(tipo_identificacion,numero_identificacion),
  FOREIGN KEY(id_sede) REFERENCES sede(id_sede),
  FOREIGN KEY(id_rol_eclesiastico) REFERENCES rol_eclesiastico(id_rol_eclesiastico),
  FOREIGN KEY(id_cobertura_pastoral) REFERENCES miembro(id_miembro),
  FOREIGN KEY(id_usuario_creacion) REFERENCES usuario(id_usuario),
  FOREIGN KEY(id_usuario_actualizacion) REFERENCES usuario(id_usuario)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS grupo_comunion (
  id_grupo INT AUTO_INCREMENT PRIMARY KEY,
  codigo_grupo VARCHAR(30) NOT NULL UNIQUE,
  nombre VARCHAR(150) NOT NULL,
  id_discipulador INT NULL,
  id_zona INT NULL,
  id_grupo_origen INT NULL,
  direccion VARCHAR(200) NULL,
  barrio VARCHAR(100) NULL,
  latitud DECIMAL(10,7) NULL,
  longitud DECIMAL(10,7) NULL,
  dia_reunion VARCHAR(20) NULL,
  hora_reunion TIME NULL,
  estado_grupo ENUM('activo','inactivo') NOT NULL DEFAULT 'activo',
  archivado TINYINT NOT NULL DEFAULT 0,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(id_discipulador) REFERENCES miembro(id_miembro),
  FOREIGN KEY(id_zona) REFERENCES zona(id_zona),
  FOREIGN KEY(id_grupo_origen) REFERENCES grupo_comunion(id_grupo),
  CHECK(latitud BETWEEN -90 AND 90), CHECK(longitud BETWEEN -180 AND 180)
) ENGINE=InnoDB;
SET @sql_fk = IF(EXISTS(SELECT 1 FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='miembro' AND COLUMN_NAME='id_grupo' AND REFERENCED_TABLE_NAME='grupo_comunion'), 'SELECT 1', 'ALTER TABLE miembro ADD CONSTRAINT fk_miembro_grupo FOREIGN KEY(id_grupo) REFERENCES grupo_comunion(id_grupo)');
PREPARE fk_stmt FROM @sql_fk;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;
SET @sql_fk = IF(EXISTS(SELECT 1 FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='usuario' AND COLUMN_NAME='id_miembro' AND REFERENCED_TABLE_NAME='miembro'), 'SELECT 1', 'ALTER TABLE usuario ADD CONSTRAINT fk_usuario_miembro FOREIGN KEY(id_miembro) REFERENCES miembro(id_miembro)');
PREPARE fk_stmt FROM @sql_fk;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;
CREATE TABLE IF NOT EXISTS historial_miembro (
  id_historial INT AUTO_INCREMENT PRIMARY KEY,
  id_miembro INT NOT NULL,
  concepto ENUM('grupo','cobertura') NOT NULL,
  id_anterior INT NULL,
  id_nuevo INT NULL,
  id_usuario INT NOT NULL,
  fecha_cambio DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(id_miembro) REFERENCES miembro(id_miembro),
  FOREIGN KEY(id_usuario) REFERENCES usuario(id_usuario)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS multiplicacion_grupo (
  id_multiplicacion INT AUTO_INCREMENT PRIMARY KEY,
  id_grupo_origen INT NOT NULL,
  id_grupo_destino INT NULL,
  id_sede_destino INT NULL,
  proposito ENUM('multiplicacion_grupo','apertura_iglesia') NOT NULL DEFAULT 'apertura_iglesia',
  descripcion TEXT NULL,
  fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(id_grupo_origen) REFERENCES grupo_comunion(id_grupo),
  FOREIGN KEY(id_grupo_destino) REFERENCES grupo_comunion(id_grupo),
  FOREIGN KEY(id_sede_destino) REFERENCES sede(id_sede)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ministerio (
  id_ministerio INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT NULL
) ENGINE=InnoDB;
INSERT INTO ministerio(nombre) VALUES ('Multimedia'),('Alabanza / Adoración'),('Servidores / Ujieres')
ON DUPLICATE KEY UPDATE nombre=ministerio.nombre;
CREATE TABLE IF NOT EXISTS miembro_ministerio (
  id_miembro INT NOT NULL,
  id_ministerio INT NOT NULL,
  activo TINYINT NOT NULL DEFAULT 1,
  fecha_asignacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id_miembro,id_ministerio),
  FOREIGN KEY(id_miembro) REFERENCES miembro(id_miembro),
  FOREIGN KEY(id_ministerio) REFERENCES ministerio(id_ministerio)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS actividad (
  id_actividad INT AUTO_INCREMENT PRIMARY KEY,
  tipo_actividad ENUM('culto','evento','reunion_grupo') NOT NULL,
  titulo VARCHAR(150) NOT NULL,
  fecha DATE NOT NULL,
  hora TIME NOT NULL,
  lugar VARCHAR(200) NOT NULL,
  imagen VARCHAR(500) NULL,
  descripcion TEXT NULL,
  estado_actividad ENUM('programada','cancelada') NOT NULL DEFAULT 'programada',
  publicado TINYINT NOT NULL DEFAULT 0,
  archivado TINYINT NOT NULL DEFAULT 0,
  id_usuario_creacion INT NOT NULL,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY(id_usuario_creacion) REFERENCES usuario(id_usuario),
  INDEX idx_actividad_fecha(fecha,hora)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS culto (
  id_actividad INT PRIMARY KEY,
  FOREIGN KEY(id_actividad) REFERENCES actividad(id_actividad)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS evento (
  id_actividad INT PRIMARY KEY,
  requiere_inscripcion TINYINT NOT NULL DEFAULT 0,
  url_inscripcion VARCHAR(500) NULL,
  FOREIGN KEY(id_actividad) REFERENCES actividad(id_actividad)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS reunion_grupo (
  id_actividad INT PRIMARY KEY,
  id_grupo INT NOT NULL,
  FOREIGN KEY(id_actividad) REFERENCES actividad(id_actividad),
  FOREIGN KEY(id_grupo) REFERENCES grupo_comunion(id_grupo)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS asistencia (
  id_asistencia INT AUTO_INCREMENT PRIMARY KEY,
  id_actividad INT NOT NULL,
  id_miembro INT NULL,
  nombre_visitante VARCHAR(150) NULL,
  id_usuario_registro INT NOT NULL,
  id_usuario_modificacion INT NULL,
  estado_asistencia ENUM('presente','ausente','justificado','visitante') NOT NULL,
  metodo_registro ENUM('manual','qr') NOT NULL DEFAULT 'manual',
  origen_registro VARCHAR(50) NOT NULL DEFAULT 'administracion',
  dispositivo_origen VARCHAR(150) NULL,
  fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_modificacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  estado_sincronizacion ENUM('sincronizado','pendiente') NOT NULL DEFAULT 'sincronizado',
  archivado TINYINT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_asistencia_miembro(id_actividad,id_miembro),
  FOREIGN KEY(id_actividad) REFERENCES actividad(id_actividad),
  FOREIGN KEY(id_miembro) REFERENCES miembro(id_miembro),
  FOREIGN KEY(id_usuario_registro) REFERENCES usuario(id_usuario),
  FOREIGN KEY(id_usuario_modificacion) REFERENCES usuario(id_usuario),
  CHECK(id_miembro IS NOT NULL OR estado_asistencia='visitante')
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS alerta_ausencia (
  id_alerta INT AUTO_INCREMENT PRIMARY KEY,
  id_miembro INT NOT NULL,
  id_actividad INT NOT NULL,
  vigente TINYINT NOT NULL DEFAULT 1,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_alerta(id_miembro,id_actividad),
  FOREIGN KEY(id_miembro) REFERENCES miembro(id_miembro),
  FOREIGN KEY(id_actividad) REFERENCES actividad(id_actividad)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS consentimiento_datos (
  id_consentimiento INT AUTO_INCREMENT PRIMARY KEY,
  id_miembro INT NOT NULL,
  version_politica VARCHAR(50) NOT NULL,
  acepta_politica_privacidad TINYINT NOT NULL,
  acepta_datos_religiosos TINYINT NOT NULL,
  medio ENUM('papel','digital') NOT NULL,
  fecha_aceptacion DATETIME NULL,
  fecha_revocacion DATETIME NULL,
  estado_consentimiento ENUM('aceptado','revocado','pendiente') NOT NULL,
  fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(id_miembro) REFERENCES miembro(id_miembro),
  CHECK(acepta_politica_privacidad IN (0,1)), CHECK(acepta_datos_religiosos IN (0,1))
) ENGINE=InnoDB;
INSERT INTO migracion_aplicada(nombre) VALUES ('004-church-management.sql')
ON DUPLICATE KEY UPDATE nombre=migracion_aplicada.nombre;
