# Verificación de ElaBela Media

Fecha: 9 de septiembre de 2026. Entorno real: Windows, PowerShell, Node 24.17.0, npm 11.13.0 y Chrome instalado. Revisión independiente de integración aprobada después de corregir todos los hallazgos importantes. Este informe describe la primera versión; no sustituye comprobaciones de futuras campañas.

## Diagnóstico de descargas — 10 de septiembre de 2026

El aviso «Este dominio de referencia requiere importación manual» agrupaba causas distintas sin identificar fuente. Se separaron HTTPS, credenciales/puerto, dominio no habilitado y estado HTTP. Preparar un pedido identifica el producto o referencia que falla y no expone consultas privadas ni errores internos del sistema. Las cuatro regresiones fallaron antes de corregirlo y pasaron después; se mantiene la lista de fuentes revisadas y la validación de redirecciones.

No se reprodujo el aviso original con los datos guardados: las fotos de los productos 9072, 13451, 13147 y 13154 descargaron correctamente. En una copia aislada, ambas campañas prepararon sus nueve destinos con fuentes reales; sus campañas originales permanecieron iguales. No se generaron imágenes ni se publicó contenido. El servicio estaba detenido al iniciar el diagnóstico y se volvió a iniciar. No se habilitó un dominio nuevo sin evidencia del enlace que falló.

Comprobación de esta corrección: typecheck, Biome (78 archivos), 133 pruebas unitarias en 19 archivos, build, presupuesto (114,1 KiB gzip) y 22 pruebas de navegador aprobados. El servicio quedó reiniciado con el código actualizado. Se mantiene pendiente identificar el enlace del aviso original si vuelve a ocurrir.

## Comprobaciones locales

| Comprobación | Resultado observado |
|---|---|
| `npm run typecheck` | Correcto; TypeScript estricto |
| `npm run lint` | 78 archivos sin errores ni advertencias de Biome |
| `npm test` | 130 pruebas, 19 archivos, todas aprobadas |
| `npm run build` | Build Vite correcto |
| `npm run check:bundle` | 114,1 KiB gzip de JS inicial; presupuesto 220 KiB |
| `npm run test:e2e` | 22 pruebas aprobadas en Chrome; puerto aislado 5187 |
| `npm audit --audit-level=high` | 0 vulnerabilidades reportadas |
| Axe WCAG 2 A/AA y 2.1 AA | Sin infracciones medidas en radar escritorio/móvil, detalle de fuente, editor móvil, propuestas y confirmación |
| Radar real con 8 ideas, incluida referencia faltante | Sin errores de página ni infracciones axe después de ajustar el contraste del placeholder |
| Catálogo | 1.573 IDs únicos; 199 marcas y 61 categorías. Parser comprobado contra la fuente actual |

Las pruebas de imágenes conservan los bytes originales, validan 4:5, generan 3×N piezas con transporte simulado, conservan salidas inválidas para revisión y comprueban orden sin destruir propuestas. Las pruebas Meta no hacen publicaciones; validan claims atómicos, revisión aprobada, checkpoints, fallos ambiguos, conciliación de solo lectura, orden y comparación local de imágenes. El publicador externo existente se verificó con sus 66 pruebas durante el reconocimiento inicial y quedó sin modificaciones.

Las pruebas del navegador cubren PT-BR, textos, mezcla de propuestas por arrastre y botones, recarga, descarga original idéntica, publicación simulada confirmada, actualización de revisión, borradores guardados/sin guardar, conflictos, respuestas antiguas que llegan después de un texto nuevo y foco de navegación móvil. La revisión del radar añade selección orbital y consulta editable, filtros ES/PT, cinco logos desde dominios reales, fallback de webs, favoritos y categorías por teclado/tacto a 320px. Las imágenes de fixtures dicen PRUEBA y el transporte de publicación identifica explícitamente que no envió nada a Meta.

### Revisión solicitada: radar A y textos más legibles

La biblioteca real se revisó con 8 ideas y una selección de maquillaje. Medición en 15 anchos entre 320 y 1440px: sin scroll horizontal del documento ni superposición entre botones del radar. Capturas de escritorio y móvil, y detalle de fuente, sin errores axe WCAG AA. El editor de textos en móvil detectó 11 instancias con contraste insuficiente; se oscurecieron índices, estados, contadores y ayuda, y la prueba completa pasó después de corregirlas. Los textos habituales pasaron de 10–12px a 14–15px y los metadatos a un mínimo de 12px.

La prueba de junctions del publicador ahora espera la eliminación efectiva del lock tras finalizar el trabajo. La ejecución CI anterior encontró una carrera en esa preparación de fixtures; el cambio no modifica el publicador ni permite reintentos de publicación.

