# ADR 0006 — Recrear el diseño de la referencia elegida

Fecha: 2026-09-10. Estado: aceptada por la corrección de Bryan en este chat.

## Problema

El pedido guardaba la imagen correcta pero imponía tres estilos independientes: editorial, expresivo y gráfico. Además, indicaba tomar solo una inspiración general. El resultado cambiaba la composición que Bryan había elegido. La justificación de un trend podía mencionar otro producto y una paleta que tampoco correspondía a la imagen seleccionada.

## Decisión

Cuando hay una referencia elegida, esa imagen define composición, posición del producto, jerarquía tipográfica y estructura de llamadas. La paleta, el fondo, los materiales y las texturas se adaptan al envase, tono y características del producto seleccionado. Por ejemplo, el naranja de un anuncio de sérum con cítricos no se conserva automáticamente al adaptarlo a una base beige con envase negro. Se recrea la estructura con la identidad del nuevo producto, el logo ElaBela y textos propios aprobados. Las tres propuestas son variaciones cercanas de ese diseño adaptado. La justificación genérica del trend no se incluye en su prompt visual para evitar introducir otros productos o contradecir la imagen.

Los ingredientes, beneficios y afirmaciones del producto de referencia no se trasladan al nuevo producto. Si la composición necesita textos que no están aprobados, se proponen antes de generar. Se compara la pieza contra la referencia antes de importarla. Sin referencia seleccionada se conserva el flujo de ideas editoriales.

No se modifican pedidos ya preparados, campañas, selecciones finales ni permisos de publicación. Una muestra con texto nuevo permanece como borrador hasta su aprobación. Los pedidos cancelados siguen cancelados. No hay dependencias nuevas ni cambios de UI.

## Validación y reversión

Regresión de los nueve prompts de un pedido en ES y PT: conservan la estructura de la referencia, exigen colores y texturas del producto elegido, eliminan estilos impuestos y justificaciones ajenas y exigen comparación visual y afirmaciones compatibles. Se mantienen las pruebas de fuentes inmutables, cancelación e importación sin recomprimir. La muestra de revisión se guarda localmente; no se publica ni se agrega al pedido cancelado.

Revertir los cambios de código y documentación con Git afecta a pedidos futuros. Los archivos de pedidos y creatividades previos se conservan.
