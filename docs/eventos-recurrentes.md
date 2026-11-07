# Cultos y eventos semanales

La migración 019 añade la programación semanal sin convertir automáticamente eventos existentes de la iglesia. El despliegue requiere respaldo previo y migración con la cuenta administrativa de Aiven.

## Uso

En **Eventos y Cultos → Nuevo evento**:

1. Elegir **Culto** o **Evento especial**.
2. Completar título, lugar y demás datos.
3. Activar **Fijo**, junto a la fecha y el horario.
4. Elegir el día: domingo, lunes, martes, miércoles, jueves, viernes o sábado.
5. Elegir la hora de Colombia. No se exige fecha inicial ni final.

Ejemplo: **Culto**, hora **09:00**, día **Domingo**. La primera fecha corresponde al próximo domingo a esa hora. Si ya pasó la hora de hoy, empieza la semana siguiente. Sin Fijo se indica una fecha concreta.

La web muestra la próxima fecha de cada programación con una indicación como **Cada domingo · 9:00 a. m.** Las siguientes fechas aparecen automáticamente. Después de pasar la hora de una repetición, la agenda pública avanza a su próxima fecha. Los avisos también muestran solo el próximo encuentro de la serie.

La repetición está disponible para cultos y eventos especiales. Las reuniones privadas de grupo mantienen su flujo existente.

## Edición y asistencia

Cada fecha tiene su propio `id_actividad` y sus propios registros de asistencia. No se reutiliza la asistencia del domingo anterior. El panel conserva el listado de fechas para poder elegir la sesión correcta.

Al editar una fecha de una programación se puede elegir:

- **Solo esta fecha:** permite una excepción de fecha, hora, lugar, estado y demás datos. Cambiar o archivar una fecha no vuelve a generarla ni modifica las otras.
- **Todas las próximas fechas:** actualiza los datos y permite cambiar el día semanal o la hora. Conserva las actividades realizadas y sus asistencias. Las fechas futuras que se reemplazan y ya tienen asistencia adelantada se conservan canceladas y accesibles.

La agenda pública distingue el horario habitual de una excepción de fecha u hora. El formulario calcula automáticamente la próxima fecha de la programación fija.

**Eliminar evento fijo** desactiva la programación y retira sus próximas fechas de la agenda. Las fechas realizadas y todas las asistencias se conservan. Las fechas futuras sin asistencia se archivan; las que tienen registros se conservan canceladas y sin publicación.

Una actividad individual existente puede convertirse en semanal desde su edición si no tiene asistencias. Si ya tiene registros, la API pide crear otra programación para conservar el historial. Convertir una actividad publicada requiere además permiso de publicación.

## Almacenamiento y preparación de fechas

`019-recurring-activities.sql` añade dos tablas:

| Tabla | Contenido |
| --- | --- |
| `serie_actividad` | Día semanal, inicio, final opcional, estado, plantilla validada, creador y horizonte preparado. |
| `actividad_repetida` | Relación entre cada actividad, su serie y su fecha original, con unicidad por serie/fecha. |

Las fechas se guardan en `actividad` y en `culto` o `evento`, conservando los mecanismos existentes de asistencia, inscripción, publicación y alertas. Los eventos especiales replican sus opciones de inscripción en cada fecha.

Se preparan las próximas 12 semanas al crear la programación y se amplía ese horizonte al consultar la agenda, las actividades o los avisos. No requiere un proceso permanente ni cron en Vercel. Si no hubo visitas durante un periodo, se generan los próximos encuentros al regresar, sin inventar historial de semanas pasadas.

La fila de serie se bloquea en una transacción y la base impone una clave única por fecha original. Las solicitudes concurrentes no duplican sesiones. Las excepciones conservan su fecha original de generación aunque su fecha visible cambie. Los horarios se comparan en hora de Colombia; el cálculo semanal usa fechas de calendario sin conversiones a la zona horaria del navegador.

## API

`POST /api/management/activities` admite el campo opcional:

```json
{
  "tipo_actividad": "culto",
  "titulo": "Culto dominical",
  "fixed": true,
  "hora": "09:00",
  "lugar": "Templo",
  "estado_actividad": "programada",
  "publicado": true,
  "recurrence": { "dayOfWeek": 0, "until": null }
}
```

Los días van de 0 (domingo) a 6 (sábado). Sin `recurrence`, o con `null`, se conserva el evento individual. Una programación nueva debe estar en estado `programada` y contener al menos una próxima fecha dentro del intervalo indicado.

La creación devuelve `{id,seriesId,occurrences}`. `id` identifica la primera sesión y `seriesId` la programación. Los listados incorporan `id_serie`, `dia_semana`, `repeticion_inicio`, `repeticion_fin`, `repeticion_activa`, `repeticion_hora` y `fecha_programada`.

`PATCH /api/management/activities/:id` admite `edit_scope: 'single' | 'following'` para una fecha ya vinculada; el predeterminado es `single`. Para convertir una actividad individual sin asistencia admite `recurrence`.

`DELETE /api/management/activities/:id` con `{ "scope": "series" }` elimina las próximas fechas del fijo y exige `eventos.eliminar`. La edición usa `fixed: true`, `recurrence` y `edit_scope: 'following'`. La API mantiene compatibilidad con fecha inicial/final opcional y con el endpoint anterior de detención. Todas las mutaciones requieren sesión y permiso vigente. Publicar exige `eventos.publicar`; las actividades privadas no aparecen en la agenda ni en los avisos públicos.

## Publicación posterior

Antes de publicar esta actualización, respaldar Aiven y aplicar las migraciones con la cuenta administrativa. La migración 019 es aditiva y repetible; conserva actividades, usuarios y asistencias existentes.

Si la cuenta de Vercel usa permisos por tabla, necesita `SELECT`, `INSERT` y `UPDATE` sobre `serie_actividad`, y `SELECT`, `INSERT` y `DELETE` sobre `actividad_repetida`, además de sus permisos actuales en actividades y subtipos. La compilación no aplica migraciones.

## Verificación local

```sh
npm run test:recurrence
npm run test:recurrence:ui
```

Las pruebas usan una base temporal en MySQL local y rechazan hosts remotos. Cubren domingos/jueves, años bisiestos, límite opcional, publicación y permisos, creación concurrente, ampliación del horizonte, excepciones, asistencia independiente, edición individual o futura, conservación del historial, conversión y detención. La prueba de navegador comprueba creación, agenda pública y acciones de edición/detención a 1440/390/320 px. No crea eventos de la iglesia ni envía correos reales.
