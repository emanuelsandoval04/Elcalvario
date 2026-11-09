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