La revisión independiente del radar aprobó requisitos y calidad. Detectó un detalle menor del filtro: «unas ideas» coincidía con Uñas al quitar la tilde. Se corrigió preservando la letra ñ y se añadió regresión para español en NFC/NFD y portugués. Detector Impeccable acotado a los tres componentes del radar: sin hallazgos; no equivale a reejecutar la auditoría global anterior.

### Corrección de «Explorar todas las categorías»

El botón sólo limpiaba filtros y no mostraba ningún cambio cuando ya estaban todas las categorías seleccionadas. Ahora abre el diálogo de investigación general, restablece los filtros y conserva el estilo creativo. El texto sigue editable y la investigación empieza sólo al enviar el formulario. Escape devuelve el foco al botón que lo abrió; el acceso se desactiva mientras hay una investigación en cola o en curso.

La regresión reprodujo primero el fallo y pasó tras la corrección. Comprueba apertura inicial y desde Skincare con filtros, conservación de Humor, envío único del texto editado y bloqueo durante el trabajo simulado. En la página local con ocho ideas se comprobó apertura, cierre, foco y ausencia de errores; axe no detectó infracciones en el diálogo de escritorio y móvil después de finalizar su animación de entrada. Esta comprobación no inició investigaciones, generación ni publicaciones reales.

El estado de una investigación ahora aparece encima del radar y el botón indica «Investigando…» o «Investigación en cola…». Tres regresiones comprueban el progreso y la habilitación automática, sin recargar, al completar, fallar o interrumpirse el trabajo. La búsqueda real iniciada por Bryan a las 12:54 terminó a las 12:56 con tres ideas adicionales (11 en la biblioteca); no se canceló ni se repitió para desbloquear el botón.

## Investigación real desde el botón

Con Codex CLI 0.153.4 y la sesión ChatGPT existente se pulsó **Investigar con Codex → Iniciar investigación** en la página local. El trabajo quedó persistido antes de iniciar el investigador. Se observaron cambios de progreso, finalización `completed`, dos tarjetas nuevas y archivos de evidencia guardados en la carpeta del proyecto.

Resultados de esa comprobación:

- **Gloss con estética de gomitas**: fuente Pinterest Predicts 2026; productos candidatos 550 y 1373. El informe no proporcionó una imagen extraíble y la ficha conserva el enlace.
- **Primavera en bloques de color**: fuente Pinterest Palette; productos 1052 y 16452. Imagen original recuperada de los metadatos públicos y guardada como asset local.

El resultado pasó de seis a ocho ideas en esta PC y sobrevivió al reinicio del servicio. La selección y los archivos privados no se suben a GitHub. Las búsquedas no proporcionaron una referencia original accesible de Instagram para esta prueba; no se inventó una. Es una búsqueda editorial, no evidencia de viralidad en Paraguay.

La prueba real detectó dos incompatibilidades que se corrigieron: el subconjunto JSON Schema del proveedor rechaza `format: uri`, y la CLI no siempre expone aperturas de todas las fuentes de una búsqueda. Se mantienen validación URL de Zod y dos vías de evidencia separadas: eventos de apertura, o GET independiente y restringido a la página original. Las ejecuciones fallidas quedan registradas; no se repiten automáticamente. No se leyó ni copió el archivo de autenticación de Codex ni se usó una clave API de imágenes.

## Inicio, cierre y recuperación

Se probaron los accesos PowerShell reales: inicio oculto, doble inicio simultáneo, reutilización del propietario, coincidencia entre PID/fecha y `service.lock`, cierre autenticado, terminación del proceso y reinicio. Ambos iniciadores simultáneos terminaron con código 0 y apuntaron al mismo propietario. Un mutex temporal serializa los iniciadores, sin instalar un servicio de Windows. El registro de PID se escribe después de verificar el servicio con la credencial del proyecto.

El cierre sella nuevas operaciones atómicamente y espera a los trabajos activos. No hay `Stop-Process` en el acceso de cierre. Un corte abrupto no reenvía publicaciones: al reiniciar se marcan interrumpidas y la conciliación permanece explícita. Las regresiones prueban el intercalado entre un handler en espera y la solicitud de cierre.

## Diseño y revisión

Impeccable y revisión visual aplicados a escritorio y móvil. El detector se consultó y se recuperó su salida completa para revisarla: 389 avisos de documentación de colores/tamaños/radios y una advertencia por Georgia. No se presenta como un escaneo vacío. Georgia queda documentada exclusivamente para el monograma decorativo; las lecturas usan las dos fuentes locales. Se mejoró el tamaño de textos del radar móvil y el contraste de la referencia faltante. Los avisos de escala se conservan como control de coherencia, no como prueba de accesibilidad; esta se midió con axe y teclado.

