# Datos territoriales de Villavicencio

Esta carpeta contiene datos externos importados. Ningún contorno se dibujó manualmente.

## Contornos completos actualmente utilizados

`barrios_limites_villavicencio.geojson` contiene 683 features de la capa pública **Barrios**, capa 0, item `7484093dba8f4430990d69937d693836`. Fuente: https://services7.arcgis.com/c0V1cyhKZwmv8Gtf/arcgis/rest/services/Barrios/FeatureServer/0 . Descarga: `/query?where=1%3D1&outFields=BARRIO,Comuna,Municipio&outSR=4326&f=geojson`. Nombre: `BARRIO`; coordenadas WGS84. El item declara «Barrios Villavicencio», publicador `cmgutier`, etiquetas SIG/Bioagricola y carece de licencia/atribución institucional explícita. La validación documental de procedencia y reutilización sigue pendiente; no se anuncian límites certificados.

Quedaron **340 contornos completos**, todos Polygon con contorno exterior. El reporte `reporte-limites.json` conserva 212 nombres sin coincidencia, 83 casos ambiguos y una feature sin nombre. Otras cuatro coincidencias nominales quedaron en revisión porque las dos fuentes ubican ese nombre en áreas sin solapamiento; `spatialReview` conserva sus extensiones y `limites_revision.mappings.json` los excluye del importador predeterminado mediante valores null. No se elige arbitrariamente entre polígonos que comparten nombre. Las geometrías de manzanas de la fuente anterior se retiraron de 124 barrios pendientes de un límite inequívoco; sus registros y asignaciones se conservan y siguen disponibles en Lista. Doña Luz pasó de 21 piezas a un contorno y Rosita de 12 piezas a un contorno.

El importador utiliza por defecto el archivo de límites y detecta el campo `BARRIO`. `--retire-source "procedencia exacta anterior"` permite retirar una fuente de manzanas conocida durante la misma transacción de reemplazo; el reporte enumera los barrios afectados. Se exige una fuente nueva distinta y al menos una coincidencia válida. Antes de aplicarlo se guarda un respaldo completo. La fuente antigua y su reporte original se conservan debajo como archivo de procedencia; no deben volver a utilizarse para dibujar perímetros completos.

## Archivo de la fuente anterior por manzanas

- `catalogo_municipal.json`: 668 registros de **Barrios y Veredas del Municipio de Villavicencio**, suministrados por la Alcaldía. Fuente: https://www.datos.gov.co/Vivienda-Ciudad-y-Territorio/Barrios-y-Veredas-del-Municipio-de-Villavicencio/x5yx-u8uk . API: https://www.datos.gov.co/resource/x5yx-u8uk.json?$limit=5000 . Conserva denominación, comuna y código de origen. Los nombres repetidos del catálogo pueden representar sectores distintos; no se fusionan automáticamente.
- `barrios_villavicencio.geojson`: 465 features descargadas de la capa pública **Barrios_Villavicencio_Bio**, vista **Barrios_Servicios_2022_vista**, capa 84. Campo de nombre: `DNOCION`. Consulta original: https://services7.arcgis.com/c0V1cyhKZwmv8Gtf/arcgis/rest/services/Barrios_Servicios_2022_vista/FeatureServer/84/query?where=1%3D1&outFields=*&outSR=4326&f=geojson . Item: https://www.arcgis.com/home/item.html?id=773b75c35c21425e8b4d5c6cf30ec458 . Publicador observado: `cmgutier`; metadatos sin atribución institucional ni licencia explícita. **La procedencia documental y las condiciones de reutilización de esta capa siguen pendientes de validación. No es una certificación municipal de límites.** La consulta reproyecta a EPSG:4326; las coordenadas originales no se transforman a ojo.
- `reporte-importacion.json`: resultado de la importación local. 411 coincidencias únicas aplicadas, 26 nombres sin coincidencia, 26 casos ambiguos y 2 geometrías rechazadas por anillos sin área. Estos últimos no se corrigen automáticamente.

Se obtuvieron estos archivos durante la implementación del 17 de octubre de 2026. El catálogo municipal no contiene geometrías: su existencia no certifica los contornos de la otra fuente. La interfaz presenta todos los límites como referencia sujeta a validación.

## Importación y actualización

Primero ejecuta `npm run db:migrate` con respaldo. El catálogo se carga **explícitamente**, por separado:

```sh
node scripts/import-neighborhood-catalog.mjs
node scripts/import-neighborhood-catalog.mjs --apply
```

Por defecto el primer comando solo informa lo que crearía. El código estable es `municipio-50001-{id}`. El segundo no sobrescribe registros existentes, no elimina barrios y reporta conflictos con nombres previamente registrados. No renumera asignaciones. Un catálogo futuro con otra codificación requiere conciliar identidades antes de importarlo.

Para geometrías, ejecutar primero una simulación:

```sh
node scripts/import-geodata.mjs --file database/geodata/barrios_villavicencio.geojson --report database/geodata/revision.json
node scripts/import-geodata.mjs --file database/geodata/barrios_villavicencio.geojson --apply --source "Fuente y versión documental del archivo"
```

El importador solo actualiza geometría, fuente y fecha de los barrios ya existentes. No crea barrios al no encontrar un nombre y no toca grupos, miembros, responsables ni asignaciones. Admite Polygon/MultiPolygon con huecos, anillos cerrados no degenerados y coordenadas WGS84 dentro de un rango geográfico de Villavicencio. Esta validación estructural no certifica exactitud topológica ni legal. Cada feature tiene un límite de 200 000 puntos. Nunca se aplica una geometría ambigua ni inválida; las coincidencias válidas se aplican juntas en una transacción.

Para otra fuente usa `--name-property nombre`. Para conciliar diferencias, crea un JSON revisado `{"nombre exacto en la fuente": 123}` y pásalo con `--mapping ruta/al/archivo.json`; el número es el `id_barrio` de **esa base**. No copies mapeos por ID entre instalaciones. Geometrías múltiples para el mismo barrio requieren preparar y validar una unión cartográfica externamente; el importador no elige ni fusiona contornos automáticamente.

Al reemplazar el archivo, conserva estos metadatos y registra su fuente, versión, fecha, CRS, licencia y validación documental. No cambies identidades por una actualización geométrica.
