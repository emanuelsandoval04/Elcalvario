import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const source = await readFile(resolve(root, 'docs/documentacion-completa-plataforma.md'), 'utf8')
const logo = await readFile(resolve(root, 'public/media/logo-wide.webp'))
const browserTools = pathToFileURL(resolve(root, '.secrets/browser-tools/node_modules/playwright-core/index.mjs')).href
const { chromium } = await import(browserTools)

const currentGuide = `
# Guía de funcionamiento vigente

**Fecha de corte: 8 de noviembre de 2026**  
Esta guía describe el código y las funciones documentadas en el repositorio en esa fecha. La especificación académica que sigue conserva requisitos, diagramas y decisiones de diseño del proyecto; cuando difiera de esta guía, prevalece esta actualización para describir el funcionamiento actual.

## Qué es la plataforma

**El Calvario – Mi comunidad** integra el sitio público de la iglesia con un panel privado de gestión. El panel centraliza fichas de discípulos, cuentas y perfiles de acceso, grupos familiares, cobertura por barrios, actividades, asistencia, alertas y reportes. Funciona en computadores y teléfonos; puede instalarse como aplicación web progresiva (PWA).

El sistema se organiza en tres partes: una interfaz React y TypeScript que funciona en el navegador; una API Node.js y Express que autentica cada solicitud y aplica reglas de negocio; y una base de datos MySQL que conserva cuentas, registros, relaciones e historial. La interfaz se sirve desde el mismo dominio que la API en el despliegue Vercel documentado. La base desplegada utiliza Aiven con TLS. Este PDF documenta el estado del código y la configuración; por sí solo no certifica que cada servicio externo esté conectado o que cada cambio local esté publicado.

## Recorrido habitual de uso

1. El visitante consulta información pública, eventos, ministerios y horarios, o envía una solicitud de participación.
2. La administración crea la cuenta inicial desde el servidor. Después, las cuentas se crean o habilitan desde **Usuarios, roles y permisos** por alguien con la autoridad correspondiente. No hay registro público abierto.
3. La persona inicia sesión con correo y contraseña. El servidor crea una sesión protegida. La cuenta activa solo ve módulos permitidos; una cuenta pendiente recibe el aviso de activación.
4. Los usuarios autorizados mantienen discípulos y grupos, programan actividades y registran asistencia. El sistema recalcula alertas cuando cambian los registros relevantes.
5. Quien tiene permiso exporta informes PDF o Excel. Los datos privados y la API no se almacenan en la caché sin conexión de la PWA.

## Secciones y trabajo que permiten

| Sección | Uso principal |
| --- | --- |
| Sitio público | Consultar información institucional, horarios, grupos, ministerios y eventos publicados; acceder a contacto y participación. |
| Mi comunidad | Resumen de datos y accesos habilitados para la cuenta actual. |
| Discípulos | Buscar, registrar y mantener fichas; consultar historial, ministerios y consentimiento conforme a permisos. |
| Grupos de Comunión | Administrar grupos, responsables, barrios y procesos de multiplicación o apertura. |
| Mapa | Consultar cobertura pastoral en mapa o lista y administrar asignaciones autorizadas. |
| Eventos y Cultos | Gestionar cultos, eventos especiales y reuniones de grupo; publicar actividades públicas y programar recurrencias. |
| Asistencia y alertas | Tomar o corregir asistencia manual, por QR o para visitantes; revisar alertas vigentes por ausencias consecutivas. |
| Reportes | Descargar reportes autorizados en PDF o Excel, con presentación organizada e identidad visual de la iglesia. |
| Usuarios, roles y permisos | Administrar cuentas y asignación de roles en la misma sección donde se configuran permisos de cada perfil. |
| Mi cuenta y notificaciones | Mantener datos de la propia cuenta, foto, contraseña, sesiones, tamaño de interfaz y avisos disponibles. |
| Adiestramiento | Consultar el catálogo de formación y las funciones que el perfil tenga habilitadas. |

## Usuarios, roles y permisos en una sola sección

La navegación tiene una entrada **Usuarios, roles y permisos**. En escritorio, la lista de cuentas y el editor del perfil elegido aparecen lado a lado. En cada fila de cuenta se puede abrir **Permisos del perfil** junto a la asignación. En teléfonos se cambia entre la vista de usuarios y la de perfiles.

La asignación de un rol a una cuenta y la edición de permisos son operaciones diferentes. Elegir un rol requiere guardar la cuenta; editar un permiso cambia el perfil entero y afecta a todas las cuentas que tienen ese rol. Los alcances disponibles dependen del permiso: sin acceso, todos los registros autorizados o grupos a cargo. El editor conserva el borrador si falla el guardado y detecta si otro administrador cambió el perfil antes, para evitar sobrescribir ese cambio.

Administrar cuentas requiere \`usuarios.gestionar\` y la autoridad necesaria; editar perfiles requiere \`gestion.acceder\` y \`permisos.gestionar\`. Por eso una persona que solo edita permisos no obtiene la lista de usuarios. Los perfiles protegidos no se pueden alterar desde la interfaz; las restricciones y el alcance de Discipulador también se validan en el servidor. Los cambios guardados se aplican a sesiones abiertas al revalidar permisos.

Las direcciones anteriores \`/#gestion/users\` y \`/#gestion/permissions\` siguen enviando al área unificada. La ruta \`/#usuarios/perfiles/:id\` abre directamente el perfil solicitado, si la cuenta tiene autorización.

## Datos, privacidad y decisiones automáticas

- Una ficha de discípulo y una cuenta de acceso son entidades separadas; una persona puede estar vinculada a una cuenta cuando corresponde. El alta administrativa puede crear la ficha y la cuenta vinculada dentro de una transacción.
- Los datos de salud y emergencia requieren \`miembros.sensibles\`. El servidor limita también su consulta; ocultarlos en la interfaz no es la única protección.
- Los cambios de grupo y cobertura guardan historial. Los registros archivados conservan relaciones necesarias para la trazabilidad.
- La asistencia admite presente, ausente, justificado y visitante. Una asistencia de miembro no se duplica para la misma actividad; las correcciones tienen una operación separada.
- Al acumular dos ausencias consecutivas en actividades realizadas, el sistema genera una alerta vigente. Cancelaciones, cambios de fecha y correcciones pueden recalcular las alertas implicadas.
- La plataforma guarda evidencia de consentimiento de datos. La operación de registro y la política institucional de retención deben seguir las instrucciones aprobadas por la iglesia.

## Funciones añadidas a la especificación inicial

El repositorio actual incorpora funciones posteriores a la línea base académica: notificaciones de cuenta; recuperación de contraseña por correo cuando se configura el proveedor; sesiones y auditoría de seguridad; eventos recurrentes; herramientas y listados de asistencia histórica; consentimiento y carga de fichas firmadas; importación de discípulos; catálogo de adiestramiento; y mejoras de presentación de exportaciones. Su disponibilidad concreta depende de permisos, migraciones, variables y servicios configurados.

La PWA almacena los recursos de interfaz y puede mostrar una pantalla de reconexión. Las consultas y escrituras requieren internet: no existe una cola para sincronizar cambios hechos sin conexión. El mapa requiere una clave válida de Google Maps para la vista cartográfica; la lista permite consultar datos aunque el mapa no cargue. El directo automático de Facebook y el correo dependen de credenciales externas configuradas en servidor.

## Instalación, actualización y operación

Se requiere Node.js 24.x para el proyecto actual, MySQL 8.4 LTS y variables de entorno acordes con el entorno. En desarrollo se instala dependencias, se configura \`.env\`, se prepara la base y se aplican las migraciones con \`npm run db:init\` y \`npm run db:migrate\`; después se usa \`npm run dev\`. Las migraciones del repositorio van de \`001\` a \`019\` y se aplican con el ejecutor, que lleva registro de las ya aplicadas. Antes de una actualización de base se debe generar un respaldo. Nunca se deben copiar credenciales al navegador ni a archivos versionados.

En el despliegue documentado, Vercel sirve la web y la API, y Aiven aloja MySQL con TLS. Las migraciones se ejecutan explícitamente con credenciales administrativas antes de publicar; la función web no altera el esquema. La cuenta de la aplicación debe tener solo los permisos de base necesarios. El detalle de variables y pasos está en el capítulo de despliegue y en \`docs/despliegue.md\`.

## Guías operativas incluidas en el proyecto

El documento de referencia de esta publicación está acompañado por guías especializadas en seguridad, despliegue, rendimiento, exportaciones, mapa, adiestramiento, recuperación de contraseña, eventos recurrentes, importación, asistencia histórica, herramientas comunitarias, fichas firmadas, correos de cuentas y usuarios/roles/permisos. Las pruebas automatizadas disponibles están descritas en la sección 12; ejecutarlas es una acción de mantenimiento independiente de la lectura de este manual.

## Convenciones de lectura

Los permisos se comprueban en la API además de controlar lo que la interfaz muestra. \`Todos\` se refiere al alcance permitido por las reglas del rol y la operación; no significa acceso a datos sensibles sin el permiso específico. Los identificadores \`miembros.*\`, \`grupos.*\`, \`eventos.*\` y similares son códigos técnicos usados por la autorización. Los nombres de rutas con \`#\` son vistas de la aplicación y no endpoints de servidor.
`

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function inline(value) {
  return escapeHtml(value)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

function markdownToHtml(markdown) {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n')
  const out = []
  let i = 0
  let list = ''
  let inCode = false
  let code = []
  const closeList = () => { if (list) { out.push(`</${list}>`); list = '' } }

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim().startsWith('```')) {
      closeList()
      if (inCode) { out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = []; inCode = false }
      else inCode = true
      i++
      continue
    }
    if (inCode) { code.push(line); i++; continue }
    if (!line.trim()) { closeList(); i++; continue }
    if (/^\|.*\|\s*$/.test(line)) {
      closeList()
      const rows = []
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
        const cells = lines[i].trim().slice(1, -1).split('|').map(c => c.trim())
        if (!cells.every(c => /^:?-{3,}:?$/.test(c))) rows.push(cells)
        i++
      }
      if (rows.length) {
        const [header, ...body] = rows
        out.push('<table><thead><tr>' + header.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>')
        for (const row of body) out.push('<tr>' + header.map((_, n) => `<td>${inline(row[n] || '')}</td>`).join('') + '</tr>')
        out.push('</tbody></table>')
      }
      continue
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    if (heading) {
      closeList()
      const level = heading[1].length
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      i++
      continue
    }
    if (/^\s*---+\s*$/.test(line)) { closeList(); out.push('<hr>'); i++; continue }
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line)
    const ordered = /^\s*\d+\.\s+(.+)$/.exec(line)
    if (bullet || ordered) {
      const tag = bullet ? 'ul' : 'ol'
      if (list && list !== tag) closeList()
      if (!list) { list = tag; out.push(`<${list}>`) }
      out.push(`<li>${inline((bullet || ordered)[1])}</li>`)
      i++
      continue
    }
    if (/^\s*\|/.test(line)) { i++; continue }
    closeList()
    const paragraph = [line.trim()]
    i++
    while (i < lines.length && lines[i].trim() && !/^(#{1,6})\s|^\s*[-*]\s|^\s*\d+\.\s|^\|.*\|\s*$|^```/.test(lines[i])) {
      paragraph.push(lines[i].trim())
      i++
    }
    out.push(`<p>${inline(paragraph.join(' '))}</p>`)
  }
  closeList()
  if (inCode) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
  return out.join('\n')
}

