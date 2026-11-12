# Registro de asistencia con código QR

## Para el equipo

1. **Gestión → Asistencia**, toca el cuadrito del evento.
2. En **Registro con código QR**, toca **Mostrar código QR**.
   - **Ampliar para proyectar**: muestra el código en grande con el nombre, la fecha y la hora del evento (Esc o *Cerrar* para salir).
   - **Copiar enlace** / **Abrir página de registro**: el mismo registro en un enlace (sirve para enviarlo por WhatsApp o para que un servidor registre personas desde su celular).
   - **Generar código nuevo**: invalida el código anterior (por ejemplo, si se compartió fuera de la iglesia).
3. Mientras el evento es de hoy, la lista se actualiza sola cada 15 segundos con quienes se registran por QR (*Autorregistro con QR*; los visitantes muestran su documento si lo dieron).
4. Al final, **Guardar asistencia y registrar ausentes** marca como ausentes a quienes no llegaron. Se puede guardar en cualquier fecha: eventos pasados (registros atrasados) o futuros. Las alertas de ausencia solo cuentan eventos que ya ocurrieron. Si alguien se registra con el QR después de guardar, su ausencia pasa a presente.

Cada fecha tiene su propio código (también cada semana de un evento fijo) y funciona en **cualquier fecha**, antes o después del evento. Un evento cancelado o archivado no recibe registros; si un código se comparte donde no debía, usa **Generar código nuevo**.

## Para quien escanea (sin iniciar sesión)

1. Escribe su **número de cédula** (puntos y espacios se ignoran).
2. Si está en la base de datos, su asistencia queda como **presente** y la página confirma con su **nombre completo**. Si ya estaba registrado, lo indica sin duplicar.
3. Si no está, la página le pide su **nombre completo** (nombre y apellido) y queda como **visitante** en la lista del evento, con el documento que escribió.
4. También puede tocar **Registrarme como visitante** directamente (documento opcional).

En una **reunión de grupo** solo se reconocen los discípulos de ese grupo; las demás personas se registran como visitantes.

## Seguridad y privacidad

- El código es aleatorio (24 bytes) y está en `actividad.token_asistencia`; no se deduce del evento.
- La página pública solo devuelve el nombre, fecha, hora y lugar del evento, y el nombre de la persona cuya cédula se escribió.
- Límite: 300 registros cada 10 minutos por conexión, pensado para el wifi compartido de la iglesia.
- Los registros guardan `metodo_registro='qr'`, `origen_registro='autoregistro_qr'`, sin usuario y con el navegador de origen.

## API

| Ruta | Uso |
| --- | --- |
| `POST /api/management/attendance/checkin-link` | `{activityId, renew?}` con `asistencia.registrar` y su alcance → `{token, state}` |
| `GET /api/public/checkin/:token` | Evento y estado: `open` o `cancelled` |
| `POST /api/public/checkin/:token` | `{documento}` → `registered`/`already` con `nombre`, o `not_found`; `{nombre, documento?}` → `visitor`/`already` |

## Publicación en producción (una sola vez)

1. Respaldar la base de Aiven.
2. `npm run db:migrate:aiven` (aplica `026-attendance-checkin.sql`: agrega `actividad.token_asistencia` y `asistencia.documento_visitante`).
3. No requiere `GRANT` nuevo: son columnas de tablas que la cuenta web ya usa.
4. Publicar el código **después** de la migración.

## Verificación local

```sh
npm run test:checkin
npm run test:checkin:ui
```
