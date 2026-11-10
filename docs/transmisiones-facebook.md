# Transmisiones de Facebook (módulo Multimedia)

El módulo **Transmisiones** del panel (`#gestion/transmisiones`) permite al equipo de Multimedia decidir qué video de Facebook aparece en la sección "Transmisiones" de la página pública. Funciona de dos formas:

| Modo | Qué muestra la web | Qué necesita |
| --- | --- | --- |
| **Automático** | El en vivo actual. Si no hay, la última transmisión grabada. Se consulta a Meta cada minuto. | ID de la página y token de Meta |
| **Video fijo (manual)** | Siempre el video que se pegue en el panel | Solo el enlace o el código de "Insertar" |

En modo automático, el video manual sirve de respaldo si Meta no responde o el token vence.

**Quién lo puede usar:** los roles **Multimedia** y **Administrador** (permiso `transmisiones.gestionar`). El Administrador puede dárselo a otro rol en *Usuarios, roles y permisos*.

---

## Opción rápida: video fijo (sin API)

1. En Facebook, abre la transmisión → botón **⋯** → **Insertar**.
2. Copia el código completo (`<iframe src="https://www.facebook.com/plugins/video.php?...`).
3. En el panel: **Transmisiones** → **Video fijo (manual)** → pega el código en *Video que se muestra* → **Guardar configuración**.

El panel acepta el código de insertar, enlaces `www.facebook.com`, `web.facebook.com`, `m.facebook.com`, `/watch?v=` y `/reel/`. Todo se convierte a un enlace normal de `www.facebook.com`.

---

## Opción automática: API de Meta, paso a paso

### 1. Requisitos
- Una cuenta personal de Facebook que sea **administradora** de la página de la iglesia (Página → Configuración → Acceso a la página).

### 2. Cuenta de desarrollador
- Entra a <https://developers.facebook.com/> → **Comenzar** y verifica la cuenta (teléfono o correo).

### 3. Crear la app
- **Mis apps** → **Crear app** → tipo **Empresa** (u **Otro**) → nombre, por ejemplo, "Web El Calvario".
- La app puede quedarse en **modo desarrollo**: solo leerá la página de la que eres administrador.

### 4. Generar el token
1. Abre el **Graph API Explorer**: <https://developers.facebook.com/tools/explorer/>.
2. En *Meta App* elige tu app.
3. En *Permisos* agrega `pages_show_list`, `pages_read_engagement` y `pages_read_user_content`.
4. Pulsa **Generate Access Token** y acepta. En *Usuario o página* elige la **página de la iglesia**.

### 5. Hacerlo de larga duración (para que no venza)
1. Copia el token y pégalo en el **Depurador de tokens**: <https://developers.facebook.com/tools/debug/accesstoken/> → **Extender token de acceso**.
2. Con ese token largo, vuelve al Explorer y consulta `me/accounts`.
3. En la respuesta busca la página de la iglesia: su `id` es el **ID de la página** y su `access_token` es el **token de página**. Un token de página obtenido así **no vence**, salvo que cambies tu contraseña o quites el acceso de la app.

### 6. Clave de cifrado (solo la primera vez; la hace el administrador)
El token se guarda **cifrado** (AES-256-GCM) en la base de datos. Para eso el servidor necesita una clave:

1. Generar un texto aleatorio de 32 caracteres o más, por ejemplo con: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
2. Vercel → proyecto → **Settings → Environment Variables** → agregar `TRANSMISSION_SECRET_KEY` con ese valor (Production) → **Redeploy**.
3. En local, agregar la misma línea al archivo `.env`.

Si se cambia o se pierde esta clave, el token guardado deja de servir y hay que volver a pegarlo (paso 7).

### 7. Pegar los datos en el panel
- **Transmisiones** → **Automático con la API de Meta**.
- *ID de la página*, *Versión de la API Graph* (la que muestra el Explorer, por ejemplo `v23.0`) y *Token de acceso de la página*.
- Opcional: un *video de respaldo*.
- **Guardar configuración**.

### 8. Probar
- Pulsa **Probar conexión y ver últimas transmisiones**. Deben aparecer los últimos videos, con el en vivo primero.
- Con **Fijar este** cualquiera de ellos pasa a ser el video fijo.
- La página pública se actualiza en menos de un minuto (hay caché de 60 s).

---

## Mensajes de error frecuentes

| Mensaje | Qué hacer |
| --- | --- |
| *El token de Meta venció o no es válido* | Repetir los pasos 4 y 5 y pegar el token nuevo |
| *El token no tiene permiso para leer los videos* | Volver a generarlo con los tres permisos del paso 4 y elegir la página, no el usuario |
| *Meta no encontró la página* | Revisar el ID (paso 5, `me/accounts`) |
| *Falta configurar TRANSMISSION_SECRET_KEY* | Paso 6 |
| *Falta aplicar la migración 023* | El administrador ejecuta `npm run db:migrate` (local) o `npm run db:migrate:aiven` (producción) |

## Seguridad

- El token **nunca** vuelve al navegador: el panel solo muestra sus últimos 4 caracteres.
- Se envía a Meta en la cabecera `Authorization`, no en la URL, y no se escribe en logs.
- De las respuestas de error de Meta solo se lee el código numérico.
- Los enlaces de video se validan: solo se aceptan dominios de Facebook con HTTPS.
- Guardar exige sesión, el permiso `transmisiones.gestionar` y la misma protección de origen que el resto del panel. Cada cambio queda en la auditoría.
- Las variables `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`, `FACEBOOK_GRAPH_VERSION` y `FACEBOOK_FALLBACK_VIDEO` siguen funcionando como respaldo si el panel no tiene datos.

## Archivos

- `server/migrations/023-facebook-transmissions.sql`: permiso y tabla `configuracion_transmision`.
- `server/facebook.js`: cifrado, validación de enlaces, consulta a Meta y caché.
- `server/transmission-settings.js`: rutas `GET/PUT /api/management/transmission/settings` y `POST /api/management/transmission/test`.
- `src/Transmissions.tsx`: pantalla del panel con el paso a paso.
- `checks/facebook.test.mjs`: pruebas (`npm run test:unit`).
