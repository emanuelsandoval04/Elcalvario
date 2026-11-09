# Asistencia por evento e historial del discípulo

Los cambios se preparan localmente. No requieren migraciones nuevas ni se publican hasta que el usuario lo indique.

## Registrar asistencia

En **Asistencia**, selecciona un evento de **Hoy y próximos** o **Eventos anteriores**. Se puede buscar por nombre y cargar más resultados. Cada opción incluye su fecha y hora para distinguir celebraciones del mismo nombre o del mismo día. La lista histórica se pagina independientemente de las fechas futuras de eventos fijos.

El listado para tomar asistencia incluye discípulos activos del grupo del encuentro, o los activos de la iglesia si el encuentro es general. Los registros de asistencia archivados no se vuelven a crear automáticamente. Los datos históricos de personas inactivas se conservan en los registros guardados.

Al pulsar **Guardar asistencia y registrar ausentes**, se guardan las selecciones de presentes y justificados. Los discípulos del listado revisado que no tienen selección ni asistencia previa quedan registrados como **ausentes sin justificación**. La operación puede guardarse desde el inicio del evento; las llegadas anticipadas siguen disponibles mediante el registro individual. Abrir la pantalla o descargar un reporte no crea ausencias.

El servidor compara la versión del listado revisado y vuelve a comprobar los permisos. Un cambio en el grupo, en los participantes o en la programación obliga a revisar otra vez. El lote completo y el recálculo de alertas se guardan en una transacción: si falla un paso, no se guardan ausencias parciales. Los reintentos conservan los registros existentes. Cambiar un estado ya guardado requiere la corrección autorizada, como antes.

## Consultar y descargar

Con permiso de reportes, el evento seleccionado ofrece **PDF** y **Excel** de sus registros guardados. Ambos identifican nombre, fecha, hora de Colombia, lugar e identificador del evento, incluso si todavía no tiene asistencias. El PDF muestra esos datos en el encabezado; el Excel añade una hoja **Evento**. Se incluyen presentes, ausentes, justificados y visitantes registrados, respetando permisos y sin mezclar eventos celebrados el mismo día.

Los reportes omiten nombres personales cuando el usuario no puede consultar discípulos. Con alcance por grupo, los nombres de personas fuera de ese alcance se sustituyen por su identificador. Los registros de asistencia archivados no aparecen en el reporte activo.

## Ficha del discípulo

En **Discípulos → Ver ficha → Historial de asistencia** se ven evento, día, hora y estado de cada registro autorizado. La asistencia se vincula mediante `id_miembro` e `id_actividad`; el historial lee los registros originales y refleja las correcciones, sin mantener copias que puedan quedar desactualizadas. Los encuentros archivados o cancelados se identifican en el historial. El acceso requiere `miembros.ver` y `asistencia.ver`, con el alcance correspondiente para cada encuentro.

## API y validación

- `GET /api/management/activities?view=attendance&period=past|upcoming&q=...&page=1`: selector con páginas de 100 eventos.
- `GET /api/management/attendance/roster?activityId=...`: listado activo, indicador de registro previo, versión y datos del evento.
- `POST /api/management/attendance/save`: `{activityId,rosterVersion,states:{"id_miembro":"presente|ausente|justificado"}}`. Los participantes sin selección se guardan como ausentes. Máximo 2000 discípulos por lote.
- `GET /api/management/reports/asistencia?activityId=...&format=pdf|xlsx`: descarga de una sesión concreta.
- `GET /api/management/members/:id/attendance?page=1`: historial de la ficha, en páginas de 25 registros.

`npm run test:attendance-tools:ui` comprueba datos y permisos en una base temporal local: ausentes sin marcar, justificaciones, conservación de registros previos, carreras y reintentos, reversión ante fallos de asistencia o alertas, exclusión de eventos futuros/cancelados, correcciones y seguimiento, descargas de eventos concretos, privacidad, paginación y vistas desde 320 píxeles. No altera Aiven ni envía correos.
