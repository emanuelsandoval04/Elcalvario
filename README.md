# Plataforma Iglesia

Plataforma con React, TypeScript, Vite, Express y MySQL. Usa Node.js 24.x.

Producción: [elcalvario.vercel.app](https://elcalvario.vercel.app). La rama `main` de [GitHub](https://github.com/emanuelsandoval04/Elcalvario) despliega automáticamente en Vercel; la API se conecta a MySQL en Aiven por TLS.

## Despliegue

La sección [Adiestramiento](docs/adiestramiento.md) integra el catálogo de libros, su asignación en fichas nuevas y existentes, el libro actual en el perfil y la exportación completa a Excel según permisos.

Consulta [la guía de Aiven + Vercel](docs/despliegue.md). React y la API se alojan juntos en Vercel; MySQL se conecta a Aiven por TLS. La plantilla `.env.vercel.example` contiene las variables del proyecto y `.env.aiven.local` se usa para comprobar la conexión y ejecutar migraciones desde tu equipo. Las credenciales son privadas del servidor.

## Desarrollo

```sh
npm install
npm run dev
```

`npm run dev` inicia la API y la web en una sola terminal. Comprueba primero la conexión de la API con MySQL; MySQL debe estar encendido y `.env` configurado. Si ya hay una API disponible, la reutiliza. Ctrl+C detiene los procesos iniciados por el comando.

Abre la dirección indicada en la terminal (normalmente http://127.0.0.1:5173).

## Verificación y producción

```sh
npm run typecheck
npm run build
npm run preview
```

La compilación se genera en `dist/`.

## Estructura

- `src/App.tsx`: componente principal.
- `src/main.tsx`: punto de entrada.
- `src/styles.css`: estilos globales.
- `public/`: archivos estáticos disponibles por su nombre desde la raíz del sitio.

Las fotografías existentes se conservan en la carpeta original.

## API y MySQL local

La API usa Node.js, Express y mysql2. Las credenciales están en `.env`, excluido del repositorio. Usa `.env.example` como referencia en otro equipo. Nunca agregues credenciales a variables `VITE_` ni a archivos de `src/` o `public/`.

Configuración local: MySQL en `localhost:3306`, base `el_calvario` y API en `127.0.0.1:3001`. La cuenta `root` se usa únicamente para este entorno local.

```sh
npm run db:init
npm run db:check
npm run dev
```

`db:init` crea la base si no existe; no crea tablas ni modifica datos existentes. Para ejecutar los servicios por separado, usa `npm run dev:api` y, en otra terminal, `npm run dev:web`. Vite reenvía `/api` al backend en el puerto 3001. La URL `http://127.0.0.1:5173/api/health` comprueba la conexión de extremo a extremo.

La configuración de despliegue deberá usar una cuenta propia de la aplicación, HTTPS, `NODE_ENV=production`, `APP_ORIGINS` con el origen autorizado y un proxy de `/api`. El backend local escucha únicamente en `127.0.0.1`.

En desarrollo, si Vite usa otro puerto porque el 5173 está ocupado, se acepta su origen HTTP local cuando coincide exactamente con el encabezado Host reenviado por el proxy. Esto solo aplica a `localhost`, `127.0.0.1` y `::1`; en producción se utiliza la lista explícita de `APP_ORIGINS`.

## Registro e inicio de sesión

```sh
npm run db:migrate
```

Las migraciones 001–003 conservan autenticación, roles y solicitudes. `004-church-management.sql` añade la gestión confirmada de iglesia y la FK del `usuario.id_miembro` existente. `005-pending-users.sql` añade el estado `pendiente` y lo establece como valor predeterminado, conservando las cuentas y estados anteriores. `006-account-profile.sql` guarda el nombre de la cuenta en `perfil_usuario`, sin cambiar la ficha del discípulo. El vínculo continúa siendo opcional: crear una cuenta no crea un discípulo. Los estados de usuario son `pendiente`, `activo`, `inactivo` y `bloqueado`.

- `/#login`: inicia sesión con las credenciales asignadas por la administración o el equipo pastoral y abre `/#gestion`. La antigua dirección `/#registro` redirige al login; no existe registro público.
- En `/#usuarios`, **Crear cuenta** permite a Administrador, Superadmin y los cinco cargos pastorales autorizados con `usuarios.gestionar` asignar nombre, correo, contraseña (10 a 128 caracteres), rol, foto opcional y ficha de discípulo opcional. La cuenta se crea activa, sin sustituir la sesión del creador. Los demás datos personales se completan en la ficha de Discípulos.
- Al crear una cuenta se envía un correo con ambos logos, nombre, correo, contraseña inicial, rol, datos de vinculación y funciones autorizadas. Se aplica también al registro administrativo con ficha. El panel informa si el proveedor aceptó el envío, falló o falta configuración; el fallo de correo no elimina la cuenta. Ver [correos de cuentas y vistas previas](docs/correos-cuentas.md).
- Las cuentas pendientes anteriores se conservan: pueden iniciar sesión para consultar su habilitación; gestión y asignación de roles permanecen bloqueadas hasta su activación. Crear una cuenta no registra automáticamente a una persona como discípulo de la iglesia.
- Una cuenta autorizada con `usuarios.gestionar` y uno de los cinco cargos pastorales, Administrador o Superadmin selecciona el rol y pulsa **Habilitar cuenta** en `/#usuarios`. Superadmin conserva la administración técnica de la instalación. La asignación y el paso de pendiente a activo se guardan en una transacción. Asignar un rol no desbloquea cuentas inactivas o bloqueadas. El rol Usuario habilita una cuenta básica sin funciones de gestión.
- Las contraseñas se guardan con scrypt y sal aleatoria. La sesión dura ocho horas; MySQL guarda solo el hash del token y el navegador recibe una cookie HttpOnly, SameSite=Strict.
- **¿Olvidaste tu contraseña?** abre la recuperación por correo. El enlace vence en 15 minutos, solo puede usarse una vez y al cambiar la contraseña se revocan todas las sesiones. Para el proyecto universitario, `MAIL_PROVIDER=gmail`, `GMAIL_USER` y `GMAIL_APP_PASSWORD` permiten enviar sin dominio propio; `APP_PUBLIC_URL` fija la dirección de los enlaces. Resend queda disponible para un cambio futuro mediante configuración. Requiere la migración 018. La preparación local no activa envíos ni modifica el despliegue; consulta [la guía de recuperación](docs/recuperacion-contrasena.md).
- Los endpoints son `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` y `POST /api/auth/admin/users` (creación autorizada). `POST /api/auth/register` siempre devuelve 403 y no crea cuentas, incluso en una instalación vacía.
- Login tiene límites por IP y correo; la creación autorizada limita los intentos por administrador. Los límites se comparten en MySQL y las operaciones usan consultas parametrizadas. La migración 013 conserva los límites entre instancias de Vercel.

`npm run test:account-creation` verifica registro público cerrado, inicialización local, permisos, validaciones, credenciales y transacciones. `npm run test:account-creation:ui` añade el formulario real y su presentación a 1440/390/320 px. Las pruebas usan una base temporal local.

## Superadmin y entrega

La campana muestra solicitudes de cuentas a los administradores y los cinco cargos pastorales con `usuarios.gestionar`. Todos los perfiles con sesión reciben avisos de eventos y cultos publicados, con sus cancelaciones y cambios de horario. Cada aviso puede descartarse deslizando hacia ambos lados o con el botón de cierre; el descarte pertenece a la cuenta, persiste al recargar y no rechaza solicitudes ni elimina eventos. `017-notification-dismissals.sql` guarda estos descartes. Ejecutar `npm run db:migrate`; `npm run test:notifications:ui` verifica API, teclado, ratón y gestos táctiles a 390/320 px en una base temporal local.

En Eventos, “Quiero participar” abre un formulario de nombre, teléfono, ministerio y mensaje opcional. `POST /api/participation` valida y guarda las solicitudes en `solicitud_participacion`; `db:migrate` incluye la migración `003-participation.sql`. No envía correos ni mensajes externos.

El propietario inicial se crea exclusivamente desde el servidor con `npm run account:bootstrap`, después de las migraciones. Define `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` e `INITIAL_ADMIN_NAME` en el entorno del proceso. No envíes estas variables al cliente ni las guardes en archivos versionados. El comando solo funciona en una instalación vacía con `bootstrap_completado=0`; usa un bloqueo transaccional y nunca imprime la contraseña. Las instalaciones existentes conservan su propietario y no necesitan este comando.

La marca `bootstrap_completado` es permanente: eliminar usuarios no vuelve a habilitar el registro inicial de Superadmin. Si la migración se ejecuta por primera vez sobre usuarios anteriores, asigna Superadmin al primer usuario existente. Volver a ejecutar la migración conserva las asignaciones posteriores.

Desde una cuenta autorizada con `usuarios.gestionar`, `/#usuarios` permite crear cuentas activas, habilitar pendientes anteriores, asignar un rol principal y vincular cada cuenta a su ficha de discípulo. Las pendientes aparecen primero y requieren elegir un rol expresamente. El catálogo proviene de `rol_sistema`. El propio rol no puede modificarse desde el panel. El servidor consulta estado, roles y permisos actuales en cada solicitud, así que una sesión existente pierde el acceso al revocarse el permiso.

Para entregar la plataforma con un propietario nuevo, utiliza una base nueva y ejecuta `db:init` y `db:migrate`; no copies los usuarios ni la configuración inicial de la base de desarrollo. Crea el Superadmin del cliente desde el servidor con `npm run account:bootstrap`. No borres ni reinicies la marca en una instalación que ya esté funcionando.

`npm run test:account-creation:ui` verifica la inicialización exclusiva del propietario, los roles autorizados y el formulario en una base temporal aislada que elimina al finalizar.

## Gestión confirmada de la iglesia

En **Eventos y Cultos** puede activarse **Repetir cada semana**, elegir un día y una fecha final opcional. Por ejemplo, un culto todos los domingos a las 09:00. Cada fecha conserva su propia asistencia; la agenda pública muestra el próximo encuentro. Se puede editar una sesión, actualizar las próximas o detener la repetición sin borrar el historial. Requiere la migración 019; ver [eventos recurrentes](docs/eventos-recurrentes.md). La actualización permanece local.

Lee primero [la auditoría y las decisiones de adaptación](docs/actualizacion-confirmada.md). Se auditó la base real de seis tablas y el propietario confirmó crear las tablas de dominio que aún no existían. Se conserva el proyecto React/Express y todos los datos previos.

Con un respaldo disponible, ejecuta `npm run db:migrate`. La migración 004 es separada, aditiva y repetible: no elimina datos, columnas ni tablas. El ejecutor verifica las columnas y tipos existentes antes de escribir y se detiene ante un esquema incompatible. No reinicia bootstrap ni sobrescribe las personalizaciones de permisos al ejecutarse otra vez.

Después de iniciar sesión, el panel `/#gestion` se abre automáticamente. Las cuentas pendientes ven **Tu cuenta está pendiente por activación.** dentro del panel, con opciones para consultar su activación o cerrar sesión. No se muestran módulos operativos hasta que se habilite su cuenta con un rol autorizado:

- Discípulos: identificación, celular y nacimiento obligatorios; salud, emergencia, rol eclesiástico, QR, estado y auditoría. El nacimiento también sirve para cumpleaños.
- Grupos: datos reales, discipulador, origen y ubicación. Los cambios de grupo y cobertura del discípulo quedan en historial. El dato institucional de cinco grupos no crea registros ficticios.
- Apertura de iglesia: desde la ficha del grupo se registra el propósito del proceso. No hay multiplicación automática por cupo.
- Actividades: culto, evento especial y reunión de grupo reutilizan `actividad` y sus extensiones. Se admite reprogramación, cancelación, imagen por URL/archivo existente e inscripción por enlace HTTPS.
- Asistencia: manual, identificador QR preparado y visitantes sin ficha inventada. Registrar un duplicado no corrige el registro existente. La corrección tiene un permiso separado.
- Alertas: dos ausencias consecutivas registradas, en orden de realización de actividades. Corregir, cancelar o archivar recalcula su vigencia. No se presume ausencia por falta de registro ni se exige cierre/seguimiento.
- Reportes: asistencia, cumpleaños y grupos en PDF y Excel real (`.xlsx`). El reporte de asistencia permite fechas desde/hasta. Los permisos y grupos se aplican también en las exportaciones.
- Consentimiento: evidencia en papel/digital con versión, autorizaciones, fechas y estado. Cada registro se conserva. No aplica automáticamente consecuencias de revocación ni retención sin confirmación.
- Ministerios: relación de varios ministerios por discípulo. Se inicializan únicamente los tres nombres confirmados, sin responsables, horarios ni descripciones inventadas.
- Dashboard con accesos a Discípulos, Fallas, Eventos y Reportes, y editor de permisos RBAC.

La plataforma opera con una sola sede y una sola zona. No hay módulo ni selectores para administrarlas, ni endpoints para crear otras. Las tablas y referencias previas se conservan por compatibilidad, sin borrar datos.

La gestión utiliza acentos naranjas, tarjetas blancas e iconos de colores. En celulares tiene navegación inferior fija (Inicio, Discípulos, Asistencia, Eventos y Más), con espacio para las áreas seguras del dispositivo. Más abre un panel con control de foco y cierre con Escape. En escritorio se conserva la navegación lateral adaptable. La barra del sitio público no se monta en gestión ni usuarios. GSAP anima entradas y pulsaciones; `prefers-reduced-motion` desactiva esos movimientos.

El mismo menú de módulos se usa en gestión y usuarios: cada opción y sus botones dependen de los permisos actuales del rol. Los enlaces `/#gestion/members`, `/#gestion/activities`, etc. vuelven al módulo correspondiente y respetan los permisos aunque se escriban manualmente. La sesión se actualiza al regresar a la pestaña y cada 15 segundos mientras está visible; una cuenta pendiente también puede pulsar **Consultar activación** dentro del panel. Los cambios de rol actualizan el menú sin cerrar sesión y vuelven a cargar los datos de su nuevo alcance. En móvil, el menú se cierra después de ejecutar la opción seleccionada y admite controles táctiles de 44 px, desplazamiento y cambios de orientación.

El perfil del encabezado abre un menú con **Actualizar nombre y correo**, **Cambiar contraseña** y **Cerrar sesión**. Las ediciones se realizan dentro del panel, en un diálogo con control de foco, teclado y cierre con Escape. También están disponibles para cuentas pendientes, conservando su estado y permisos. Cambiar el correo requiere la contraseña actual; cambiar la contraseña requiere la actual y una nueva de 10 a 128 caracteres. Ambos cambios renuevan la sesión actual y revocan las otras sesiones de esa cuenta. La actualización del nombre conserva los formularios sin guardar de gestión.

**Actualizar foto de perfil** permite elegir, reemplazar o quitar la foto y guardarla en la cuenta. También es opcional al registrarse y en el último paso del registro administrativo. Admite JPG, PNG y WebP de hasta 10 MB; el navegador centra y prepara una imagen JPEG de 512 × 512 sin conservar los metadatos originales. El avatar del encabezado se actualiza al guardar y conserva la inicial cuando no hay foto. `008-profile-photo.sql` añade la tabla independiente `foto_perfil_usuario`, sin cambiar cuentas, cargos ni fichas. Las fotos se sirven únicamente a la sesión de su propietario mediante `GET /api/auth/account/photo`, sin caché; `POST /api/auth/account/photo` actualiza o elimina exclusivamente la foto propia. La API valida formato, dimensiones y límite de 256 KB para la imagen preparada. `npm run test:account` comprueba estos flujos, la privacidad, la persistencia y las vistas de celular; `npm run test:pastoral` verifica además la foto de una cuenta administrativa nueva.

**Mi cuenta → Tamaño de la interfaz** permite elegir Normal (predeterminado), Grande (+15 %) o Muy grande (+30 %) y pulsar **Guardar tamaño**. Se amplían textos, controles, iconos y espacios, con redistribución del contenido en pantallas pequeñas. La elección pertenece a la cuenta y se recupera al iniciar sesión o recargar, también en la página pública; cerrar sesión vuelve a Normal. `009-display-preference.sql` agrega `preferencia_usuario` sin modificar los datos existentes. `POST /api/auth/account/preferences` admite únicamente `displaySize: normal | large | extra-large` y modifica exclusivamente la cuenta de la sesión, incluidas cuentas pendientes. `npm run test:display` comprueba persistencia, permisos y tamaños a 320/390/768/1440 px. Para mantener la escala, el plugin local `scripts/interface-units.mjs` convierte las longitudes CSS de contenido a `rem` en desarrollo y compilación; conserva los puntos de corte y el ancho mínimo de la ventana en píxeles.

Los cuatro primeros cargos pastorales tienen el catálogo operativo completo. Asistencia Pastoral conserva sus funciones de consulta básica, estado, grupos, asistencia, estadísticas y alertas, y puede registrar administrativos, gestionar cuentas y asignar ministerios. Discipulador registra discípulos normales y opera sobre sus grupos. Multimedia conserva sus funciones y puede registrar discípulos normales sin obtener consulta ni edición de fichas personales. Salud y emergencia siguen separados por `miembros.sensibles`. Los roles anteriores Pastor y Administrador conservan sus permisos operativos. Administrador puede gestionar cuentas con `usuarios.gestionar`; el registro administrativo y la asignación de cargos y servicios continúan requiriendo autoridad pastoral. Superadmin conserva la configuración técnica.

## Registro según el cargo pastoral

La jerarquía es: Apóstol General (1), Asistencia Apostólica (2), Pastor de Distrito (3), Pastor Local (4), Asistencia Pastoral (5) y Discipuladores (6). Cualquiera de los cinco primeros cargos puede elegir **Discípulo normal** o **Administrativo con cuenta de acceso** en Registrar discípulo, siempre que conserve los permisos operativos de registro y gestión de cuentas. Puede seleccionar cualquiera de los seis cargos para la cuenta nueva. La cuenta Superadmin sin cargo pastoral se conserva como propietario técnico para configurar la instalación.

El administrativo requiere cargo, correo de acceso, contraseña de 10 a 128 caracteres y confirmación. La ficha, la cuenta activa, el perfil y el rol se guardan en una sola transacción; los errores revierten toda la operación. La sesión del creador se conserva. Los cargos pastorales tienen roles de acceso correspondientes; Discipuladores utiliza el rol Discipulador.

Los demás registradores crean fichas normales con un Grupo de Comunión Familiar obligatorio. Discipulador solo puede seleccionar los grupos a su cargo. No se crea una cuenta para el discípulo normal y no se permite asignarle un cargo. El permiso nuevo `miembros.registrar` permite dar altas sin conceder edición o consulta de fichas. Los cargos y funciones, la cobertura pastoral, la pertenencia a ministerios y la designación de responsables de grupo requieren autoridad pastoral y el permiso de la operación. Sector se refiere al Grupo de Comunión Familiar; no se crea otra entidad territorial.

En el registro autorizado se puede seleccionar un ministerio y, para un administrativo, designarlo responsable del grupo elegido. Las pertenencias a varios ministerios se siguen gestionando desde la ficha. Los cargos de cuentas existentes se administran en Usuarios y roles y se sincronizan con su ficha vinculada. El rol propio y la cuenta del propietario técnico permanecen protegidos.

`007-pastoral-registration.sql` añade los cuatro roles de acceso que faltaban y los permisos de registro necesarios. Conserva cuentas, fichas, cargos y asignaciones existentes; al repetirse no restablece permisos personalizados. `npm run test:pastoral` comprueba los cinco cargos, la cuenta vinculada, el acceso del nuevo administrativo, la restricción del discipulador, intentos directos contra la API, la reversión transaccional y el formulario a 390/320 px con una base temporal aislada.

La eliminación disponible en los módulos archiva lógicamente el registro, conservando claves e historial. El estado activo/inactivo/retirado del discípulo se administra de forma independiente.

Consulta [los endpoints y límites pendientes](docs/api-gestion.md).

## Accesos del dashboard de administración

El inicio muestra seis accesos: **Discípulos**, **Grupos de Comunión**, **Asistencia**, **Eventos y Cultos**, **Alertas** y **Reportes**. Los accesos no autorizados quedan deshabilitados. El resumen consulta cifras reales y aplica los permisos y grupos a cargo: discípulos, grupos, alertas vigentes, cumpleaños en los próximos siete días y próximos encuentros. En escritorio se comprime la barra lateral en el inicio; al entrar en un módulo se expande.

Discípulos permite buscar por nombre completo o identificación en la API, filtrar por estado y abrir fichas. El registro y la edición se dividen en tres pasos que conservan los valores al retroceder. Salud y emergencia solo aparecen con el permiso correspondiente. La lista usa iniciales porque no hay fotografías de discípulos registradas.

Asistencia permite seleccionar los estados de varios discípulos y guardar las selecciones; cada registro conserva las validaciones y la protección contra duplicados de la API. Si una operación falla, sus selecciones pendientes se conservan y se informa el resultado. Visitantes, identificador QR y correcciones mantienen sus funciones y permisos propios. Reportes presenta tarjetas para descargar PDF y Excel.

**Asistencia y alertas** conserva las rutas `/#gestion/falls/registro` y `/#gestion/falls/alertas`; `/#gestion/attendance` y `/#gestion/alerts` siguen funcionando. Las alertas muestran las ausencias vigentes; no se añade un estado de “revisada” que el sistema no guarda.

## Aplicación instalable (PWA)

`public/manifest.webmanifest` define El Calvario como aplicación independiente y abre `/#gestion`. Incluye iconos PNG de 192 y 512 px, icono para iPhone, acceso de instalación en Más y atajos a los módulos principales. El navegador decide si ofrece instalación; Safari utiliza Compartir → Agregar a pantalla de inicio.

La instalación en un celular requiere una dirección HTTPS con acceso a la web y a la API. El entorno local permite comprobarla en el mismo equipo. No se ha publicado en un dominio nuevo.

El servicio de la PWA se genera con `npm run build` y solo se registra en producción. Guarda los archivos de interfaz y una pantalla de reconexión. Las solicitudes de `/api/`, las sesiones, los registros y las exportaciones nunca se almacenan en la caché del servicio. Para consultar o guardar datos se necesita conexión; no hay sincronización de escrituras sin conexión.

Para comprobar la versión compilada, ejecuta `npm run build`, inicia `npm run preview -- --port 4175` y ejecuta `npm run test:pwa` en otra terminal. La prueba comprueba los criterios de instalación en Edge, el manifiesto, los iconos, la exclusión de la API y la pantalla sin conexión con su reintento. Usa un perfil temporal aislado; no instala la aplicación en el perfil del usuario.

## Facebook automático

El servidor consulta `/{page-id}/live_videos`, prioriza un directo y, si no existe, toma el video disponible más reciente. La respuesta se cachea un minuto y la web se actualiza cada minuto. El token se utiliza solo en el servidor. No se publica contenido en Facebook.

Configura en `.env` los valores de `.env.example`: `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN` y `FACEBOOK_GRAPH_VERSION` (versión habilitada para la aplicación Meta). La página debe autorizar la lectura correspondiente. Sin esa configuración, o si Meta falla, se conserva el video/enlace alternativo y no se anuncia falsamente un directo. La conexión real a Meta está pendiente de esas credenciales; se verificó el conector mediante respuestas simuladas de directo, caché y error.

## Verificación de esta actualización

```sh
npm run test:unit
npm run test:church
npm run typecheck
npm run build
```

Las comprobaciones de dominio crean y eliminan una base temporal cuyo nombre incluye un UUID. No crean discípulos ni cuentas en la base local. Requieren una cuenta MySQL con permiso para crear esa base temporal.

Con Vite activo y Edge/Playwright del entorno de comprobación local, `npm run test:church:ui` y `node checks/superadmin-check.mjs` prueban formularios, permisos y vistas a 1440, 390 y 320 px. `UI_ORIGIN` permite indicar la dirección de Vite; por defecto usan `http://127.0.0.1:5173`. Las capturas se guardan en `checks/church-*.png`.

`npm run test:account` comprueba el perfil propio, validaciones, conflictos de correo, renovación/revocación de sesiones, conservación del estado pendiente y datos, menús de cuenta, formularios, foco y vistas de 1440/390/320 px. Usa otra base temporal aislada y guarda capturas en `checks/account-*.png`.

Se añadió un override de `uuid` para la dependencia transitiva de ExcelJS; mantiene su API CommonJS y evita la vulnerabilidad informada en la versión anterior.

## Mapa de cobertura pastoral

El m?dulo `/#gestion/mapa` integra Google Maps, Lista, b?squeda, fichas inferiores y asignaciones de barrios con historial. Usa la migraci?n aditiva 010 y los permisos de grupos existentes. Consulta [configuraci?n, permisos y pruebas](docs/mapa.md) y [fuentes cartogr?ficas e importaci?n](database/geodata/README.md). Los contornos son referencias pendientes de validaci?n documental.
