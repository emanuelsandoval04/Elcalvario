# Mapa de grupos

**Gestión → Mapa de grupos** (permiso `grupos.ver`).

- Cada Grupo de Comunión tiene su propio color, calculado a partir de su nombre, y es el mismo en el mapa y en la lista.
- El mapa se ajusta para que se vean todos los pines.
- Al tocar un pin o el botón **Ver en el mapa** de una tarjeta, el mapa centra ese grupo. Su pin se agranda y los demás quedan atenuados. Se abre una tarjeta con el nombre del grupo, su discipulador, el número de discípulos y la dirección; al tocarla se abre la ficha del grupo.
- En **Grupos de Comunión**, cada tarjeta de un grupo ubicado tiene **Ver en el mapa** (`#gestion/mapa/grupo/<id>`). La ficha del grupo también lo tiene.

## Ubicación al crear o editar un grupo

El formulario trae un mapa pequeño. Al hacer clic se pone un marcador que se puede arrastrar. La latitud y la longitud van en dos campos ocultos (`latitud` y `longitud`). La dirección escrita es opcional: basta con el punto **o** con la dirección, pero una de las dos es obligatoria. La API lo valida al crear y al editar, y exige que la latitud y la longitud vengan juntas.

El selector **Discipulador** solo muestra a los discipuladores: quien tiene el cargo "Discipuladores" o ya dirige un grupo.

## Discipulador sin cuenta de acceso

En **Registrar discípulo**, los cargos pastorales ven la casilla **Es discipulador**. Al marcarla, la persona recibe el cargo "Discipuladores" (nivel 6) sin cuenta de acceso. Sus datos los ve quien tenga los permisos correspondientes, y sus grupos los gestiona quien tenga `grupos.editar`.

Al editar la ficha se puede marcar o quitar la casilla. Si la persona tiene cuenta, o tiene otro cargo, su cargo se gestiona en **Usuarios y roles**.

## Configuración

Necesita `VITE_GOOGLE_MAPS_API_KEY`, la clave de navegador de Maps JavaScript API restringida por referente a `elcalvario.vercel.app` y `localhost`. La CSP de `vercel.json` ya permite `maps.googleapis.com` y `maps.gstatic.com`.

Verificación: `npm run test:groups-map` y `npm run test:groups-map:ui`. Usan un Google Maps simulado, sin red ni clave.
