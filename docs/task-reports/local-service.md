# Servicio local — reporte de tarea

Fecha: 2026-09-09

## Resultado

Se implementó el servicio Fastify local ligado por contrato a `127.0.0.1:4317`, con almacenamiento JSON serializado y atómico, catálogo cargado desde la fotografía más reciente, campañas con revisión optimista, tendencias persistentes, registro de assets y hooks inyectables para las integraciones.

El servicio conserva el token aleatorio de 256 bits en `.local/connection.json`; no lo devuelve en bootstrap, health ni errores. Todas las rutas API salvo health exigen Bearer. Host se limita a loopback y Origin, cuando está presente, debe coincidir exactamente con la lista configurada. El preflight CORS solamente responde a un origen permitido. La configuración de orígenes acepta HTTPS exacto o desarrollo local en el puerto 5173.

Las imágenes importadas se identifican por sus bytes con Sharp, se limitan a PNG/JPEG/WebP y 20 MB, y deben medir 4:5. El master se escribe sin transformación y el preview WebP queda separado. Los nombres y rutas son generados por el servidor. La lectura usa el registro interno y comprueba ruta resuelta y enlaces simbólicos contra `contenido/` o `data/references/`.

## Contratos para proveedores

`server/contracts.ts` exporta:

- `IntegrationContext<TPayload>`: `{ campaign, payload, store }`.
- `TrendSearchContext`: `{ query, category?, store }`.
- `CampaignIntegrationResult`: `{ campaign, job? }`.
- `TrendSearchResult`: `{ trends, job? }`.
- `Integrations`: hooks opcionales `copy`, `generate`, `publish` y `searchTrends`.
- `ServiceError`: error de dominio con `statusCode`, convertido siempre a `{error}` por la API.

`Store` exporta `init`, `bootstrap`, `getCampaign`, `createCampaign`, `saveCampaign`, `approveCampaign`, `assertCampaignEditable`, `addAsset`, `getAsset`, `getAssetPath`, `listProducts`, `getProduct`, `upsertTrend`, `importTrends`, `setTrendSaved`, `setAllowedOrigins` y `upsertJob`.

Los hooks ausentes responden 503 con un estado honesto. Los jobs `generate` o `publish` en `queued`/`running` bloquean PUT y carga manual de la campaña, incluso si el job empieza mientras todavía llega el stream multipart. El PUT público no puede inventar `publication`, alterar slots originales, forjar `approvedRevision` ni guardar IDs finales inexistentes o ajenos. Desde la primera imagen quedan fijos el brief, idioma, productos, cantidades, selección y texto de las piezas; el caption sigue editable. Aprobar exige texto seleccionado y aprobado con N diapositivas, N assets finales 4:5 y todos pertenecientes a la campaña.

La cola vuelve a comprobar las invariantes al registrar un asset público. Una escritura JSON fallida restaura el estado anterior en memoria. Tanto lectura como creación de imágenes comparan las rutas reales con el root real, por lo que un junction `contenido` que apunta fuera del proyecto se rechaza.

## Evidencia TDD

RED observado:

- Suite inicial: falló al importar `server/app.js`, todavía ausente.
- Posición multipart inválida: el test encontró un asset fantasma en memoria en vez de `[]`.
- PUT público: devolvió 200 al intentar aprobar un texto incompleto e inventar una publicación.
- Carrera con generación activa: PUT devolvió 200 en vez de 409.
- Preflight permitido: devolvió 401 en vez de 204.
- Asset final inexistente: PUT devolvió 200 en vez de 400.
- Junction de `contenido`: lectura y escritura aceptaron una carpeta externa.
- Rename atómico fallido: la campaña rechazada quedó visible en memoria.
- Carrera multipart/generación: antes de la corrección independiente devolvía 201 y registraba un asset durante un job activo.
- Carrera de cola al editar/aprobar: un job podía quedar encolado después de la comprobación pública y antes del guardado.

GREEN observado:

```text
npm test -- server
Test Files  2 passed (2)
Tests       23 passed (23)
```

La verificación integrada del directorio `server` incluye 18 pruebas del servicio local y 5 de proveedores. `npm run typecheck` también terminó con código de salida 0. El chequeo Biome de los archivos propios y este reporte quedó limpio tras aplicar formato.

## Archivos

- `server/app.ts`: API, autenticación, validación, CORS y despacho de hooks.
- `server/store.ts`: estado, catálogo, revisiones, jobs y confinamiento de rutas.
- `server/media.ts`: inspección y persistencia de masters/previews.
- `server/index.ts`: listener loopback, SPA compilada y apagado por señales.
- `server/app.test.ts`: dieciocho casos de contrato, carreras y seguridad.
- `server/contracts.ts`: límites entre servicio y adaptadores.

No se publicó contenido, no se leyó ningún token y no se ejecutaron integraciones reales.
