# Mapa de cobertura pastoral

Implementación incremental sobre React/TypeScript/Vite, Express/mysql2 y MySQL 8.4.11. La inspección de la base local encontró `zona(id_zona,nombre)`, `miembro`, `grupo_comunion`, `usuario`, `rol_eclesiastico`, `rol_permiso` e `historial_miembro`; no había barrios ni relación territorial equivalente. La cobertura personal de `miembro.id_cobertura_pastoral` sigue teniendo su significado anterior.

La migración `010-map-coverage.sql` añade `barrio` con JSON, procedencia y fecha geométrica, `discipulador_barrio` con historial y actor de cada alta/baja, y `grupo_barrio` como vínculo opcional del grupo al barrio. La auditoría reutiliza la identidad de `usuario`, el patrón de historial existente y el bloqueo transaccional de RBAC. La clave generada `vigente` impide dos asignaciones activas del mismo par y permite conservar varias anteriores. Distintos responsables pueden cubrir el mismo barrio. No hay bajas físicas de asignaciones. No cambia permisos ni datos anteriores.

## Uso

El grupo se crea desde **Grupos de Comunión → Nuevo grupo**. Crear y editar incluyen un buscador de barrio/comuna y una selección múltiple de barrios, sin Dirección, Latitud, Longitud, Día de reunión ni Hora de reunión. Los barrios necesitan un discipulador activo para poder guardarse. No hay creación de grupos desde Mapa.

Los selectores de barrios de creación, edición y administración de zonas permanecen recogidos hasta escribir una búsqueda. Solo se muestran las coincidencias; limpiar el buscador vuelve a recogerlas. Los barrios seleccionados se conservan entre búsquedas y pueden revisarse o quitarse desde el resumen desplegable **Ver barrios seleccionados**.

El grupo, sus barrios y las coberturas del responsable se guardan en una sola transacción. Si falla una selección o cambia la asignación durante la edición, se revierte toda la operación. Los nombres elegidos se reflejan en la ficha y Mapa muestra un ubicador grande con la foto y el nombre de cada discipulador. Los barrios sin ubicación se identifican como pendientes y permanecen disponibles en Lista. La ficha también ofrece **Ver barrios en el mapa**.

La relación múltiple reutiliza `grupo_barrio_cobertura` (migración 011). La migración 012 amplía a TEXT el campo de nombres existente. Los nombres escritos anteriormente se conservan si todavía no se ha seleccionado su identidad del catálogo; el formulario permite revisar y seleccionar esos barrios sin inventar coincidencias geográficas. La edición de cobertura mantiene sus permisos pastorales, el control de concurrencia y la confirmación antes de quitar barrios. Retirar barrios de un grupo conserva las asignaciones independientes que tenga el discipulador.

El acceso **Mapa** está directamente en la barra móvil, junto a Inicio, Discípulos, Asistencia, Eventos y Más; también está en la navegación lateral. `/#gestion/mapa` carga el componente y Google Maps JavaScript API bajo demanda. La clave local usa `VITE_GOOGLE_MAPS_API_KEY` en `.env`; es una clave de navegador que Google necesita recibir. Configúrala con restricciones de referentes HTTP y únicamente la API necesaria. Reinicia Vite o recompila después de cambiarla. Ninguna clave real se guarda en componentes ni en `.env.example`.

El mapa inicia en Villavicencio y muestra ubicadores de barrios con una asignación vigente y un responsable activo no archivado. Se considera responsable a la ficha con cargo Discipuladores o al responsable de un grupo activo. Los contornos se conservan en la base únicamente para calcular un punto de referencia interior de la zona; no se dibujan ni se envían al navegador en la consulta de coberturas. Un barrio sin geometría mantiene su cobertura en Lista y se identifica como ubicación pendiente. Nunca se envían puntos residenciales, identificaciones, teléfonos, direcciones o datos de salud al mapa.

La búsqueda local incluye barrio, comuna, responsable y nombre del grupo vinculado. Seleccionar un resultado centra y resalta el ubicador y abre un diálogo inferior grande con foco modal y Escape. Cada responsable aparece con su nombre y la foto de su cuenta vinculada; si no tiene foto o falla la imagen se muestran sus iniciales. Pulsar su foto o nombre abre los grupos de ese responsable en el barrio, sus cantidades y los accesos permitidos a grupos y miembros. Cuando hay varios responsables en un barrio, todos aparecen en el mismo ubicador. Los colores se generan de forma estable a partir de la identidad del discipulador.

Lista funciona ante fallos de red, tiempo de espera o autenticación de Google y tiene Reintentar. El backend se consulta una vez por carga y después de cambios de asignación; tocar ubicadores usa los datos ya cargados. Las fotos se solicitan a un endpoint autenticado y se ocultan los ubicadores que no coinciden con la búsqueda sin recrear sus imágenes. No usa Geocoding ni Places. Google puede descargar sus propias teselas al desplazar o acercar el mapa.

