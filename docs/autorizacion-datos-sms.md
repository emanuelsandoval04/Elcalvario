# Autorización de datos por SMS (Firebase Phone Auth)

Reemplaza la "Autorización y ficha firmada": ya no se descarga un PDF ni se suben páginas firmadas.

## Uso

1. **Discípulos → Ver ficha → Autorización de tratamiento de datos**.
2. El responsable le lee a la persona el texto que aparece en pantalla:
   > Al dictar el código que recibe por SMS, la persona acepta que la Iglesia El Calvario trate sus datos personales según la Ley 1581 de 2012.
3. **Enviar código por SMS al \*\*\* \*\*\* 4567**. Google (Firebase) envía el SMS al celular de la ficha.
4. La persona dicta el código, el responsable lo escribe y toca **Confirmar autorización**.
5. Firebase comprueba el código y le da al navegador un token firmado por Google. El servidor verifica ese token: proyecto correcto, ingreso por teléfono, mismo celular de la ficha, hecho hace menos de 10 minutos y sin usar antes. Luego registra la autorización con fecha, celular, quién la registró y el texto leído.

El texto del SMS lo pone Firebase y no se puede personalizar. Llega en español porque se pide así; algo como "123456 es tu código de verificación para <dominio de la app>". Por eso el texto de la autorización se lee en pantalla.

Las fichas firmadas subidas antes siguen en el **Historial de autorizaciones** y se pueden descargar. Para enviar, confirmar y revocar se necesita el permiso `consentimientos.gestionar`, con su alcance.

Solo celulares colombianos de 10 dígitos que empiezan por 3. Un número fijo no puede recibir el SMS.

## Configuración en Firebase (una vez)

1. [console.firebase.google.com](https://console.firebase.google.com) → crear o abrir el proyecto.
2. **Authentication → Sign-in method → Teléfono → Habilitar**.
3. **Authentication → Configuración → Política de región de SMS**: elegir *Permitir* y marcar **Colombia**. Sin esto Firebase responde "SMS unable to be sent until this region enabled".
4. **Authentication → Settings → Authorized domains**: agregar `elcalvario.vercel.app`. `localhost` viene incluido; para probar en `127.0.0.1`, agregarlo también.
5. **Configuración del proyecto → Tus apps → Web (</>)**: registrar la app y copiar `apiKey`, `authDomain`, `projectId` y `appId`.
6. **Plan:** para enviar SMS reales Firebase pide el plan **Blaze** (facturación activa), y cada SMS a Colombia tiene costo. Sin facturación se pueden usar los **números de prueba** (Authentication → Sign-in method → Teléfono → *Números de teléfono para pruebas*), con un código fijo y sin SMS real.

## Variables

| Variable | Dónde | Valor |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY` | navegador (público) | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | navegador | `authDomain` (por ejemplo `mi-proyecto.firebaseapp.com`) |
| `VITE_FIREBASE_PROJECT_ID` | navegador | `projectId` |
| `VITE_FIREBASE_APP_ID` | navegador | `appId` |
| `FIREBASE_PROJECT_ID` | servidor | el mismo `projectId` |

Las `VITE_*` se incorporan al compilar: en Vercel hay que agregarlas **antes** de publicar. Son datos públicos de Firebase, no secretos. El servidor no necesita llaves privadas, porque verifica con las llaves públicas de Google.

La CSP de `vercel.json` permite reCAPTCHA (`www.google.com`, `www.gstatic.com`, `apis.google.com`) y el marco de `*.firebaseapp.com`. Si `authDomain` es un dominio propio, agrégalo a `frame-src`.

## Producción (una sola vez)

1. Respaldar Aiven y ejecutar `npm run db:migrate:aiven`. Esto aplica `029-phone-consent.sql`, que agrega `sms` al medio y crea `verificacion_consentimiento_telefono`.
2. `GRANT SELECT, INSERT ON defaultdb.verificacion_consentimiento_telefono TO '<cuenta de la app>'@'%';`
3. Agregar las variables en Vercel y publicar el código **después** de la migración.

## API (`/api/management`)

| Ruta | Uso |
| --- | --- |
| `GET /members/:id/consents` | Estado, historial, `phoneReady`, celular (enmascarado y completo para quien gestiona) y texto de autorización |
| `POST /members/:id/consents/phone` | `{idToken}` de Firebase → registra la autorización |
| `POST /members/:id/consents/:id/revoke` | Revocación |
| `GET /members/:id/consents/:documentId/file` | Descarga una ficha firmada anterior (requiere también `miembros.sensibles`) |

Verificación: `npm run test:consent` y `npm run test:consent:ui`. Usan llaves locales y un doble de Firebase que solo existe en desarrollo, así que nunca envían SMS reales.
