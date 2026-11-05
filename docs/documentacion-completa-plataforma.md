# Sistema de Información de Gestión Web – "El Calvario – Mi comunidad"
**Equipo de Desarrollo: Nexus Corp**

Erick B. Lesmes A.  
Carlos E. Sandoval P.  
Juan J. Ospina B.  
Kennet S. Gutierrez R.  

Ingeniería de Software · Gestión de la Información · Ingeniería de Sistemas  
Universidad Cooperativa de Colombia – Bloque Principal  
Docentes: Francy Y. Patiño M. · Mayra A. Amador L.  
Villavicencio · 03/11/2026

---

## Tabla de contenido

1. [Introducción, Planteamiento del Problema, Justificación, Objetivos, Marco Referencial y Metodología](#1-introducción-planteamiento-objetivos-marco-referencial-y-metodología)
2. [Arquitectura y Tecnologías de la Plataforma](#2-arquitectura-y-tecnologías-de-la-plataforma)
3. [Funcionamiento de la Plataforma por Módulo (14 Módulos)](#3-funcionamiento-de-la-plataforma-por-módulo)
4. [Actores, Roles y Permisos (Jerarquía Pastoral de 6 Niveles y Matriz RBAC)](#4-actores-roles-y-permisos)
5. [Requisitos Funcionales (70 Requisitos con Prioridad)](#5-requisitos-funcionales-70-requisitos-con-prioridad)
6. [Requisitos No Funcionales (48 Requisitos en 8 Categorías)](#6-requisitos-no-funcionales-48-requisitos-en-8-categorías)
7. [Reglas de Negocio (20 Reglas Confirmadas)](#7-reglas-de-negocio-20-reglas-confirmadas)
8. [Modelo de Datos (Diagrama Entidad–Relación, Diccionario de 26 Tablas y 12 Migraciones)](#8-modelo-de-datos)
9. [Especificación Completa de Endpoints de la API REST](#9-especificación-completa-de-endpoints-de-la-api-rest)
10. [Casos de Uso Principales (7 Casos de Uso Detallados)](#10-casos-de-uso-principales-7-casos-de-uso)
11. [Cómo Instalar, Configurar y Publicar la Plataforma](#11-cómo-instalar-configurar-y-publicar-la-plataforma)
12. [Pruebas Automatizadas y Verificación del Sistema](#12-pruebas-automatizadas-y-verificación-del-sistema)
13. [Limitaciones Conocidas y Aspectos Pendientes](#13-limitaciones-conocidas-y-aspectos-pendientes)
14. [Glosario de Términos](#14-glosario-de-términos)
15. [Referencias Bibliográficas](#15-referencias-bibliográficas)

---

## 1. Introducción, Planteamiento, Objetivos, Marco Referencial y Metodología

### 1.1. Introducción

La gestión organizada de la información es un elemento esencial para las organizaciones que requieren registrar, consultar y actualizar datos de manera oportuna. En el caso de una iglesia, además de la información básica de sus integrantes, se administran procesos relacionados con roles eclesiásticos, grupos de comunión, ministerios, actividades, asistencia y seguimiento pastoral. Cuando estos datos se encuentran dispersos en hojas de cálculo, cuadernos u otros medios no integrados, aumenta la posibilidad de duplicidad, pérdida de trazabilidad y dificultades para consultar información actualizada.

A partir de esta necesidad, Nexus Corp desarrolla un Sistema de Información de Gestión Web destinado exclusivamente a la Misión Cristiana El Calvario, sede Villavicencio. La propuesta integra una página pública de carácter informativo y una interfaz privada de gestión ("El Calvario – Mi comunidad") a la que se accede mediante inicio de sesión. La parte pública presenta información institucional, horarios, ministerios, grupos de comunión, eventos, transmisiones en vivo, datos de contacto y formulario de participación; la parte administrativa está orientada al manejo de discípulos, usuarios, roles, permisos, grupos de comunión, mapa de cobertura pastoral por barrios, ministerios, actividades, asistencia, alertas por ausencias, consentimientos y reportes en PDF y Excel.

La arquitectura del proyecto contempla la separación entre frontend, backend y persistencia de datos. Para el almacenamiento relacional se adoptó MySQL Server 8.4.11 LTS, sustituyendo la propuesta inicial basada en Supabase/PostgreSQL. Esta decisión permite trabajar con un motor relacional de soporte prolongado, tablas normalizadas, claves foráneas, restricciones, índices y consultas SQL. La documentación oficial de MySQL establece que la serie 8.4 corresponde a la línea LTS y está orientada a escenarios que requieren estabilidad y soporte de largo plazo (Oracle, 2026). El desarrollo se organiza con Scrum, utilizando ciclos iterativos para analizar requisitos, diseñar la base de datos, construir interfaces, implementar módulos y validar avances de manera progresiva (Schwaber & Sutherland, 2020).

### 1.2. Planteamiento del problema y justificación

La Misión Cristiana El Calvario, sede Villavicencio, desarrolla procesos que requieren registrar y relacionar información de miembros (discípulos), responsables pastorales, grupos de comunión, cobertura territorial por barrios, ministerios, actividades y asistencias. Cuando estos registros se administran en medios separados, es más difícil verificar si una persona ya existe, mantener sus datos actualizados, identificar su participación actual, conservar el historial de cambios o controlar qué usuarios pueden consultar o modificar información sensible.

El proyecto se justifica por la necesidad de contar con una herramienta propia, diseñada para los procesos reales de la iglesia. La plataforma separa adecuadamente la información pública de la información de gestión y cumple con las disposiciones de la Ley 1581 de 2012 sobre protección de datos personales en Colombia (Congreso de Colombia, 2012), registrando la evidencia de consentimiento para el tratamiento de datos personales y religiosos y aislando los datos médicos y de emergencia mediante permisos específicos.

### 1.3. Objetivos

- **Objetivo general:** Desarrollar un sistema de información web para la Misión Cristiana El Calvario Villavicencio que integre una página pública informativa y una interfaz privada de gestión, mediante una arquitectura separada en frontend, backend y base de datos MySQL, con el fin de centralizar, organizar y facilitar la administración segura de miembros, roles, ministerios, grupos de comunión, cobertura territorial, actividades, asistencias y procesos de seguimiento de la iglesia.
- **Objetivos específicos:**
  - Analizar los procesos actuales de la iglesia y validar con sus responsables la información, los roles, los flujos de trabajo y las necesidades que debe cubrir la plataforma.
  - Diseñar y mantener un modelo de datos relacional que represente miembros, usuarios, roles, barrios y cobertura pastoral, grupos de comunión, ministerios, actividades, asistencias, alertas y consentimientos, reduciendo la duplicidad de información.
  - Desarrollar una interfaz pública que comunique la identidad de la iglesia y permita consultar información institucional, horarios, ministerios, grupos de comunión, eventos, transmisiones, ubicación y medios de contacto.
  - Desarrollar una interfaz administrativa independiente e instalable (PWA), accesible mediante autenticación, que permita gestionar la información según los permisos asignados a cada usuario.
  - Implementar la persistencia del sistema en MySQL Server 8.4.11 LTS y preparar scripts SQL de migración que faciliten la instalación, respaldo, entrega y continuidad técnica del proyecto.
  - Implementar y validar funciones de gestión de miembros, grupos, mapa de cobertura, ministerios, actividades, asistencia, alertas y reportes, de acuerdo con los requerimientos priorizados con la iglesia.
  - Aplicar Scrum para organizar el trabajo de Nexus Corp en sprints, realizar revisiones periódicas y ajustar el producto con base en la retroalimentación obtenida.
  - Realizar pruebas funcionales, unitarias y de integración sobre los módulos desarrollados para verificar el correcto registro, consulta, actualización y relación de la información.

### 1.4. Marco referencial y legal

- **Estado del arte:** Soluciones como Planning Center y ChurchTrac evidencian la necesidad de centralizar personas, grupos y asistencia (Planning Center, 2026; ChurchTrac, 2026). El proyecto de Nexus Corp se diferencia por adaptarse de forma exclusiva a la jerarquía pastoral, reglas de negocio y territorialidad en Villavicencio de la Misión Cristiana El Calvario.
- **Marco legal:**
  - **Ley 1581 de 2012:** Protección de datos personales y sensibles (salud y participación religiosa), implementada mediante la tabla `consentimiento_datos` y el permiso `miembros.sensibles` (Congreso de Colombia, 2012).
  - **Ley 1273 de 2009:** Protección de la información y los datos frente a accesos no autorizados, implementada mediante hashing `scrypt`, sesiones SHA-256, validación de origen CSRF y consultas parametrizadas (Congreso de Colombia, 2009).
  - **Ley 23 de 1982:** Derechos de autor sobre software, imágenes, librerías y fuentes cartográficas documentadas (Congreso de Colombia, 1982).

### 1.5. Metodología, técnicas de recolección y cronograma

| Técnica | Instrumento | Participantes / fuente | Propósito |
| --- | --- | --- | --- |
| Entrevista semiestructurada | Guía de preguntas | Pastor, líderes, discipuladores y persona administradora | Conocer procesos, responsabilidades, datos requeridos, permisos, necesidades y problemas actuales. |
| Observación directa | Formato de observación y notas de campo | Procesos de registro, consulta, asistencia y organización de grupos | Identificar pasos reales, tareas repetitivas, medios utilizados y situaciones no mencionadas durante la entrevista. |
| Revisión documental | Matriz de revisión | Formatos, listados, hojas de cálculo, registros y documentos autorizados por la iglesia | Identificar campos utilizados, términos internos, relaciones y necesidades de migración o conservación de información. |
| Validación de prototipos | Lista de comprobación y registro de observaciones | Futuro administrador y usuarios representativos | Comprobar que la interfaz, los formularios y los flujos sean comprensibles antes de cerrar cada módulo. |
| Prueba de tareas | Guion de tareas y pruebas automatizadas | Administrador o responsable del proceso | Solicitar tareas como registrar un miembro, crear un grupo, registrar asistencia, publicar un evento y consultar ausencias. |

| Semanas | Actividad principal | Entregable | Estado del avance |
| --- | --- | --- | --- |
| 1–2 | Levantamiento inicial de información y definición del alcance | Requisitos iniciales y estructura del proyecto | Realizado |
| 3–4 | Revisión del modelo de datos, autenticación y organización de roles | MER actualizado, estructura relacional y migraciones 001–003 | Realizado |
| 5–6 | Diseño y desarrollo de la página pública e identidad visual | Inicio, navegación, información institucional, secciones públicas y conector Facebook | Realizado |
| 7–8 | Gestión de miembros, ministerios, barrios y grupos de comunión | Formularios en 3 pasos, alta de administrativos, grupos y mapa de cobertura (migraciones 004–012) | Realizado |
| 9–10 | Actividades, cultos, eventos y control de asistencia | Módulo de actividades y registro de asistencia (manual, QR y visitantes) | Realizado |
| 11–12 | Alertas, seguimiento, reportes, perfil de cuenta, PWA y tablero administrativo | Alertas automáticas, reportes PDF/XLSX, foto, tamaño de interfaz, PWA y dashboard | Realizado |
| 13–14 | Pruebas funcionales, integración y correcciones | Suite de pruebas automatizadas en `checks/` y versión estabilizada | Realizado |
| 15 | Documentación, entrega y socialización | Documento final, scripts SQL y demostración | Realizado |

---

## 2. Arquitectura y Tecnologías de la Plataforma

La plataforma opera con **una sola sede** y **una sola zona** (Villavicencio, Meta), bajo una arquitectura cliente-servidor de tres capas: **Frontend SPA/PWA**, **Backend API REST** y **Base de Datos Relacional MySQL**.

### 2.1. Stack tecnológico

| Capa | Tecnología | Versión | Propósito en la plataforma |
| --- | --- | --- | --- |
| Frontend | React + TypeScript | React 19.3 / TS 7.0 | Interfaz de usuario reactiva de una sola página (SPA) con tipado estricto. |
| Empaquetador | Vite + @vitejs/plugin-react | 8.3.2 | Servidor de desarrollo con proxy `/api`, compilación optimizada y generación del Service Worker. |
| Animaciones | GSAP + @gsap/react | 3.15.0 | Transiciones suaves en el panel administrativo y carrusel, respetando `prefers-reduced-motion`. |
| Cartografía | Google Maps JavaScript API | Carga bajo demanda | Visualización de ubicadores de cobertura pastoral por barrios en Villavicencio. |
| Backend | Node.js + Express | Node ≥ 22.12 / Express 5.2 | Servidor HTTP local (`127.0.0.1:3001`), seguridad de sesiones, reglas de negocio y rutas REST. |
| Acceso a datos | mysql2 (Pool de promesas) | 3.24.5 | Consultas SQL parametrizadas y transacciones explícitas sin ORM. |
| Base de datos | MySQL Server LTS | 8.4.11 | Almacenamiento relacional InnoDB con codificación `utf8mb4` y llaves foráneas. |
| Reportes | PDFKit y ExcelJS | 0.20.2 / 4.4.0 | Generación en servidor de documentos PDF (A4 horizontal) y hojas de cálculo `.xlsx`. |
| Configuración | dotenv | 18.0.5 | Carga de variables de entorno desde `.env`. |
| Integración externa | Meta Graph API | Configurable | Consulta automática en servidor de transmisiones en vivo (`/{page-id}/live_videos`). |

### 2.2. Diagrama de arquitectura del sistema

```
+-------------------------------------------------------------------------+
|                        NAVEGADOR WEB / CELULAR (PWA)                    |
|  +-------------------------------------------------------------------+  |
|  | Frontend React 19 + TypeScript (Sitio Público y Panel #gestion)   |  |
|  +-----------------+-------------------------------+-----------------+  |
|                    |                               |                    |
|   Service Worker   | fetch /api/*                  | Maps JS API        |
|   (Caché de shell  | (Cookie HttpOnly,             | (Carga diferida    |
|    y offline.html) |  SameSite=Strict)             |  en #gestion/mapa) |
+--------------------+-------------------------------+--------------------+
                     |                               |
                     v                               v
+----------------------------------------+   +----------------------------+
|   SERVIDOR BACKEND NODE.JS + EXPRESS   |   |    GOOGLE MAPS PLATFORM    |
|          (127.0.0.1:3001)              |   |  (Teselas cartográficas)   |
|  - Autenticación scrypt + SHA-256      |   +----------------------------+
|  - Autorización RBAC + Alcance grupo   |
|  - Motor de Alertas y Reportes PDF/XLS |
+--------------------+-------------------+
                     |
          +----------+----------+
          |                     |
          | mysql2 (Pool)       | HTTPS Bearer Token (Caché 60s)
          v                     v
+--------------------+  +------------------------------------+
|  MYSQL 8.4.11 LTS  |  |      META / FACEBOOK GRAPH API     |
| Base: el_calvario  |  |  /{page-id}/live_videos (Directo)  |
|    (26 tablas)     |  +------------------------------------+
+--------------------+
```

### 2.3. Estructura de archivos del proyecto

```
IGLESIA/
├── src/                      # Frontend React + TypeScript
│   ├── App.tsx               # Enrutador principal por hash y vista de bienvenida
│   ├── Navbar.tsx            # Barra de navegación del sitio público
│   ├── HeroSlideshow.tsx     # Presentación fotográfica de la comunidad
│   ├── Institution.tsx       # Visión, misión, propósito, horarios y contacto
│   ├── Events.tsx            # Cartelera pública de eventos y reproductor de Facebook
│   ├── Ministries.tsx        # Tarjetas de ministerios públicos
│   ├── Participation.tsx     # Formulario público "Quiero participar"
│   ├── Login.tsx             # Pantallas de Inicio de sesión (#login) y Registro (#registro)
│   ├── Management.tsx        # Panel administrativo "Mi comunidad" (#gestion)
│   ├── AdminFrame.tsx        # Marco visual, barra lateral y barra móvil inferior
│   ├── admin-navigation.tsx  # Definición y filtrado de módulos según permisos
│   ├── AdminUsers.tsx        # Administración de cuentas y roles (#usuarios)
│   ├── AccountMenu.tsx       # Menú Mi cuenta (perfil, contraseña, foto, tamaño)
│   ├── ProfilePhoto.tsx      # Recorte y normalización de foto a JPEG 512x512
│   ├── CoverageMap.tsx       # Mapa de cobertura pastoral y vista Lista (#gestion/mapa)
│   ├── CoverageAssignments.tsx # Asignación de barrios a discipuladores
│   ├── GroupNeighborhoodField.tsx # Selector múltiple de barrios para grupos
│   ├── AppSelect.tsx         # Selector accesible con buscador integrado
│   └── pwa.tsx               # Control de instalación de la PWA
├── server/                   # Backend Node.js + Express
│   ├── index.js              # Punto de entrada, middlewares y /api/health
│   ├── config.js / db.js / database.js # Configuración y conexión MySQL
│   ├── origin.js             # Validación de orígenes permitidos (protección CSRF)
│   ├── body-parser.js        # Límite de JSON (16 KB ordinario / 384 KB con foto)
│   ├── auth.js               # Registro, login, sesiones, cuenta y usuarios
│   ├── pastoral-policy.js    # Jerarquía pastoral (niveles 1–6) y autoridad
│   ├── entities.js           # Validadores de campos y zona horaria de Bogotá
│   ├── management.js         # Endpoints de gestión eclesiástica y rutas públicas
│   ├── map.js / group-coverage.js / zone-reference.js # API y cálculos del mapa
│   ├── alerts.js             # Recálculo transaccional de alertas de ausencia
│   ├── reports.js            # Generación de reportes en PDF y Excel (.xlsx)
│   ├── facebook.js           # Conector con Facebook Graph API y caché de 1 min
│   ├── profile-photo.js      # Validación binaria de fotos JPEG (<= 256 KB)
│   ├── migrate.js / migration-runner.js # Ejecutor seguro de migraciones
│   └── migrations/           # 12 archivos SQL numerados (001 a 012)
├── database/geodata/         # Catálogo municipal y GeoJSON de barrios de Villavicencio
├── scripts/                  # Arranque unificado (dev.mjs), importadores y Service Worker
├── checks/                   # 20 scripts de pruebas automatizadas (API, unidad y UI)
├── public/                   # Fotografías, íconos, manifest.webmanifest y offline.html
└── docs/                     # Documentación técnica del proyecto
```

### 2.4. Rutas de navegación del frontend

| Ruta (Hash URL) | Módulo / Vista | Acceso requerido |
| --- | --- | --- |
| `/#inicio`, `/#nosotros`, `/#eventos`, `/#ministerios`, `/#grupos-de-comunion`, `/#contacto` | Secciones del sitio público | Público (sin sesión) |
| `/#login` | Inicio de sesión | Público |
| `/#registro` | Registro de cuenta nueva | Público |
| `/#gestion` | Dashboard "Mi comunidad" (o aviso de cuenta pendiente) | Sesión activa o pendiente |
| `/#gestion/members` | Módulo de Discípulos | `miembros.ver`, `miembros.editar` o `miembros.registrar` |
| `/#gestion/groups` | Módulo de Grupos de Comunión | `grupos.ver` |
| `/#gestion/mapa` | Módulo de Mapa de Cobertura Pastoral | `grupos.ver` |
| `/#gestion/activities` | Módulo de Eventos, Cultos y Reuniones | `eventos.editar`, `eventos.publicar`, `grupos.editar`, `asistencia.registrar` o `asistencia.ver` |
| `/#gestion/falls/registro` (o `/#gestion/attendance`) | Toma de Asistencia | `asistencia.registrar` o `asistencia.ver` |
| `/#gestion/falls/alertas` (o `/#gestion/alerts`) | Alertas Pastorales | `alertas.ver` |
| `/#gestion/reports` | Módulo de Reportes (PDF y Excel) | `reportes.asistencia`, `reportes.cumpleanos` o `reportes.grupos` |
| `/#gestion/permissions` | Editor de Permisos por Rol (RBAC) | `permisos.gestionar` |
| `/#usuarios` | Administración de Usuarios y Roles | `usuarios.gestionar` + Autoridad pastoral (niveles 1–5 o Superadmin) |

---

## 3. Funcionamiento de la Plataforma por Módulo

### 3.1. Sitio público
- **Bienvenida (Hero):** muestra el lema principal, ubicación con botón **Cómo llegar** hacia Google Maps (*Carrera 16 #22-28, Barrio Olímpico, Villavicencio, Meta*), el propósito (*"Presentar a todo hombre perfecto en Cristo Jesús"*), el versículo (*Éxodo 25:40*) y un carrusel de fotografías reales de la iglesia (`HeroSlideshow.tsx`).
- **Nosotros y Horarios (`Institution.tsx`):** consulta `/api/public/institution` para presentar la visión (*"Establecer el Reino de Dios en la tierra"*), misión (*"Alcanzar las naciones para Cristo"*) y los horarios en hora de Colombia:
  - *Servicio General:* Domingos – 09:00 AM (Presencial y virtual · YouTube y Facebook).
  - *Discipulados:* Lunes – 07:30 PM y 08:30 PM (Solo virtual · Zoom).
  - *Adiestramiento:* Jueves – 07:30 PM (Presencial y virtual · Zoom).
  Si la API no responde, muestra automáticamente estos datos confirmados como respaldo.
- **Eventos y Transmisiones (`Events.tsx`):** lista los cultos y eventos especiales publicados desde hoy, indicando si alguno está *Cancelado* y mostrando el botón **Inscribirme** cuando tiene enlace HTTPS de inscripción. A la derecha integra el reproductor de **Facebook**, que consulta cada 60 segundos si la iglesia está transmitiendo **En vivo** (`LIVE`) o muestra la última predicación disponible (`VOD`).
- **Quiero participar (`Participation.tsx`):** dentro de la sección de eventos, abre un modal para que cualquier asistente deje su nombre, teléfono, ministerio de interés y mensaje opcional, guardándolo en `solicitud_participacion`.
- **Ministerios y Grupos de Comunión (`Ministries.tsx`):** presenta los tres ministerios confirmados (*Alabanza / Adoración*, *Multimedia* y *Servidores / Ujieres*) y la reseña de los 5 Grupos de Comunión Familiar cuyo propósito es crecer en comunidad y abrir una nueva iglesia.

### 3.2. Registro e inicio de sesión
- **Registro (`/#registro`):** solicita correo electrónico (máx. 120 caracteres), contraseña (10 a 128 caracteres) y foto de perfil opcional.
- **Bootstrap del primer usuario:** en una base de datos recién inicializada (`bootstrap_completado = 0`), la primera cuenta que se registra adquiere un bloqueo transaccional y recibe automáticamente el rol **Superadmin** en estado `activo`. Esta marca es permanente: aunque se borren usuarios, nunca se vuelve a entregar Superadmin por registro público.
- **Cuentas posteriores (estado pendiente):** a partir del segundo registro, toda cuenta nueva se crea con estado `pendiente`, sin roles ni permisos. Crear una cuenta no crea una ficha de discípulo.
- **Inicio de sesión (`/#login`):** valida las credenciales con `scrypt` en tiempo constante. Tanto el login como el registro abren directamente `/#gestion`. Si la cuenta está `pendiente`, ve el aviso **"Tu cuenta está pendiente por activación"** con un botón para consultar su estado sin cerrar sesión.
- **Revalidación automática:** la sesión dura 8 horas (cookie `HttpOnly`, `SameSite=Strict`) y el frontend consulta `/api/auth/me` cada 15 segundos mientras la pestaña está visible y cada vez que recupera el foco. Si un administrador le cambia el rol o le revoca permisos, la interfaz se actualiza al instante.

### 3.3. Perfil de cuenta ("Mi cuenta")
Disponible desde el avatar de la esquina superior derecha para cualquier usuario con sesión (activo o pendiente):
- **Actualizar nombre y correo:** guarda el nombre en `perfil_usuario` (sin alterar la ficha del discípulo). Para cambiar el correo exige ingresar la contraseña actual. Conserva los formularios abiertos sin guardar en el panel.
- **Cambiar contraseña:** exige la contraseña actual y una nueva de 10 a 128 caracteres. Cambiar el correo o la contraseña **renueva la sesión actual y revoca todas las demás sesiones abiertas** de esa cuenta en otros dispositivos.
- **Foto de perfil:** admite imágenes JPG, PNG o WebP de hasta 10 MB. En el navegador se centra y convierte a un cuadrado JPEG de 512 × 512 px sin metadatos EXIF (máx. 256 KB). Se sirve exclusivamente al propietario mediante `/api/auth/account/photo` sin caché; cuando no hay foto, el avatar muestra la inicial.
- **Tamaño de la interfaz:** permite elegir entre **Normal**, **Grande (+15 %)** y **Muy grande (+30 %)**. Se guarda en `preferencia_usuario` y escala proporcionalmente textos, controles, íconos y espacios en toda la aplicación (tanto en el panel como en la página pública). Al cerrar sesión vuelve a Normal.

### 3.4. Dashboard ("Mi comunidad")
Al abrir `/#gestion` con una cuenta activa, muestra un saludo personalizado con el primer nombre del usuario, **seis tarjetas de acceso rápido** (*Discípulos, Grupos de Comunión, Asistencia, Eventos y Cultos, Alertas y Reportes*, deshabilitando las que el rol no tenga permitidas) y un resumen estadístico en tiempo real calculado según el alcance del usuario:
- Total de discípulos y discípulos activos.
- Grupos de comunión registrados.
- Conteos de asistencia agrupados por estado (si posee `estadisticas.ver`).
- Alertas pastorales vigentes.
- Cumpleaños en los próximos 7 días.
- Próximos encuentros programados desde hoy.

### 3.5. Discípulos
- **Consulta:** buscador por nombre completo o número de identificación (hasta 500 resultados) y filtro rápido por estado (`activo`, `inactivo`, `retirado`).
- **Formulario de alta y edición en 3 pasos:** conserva los valores al retroceder entre pasos.
  - *Campos obligatorios:* nombres, tipo de identificación (CC, TI, CE, Pasaporte, etc.), número de identificación (único), celular (mín. 7 dígitos) y fecha de nacimiento (no futura; se utiliza también para cumpleaños).
  - *Campos opcionales:* apellidos, correo, Grupo de Comunión Familiar, función en la iglesia, cargo pastoral y cobertura pastoral.
  - *Datos sensibles (protegidos por `miembros.sensibles`):* grupo sanguíneo y RH (`A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`), EPS, nombre y celular de contacto de emergencia. Si el usuario no tiene este permiso, ni aparecen en el formulario ni viajan en las respuestas de la API.
- **Dos modalidades de registro según el cargo pastoral:**
  1. **Discípulo normal:** disponible para cualquier registrador autorizado (`miembros.registrar` o `miembros.editar`). Crea únicamente la ficha en `miembro` con su código QR UUID único; no crea cuenta ni admite cargo pastoral.
  2. **Administrativo con cuenta de acceso:** disponible solo para los 5 primeros niveles pastorales (y Superadmin) que posean permiso de registro y `usuarios.gestionar`. Exige seleccionar uno de los 6 cargos pastorales, correo de acceso, contraseña y confirmación (más foto opcional, ministerio opcional y opción de designarlo responsable del grupo elegido). Guarda ficha, cuenta `activo`, perfil, foto, rol del sistema, ministerio y liderazgo de grupo en **una sola transacción** sin cerrar la sesión del creador.
- **Detalle del discípulo:** permite cambiar su estado (`activo`/`inactivo`/`retirado`), cambiar su grupo o cobertura pastoral (dejando rastro en `historial_miembro`), consultar dicho historial, asignar varios ministerios (`miembro_ministerio`), registrar evidencias de **consentimiento de tratamiento de datos** (`consentimiento_datos`: versión de política, medio papel o digital, autorizaciones de privacidad y datos religiosos, estado y fechas) y archivar lógicamente la ficha.

### 3.6. Grupos de Comunión Familiar
- Permite listar, crear, editar y archivar grupos (`codigo_grupo` único, `nombre`, discipulador responsable, grupo de origen y estado `activo`/`inactivo`), mostrando cuántos discípulos integra cada grupo.
- **Selección múltiple de barrios:** incluye un buscador por nombre de barrio o comuna sobre el catálogo municipal de Villavicencio. Permanece recogido hasta escribir una búsqueda y permite revisar o quitar barrios desde el desplegable *Ver barrios seleccionados*. El grupo, sus barrios (`grupo_barrio_cobertura`) y las coberturas del discipulador responsable (`discipulador_barrio`) se guardan en una sola transacción.
- **Alcance de Discipulador:** un usuario con rol Discipulador solo visualiza y edita los grupos donde él es el responsable. Crear grupos nuevos y cambiar el responsable requiere autoridad pastoral.
- **Procesos de multiplicación y apertura de iglesia:** desde el detalle del grupo se registran procesos en `multiplicacion_grupo` indicando el propósito (`multiplicacion_grupo` o `apertura_iglesia`), grupo/sede destino opcional y descripción. No se crean grupos automáticos por cupo.

### 3.7. Mapa de cobertura pastoral
- Accesible desde la barra móvil y lateral (`/#gestion/mapa`). Carga bajo demanda el componente y **Google Maps JavaScript API** centrado en Villavicencio.
- Muestra un **ubicador grande** en cada barrio que tenga una asignación vigente y un responsable activo no archivado, con la fotografía de su cuenta (o sus iniciales) y un color estable generado a partir de su identidad.
- **Privacidad cartográfica:** los contornos GeoJSON de los barrios solo se usan en el servidor para calcular un punto interior de referencia; nunca se envían direcciones residenciales, teléfonos, identificaciones ni datos de salud al navegador.
- **Modo Lista resiliente:** ofrece una pestaña **Lista** que funciona incluso si falla la red o Google Maps no está disponible (con botón *Reintentar*), e incluye los barrios cuya geometría está pendiente.
- **Búsqueda y ficha inferior:** filtra instantáneamente por barrio, comuna, responsable o grupo. Al tocar un ubicador o resultado, se abre un diálogo inferior modal con los responsables del barrio, los grupos vinculados explícitamente a ese barrio y la cantidad de discípulos activos.
- **Administrar zonas de discipuladores:** permite a usuarios con autoridad pastoral y `grupos.editar` global asignar o retirar barrios a cada discipulador, pidiendo confirmación antes de quitar barrios, verificando concurrencia (si otro administrador modificó antes la zona, rechaza con 409 y pide recargar) y guardando el historial de quién asignó y quién finalizó cada cobertura.

### 3.8. Eventos y Cultos (Actividades)
- Administra en un solo módulo tres tipos de encuentros: **Culto**, **Evento especial** y **Reunión de grupo**.
- Campos: título, fecha, hora, lugar, imagen (archivo local de `public/` o URL HTTPS), descripción y estado (`programada` o `cancelada`).
- En eventos especiales permite marcar **Requiere inscripción** e indicar la URL HTTPS del formulario de inscripción.
- En reuniones de grupo exige elegir el Grupo de Comunión correspondiente.
- **Publicación:** los usuarios con `eventos.publicar` pueden publicar cultos y eventos especiales para que aparezcan en el sitio público.
- **Reprogramación y cancelación:** cambiar la fecha, la hora o cancelar/archivar una actividad recalcula automáticamente dentro de la misma transacción las alertas de ausencia de los discípulos que tenían asistencia en ella.

### 3.9. Asistencia
- En `/#gestion/falls/registro` se elige la actividad y se presenta la nómina mínima de discípulos (en reuniones de grupo, solo los integrantes de ese grupo).
- **Toma por lote (manual):** permite seleccionar el estado (`presente`, `ausente`, `justificado`, `visitante`) de varios discípulos a la vez y guardarlos. Si un registro falla, conserva en pantalla las selecciones pendientes e informa el motivo.
- **Por código QR:** permite ingresar o escanear el UUID del `codigo_qr` del discípulo.
- **Visitantes sin ficha:** permite registrar a un asistente nuevo indicando únicamente su `nombre_visitante` con estado `visitante`, sin obligar a crearle ficha de miembro.
- **Protección contra duplicados y corrección:** si un discípulo ya tiene asistencia en esa actividad, un nuevo `POST` responde conflicto (409) y no sobrescribe el dato. Para modificarlo se exige un permiso distinto (`asistencia.corregir`), dejando registro de quién lo modificó y cuándo. No se permite tomar asistencia en actividades canceladas.

### 3.10. Alertas pastorales
- En `/#gestion/falls/alertas` se listan las alertas vigentes para acompañamiento pastoral.
- **Regla de cálculo (`server/alerts.js`):** para cada discípulo, ordena cronológicamente sus registros de asistencia no archivados correspondientes a actividades no canceladas que ya se hayan realizado (comparando `TIMESTAMP(fecha, hora)` con la hora actual de Colombia UTC-5).
- Cuando el discípulo acumula **dos estados `ausente` consecutivos**, se activa una alerta en `alerta_ausencia`. Si posteriormente asiste (`presente`) o se justifica (`justificado`), o si se corrige/cancela/archiva la actividad, la alerta se recalcula y pierde vigencia automáticamente. No se presumen ausencias en actividades donde no se le registró asistencia.

### 3.11. Reportes
En `/#gestion/reports` presenta tres tarjetas de descarga inmediata en **PDF** (generado con PDFKit en tamaño A4 horizontal con membrete institucional y paginación automática) y **Excel `.xlsx`** (generado con ExcelJS con encabezados en negrita y primera fila inmovilizada):
1. **Reporte de asistencia (`reportes.asistencia`):** incluye filtro opcional de fecha *Desde* y *Hasta*. Columnas: *Actividad, Fecha, Tipo, Discípulo, Estado, Método*. Si quien exporta no tiene permiso `miembros.ver` (como el rol Multimedia), la columna *Discípulo* exporta el ID numérico en lugar del nombre personal.
2. **Listado de cumpleaños (`reportes.cumpleanos`):** columnas *Nombre* y *Cumpleaños (MM-DD)*, ordenado por mes y día.
3. **Grupos de Comunión (`reportes.grupos`):** columnas *Código, Grupo, Dirección, Barrio, Día, Hora, Estado*.
Todos los reportes aplican el filtro de alcance (`todos` o `grupo`) del usuario que los descarga.

### 3.12. Usuarios y roles
En `/#usuarios` (exclusivo para usuarios con `usuarios.gestionar` y autoridad pastoral):
- Muestra la lista de cuentas (hasta 200), ubicando primero las cuentas en estado `pendiente`.
- **Habilitar cuenta:** al elegir un rol para una cuenta pendiente y pulsar *Habilitar cuenta*, la API asigna el rol y cambia el estado a `activo` en una transacción.
- **Cambio de rol y sincronización:** permite cambiar el rol principal de una cuenta existente. Si el nuevo rol corresponde a uno de los 6 niveles pastorales y la cuenta está vinculada a una ficha de discípulo, actualiza automáticamente el `id_rol_eclesiastico` en la ficha.
- **Vinculación con ficha de discípulo:** permite asociar o desasociar cada cuenta con su registro en `miembro`.
- **Protecciones:** ningún usuario puede cambiar su propio rol desde el panel; solo un `Superadmin` puede otorgar el rol `Superadmin`; y ningún otro rol puede alterar la cuenta del propietario técnico.

### 3.13. Permisos (RBAC)
En `/#gestion/permissions` (requiere `permisos.gestionar`):
- Muestra la matriz de permisos por rol del sistema (ocultando `sedes.gestionar` dado que hay una sola sede).
- Permite activar o desactivar permisos y elegir su alcance (`todos` o `grupo` en los 20 permisos que admiten alcance de grupo) para los roles configurables (*Asistencia Pastoral*, *Discipulador* y *Multimedia*).
- Los roles de autoridad total (*Superadmin, Administrador, Pastor* y niveles pastorales 1 a 4) conservan todos los permisos bloqueados contra edición, el rol *Usuario* se mantiene sin permisos operativos y el *Discipulador* exige siempre alcance `grupo`.

### 3.14. Aplicación instalable (PWA)
- Definida en `public/manifest.webmanifest` con nombre **"El Calvario – Mi comunidad"**, modo `standalone`, inicio directo en `/#gestion`, íconos de 180, 192 y 512 px más SVG adaptable, y atajos directos a *Discípulos*, *Asistencia* y *Eventos*.
- Desde el menú **Más** incluye la opción **Instalar aplicación** (`src/pwa.tsx`), que invoca el diálogo nativo del navegador o explica cómo agregarla a la pantalla de inicio en iOS/Safari.
- Durante `npm run build`, un plugin de Vite genera `dist/sw.js` con una versión hash SHA-256 única. El Service Worker precachea los archivos de interfaz (`.js`, `.css`, `.woff2`, `/offline.html` y `/app-icon.svg`), muestra la pantalla de reconexión cuando no hay internet y **excluye estrictamente todas las rutas `/api/`** para que nunca queden sesiones ni datos privados en la caché del dispositivo.

---

## 4. Actores, Roles y Permisos

### 4.1. Jerarquía pastoral de 6 niveles

| Nivel jerárquico | Cargo pastoral (`rol_eclesiastico`) | Rol del sistema asociado (`rol_sistema`) | Posee autoridad pastoral | Alcance operativo predeterminado |
| :-: | --- | --- | :-: | --- |
| **1** | Apóstol General | Apóstol General | Sí | General (`todos`) – Catálogo completo |
| **2** | Asistencia Apostólica | Asistencia Apostólica | Sí | General (`todos`) – Catálogo completo |
| **3** | Pastor de Distrito | Pastor de Distrito | Sí | General (`todos`) – Catálogo completo |
| **4** | Pastor Local | Pastor Local | Sí | General (`todos`) – Catálogo completo |
| **5** | Asistencia Pastoral | Asistencia Pastoral | Sí | General (`todos`) – Acompañamiento, registro, cuentas, grupos, asistencia, alertas y reportes |
| **6** | Discipuladores | Discipulador | No | Por grupo (`grupo`) – Solo los Grupos de Comunión a su cargo |

Además de los 6 roles pastorales, `rol_sistema` incluye:
- **Superadmin:** propietario técnico de la instalación; posee autoridad total y es el único que puede asignar el rol Superadmin.
- **Administrador** y **Pastor:** roles de acceso total conservados por compatibilidad; requieren cargo pastoral válido (niveles 1–5) para operaciones exclusivas de autoridad pastoral.
- **Multimedia:** equipo operativo encargado de eventos, publicación, asistencia, estadísticas y reportes no personales, con permiso de alta de discípulos normales (`miembros.registrar`).
- **Usuario:** cuenta activa básica sin acceso a módulos de gestión.

### 4.2. Tabla con los permisos iniciales de cada rol

Leyenda: **✔ (`todos`)** = Permiso global en toda la iglesia · **G (`grupo`)** = Permiso limitado a los grupos donde el usuario es discipulador · **—** = Sin permiso.

| Código del permiso | Descripción | Admite alcance `grupo` | Superadmin / Administrador / Pastor | Niveles 1 a 4 (Apóstol General, Asistencia Apostólica, Pastor de Distrito, Pastor Local) | Asistencia Pastoral (Nivel 5) | Discipulador (Nivel 6) | Multimedia | Usuario |
| --- | --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| `gestion.acceder` | Acceso a gestión privada | Sí | ✔ | ✔ | ✔ | G | ✔ | — |
| `usuarios.gestionar` | Asignar roles y vincular cuentas | No | ✔ | ✔ | ✔ | — | — | — |
| `permisos.gestionar` | Configurar permisos granulares | No | ✔ | ✔ | — | — | — | — |
| `miembros.ver` | Consultar datos personales de discípulos | Sí | ✔ | ✔ | ✔ | G | — | — |
| `miembros.registrar` | Registrar discípulos (alta sin consulta/edición) | Sí | ✔* | ✔ | ✔ | G | ✔ | — |
| `miembros.editar` | Registrar y editar fichas de discípulos | Sí | ✔ | ✔ | — | — | — | — |
| `miembros.sensibles` | Consultar y editar salud y emergencia | No | ✔ | ✔ | — | — | — | — |
| `miembros.estado` | Cambiar estado activo, inactivo o retirado | Sí | ✔ | ✔ | ✔ | — | — | — |
| `miembros.eliminar` | Archivar discípulos | Sí | ✔ | ✔ | ✔ | — | — | — |
| `grupos.ver` | Consultar grupos y mapa de cobertura | Sí | ✔ | ✔ | ✔ | G | ✔ | — |
| `grupos.editar` | Crear y editar grupos y procesos | Sí | ✔ | ✔ | ✔ | G | — | — |
| `grupos.eliminar` | Archivar grupos | Sí | ✔ | ✔ | ✔ | — | — | — |
| `eventos.editar` | Crear y editar cultos y eventos | No | ✔ | ✔ | — | — | ✔ | — |
| `eventos.publicar` | Publicar eventos en el sitio público | No | ✔ | ✔ | — | — | ✔ | — |
| `eventos.eliminar` | Archivar actividades | Sí | ✔ | ✔ | — | — | ✔ | — |
| `asistencia.registrar` | Registrar asistencia (manual, QR, visitante) | Sí | ✔ | ✔ | ✔ | G | ✔ | — |
| `asistencia.ver` | Consultar registros de asistencia | Sí | ✔ | ✔ | ✔ | G | ✔ | — |
| `asistencia.corregir` | Corregir estado de asistencia registrada | Sí | ✔ | ✔ | ✔ | — | — | — |
| `asistencia.eliminar` | Archivar registros de asistencia | Sí | ✔ | ✔ | ✔ | — | ✔ | — |
| `estadisticas.ver` | Consultar estadísticas generales | No | ✔ | ✔ | ✔ | — | ✔ | — |
| `alertas.ver` | Consultar alertas pastorales por ausencias | Sí | ✔ | ✔ | ✔ | — | — | — |
| `reportes.asistencia` | Exportar reporte de asistencia (PDF/XLSX) | Sí | ✔ | ✔ | ✔ | G | ✔ | — |
| `reportes.cumpleanos` | Exportar listado de cumpleaños (PDF/XLSX) | Sí | ✔ | ✔ | ✔ | G | — | — |
| `reportes.grupos` | Exportar reporte de grupos (PDF/XLSX) | Sí | ✔ | ✔ | ✔ | G | ✔ | — |
| `consentimientos.gestionar` | Registrar y consultar consentimiento de datos | Sí | ✔ | ✔ | — | — | — | — |
| `ministerios.gestionar` | Gestionar pertenencia a ministerios | Sí | ✔ | ✔ | ✔ | — | — | — |

*\* Superadmin, Administrador y Pastor cuentan con `miembros.editar`, que autoriza tanto registrar como editar.*

---

## 5. Requisitos Funcionales (70 Requisitos con Prioridad)

Prioridad: **Alta** (esencial para la operación) · **Media** (importante) · **Baja** (complementaria).

### 5.1. Sitio público (RF-01 a RF-09)

| ID | Requisito funcional | Prioridad |
| --- | --- | :-: |
| **RF-01** | El sistema debe mostrar la información institucional (nombre, visión, misión, propósito, versículo, ciudad y dirección) obtenida de `/api/public/institution`, utilizando datos confirmados de respaldo si la API no responde. | Alta |
| **RF-02** | El sistema debe mostrar los horarios de los encuentros (Servicio General, Discipulados y Adiestramiento) con día, horas en formato de Colombia, modalidad y plataformas. | Alta |
| **RF-03** | El sistema debe listar los cultos y eventos especiales publicados desde la fecha actual en Colombia (hasta 100), ordenados por fecha y hora, identificando los que estén cancelados. | Alta |
| **RF-04** | El sistema debe mostrar el botón "Inscribirme" en los eventos publicados no cancelados que requieran inscripción y posean URL HTTPS. | Media |
| **RF-05** | El sistema debe mostrar la transmisión de Facebook desde `/api/public/transmission`, priorizando un video en vivo (`LIVE`) y, en su defecto, el video más reciente (`VOD`) o el video alternativo configurado. | Media |
| **RF-06** | El sistema debe permitir a los visitantes enviar una solicitud en "Quiero participar" con nombre (máx. 120 caracteres), teléfono (mín. 7 dígitos), ministerio válido y mensaje opcional (máx. 2000 caracteres). | Media |
| **RF-07** | El sistema debe listar las tarjetas de los ministerios registrados en la iglesia. | Media |
| **RF-08** | El sistema debe ofrecer enlaces directos "Cómo llegar" hacia Google Maps con la dirección de la iglesia en Villavicencio. | Baja |
| **RF-09** | El sitio público debe actualizar automáticamente cada 60 segundos los eventos publicados y el estado de la transmisión de Facebook. | Baja |

### 5.2. Autenticación, sesiones y perfil de cuenta (RF-10 a RF-20)

| ID | Requisito funcional | Prioridad |
| --- | --- | :-: |
| **RF-10** | El sistema debe permitir registrar una cuenta con correo electrónico válido (máx. 120 caracteres), contraseña de 10 a 128 caracteres y foto de perfil opcional. | Alta |
| **RF-11** | El sistema debe otorgar el rol `Superadmin` activo únicamente a la primera cuenta registrada en una instalación nueva, de forma atómica y permanente mediante bloqueo transaccional. | Alta |
| **RF-12** | El sistema debe dejar en estado `pendiente`, sin roles ni permisos, a toda cuenta registrada después del bootstrap inicial. | Alta |
| **RF-13** | El sistema debe permitir iniciar sesión con correo y contraseña a cuentas `activo` o `pendiente`, rechazando las `inactivo` o `bloqueado`, y abrir directamente `/#gestion`. | Alta |
| **RF-14** | El sistema debe permitir cerrar sesión eliminando la sesión en base de datos y borrando la cookie del navegador. | Alta |
| **RF-15** | El sistema debe mostrar a las cuentas pendientes el aviso de espera de activación, un botón para consultar su estado y revalidar la sesión cada 15 segundos. | Alta |
| **RF-16** | El usuario autenticado debe poder actualizar su nombre (máx. 100 caracteres) y su correo electrónico; cambiar el correo debe exigir la contraseña actual. | Media |
| **RF-17** | El usuario autenticado debe poder cambiar su contraseña ingresando la contraseña actual y una nueva de 10 a 128 caracteres. | Alta |
| **RF-18** | Al cambiar el correo o la contraseña, el sistema debe renovar la sesión actual y revocar todas las demás sesiones abiertas de esa cuenta. | Alta |
| **RF-19** | El usuario debe poder subir, reemplazar o eliminar su foto de perfil (JPG, PNG o WebP hasta 10 MB, convertida en cliente a JPEG 512 × 512 px y validada en servidor hasta 256 KB). | Media |
| **RF-20** | El usuario debe poder elegir y guardar en su cuenta el tamaño de la interfaz (*Normal*, *Grande +15 %* o *Muy grande +30 %*), aplicándolo al iniciar sesión o recargar. | Media |

### 5.3. Usuarios, roles y permisos RBAC (RF-21 a RF-28)

| ID | Requisito funcional | Prioridad |
| --- | --- | :-: |
| **RF-21** | Un usuario con `usuarios.gestionar` y autoridad pastoral debe poder listar las cuentas registradas en `/#usuarios`, mostrando primero las pendientes. | Alta |
| **RF-22** | El sistema debe permitir asignar un rol a una cuenta y, si estaba en estado `pendiente`, activarla en la misma transacción. | Alta |
| **RF-23** | El sistema debe impedir que un usuario cambie su propio rol, que alguien distinto del Superadmin asigne el rol Superadmin y que se modifique la cuenta del propietario técnico. | Alta |
| **RF-24** | Al asignar un rol pastoral a una cuenta vinculada con un discípulo, el sistema debe sincronizar el cargo pastoral (`id_rol_eclesiastico`) en la ficha del discípulo. | Media |
| **RF-25** | El sistema debe permitir vincular o desvincular una cuenta de usuario con una ficha de discípulo no archivada. | Media |
| **RF-26** | Un usuario con `permisos.gestionar` debe poder editar los permisos y alcances (`todos` o `grupo`) de los roles configurables (*Asistencia Pastoral, Discipulador, Multimedia*). | Alta |
| **RF-27** | El sistema debe aplicar los cambios de rol o permisos de inmediato a las sesiones abiertas y actualizar el menú sin obligar a cerrar sesión. | Alta |
| **RF-28** | El menú lateral y móvil debe mostrar solo los módulos permitidos al usuario y bloquear el acceso por URL manual a módulos no autorizados. | Alta |

### 5.4. Discípulos, ministerios y consentimiento (RF-29 a RF-40)

| ID | Requisito funcional | Prioridad |
| --- | --- | :-: |
| **RF-29** | El sistema debe permitir buscar discípulos por nombre completo o número de identificación y filtrar por estado (`activo`, `inactivo`, `retirado`). | Alta |
| **RF-30** | El sistema debe permitir registrar un *Discípulo normal* en 3 pasos con nombres, tipo y número de identificación, celular y fecha de nacimiento obligatorios, sin crear cuenta ni asignarle cargo pastoral. | Alta |
| **RF-31** | El sistema debe permitir a los cargos pastorales autorizados registrar un *Administrativo con cuenta de acceso*, creando en una sola transacción la ficha, el cargo pastoral, la cuenta activa, el perfil, la foto opcional, el rol del sistema y opcionalmente su ministerio y liderazgo de grupo. | Alta |
| **RF-32** | El sistema debe generar automáticamente un código QR único (UUID) para cada discípulo registrado. | Media |
| **RF-33** | El sistema debe permitir editar la ficha del discípulo según permisos, exigiendo autoridad pastoral para cambiar cargo eclesiástico, función o cobertura pastoral. | Alta |
| **RF-34** | El sistema debe ocultar y bloquear en servidor y cliente los datos sensibles (`grupo_sanguineo_rh`, `eps`, `contacto_emergencia_nombre`, `contacto_emergencia_celular`) a quienes no posean `miembros.sensibles`. | Alta |
| **RF-35** | El sistema debe permitir cambiar el estado del discípulo entre `activo`, `inactivo` y `retirado` con el permiso `miembros.estado`. | Alta |
| **RF-36** | El sistema debe permitir archivar lógicamente (`archivado = 1`) un discípulo con el permiso `miembros.eliminar`, conservando sus referencias e historial. | Media |
| **RF-37** | El sistema debe registrar automáticamente en `historial_miembro` todo cambio de grupo o de cobertura pastoral con valor anterior, valor nuevo, usuario y fecha. | Alta |
| **RF-38** | El sistema debe permitir asignar y actualizar múltiples ministerios para un discípulo en `miembro_ministerio` sin borrar la fecha histórica de asignación. | Media |
| **RF-39** | El sistema debe permitir registrar y consultar evidencias de consentimiento de tratamiento de datos (versión de política, medio papel/digital, autorizaciones de privacidad y datos religiosos, fechas ISO UTC y estado). | Alta |
| **RF-40** | El sistema debe impedir duplicar discípulos con el mismo tipo y número de identificación. | Alta |

### 5.5. Grupos de Comunión Familiar (RF-41 a RF-45)

| ID | Requisito funcional | Prioridad |
| --- | --- | :-: |
| **RF-41** | El sistema debe permitir crear, editar y archivar Grupos de Comunión Familiar con código único, nombre, discipulador responsable, grupo de origen y estado (`activo`/`inactivo`). | Alta |
| **RF-42** | El formulario de grupo debe permitir buscar y seleccionar múltiples barrios del catálogo de Villavicencio, guardando en una transacción el grupo, sus barrios y la cobertura de su discipulador. | Media |
| **RF-43** | El sistema debe restringir al rol Discipulador a consultar y gestionar únicamente los grupos donde figura como responsable. | Alta |
| **RF-44** | El sistema debe permitir registrar y consultar procesos de `multiplicacion_grupo` con propósito de multiplicación de grupo o apertura de iglesia. | Media |
| **RF-45** | El sistema debe calcular y mostrar la cantidad de discípulos no archivados que integran cada grupo. | Media |

### 5.6. Mapa de cobertura pastoral (RF-46 a RF-50)

| ID | Requisito funcional | Prioridad |
| --- | --- | :-: |
| **RF-46** | El sistema debe mostrar en `/#gestion/mapa` un mapa de Villavicencio en Google Maps con ubicadores en cada barrio que tenga cobertura vigente y responsable activo. | Media |
| **RF-47** | El sistema debe incluir una vista **Lista** que funcione aunque Google Maps falle o no tenga conexión, incluyendo barrios con geometría pendiente y botón de reintento. | Media |
| **RF-48** | El sistema debe permitir buscar localmente por barrio, comuna, responsable o grupo y abrir una ficha inferior modal con responsables, grupos y conteo de discípulos activos. | Media |
| **RF-49** | El sistema debe permitir a usuarios con autoridad pastoral y `grupos.editar` global asignar o retirar barrios a discipuladores con confirmación, control de concurrencia e historial en `discipulador_barrio`. | Media |
| **RF-50** | Los ubicadores y fichas del mapa deben mostrar la foto de perfil de la cuenta del discipulador (bajo verificación de permisos) o sus iniciales con un color único estable. | Baja |

### 5.7. Actividades: cultos, eventos y reuniones (RF-51 a RF-55)

| ID | Requisito funcional | Prioridad |
| --- | --- | :-: |
| **RF-51** | El sistema debe permitir crear cultos, eventos especiales y reuniones de grupo con título, fecha, hora, lugar, imagen y descripción. | Alta |
| **RF-52** | El sistema debe permitir publicar o despublicar cultos y eventos especiales en el sitio público con `eventos.publicar`, impidiendo publicar reuniones de grupo. | Alta |
| **RF-53** | El sistema debe permitir reprogramar y cancelar actividades, recalculando transaccionalmente las alertas de los discípulos con asistencia en esa actividad. | Alta |
| **RF-54** | El sistema debe exigir una URL HTTPS válida cuando un evento especial se marque con `requiere_inscripcion`. | Media |
| **RF-55** | El sistema debe permitir archivar lógicamente actividades con `eventos.eliminar` y recalcular las alertas asociadas. | Media |

### 5.8. Asistencia y alertas pastorales (RF-56 a RF-63)

| ID | Requisito funcional | Prioridad |
| --- | --- | :-: |
| **RF-56** | El sistema debe permitir tomar asistencia de varios discípulos a la vez en una actividad con los estados `presente`, `ausente`, `justificado` o `visitante`. | Alta |
| **RF-57** | El sistema debe permitir registrar asistencia mediante el `codigo_qr` del discípulo. | Media |
| **RF-58** | El sistema debe permitir registrar visitantes sin ficha de miembro indicando su nombre en `nombre_visitante`. | Media |
| **RF-59** | El sistema debe rechazar con código 409 el registro duplicado de asistencia para un mismo discípulo y actividad, separando la corrección en otra operación. | Alta |
| **RF-60** | El sistema debe impedir el registro de asistencia en actividades con estado `cancelada`. | Alta |
| **RF-61** | El sistema debe permitir corregir el estado de una asistencia (`asistencia.corregir`) y archivarla (`asistencia.eliminar`), guardando el usuario modificador y recalculando alertas. | Alta |
| **RF-62** | El sistema debe generar automáticamente una alerta vigente en `alerta_ausencia` cuando un discípulo acumule 2 ausencias consecutivas en actividades realizadas no canceladas. | Alta |
| **RF-63** | El sistema debe listar en `/#gestion/falls/alertas` todas las alertas vigentes dentro del alcance del usuario. | Alta |

### 5.9. Reportes y dashboard (RF-64 a RF-68)

| ID | Requisito funcional | Prioridad |
| --- | --- | :-: |
| **RF-64** | El sistema debe exportar el reporte de asistencia en formatos PDF y Excel (`.xlsx`), con filtro opcional de fechas desde y hasta. | Alta |
| **RF-65** | El sistema debe exportar el listado de cumpleaños en formatos PDF y Excel (`.xlsx`), ordenado cronológicamente por mes y día. | Media |
| **RF-66** | El sistema debe exportar el reporte de Grupos de Comunión Familiar en formatos PDF y Excel (`.xlsx`). | Media |
| **RF-67** | Las exportaciones de reportes deben respetar el alcance del usuario y ocultar los nombres personales en el reporte de asistencia si el usuario no tiene `miembros.ver`. | Alta |
| **RF-68** | El dashboard debe calcular y mostrar indicadores reales (discípulos, activos, grupos, asistencia, alertas, cumpleaños en 7 días y próximos encuentros) según los permisos de la sesión. | Media |

### 5.10. Aplicación instalable PWA (RF-69 a RF-70)

| ID | Requisito funcional | Prioridad |
| --- | --- | :-: |
| **RF-69** | La aplicación debe poder instalarse como PWA en dispositivos móviles y escritorio desde el menú *Más*, abriendo directamente `/#gestion`. | Media |
| **RF-70** | La aplicación debe presentar una pantalla de reconexión (`/offline.html`) con botón de reintento cuando el dispositivo intente navegar sin conexión a internet. | Baja |

---

## 6. Requisitos No Funcionales (48 Requisitos en 8 Categorías)

### 6.1. Seguridad (RNF-01 a RNF-13)

| ID | Requisito no funcional |
| --- | --- |
| **RNF-01** | Las contraseñas deben cifrarse con **scrypt** y sal aleatoria de 16 bytes; la verificación debe usar `timingSafeEqual` y un hash señuelo cuando el correo no exista para evitar enumeración de usuarios por tiempo de respuesta. |
| **RNF-02** | Las sesiones deben usar un token aleatorio de 32 bytes; MySQL solo debe almacenar su resumen SHA-256 (`token_hash`). |
| **RNF-03** | La cookie de sesión debe enviarse con `HttpOnly`, `SameSite=Strict`, `Path=/api`, duración de 8 horas y atributo `Secure` en producción. |
| **RNF-04** | Toda mutación (`POST`, `PUT`, `PATCH`, `DELETE`) debe validar el encabezado `Origin` contra `APP_ORIGINS`, rechazar `Sec-Fetch-Site: cross-site` y exigir `Content-Type: application/json` (protección CSRF sin CORS). |
| **RNF-05** | Debe aplicarse límite de intentos por IP cada 15 minutos: máx. 8 en registro, 20 en login/cuenta y 10 en solicitudes de participación (respondiendo HTTP 429 con `Retry-After`). |
| **RNF-06** | Todas las consultas SQL deben ser parametrizadas y con `multipleStatements: false` para impedir inyección SQL. |
| **RNF-07** | El servidor debe verificar en cada solicitud el estado, roles y permisos vigentes en base de datos, y revalidarlos dentro de la transacción en escrituras privilegiadas. |
| **RNF-08** | Las credenciales de MySQL y el token de Meta deben residir exclusivamente en `.env` del servidor, nunca en variables `VITE_`, en `src/` ni en `public/`. |
| **RNF-09** | El tamaño máximo del cuerpo JSON debe ser de 16 KB en rutas ordinarias y de 384 KB en las tres rutas que admiten foto de perfil. |
| **RNF-10** | El servidor debe inspeccionar los marcadores binarios JPEG de cada foto subida (máx. 512 × 512 px y 256 KB) y servirla con `X-Content-Type-Options: nosniff` y `Cache-Control: private, no-store`. |
| **RNF-11** | La API debe deshabilitar el encabezado `X-Powered-By` y responder con `Cache-Control: no-store`. |
| **RNF-12** | Los registros de consola ante fallos solo deben imprimir códigos de error, sin exponer contraseñas, tokens ni cargas útiles de usuarios o de Meta. |
| **RNF-13** | El proceso Express local debe enlazar únicamente a `127.0.0.1`. |

### 6.2. Privacidad y protección de datos (RNF-14 a RNF-19)

| ID | Requisito no funcional |
| --- | --- |
| **RNF-14** | Los campos médicos y de emergencia del discípulo deben estar protegidos por el permiso independiente `miembros.sensibles`. |
| **RNF-15** | El listado para tomar asistencia (`/attendance/roster`) solo debe devolver identificador y nombre del discípulo. |
| **RNF-16** | El módulo de mapa nunca debe enviar al cliente direcciones residenciales, teléfonos, documentos ni datos de salud; los polígonos solo se usan en servidor para calcular un punto interior del barrio. |
| **RNF-17** | Debe conservarse cada registro de consentimiento en `consentimiento_datos` como evidencia histórica conforme a la Ley 1581 de 2012. |
| **RNF-18** | Las eliminaciones en los módulos deben ser lógicas (`archivado = 1`), preservando la integridad referencial y el historial. |
| **RNF-19** | Los respaldos en `.backups/` deben excluirse por `.gitignore` y el Service Worker nunca debe cachear respuestas de `/api/`. |

### 6.3. Rendimiento (RNF-20 a RNF-24)

| ID | Requisito no funcional |
| --- | --- |
| **RNF-20** | Las consultas de listado deben estar acotadas: hasta 500 discípulos o actividades administrativas, 200 usuarios y 100 eventos públicos. |
| **RNF-21** | El conector de Facebook debe cachear la respuesta durante 60 segundos en el servidor y aplicar un timeout de 8 segundos hacia Meta. |
| **RNF-22** | El módulo de mapa y el script de Google Maps deben cargarse bajo demanda únicamente al abrir `/#gestion/mapa`. |
| **RNF-23** | Las consultas de cobertura deben ejecutarse de forma agregada (sin N+1) y ordenar en Node.js las filas que incluyen `geojson` para evitar `ER_OUT_OF_SORTMEMORY` en MySQL con polígonos grandes (> 256 KB). |
| **RNF-24** | El backend debe utilizar un pool de conexiones MySQL con `connectTimeout` de 5 segundos. |

### 6.4. Usabilidad y accesibilidad (RNF-25 a RNF-32)

| ID | Requisito no funcional |
| --- | --- |
| **RNF-25** | Toda la plataforma debe estar en español (`es-CO`) y operar con la zona horaria `America/Bogota`. |
| **RNF-26** | El diseño debe ser completamente responsivo y verificarse en anchos de 320, 390, 768 y 1440 px sin desbordamiento horizontal. |
| **RNF-27** | En dispositivos móviles los controles interactivos deben medir al menos 44 px y respetar las áreas seguras (`safe-area-inset`). |
| **RNF-28** | Todos los diálogos y selectores deben gestionar el foco modal, soportar navegación por teclado y cerrarse con la tecla `Escape`. |
| **RNF-29** | La interfaz debe incluir atributos ARIA (`aria-label`, `aria-live="polite"`, `aria-current`) y textos alternativos en imágenes. |
| **RNF-30** | Las animaciones GSAP y CSS deben desactivarse si el usuario tiene configurada la preferencia `prefers-reduced-motion`. |
| **RNF-31** | Las dimensiones de contenido deben convertirse a `rem` en compilación para soportar los tres tamaños de interfaz (*Normal*, *Grande +15 %* y *Muy grande +30 %*). |
| **RNF-32** | Los selectores con más de 7 opciones (`AppSelect`) deben incorporar un buscador insensible a tildes y mayúsculas. |

### 6.5. Disponibilidad y confiabilidad (RNF-33 a RNF-37)

| ID | Requisito no funcional |
| --- | --- |
| **RNF-33** | Las operaciones compuestas deben ejecutarse en transacciones MySQL ACID que hagan `ROLLBACK` total ante cualquier error intermedio. |
| **RNF-34** | Debe aplicarse bloqueo pesimista (`SELECT … FOR UPDATE`) en bootstrap, miembros y recálculo de alertas, y control optimista de concurrencia en la edición de barrios. |
| **RNF-35** | El sitio público y el módulo de mapa deben degradarse de forma elegante (mostrando datos institucionales confirmados, video alternativo o vista Lista) si falla la red o un servicio externo. |
| **RNF-36** | El endpoint `GET /api/health` debe comprobar la conexión activa con MySQL y responder 200 o 503. |
| **RNF-37** | El servidor debe cerrar ordenadamente las conexiones activas y el pool de MySQL al recibir señales `SIGINT` o `SIGTERM`. |

### 6.6. Mantenibilidad (RNF-38 a RNF-42)

| ID | Requisito no funcional |
| --- | --- |
| **RNF-38** | El esquema de base de datos debe gestionarse mediante migraciones SQL numeradas (`001` a `012`), aditivas e idempotentes, registradas en `migracion_aplicada`. |
| **RNF-39** | El ejecutor de migraciones debe validar las columnas y tipos existentes en `information_schema` antes de aplicar cambios y detenerse si detecta un esquema incompatible. |
| **RNF-40** | El frontend debe mantener tipado estricto en TypeScript y validar `npm run typecheck` sin errores. |
| **RNF-41** | Las validaciones de tipos, textos, teléfonos, fechas y coordenadas deben estar centralizadas en `server/entities.js`. |
| **RNF-42** | El proyecto debe incluir suites automatizadas de pruebas (`checks/`) que se ejecuten en bases de datos temporales aisladas por UUID. |

### 6.7. Portabilidad y compatibilidad (RNF-43 a RNF-46)

| ID | Requisito no funcional |
| --- | --- |
| **RNF-43** | La plataforma debe funcionar en navegadores modernos de escritorio y móviles (Chrome, Edge, Firefox, Safari). |
| **RNF-44** | Debe cumplir el estándar Web App Manifest y Service Worker para ser instalable como PWA bajo HTTPS. |
| **RNF-45** | Toda la configuración del entorno debe definirse mediante variables en `.env` siguiendo la plantilla `.env.example`. |
| **RNF-46** | La entrega a un nuevo propietario debe poder realizarse sobre una base limpia ejecutando únicamente `npm run db:init` y `npm run db:migrate`. |

### 6.8. Escalabilidad (RNF-47 a RNF-48)

| ID | Requisito no funcional |
| --- | --- |
| **RNF-47** | El modelo de datos debe conservar las tablas y llaves foráneas de `sede` y `zona` para permitir una futura expansión multisitio sin romper el esquema. |
| **RNF-48** | Los scripts de importación territorial (`import-neighborhood-catalog.mjs` e `import-geodata.mjs`) deben admitir ejecución en simulación y actualización transaccional sin duplicar barrios ni alterar asignaciones previas. |

---

## 7. Reglas de Negocio (20 Reglas Confirmadas)

| Código | Regla de negocio |
| --- | --- |
| **RN-01** | Solo la primera cuenta registrada en una base nueva obtiene el rol `Superadmin` activo; la marca `bootstrap_completado` es permanente aunque se borren usuarios. |
| **RN-02** | Crear una cuenta de usuario no crea una ficha de discípulo; la vinculación mediante `usuario.id_miembro` es opcional y administrada. |
| **RN-03** | Una cuenta en estado `pendiente` no tiene permisos operativos hasta que un usuario autorizado le asigne un rol en `/#usuarios`. |
| **RN-04** | Asignar un rol activa una cuenta `pendiente`, pero no desbloquea cuentas en estado `inactivo` o `bloqueado`. |
| **RN-05** | Solo los niveles pastorales 1 al 5 (y `Superadmin`) poseen autoridad pastoral para crear administrativos, gestionar cuentas, asignar cargos/servicios/cobertura/ministerios, crear grupos, asignar responsables y administrar zonas del mapa. |
| **RN-06** | El *Discipulador* (nivel 6) está restringido al alcance `grupo`: solo opera sobre los grupos donde `grupo_comunion.id_discipulador = usuario.id_miembro` y sobre las fichas sin grupo que él mismo creó. |
| **RN-07** | Un discípulo normal no puede recibir cargo pastoral; para asignar un cargo pastoral al dar de alta se debe usar el registro administrativo. |
| **RN-08** | El cargo pastoral de una persona que ya tiene cuenta vinculada se administra desde *Usuarios y roles*, sincronizándose con su ficha. |
| **RN-09** | Un discípulo no puede ser su propia cobertura pastoral y un grupo no puede ser su propio grupo de origen. |
| **RN-10** | La fecha de nacimiento no puede estar en el futuro y se utiliza también como fecha de cumpleaños. |
| **RN-11** | Un visitante sin ficha de miembro siempre debe conservar el estado de asistencia `visitante`. |
| **RN-12** | Solo puede existir un registro de asistencia por discípulo en cada actividad; corregir un estado requiere el permiso independiente `asistencia.corregir`. |
| **RN-13** | Una alerta de ausencia se activa al acumular 2 estados `ausente` consecutivos en actividades realizadas, no canceladas y no archivadas; cualquier otro estado reinicia la cuenta y no se infieren ausencias por falta de registro. |
| **RN-14** | Las reuniones de grupo son internas y nunca se publican en el sitio público. |
| **RN-15** | El tipo de una actividad (`culto`, `evento`, `reunion_grupo`) no puede modificarse después de creada. |
| **RN-16** | En el consentimiento de datos, el estado `aceptado` exige fecha de aceptación, `revocado` exige fecha de revocación y la revocación no puede preceder a la aceptación. |
| **RN-17** | El consentimiento se conserva como evidencia documental sin ejecutar borrados automáticos no confirmados. |
| **RN-18** | No se insertan grupos, miembros, líderes ni coberturas ficticias para representar cifras institucionales. |
| **RN-19** | En el mapa solo se contabilizan discípulos activos no archivados pertenecientes a grupos activos vinculados explícitamente al barrio y a un responsable vigente. |
| **RN-20** | Las asignaciones de barrios a discipuladores nunca se borran físicamente: al retirarse pasan a `estado = 0` guardando `id_usuario_finaliza` y `fecha_finalizacion`. |

---

## 8. Modelo de Datos

### 8.1. Diagrama Entidad–Relación (Esquema estructural y cardinalidades)

```
+------------------------+       1 : N       +------------------------+       N : 1       +------------------------+
|        USUARIO         |------------------>|      USUARIO_ROL       |<------------------|      ROL_SISTEMA       |
| PK id_usuario          |                   | PK,FK id_usuario       |                   | PK id_rol              |
| FK id_miembro (0..1)   |                   | PK,FK id_rol           |                   +-----------+------------+
+---+----+----+----+-----+                   +------------------------+                               | 1
    |    |    |    |                                                                                  |
    |    |    |    +---- 1:N ---> SESION_USUARIO (PK token_hash, FK id_usuario)                       | N
    |    |    +--------- 1:1 ---> PERFIL_USUARIO (PK,FK id_usuario, nombre)               +-----------+------------+
    |    +-------------- 1:1 ---> FOTO_PERFIL_USUARIO (PK,FK id_usuario, contenido)       |      ROL_PERMISO       |
    +------------------- 1:1 ---> PREFERENCIA_USUARIO (PK,FK id_usuario, tamano)          | PK,FK id_rol           |
                                                                                          | PK,FK codigo_permiso   |
+------------------------+       1 : N       +------------------------+                   | alcance (todos|grupo)  |
|    ROL_ECLESIASTICO    |------------------>|        MIEMBRO         |                   +-----------+------------+
| PK id_rol_eclesiastico |                   | PK id_miembro          |                               | N
| nivel_jerarquico (1..6)|                   | FK id_rol_eclesiastico |                               | 1
+------------------------+                   | FK id_grupo            |                   +-----------+------------+
                                             | FK id_cobertura_past.  |                   |        PERMISO         |
+------------------------+       1 : N       | FK id_sede             |                   | PK codigo              |
|     GRUPO_COMUNION     |------------------>| UK (tipo_id, num_id)   |                   +------------------------+
| PK id_grupo            |                   | UK codigo_qr           |
| FK id_discipulador ----+------------------>+---+----+----+----+-----+
| FK id_grupo_origen     |                       |    |    |    |
+---+--------+-----------+                       |    |    |    +--- 1:N ---> HISTORIAL_MIEMBRO (grupo | cobertura)
    |        |                                   |    |    +-------- 1:N ---> CONSENTIMIENTO_DATOS (Ley 1581)
    | 1:N    +--- 1:N ---> MULTIPLICACION_GRUPO  |    +------------- 1:N ---> MIEMBRO_MINISTERIO <-- N:1 -- MINISTERIO
    v                                            |
+------------------------+                       +--- 1:N ---> DISCIPULADOR_BARRIO (vigente) <-- N:1 --+
|  GRUPO_BARRIO_COBERT.  |                                                                             |
| PK,FK id_grupo         |                                                                    +--------+-------+
| PK,FK id_barrio -------+------------------------------------------------------- N : 1 ----->|     BARRIO     |
+------------------------+                                                                    | PK id_barrio   |
                                                                                              | UK codigo      |
+------------------------+       1 : N       +------------------------+                       | geojson        |
|       ACTIVIDAD        |------------------>|       ASISTENCIA       |<-- 1:N -- (MIEMBRO)   +----------------+
| PK id_actividad        |                   | PK id_asistencia       |
| tipo (culto|evento|    |                   | FK id_actividad        |
|       reunion_grupo)   |                   | FK id_miembro (0..1)   |
+---+--------+--------+--+                   | UK (id_act, id_miembro)|
    |        |        |                      +------------------------+
    | 1:1    | 1:1    +--- 1:1 ---> REUNION_GRUPO (PK,FK id_actividad, FK id_grupo)
    |        +------------ 1:1 ---> EVENTO (PK,FK id_actividad, requiere_inscripcion, url_inscripcion)
    +--------------------- 1:1 ---> CULTO (PK,FK id_actividad)
    |
    +--- 1:N ---> ALERTA_AUSENCIA (PK id_alerta, FK id_miembro, FK id_actividad, vigente)
```

### 8.2. Diccionario y descripción de las 26 tablas

| # | Tabla | Clave Primaria (PK) | Claves Foráneas (FK) y Únicas (UK) | Descripción y columnas principales |
| :-: | --- | --- | --- | --- |
| 1 | `institucion` | `id` (`CHECK id=1`) | — | Fila única con `nombre`, `vision`, `mision`, `proposito`, `versiculo`, `ciudad`, `direccion`, `grupos_confirmados` y `horarios` (`JSON`). |
| 2 | `rol_sistema` | `id_rol` | UK: `nombre` | Roles de acceso al sistema (`nombre`, `descripcion`, `estado`). |
| 3 | `usuario` | `id_usuario` | FK: `id_miembro` → `miembro`<br>UK: `correo_login` | Cuentas de acceso (`password_hash`, `estado_usuario` en `pendiente\|activo\|inactivo\|bloqueado`, `ultimo_acceso`, fechas). |
| 4 | `usuario_rol` | `(id_usuario, id_rol)` | FK: `id_usuario`, `id_rol` | Asignación de roles a usuarios con indicador `activo` y `fecha_asignacion`. |
| 5 | `permiso` | `codigo` | — | Catálogo de los 27 códigos de permiso y su `descripcion`. |
| 6 | `rol_permiso` | `(id_rol, codigo_permiso)` | FK: `id_rol`, `codigo_permiso` | Permisos concedidos a cada rol y su `alcance` (`todos` o `grupo`). |
| 7 | `sesion_usuario` | `token_hash` (`CHAR(64)`) | FK: `id_usuario` | Sesiones activas con hash SHA-256 del token, `fecha_creacion` y `fecha_expiracion`. |
| 8 | `configuracion_sistema` | `id` (`CHECK id=1`) | FK: `id_superadmin_inicial` | Control del bootstrap inicial (`bootstrap_completado`, `fecha_inicializacion`). |
| 9 | `perfil_usuario` | `id_usuario` | FK: `id_usuario` | Nombre propio de la cuenta (`nombre` máx. 100 caracteres, `fecha_actualizacion`). |
| 10 | `foto_perfil_usuario` | `id_usuario` | FK: `id_usuario` | Imagen JPEG binaria (`contenido MEDIUMBLOB`), hash `version` (`CHAR(64)`) y fecha. |
| 11 | `preferencia_usuario` | `id_usuario` | FK: `id_usuario` | Preferencia visual (`tamano_interfaz`: `normal`, `large`, `extra-large`). |
| 12 | `rol_eclesiastico` | `id_rol_eclesiastico` | UK: `nombre` | Los 6 cargos de la jerarquía pastoral y su `nivel_jerarquico` (1 a 6). |
| 13 | `sede` | `id_sede` | UK: `nombre` | Sede única confirmada de la iglesia (`nombre`, `direccion`). |
| 14 | `zona` | `id_zona` | UK: `nombre` | Tabla de zona pastoral conservada por compatibilidad referencial. |
| 15 | `miembro` | `id_miembro` | FK: `id_sede`, `id_rol_eclesiastico`, `id_grupo`, `id_cobertura_pastoral`, `id_usuario_creacion`, `id_usuario_actualizacion`<br>UK: `(tipo_identificacion, numero_identificacion)`, `codigo_qr` | Ficha completa del discípulo: datos básicos, salud (`grupo_sanguineo_rh`, `eps`), emergencia (`contacto_emergencia_nombre`, `contacto_emergencia_celular`), `funcion_iglesia`, `estado_miembro` (`activo\|inactivo\|retirado`), `codigo_qr` (UUID) y `archivado`. |
| 16 | `historial_miembro` | `id_historial` | FK: `id_miembro`, `id_usuario` | Auditoría de cambios de `concepto` (`grupo` o `cobertura`), `id_anterior`, `id_nuevo` y `fecha_cambio`. |
| 17 | `grupo_comunion` | `id_grupo` | FK: `id_discipulador`, `id_zona`, `id_grupo_origen`<br>UK: `codigo_grupo` | Grupos de Comunión Familiar: `nombre`, `direccion`, `barrio` (`TEXT`), coordenadas, `dia_reunion`, `hora_reunion`, `estado_grupo` y `archivado`. |
| 18 | `multiplicacion_grupo` | `id_multiplicacion` | FK: `id_grupo_origen`, `id_grupo_destino`, `id_sede_destino` | Procesos de `multiplicacion_grupo` o `apertura_iglesia` con `descripcion` y `fecha_registro`. |
| 19 | `ministerio` | `id_ministerio` | UK: `nombre` | Catálogo de ministerios (`nombre`, `descripcion`). |
| 20 | `miembro_ministerio` | `(id_miembro, id_ministerio)` | FK: `id_miembro`, `id_ministerio` | Pertenencia de discípulos a ministerios con `activo` y `fecha_asignacion`. |
| 21 | `actividad` | `id_actividad` | FK: `id_usuario_creacion` | Supertipo de actividades: `tipo_actividad` (`culto\|evento\|reunion_grupo`), `titulo`, `fecha`, `hora`, `lugar`, `imagen`, `descripcion`, `estado_actividad` (`programada\|cancelada`), `publicado` y `archivado`. |
| 22 | `culto` / `evento` / `reunion_grupo` | `id_actividad` | FK: `id_actividad` (y `id_grupo` en `reunion_grupo`) | Extensiones por tipo de actividad (`requiere_inscripcion`, `url_inscripcion`, `id_grupo`). |
| 23 | `asistencia` | `id_asistencia` | FK: `id_actividad`, `id_miembro`, `id_usuario_registro`, `id_usuario_modificacion`<br>UK: `(id_actividad, id_miembro)` | Registros de asistencia: `nombre_visitante`, `estado_asistencia` (`presente\|ausente\|justificado\|visitante`), `metodo_registro` (`manual\|qr`), `dispositivo_origen` y `archivado`. |
| 24 | `alerta_ausencia` | `id_alerta` | FK: `id_miembro`, `id_actividad`<br>UK: `(id_miembro, id_actividad)` | Alertas calculadas por 2 ausencias consecutivas (`vigente`, `fecha_creacion`). |
| 25 | `consentimiento_datos` | `id_consentimiento` | FK: `id_miembro` | Evidencia de consentimiento: `version_politica`, `acepta_politica_privacidad`, `acepta_datos_religiosos`, `medio` (`papel\|digital`), fechas y `estado_consentimiento` (`aceptado\|revocado\|pendiente`). |
| 26 | `solicitud_participacion`, `barrio`, `discipulador_barrio`, `grupo_barrio`, `grupo_barrio_cobertura`, `migracion_aplicada` | Claves propias por tabla | FK hacia `miembro`, `grupo_comunion`, `barrio`, `usuario` | Solicitudes públicas de participación; catálogo de 668 barrios con 340 polígonos `geojson`; historial de cobertura de barrios por discipulador (con columna generada `vigente`); relación múltiple de barrios por grupo; y control de las 12 migraciones aplicadas. |

### 8.3. Resumen de las 12 migraciones SQL (`server/migrations/`)

| Migración | Descripción |
| --- | --- |
| `001-auth.sql` | Tablas `rol_sistema`, `usuario`, `usuario_rol`, `sesion_usuario` y roles base *Usuario* y *Superadmin*. |
| `002-superadmin.sql` | Tabla `configuracion_sistema` y bloqueo de bootstrap inicial. |
| `003-participation.sql` | Tabla `solicitud_participacion` para el formulario público "Quiero participar". |
| `004-church-management.sql` | Esquema completo de gestión eclesiástica, RBAC (`permiso`, `rol_permiso`), jerarquía, discípulos, grupos, actividades, asistencia, alertas y consentimiento. |
| `005-pending-users.sql` | Estado `pendiente` como valor por defecto en `usuario.estado_usuario`. |
| `006-account-profile.sql` | Tabla `perfil_usuario` para el nombre propio de la cuenta. |
| `007-pastoral-registration.sql` | Permiso `miembros.registrar` y roles del sistema para niveles pastorales 1 a 4. |
| `008-profile-photo.sql` | Tabla `foto_perfil_usuario` para fotos JPEG privadas de hasta 256 KB. |
| `009-display-preference.sql` | Tabla `preferencia_usuario` para guardar el tamaño de interfaz. |
| `010-map-coverage.sql` | Tablas `barrio`, `discipulador_barrio` y `grupo_barrio` para el mapa de cobertura. |
| `011-group-neighborhoods.sql` | Tabla `grupo_barrio_cobertura` para asociar múltiples barrios a cada grupo. |
| `012-group-neighborhood-text.sql` | Amplía `grupo_comunion.barrio` a `TEXT` para almacenar la lista de nombres de barrios. |

---

## 9. Especificación Completa de Endpoints de la API REST

Prefijo base: `/api`. Todas las respuestas se entregan en JSON (salvo fotos en `image/jpeg` y reportes en `application/pdf` o `.xlsx`).

### 9.1. Salud y endpoints públicos

| Método | Endpoint | Autenticación / Permiso | Descripción y parámetros |
| :-: | --- | --- | --- |
| `GET` | `/api/health` | Público | Verifica la conexión con MySQL (`{status:'ok', database:'connected'}` o 503). |
| `GET` | `/api/public/institution` | Público | Devuelve la fila única de `institucion` con horarios en JSON. |
| `GET` | `/api/public/events` | Público | Devuelve hasta 100 cultos y eventos con `publicado = 1` desde la fecha actual en Bogotá. |
| `GET` | `/api/public/ministries` | Público | Devuelve el listado de ministerios registrados. |
| `GET` | `/api/public/transmission` | Público | Devuelve `{videoUrl, pageUrl, automatic, live}` desde la caché/conector de Facebook (nunca expone el token). |
| `POST` | `/api/participation` | Público (límite 10/15m por IP) | Recibe `{name, phone, ministry, message}` y registra la solicitud en `solicitud_participacion`. |

### 9.2. Autenticación, cuenta propia y administración de usuarios

| Método | Endpoint | Autenticación / Permiso | Descripción y parámetros |
| :-: | --- | --- | --- |
| `POST` | `/api/auth/register` | Público (límite 8/15m por IP) | Recibe `{email, password, photo?}`. Crea cuenta (`Superadmin` activo si es la primera; `pendiente` las demás) e inicia sesión. |
| `POST` | `/api/auth/login` | Público (límite 20/15m por IP) | Recibe `{email, password}`. Inicia sesión para cuentas `activo` o `pendiente` y emite cookie `HttpOnly`. |
| `GET` | `/api/auth/me` | Cookie de sesión | Devuelve `{user}` con `id`, `memberId`, `email`, `name`, `state`, `photoUrl`, `displaySize`, `roles`, `permissions`, `pastoralRole` y `registration`. |
| `POST` | `/api/auth/logout` | Cookie de sesión | Elimina la sesión en base de datos y limpia la cookie. |
| `GET` | `/api/auth/account/photo` | Sesión propia (`activo` o `pendiente`) | Sirve el binario JPEG de la foto de perfil de la cuenta actual (`private, no-store`). |
| `POST` | `/api/auth/account/photo` | Sesión propia (límite 20/15m) | Recibe `{photo: 'data:image/jpeg;base64,...' \| null}` para guardar o eliminar la foto propia. |
| `POST` | `/api/auth/account/preferences` | Sesión propia (límite 20/15m) | Recibe `{displaySize: 'normal' \| 'large' \| 'extra-large'}` y guarda la preferencia. |
| `POST` | `/api/auth/account/profile` | Sesión propia (límite 20/15m) | Recibe `{name, email, currentPassword?}`. Si cambia el correo, valida `currentPassword` y revoca otras sesiones. |
| `POST` | `/api/auth/account/password` | Sesión propia (límite 20/15m) | Recibe `{currentPassword, newPassword}`. Actualiza el hash `scrypt` y revoca otras sesiones. |
| `GET` | `/api/auth/admin/users` | `usuarios.gestionar` + Autoridad pastoral | Devuelve hasta 200 cuentas (pendientes primero) y el catálogo de roles asignables. |
| `POST` | `/api/auth/admin/users/:id/role` | `usuarios.gestionar` + Autoridad pastoral | Recibe `{roleId}`. Asigna el rol, activa la cuenta si estaba `pendiente` y sincroniza el cargo pastoral de la ficha vinculada. |

### 9.3. Gestión eclesiástica (`/api/management/*` – exige cuenta `activo` y `gestion.acceder`)

| Método | Endpoint | Permiso requerido | Descripción y parámetros |
| :-: | --- | --- | --- |
| `GET` | `/api/management/catalogs` | `gestion.acceder` | Devuelve `roles`, `sedes`, `zonas`, `ministerios`, `grupos`, `registrationGroups` y `barrios` según alcance. |
| `GET` | `/api/management/members` | `miembros.ver` | Busca discípulos por `?q=` (nombre o documento, máx. 500), ocultando campos sensibles sin `miembros.sensibles`. |
| `POST` | `/api/management/members` | `miembros.registrar` o `miembros.editar` | Crea un discípulo (`tipo_registro: 'discipulo' \| 'administrativo'`). En administrativo crea también cuenta, perfil y rol en una transacción. |
| `PATCH` | `/api/management/members/:id` | `miembros.editar` | Actualiza datos de la ficha y registra en `historial_miembro` si cambió grupo o cobertura. |
| `DELETE` | `/api/management/members/:id` | `miembros.eliminar` | Archiva lógicamente (`archivado = 1`) la ficha del discípulo. |
| `POST` | `/api/management/members/:id/state` | `miembros.estado` | Recibe `{estado_miembro: 'activo' \| 'inactivo' \| 'retirado'}`. |
| `POST` | `/api/management/members/:id/relations` | `grupos.editar` + `miembros.ver` | Actualiza `id_grupo` y/o `id_cobertura_pastoral` guardando bitácora en `historial_miembro`. |
| `GET` | `/api/management/members/:id/history` | `miembros.ver` | Devuelve el historial de cambios de grupo y cobertura del discípulo. |
| `GET` | `/api/management/members/:id/ministries` | `miembros.ver` | Devuelve los IDs de ministerios activos del discípulo. |
| `PUT` | `/api/management/members/:id/ministries` | `ministerios.gestionar` + Autoridad pastoral | Recibe `{ids: [...]}` y actualiza las pertenencias a ministerios. |
| `GET` | `/api/management/members/:id/consents` | `consentimientos.gestionar` | Lista el historial de evidencias de consentimiento del discípulo. |
| `POST` | `/api/management/members/:id/consents` | `consentimientos.gestionar` | Registra una nueva evidencia de consentimiento (papel o digital). |
| `GET` | `/api/management/groups` | `grupos.ver` | Lista los grupos autorizados con el conteo de miembros de cada grupo. |
| `POST` | `/api/management/groups` | `grupos.editar` + Autoridad pastoral | Crea un grupo junto con su selección de `barrios` y cobertura del responsable en una transacción. |
| `PATCH` | `/api/management/groups/:id` | `grupos.editar` | Actualiza el grupo y sus barrios seleccionados con control de concurrencia (`expectedLeaderId`). |
| `DELETE` | `/api/management/groups/:id` | `grupos.eliminar` | Archiva lógicamente el grupo. |
| `GET` / `POST` | `/api/management/groups/:id/processes` | `grupos.ver` / `grupos.editar` | Consulta o registra procesos de `multiplicacion_grupo` o `apertura_iglesia`. |
| `GET` | `/api/management/activities` | Permiso de asistencia, eventos o grupos | Lista hasta 500 actividades no archivadas dentro del alcance del usuario. |
| `POST` / `PATCH` | `/api/management/activities` (`/:id`) | `eventos.editar` o `grupos.editar` (`eventos.publicar` para publicar) | Crea, edita, publica, reprograma o cancela actividades, recalculando alertas si cambia fecha, hora o estado. |
| `DELETE` | `/api/management/activities/:id` | `eventos.eliminar` | Archiva lógicamente la actividad y recalcula alertas. |
| `GET` | `/api/management/attendance/roster` | `asistencia.registrar` | Devuelve `{items: [{id_miembro, nombre}]}` para tomar asistencia en `?activityId=`. |
| `GET` | `/api/management/attendance` | `asistencia.ver` | Lista los registros de asistencia de `?activityId=`. |
| `POST` | `/api/management/attendance` | `asistencia.registrar` | Registra asistencia (`manual`, `qr` o `visitante`), devuelve 409 ante duplicado y recalcula alertas. |
| `PATCH` | `/api/management/attendance/:id` | `asistencia.corregir` | Corrige el `estado_asistencia` de un registro existente y recalcula alertas. |
| `DELETE` | `/api/management/attendance/:id` | `asistencia.eliminar` | Archiva lógicamente el registro de asistencia y recalcula alertas. |
| `GET` | `/api/management/alerts` | `alertas.ver` | Recalcula y devuelve las alertas de ausencia vigentes en el alcance del usuario. |
| `GET` | `/api/management/dashboard` | `gestion.acceder` | Devuelve los widgets estadísticos permitidos para el usuario actual. |
| `GET` | `/api/management/reports/:type` | `reportes.asistencia`, `reportes.cumpleanos` o `reportes.grupos` | Descarga el reporte (`asistencia`, `cumpleanos` o `grupos`) en `?format=pdf\|xlsx` (con `from` y `to` opcionales en asistencia). |
| `POST` | `/api/management/users/:id/member` | `usuarios.gestionar` + Autoridad pastoral | Recibe `{memberId: number \| null}` para vincular una cuenta con su ficha de discípulo. |
| `GET` / `PUT` | `/api/management/permissions` (`/:roleId`) | `permisos.gestionar` | Consulta el catálogo RBAC o reemplaza transaccionalmente los `grants` (`[{codigo, alcance}]`) de un rol configurable. |

### 9.4. Mapa de cobertura pastoral (`/api/management/mapa/*` – exige `grupos.ver`)

| Método | Endpoint | Permiso requerido | Descripción y parámetros |
| :-: | --- | --- | --- |
| `GET` | `/api/management/mapa/coberturas` | `grupos.ver` | Devuelve `{items, canManage}` con barrios cubiertos, punto de `ubicacion`, responsables con `fotoUrl`, grupos y conteos de discípulos activos. |
| `GET` | `/api/management/mapa/discipuladores/:id/foto` | `grupos.ver` (con cobertura visible) | Sirve de forma privada la foto de perfil del discipulador responsable. |
| `GET` | `/api/management/mapa/barrios` | `grupos.ver` | Devuelve el catálogo activo de barrios y comunas de Villavicencio (sin geometrías pesadas). |
| `GET` | `/api/management/mapa/discipuladores` | `grupos.ver` | Lista los discipuladores activos visibles para el usuario y si puede administrarlos. |
| `GET` | `/api/management/mapa/discipuladores/:id/barrios` | `grupos.ver` | Devuelve los IDs de barrios actualmente asignados al discipulador. |
| `PUT` | `/api/management/mapa/discipuladores/:id/barrios` | `grupos.editar` (`todos`) + Autoridad pastoral | Recibe `{ids, expectedIds, confirmRemoval}` y actualiza transaccionalmente los barrios del discipulador con historial de altas/bajas. |
| `GET` / `PUT` | `/api/management/mapa/grupos/:id/barrios` (y `/barrio`) | `grupos.ver` / `grupos.editar` (`todos`) + Autoridad pastoral | Consulta o actualiza la selección de barrios asociados a un grupo. |

---

## 10. Casos de Uso Principales (7 Casos de Uso)

### CU-01: Registrar cuenta e iniciar sesión
- **Actor:** Visitante o integrante de la iglesia.
- **Precondición:** Acceso al sitio web en `/#registro` o `/#login`.
- **Flujo principal:**
  1. El usuario abre `/#registro`, ingresa su correo electrónico, una contraseña de 10 a 128 caracteres y opcionalmente selecciona una foto de perfil.
  2. El navegador normaliza la foto a JPEG de 512 × 512 px y envía `POST /api/auth/register`.
  3. El servidor valida el formato, bloquea `configuracion_sistema` y verifica si `bootstrap_completado` es 0.
  4. Si es la primera cuenta de la instalación, la crea como `activo` con rol `Superadmin`; en caso contrario, la crea con estado `pendiente` sin roles.
  5. El servidor crea la sesión de 8 horas, envía la cookie `HttpOnly` y el navegador abre `/#gestion`.
- **Flujos alternos:**
  - *Correo ya registrado:* devuelve HTTP 409 indicando iniciar sesión o consultar con la administración.
  - *Más de 8 intentos en 15 minutos desde la misma IP:* devuelve HTTP 429 con el tiempo de espera en `Retry-After`.

### CU-02: Habilitar una cuenta pendiente y asignarle rol
- **Actor:** Liderazgo pastoral (niveles 1–5) o Superadmin con permiso `usuarios.gestionar`.
- **Precondición:** Existe al menos una cuenta en estado `pendiente`.
- **Flujo principal:**
  1. El administrador ingresa a `/#usuarios`, donde las cuentas pendientes aparecen en primer lugar.
  2. Selecciona en el selector de la cuenta el rol correspondiente (p. ej., *Discipulador*, *Asistencia Pastoral* o *Multimedia*) y pulsa **Habilitar cuenta**.
  3. El servidor ejecuta una transacción que revalida los permisos del administrador, asigna el rol en `usuario_rol` y cambia `estado_usuario` de `pendiente` a `activo`.
  4. Opcionalmente, el administrador vincula la cuenta con la ficha del discípulo.
  5. En un máximo de 15 segundos (o al pulsar *Consultar activación*), la pantalla del usuario habilitado carga automáticamente su menú de gestión.
- **Flujos alternos:**
  - *Intento de modificar el propio rol:* rechazado con HTTP 409.
  - *Intento de asignar Superadmin sin ser Superadmin:* rechazado con HTTP 403.

### CU-03: Registrar un discípulo (normal o administrativo con cuenta)
- **Actor:** Usuario con `miembros.registrar` o `miembros.editar` (y autoridad pastoral si es registro administrativo).
- **Precondición:** Sesión activa en `/#gestion/members`.
- **Flujo principal:**
  1. El actor pulsa **Registrar discípulo**.
  2. Si posee autoridad pastoral y `usuarios.gestionar`, elige entre *Discípulo normal* o *Administrativo con cuenta de acceso*.
  3. Completa el **Paso 1** (nombres, apellidos, tipo y número de identificación, fecha de nacimiento), el **Paso 2** (celular, correo, Grupo de Comunión opcional y, si tiene `miembros.sensibles`, RH, EPS y contacto de emergencia) y el **Paso 3** (en administrativo: cargo pastoral, correo de acceso, contraseña, confirmación, foto opcional, ministerio y opción de ser responsable del grupo).
  4. Al guardar, el servidor valida todas las reglas y ejecuta una transacción que inserta la ficha con su `codigo_qr` UUID (y, si es administrativo, crea también el usuario `activo`, el perfil, la foto, el rol del sistema, el ministerio y actualiza el responsable del grupo).
- **Flujos alternos:**
  - *Identificación o correo duplicado:* toda la transacción hace `ROLLBACK` y devuelve HTTP 409 sin dejar registros huérfanos.
  - *Discipulador intentando registrar en un grupo ajeno:* rechazado con HTTP 403.

### CU-04: Tomar asistencia y generar alertas automáticas
- **Actor:** Usuario con permiso `asistencia.registrar` (Liderazgo, Discipulador en su grupo o Multimedia).
- **Precondición:** Existe una actividad programada (no cancelada).
- **Flujo principal:**
  1. El actor abre `/#gestion/falls/registro` y selecciona la actividad.
  2. Marca el estado (`presente`, `ausente`, `justificado`) de los discípulos listados, o registra un código QR o el nombre de un visitante sin ficha.
  3. Pulsa guardar; el servidor inserta cada asistencia y ejecuta dentro de la transacción `recalculateAlerts` para el discípulo.
  4. Si el discípulo completó 2 ausencias consecutivas en actividades realizadas, el sistema activa automáticamente su alerta en `alerta_ausencia`, quedando visible en `/#gestion/falls/alertas`.
- **Flujos alternos:**
  - *Discípulo ya tenía asistencia en esa actividad:* devuelve HTTP 409; solo un usuario con `asistencia.corregir` puede cambiar el estado existente.
  - *Actividad cancelada:* rechaza el registro con HTTP 409.

### CU-05: Publicar un culto o evento especial en el sitio público
- **Actor:** Usuario con `eventos.editar` y `eventos.publicar` (p. ej., Multimedia o Pastor).
- **Precondición:** Sesión activa en `/#gestion/activities`.
- **Flujo principal:**
  1. El actor crea o edita una actividad de tipo `culto` o `evento`, ingresando título, fecha, hora, lugar, imagen, descripción y (si aplica) enlace HTTPS de inscripción.
  2. Activa la casilla **Publicado** y guarda.
  3. El sitio público muestra inmediatamente (o en su refresco automático de 60 segundos) el evento en la cartelera `#eventos`.

### CU-06: Exportar un reporte en PDF o Excel
- **Actor:** Usuario con permiso `reportes.asistencia`, `reportes.cumpleanos` o `reportes.grupos`.
- **Precondición:** Sesión activa en `/#gestion/reports`.
- **Flujo principal:**
  1. El actor ingresa a **Reportes** y, en caso del reporte de asistencia, selecciona opcionalmente el rango de fechas *Desde* y *Hasta*.
  2. Pulsa **Descargar PDF** o **Descargar Excel** en la tarjeta deseada.
  3. El servidor filtra los registros según el alcance del usuario, genera en memoria el documento `.pdf` o `.xlsx` y lo envía como descarga directa.

### CU-07: Asignar barrios de cobertura pastoral en el mapa
- **Actor:** Usuario con autoridad pastoral y permiso `grupos.editar` con alcance `todos`.
- **Precondición:** Catálogo de barrios de Villavicencio importado en la base de datos.
- **Flujo principal:**
  1. El actor abre `/#gestion/mapa` → **Administrar zonas de discipuladores** (o edita un grupo en *Grupos de Comunión*).
  2. Selecciona el discipulador responsable, escribe en el buscador el nombre del barrio o comuna y marca los barrios correspondientes.
  3. Si desmarca barrios que ya tenía asignados, el sistema solicita confirmación explícita antes de guardar.
  4. El servidor verifica que nadie más haya modificado la lista (`expectedIds`), inserta las nuevas asignaciones y finaliza las retiradas conservando el historial en `discipulador_barrio`.
  5. El mapa actualiza inmediatamente los ubicadores con la foto y nombre del discipulador.

---

## 11. Cómo Instalar, Configurar y Publicar la Plataforma

### 11.1. Requisitos previos del entorno
- **Node.js:** versión `22.12.0` o superior (verificado también en Node 24).
- **MySQL Server:** versión `8.4.11 LTS` (en el proyecto se incluye el instalador `public/mysql-8.4.11-winx64.msi` para entorno local Windows).
- **Navegador moderno:** Chrome, Edge, Firefox o Safari.

### 11.2. Configuración de variables de entorno (`.env`)
Crear un archivo `.env` en la raíz del proyecto tomando como plantilla `.env.example`:

```ini
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu_password_mysql
DB_NAME=el_calvario
API_PORT=3001
APP_ORIGINS=http://127.0.0.1:5173,http://localhost:5173

# Clave pública del navegador para el mapa (restringir por referente HTTP y Maps JavaScript API)
VITE_GOOGLE_MAPS_API_KEY=

# Variables exclusivas del servidor para transmisiones de Facebook (nunca usar prefijo VITE_)
FACEBOOK_PAGE_ID=61556906195984
FACEBOOK_PAGE_ACCESS_TOKEN=
FACEBOOK_GRAPH_VERSION=v21.0
FACEBOOK_FALLBACK_VIDEO=https://www.facebook.com/61556906195984/videos/1641403047771920/
```

### 11.3. Comandos de instalación, base de datos y desarrollo local

```sh
# 1. Instalar dependencias del proyecto
npm install

# 2. Crear la base de datos el_calvario si aún no existe y verificar conexión
npm run db:init
npm run db:check

# 3. Aplicar las 12 migraciones SQL (001 a 012) de forma segura
npm run db:migrate

# 4. (Opcional) Importar el catálogo municipal de barrios de Villavicencio y sus geometrías GeoJSON
node scripts/import-neighborhood-catalog.mjs --apply
node scripts/import-geodata.mjs --apply --source "Barrios Villavicencio ArcGIS"

# 5. Iniciar en una sola terminal la API (puerto 3001) y la web en Vite (http://127.0.0.1:5173)
npm run dev
```

### 11.4. Compilación y publicación en producción (Despliegue)

```sh
# Verificar tipos de TypeScript y generar la compilación de producción en dist/ (con sw.js)
npm run typecheck
npm run build

# Previsualizar localmente la versión compilada
npm run preview
```

**Pasos recomendados para publicar en un servidor de producción:**
1. **Base de datos limpia para el propietario:** en el servidor de producción, crear una cuenta MySQL exclusiva para la aplicación (con permisos sobre `el_calvario`, sin usar `root`), ejecutar `npm run db:init` y `npm run db:migrate`. No copiar usuarios de desarrollo: la primera persona que se registre en `/#registro` en producción será automáticamente el **Superadmin** de la iglesia.
2. **Variables de producción:** definir `NODE_ENV=production` y configurar en `APP_ORIGINS` el dominio HTTPS real de la iglesia (por ejemplo, `https://elcalvariovillavicencio.org`).
3. **Servidor web y proxy inverso HTTPS:** publicar la carpeta estática `dist/` mediante Nginx, Caddy o Apache bajo **HTTPS** (indispensable para que la cookie `Secure` y la instalación de la PWA funcionen en celulares) y redirigir el prefijo `/api` hacia `http://127.0.0.1:3001`.
4. **Proceso del backend:** ejecutar `npm run start:api` (`node server/index.js`) bajo un administrador de procesos como PM2 o un servicio `systemd`.
5. **Respaldos previos a futuras migraciones:** dado que las sentencias DDL en MySQL realizan commit implícito, realizar siempre un volcado (`mysqldump`) antes de ejecutar nuevas migraciones.

---

## 12. Pruebas Automatizadas y Verificación del Sistema

La plataforma cuenta con una batería completa de pruebas automatizadas en la carpeta `checks/`. Las pruebas de dominio crean una **base de datos temporal aislada con UUID**, ejecutan todas las migraciones y la eliminan al terminar, por lo que nunca alteran los datos reales de la iglesia:

| Comando | Script ejecutado | Qué comprueba en la plataforma |
| --- | --- | --- |
| `npm run test:unit` | `checks/origin.test.mjs` y `checks/facebook.test.mjs` | Validación de orígenes permitidos/rechazados (CSRF) y conector de Facebook con respuestas simuladas de directo (`LIVE`), video (`VOD`), caché y caídas de Meta. |
| `npm run test:church` | `checks/church-check.mjs` | Migraciones repetidas, RBAC, alcance de Discipulador, protección de datos sensibles, historial de grupo/cobertura, ministerios, procesos de apertura, asistencia manual/QR/visitantes, cálculo cronológico de alertas, consentimiento y los 6 reportes PDF/XLSX. |
| `npm run test:church:ui` | `checks/church-ui-check.mjs` | Pruebas de navegador (Playwright/Edge) de los formularios, permisos y diseño responsivo en 1440 px, 390 px y 320 px. |
| `npm run test:account` | `checks/account-check.mjs` | Actualización de nombre y correo, cambio de contraseña, revocación de sesiones paralelas, subida/recorte/privacidad de foto de perfil y menús en móvil y escritorio. |
| `npm run test:display` | `checks/display-size-check.mjs` | Persistencia y escalado visual de los tamaños *Normal*, *Grande* y *Muy grande* a 320, 390, 768 y 1440 px. |
| `npm run test:pastoral` | `checks/pastoral-check.mjs` | Los 6 niveles de la jerarquía pastoral, alta transaccional de administrativos con cuenta y foto, restricciones de Discipulador y reversión ante fallos. |
| `npm run test:pwa` | `checks/pwa-check.mjs` | Manifiesto web, íconos, criterios de instalación del navegador, exclusión de `/api/` en caché y pantalla `/offline.html` con reintento. |
| `npm run test:map` | `checks/map-check.mjs` | Importación sin duplicados del catálogo de barrios y GeoJSON, permisos, privacidad cartográfica, conteos, concurrencia e historial de asignaciones. |
| `npm run test:map:ui` | `checks/map-check.mjs --ui` | Interfaz del mapa a 320/390/768/1440 px, carga diferida, resiliencia del modo Lista ante caída de Google Maps, ficha inferior y guardado con confirmación. |
| `node checks/superadmin-check.mjs` | `checks/superadmin-check.mjs` | Asignación atómica del primer Superadmin bajo registros concurrentes y bloqueo permanente de `bootstrap_completado`. |
| `node checks/auth-check.mjs` | `checks/auth-check.mjs` | Flujo real de registro, login, sesión y activación del límite de intentos (rate limit). |

---

## 13. Limitaciones Conocidas y Aspectos Pendientes

1. **Vista administrativa de solicitudes de participación:** el formulario público *"Quiero participar"* valida y guarda correctamente los registros en la tabla `solicitud_participacion`, pero aún no se ha incluido una pestaña dentro del panel `/#gestion` para listarlos desde la interfaz.
2. **Sin envío de correos electrónicos ni SMS:** la plataforma no integra un servidor SMTP externo; la recuperación de contraseñas y la notificación de activación de cuentas se gestionan de forma directa a través de la administración pastoral.
3. **Operación de datos en línea:** la PWA ofrece pantalla de reconexión sin internet y precachea la interfaz, pero la consulta y el guardado de registros exigen conexión activa con el servidor (no hay cola de sincronización offline de escrituras).
4. **Límites de intentos en memoria y paginación:** el rate limiting por IP se almacena en la memoria del proceso Node.js (se reinicia al reiniciar el servidor) y las consultas de discípulos y actividades están acotadas a 500 resultados; para volúmenes mayores a futuro se deberá añadir paginación por cursor.
5. **Credenciales de producción pendientes de configurar en `.env`:**
   - `FACEBOOK_PAGE_ACCESS_TOKEN` y `FACEBOOK_GRAPH_VERSION` con permisos de lectura de la página oficial de Meta para activar la detección automática de directos en producción.
   - `VITE_GOOGLE_MAPS_API_KEY` restringida por referente HTTP para el mapa interactivo en producción.
6. **Validaciones institucionales y documentales pendientes por parte de la iglesia:**
   - Nombres definitivos y responsables iniciales de los 5 Grupos de Comunión Familiar.
   - Responsables, descripciones extensas y horarios específicos de cada ministerio.
   - Política formal de tiempos de retención y efectos administrativos ante la revocación del consentimiento de datos.
   - Validación documental/institucional de los contornos cartográficos de barrios importados de fuentes públicas de Villavicencio.

---

## 14. Glosario de Términos

| Término | Definición en la plataforma |
| --- | --- |
| **Discípulo** | Integrante registrado en la iglesia (almacenado en la tabla `miembro`). |
| **Administrativo** | Discípulo con cargo pastoral registrado junto con una cuenta activa de acceso al sistema. |
| **Grupo de Comunión Familiar** | Grupo pequeño de reunión y cuidado pastoral en los barrios (tabla `grupo_comunion`); equivale al término "sector". |
| **Discipulador** | Líder responsable de uno o varios Grupos de Comunión Familiar (nivel jerárquico 6). |
| **Autoridad pastoral** | Facultad reservada a los niveles jerárquicos 1 al 5 (*Apóstol General, Asistencia Apostólica, Pastor de Distrito, Pastor Local, Asistencia Pastoral*) y al `Superadmin` para ejecutar acciones de gobierno eclesiástico. |
| **Cobertura pastoral** | Acompañamiento espiritual asignado a un discípulo (`id_cobertura_pastoral`), o conjunto de barrios asignados a un discipulador en el mapa (`discipulador_barrio`). |
| **Alcance (`todos` / `grupo`)** | Ámbito de aplicación de un permiso RBAC: en toda la iglesia (`todos`) o restringido a los grupos del discipulador (`grupo`). |
| **Archivado lógico** | Desactivación de un registro (`archivado = 1`) que lo oculta de los listados operativos sin borrar su fila ni romper el historial en la base de datos. |
| **Bootstrap** | Proceso único en el que la primera cuenta registrada en una instalación nueva recibe el rol `Superadmin`. |
| **PWA** | Aplicación Web Progresiva (*Progressive Web App*) que puede instalarse en teléfonos y computadores desde el navegador. |

---

## 15. Referencias Bibliográficas

ChurchTrac. (2026). *ChurchTrac - Church management software*. https://www.churchtrac.com/

Congreso de Colombia. (1982). *Ley 23 de 1982, sobre derechos de autor*. Dirección Nacional de Derecho de Autor. https://www.derechodeautor.gov.co/

Congreso de Colombia. (2009). *Ley 1273 de 2009, por medio de la cual se modifica el Código Penal y se crea un nuevo bien jurídico tutelado denominado "de la protección de la información y de los datos"*. Función Pública. https://www.funcionpublica.gov.co/

Congreso de Colombia. (2012). *Ley Estatutaria 1581 de 2012, por la cual se dictan disposiciones generales para la protección de datos personales*. Función Pública. https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981

Oracle. (2026). *MySQL 8.4 Reference Manual*. https://dev.mysql.com/doc/refman/8.4/en/

Planning Center. (2026). *Planning Center People: Membership management*. https://www.planningcenter.com/people

Planning Center. (2026). *Planning Center as a church management system*. https://www.planningcenter.com/use-cases/chms

Schwaber, K., & Sutherland, J. (2020). *The Scrum Guide: The definitive guide to Scrum*. https://scrumguides.org/scrum-guide.html
