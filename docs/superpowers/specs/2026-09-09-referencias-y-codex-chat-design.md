# Referencias visuales y generación desde el chat

Bryan corrigió el alcance el 9/9/2026: sólo cosméticos, belleza y productos pertinentes al catálogo ElaBela; quiere elegir imágenes de anuncios, composiciones y carruseles como en Pinterest. Rechaza usar una API de pago para generar y pide generar en este chat y registrar los archivos resultantes en la app. El envío inicial a Codex de investigación sigue mediante la CLI existente.

## Flujo acordado por las instrucciones del usuario

1. Investigar ejemplos visuales concretos de belleza. Cada imagen tiene página original; informes anuales y portadas genéricas no sustituyen un ejemplo. Conservar los datos existentes pero retirar imágenes no relacionadas, incluido el collage de fútbol identificado por Bryan.
2. Ver referencias visuales, guardar favoritas, ampliar y elegir una imagen como base. Las ideas sin imagen quedan disponibles en una vista de ideas/informes, con el motivo; no rellenar huecos con fotos ajenas al hallazgo. Una URL rota muestra una explicación y acceso a la fuente.
3. Elegir productos, ES/PT, cantidad y textos como antes. Conservar la referencia concreta elegida en la campaña.
4. Preparar en la página un pedido local para Codex con los textos aprobados, productos, logo, referencia, destinos y prompts de cada pieza. El usuario trae el pedido a este chat con un texto copiable. No existe un enlace verificado que permita a la página invocar la herramienta de imágenes de este chat: no simular ejecución ni dejar un trabajo bloqueando la app mientras espera.
5. Codex usa la herramienta de imágenes integrada, una imagen por pieza, y copia/importa el resultado original en la propuesta y posición correctas. Formato real 4:5, logo suministrado y envase fiel. No usar la API como fallback automático. Conservar cada versión y las salidas inválidas para revisión.
6. La página actualiza las piezas, permite combinar y descargar originales. Publicar conserva la confirmación y API Meta existente.

## Decisiones y límites

Se reutilizan React, Radix, CSS, Fastify, Sharp para validación/previews y el almacenamiento existente. Sin dependencias nuevas, automatizaciones, conexiones LAN ni cambios de firewall. La ruta API creativa existente puede conservarse como legado explícito, pero el modo de producción predeterminado será `codex-chat`, aun si existe una clave en el entorno. No se recomienda configurar una clave para este flujo.

Los pedidos son archivos locales versionados y metadatos persistidos de campaña; no son trabajos `running`. Importar exige que el pedido siga vigente y que coincidan los productos, textos de imagen aprobados, idioma, cantidad, referencia y destino. Ediciones posteriores invalidan un pedido viejo. Las repeticiones con los mismos bytes no duplican una pieza. No se cambia la composición final automáticamente.

No se elimina el historial privado ni los favoritos al mejorar la investigación. Una revisión de las imágenes actuales distinguirá referencias concretas de informes y reemplazará únicamente asociaciones incorrectas con evidencia nueva. Las imágenes de fuentes son referencias ajenas, nunca creatividades propias de ElaBela.

## Validación

Regresión de búsqueda: rechazar portadas genéricas y asuntos ajenos a belleza; permitir pins/publicaciones concretos con imágenes procedentes de esa misma página. Regresión de flujo: seleccionar segunda referencia, persistir campaña, aprobar texto, preparar pedido sin clave ni llamada paga, importar 3×N PNG de prueba, reintentar sin duplicar, rechazar pedidos viejos y bytes que no sean 4:5, comprobar originales, recarga y cancelación. Axe, revisión visual en escritorio/móvil, tipos, lint, unitarios, E2E, build, bundle y CI antes del cierre.
