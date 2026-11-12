# Usuarios, roles y permisos

La navegación reúne la administración de cuentas y la configuración de perfiles en una sola entrada: **Usuarios, roles y permisos**.

- `/#usuarios`: cuentas, búsqueda, creación, asignación de roles y vinculación con fichas.
- `/#usuarios/perfiles`: configuración de perfiles del sistema.
- `/#usuarios/perfiles/:id`: abre directamente los permisos de un perfil.
- `/#gestion/permissions` y `/#gestion/users`: direcciones anteriores, redirigidas a la sección unificada.

En escritorio, las cuentas aparecen junto al editor de perfiles. **Permisos del perfil**, al lado del selector de rol de cada cuenta, abre la configuración del rol seleccionado. Elegir un rol en el selector no lo asigna hasta guardar la cuenta. Editar sus permisos modifica el perfil completo y afecta a todas las cuentas que lo tengan.

En pantallas menores, la sección alterna entre **Usuarios y asignación de roles** y **Perfiles y permisos**. Cambiar entre esas vistas conserva los formularios abiertos. Cambiar de perfil con cambios pendientes solicita descartarlos antes de continuar.

El editor agrupa permisos por herramienta y permite buscarlos sin acentos. Cada permiso muestra los alcances disponibles: **Sin permiso**, **Todos** o **Grupos a cargo**, según el perfil y la herramienta. **Deshacer** elimina los cambios pendientes del formulario; no revierte cambios ya guardados.

## Autoridad y protecciones

Se conservan las autorizaciones existentes. Administrar cuentas requiere `usuarios.gestionar` y autoridad para hacerlo; editar perfiles requiere `gestion.acceder` y `permisos.gestionar`. La sección muestra solo las operaciones autorizadas. Un editor de perfiles sin autoridad sobre cuentas no consulta la lista de usuarios; un administrador de cuentas sin permiso para configurar perfiles no obtiene el editor.

Superadmin, Pastor y los cargos pastorales de niveles 1 a 4 mantienen su configuración protegida. Usuario conserva su acceso básico. El Discipulador mantiene los límites de grupo, con la excepción existente del catálogo de adiestramiento. Estas reglas las informa y aplica el servidor; no dependen únicamente de controles deshabilitados en la interfaz.

Administrador se unificó con Superadmin (migración `022-unify-admin-role.sql`). La jerarquía es: Superadmin (0), Apóstol General (1), Asistencia Apostólica (2), Pastor de Distrito (3), Pastor Local y Pastor (4), Asistencia Pastoral (5), Discipulador (6). Nadie, salvo Superadmin, puede asignar un rol de cargo igual o superior al propio ni cambiar, eliminar o vincular cuentas de ese nivel (Pastor equivale al nivel 4). La lista de roles que recibe cada administrador ya viene filtrada a los que puede asignar, y la cuenta del propietario de la instalación solo la modifica su titular.

Las protecciones de la propia cuenta y del propietario, la habilitación de pendientes, la eliminación de cuentas y los permisos de vinculación permanecen vigentes. No se agregan permisos individuales por usuario ni se modifican roles o cuentas durante la actualización del código.

## Guardado y concurrencia

`GET /api/management/permissions` añade `editable`, `groupOnly` y `reason` a cada rol. El editor envía la configuración de referencia mediante `expectedGrants` al guardar en `PUT /api/management/permissions/:roleId`.

El servidor vuelve a comprobar la autoridad dentro de la transacción, valida códigos, duplicados y alcances, y rechaza con 409 los cambios basados en una configuración anterior. El editor mantiene el borrador ante errores y ofrece recargar la versión actual. Los cambios guardados se aplican también a las sesiones abiertas.

No requiere migración de base de datos. Se usan los catálogos de roles y permisos existentes.

## Verificación

```powershell
npm run test:access-management:ui
npm run test:account-creation:ui
npm run test:accounts:ui
npm run test:church
```

Las pruebas usan bases temporales locales. Comprueban asignación y persistencia, edición contextual, perfiles protegidos, permisos por grupo, separación de autoridades, conflictos entre administradores, recuperación de fallos, enlaces anteriores y vistas de 320 a 1440 px.

## ID visibles de discípulos y cuentas

- Cada ficha de discípulo recibe un ID consecutivo de 4 dígitos: **0101, 0102, 0103…** (después de 9999 sigue 10000).
- Cada cuenta del panel recibe su propio ID: **ADM-0001, ADM-0002…**, sin importar su rol. Se muestra junto al rol en *Usuarios, roles y permisos* y en *Mi cuenta*, y aparece en el correo de bienvenida.
- Los números salen de la tabla `secuencia_codigo` (migración `024-public-codes.sql`). Se asignan una sola vez, no se pueden elegir ni editar desde la API y nunca se reutilizan, aunque la ficha se archive o la cuenta se elimine.
- Las fichas y cuentas que ya existían se numeraron en orden de creación.
- Se puede buscar por ID: `0105` en Discípulos o `ADM-0003` en Usuarios.
- La columna **ID** de los Excel y de la ficha PDF muestra este código, no el número interno de la base.
- En producción, la cuenta web de MySQL necesita `GRANT SELECT, UPDATE ON defaultdb.secuencia_codigo TO '<cuenta de la app>'@'%';` y la migración debe aplicarse **antes** de publicar el código.
- Prueba: `npm run test:codes` (base temporal, 10 grupos de verificación).

### Códigos de los Grupos de Comunión

- Cada grupo recibe su código automáticamente al crearse: **GR-01, GR-02, GR-03…** (después de GR-99 sigue GR-100). El formulario ya no pide el código y la API ignora el que se envíe; tampoco se puede editar.
- Sale de `secuencia_codigo` (fila `grupo`, migración `027-group-codes.sql`); nunca se reutiliza, aunque el grupo se archive. Si la creación falla, el número no se pierde.
- Al aplicar la migración, **todos los grupos existentes se renumeraron una sola vez** en orden de creación (incluidos los archivados). Las siguientes ejecuciones de la migración no los vuelven a cambiar.
- El código es **interno**: no se muestra en la lista ni en la ficha del grupo, ni en los selectores, el Excel de grupos o el correo de bienvenida. Se conserva en la base de datos (`grupo_comunion.codigo_grupo`) y la API lo devuelve.

### Discípulos de un Grupo de Comunión

- En la ficha del grupo, **Discípulos del grupo** lista a sus integrantes y **Agregar discípulos** permite buscarlos y marcarlos (primero aparecen los que no tienen grupo). Quien ya está en otro grupo pasa a este; cada cambio queda en el historial de grupo del discípulo.
- Requiere `grupos.editar` y `miembros.editar` dentro del alcance del rol (`POST /api/management/groups/:id/members` con `{ids}`).
- **Ver discípulos** abre la lista filtrada por el grupo; si el grupo está vacío, lo indica y ofrece volver al grupo para agregarlos.
- Prueba: `npm run test:group-members` (base temporal; `--ui` para la interfaz).
- La importación de discípulos desde Excel acepta el código nuevo o el nombre del grupo; los códigos anteriores ya no existen.
- Producción: la cuenta web ya tiene `SELECT, UPDATE` sobre `secuencia_codigo`, así que no requiere `GRANT` nuevo. Respaldar Aiven, ejecutar `npm run db:migrate:aiven` y **después** publicar el código.
- Prueba: `npm run test:group-codes` (base temporal).
