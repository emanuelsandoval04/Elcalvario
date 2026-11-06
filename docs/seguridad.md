# Seguridad de la plataforma

## Acceso con correo y contraseña

Por decisión de la administración, todas las cuentas entran con correo y contraseña. No se solicita autenticador, QR ni código adicional. Cambiar el correo o la contraseña exige confirmar la contraseña actual y cierra las otras sesiones.

Se retiraron las pantallas, rutas y dependencias de doble factor. Las cuentas que lo hubieran configurado también pueden entrar directamente con su contraseña. Las tablas históricas de la migración 015 permanecen para conservar compatibilidad con instalaciones existentes; no intervienen en el acceso ni se exponen por la API. No se necesita ninguna variable `MFA_*`.

## Sesiones y actividad

Las cookies de sesión son HttpOnly, Secure en producción y SameSite Strict. Los tokens aleatorios de 256 bits solo se almacenan como hashes. Es posible tener varias sesiones simultáneas. Cada cuenta puede consultar sus dispositivos/IP, cerrar otra sesión o cerrar todas las demás. No se muestran tokens ni hashes al navegador. Las sesiones vencen a los `SESSION_HOURS` configurados y tras 30 minutos sin consultas. Las comprobaciones automáticas de una pestaña visible mantienen la sesión activa.

La auditoría registra accesos fallidos y correctos, revocaciones, cambios de cuenta, solicitudes de cambios administrativos, lecturas de fichas/usuarios y descargas. Registra fecha, cuenta, acción/ruta sin query string, resultado HTTP, IP y navegador. No guarda cuerpos de formularios ni contenido de reportes. Los usuarios consultan sus eventos recientes; los administradores con autoridad pastoral y permiso de cuentas pueden consultar los 100 últimos eventos globales desde Seguridad y dispositivos.

## Límites y navegador

Los contadores se comparten en MySQL entre instancias de Vercel. El límite general es de 600 solicitudes por IP/minuto; el acceso tiene además 20 solicitudes por IP/ruta cada 15 minutos y 15 intentos por cuenta cada 15 minutos, incluso desde distintas IP. La revocación de sesiones admite 12 solicitudes por cuenta cada 15 minutos y las exportaciones 12 por cuenta cada 15 minutos. Una red compartida cuenta como una IP. Estos límites reducen abusos; no sustituyen la protección de red de Vercel ni una prueba de capacidad.

La CSP prohíbe scripts inline, atributos de script, objetos y enmarcar la plataforma. Limita scripts a la aplicación y los dominios necesarios de Google Maps; fuentes a Google Fonts y marcos a Facebook/Google. Permite estilos inline porque los usan React, GSAP y Maps. Permissions-Policy bloquea cámara, micrófono, ubicación, pagos y USB. HTTPS/HSTS, `nosniff`, `DENY`, validación de origen y no-cache en API completan esas defensas. Los cuerpos JSON comprimidos se rechazan, además de utilizar body-parser corregido.

## Cuenta de MySQL y mantenimiento

Vercel utiliza una cuenta exclusiva de aplicación con conexión TLS obligatoria y permisos por tabla. No tiene CREATE/DROP/ALTER/CREATE USER/GRANT. En `auditoria_seguridad` solo tiene SELECT/INSERT, y en `migracion_aplicada` solo SELECT. Las migraciones y los respaldos usan la cuenta administrativa fuera de la aplicación. Al añadir tablas, conceder explícitamente los permisos necesarios a la cuenta de aplicación antes de publicar el código correspondiente.

La migración aditiva `015-account-security.sql` crea cinco tablas sin cambiar fichas, libros ni contraseñas. Respaldar primero y aplicar con la cuenta administrativa. Las construcciones de Vercel no migran ni necesitan permisos de estructura.

Para retención y limpieza periódica, ejecutar con las credenciales administrativas y conservar antes los respaldos que correspondan:

```powershell
node --env-file=.env.aiven.local scripts/security-maintenance.mjs
```

El script elimina hasta 1000 filas vencidas por categoría y auditoría anterior a 90 días. `SECURITY_AUDIT_RETENTION_DAYS` permite ajustar esa retención entre 30 y 3650 días. La cuenta web no puede ejecutar la eliminación de auditoría. La tarea se ejecuta por administración; no está programada automáticamente en Vercel.

## Verificación

`npm run test:security` crea y elimina una base temporal local. Verifica el acceso con contraseña incluso con configuraciones antiguas de doble factor, las rutas retiradas, revocación, expiración, auditoría, permisos y límites. `npm run test:security:ui` añade navegador Edge y vista previa de producción con CSP, sin crear datos en Aiven. Requiere Playwright Core instalado en `.secrets/browser-tools` y MySQL local.

Ejecutar también `npm audit`, construcción y pruebas de los módulos afectados. Ningún resultado equivale a una garantía de invulnerabilidad. Los administradores deben usar contraseñas únicas y revisar la actividad.