const content = markdownToHtml(`${currentGuide}\n\n---\n\n${source}`)
const logoUri = `data:image/webp;base64,${logo.toString('base64')}`
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Documentación completa — El Calvario</title><style>
@page { size: A4; margin: 19mm 17mm 20mm; }
@page:first { margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; color: #1d2939; font: 10pt/1.55 Arial, sans-serif; }
.cover { height: 297mm; display: flex; flex-direction: column; justify-content: center; padding: 25mm 24mm; color: #fff; background: linear-gradient(155deg,#101e38 0%,#1c3853 62%,#986b42 160%); page-break-after: always; }
.cover img { width: 220px; max-height: 120px; padding: 7px; object-fit: contain; object-position: left center; background: #fff; border-radius: 8px; filter: drop-shadow(0 4px 12px #0003); }
.cover .eyebrow { margin-top: 48mm; color: #e5c79e; font-size: 11pt; letter-spacing: 2px; text-transform: uppercase; }
.cover h1 { max-width: 160mm; margin: 8mm 0 5mm; color: white; font-size: 33pt; line-height: 1.12; }
.cover p { color: #e6edf5; font-size: 14pt; }
.cover .rule { width: 26mm; height: 2px; margin: 8mm 0; background: #d0ad7b; }
.cover .meta { margin-top: auto; color: #dce5ee; font-size: 10pt; }
main { padding: 0; }
h1,h2,h3,h4 { color: #173350; line-height: 1.2; page-break-after: avoid; }
h1 { margin: 0 0 10pt; font-size: 24pt; }
h2 { margin: 25pt 0 9pt; padding-bottom: 5pt; border-bottom: 1px solid #d8e2ea; font-size: 17pt; }
h3 { margin: 17pt 0 6pt; font-size: 12.5pt; }
h4 { margin: 12pt 0 5pt; font-size: 11pt; }
p { margin: 5pt 0 8pt; orphans: 3; widows: 3; }
strong { color: #1b334c; }
a { color: #226b8e; text-decoration: none; }
ul,ol { margin: 4pt 0 9pt; padding-left: 20pt; }
li { margin: 2pt 0; }
table { width: 100%; margin: 8pt 0 13pt; border-collapse: collapse; font-size: 8pt; line-height: 1.35; page-break-inside: auto; }
tr { page-break-inside: avoid; }
th { color: #fff; background: #183650; font-weight: bold; text-align: left; }
th,td { padding: 5pt 6pt; vertical-align: top; border: 1px solid #d4dde5; overflow-wrap: anywhere; }
tbody tr:nth-child(even) { background: #f2f6f9; }
pre { margin: 8pt 0 12pt; padding: 10pt; white-space: pre-wrap; overflow-wrap: anywhere; color: #e8eef5; background: #1a2b3c; border-radius: 5px; font: 7.5pt/1.4 Consolas, monospace; page-break-inside: avoid; }
code { padding: 1pt 3pt; color: #875530; background: #f1eee9; border-radius: 3px; font: 8.5pt Consolas, monospace; overflow-wrap: anywhere; }
pre code { padding: 0; color: inherit; background: none; }
hr { margin: 20pt 0; border: 0; border-top: 2px solid #d7e1e8; }
</style></head><body><section class="cover"><img src="${logoUri}" alt="Iglesia El Calvario"><div class="eyebrow">Manual de usuario y documentación técnica</div><h1>El Calvario<br>Mi comunidad</h1><div class="rule"></div><p>Funcionamiento, módulos, roles, datos, seguridad y operación de la plataforma</p><div class="meta">Documento consolidado del proyecto<br>Fecha de corte: 8 de noviembre de 2026</div></section><main>${content}</main></body></html>`

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'load' })
  const outputPath = resolve(root, 'docs/Documentacion_Completa_Plataforma_El_Calvario.pdf')
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<div style="width:100%;padding:0 17mm;color:#748294;font:8px Arial">EL CALVARIO · MI COMUNIDAD</div>',
    footerTemplate: '<div style="width:100%;padding:0 17mm;color:#748294;font:8px Arial;display:flex;justify-content:space-between"><span>Documentación de la plataforma · 08/11/2026</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    margin: { top: '19mm', right: '17mm', bottom: '20mm', left: '17mm' },
  })
  console.log(outputPath)
} finally {
  await browser.close()
}
