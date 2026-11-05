# Despliegue en Aiven y Vercel

React y la API Express se alojan juntos en Vercel. MySQL se aloja en Aiven y exige TLS. El navegador utiliza `/api` en su propio dominio, conservando cookies `HttpOnly`, `Secure` y `SameSite=Strict`. No se necesita Railway ni `API_ORIGIN` para esta configuración.

## 1. Configurar Aiven en el equipo

El archivo privado `.env.aiven.local` está excluido de Git, Docker y Vercel. Completa sus valores con **Connection information** del servicio MySQL de Aiven:

```dotenv
NODE_ENV=production
DB_HOST=tu-servicio.d.aivencloud.com
DB_PORT=puerto_del_servicio
DB_USER=avnadmin
DB_PASSWORD="tu_contraseña"
DB_NAME=defaultdb
DB_SSL=true
DB_SSL_CA_FILE=.secrets/aiven-ca.pem
DB_CONNECTION_LIMIT=2
APP_ORIGINS=https://tu-proyecto.vercel.app
```

Descarga **CA certificate** desde el panel de Aiven y guárdalo en `.secrets/aiven-ca.pem`. Es la CA pública del servicio; no hace falta su clave privada. La aplicación verifica tanto el certificado como el nombre del servidor.

Comprueba la conexión sin escribir datos:

```sh
npm run db:check:aiven
```

Si falla, revisa el host, puerto, contraseña, certificado y las restricciones de red de Aiven. Los valores deben coincidir con el panel; el puerto no tiene por qué ser 3306. No desactives la verificación TLS.

## 2. Conservar los registros actuales

Si Aiven ya contiene tablas, comprueba primero qué datos tiene. No sobrescribas una base existente.

Para trasladar la base local, utiliza MySQL Workbench:

También está disponible `npm run db:transfer:aiven` desde Windows con MySQL Workbench instalado. Genera un respaldo en `.backups/`, comprueba que Aiven esté vacío, importa con TLS y verifica cada tabla mediante hashes de sus registros. Se detiene si el destino ya contiene tablas. Puedes configurar `MYSQLDUMP_PATH` y `MYSQL_CLIENT_PATH` para usar otros ejecutables; no pasa contraseñas como argumentos.

1. En la conexión local, abre **Server → Data Export**, selecciona todas las tablas de `el_calvario`, **Dump Structure and Data** y **Export to Self-Contained File**. Guarda el respaldo en `.backups/`, nunca en `public/` o `src/`.
2. Agrega otra conexión con el host, puerto, usuario y contraseña de Aiven. En **SSL**, selecciona **Require and Verify Identity** y el archivo CA descargado.
3. Importa en el esquema **vacío** `defaultdb` de Aiven mediante **Server → Data Import**. Si el archivo exportado incluye `CREATE DATABASE` o `USE el_calvario`, cambia esas instrucciones en una copia para que apunten a `defaultdb`.
4. Incluye `configuracion_sistema`, `usuario`, roles y sesiones junto con las tablas de gestión; así se conserva el propietario. No registres cuentas nuevas antes de completar la importación.

Después de importar, o directamente para una instalación nueva, ejecuta las migraciones:

```sh
npm run db:migrate:aiven
```

Las migraciones se ejecutan explícitamente antes de publicar; las funciones HTTP y la construcción de Vercel no modifican el esquema. Se incluyen los límites compartidos de solicitudes de la migración 013. Conserva un respaldo antes de aplicar migraciones: MySQL puede confirmar cambios de esquema aunque una instrucción posterior falle.

## 3. Publicar en Vercel

Usa Node.js 24.x. Publica la raíz del proyecto desde un repositorio privado conectado a Vercel, o utiliza Vercel CLI después de iniciar sesión:

```sh
npx vercel login
npx vercel
```

El primer despliegue crea o enlaza el proyecto. Configura las variables antes de promoverlo a producción. Si utilizas el panel, selecciona **Vite**; `vercel.json` ya define el resto:

- Build command: `npm run build:vercel`.
- Output directory: `dist`.
- Install command: `npm ci --include=dev`.
- API: `api/index.js`, una función Node.js que reutiliza Express. La regla interna `/api/:path* → /api` envía también las rutas anidadas a la misma función.
- Archivos públicos: la compilación de Vite; las fotos cargadas por usuarios siguen en MySQL.

No uses la antigua configuración **Other / Build Output API** ni un proxy a Railway. El Dockerfile y `.env.railway.example` se conservan para el despliegue opcional en contenedores; Vercel no los utiliza.

En **Settings → Environment Variables**, configura para **Production** los valores de `.env.vercel.example`:

| Variable | Valor |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Datos del servicio Aiven. |
| `DB_SSL` | `true`. |
| `DB_SSL_CA` | Contenido completo de `aiven-ca.pem`, con sus líneas BEGIN y END. No es una ruta local. |
| `DB_CONNECTION_LIMIT` | `2` conexiones por instancia. |
| `SESSION_HOURS` | `8`, salvo que quieras otra duración. |
| `APP_ORIGINS` | Opcional para dominios personalizados, separados por comas y sin barra final. |
| `VITE_GOOGLE_MAPS_API_KEY` | Opcional; pública y restringida por dominio en Google Cloud. |
| `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`, `FACEBOOK_GRAPH_VERSION`, `FACEBOOK_FALLBACK_VIDEO` | Integración opcional; los tokens son privados de la función. |

Vercel proporciona `NODE_ENV`, `VERCEL_URL` y `VERCEL_PROJECT_PRODUCTION_URL`. Sus dominios propios se permiten automáticamente; no se permiten todos los dominios `*.vercel.app`. Los dominios personalizados adicionales se agregan expresamente a `APP_ORIGINS`. Las variables `DB_*` no llevan prefijo `VITE_`.

Selecciona una región de funciones cercana a Aiven en **Settings → Functions** y mantén activado Fluid Compute. El pool cierra conexiones inactivas y usa la integración oficial `attachDatabasePool`. Ten en cuenta el límite total de conexiones del plan de Aiven: cada instancia puede abrir hasta dos. Los contadores de login y participación se comparten en MySQL.

Para previews, utiliza otro servicio o esquema de pruebas con sus variables de **Preview**. No apuntes previews al esquema real de la iglesia por defecto.

Después de configurar los valores:

```sh
npx vercel --prod
```

Una actualización de variables requiere otro despliegue para aplicarse. Al rotar la contraseña de MySQL, actualízala en Aiven y en `DB_PASSWORD` de Vercel antes del nuevo despliegue. Las contraseñas de los usuarios son hashes en MySQL y se cambian desde el perfil, no mediante esta variable.

## 4. Verificación

Antes de publicar:

```sh
npm run test:unit
npm run test:deploy
npm run test:deploy:integration
npm run build:vercel
```

La integración usa una base y usuario temporales en MySQL local; no modifica la base de la iglesia. El ensayo de construcción no necesita credenciales de Aiven.

En el dominio publicado comprueba:

1. `/api/health` responde `{"status":"ok","database":"connected"}`.
2. Login, recarga de página y logout conservan el comportamiento de sesión.
3. Listados, guardado de perfil, fotos y una exportación PDF y Excel funcionan.

Si importaste los datos, usa una cuenta existente. Si la base es nueva, registra primero al propietario: el primer registro obtiene Superadmin.

Referencias: [funciones Node.js en Vercel](https://vercel.com/docs/functions/runtimes/node-js), [conexiones de base de datos](https://vercel.com/kb/guide/connection-pooling-with-functions), [TLS de Aiven](https://aiven.io/docs/platform/concepts/tls-ssl-certificates).
