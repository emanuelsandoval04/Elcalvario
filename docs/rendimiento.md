# Rendimiento y carga en móviles

La portada carga el código público. Login, recuperación, Gestión y Usuarios descargan su código y estilos al abrirse. Los errores al descargar una sección muestran una acción para recargar y un enlace al inicio.

Las fotos se sirven desde `public/media/` en WebP y tres anchos (480, 960 y 1280 px), seleccionados mediante `srcset`. Los originales se conservan. El carrusel mantiene como máximo dos imágenes montadas; prepara la siguiente cerca de su turno y espera a que se decodifique antes de mostrarla. Se detiene cuando queda fuera de pantalla, cuando la pestaña está oculta o cuando el usuario lo pausa. La preferencia de movimiento reducido y el ahorro de datos lo inician pausado.

En móviles se evitan los desenfoques del fondo y las animaciones de interacción del panel. Manrope se sirve localmente en un archivo WOFF2 variable de 24,5 kB, con su licencia OFL en `public/fonts/`. Los estilos de accesibilidad permanecen en la hoja global.

Las consultas simultáneas de sesión comparten la petición en curso, sin guardar permisos en caché. Las dos secciones que usan el catálogo público de ministerios comparten su descarga. La agenda pública, la sesión y las notificaciones evitan consultas periódicas en pestañas ocultas o sin conexión; volver a la pestaña evita la doble consulta de los eventos `focus` y `visibilitychange`.

El service worker instala únicamente la pantalla sin conexión y su icono. Guarda los archivos JS/CSS con hash cuando se usan, sin descargar anticipadamente las pantallas privadas. Las sesiones y respuestas de la API nunca se guardan en esa caché. Vercel conserva los archivos con hash y la fuente versionada durante un año; las imágenes optimizadas, durante un día. El HTML mantiene su revalidación.

## Medición de referencia

Prueba local en Edge, pantalla de 390 × 844 px, CPU ralentizada 6 veces, descarga de 1,6 Mbps y latencia de 150 ms. Caché fría, sin service worker, servidor estático sin compresión y respuestas de API simuladas. Las fuentes externas se bloquean en ambas mediciones; la versión optimizada carga su fuente local. El carrusel se pausa para contabilizar las descargas de entrada sin incluir rotaciones posteriores.

| Medida | Antes | Después |
| --- | ---: | ---: |
| Contenido principal, LCP | 7,9 s | 2,8 s |
| JavaScript inicial, incluidos módulos compartidos | 490,4 kB | 269,9 kB |
| CSS inicial, incluidos estilos compartidos | 137,9 kB | 31,8 kB |
| Imágenes solicitadas al abrir | 2.566,2 kB | 81,6 kB |
| Tiempo acumulado de tareas largas | 877 ms | 230 ms aprox. |
| Desplazamiento visual, CLS | 0 | 0 |

Estos resultados describen el perfil controlado, no los tiempos de la API o del despliegue público ni todos los dispositivos físicos. Los archivos de referencia y las capturas quedan en `.backups/performance/`, ignorados por Git.

## Comprobación y mantenimiento

```powershell
npm run build
node checks/performance-check.mjs
```

El comprobador requiere Playwright y Edge. Puede usar `PLAYWRIGHT_MODULE` para indicar una instalación existente; por defecto busca Playwright en `.backups/performance-tools/node_modules/playwright`. Para preparar las herramientas sin cambiar las dependencias de la aplicación:

```powershell
npm install --prefix .backups/performance-tools --no-package-lock --ignore-scripts playwright
```

`--baseline` guarda una referencia previa; debe ejecutarse antes de modificar o sustituir la compilación original. La ejecución normal comprueba presupuestos de carga, diseños de 320 a 1440 px, las ocho fotografías, descargas lentas, pausa, pestaña oculta, enlaces internos, pantallas cargadas bajo demanda, recuperación ante descarga interrumpida y funcionamiento sin conexión. Los resultados funcionales adicionales se verificaron con `test:account-creation:ui`, `test:notifications:ui` y `test:community-tools:ui`, usando bases temporales locales.

Si se reemplazan fotografías o logos, regenerar las variantes con Pillow instalado:

```powershell
python scripts/optimize-images.py
```

La aplicación y su compilación no necesitan Python ni Pillow. Una nueva versión de la fuente debe usar otro nombre de archivo, por su caché inmutable. Las imágenes con el mismo nombre pueden permanecer hasta un día en la caché del navegador.