En **Mapa → Administrar zonas de discipuladores**, o en la ficha de un discipulador/grupo, se seleccionan barrios por nombre con búsqueda y comunas. Quitar barrios pide confirmación antes de guardar. Si otro administrador cambia la selección primero, la API rechaza la actualización y pide volver a abrirla. Para reflejar un grupo en la ficha del barrio, selecciona **Grupos → ficha → Barrio en el mapa de zonas**. Se evita inferir el barrio a partir de texto libre o de la ubicación residencial. Solo se cuentan discípulos activos no archivados de grupos activos vinculados explícitamente al barrio y a uno de sus responsables vigentes. Un grupo aparece ?nicamente en los barrios seleccionados expl?citamente para ese grupo. Si cubre varios, su cantidad total de disc?pulos se muestra en cada ficha de barrio como dato del grupo, sin inferir d?nde viven ni sumar esas cantidades como personas distintas entre barrios.

## Permisos y API

Todos los endpoints viven bajo `/api/management/mapa`, después de los controles de sesión activa, origen y `gestion.acceder`. Exigen `grupos.ver`; su alcance `grupo` limita barrios, responsables y grupos al miembro vinculado. Asistencia Pastoral y Pastor consultan el alcance de sus permisos reales. Multimedia conserva su consulta de grupos, sin recibir datos privados ni autorización para asignar zonas. No se conceden permisos nuevos.

Administrar exige además autoridad pastoral según `hasPastoralAuthority`, `grupos.editar` con alcance `todos` y una relectura transaccional de los permisos del actor. El propietario técnico conserva la excepción de configuración que ya existía.

| Método | Ruta relativa | Uso |
| --- | --- | --- |
| GET | `/coberturas` | `{items,canManage}`: barrios con `ubicacion`, responsables con `fotoUrl`, grupos y cantidades |
| GET | `/discipuladores/:id/foto` | Foto del responsable activo con cobertura visible para la cuenta; respuesta privada sin caché |
| GET | `/barrios` | Catálogo activo por nombre/comuna, sin geometrías |
| GET | `/discipuladores` | Responsables activos permitidos y capacidad de administración |
| GET | `/discipuladores/:id/barrios` | IDs de las asignaciones vigentes del responsable permitido |
| PUT | `/discipuladores/:id/barrios` | `{ids,expectedIds,confirmRemoval}`: actualización transaccional con historial |
| GET | `/grupos/:id/barrio` | Barrio seleccionado de un grupo permitido |
| PUT | `/grupos/:id/barrio` | `{id_barrio}`: vínculo opcional; null lo desvincula |

Coberturas utiliza consultas agregadas de barrios y grupos, más una consulta conjunta de las versiones de fotos de los responsables visibles. No carga los archivos de imagen en esa respuesta ni hace consultas N+1. El endpoint de fotos vuelve a comprobar permisos, alcance y cobertura activa antes de servir la imagen; la foto de cuenta propia conserva sus controles anteriores. Las fichas personales se consultan únicamente en los módulos anteriores y con sus controles existentes.

El catálogo y la consulta de cobertura no ordenan en MySQL las filas que usan `geojson`: el orden por comuna, barrio y responsable se aplica en Node sobre los resultados. Esto evita `ER_OUT_OF_SORTMEMORY` con polígonos grandes y el buffer de ordenación predeterminado. No requiere aumentar la memoria global de MySQL ni cambiar los datos. La prueba de interfaz importa el catálogo municipal con sus geometrías reales y verifica tanto el catálogo como la cobertura de un polígono mayor de 256 KiB.

## Datos y comprobaciones

Consulta [procedencia, limitaciones y procedimiento de importación](../database/geodata/README.md). La fuente de polígonos permanece pendiente de validación documental. No se inventan responsables, grupos ni asignaciones para llenar un mapa vacío.

```sh
npm run typecheck
npm run build
npm run test:map
npm run test:map:ui
npm run test:church
```

Las pruebas del mapa crean y eliminan una base temporal aislada. Cubren permisos, alcance, privacidad, conteos, concurrencia, historial, responsables inactivos, importación sin duplicados, conservación de identidad y migraciones repetidas. Las pruebas de interfaz requieren Vite y el Playwright/Edge del entorno local; `UI_ORIGIN` cambia su dirección. Comprueban 320/390/768/1440 px, carga diferida, caída de Google, ficha inferior, acceso al grupo y guardado con confirmación. `node checks/map-check.mjs --ui --google` usa Google real en lugar del fallo de red simulado y requiere la clave configurada.
