# Seguridad de la plataforma

## Acceso y doble factor

El doble factor TOTP es obligatorio para Superadmin, Administrador y cuentas activas con `usuarios.gestionar` o `permisos.gestionar`. Los demás usuarios pueden activarlo en **Mi cuenta → Seguridad y dispositivos**. Un administrador sin configurar MFA puede entrar a su cuenta y vincular el autenticador, pero la API bloquea las herramientas de gestión hasta terminar la configuración y confirmar que guardó los códigos de recuperación.

La configuración solicita la contraseña actual, genera un QR y una clave manual, y vence en 10 minutos. Se activa únicamente al validar el código del autenticador. Se entregan ocho códigos de recuperación que se muestran una sola vez; cada código solo puede utilizarse una vez. Renovarlos invalida los anteriores. La activación cierra las sesiones anteriores.

Con MFA activo, el acceso requiere contraseña y después un código. La primera etapa solo entrega un reto de cinco minutos en una cookie HttpOnly, nunca una sesión autenticada. Cada reto admite cinco intentos. Los códigos TOTP aceptan un margen de un intervalo de 30 segundos y cada intervalo válido se consume bajo bloqueo de fila para impedir repetición concurrente. Cambiar contraseña/correo o renovar códigos requiere contraseña actual y segundo factor. Un cargo que requiere MFA no puede desactivarlo.

Los secretos TOTP se cifran con AES-256-GCM y datos asociados a la cuenta. `MFA_ENCRYPTION_KEY` debe contener 64 caracteres hexadecimales aleatorios, sin prefijo `VITE_`. Los códigos de recuperación se almacenan como hashes SHA-256. Las claves, QR, contraseñas y códigos nunca se escriben en la auditoría.

**Respaldar la clave de cifrado junto con los respaldos de forma privada.** Perderla impide verificar autenticadores existentes. No rotarla sin un procedimiento de recifrado. Cada usuario debe guardar sus códigos fuera del dispositivo donde tiene el autenticador.

En desarrollo/pruebas se puede establecer `MFA_ENFORCE_PRIVILEGED=false` para ejecutar los casos antiguos de funcionalidad sin alta de autenticador. Esto no desactiva la obligación en `NODE_ENV=production` ni omite el segundo factor de cuentas que ya lo activaron.

## Sesiones y actividad

Las cookies de sesión son HttpOnly, Secure en producción y SameSite Strict. Los tokens aleatorios de 256 bits solo se almacenan como hashes. Es posible tener varias sesiones simultáneas. Cada cuenta puede consultar sus dispositivos/IP, cerrar otra sesión o cerrar todas las demás. No se muestran tokens ni hashes al navegador. Las sesiones vencen a los `SESSION_HOURS` configurados y tras 30 minutos sin consultas. Las comprobaciones automáticas de una pestaña visible mantienen la sesión activa.

La auditoría registra accesos y verificaciones fallidas, configuración MFA, revocaciones, cambios de cuenta, solicitudes de cambios administrativos, lecturas de fichas/usuarios y descargas. Registra fecha, cuenta, acción/ruta sin query string, resultado HTTP, IP y navegador. No guarda cuerpos de formularios ni contenido de reportes. Los usuarios consultan sus eventos recientes; los administradores con autoridad pastoral y permiso de cuentas pueden consultar los 100 últimos eventos globales desde Seguridad y dispositivos.

## Límites y navegador

Los contadores se comparten en MySQL entre instancias de Vercel. El límite general es de 600 solicitudes por IP/minuto; el acceso tiene además 20 solicitudes por IP/ruta cada 15 minutos y 15 intentos por cuenta cada 15 minutos, incluso desde distintas IP. Las operaciones de MFA/revocación admiten 12 solicitudes por cuenta cada 15 minutos y las exportaciones 12 por cuenta cada 15 minutos. Una red compartida cuenta como una IP. Estos límites reducen abusos; no sustituyen la protección de red de Vercel ni una prueba de capacidad.

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

`npm run test:security` crea y elimina una base temporal local. Verifica MFA obligatorio, cifrado, aislamiento entre cuentas, QR, códigos de recuperación de un uso, repetición de códigos, retos limitados, revocación, expiración, auditoría y límites. `npm run test:security:ui` añade navegador Edge y vista previa de producción con CSP, sin crear datos en Aiven. Requiere Playwright Core instalado en `.secrets/browser-tools` y MySQL local.

Ejecutar también `npm audit`, construcción y pruebas de los módulos afectados. Ningún resultado equivale a una garantía de invulnerabilidad. Los administradores deben usar contraseñas únicas, conservar códigos de recuperación y revisar la actividad.
