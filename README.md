# ElaBela Media

Estudio de marketing de ElaBela: referencias con fuentes, productos reales, textos en español o portugués, tres propuestas visuales y un carrusel final que podés componer antes de publicar.

## Abrir en esta PC

Doble clic en **`Iniciar ElaBela Media.cmd`**. Abre la página y deja el servicio local en segundo plano. Para terminar, ejecutá **`Detener ElaBela Media.cmd`** cuando no haya trabajos activos. No se instala un servicio permanente de Windows.

Con el servicio abierto, también podés entrar directamente a **http://127.0.0.1:4317/**: la pestaña local se conecta automáticamente, incluso sin el enlace del iniciador. Si necesitás reintentar, **Conectar** muestra el progreso y cualquier error dentro del diálogo; no hace falta completar la conexión manual para esta página.

El servicio es un programa de este proyecto que guarda archivos y habla con el generador y Meta. Escucha solamente en `127.0.0.1:4317`. La PC debe permanecer encendida para generar o publicar; cerrar el navegador no detiene un trabajo ya iniciado. Si se detiene el programa, los trabajos interrumpidos se conservan y no se reenvían automáticamente.

Requisitos: Windows, Node 24.17 o posterior de la rama 24, npm, y el publicador existente en `D:\ElaBela\MetaBusiness`. En esta PC las dependencias locales y los logos ya están preparados. Una clonación nueva necesita `npm ci --ignore-scripts`, su logo y una captura del catálogo.

## Flujo de trabajo

1. **Radar creativo:** elegí Maquillaje, Skincare, Uñas, Fragancias, Cabello o Estilo de vida alrededor de la esfera. La selección filtra la biblioteca y orienta la próxima búsqueda. Elegí inspiración, carruseles, tutoriales, humor o diseño de producto. **Explorar todas las categorías** abre la búsqueda general, limpia los filtros y conserva el estilo elegido. Revisá el texto y pulsá **Iniciar investigación** para usar Codex en esta PC. Las referencias muestran imagen, logo de la plataforma, fuente, fecha y motivo. Guardá las favoritas; sobreviven a nuevas búsquedas.
2. **Crear campaña:** elegí productos, español/PT-BR y entre 1 y 10 piezas. Tres propuestas de tres piezas son nueve imágenes separadas.
3. **Textos:** elegí y editá una de las tres opciones de titulares, textos de cada imagen y descripción. Aprobá antes de generar.
4. **Propuestas:** pulsá **Preparar 3 propuestas en Codex**, copiá el pedido y pegalo en este chat. Codex genera cada imagen con su herramienta del chat e importa los originales PNG/JPEG/WebP 4:5 en la propuesta y posición correspondientes. Podés pedir otra versión de una pieza. La página muestra el avance; preparar el pedido no inicia la generación por sí solo.
5. **Tu carrusel final:** arrastrá imágenes al orden final o usá los botones de añadir, reemplazar y mover. Mezclar no altera las propuestas. Abrí el visor al 100 % y descargá el original.
6. **Revisar y publicar:** comprobá texto, producto, envase y orden. La confirmación explícita envía a Instagram y Facebook. Si el resultado queda incierto/parcial, **Consultar estado en Meta** solo consulta; no repite el envío.

Al crear imágenes quedan fijos el brief y los textos dentro de ellas. La descripción sigue editable hasta publicar. Para otra dirección creativa, creá otra campaña.

## Configuración privada

Copiá `.env.example` a `.env` únicamente si este último no existe. Nunca subas `.env`, la clave de emparejamiento ni archivos de `.secrets`.

- `ELABELA_RESEARCH_PROVIDER`: `codex` de forma predeterminada. Usa la sesión y los límites de Codex de esta PC, sin clave API. `api` activa el proveedor API opcional.
- `ELABELA_CODEX_PATH`: opcional si el ejecutable `codex` no está en PATH.
- `ELABELA_GENERATION_PROVIDER`: `codex-chat` de forma predeterminada, incluso si existe una clave API. Prepara pedidos para generar en este chat e importar originales; los textos iniciales son opciones locales editables. No requiere `OPENAI_API_KEY`.
- `OPENAI_API_KEY`: solo para proveedores API opcionales seleccionados explícitamente. No se utiliza para generar imágenes ni textos en el flujo predeterminado del chat. Las llamadas API opcionales tienen facturación separada.
- `OPENAI_IMAGE_MODEL`: perfil configurado `gpt-image-2.5-sunburst`, alta calidad, PNG 1536×1920 (4:5).
- `OPENAI_SEARCH_MODEL` y `OPENAI_COPY_MODEL`: `gpt-6-astra` para el proveedor API opcional y los textos, respectivamente.
- `META_BUSINESS_DIR`, `META_PAGE_ID`, `META_INSTAGRAM_BUSINESS_ID`: conexión con el publicador existente. El worker descifra el token protegido de Windows; no lo manda al navegador.
- `ELABELA_WEB_URL`: origen HTTPS exacto de tu web cuando la despliegues.

