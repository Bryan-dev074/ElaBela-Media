# Task 3c — Proveedores creativos

Implementado el 2026-09-09. No se hicieron llamadas pagas, no se usaron credenciales reales, no se tocó Meta y no se publicó contenido.

## Resultado

La generación de copy conserva el fallback local ES/PT-BR cuando no existe `OPENAI_API_KEY`. Con una clave configurada usa Responses y exige mediante JSON Schema exactamente tres propuestas, cada una con exactamente las N piezas de la campaña, titular, cuerpo y caption de hasta 2200 caracteres. El proveedor recibe nombre, marca y categoría, sin precio; las instrucciones prohíben agregar descuentos, disponibilidad garantizada, claims o beneficios no aportados. Una respuesta inválida o un fallo configurado se muestra como error y no activa el fallback local.

La búsqueda usa `gpt-6-astra` por defecto con `web_search`, `search_content_types: ["text", "image"]`, `image_settings` e inclusión de `web_search_call.action.sources` y `web_search_call.results`. Recorre todas las páginas locales del catálogo, prioriza coincidencias de consulta y completa una selección acotada de hasta 120 productos con diversidad de categoría y marca. Los IDs emitidos se vuelven a comprobar contra el Store.

Una tendencia se acepta solamente si su fuente aparece en la evidencia del `web_search_call`. Una referencia visual se conserva solamente si su URL apareció como imagen en los resultados reales; las URLs declaradas solo por el JSON del modelo se descartan. Cada investigación guarda consulta, fecha, fuentes, imágenes y resultados de procedencia en `investigacion/AAAA-MM-DD/`. Al repetir, se preservan la tendencia guardada y el asset local previo por URL.

Cada job de generación crea una sola carpeta `contenido/AAAA/MM/<campaña>/fuentes-generacion/<job>/`. Antes de llamar al proveedor de imagen guarda, sin transformar, las fotos de producto, el logo y las referencias realmente usadas. Detecta el formato por bytes para usar extensión y MIME correctos. `manifest.json` registra campaña/revisión/copy/modelo, solicitudes por pieza y SHA-256, dimensiones, MIME y ruta de cada fuente. Las salidas crudas del proveedor se guardan aparte; no se duplican fuentes ni manifiestos por pieza. Los fallos cortan el job sin reintento automático.

## Contrato para integración manual

`server/providers.ts` exporta:

- `createCreativeIntegrations(options?)`, ahora con inyección opcional de `copyGenerator`, `searchGenerator` y `referenceDownloader`, además de los adaptadores de imagen existentes.
- `cacheTrendReferences(store, trends, options?) -> Promise<Trend[]>`. Comprueba la allowlist incluso al inyectar un downloader, reutiliza un asset accesible por URL, deduplica descargas dentro del lote, marca `referencia remota, copia local pendiente` cuando falla y persiste mediante `store.importTrends`. El Store conserva favoritos y tendencias ajenas al lote. `options.downloader` existe solo para pruebas/adaptadores controlados.
- `selectCatalogCandidates(store, query, category?, maximum?) -> Product[]`, que pagina el catálogo completo y devuelve la selección relevante/diversa.
- Tipos `CopyGenerationRequest`, `SearchGenerationRequest` y `ReferenceCacheOptions`.

El root puede llamar directamente `await cacheTrendReferences(store, trends)` en la importación manual. No necesita guardar las tendencias una segunda vez.

## Transporte remoto

`downloadPublic(url, limit?, fetcher?)` permite únicamente HTTPS, sin credenciales ni puertos alternativos, para hosts exactos revisados. Cada redirección se vuelve a validar antes de solicitar el siguiente destino. Rechaza por `Content-Length` y también al superar el límite durante el stream. El tercer argumento permite pruebas sin red real.

## Evidencia TDD y comprobaciones

Fallos observados antes de implementar:

- tres pruebas de transporte usaron el `fetch` global en vez del doble y devolvieron el error genérico;
- el generador de copy configurado no se invocaba y un fallo cambiaba silenciosamente al texto local;
- la búsqueda terminaba `failed` porque todavía ignoraba el generador inyectado;
- la selección seguía limitada a la primera página;
- no existían el caché exportado ni el manifiesto único por job;
- la generación dejó 18 archivos planos por nueve piezas en vez de una carpeta reproducible.

Verificación final de los archivos propios:

```text
npm test -- server/providers.test.ts server/remote.test.ts
Test Files  2 passed (2)
Tests       15 passed (15)

npx tsc --ignoreConfig --noEmit --target ES2024 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --esModuleInterop --types node,vitest server/providers.ts server/providers.test.ts server/remote.ts server/remote.test.ts server/provider-copy.ts server/provider-responses.ts server/provider-sources.ts server/provider-trends.ts
exit 0

npx biome check <archivos propios>
exit 0

npm test -- server
Test Files  8 passed (8)
Tests       60 passed (60)

npm run typecheck
exit 0
```

La suite cubre fallback ES/PT-BR, payload/schema y persistencia del copy remoto, estructura inválida, error visible, bloqueo y concurrencia de generación, nueve masters 4:5, fallo parcial sin retry, manifiesto existente antes de la primera llamada de imagen, fuentes originales y hashes, catálogo profundo, evidencia real frente a URL inventada, repetición con favorito/asset, caché deduplicada, pendiente visible y las cuatro barreras del downloader.

Además del typecheck estricto y aislado de proveedores, el typecheck global y las 60 pruebas integradas del servidor terminaron correctamente una vez incorporado el archivo de lock del publicador que estaba en desarrollo paralelo.

## Fuentes y límites

Se verificó el contrato actual con la guía oficial [Web search](https://developers.openai.com/api/docs/guides/tools-web-search) y la referencia oficial [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create). No se comprobó una respuesta real de OpenAI ni la tolerancia del modelo de imagen con estos manifiestos porque eso consumiría una API paga. La calidad editorial final, fidelidad de envases, texto renderizado y orden del carrusel siguen requiriendo revisión humana antes de una publicación expresamente autorizada.

Rollback: desconectar `createCreativeIntegrations` restaura los hooks ausentes del servicio; conservar investigaciones, caché y manifiestos ya creados para auditoría y evitar repetir descargas o consumos.
