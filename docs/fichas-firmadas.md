# Fichas de discípulos y consentimiento

> **Reemplazado (noviembre de 2026):** la autorización ahora se confirma con un código por SMS. Ver [autorizacion-datos-sms.md](autorizacion-datos-sms.md). Las fichas firmadas ya subidas se conservan en el historial; este documento queda como referencia del flujo anterior.

En **Discípulos → Ver ficha → Autorización y ficha firmada**, un responsable autorizado puede descargar los datos actuales en PDF, imprimirlos y subir todas las páginas firmadas. El PDF incluye ambos logos, identificación del titular en cada página, texto base de autorización, decisiones separadas sobre datos religiosos y de salud, y espacio para firma del titular o representante.

La iglesia indicó que aún no tiene una política oficial. El texto incluido se identifica como **base para revisión institucional**. Deben revisar el responsable, la dirección de atención, las finalidades y el procedimiento antes de adoptarlo como su política. No se presenta como una política aprobada ni como certificación de cumplimiento jurídico. Se consultaron la [Ley 1581 de 2012](https://www.cancilleria.gov.co/normograma/compilacion/docs/ley_1581_2012.htm) y la [orientación de la SIC sobre datos sensibles de salud](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/tratamiento-de-datos-sensibles-relativos-la-salud). El texto y su identificador interno están en `server/disciple-consent-document.js`.

## Uso

1. Guarda los cambios de los datos y descarga una ficha nueva antes de firmarla.
2. El titular revisa los datos, marca sus decisiones sobre información sensible y firma. Para menores se incluye espacio para identificar al representante.
3. El responsable carga un PDF de hasta 2 MB y 12 páginas, o hasta seis fotos de las páginas, en orden. Se aceptan JPG, PNG y WebP desde el selector. Las fotos se convierten a JPG sin recortar, con un máximo de 2000 píxeles en el lado mayor y 2 MB en total. Varias fotos se guardan juntas en un PDF.
4. El responsable registra lo autorizado en las casillas del documento y confirma haber revisado sus páginas y firma. La aplicación comprueba el formato del archivo, no autentica una firma manuscrita.
5. La aceptación y la fecha de subida se guardan juntas, con hora UTC del servidor y visualización en Colombia. No se aceptan fechas manuales. Un fallo de almacenamiento revierte también la aceptación.

El verde indica una ficha adjunta declarada como firmada y un consentimiento vigente. El rojo indica que falta el archivo o que se registró una revocación. Los consentimientos históricos sin archivo no se convierten automáticamente en fichas firmadas. Subir otra ficha conserva las evidencias anteriores; la revocación tampoco elimina archivos.

## Acceso y almacenamiento

Todos los usuarios autorizados a consultar una ficha ven su estado y fecha, respetando su grupo. Preparar el PDF requiere `consentimientos.gestionar` o `reportes.discipulos`, además de `miembros.ver`, con intersección de sus alcances. El PDF omite salud y contactos de emergencia si el usuario no tiene `miembros.sensibles`.

Subir documentos o registrar una revocación requiere `consentimientos.gestionar` y `miembros.ver` dentro del mismo alcance. Descargar un documento firmado requiere además `miembros.sensibles`, porque una copia subida puede contener información reservada. No hay enlaces públicos a documentos.

La migración aditiva `021-signed-consent.sql` guarda los archivos en MySQL/Aiven, vinculados al consentimiento, con hash SHA-256, texto de autorización, autor y fecha. No usa el disco temporal de Vercel. Eliminar una cuenta conserva la evidencia y elimina su vínculo al autor. El usuario de ejecución necesita `SELECT, INSERT` sobre `documento_consentimiento`; conserva los permisos existentes sobre `consentimiento_datos`.

## Validación

`npm run test:consent:ui` usa una base temporal local y archivos de prueba. Comprueba PDF, datos actuales, permisos por grupo, ausencia de archivos públicos, formatos y tamaño, rechazo de PDF activo, fecha del servidor, reversión ante error, historial y revocación, eliminación del autor, migraciones repetibles y vistas entre 320 y 1440 píxeles. No envía correos ni firma registros reales.
