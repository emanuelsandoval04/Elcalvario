# Recuperación de contraseña por correo

Implementación preparada para Express en Vercel y MySQL en Aiven. Esta actualización permanece local: no se han publicado cambios, configurado secretos remotos ni aplicado migraciones en Aiven. Las pruebas automatizadas simulan el correo; las pruebas manuales de envío deben dirigirse únicamente al destinatario autorizado.

Los mensajes llevan los logos originales de El Calvario y Nexus integrados y el nombre **El Calvario - Nexus Soporte**. Comparten plantilla y transporte con [el correo de bienvenida al crear cuentas](correos-cuentas.md).

## Funcionamiento

1. En el login, **¿Olvidaste tu contraseña?** abre `/#recuperar`.
2. La persona escribe el correo asignado a su cuenta. La respuesta es la misma para cuentas existentes, inexistentes, bloqueadas e inactivas.
3. Para una cuenta activa o pendiente, se genera un token aleatorio de 256 bits y se guarda únicamente su SHA-256. La base fija el vencimiento a **15 minutos desde la solicitud**. Solo queda vigente el último enlace de la cuenta.
4. Gmail o Resend envía el enlace a `APP_PUBLIC_URL/#restablecer?token=...`. El fragmento no se envía como parte de la URL HTTP al servidor ni como referente. El token se transmite a la API únicamente en el cuerpo de un POST.
5. Abrir el enlace solo comprueba su validez; no lo consume. La persona elige una contraseña de 10 a 128 caracteres y la confirma.
6. Una transacción revalida la cuenta y el vencimiento, cambia el hash scrypt, consume el token y elimina todas las sesiones de la cuenta. Los roles, datos y estado permanecen iguales; una cuenta pendiente sigue pendiente. No se inicia sesión automáticamente.

Cambiar el correo o la contraseña por otro medio invalida los enlaces existentes mediante una huella de las credenciales. Bloquear, desactivar o eliminar la cuenta también impide utilizarlos. Los tokens no se incluyen en respuestas públicas, auditoría o logs de errores. Si falla el envío, el token no puede utilizarse. Solicitar un enlace no cambia la contraseña ni cierra sesiones.

El envío se registra con `waitUntil` de `@vercel/functions`, para continuar después de devolver la respuesta uniforme sin bloquearla por la consulta de la cuenta o la llamada de correo. La conexión MySQL se libera antes de contactar al proveedor de correo; funciona con el pool de dos conexiones de Vercel. No utiliza archivos locales para guardar los enlaces.

## Gmail para el proyecto universitario

No hace falta comprar un dominio. Gmail actúa como remitente y el dominio de Vercel sigue alojando la web y los enlaces. El envío usa Nodemailer con `smtp.gmail.com:465`, TLS con certificado verificado, tiempos de espera limitados y una conexión que se cierra tras cada mensaje. No se registran contraseñas ni respuestas SMTP completas.

Para terminar la configuración local:

