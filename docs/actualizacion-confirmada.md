# Actualización confirmada — 8 de octubre de 2026

Confirmación posterior: la iglesia tiene una sola sede y una sola zona. Se retiraron la gestión, los selectores y los endpoints de creación de sedes y zonas. Las tablas y relaciones descritas en la auditoría se conservan sin borrar datos; no se inventa un nombre para la zona.

## Auditoría anterior a los cambios

Se inspeccionó la base local `el_calvario`, MySQL **8.4.11**, y las migraciones 001–003. Hay seis tablas, sin tablas de gestión eclesiástica. No se recibió otro esquema y el propietario confirmó trabajar sobre esta base.

| Tabla existente | Columnas existentes | Registros al inspeccionar |
| --- | --- | --- |
| usuario | id_usuario, id_miembro, correo_login, password_hash, estado_usuario, ultimo_acceso, fecha_creacion, fecha_actualizacion | 1 |
| rol_sistema | id_rol, nombre, descripcion, estado | 2 |
| usuario_rol | id_usuario, id_rol, fecha_asignacion, activo | 1 |
| sesion_usuario | token_hash, id_usuario, fecha_creacion, fecha_expiracion | 2 |
| configuracion_sistema | id, bootstrap_completado, id_superadmin_inicial, fecha_inicializacion | 1 |
| solicitud_participacion | id_solicitud, nombre, telefono, ministerio, mensaje, fecha_creacion | 0 |

Se conservan íntegramente esas tablas, sus claves, datos y la asignación inicial de Superadmin. `usuario.id_miembro` ya existe: se reutiliza y se completa su FK una vez creada `miembro`. No se convierte automáticamente una cuenta en miembro.

## Cambios necesarios y decisiones

- Crear únicamente entidades ausentes: miembro, rol_eclesiastico, sede, zona, grupo_comunion, historial de cambios de grupo/cobertura, multiplicacion_grupo, ministerio, miembro_ministerio, actividad con sus extensiones culto/evento/reunion_grupo, asistencia, alerta_ausencia y consentimiento_datos.
- Extender la arquitectura de roles existente con permiso y rol_permiso. Superadmin se conserva por compatibilidad. Administrador y Pastor tienen todos los permisos del catálogo. Usuario continúa sin acceso a gestión.
- `miembro.fecha_nacimiento` se usa también para cumpleaños; no se crea `fecha_cumpleanos`. Son obligatorios nombres, tipo/número de identificación, celular y fecha_nacimiento. Apellidos, correo, función y demás datos son opcionales porque no se confirmaron como obligatorios.
- `funcion_iglesia` describe la función; `id_rol_eclesiastico` representa la jerarquía. `id_sede`, `id_grupo` e `id_cobertura_pastoral` son relaciones, no textos duplicados.
- `grupo_comunion.id_discipulador` referencia un miembro. Una cuenta se vincula mediante el `usuario.id_miembro` existente; esto delimita el acceso del discipulador a sus propios grupos. No se deduce cobertura a partir del nivel jerárquico.
- Propuesta explicada antes de implementarse: `multiplicacion_grupo.proposito` distingue multiplicación de grupo y apertura de iglesia, y `id_sede_destino` permite vincular una sede cuando exista. Se conserva `id_grupo_origen`; no se crea automáticamente otro grupo ni una iglesia al alcanzar un cupo.
- Los cinco grupos actuales son un dato institucional. No se insertan cinco registros ficticios. Tampoco se inventan zonas, líderes, horarios de ministerios ni nombres de grupos.
- La asistencia admite registro manual y QR preparado. Un registro duplicado devuelve conflicto; corregir usa una operación y permiso distintos. Los visitantes pueden registrarse sin inventar un miembro.
- Las alertas se calculan por miembro sobre registros de actividades realizadas, ordenados por fecha/hora de actividad. Solo ausente suma falta; cualquier otro estado interrumpe la consecutividad. Una secuencia genera alerta al llegar a dos, sin cierre ni seguimiento obligatorio. Las correcciones recalculan su vigencia. No se infiere ausencia por falta de registro.
- Los datos sensibles de salud y emergencia tienen permiso propio. No se amplía su acceso a Asistencia Pastoral ni Discipuladores sin confirmación. Pastor/Administrador/Superadmin conservan el acceso total expresamente indicado. Los usuarios que registran asistencia solo reciben un listado mínimo de identificadores y nombres.
- Reportes separados por permiso: asistencia y grupos para estadísticas; cumpleaños requiere acceso personal. Multimedia no recibe acceso a los cumpleaños ni a fichas personales. Discipuladores reciben reportes de sus grupos.
- El consentimiento guarda medio papel/digital sin exigir una persona recolectora, imponer retención ni automatizar efectos de revocación.
- El dashboard es modular y provisional; cada indicador depende del permiso de consulta correspondiente.

