# Referencias visuales y generación desde Codex — Implementation Plan

> For agentic workers: usar subagent-driven-development por tareas con revisión y continuidad. El usuario ya indicó este flujo y autorizó su implementación; no volver a pedir aprobación para las decisiones rutinarias.

**Goal:** seleccionar imágenes pertinentes a ElaBela y preparar/importar generación del chat sin dependencia de una API paga.

**Architecture:** extender contratos existentes con referencia elegida y pedido local versionado. El servicio conserva autoridad sobre revisión/colocación; el chat crea las imágenes y un CLI autenticado las incorpora. La búsqueda prioriza ejemplos concretos y la UI separa imágenes de contexto sin foto.

**Tech Stack:** React 19 / Vite 8 / TypeScript 7 / Fastify 5 / Node 24 / npm / Radix / CSS / Vitest / Playwright existentes.

## Global Constraints

- Sólo cosméticos, belleza y productos pertinentes al catálogo ElaBela. No fútbol ni portadas generales ajenas al producto.
- Generación por herramienta integrada del chat; nunca iniciar automáticamente una API de pago. Sin generación ni publicación real como prueba.
- Imágenes reales 4:5, originales byte a byte, logo suministrado y envase fiel; sin sobrescribir versiones.
- Campañas ES/PT, tres propuestas de N piezas; se conserva mezcla, visor y confirmación Meta por revisión.
- No guardar secretos en Git, prompts, navegador o argumentos. Reutilizar servicio loopback y autenticación existente.
- Sin nuevas dependencias, permisos de sistema, LAN ni procesos aparentando que este chat puede invocarse automáticamente.

## Task 1 — Pedido e importación de Codex (backend)

Files: shared/types.ts, server/codex-generation.ts (nuevo), server/store.ts, server/app.ts, server/index.ts, server/contracts.ts, pruebas backend nuevas. Dueño backend; no UI ni scripts CLI.

Contract for Task 2/3 (publish exact final fields before consumers integrate):

`Reference` añade `sourceUrl?: string`. `Trend` añade `visualStatus?: 'example' | 'context' | 'unavailable'` y `visualReason?: string`. `Campaign` y `CreateCampaign` añaden `referenceId?: string`; validar pertenencia y conservarla en ediciones. `Campaign.codexRequest?: CodexGenerationRequest` es propiedad del servidor, nunca aceptada desde PUT como autoridad.

`CodexGenerationRequest`: `id`, `createdAt`, `status: 'ready'|'partial'|'completed'|'cancelled'`, `briefPath`, `manifestPath` (rutas relativas al proyecto), `instruction` (texto copiable para este chat), `contentHash`, `total`, `completed`, `targets: {variantId:string,slot:number,originalAssetId:string|null,assetId?:string,sha256?:string}[]`.

`ServiceStatus.generationProvider?: 'codex-chat'|'api'`; producción siempre reporta modo. Codex habilita preparar pedidos sin clave; API sólo con elección explícita. `/api/campaigns/:id/generate` recibe `{revision, variantId?,slot?}` y en modo chat devuelve `{campaign}` con pedido persistido; no crea Job running. Reutilizar pedido pendiente idéntico, rechazar cambios incompatibles hasta cancelar. `DELETE /api/campaigns/:id/codex-request` recibe `{requestId}` y cancela conservando archivos. `POST /api/campaigns/:id/codex-assets` recibe multipart `{requestId,variantId,slot,file}` y devuelve `{campaign,asset}`. Endpoint devuelve el pedido vigente junto a campaña mediante bootstrap.

- [x] Escribir/regresar pruebas rojas: sin clave, contenidos aprobados, referencia elegida, pedido no bloqueante, importación exacta 4:5, idempotencia, obsolescencia, destino cambiado, cancelación, apagado y publicación bloqueada.
- [x] Implementar manifiestos inmutables y validación atómica en Store. Descargar/capturar productos/logo/referencia mediante funciones existentes con límite; no obtener imágenes decorativas sustitutas. Reutilizar prompts existentes separando helpers si hace falta.
- [x] Persistir request sólo tras preparar archivos; guardar entradas/salidas en contenido. No iniciar generador alguno. Copia local/API de texto también evita costo automático por mera presencia de clave en modo chat.
- [x] Ejecutar tests pertinentes y typecheck; entregar contrato real y evidencia para revisión.

## Task 2 — Investigación visual pertinente

Files: server/codex-research.ts, server/codex-sources.ts, server/provider-trends.ts si hace falta, shared/radar.ts, pruebas de investigación. No Store, shared/types ni UI; consumir campos definidos en Task 1.

- [x] Reproducir que OG de un informe genérico se convierte en imagen de producto.
- [x] Restringir resultados a ejemplos concretos de belleza y contexto de catálogo; pedir pins/publicaciones individuales con imágenes. No anexar OG de portadas anuales ni fútbol a ideas de cosméticos. Verificar URL y procedencia de imagen; conservar límites de descarga y SSRF.
- [x] Conservar ideas contextuales sin fingir imagen y asignar `visualStatus`/motivo. Preservar favoritos y referencias previas válidas, rechazando asociaciones genéricas conocidas.
- [x] Tests positivos de pin cosmético y negativos de portada/login/asunto ajeno/imagen inventada. Investigar 4–6 candidatos reales con imágenes y enlaces originales en un archivo .local para revisión visual del agente principal; no modificar estado privado real.

## Task 3 — UI, CLI y datos actuales (principal)

Files: src/App.tsx, src/components/Radar.tsx, src/components/ui.tsx, src/components/Studio.tsx, nuevo componente CodexRequestPanel si conviene, CSS propio, scripts/codex-import.ts, package.json, docs y E2E. No editar backend mientras Task 1/2 estén trabajando.

- [x] Referencias visuales por defecto, ideas/contexto accesible, fallos de imagen honestos; vista/ampliación y selección de una referencia concreta antes de crear campaña.
- [x] Botón de propuestas prepara pedido de chat y muestra instrucción copiable y estado preparado, progreso de importación, cancelar/reabrir; no implica que está generando. No pedir API key en ajustes por defecto.
- [x] CLI `npm run codex:importar -- --campaign ID --request ID --variant ID --slot 0 --file PATH` carga token privado sin imprimirlo y hace multipart local. `--help` documentado; validar flags y archivos, guardar originales mediante backend.
- [x] Revisar candidatos reales visualmente; retirar asociaciones de fútbol y portadas generales del estado conservando respaldo y favoritos. Importar referencias verificadas sin generar contenido ni publicar.
- [x] Pruebas end-to-end con archivos identificados de PRUEBA y sin costos: elección segunda imagen, pedido, importación, mezcla, recarga, original idéntico, cancelación y foco.

## Cierre

- [x] Revisión independiente de requisitos/calidad; resolver hallazgos, sin repetir suites sin cambios.
- [x] Tipos, lint, unitarios, build, bundle, E2E/Axe, auditoría y revisión visual local.
- [x] Reiniciar servicio sólo cuando no haya trabajos reales activos; verificar estado y flujo actualizado.
- [x] Actualizar README/PRODUCT/ADR/verificación/guía de operación de Codex.
- [ ] Push autorizado a main y CI del SHA exacto: comprobación posterior al commit, informar evidencia en la entrega.
