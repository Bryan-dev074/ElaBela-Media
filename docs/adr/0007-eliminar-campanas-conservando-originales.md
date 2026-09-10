# 0007 — Eliminar campañas conservando originales

Fecha: 2026-09-10. Estado: aceptada para el pedido de Bryan de eliminar campañas.

En Mis campañas, cada tarjeta tiene un botón Eliminar separado del botón para abrirla. Un diálogo muestra el nombre completo, explica el alcance y pide confirmar. Cancelar recibe el foco inicial; al cerrar vuelve al botón, o al encabezado de la lista si la tarjeta desapareció. Progreso y errores quedan dentro del diálogo.

El servicio recibe DELETE /api/campaigns/:id con la revisión vista por el usuario. La escritura serializada mueve el registro a `deletedCampaigns` en el estado privado, con fecha; los originales, previews, assets, referencias y checkpoints permanecen. Bootstrap solo entrega campañas activas. La ausencia en la colección activa impide que guardados o importaciones tardíos la creen de nuevo. Pedidos del chat pendientes quedan cancelados en el registro conservado. No se modifica el manifiesto original.

Se rechazan revisiones obsoletas, trabajos activos y publicaciones pendientes de reconciliar. Una publicación verificada puede quitarse de la lista local sin tocar Meta: su fingerprint sigue participando en la deduplicación, incluso después de reiniciar. Repetir la misma eliminación ya confirmada devuelve éxito sin otra mutación. Una respuesta de red incierta se consulta mediante bootstrap; no se reenvía automáticamente DELETE.

Se descarta borrar carpetas porque destruye originales y evidencia; se descarta ocultar solo en el navegador porque no persiste ni evita escrituras tardías. No se añade una papelera ni restauración en la interfaz en este alcance. El registro privado conservado permite recuperación técnica, sin prometer un botón de deshacer.

Compatibilidad: estado versión 1 con colección vacía predeterminada para instalaciones anteriores. Reversión: detener el servicio y restaurar la copia fechada de `.local/state.json` junto con el código anterior. No reinstalar dependencias ni tocar `contenido/`.

Verificación: API, persistencia, bytes originales, revisión concurrente, importación tardía, bloqueos y deduplicación; E2E de confirmación/cancelación, foco, errores y móvil en el servicio aislado de pruebas. Ninguna campaña real se elimina como prueba.
