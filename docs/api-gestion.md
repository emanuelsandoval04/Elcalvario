# API de gestión

Todas las rutas `/api/management` requieren cookie de sesión, cuenta activa y `gestion.acceder`. Cada operación verifica además su permiso en la base. Las mutaciones admiten JSON y verifican origen igual que la autenticación existente. El registro administrativo crea una ficha y una cuenta con el rol de acceso correspondiente al cargo pastoral. El registro normal crea únicamente la ficha.

`GET /api/auth/me` incluye `pastoralRole: {name,level} | null` y `registration: {canCreateAdministrative,canAssignServices,canManageAccounts}`. Los niveles 1–5 pueden administrar, sujetos a sus permisos operativos. Discipulador y los demás registradores solo crean discípulos normales. Superadmin sin cargo pastoral mantiene la configuración de la instalación. Las restricciones también se validan en cuentas, ministerios, cargos y responsables de grupo; un permiso genérico no las evita.

`POST /api/management/members` requiere `miembros.registrar` o `miembros.editar`. Acepta `tipo_registro: 'discipulo' | 'administrativo'` (predeterminado: `discipulo`). Para administrativo exige `id_rol_eclesiastico`, `account_email`, `account_password` y `account_confirmation`; responde `{id,accountCreated:true}` sin reemplazar la cookie del creador. Para normal responde `{id,accountCreated:false}` y no admite un cargo. `id_grupo` es opcional para todos los registros de personas, incluidos administrativos y discipuladores. Si se env?a un grupo, debe pertenecer al alcance autorizado. Los registradores con alcance de grupo conservan acceso a sus propios registros pendientes sin grupo, sin obtener acceso a los pendientes de otros usuarios. `GET /api/management/catalogs` incluye `registrationGroups` con los grupos disponibles para el alta; Discipulador recibe solo los suyos.

Un creador autorizado puede enviar `id_ministerio` y, para un administrativo con grupo, `responsable_grupo: 1`. La ficha, la cuenta, el perfil, el rol, el ministerio y la responsabilidad seleccionada se guardan en una transacción. Correo duplicado responde 409; datos inválidos, 400; falta de autoridad, 403. Las contraseñas se guardan con el mismo scrypt de autenticación. Las escrituras privilegiadas vuelven a comprobar la sesión y los permisos dentro de la transacción.

Después del registro inicial de Superadmin, `POST /api/auth/register` crea cuentas pendientes sin asignación automática de rol. `POST /api/auth/login` y `GET /api/auth/me` devuelven `user.state`, `roles: []` y `permissions: {}` para estas cuentas, permitiendo consultar su habilitación. Los endpoints protegidos responden 403 mientras estén pendientes. `GET /api/auth/admin/users` requiere `usuarios.gestionar` y ordena primero las cuentas pendientes. `POST /api/auth/admin/users/:id/role` con `{roleId}` asigna el rol y habilita una cuenta pendiente en la misma transacción; conserva el bloqueo/inactividad de los otros estados y protege el rol propio.

Las respuestas de sesión incluyen `user.name` (null si no se ha guardado). `POST /api/auth/account/profile` recibe `{name,email,currentPassword?}`; el nombre admite hasta 100 caracteres y el correo hasta 120. La contraseña actual es obligatoria al cambiar el correo. `POST /api/auth/account/password` recibe `{currentPassword,newPassword}`, con nueva contraseña de 10 a 128 caracteres. Requieren una sesión propia vigente, activa o pendiente; ignoran identificadores/roles ajenos en el cuerpo y no cambian el estado, los permisos ni la ficha del discípulo. Los correos duplicados responden 409, y las validaciones/contraseñas incorrectas, 400. Cambiar correo o contraseña renueva la cookie y revoca las sesiones anteriores en la misma transacción. Se aplican límites de intentos y validación de origen igual que al resto de autenticación.

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
| `/api/management/members/:id/consents` | GET evidencia; POST nuevo registro con fechas ISO UTC y medio papel/digital |
| `/api/management/groups` | GET grupos autorizados; POST grupo |
| `/api/management/groups/:id` | PATCH grupo; DELETE archivado |
| `/api/management/groups/:id/processes` | GET/POST proceso con propósito y destino opcional |
| `/api/management/activities` | GET con permiso registrar/ver asistencia, editar/publicar eventos o editar grupos, aplicando su alcance; POST actividad y su extensión |
| `/api/management/activities/:id` | PATCH reprogramación, cancelación o publicación; DELETE archivado |
| `/api/management/attendance/roster?activityId=...` | GET identificadores y nombres mínimos necesarios para tomar asistencia |
| `/api/management/attendance?activityId=...` | GET registros autorizados |
| `/api/management/attendance` | POST registro manual/QR/visitante; devuelve 409 ante duplicado |
| `/api/management/attendance/:id` | PATCH estado con permiso corregir; DELETE archivado con permiso eliminar |
| `/api/management/alerts` | GET alertas pastorales calculadas, con acceso restringido |
| `/api/management/dashboard` | GET widgets provisionales según permisos |
| `/api/management/reports/:type?format=pdf\|xlsx` | GET asistencia, cumpleanos o grupos; asistencia admite from/to |
| `/api/management/users/:id/member` | POST `{memberId: numero\|null}` para vincular cuenta existente |
| `/api/management/permissions` | GET catálogo y asignaciones RBAC |
| `/api/management/permissions/:roleId` | PUT `{grants:[{codigo,alcance}]}`; roles con acceso total y Usuario protegidos |

El alcance `grupo` filtra en SQL por `usuario.id_miembro = grupo_comunion.id_discipulador`. También valida recursos destino en mutaciones. Los códigos que admiten este alcance se informan mediante `admite_grupo` en el catálogo de permisos; Discipulador no puede recibir alcance global desde el editor.

La consulta de discípulos devuelve hasta 500 coincidencias; actividades administrativas, hasta 500, y eventos públicos, hasta 100. Los reportes exportan todos los registros autorizados que cumplan sus filtros. Para volúmenes superiores habrá que incorporar paginación y procesamiento de exportaciones, sin cambiar estas relaciones.

El consentimiento es un registro de evidencia: no envía comunicaciones ni aplica reglas legales de revocación/retención no confirmadas. El estado del discípulo y la vigencia de su cuenta siguen siendo conceptos distintos.

La iglesia confirmó una sola sede y una sola zona: se retiraron su módulo, selectores y creación por API. Los catálogos y referencias existentes se conservan como información compatible con el esquema anterior; el permiso `sedes.gestionar` ya no aparece en el editor.
