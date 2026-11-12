# Registro de asistencia con código QR

## Para el equipo

1. **Gestión → Asistencia** y toca el cuadrito del evento. El evento queda en la dirección (`#gestion/falls/registro/actividad/<id>`), así que al recargar la página se abre el mismo evento.
2. **Registro con código QR**: el código ya creado para esa fecha aparece solo, también después de recargar. Si todavía no existe, toca **Mostrar código QR**.
   - **Ampliar para proyectar**: muestra el código en grande con el nombre, la fecha y la hora del evento (Esc o *Cerrar* para salir).
   - **Copiar enlace** / **Abrir página de registro**: el mismo registro en un enlace.
   - **Generar código nuevo**: invalida el código anterior.
   - Si se abre desde `localhost`, un aviso recuerda que los celulares no pueden abrir ese código: hay que usar la versión publicada.
3. **Por confirmar**: cada persona tiene tres iconos: ✓ verde *asistió*, ✗ roja *no asistió* y ⚠ gris *tiene excusa*. Un toque guarda la asistencia de inmediato y la persona baja a **Asistencias registradas**. Quien se registra con el QR sale solo de esta lista, sin duplicados: la API rechaza un segundo registro de la misma persona en el mismo evento.
4. **Asistencias registradas**: los registros marcados por el equipo y los del QR juntos, con el más reciente primero. La lista se actualiza sola cada 5 segundos mientras la página está abierta. Quien puede corregir lo hace con los mismos iconos.
5. **Finalizar evento y guardar asistencia** (al final): quienes sigan por confirmar quedan como ausentes sin justificación. Si alguien se registra después con el QR, su ausencia pasa a presente.

Ya no existe el registro manual de visitantes ni el de identificadores QR: los visitantes se registran con el código QR.

Cada fecha tiene su propio código (también cada semana de un evento fijo) y funciona en **cualquier fecha**. Un evento cancelado o archivado no recibe registros.

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
| `GET /api/management/attendance/checkin-link?activityId=` | Código ya creado (`token` o `null`), sin crear uno nuevo |
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