## Conflictos identificados

1. El documento presupone un MER implementado que no estaba en esta base. Se confirmó crear las entidades ausentes, manteniendo la plataforma React/Express/MySQL actual.
2. Registrar asistencia está permitido a todos los roles operativos, pero Discipulador está limitado a sus grupos: prevalece ese alcance para su asistencia, consulta y reportes.
3. Multimedia puede eliminar registros y consultar estadísticas, pero no fichas personales: la eliminación se autoriza por recurso que puede gestionar (eventos y registros de asistencia), sin habilitar lectura de miembros.
4. Pastor y Administrador tienen todos los permisos, por lo que también pueden corregir asistencia. Asistencia Pastoral tiene ese permiso específico; los demás no.
5. Eliminar se implementa como archivado lógico, conservando referencias e historial. El estado activo/inactivo/retirado del miembro se gestiona por separado.
6. No se conocen las credenciales Meta: el conector automático se configura con variables de servidor y mantiene un enlace alternativo. Nunca expone el token en React.

## Migración y conservación

`server/migrations/004-church-management.sql` es un archivo separado para MySQL 8.4.11, aditivo y repetible. No contiene DROP TABLE, DROP COLUMN ni DELETE. El ejecutor comprueba previamente las columnas y sus tipos en las tablas conocidas y detiene la actualización ante definiciones incompatibles, para evitar una adaptación ciega. El DDL de MySQL hace commit implícito: mantener respaldo antes de ejecutarlo. No se pretende que una transacción revierta CREATE/ALTER. Véase la [documentación oficial de MySQL](https://dev.mysql.com/doc/refman/8.4/en/implicit-commit.html).

La migración inicializa solo datos confirmados (institución, jerarquía, ministerios conocidos y roles/permisos), sin inventar personas, actividades ni grupos. No sobreescribe futuras ediciones institucionales al volver a ejecutarla.

## Pendiente de confirmación externa

Nombres y responsables de los cinco grupos; reglas adicionales de cobertura; datos exclusivos del Pastor principal; responsables, descripciones y horarios de ministerios; política de retención y efectos de revocar consentimiento; widgets definitivos; credenciales y permisos de la página de Facebook.

## Resultado verificado

Migración aplicada en la base local después de crear `.backups/pre-004.sql`. Quedaron 26 tablas. Se conservan la cuenta original, su asignación de rol, las dos sesiones y la configuración inicial. No se insertaron miembros ni grupos ficticios. El respaldo contiene datos privados y se excluye del repositorio mediante `.gitignore`.

Se verificaron migración repetida, conservación de registros y revocaciones RBAC, validaciones, alcance del discipulador, campos sensibles, historial, varios ministerios, propósito de apertura, manual/QR/visitantes, alertas en orden cronológico, cancelación/reprogramación, evidencia de consentimiento y los seis reportes PDF/XLSX en una base temporal. Se comprobó también la autenticación inicial y administración de roles previa. El navegador comprobó formularios y vistas de 1440/390/320 px sin desbordamiento horizontal ni errores React. El conector Facebook se probó con respuestas simuladas, no con credenciales de la página.
