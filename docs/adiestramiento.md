# Adiestramiento

La sección `/#gestion/training` permite crear libros con nombre y descripción opcional. Los cargos operativos, incluido Discipulador, reciben el permiso `adiestramiento.gestionar`. Las cuentas de discípulo básico (`Usuario`), pendientes, bloqueadas o inactivas no pueden crear libros. El catálogo no contiene registros inventados.

Cada libro tiene **Editar** y **Eliminar**. Editar su nombre o descripción conserva la identidad y las asignaciones; las fichas y los Excel muestran el nombre actualizado. Eliminar pide confirmación y solo se permite cuando ninguna ficha lo tiene asignado, incluidas fichas archivadas. Si está en uso, se muestra la cantidad y es necesario reasignar esos libros primero. La API vuelve a comprobarlo dentro de la transacción y rechaza ediciones o eliminaciones basadas en una versión desactualizada.

## Registro y asignación

En **Discípulos → Registrar discípulo**, el paso de información adicional incluye **Libro de adiestramiento** y **Crear libro aquí**. El editor está dentro del mismo formulario: conserva el borrador de la persona y selecciona el libro recién creado. Si el catálogo está vacío, se puede registrar al discípulo sin libro; cuando ya hay libros, el registro normal requiere elegir uno. El registro administrativo conserva su libro opcional.

Para personas existentes, utiliza **Discípulos → Sin libro → Ver ficha**. El bloque **Libro actual** permite seleccionar y guardar el libro correspondiente. Las asignaciones existentes se conservan y pueden actualizarse expresamente. No se elige un libro automáticamente ni se modifica el de otras personas. El servidor rechaza cambios que sobrescribirían una asignación modificada por otro usuario.

La ficha y el listado muestran el libro actual. Una cuenta vinculada a la persona también lo ve en **Opciones de la cuenta → Nombre y correo**. Ese bloque es informativo; la cuenta básica no puede cambiarse el libro a sí misma.

## Excel

Se puede descargar una ficha desde **Descargar ficha en Excel**, el listado filtrado mediante **Descargar discípulos en Excel**, o el listado completo autorizado en **Reportes → Ficha completa de discípulos**. El archivo `.xlsx` incluye identificación, contacto, nacimiento, grupo, rol, cobertura, libro actual, ministerios, estado, QR y fechas. Salud y emergencia solo se incluyen con `miembros.sensibles`.

El permiso `reportes.discipulos` conserva el alcance del permiso de consulta de personas. Los discipuladores solo exportan las personas de su alcance; la API aplica también el alcance actual de `miembros.ver`, incluso si se amplía el permiso de reportes. No se exportan contraseñas ni credenciales técnicas.

## Persistencia y API

La migración `014-training-books.sql` crea `libro_adiestramiento`, añade `miembro.id_libro` como referencia opcional y registra los permisos. No asigna libros a fichas existentes ni altera los datos personales. Sus permisos iniciales se aplican una sola vez; repetir la migración conserva personalizaciones y revocaciones posteriores.

| Método | Ruta bajo `/api/management` | Uso |
| --- | --- | --- |
| GET | `/training/books` | Consultar el catálogo operativo. |
| POST | `/training/books` | Crear `{nombre,descripcion?}`; los nombres duplicados responden 409. |
| GET | `/training/books/:id` | Consultar el libro y su cantidad de asignaciones. |
| PATCH | `/training/books/:id` | Actualizar nombre/descripción; admite `expectedName` y `expectedDescription`. |
| DELETE | `/training/books/:id` | Eliminar un libro sin asignaciones; 409 si está en uso o desactualizado. |
| POST | `/members` | Incluye `id_libro`; obligatorio en registro normal cuando hay libros. |
| PATCH | `/members/:id` | Conserva el libro si no se envía un cambio. |
| PUT | `/members/:id/book` | Asigna `{id_libro,expectedId}` dentro del alcance actual. |
| GET | `/members/:id/excel` | Descarga una ficha autorizada. |
| GET | `/reports/discipulos?format=xlsx` | Descarga las fichas; admite `q`, `estado`, `sin_libro=1` e `id_grupo`. |

Crear libros y asignarlos relee los permisos dentro de una transacción. Crear libros no otorga acceso adicional a información personal.

## Validación

```sh
npm run test:training
npm run test:training:ui
npm run test:church
npm run build:vercel
```

Las pruebas usan una base temporal y la eliminan al terminar. Cubren catálogo vacío, creación por cargos, exclusión de cuentas básicas, asignaciones, concurrencia, privacidad y alcance del Excel, conservación de datos y migraciones repetidas. La prueba de interfaz utiliza Edge y `playwright-core` disponible en `.secrets/browser-tools`, instalado con `npm install --prefix .secrets/browser-tools playwright-core`.
