# Verificación de ElaBela Media

Fecha: 9 de septiembre de 2026. Entorno real: Windows, PowerShell, Node 24.17.0, npm 11.13.0 y Chrome instalado. Revisión independiente de integración aprobada después de corregir todos los hallazgos importantes. Este informe describe la primera versión; no sustituye comprobaciones de futuras campañas.

## Comprobaciones locales

| Comprobación | Resultado observado |
|---|---|
| `npm run typecheck` | Correcto; TypeScript estricto |
| `npm run lint` | 62 archivos sin errores ni advertencias de Biome |
| `npm test` | 85 pruebas, 14 archivos, todas aprobadas |
| `npm run build` | Build Vite correcto |
| `npm run check:bundle` | 109,5 KiB gzip de JS inicial; presupuesto 220 KiB |
| `npm run test:e2e` | 8 pruebas aprobadas en Chrome; puerto aislado 5187 |
| `npm audit --audit-level=high` | 0 vulnerabilidades reportadas |
| Axe WCAG 2 A/AA y 2.1 AA | Sin infracciones medidas en radar móvil, estudio y confirmación |
| Radar real con 8 ideas, incluida referencia faltante | Sin errores de página ni infracciones axe después de ajustar el contraste del placeholder |
| Catálogo | 1.573 IDs únicos; 199 marcas y 61 categorías. Parser comprobado contra la fuente actual |

Las pruebas de imágenes conservan los bytes originales, validan 4:5, generan 3×N piezas con transporte simulado, conservan salidas inválidas para revisión y comprueban orden sin destruir propuestas. Las pruebas Meta no hacen publicaciones; validan claims atómicos, revisión aprobada, checkpoints, fallos ambiguos, conciliación de solo lectura, orden y comparación local de imágenes. El publicador externo existente se verificó con sus 66 pruebas durante el reconocimiento inicial y quedó sin modificaciones.

Las ocho pruebas del navegador cubren PT-BR, textos, mezcla de propuestas por arrastre y botones, recarga, descarga original idéntica, publicación simulada confirmada, actualización de revisión, borradores guardados/sin guardar, conflictos, respuestas antiguas que llegan después de un texto nuevo y foco de navegación móvil. Las imágenes de fixtures dicen PRUEBA y el transporte de publicación identifica explícitamente que no envió nada a Meta.

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

## Límites externos pendientes

- No se ejecutó generación de campaña mediante API de imágenes: falta configurar la clave local y elegir/aprobar una campaña.
- No se publicó contenido real en Instagram/Facebook. Permisos y respuesta actuales de Meta se comprobarán al publicar la primera campaña aprobada; una coincidencia visual no recupera un ID IG perdido.
- Vercel queda preparado como frontend estático. Bryan realizará el despliegue y entonces podrá comprobarse el permiso de red local y emparejamiento del dominio HTTPS real.
- GitHub Actions está configurado para repetir las comprobaciones en Linux. Su resultado remoto se consulta después del push, por separado de estas pruebas Windows.
