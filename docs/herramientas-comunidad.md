# Seguimiento, estadísticas, calendario, Excel y formularios

## Seguimiento pastoral

En **Asistencia y alertas → Alertas** aparecen las alertas por dos ausencias consecutivas y los casos que ya tienen seguimiento. Se pueden buscar por discípulo, grupo o responsable y filtrar por estado. Hay paginación de 100 casos y carga de contactos anteriores, sin borrar el historial.

`alertas.ver` permite consultar los casos y sus notas dentro del alcance autorizado. El permiso independiente `seguimiento.gestionar` permite asignar responsables, planificar el próximo contacto, registrar llamadas, visitas, mensajes o notas y marcar el caso como atendido. Se concede inicialmente a los administradores y cargos pastorales existentes; el panel de permisos permite delegarlo con alcance de grupo. La asignación solo admite cuentas activas con ambos permisos y acceso al discípulo concreto.

Cada cambio comprueba una revisión para evitar sobrescribir cambios de otra persona. Para cerrar un caso debe existir una nota de atención. Las notas no se editan ni se eliminan desde la web; corregir una observación requiere añadir otra nota. Que la alerta de ausencias deje de estar vigente no borra el acompañamiento registrado. La fecha del contacto se introduce en hora de Colombia; una fecha futura se planifica como próximo contacto.

## Estadísticas

El módulo **Estadísticas** requiere `estadisticas.ver`. Admite un intervalo de hasta 366 días, agrupación semanal o mensual y filtros de grupo y tipo de actividad. Incluye gráficas, comparación con el periodo anterior de igual duración, tabla de valores exactos y comparación entre grupos.

El porcentaje se calcula como **presentes / (presentes + ausentes)**. Justificaciones y visitantes se muestran por separado. Se cuentan exclusivamente registros no archivados de actividades realizadas, no archivadas y no canceladas. No se inventan faltas cuando no se registró asistencia. Los grupos corresponden a la vinculación actual del discípulo y el alcance de consulta se aplica también a las agregaciones.

Con `miembros.ver` se añade la evolución de nuevos discípulos y de estados activos. El historial de estados comienza al aplicar la migración 020; los valores anteriores se muestran sin historial, en lugar de reconstruir estados que no se conocen. Nuevos registros, cambios de estado y archivos guardan su estado dentro de la misma transacción. Los registros anteriores a la actualización conservan sus datos; la migración solo añade una referencia de su estado actual.

## Calendario

**Eventos y Cultos → Calendario** permite navegar por mes o semana y abrir una fecha para editarla o consultar asistencia con los permisos existentes. En móvil, el mes ofrece selección del día y agenda; la semana utiliza tarjetas por día.

La página pública ofrece **Ver calendario de encuentros** y muestra todas las fechas publicadas, manteniendo privadas las reuniones de grupo y los borradores. Las tarjetas de próximos eventos conservan una sola próxima fecha por serie. El calendario permite consultar hasta un año por adelantado; amplía las fechas de las series desde el día actual, sin dejar huecos en la programación ni generar asistencias históricas.

## Importación de discípulos

En **Discípulos → Importar desde Excel**:

1. Descargar la plantilla XLSX y completar la hoja `Discipulos`.
2. Seleccionar el libro existente para las fichas, igual que en el registro individual. Si el catálogo no tiene libros, pueden quedar sin asignar.
3. Cargar el archivo: hasta **500 filas y 512 KB**. Identificación y celular deben guardarse como texto para conservar ceros iniciales. Fechas: `AAAA-MM-DD`, `DD/MM/AAAA` o celdas de fecha de Excel.
4. Revisar la vista previa y corregir las filas desde la web. Se detectan datos inválidos, fórmulas, duplicados dentro del archivo o contra fichas existentes, incluidas las archivadas, y códigos de grupo fuera del alcance.
5. Seleccionar filas válidas, marcar la confirmación y pulsar **Importar N discípulos**.

Solo se importan nombres, apellidos, identificación, celular, correo, nacimiento y código de grupo. Las demás columnas se anuncian como ignoradas. No se importan cargos, servicios, información médica, contraseñas ni cuentas de acceso. El libro se asigna desde el catálogo actual y el grupo debe estar autorizado para quien registra.

Antes de guardar se repiten las comprobaciones dentro de una transacción. Cualquier error cancela toda la importación; nunca se sobrescriben fichas existentes. El archivo se procesa en memoria y no se conserva en el servidor. La inspección previa del ZIP limita tamaños descomprimidos, dimensiones y cantidad de elementos antes de cargar ExcelJS.

## Formularios

Ingreso, recuperación, creación de cuentas, perfil, participación y registros muestran un resumen con enlaces a los campos incorrectos, mensajes cercanos al control y asociaciones `aria-invalid`/`aria-describedby`. El resumen recibe el foco; sus enlaces llevan al campo o al selector personalizado. Los errores de la API identificados por campo se muestran en su lugar y los asistentes regresan al paso correspondiente. No se vacían los datos ante errores.

La mejora no introduce avances, lecciones, evaluaciones ni cambios al módulo de adiestramiento.

## API y despliegue

| Ruta | Operación |
| --- | --- |
| `GET /api/management/statistics` | `from`, `to`, `interval=week\|month`, `groupId`, `type`. |
| `GET /api/management/pastoral/cases` | `state`, `q`, `page`; casos dentro del alcance. |
| `GET /api/management/pastoral/cases/:id` | Ficha, permisos efectivos y notas; `before` pagina contactos. |
| `PATCH /api/management/pastoral/cases/:id` | `revision`, `estado`, `id_responsable`, `proximo_contacto`, `note?: {tipo,detalle,fecha}`. |
| `GET /api/management/activities/calendar` | Fechas autorizadas entre `from` y `to`. |
| `GET /api/public/calendar` | Fechas publicadas entre `from` y `to`. |
| `GET /api/management/members/import/template` | Plantilla XLSX autenticada. |
| `POST /api/management/members/import/preview` | `{file: base64,bookId}` o `{rows,bookId}` para revisar correcciones. |
| `POST /api/management/members/import/commit` | `{rows,bookId}`; guardado atómico de filas seleccionadas. |

Respaldar Aiven antes de aplicar `020-pastoral-followup.sql` con la cuenta administrativa. Añade `seguimiento_pastoral`, `nota_seguimiento`, `historial_estado_miembro` y un permiso. No elimina datos. Para la cuenta limitada de Vercel se necesitan `SELECT,INSERT,UPDATE` en seguimiento y `SELECT,INSERT` en notas e historial. Las conexiones de la aplicación fijan su sesión MySQL a UTC; la interfaz muestra horarios de Colombia.

Verificación: `npm run test:community-tools:ui`. Usa MySQL local temporal, APIs reales y navegador, sin correos reales. Incluye límites, duplicados, permisos de grupo y de solo lectura, concurrencia, rollback, historial, calendario público/privado, gráficas, corrección de Excel y pantallas de 320 a 1440 píxeles.
