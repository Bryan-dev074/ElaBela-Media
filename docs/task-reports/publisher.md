# Task 3b — Publicador Meta

Implementado el 2026-09-09. Sin publicaciones reales, sin lectura de `Token.txt`, sin cambios en `D:\ElaBela\MetaBusiness` y sin instalaciones.

## Contrato e integración

- `createPublisher(options?).publish({ campaign, payload: { revision }, store })` devuelve campaña reclamada + job `running`; la ejecución sigue en segundo plano.
- `createPublisher(options?).reconcile({ campaign, payload: { revision? }, store })` consulta y guarda el resultado del job original. Solo GET hacia Meta, sin reanudar uploads o publicaciones.
- Opciones: `pageId`, `instagramBusinessId`, `metaBusinessDir`, `worker`. Defaults de entorno: `META_PAGE_ID`, `META_INSTAGRAM_BUSINESS_ID`, `META_BUSINESS_DIR`; directorio predeterminado `D:\ElaBela\MetaBusiness`.
- El root debe conectar ambos hooks en index/app, el endpoint `POST /api/campaigns/:id/reconcile` y `"reconcile": "tsx scripts/reconcile.ts"`. El CLI utiliza el servicio ya iniciado en 127.0.0.1:4317 y su credencial local; evita abrir un segundo Store.
- Helper solicitado y entregado por root: `Store.claimPublication(id, revision, fingerprint, job)`, validación y persistencia atómicas dentro de la cola del Store.

## Garantías implementadas

Revisión aprobada, copy válido y 1–10 imágenes propias 4:5. Fingerprint SHA-256 de destinos, caption exacto y bytes de imágenes en orden; deduplicación entre campañas. Bloqueo en memoria + archivo exclusivo + claim del Store impiden operaciones simultáneas. El manifiesto se comprueba nuevamente dentro del worker antes de cualquier solicitud.

Staging privado: `contenido/AAAA/MM/<campaña>/publicacion/<job>/staging/`, JPEG 1080×1350, calidad 95, 4:4:4. Masters intactos. Plan, checkpoint e historial de checkpoints viven junto al staging; `.local/meta-publications/<campaña>.json` conserva el puntero de recuperación. Todos los archivos quedan cubiertos por exclusiones Git existentes.

El worker PowerShell descifra DPAPI en el entorno del hijo Node y elimina la variable en `finally`. El proceso se lanza con argumentos separados, `shell: false`, `windowsHide: true`; stdout/stderr sin filtrar nunca llegan al navegador ni a logs. El MJS importa `lib/meta-api.mjs` del publicador existente. No usa el runner que archiva/mueve imágenes; no escribe en el árbol externo.

Una imagen crea un único container de imagen; carruseles crean children y un parent. Ambos utilizan fotos Facebook no publicadas como fuente accesible a Instagram. Cada mutación tiene checkpoint previo y posterior. Un error corta todas las mutaciones; `unknown`/`partial`/`verified` bloquean reenvíos. La conciliación Facebook solo busca publicaciones de un intento conocido, con IDs exactos de fotos previamente persistidos, texto exacto y una ventana de diez minutos; exige una única coincidencia. Instagram sin ID persistido permanece sin verificar: no se adjudica una publicación por similitud visual, caption o fecha.

Verificación independiente por GET: Instagram comprueba caption, tipo, container `PUBLISHED`, count, IDs publicados y orden de las imágenes; Facebook comprueba message, `is_published`, IDs/orden de fotos adjuntas y permalink. Solo se entregan enlaces del destino verificado. Para IG no se comparan IDs de containers con IDs publicados: se descargan las imágenes desde dominios CDN de Meta y se cotejan en orden con el staging mediante RGB 1080×1350 y diferencias locales de bloques 16×16. Además del error global, se comprueba el peor bloque y la proporción local de píxeles diferentes, para rechazar texto o precios eliminados. Se exige margen >2 respecto de otras piezas distintas; duplicados byte a byte permiten orden indistinguible. Ambigüedad o evidencia faltante conserva `partial`/`unknown`. La corrección y sus regresiones están en [review-fixes.md](review-fixes.md).

## Comprobaciones

- TDD con fallos observados antes de implementación y correcciones; `npm test -- server/publisher.test.ts`: **22/22**.
- Cobertura: revisión/aprobación/configuración, doble clic entre instancias, dedupe entre campañas, staging real y masters, 1/N, checkpoints antes de llamadas, éxito con evidencia independiente, fallos de upload/child/IG/FB sin retry, conciliación solo GET, caption/orden incorrectos, JPEG recomprimido, URLs sensibles, worker malformado y fingerprint alterado.
- `npm run typecheck`: salida 0.
- Biome sobre publisher, tests y helpers Meta: salida 0.
- `node --check server/meta-worker.mjs`: salida 0.
- Parser de PowerShell sobre `scripts/meta-worker.ps1`: sin errores.
- `tsx scripts/reconcile.ts --help`: ayuda correcta, sin acceso a credenciales ni red.

## Límites comprobables

No se ejecutó el worker contra credenciales/campañas reales ni se comprobó una publicación remota nueva. La comparación de imágenes fue probada con JPEG recomprimido; su tolerancia con transformaciones reales de Meta requiere la primera campaña expresamente aprobada. Descargas faltantes, containers que ya no sean consultables, posts fuera de los 25 recientes o coincidencias ambiguas exigen revisión y nunca causan un reenvío. La presencia de DPAPI no prueba permisos de escritura. E2E y montaje final corresponden al root con transporte de prueba identificado.

Las páginas de referencia de developers.facebook.com devolvieron HTTP 429 durante esta implementación. Como fuente primaria adicional se consultó el SDK oficial de Meta: [IGMedia: campos y GET children](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/igmedia.py), [Post: message, is_published y permalink_url](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/post.py) y [IGUser: creación/publicación de media](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/iguser.py). El cliente local inspeccionado conserva Graph v25.0.

Rollback: desconectar los hooks del servicio detiene el uso del nuevo adaptador. Conservar los checkpoints y el historial de publicaciones existentes; no eliminarlos para permitir reintentos.
