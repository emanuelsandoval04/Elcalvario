# Presentación de exportaciones

Los archivos generados usan el logo de El Calvario, una paleta azul y naranja, el título del reporte, fecha de generación en Colombia y número de registros. El logo está incrustado: los archivos no necesitan conexión para mostrarlo.

| Exportación | Presentación |
| --- | --- |
| Asistencia general, cumpleaños y grupos | Excel con tabla filtrable, filas alternadas, texto ajustado, columnas proporcionadas y encabezados fijos; PDF con logo, encabezados repetidos y páginas numeradas. |
| Asistencia de un evento | Los mismos estilos, más una hoja «Evento» con fecha, hora, lugar y contexto. El PDF incluye esos detalles antes de la tabla. |
| Asistencia filtrada por fechas | Hoja de filtros y detalle del intervalo en PDF. |
| Listado de discípulos | Tabla completa con encabezados y primeras columnas fijos, anchos según el dato y configuración de impresión. |
| Ficha individual de discípulo | Se abre en «Ficha del discípulo», organizada por identificación, contacto, vida en comunidad e información del registro. La hoja «Datos del discípulo» conserva la tabla completa. |
| Plantilla de importación | Se abre en una guía con logo e instrucciones. La hoja «Discipulos» conserva sus 20 columnas y encabezados en la primera fila. Los obligatorios se destacan en naranja. «Referencias» mantiene los catálogos y filtros. |
| Ficha PDF para firmar | Usa una versión del logo sin los márgenes vacíos del archivo original. Conserva el contenido, los campos autorizados y el espacio de firma. |

Los reportes Excel tienen su encabezado de tabla en la fila 7. Las tablas nativas se llaman `DatosExportados` y, cuando corresponde, `ContextoExportado`. Los lectores automáticos deben usar el rango de la tabla para distinguir datos y presentación; `checks/report-table.mjs` muestra cómo hacerlo. La plantilla de importación sigue usando su encabezado original en la fila 1.

Identificaciones, teléfonos y códigos se conservan como texto para no perder ceros iniciales. Las cadenas que empiezan por `=` también se escriben como texto, no como fórmulas. Los cumpleaños mantienen el formato mes-día y no incorporan el año de nacimiento. Las fichas respetan los permisos de datos sensibles en ambas hojas, incluidos los campos de salud y emergencia.

La configuración de impresión repite encabezados, incluye pies de página y usa orientación según el número de columnas. Las fichas individuales separan la información personal de la vida en comunidad al imprimir. Los PDF continúan las celdas largas entre páginas sin descartar su contenido. Los documentos firmados que ya se han subido se descargan intactos.

## Validación

```powershell
npm run test:exports
npm run test:attendance-tools
npm run test:community-tools
npm run test:training
npm run test:church
npm run test:consent
npm run build
npm run test:deploy
```

`test:exports` no requiere base de datos. Genera ejemplos ficticios en `.backups/export-preview/`, ignorados por Git, y comprueba todos los formatos, tablas, logos, ceros iniciales, privacidad, resultados vacíos y paginación. Las demás pruebas usan bases temporales locales y comprueban las rutas reales y sus permisos. Se revisaron también archivos abiertos en Excel en modo de solo lectura y sus vistas de impresión.

El recurso del logo para reportes está en `server/mail-assets/el-calvario-report.png`, incluido por la configuración existente de Vercel para `server/mail-assets/**`. El diseño común reside en `server/export-presentation.js`; la maquetación de los PDF, en `server/report-pdf.js`.
