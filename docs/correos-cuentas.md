# Correos de recuperación y bienvenida

La publicación utiliza las variables privadas de Vercel y la base de Aiven. Las pruebas automatizadas usan MySQL local temporal y transportes simulados, sin enviar correos reales.

## Identidad del correo

Los correos usan el nombre de remitente **El Calvario - Nexus Soporte** y los logos originales de El Calvario y Nexus Corporation. Se conservan en `server/mail-assets/` y se incluyen dentro de cada mensaje como imágenes PNG referenciadas por Content-ID. Así no necesitan descargar imágenes desde localhost o desde la web publicada. Gmail recibe los archivos como buffers; Resend recibe el mismo contenido codificado en base64. Las plantillas incluyen texto alternativo y versión de texto plano.

Los archivos están incluidos expresamente en la función de Vercel mediante `includeFiles`; también entran en el contenedor opcional porque pertenecen a `server/`. No se necesita ningún cambio en la base de datos para los logos o el correo de bienvenida.

Referencias: [imágenes integradas en Nodemailer](https://nodemailer.com/message/embedded-images) e [imágenes integradas en Resend](https://resend.com/docs/dashboard/emails/embed-inline-images).

## Al crear una cuenta

Se envía un correo de bienvenida al correo de acceso asignado desde:

- **Usuarios y roles → Crear cuenta**, mediante `POST /api/auth/admin/users`.
- **Discípulos → Administrativo con cuenta de acceso**, mediante `POST /api/management/members` con `tipo_registro=administrativo`.

Registrar una ficha de discípulo sin cuenta no envía credenciales. Un cambio de rol o la habilitación de una cuenta anterior tampoco reenvía su contraseña.

El correo contiene:

- Nombre, correo de acceso, contraseña inicial asignada y rol de sistema.
- Estado de la cuenta, quién la creó y fecha de vinculación en hora de Colombia.
- Ficha vinculada y, si corresponden, cargo pastoral, función o servicio, Grupo de Comunión, cobertura pastoral, libro de adiestramiento, ministerios y grupos a cargo.
- Botón para iniciar sesión en `https://elcalvario.vercel.app/#login`, usando el origen de producción definido por `APP_PUBLIC_URL`. Los correos no redirigen a localhost.
- Funciones permitidas por los permisos efectivos de la cuenta. Indica el alcance de grupo cuando corresponde y respeta las restricciones de autoridad pastoral, administración de cuentas y adiestramiento.
- Indicación de cambiar la contraseña después del primer acceso. No se afirma que esta contraseña caduque ni se obliga a cambiarla automáticamente.

La contraseña inicial se utiliza en memoria para ese único envío, después de confirmar la transacción. No se guarda en texto plano, auditorías ni logs y no se devuelve en el JSON de creación. La base conserva el hash scrypt existente. El mensaje enviado al buzón sí contiene la contraseña inicial solicitada; los enlaces no la incluyen.

## Confirmación y fallos de envío

La ficha, cuenta, rol y demás relaciones se guardan primero. La conexión MySQL se libera antes de contactar al proveedor de correo. Una transacción fallida no envía el mensaje.

La respuesta de creación mantiene HTTP 201 e incorpora `emailDelivery`:

| Valor | Significado |
| --- | --- |
| `sent` | El proveedor aceptó el mensaje. No constituye confirmación de llegada a la bandeja de entrada. |
| `failed` | No se pudo completar el envío; la cuenta permanece creada y activa. |
| `not_configured` | Faltan datos de configuración del correo; la cuenta permanece creada y activa. |

El panel informa del resultado junto a la confirmación de creación. Ante un fallo, verificar el destinatario y orientar a la persona para que recupere su acceso cuando el envío esté disponible. No se guarda una copia de la contraseña para reintentar el envío posteriormente ni se revierte una cuenta ya creada por un fallo del proveedor.

El cliente permite hasta 45 segundos en estas dos operaciones para recibir el resultado sin repetir la creación por un timeout corto. Las demás operaciones mantienen sus límites. El envío tiene los mismos tiempos de espera, TLS, credenciales privadas y selección Gmail/Resend descritos en [la guía de recuperación](recuperacion-contrasena.md).

## Pruebas y vistas previas

```sh
npm run test:welcome
npm run test:recovery
npm run preview:emails
```

`test:welcome` comprueba ambas formas de crear cuentas en una base temporal local, credenciales, rol, alcance, relaciones, fallo de envío, falta de configuración y rollback. Las pruebas de MIME verifican los dos logos originales como partes PNG integradas y la adaptación a Resend. No usan destinatarios reales ni credenciales de producción.

`preview:emails` genera `checks/mail-preview-welcome.html` y `checks/mail-preview-recovery.html` con datos ficticios y los logos incorporados. `node checks/mail-preview.mjs --screenshots` comprueba ambos diseños en Edge a 1440/390/320 px, con imágenes cargadas y sin desbordamiento horizontal. Estas vistas previas no se publican ni envían correos.
