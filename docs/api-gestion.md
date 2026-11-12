# API de gestión

Las rutas de seguimiento pastoral, calendario e importación Excel, sus permisos y la migración 020 se documentan en [Herramientas de la comunidad](herramientas-comunidad.md). El módulo de estadísticas fue retirado y su ruta ya no está disponible.

Los cultos y eventos admiten `recurrence: {dayOfWeek:0..6,until:null|"YYYY-MM-DD"}` al crearse o al convertir una actividad individual sin asistencia. Cada fecha se guarda por separado; la agenda y los avisos muestran el próximo encuentro. La edición admite `edit_scope:'single'|'following'` y `POST /api/management/activities/:id/recurrence/stop` detiene futuras fechas sin borrar historial. Ver [permisos, migración 019 y pruebas](eventos-recurrentes.md).

La creación por `POST /api/auth/admin/users` y el registro administrativo por `POST /api/management/members` incorporan `emailDelivery: 'sent' | 'failed' | 'not_configured'` en la respuesta 201. El correo de bienvenida se envía después del commit, con la contraseña inicial, el rol, la vinculación y las funciones permitidas. No devuelve credenciales en la respuesta. Un fallo de envío conserva la cuenta creada. Ver [detalles y pruebas](correos-cuentas.md).

La recuperación por correo usa `POST /api/auth/forgot-password` con `{email}`, `POST /api/auth/reset-password/validate` con `{token}` y `POST /api/auth/reset-password` con `{token,newPassword,confirmation}`. Gmail o Resend envía los enlaces, que vencen en 15 minutos, se consumen una sola vez y revocan todas las sesiones al cambiar la contraseña. `MAIL_PROVIDER` permite cambiar de proveedor sin modificar estas rutas. Ver [configuración, respuestas y límites](recuperacion-contrasena.md). La implementación permanece local hasta autorizar su publicación.

Todas las rutas `/api/management` requieren cookie de sesión, cuenta activa y `gestion.acceder`. Cada operación verifica además su permiso en la base. Las mutaciones admiten JSON y verifican origen igual que la autenticación existente. El registro administrativo crea una ficha y una cuenta con el rol de acceso correspondiente al cargo pastoral. El registro normal crea únicamente la ficha.

`GET /api/auth/me` incluye `pastoralRole: {name,level} | null` y `registration: {canCreateAdministrative,canAssignServices,canManageAccounts}`. Los niveles 1–5 pueden administrar, sujetos a sus permisos operativos. Discipulador y los demás registradores solo crean discípulos normales. Superadmin sin cargo pastoral mantiene la configuración de la instalación. Las restricciones también se validan en cuentas, ministerios, cargos y responsables de grupo; un permiso genérico no las evita.

`POST /api/management/members` requiere `miembros.registrar` o `miembros.editar`. Acepta `tipo_registro: 'discipulo' | 'administrativo'` (predeterminado: `discipulo`). Para administrativo exige `id_rol_eclesiastico`, `account_email`, `account_password` y `account_confirmation`; responde `{id,accountCreated:true}` sin reemplazar la cookie del creador. Para normal responde `{id,accountCreated:false}` y no admite un cargo. `id_grupo` es opcional para todos los registros de personas, incluidos administrativos y discipuladores. Si se env?a un grupo, debe pertenecer al alcance autorizado. Los registradores con alcance de grupo conservan acceso a sus propios registros pendientes sin grupo, sin obtener acceso a los pendientes de otros usuarios. `GET /api/management/catalogs` incluye `registrationGroups` con los grupos disponibles para el alta; Discipulador recibe solo los suyos.

Un creador autorizado puede enviar `id_ministerio` y, para un administrativo con grupo, `responsable_grupo: 1`. La ficha, la cuenta, el perfil, el rol, el ministerio y la responsabilidad seleccionada se guardan en una transacción. Correo duplicado responde 409; datos inválidos, 400; falta de autoridad, 403. Las contraseñas se guardan con el mismo scrypt de autenticación. Las escrituras privilegiadas vuelven a comprobar la sesión y los permisos dentro de la transacción.

El registro público está deshabilitado: `POST /api/auth/register` siempre devuelve 403, incluso antes de inicializar la instalación. El primer Superadmin se crea desde el servidor mediante `npm run account:bootstrap`, con `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` e `INITIAL_ADMIN_NAME` en el entorno; solo admite una instalación vacía y conserva la marca permanente.

`POST /api/auth/admin/users` requiere sesión activa, `usuarios.gestionar` y Superadmin o uno de los cinco cargos pastorales autorizados. Recibe `{name,email,password,confirmation,roleId,memberId?,photo?}`; exige nombre de hasta 100 caracteres, correo válido de hasta 120, contraseña de 10 a 128 y confirmación coincidente. El rol debe estar activo y ser de un cargo inferior al del creador (salvo Superadmin); la ficha vinculada tampoco puede tener un cargo igual o superior. La ficha opcional debe estar disponible, sin otra cuenta vinculada y requiere `miembros.ver` con alcance `todos`; un rol pastoral sincroniza el cargo de la ficha. Crea cuenta activa, perfil, foto y rol en una transacción, revalida la autoridad, registra auditoría y devuelve 201 `{user}` sin contraseña ni cookie nueva. No sustituye la sesión del creador. Correo/ficha duplicado responde 409, validación 400, falta de autoridad 403 y ficha inexistente 404. Usa el límite de seguridad de 12 operaciones por cuenta cada 15 minutos.

