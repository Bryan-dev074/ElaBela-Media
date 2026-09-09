# ElaBela Media Implementation Plan

> For agentic workers: use subagent-driven-development for isolated tasks and finish reviews. The root owns integration and UI. Do not commit automatically; Bryan authorized a final reviewed push.

**Goal:** Un estudio local/Vercel para guardar tendencias con referencias, seleccionar productos y textos ES/PT-BR, generar tres opciones y componer un carrusel final combinándolas.

**Architecture:** Frontend React/Vite y API Fastify en loopback. JSON atómico local, imágenes en campañas, publicación mediante adaptador MetaBusiness. Sin secretos en frontend o Git.

**Tech Stack:** Node24, npm, React19, TypeScript, Vite8, Radix, Motion, Fastify5, Sharp, Zod, Vitest, Playwright, Biome.

## Global Constraints

- Español y portugués para texto de imagen y caption.
- Tres propuestas por defecto: N piezas por propuesta = 3N imágenes, separadas visualmente.
- Elegir textos antes de generar. Carrusel final independiente, con referencias a imágenes seleccionadas; conserva las originales.
- Arrastrar entre opciones/final y ordenar con botones accesibles. Cambios invalidan aprobación.
- PNG master 4:5, previews y exportes separados. No usar miniaturas como masters.
- Conservar tendencias, URLs, fecha e imágenes de referencia en disco. No inventar métricas.
- Publicación real solo por confirmación de campaña. Pruebas nunca publican en cuentas reales.
- No dependencias globales ni modificaciones de sistema. Publicador externo permanece intacto.

## Task 1: Contratos y servicio local

Files: `shared/types.ts`, `server/app.ts`, `server/store.ts`, `server/media.ts`, `server/index.ts`, `server/*.test.ts`.

Interfaces: `buildApp(options)` inyectable en pruebas; `GET /api/bootstrap` devuelve Bootstrap; catálogo paginado en `GET /api/products`; CRUD trends/campaigns; `PUT /api/campaigns/:id` revisa revision; upload validado; rutas de assets autorizadas. Responses `{error:string}` en fallos.

- [x] Escribir pruebas de persistencia, revision conflict, final mix preserva originales, path traversal, origen/token incorrectos y upload 4:5.
- [x] Ejecutar `npm test -- server` y comprobar fallos por comportamiento ausente.
- [x] Implementar almacenamiento con mutex escritor y rename atómico, paths confinados, asset registry; API con Bearer token y Origin/Host exactos.
- [x] Probar API mediante Fastify inject con directorios temporales; verificar roundtrip.

Ejemplo de contrato de conflicto:
```ts
const first = await saveCampaign({ ...campaign, revision: 0 });
await expect(saveCampaign({ ...campaign, revision: 0 })).rejects.toThrow('conflict');
expect(first.revision).toBe(1);
```

## Task 2: Interfaz de trabajo

Files: `src/App.tsx`, `src/api.ts`, `src/components/*`, `src/styles.css`, `DESIGN.md`, `public/brand/*`.

- [x] Persistir dirección de diseño y revisar librerías antes de UI.
- [x] Construir shell premium lila: sidebar, búsqueda, estado conexión, crédito GitHub con animación pausada por reduced-motion.
- [x] Radar con fotos reales de referencia, filtros, guardar y detalle; catálogo con búsqueda/categoría/marca.
- [x] Estudio por etapas: brief → textos → propuestas → carrusel final → publicación. Inputs ES/PT-BR, N y 3 propuestas por defecto.
- [x] Drag/drop por ID más botones añadir/reemplazar/mover. Visor original en diálogo accesible. Descarga por fetch autenticado.
- [x] Estados de carga/error/desconectado/sin proveedor. No demostrar generación fingida.

Regla de composición:
```ts
// A reference is copied; source option arrays stay unchanged.
next.finalAssetIds = [...campaign.finalAssetIds, selectedAsset.id];
next.approvedRevision = null;
```

## Task 3: Proveedores y publicación

Files: `server/providers.ts`, `server/publisher.ts`, `server/jobs.ts`, pruebas enfocadas.

- [x] TDD: generación bloqueada sin texto aprobado, 3N requests, fallos parciales conservados, revisiones y doble submit.
- [x] Textos como opciones editables originales; Codex local predeterminado para investigación desde el botón; proveedor API configurable para generación.
- [x] Image API recibe logo/foto exacta/referencia y texto elegido, guarda cada resultado separado. Regenerar solo pieza seleccionada.
- [x] Jobs persistentes con recuperación honesta de interrupciones; sin reintentos automáticos ambiguos.
- [x] Adaptar MetaBusiness para una imagen y carruseles. Payload desde contenido aprobado y fingerprint, copias staging, verificación remota independiente por destino, no tokens en logs.
- [x] Conservar tests del publicador externo en verde; pruebas del adaptador con transportes simulados.

## Task 4: Verificación y entrega

Files: `tests/studio.spec.ts`, `playwright.config.ts`, `.github/workflows/ci.yml`, scripts locales, README y ADR.

- [x] Prueba E2E local con fuente de pruebas aislada: elegir trend/producto/textos, importar variantes, mezclar final, recargar y exportar; publicación simulada identificada.
- [x] Verificar a11y, responsive y motion; revisar screenshot.
- [x] Ejecutar typecheck, lint, tests, build, E2E, bundle y audit; corregir fallos relevantes.
- [x] Revisor independiente de código y revisión visual Impeccable; aplicar observaciones importantes.
- [x] Preparar inicio local sin instalación permanente y conexión Vercel configurable.
- [ ] Revisar secretos, gitignore y diff; commit/push al repo autorizado; confirmar SHA remoto y CI. No desplegar Vercel por Bryan.

## Progress

- 2026-09-09: diagnóstico, catálogo 1573 y lectura Meta verificados. Usuario confirmó ES/PT-BR, tres opciones y composición entre propuestas; delegó mejoras de manejo. Implementación iniciada.

- 2026-09-09: implementación y revisión independiente terminadas. 85 tests de servicio, 8 E2E, build/lint/tipos, axe y auditoría aprobados. Botón Codex probado con dos hallazgos nuevos. Resta registrar entrega Git/CI.
