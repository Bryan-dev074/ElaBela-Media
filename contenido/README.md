# Archivos de campaña

Aún no se generó una campaña real durante el desarrollo. Los fixtures de pruebas están separados y nunca se publican.

Cada campaña utiliza `AAAA/MM/<id UUID>/`:

- `originales/`: masters de la galería. Importaciones intactas; imágenes generadas con el logo suministrado aplicado en el pie reservado.
- `previews/`: WebP ligeros para navegar. El visor/descarga usan el original.
- `fuentes-generacion/`: salida cruda del proveedor y metadatos por pieza; entradas/manifiesto de generación en subcarpetas del job.
- `publicacion/<job>/`: plan, staging JPEG 1080×1350, checkpoints e historial de recuperación.

El brief, las opciones de texto, propuestas y orden final viven en `.local/state.json`, asociados por ID. El carrusel final referencia las piezas elegidas sin mover ni sobrescribir las propuestas. El plan de publicación fija ese orden explícitamente.

Para respaldar, detener el servicio y copiar juntos `.local`, `contenido`, `datos`, `data/references` y `logo`. No publicar estas carpetas privadas en GitHub.
