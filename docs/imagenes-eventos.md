# Imágenes de eventos

En **Gestión → Eventos → Nuevo evento / Editar**, el campo *Imagen del evento* permite:

- **Subir imagen**: JPG, PNG o WebP de hasta 15 MB. El navegador la reduce a un JPEG de máximo 1600 px por lado y 900 KB antes de enviarla, así que se ve igual en la web y carga rápido.
- **Quitar imagen**.
- **Usar un enlace en su lugar**: se sigue aceptando una URL HTTPS o un archivo del sitio (por ejemplo `/media/...`), como antes.

## Cómo funciona

1. Al elegir el archivo, el formulario lo prepara y lo envía a `POST /api/management/activities/images`. Mientras sube, el botón *Guardar* queda deshabilitado.
2. El servidor valida que sea un JPEG real (marcadores, tamaño y dimensiones); rechaza PNG/SVG/HTML sin preparar, enlaces y archivos de más de 900 KB.
3. La imagen se guarda en MySQL, en la tabla `imagen_actividad` (Vercel no tiene disco permanente). La clave es el SHA-256 del contenido, así que la misma foto se guarda una sola vez.
4. El evento guarda en `actividad.imagen` la ruta `/api/public/event-images/<sha256>.jpg`, que la web pública lee sin sesión. La dirección cambia si cambia la imagen, por eso se puede guardar en caché un año.
5. Las imágenes subidas que nunca llegaron a guardarse en un evento (formulario cancelado) se borran solas pasados dos días. Las de eventos archivados y de eventos fijos se conservan.

Límite: 40 subidas por hora por cuenta.

## Publicación en producción (una sola vez)

1. Respaldar la base de Aiven.
2. `npm run db:migrate:aiven` (aplica `025-activity-images.sql`, que solo crea la tabla nueva).
3. Dar permiso a la cuenta web de MySQL (Vercel usa permisos por tabla):

   ```sql
   GRANT SELECT, INSERT, UPDATE, DELETE ON defaultdb.imagen_actividad TO '<cuenta de la app>'@'%';
   ```

4. Publicar el código. Si se publica antes del paso 3, subir una imagen responde *No pudimos completar la operación* y el registro de Vercel muestra `ER_TABLEACCESS_DENIED_ERROR` o `ER_NO_SUCH_TABLE`.

## Verificación local

```sh
npm run test:event-images
```

Usa una base temporal en MySQL local. Cubre subida, deduplicación, entrega pública, permisos, rechazo de formatos y tamaños, vínculo con el evento y limpieza de imágenes huérfanas, además de confirmar que las fotos de perfil mantienen su límite de 512 px.
