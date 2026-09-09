# Generar imágenes en el chat de Codex

El flujo predeterminado usa la herramienta de imágenes disponible en el chat. No necesita clave API; depende de la disponibilidad y los límites de la cuenta. La investigación sí arranca desde el botón de la app. Para imágenes, la app prepara un pedido persistido que Bryan pega en el chat; no existe un puente verificado que active esta herramienta desde la web.

1. Elegir una imagen en Referencias visuales y crear campaña con productos, idioma y cantidad.
2. Elegir/editar los textos y aprobarlos. Preparar el pedido para Codex desde Propuestas.
3. Copiar la instrucción del panel y pegarla en el chat. Contiene la ruta al brief guardado, que relaciona campaña, pedido, productos, referencia, logo y cada destino.
4. Codex lee brief y manifiesto, inspecciona los archivos de referencia, producto y logo, y genera una imagen separada por destino con su herramienta integrada. Un carrusel de tres piezas y tres propuestas requiere nueve imágenes, no una lámina con nueve cuadros.
5. Inspeccionar cada resultado: texto, envase, logo, producto, dimensiones 4:5 y orden narrativo. Si falla, corregir con la herramienta antes de importar; no dibujar otro logo ni reencuadrar el original mediante el importador.
6. Importar cada salida con el comando que corresponda al pedido. La posición `slot` empieza en cero:

```powershell
npm run codex:importar -- --campaign ID_CAMPANA --request ID_PEDIDO --variant ID_PROPUESTA --slot 0 --file 'C:\ruta\original.png'
```

El servicio debe estar abierto. El importador usa el emparejamiento privado, valida el pedido y conserva los bytes originales. También se puede subir el archivo desde el casillero de la app. No sustituye la composición final elegida por Bryan. Un reintento idéntico no duplica el asset; un pedido cancelado, un contenido cambiado o una posición ya reemplazada se rechazan. No reintentar a ciegas si el resultado no es claro: refrescar la campaña primero.

Un pedido pendiente no es un trabajo ejecutándose: la biblioteca y la descripción siguen disponibles. Cancelarlo invalida futuras importaciones y conserva las imágenes ya recibidas; no interrumpe el chat. La app muestra avance por destino. Después, Bryan mezcla/ordena el carrusel, revisa los originales y confirma antes de publicar.

Los archivos quedan en `contenido/AAAA/MM/CAMPANA/pedidos-codex/PEDIDO/` y las carpetas de originales/previews de la campaña. No subir estos archivos privados a GitHub. La descripción puede editarse sin invalidar las imágenes; no se aprueba automáticamente para publicar.
