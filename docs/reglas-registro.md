# Reglas de los formularios de registro

Aplican al registrar o editar discípulos, a la importación desde Excel y al formulario público "Quiero participar". El navegador avisa antes de enviar y la API lo vuelve a comprobar (`server/contact-rules.js` y `src/contact-rules.ts`, con las mismas reglas).

- **Celular** (y celular de emergencia): exactamente **10 dígitos**. Se aceptan espacios, guiones, paréntesis y el prefijo `+57`; se guarda solo con los 10 dígitos.
- **Correo** del discípulo: solo proveedores conocidos: Gmail, Hotmail, Outlook, Live, MSN, Yahoo, iCloud, AOL, Proton, Zoho, GMX, Mail.com y Yandex. La lista está en `emailDomains`.
- **Fecha de nacimiento**: no puede ser futura y la edad máxima es **99 años** (hoy, 12 de noviembre de 2026, la fecha más antigua aceptada es el 13 de noviembre de 1926).

Las fichas antiguas que no cumplan estas reglas se conservan. Al editar una de ellas, hay que corregir esos datos para poder guardar.

Fuera de alcance por ahora: la creación de cuentas en **Usuarios y roles** y el inicio de sesión siguen aceptando cualquier correo válido.

Verificación: `npm run test:registration-rules` y `npm run test:training:ui` (avisos en el formulario).

El registro de discípulos ya no tiene **Tipo de registro**: ahí solo se registran discípulos. Las cuentas de administración se crean en **Usuarios y roles**.