1. Abrir la [seguridad de la cuenta Google](https://myaccount.google.com/security) del correo remitente y activar la verificación en dos pasos.
2. Abrir [Contraseñas de aplicación](https://myaccount.google.com/apppasswords) y crear una para «El Calvario». Google entrega una contraseña de 16 caracteres. No utilizar la contraseña habitual de Gmail.
3. Pegar la contraseña directamente en `GMAIL_APP_PASSWORD` del archivo privado `.env`, sin compartirla en el chat. El correo se guarda en `GMAIL_USER` y el proveedor en `MAIL_PROVIDER=gmail`. Se aceptan los espacios con los que Google muestra las cuatro agrupaciones de caracteres.
4. Reiniciar la API local para que lea la configuración. Por decisión del proyecto, los enlaces de correo apuntan siempre a la web desplegada: `APP_PUBLIC_URL=https://elcalvario.vercel.app`, incluso cuando el correo se solicita desde la API local.

```dotenv
MAIL_PROVIDER=gmail
GMAIL_USER=tu-cuenta@gmail.com
GMAIL_APP_PASSWORD=
APP_PUBLIC_URL=https://elcalvario.vercel.app
```

La configuración de una instalación nueva requiere guardar una contraseña de aplicación válida. Las pruebas automatizadas simulan el envío; una prueba real requiere un destinatario autorizado. Gmail permite probar este proyecto con pocos envíos; la entrega desde Vercel debe comprobarse cuando se autorice publicar, porque Google puede rechazar conexiones que considere inusuales.

El destino del enlace y la base de datos que lo genera son cosas distintas: un token creado en MySQL local no existe en Aiven. Para completar una recuperación en Vercel, la función desplegada debe incluir esta actualización y su base debe tener las migraciones y la configuración necesarias. Cambiar el destino de los enlaces no publica código ni transfiere cuentas o tokens de prueba. Mientras la actualización siga sin publicarse, los nuevos enlaces no pueden completar la recuperación en la web anterior.

Referencias: [contraseñas de aplicación de Google](https://support.google.com/accounts/answer/185833?hl=es), [Gmail con Nodemailer](https://nodemailer.com/guides/using-gmail), [SMTP en Vercel](https://vercel.com/kb/guide/serverless-functions-and-smtp). Se usa el puerto 465; no se necesita el puerto 25.

## Cambiar de proveedor más adelante

`MAIL_PROVIDER` selecciona `gmail` o `resend`. Las plantillas, rutas de la API, cuentas y enlaces de 15 minutos son comunes a ambos. Para pasar a Resend basta con verificar un dominio propio, completar `RESEND_API_KEY` y `RESEND_FROM_EMAIL`, y seleccionar `MAIL_PROVIDER=resend`. Cambiar las variables locales requiere reiniciar la API; cambiarlas en Vercel requiere un nuevo despliegue autorizado. No hace falta migrar usuarios ni cambiar sus contraseñas. Si no se define proveedor, se conserva Resend por compatibilidad.

## Preparación de Resend

Cuando se vaya a activar el envío:

1. Crear la cuenta de Resend y verificar un dominio de correo propio mediante los registros DNS indicados por el proveedor. El dominio `vercel.app` sirve para alojar la web; el remitente necesita un dominio de correo que puedas verificar.
2. Crear una API key con permiso de envío, limitada al dominio cuando corresponda.
3. Elegir un remitente como `acceso@tudominio.com`. Para estos mensajes de acceso, desactivar el seguimiento de enlaces y aperturas en el dominio de envío.

No compartir la API key en el chat, incorporarla al código ni usar el prefijo `VITE_`.

Documentación oficial: [dominios verificados de Resend](https://resend.com/docs/dashboard/domains/introduction), [API de envío](https://resend.com/docs/api-reference/emails/send-email), [waitUntil de Vercel](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#waituntil). El diseño sigue las recomendaciones de [recuperación de contraseña de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

## Configuración pendiente para producción

Estos pasos se ejecutan al publicar una actualización autorizada. Enviar cambios a `main` puede disparar el despliegue automático del proyecto; preparar antes el respaldo, las migraciones y las variables privadas.

Variables privadas para el entorno Production de Vercel, cuando se autorice publicar:

| Variable | Valor |
| --- | --- |
| `APP_PUBLIC_URL` | `https://elcalvario.vercel.app`, o el dominio definitivo; sin barra final, ruta, parámetros ni fragmento. |
| `MAIL_PROVIDER` | `gmail` para el proyecto actual; `resend` como alternativa futura. |
| `GMAIL_USER` | Dirección Gmail del remitente. Solo para `gmail`. |
| `GMAIL_APP_PASSWORD` | Contraseña de aplicación privada de Google, de 16 caracteres. Solo para `gmail`. |
| `RESEND_API_KEY` | API key privada de Resend con permiso de envío. Solo para `resend`. |
| `RESEND_FROM_EMAIL` | Dirección del dominio verificado, sin nombre ni corchetes. Solo para `resend`. |

El origen configurado debe estar admitido por `APP_ORIGINS` o ser uno de los dominios del proyecto que Vercel ya autoriza. Nunca se construye el enlace a partir de Host, Origin ni datos recibidos del navegador. Las previews deben utilizar su propia base y configuración de correo de pruebas.

Antes de desplegar el código:

1. Respaldar la base de Aiven y aplicar las migraciones con la cuenta administrativa. `018-password-recovery.sql` es aditiva y repetible: crea `recuperacion_contrasena` con eliminación en cascada al borrar la cuenta. No cambia contraseñas ni datos existentes.
2. Si Vercel utiliza permisos por tabla, conceder `SELECT`, `INSERT`, `UPDATE` y `DELETE` sobre esta tabla a su cuenta de aplicación. No necesita permisos de estructura ni cambios a la configuración TLS de Aiven. Ejemplo, adaptando los nombres a la instalación:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON defaultdb.recuperacion_contrasena TO 'calvario_app'@'%';
```

3. Configurar `APP_PUBLIC_URL`, `MAIL_PROVIDER` y las credenciales del proveedor elegido, y publicar cuando se autorice. La compilación no aplica migraciones ni envía correos.
4. Probar la entrega real en un buzón controlado y confirmar el dominio del enlace, la carpeta de spam, el vencimiento, la reutilización rechazada y el acceso con la contraseña nueva. Las pruebas locales simulan Gmail y Resend y no verifican la entrega real.

Sin configuración de correo, la solicitud responde 503 con un mensaje para contactar a la administración; el login habitual sigue funcionando. Un rechazo del proveedor se registra solo mediante un código seguro (`RESEND_HTTP_...`, `GMAIL_AUTH_FAILED` o `GMAIL_SEND_ERROR`); la respuesta pública permanece uniforme. El mantenimiento de seguridad elimina enlaces vencidos en lotes de hasta 1000 filas.

## API y límites

Todas las rutas usan JSON, validan el origen y responden con `Cache-Control: no-store`.

| Ruta POST | Cuerpo | Resultado |
| --- | --- | --- |
| `/api/auth/forgot-password` | `{email}` | 200 `{ok:true,message}` uniforme; no devuelve token ni crea sesión. 400 si el correo tiene formato inválido; 503 si falta configuración. |
| `/api/auth/reset-password/validate` | `{token}` | 200 `{ok:true}` si está vigente; 400 si no es válido, venció, fue reemplazado o las credenciales cambiaron. No consume el enlace. |
| `/api/auth/reset-password` | `{token,newPassword,confirmation}` | 200 `{ok:true}`; actualiza contraseña, consume el enlace y revoca sesiones en una transacción. 400 para enlace o datos inválidos. |

Solicitudes de correo: máximo 10 por IP y 3 por dirección cada 15 minutos. Validación y cambio: 30 por IP y ruta cada 15 minutos. También aplica el límite general de la API. Los contadores persisten en MySQL entre instancias y reinicios de Vercel. Un límite excedido devuelve 429 con `Retry-After`.

## Pruebas locales

```sh
npm run test:recovery
npm run test:recovery:ui
```

Crean y eliminan una base temporal en MySQL local, rechazan hosts remotos y simulan Gmail y Resend sin enviar correos. Cubren configuración HTTPS, autenticación SMTP con TLS, cierre del transporte, contenido del correo, respuesta uniforme, vencimiento de 900 segundos, token almacenado como hash, consumo concurrente único, reemplazo, cambios de credenciales, conservación de roles/estado, revocación de sesiones, rollback, fallo de envío, límites y vistas de 1440/390/320 px. No usan cuentas reales ni secretos de producción.
