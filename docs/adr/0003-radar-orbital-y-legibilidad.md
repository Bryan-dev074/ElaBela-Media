# ADR 0003 — Radar orbital, fuentes reconocibles y lectura cómoda

Estado: aceptado. Fecha: 2026-09-09.

Bryan eligió el radar circular de la propuesta A adjunta, pidió logos de las redes en las fuentes y señaló que los textos eran demasiado pequeños. Esta decisión amplía la interfaz ya implementada; conserva los flujos de investigación, favoritos, textos, imágenes y publicación aprobada.

## Decisión

- Seis botones nativos alrededor de una esfera. La categoría seleccionada filtra por palabras completas normalizadas en categoría, título, resumen y keywords, con vocabulario ES/PT/inglés. La letra ñ se conserva para no confundir «unas ideas» con «uñas». No altera ni reetiqueta el registro original; una idea puede pertenecer a varios temas. Las categorías sin coincidencias permiten investigar o limpiar filtros.
- La temática y el estilo elegido construyen una consulta editable para la investigación existente. Ningún clic de categoría inicia por sí solo un trabajo; se confirma el texto en el diálogo. La procedencia y los productos siguen bajo los controles existentes del investigador.
- Los logos se derivan del dominio real con `platformForSource`, nunca de la etiqueta libre `platform`. Cinco SVG de Simple Icons (4.723 bytes en total) se redistribuyen con CC0 y commit fijado. Se usa globo para webs desconocidas. Los iconos son decorativos porque el nombre permanece visible.
- CSS para órbitas, sin paquete ni segundo motor de animación. Container queries adaptan el mapa al espacio disponible; el contexto pasa debajo en pantallas más estrechas. Teclado, estados seleccionados y movimiento reducido se conservan.
- Escala tipográfica común con metadatos desde 12px y lectura habitual 14–15px. Los tamaños menores usan tokens rem; no se reduce el texto a 7–10px en móvil. Se ajusta el espacio de controles y se oscurecen ayudas del editor según la medición WCAG AA.

## Alternativas

Se reemplaza el filtro inicial de pestañas planas porque no coincidía con la referencia elegida. WebGL/3D y otra biblioteca de decoración no aportan interacción necesaria. No se incorpora el paquete entero de iconos ni se consulta una CDN en cada visita.

## Validación y reversión

Playwright comprueba que elegir Uñas y Tutoriales filtra una referencia PT, envía el texto editado al endpoint existente y mantiene favoritos. Comprueba los cinco logos, el fallback ante un dominio parecido a Instagram, enlaces originales, teclado y móvil. La revisión visual usa la biblioteca real; los tests no llaman a Codex ni Meta. Resultados generales en `docs/verificacion.md`.

Rollback: revertir el commit de esta interfaz y reconstruir `dist`; no hay migraciones ni cambios en los archivos privados de campañas, investigación o publicaciones.
