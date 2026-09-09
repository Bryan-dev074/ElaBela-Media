# Correcciones de revisión — 2026-09-09

Seis hallazgos resueltos con regresiones que fallaron antes del cambio y pasaron después. Sin publicaciones Meta reales, llamadas pagas, lectura de `Token.txt`, instalaciones o commits. Backup previo: `.local/review-backup-20260909-103920/`.

1. **Identidad de imágenes y conciliación IG.** Se reemplazó la comparación global reducida por RGB 1080×1350 con bloques 16×16: media global máxima 8/255, media máxima de bloque 12/255 y como máximo 3% de píxeles por bloque con diferencia media de canales superior a 40/255. Se mantiene la comprobación de orden contra otras piezas distintas. Las pruebas rechazan un precio eliminado o cambiado, aceptan JPEG recomprimido y detectan orden invertido. Un ID IG perdido queda `unknown`: no se adopta un post reciente aunque su imagen, caption y fecha coincidan. No hay reintento de mutaciones. Facebook conserva la recuperación basada en IDs de fotos persistidos.
2. **Confinamiento de archivos.** El directorio canónico de `contenido` y de `.local` debe pertenecer a la raíz canónica del proyecto antes de aceptar un archivo descendiente. La regresión usa un junction temporal que apunta fuera del proyecto y comprueba el rechazo antes de ejecutar el worker.
3. **Confirmación final.** La casilla representa una revisión concreta. Una actualización recibida por polling invalida la confirmación, deshabilita publicar y el handler vuelve a comparar la revisión antes de aprobar/publicar.
4. **Borrador de textos.** Estado por campaña en `sessionStorage`, restaurado tras navegación y recarga; indicador explícito de navegador frente a PC y advertencia al cerrar con borradores pendientes. «Guardar borrador» persiste en el servidor con `copyApproved: false`, sin avanzar de etapa. Si cambió la revisión del servidor, se conserva el texto local, se muestra el conflicto y se bloquea sobrescribir/aprobar hasta una decisión explícita. Los borradores pendientes bloquean generación y publicación.
5. **Navegación móvil.** El panel cerrado usa `inert`, `aria-hidden` y `visibility: hidden`; no recibe Tab. Al abrir recibe foco y mantiene la navegación de teclado dentro del panel. Escape cierra y devuelve el foco al botón de apertura.
6. **Apagado atómico.** Se sustituyó la consulta de trabajos seguida de finalización forzada por una solicitud autenticada al servicio. El cierre y los claims comparten la cola del Store.

## Contrato de apagado

- `POST /api/shutdown` requiere la credencial local y retorna `202 { draining: true, activeJobs: number }`.
- `LocalApp.beginShutdown()` devuelve el mismo resultado y sirve a SIGINT/SIGTERM. La operación es idempotente.
- `Store.beginShutdown()` sella la admisión antes de contar trabajos activos. Desde ese momento los claims de publicación/generación y los nuevos jobs `running`/`queued` se rechazan con 503. Tampoco se puede reactivar un job terminado.
- Los jobs ya activos pueden guardar progreso y terminar. `Store.waitForIdle()` resuelve cuando su estado terminal quedó persistido; entonces el servicio ejecuta `app.close()`, liberando el service lock existente.
- `scripts/stop.ps1` conserva la comprobación de PID, nombre y hora de inicio, solicita el cierre por POST y nunca ejecuta `Stop-Process`. Un fallo de conexión informa el problema y no fuerza el proceso.
- Las integraciones que crean trabajos deben persistir el job activo antes de iniciar efectos externos. Esto permite que el sello de admisión proteja también hooks que esperaron una operación asíncrona antes de reclamar trabajo.

## Evidencia

- `npm test -- server/publisher.test.ts`: **25/25**.
- Pruebas de shutdown, aplicación, claim y service lock: **24/24** durante la corrección de cierre. Después se añadió la allowlist de puerto de prueba y `npm test -- server/app.test.ts` pasó **19/19**.
- `npm run typecheck`: salida 0.
- Biome sobre los 16 archivos modificados de implementación y pruebas: sin errores ni advertencias.
- `npm run build`: salida 0. Bundle principal 348,77 kB; gzip 112,91 kB. CSS gzip 9,60 kB.
- `npm run test:e2e`: **6/6**, incluyendo las dos pruebas anteriores, cuatro regresiones nuevas y las comprobaciones axe/WCAG AA existentes. Puerto dedicado **5187**, habilitado explícitamente solo en el fixture. El proceso ajeno en 5173 no se detuvo.
- `node --check server/meta-worker.mjs`: salida 0. Parser PowerShell de `scripts/stop.ps1`: sin errores; no se ejecutó el cierre contra un servicio real.

Las comprobaciones de identidad prueban transformaciones JPEG locales; la primera campaña real todavía requiere aprobación explícita y verificación remota. La comparación perceptual no demuestra un ID de publicación perdido, por eso no se usa para recuperarlo. Las correcciones del proveedor de investigación y el puente Codex quedan en la integración del root.