Se revisaron y corrigieron: identidad de imágenes Meta, junctions externos, aprobación por revisión, borradores y respuestas asíncronas antiguas, foco móvil, cierre atómico, referencia omitida en búsquedas posteriores, bytes originales inválidos, procedencia de imagen de la API, eventos URL de Codex, UTF-8 dividido y registro de PID. No quedaron hallazgos importantes abiertos en la revisión independiente.

## Referencias concretas y generación en el chat

El servicio real se reinició de forma segura sin trabajos activos. Informa `generationProvider: codex-chat`. Se importaron cinco referencias cosméticas revisadas visualmente, con fuente original y assets locales; los once hallazgos históricos conservan IDs/favoritos como contexto sin portadas generales. La campaña existente se conserva. La semilla anterior y el estado tienen copias fechadas privadas; no se eliminaron assets históricos.

Se comprobó en la página real que cargan las cinco imágenes, se puede ampliar y seleccionar una referencia y no hay desbordamiento horizontal a 390px. Axe devolvió cero infracciones en galería de escritorio, detalle y móvil. Se revisaron las capturas. La selección de una segunda imagen sobrevive a crear/recargar la campaña en E2E. Una referencia sin imagen muestra su estado; no se sustituye por la primera foto de otra elección. Un error de descarga no se presenta como carga perpetua.

Los pedidos del chat se prueban sin clave API, con captura de inputs, contenido obsoleto, cancelación, reintentos idénticos, sustitución de destinos, importación original byte a byte y composición independiente. El estudio permite reabrir/copiar el pedido, ofrece selección manual si el portapapeles falla y conserva el progreso tras recargar. La descripción y composición histórica pueden editarse aunque el radar retire su referencia. No se generó una campaña real como prueba.

La nueva comprobación del botón inició el job `4dd7078d-6d2f-4493-8b0d-bc2dc743f237`, que terminó `completed`: añadió dos pins individuales de gloss y sérum, descargó ambas imágenes y las guardó como referencias. La revisión visual confirmó el encaje cosmético, y los productos candidatos 13413 y 3445 existen en el catálogo. Se corrigieron sus textos de presentación tras la revisión, conservando el registro original del investigador. La galería queda con siete ejemplos; los dos nuevos son inspiración editorial, sin viralidad local verificada.

Tras la última corrección de caché se reinició nuevamente sin trabajos activos. Las siete imágenes siguen cargando, con cero infracciones axe en escritorio/detalle/móvil. La comparación del estado previo confirma la campaña byte a byte equivalente como JSON, los once IDs históricos conservados y todos sus favoritos intactos. Las cinco regresiones adicionales impiden que las referencias anteriores o importadas recuperen URLs de fútbol/logos; preservan los originales archivados y las imágenes válidas.

Las regresiones de investigación excluyen contexto/portadas, páginas bloqueadas, temas ajenos, logos/placeholders y referencias no respaldadas por su fuente. Codex y el proveedor API opcional usan el mismo filtro de URL de imagen. Este filtro usa metadatos y no sustituye inspección visual. La revisión independiente encontró y resolvió las referencias históricas bloqueando ediciones, el fallback a la primera foto no elegida y la diferencia del filtro API. La prueba real también identificó el límite de consulta desalineado: la UI ahora respeta los 500 caracteres aceptados por el servidor. Las consultas sugeridas se acortaron y una regresión comprueba todas las categorías/estilos con espacio para una preferencia adicional del usuario; el E2E conserva el texto editado sin truncarlo.

## Límites externos pendientes

- La generación predeterminada usa la herramienta del chat mediante un pedido copiado por Bryan. Falta ejecutar una primera campaña aprobada con sus productos y logo; no se exige clave API ni se afirma que la página accione automáticamente esa herramienta.
- No se publicó contenido real en Instagram/Facebook. Permisos y respuesta actuales de Meta se comprobarán al publicar la primera campaña aprobada; una coincidencia visual no recupera un ID IG perdido.
- Vercel queda preparado como frontend estático. Bryan realizará el despliegue y entonces podrá comprobarse el permiso de red local y emparejamiento del dominio HTTPS real.
- GitHub Actions repitió todas las comprobaciones en Linux: tipos, lint, 85 tests, build, presupuesto, navegador y auditoría aprobaron en la [ejecución 34362563333](https://github.com/Bryan-dev074/ElaBela-Media/actions/runs/34362563333), correspondiente al commit de implementación `5f7e232`. El SHA de `main` se contrastó con el remoto después del push.