Las cuentas pendientes anteriores siguen disponibles: `POST /api/auth/login` y `GET /api/auth/me` devuelven `user.state`, `roles: []` y `permissions: {}` para ellas. Los endpoints protegidos responden 403 mientras estén pendientes. `GET /api/auth/admin/users` ordena primero las cuentas pendientes. `POST /api/auth/admin/users/:id/role` con `{roleId}` asigna el rol y habilita una cuenta pendiente en la misma transacción; conserva el bloqueo/inactividad de los otros estados y protege el rol propio.

Las respuestas de sesión incluyen `user.name` (null si no se ha guardado). `POST /api/auth/account/profile` recibe `{name,email,currentPassword?}`; el nombre admite hasta 100 caracteres y el correo hasta 120. La contraseña actual es obligatoria al cambiar el correo. `POST /api/auth/account/password` recibe `{currentPassword,newPassword}`, con nueva contraseña de 10 a 128 caracteres. Requieren una sesión propia vigente, activa o pendiente; ignoran identificadores/roles ajenos en el cuerpo y no cambian el estado, los permisos ni la ficha del discípulo. Los correos duplicados responden 409, y las validaciones/contraseñas incorrectas, 400. Cambiar correo o contraseña renueva la cookie y revoca las sesiones anteriores en la misma transacción. Se aplican límites de intentos y validación de origen igual que al resto de autenticación.

La campana de todos los perfiles con sesión consulta `GET /api/auth/notifications`: devuelve `{total,items:[{id,type,title,message,createdAt,href}],canManageAccounts}` con hasta 50 avisos y el total real. Las solicitudes de cuentas solo se incluyen con `usuarios.gestionar` y uno de los cinco cargos pastorales o Superadmin. Un permiso genérico en otro rol no revela solicitudes. Los demás perfiles, incluidas cuentas pendientes, reciben únicamente eventos y cultos publicados desde hoy en Colombia. Las reuniones privadas, borradores, archivados y eventos pasados quedan excluidos. Las cancelaciones se identifican y los cambios en los datos publicados generan un nuevo aviso. Las alertas pastorales conservan su módulo independiente.

`POST /api/auth/notifications/dismiss` con `{id}` descarta únicamente el aviso para la cuenta de la sesión. Admite deslizar hacia cualquiera de los lados y un botón accesible para teclado. El descarte persiste en la base de datos al recargar o iniciar otra sesión, sin modificar el evento ni rechazar o eliminar la cuenta pendiente. Repetirlo es idempotente; una notificación inexistente o ajena al alcance devuelve 404. Solo se acepta el identificador visible generado por el servidor; no se reciben identificadores de destinatario. La campana se actualiza cada 15 segundos con la pestaña visible, al regresar y después de descartar o resolver solicitudes. El endpoint anterior `/api/auth/admin/notifications` se conserva como consulta de solicitudes no descartadas para administradores autorizados.

La migración `017-notification-dismissals.sql` crea `notificacion_descartada`, con eliminación en cascada al borrar su cuenta propietaria. `npm run test:notifications` comprueba roles, privacidad, persistencia individual, cambios de eventos y errores. `npm run test:notifications:ui` agrega teclado, ratón y deslizamientos táctiles reales en Edge a 390/320 px.

`GET /api/auth/admin/users` acepta `q` (correo), `state` y `page` (desde 1). Devuelve `users`, `roles`, `total`, `page` y `pageSize` (50), incluyendo `createdAt` y `lastAccess` por cuenta. Permite encontrar usuarios antiguos sin el límite anterior de 200 cuentas.

`DELETE /api/auth/admin/users/:id` recibe `{action:'reject'|'delete',expectedEmail,expectedState}`. El rechazo exige que la cuenta siga pendiente; un correo o estado distinto al confirmado responde 409 para evitar borrar una cuenta que acaba de cambiar. La cuenta propia, los Superadmin y el propietario inicial están protegidos. La API vuelve a verificar sesión y autoridad dentro de la transacción. Elimina físicamente cuenta, roles, sesiones, perfil, foto, preferencias y datos de seguridad asociados. Conserva fichas, asistencias y demás historial operativo con la referencia al usuario eliminado en null, y registra `account.rejected` o `account.deleted` en la auditoría. Los eventos de seguridad históricos de la cuenta permanecen sin su identificador de usuario.

La migración `016-account-deletion.sql` adapta las FK de autoría a `ON DELETE SET NULL` sin borrar registros; puede repetirse. Ejecutar `npm run db:migrate` antes de usar la eliminación. `npm run test:accounts` verifica la actualización de una base con referencias existentes y el flujo real de API en una base temporal local. `npm run test:accounts:ui` agrega las comprobaciones con Edge a 1440/390/320 px.