Reiniciá el servicio después de cambiar `.env` o actualizar código. Cada investigación tiene un límite de diez minutos y no se repite automáticamente si falla. La vista **Referencias visuales** prioriza ejemplos concretos de cosméticos con imagen; **Todas las ideas** conserva el contexto sin fingir imágenes disponibles. Podés ampliar y elegir una imagen específica antes de crear la campaña.

**Estado de integración:** el catálogo inicial contiene 1.573 productos, 199 marcas y 61 categorías (captura del 9/9/2026). La selección inicial contiene siete referencias concretas de cosméticos revisadas visualmente; dos provienen de la nueva búsqueda comprobada desde el botón. Los tests de generación/importación usan imágenes identificadas como prueba; no se generó ni publicó una campaña real durante esta implementación. El primer pedido aprobado permitirá comprobar la generación del chat con sus productos y logo. Encontrar la credencial Meta no prueba permisos de escritura vigentes.

## Subir la interfaz a Vercel

Importá [Bryan-dev074/ElaBela-Media](https://github.com/Bryan-dev074/ElaBela-Media). Framework **Vite**, build **`npm run build`**, salida **`dist`**, Node **24.x**. `vercel.json` deja estas opciones preparadas. No agregues claves Meta/OpenAI a Vercel.

En esta PC, configurá `ELABELA_WEB_URL=https://tu-dominio.vercel.app` y abrí el iniciador. Este permite el dominio exacto y empareja la pestaña sin mostrar el código en la consola. El navegador puede pedir permiso para acceder a la red local. La conexión con un dominio Vercel real queda pendiente hasta tu despliegue; siempre podés abrir la versión local completa.

Vercel sirve la interfaz; no accede a `D:`. La web abierta desde un teléfono no se conecta automáticamente a esta PC. [Guía de operación](docs/operacion/servicio-local.md).

## Archivos y mantenimiento

- `.local/`: estado, revisiones, trabajos, emparejamiento y punteros de recuperación. Privado.
- `datos/catalogo/`: capturas completas, con fecha; precios/stock no son en tiempo real.
- `data/trends.json`: selección editorial inicial, con URLs públicas. `data/references/`: copias locales de las imágenes.
- `contenido/AAAA/MM/id/`: originales, previews, pedidos-codex con brief/manifiesto/fuentes y staging/checkpoints de publicaciones.
- `investigacion/AAAA-MM-DD/`: hallazgos y evidencia.

La selección final es una lista ordenada de IDs en el estado de campaña. Al publicar se crea un manifiesto y copias JPEG 1080×1350, manteniendo los masters intactos. Hacé copia de `.local`, `contenido`, `datos`, `data/references` y `logo` con el servicio detenido. No borres checkpoints para intentar publicar de nuevo.

Comandos desde la raíz:

```powershell
npm run catalogo:actualizar -- --comprobar # Verificar fuente sin reemplazar datos
npm run catalogo:actualizar              # Captura nueva; luego reiniciar
npm run trends:importar -- ruta/hallazgos.json
npm run codex:importar -- --help          # Importar salida del chat en su pedido/posición
npm run reconcile -- --help
npm run dev                             # Frontend de desarrollo; servicio aparte
npm run server
```

[Cómo buscar y curar ideas](docs/operacion/buscar-trends.md) · [Generar desde el chat](docs/operacion/generar-en-chat.md) · [Referencias seleccionadas](investigacion/2026-09-09/referencias-cosmeticos.md) · [Diseño](DESIGN.md) · [Decisión de arquitectura](docs/adr/0001-arquitectura-local-propuesta.md) · [Librerías](LIBRERIAS.md).

## Verificación

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run check:bundle
npm run test:e2e
npm audit --audit-level=high
```

Playwright usa Chrome instalado en Windows y Chromium en CI. Las pruebas levantan un servicio aislado con fixtures, sin claves reales ni publicaciones. Se comprueba selección PT-BR, mezcla/orden, persistencia, original idéntico byte a byte, confirmación explícita y accesibilidad del radar, estudio y modal. El presupuesto de JS inicial es 220 KiB gzip. [Detalle de verificación](docs/verificacion.md).

Opcionales para una siguiente versión: calendario editorial, presets de marca/tono y métricas de publicaciones. No se activaron automatizaciones ni servicios en la nube adicionales.
