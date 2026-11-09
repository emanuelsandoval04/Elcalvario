# Importación de fichas completas por Excel

La plantilla de **Discípulos → Importar desde Excel** contiene los 19 campos de la ficha: nombres, apellidos, tipo y número de identificación, celular, correo, fecha de nacimiento, grupo sanguíneo/RH, EPS, contacto y celular de emergencia, función en la iglesia, sede, rol eclesiástico, grupo de comunión, cobertura pastoral, libro de adiestramiento, ministerios y estado. Una columna adicional **Código de grupo** mantiene compatibilidad con las plantillas anteriores.

Los cinco campos básicos siguen siendo obligatorios: nombres, tipo de identificación, identificación, celular y fecha de nacimiento. Los datos opcionales admiten celdas vacías o `Sin registrar`. El estado vacío se interpreta como `activo`.

La hoja **Referencias** contiene nombres de sedes, roles, grupos, códigos de grupo, libros y ministerios existentes, además de los valores permitidos de RH y estado. Se muestran hasta 500 referencias por categoría, respetando el alcance del usuario para grupos. La columna **Cobertura pastoral** acepta el nombre completo de una persona ya registrada o su tipo y número de identificación, como `CC 123456789`. Los nombres ambiguos se rechazan; no se elige la primera coincidencia.

Cada fila puede indicar su propio libro por nombre. La selección en la web funciona como libro por defecto para filas sin libro. Si existen libros en el catálogo, ninguna ficha se importa sin uno. Los ministerios se separan con punto y coma (`Alabanza; Enseñanza`). No se crean catálogos automáticamente.

La vista previa y el editor muestran todas las columnas y los errores de cada campo. En celular, la tabla conserva el desplazamiento horizontal. Se revisan duplicados, catálogos y permisos tanto al previsualizar como al guardar. Cambiar el libro por defecto obliga a generar otra vista previa.

Se mantienen los permisos actuales: datos de salud/emergencia requieren `miembros.sensibles`; funciones y coberturas requieren autoridad pastoral; cargos requieren autorización para registrar administrativos; ministerios y estados distintos de activo requieren sus permisos y alcances respectivos. La importación registra fichas y sus asignaciones, sin crear cuentas, enviar correos ni acreditar autorización de privacidad.

El guardado es atómico e incluye el estado inicial real en el historial y todos los ministerios de cada ficha. Si falla una asignación, se revierte el lote. No se reemplazan fichas existentes.

Los campos se definen en `shared/member-import-fields.json` y se comparten entre la plantilla, el servidor y el editor. No se necesita migrar la base de datos para esta ampliación. `npm run test:community-tools:ui` verifica los campos completos, persistencia, permisos, compatibilidad, correcciones en navegador y tamaños desde 320 píxeles con una base temporal local.