| Recurso | Operaciones |
| --- | --- |
| `/api/public/institution` | GET datos institucionales y horarios confirmados |
| `/api/public/events` | GET cultos/eventos publicados desde hoy, incluyendo cancelados identificados como tales |
| `/api/public/ministries` | GET ministerios registrados |
| `/api/public/transmission` | GET video/enlace Facebook, indicadores automatic/live; nunca token |
| `/api/management/catalogs` | GET roles eclesiásticos, sedes, zonas, ministerios y grupos autorizados |
| `/api/management/members` | GET búsqueda `q`; POST nuevo discípulo |
| `/api/management/members/:id` | PATCH datos; DELETE archivado lógico |
| `/api/management/members/:id/state` | POST `estado_miembro` |
| `/api/management/members/:id/relations` | POST `id_grupo` / `id_cobertura_pastoral`, con historial |
| `/api/management/members/:id/history` | GET cambios de grupo/cobertura |
| `/api/management/members/:id/ministries` | GET asignaciones; PUT `{ids: [...]}` sin eliminar historial de asignación |
| `/api/management/members/:id/consents` | GET estado e historial; `POST …/sms` envía el código y `POST …/sms/confirm` lo confirma (ver autorizacion-datos-sms.md) |
| `/api/management/groups` | GET grupos autorizados; POST grupo |
| `/api/management/groups/:id` | PATCH grupo; DELETE archivado |
| `/api/management/groups/:id/processes` | GET/POST proceso con propósito y destino opcional |
| `/api/management/activities` | GET con permiso registrar/ver asistencia, editar/publicar eventos o editar grupos, aplicando su alcance; POST actividad y su extensión |
| `/api/management/activities/:id` | PATCH reprogramación, cancelación o publicación; DELETE archivado |
| `/api/management/activities/images` | POST `{image}` (JPEG en base64 preparado por el formulario, máx. 1600 px y 900 KB) con `eventos.editar` o `grupos.editar`; devuelve `{url}` para el campo `imagen`. Ver [Imágenes de eventos](imagenes-eventos.md) |
| `/api/management/attendance/roster?activityId=...` | GET listado activo, indicador de registro previo, versión y datos del evento |
| `/api/management/attendance?activityId=...` | GET registros autorizados |
| `/api/management/attendance` | POST registro manual/QR/visitante; devuelve 409 ante duplicado |
| `/api/management/attendance/checkin-link` | POST `{activityId, renew?}`: código QR de autorregistro de esa fecha. Ver [Registro con código QR](registro-asistencia-qr.md) |
| `/api/management/attendance/save` | POST guardado completo del listado revisado; sin marcar equivale a ausente sin justificación |
| `/api/management/members/:id/attendance` | GET historial autorizado del discípulo, con paginación |
| `/api/management/attendance/:id` | PATCH estado con permiso corregir; DELETE archivado con permiso eliminar |
| `/api/management/alerts` | GET alertas pastorales calculadas, con acceso restringido |
| `/api/management/dashboard` | GET widgets provisionales según permisos |
| `/api/management/reports/:type?format=pdf\|xlsx` | GET asistencia, cumpleanos o grupos; asistencia admite from/to y activityId para una sesión concreta |
| `/api/management/users/:id/member` | POST `{memberId: numero\|null}` para vincular cuenta existente |
| `/api/management/permissions` | GET catálogo y asignaciones RBAC; roles con `editable`, `groupOnly` y `reason` |
| `/api/management/permissions/:roleId` | PUT `{grants:[{codigo,alcance}],expectedGrants?:[{codigo,alcance}]}`; roles protegidos, validación de alcances y 409 ante edición concurrente |

El alcance `grupo` filtra en SQL por `usuario.id_miembro = grupo_comunion.id_discipulador`. También valida recursos destino en mutaciones. Los códigos que admiten este alcance se informan mediante `admite_grupo` en el catálogo de permisos; Discipulador no puede recibir alcance global desde el editor.

La configuración se encuentra en [Usuarios, roles y permisos](usuarios-roles-permisos.md), junto a la asignación de roles. La sección conserva por separado la autoridad para administrar cuentas y para editar perfiles.

La consulta de discípulos devuelve hasta 500 coincidencias; actividades administrativas, hasta 500, y eventos públicos, hasta 100. Los reportes exportan todos los registros autorizados que cumplan sus filtros. Para volúmenes superiores habrá que incorporar paginación y procesamiento de exportaciones, sin cambiar estas relaciones.

El consentimiento es un registro de evidencia: no envía comunicaciones ni aplica reglas legales de revocación/retención no confirmadas. El estado del discípulo y la vigencia de su cuenta siguen siendo conceptos distintos.

La iglesia confirmó una sola sede y una sola zona: se retiraron su módulo, selectores y creación por API. Los catálogos y referencias existentes se conservan como información compatible con el esquema anterior; el permiso `sedes.gestionar` ya no aparece en el editor.
