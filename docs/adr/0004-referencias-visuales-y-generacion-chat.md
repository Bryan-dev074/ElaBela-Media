# ADR 0004 — Referencias concretas y generación desde el chat

Fecha: 2026-09-09. Estado: aceptada por las instrucciones de Bryan. Reemplaza la decisión de generación API predeterminada del ADR 0002.

## Decisión

La investigación exige fuentes específicas de cosméticos compatibles con el catálogo. Verifica metadatos de la página original, asocia cada imagen únicamente a esa fuente y clasifica contexto/imagen no disponible. La biblioteca muestra ejemplos visuales por defecto; informes y tableros no aportan sus portadas como referencia. Se guarda `referenceId` en la campaña para trasladar la imagen elegida al brief. La curación manual incluye revisión visual: el filtro de metadatos no interpreta píxeles.

La generación predeterminada es `codex-chat`, incluso con clave API configurada. Preparar un pedido captura los inputs elegidos y persiste brief/manifiesto/destinos. No crea un job permanentemente ocupado ni invoca de forma ficticia el chat. Bryan copia el pedido; Codex genera con la herramienta integrada y el importador coloca los originales por propuesta y posición. El modo API legado queda opt-in explícito, sin fallback automático.

Cada pedido captura hash creativo y destinos. Cancelación, obsolescencia, sustitución concurrente y reintentos idénticos se controlan en la cola de escritura del Store. Caption/final pueden seguir editándose aunque la referencia histórica salga del radar. Un pedido nuevo vuelve a validar fuentes; reabrir el mismo usa su captura. Los originales no se recomprimen ni se retocan al importar, y los cambios no aprueban la publicación.

## Alternativas y coste

Se descarta activar un cobro API para imitar la generación incluida en el chat. No hay un protocolo verificado para accionar la herramienta del chat directamente desde la página: el paso de copiar el pedido es explícito. No se leen credenciales internas de Codex. Galería, selección y visor reutilizan React, controles nativos, CSS y Radix; no se agrega dependencia de masonry, lightbox, estado remoto ni otro motor de animación.

## Reversión y validación

La copia fechada privada conserva el estado y la semilla previos a la curación; los assets históricos permanecen. Revertir código/datos mediante Git y restaurar estado únicamente con servicio detenido y sin pisar trabajo posterior. Pruebas cubren importación byte a byte, destinos, cancelación/obsolescencia, referencia seleccionada, errores de imagen, proveedores y accesibilidad. Resultados ejecutados en `docs/verificacion.md`.
