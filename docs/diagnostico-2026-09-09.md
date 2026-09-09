# Diagnóstico — 2026-09-09

## Entorno y proyecto

| Elemento | Evidencia observada |
|---|---|
| Carpeta original | Solo `logo/`, con cinco PNG |
| SO | Microsoft Windows 10.0.26200, según RuntimeInformation |
| Shell | PowerShell 7.6.5 |
| Node | 24.17.0 |
| npm | 11.13.0 |
| Git | 2.54.0.windows.1 |
| Codex CLI | 0.153.4 |
| gh / agent-browser | No localizados en PATH; existen conectores de GitHub y navegador integrado |
| Proyecto Git local | No inicializado |
| Manifiesto / lockfile / framework | Ausentes |
| Repositorio remoto | Público, tamaño 0, rama predeterminada main, sin refs; con permisos push/admin según conector |
| OpenAI API key | No presente en el entorno de este proceso; no se exploraron secretos ajenos |

No se requiere instalar Node, cambiar Windows, activar Modo Desarrollador ni añadir plugins para comenzar. No se hicieron instalaciones ni modificaciones globales. La copia de STACK-AGENTE de Downloads coincide por SHA-256 con la referencia personal.

## Marca

| Archivo | Dimensiones | PNG con canal alfa |
|---|---:|---|
| logosinfondo.png | 6250 × 6250 | Sí |
| logoecommerce.png | 6250 × 6250 | No |
| glow.png | 2000 × 2000 | No |
| qrrr.png | 2000 × 2000 | Sí |
| qrrr-removebg-preview.png | 500 × 500 | Sí |

Se inspeccionaron visualmente `logosinfondo.png` y `logoecommerce.png`: marca tipográfica Ela Bela glow. Se conservaron los cinco originales intactos. Los demás están inventariados, no evaluados como logo preferido.

## Catálogo

Fuente: https://lista.elabela.com.py/ consultada por HTTP GET público, páginas `?page=1` a `?page=79`, máximo dos lecturas simultáneas. La página declara solo productos en stock y un total de 1573.

Resultado: 1573 filas, 1573 IDs únicos, 199 marcas, 61 categorías. Se verificó la cantidad de páginas y la ausencia de IDs duplicados. La captura no es transaccional: cambios de catálogo durante una lectura futura exigen detectar diferencias. Los thumbnails son referencias para búsqueda, no archivos de impresión ni fotos de máxima resolución.

Cada fila conserva ID, nombre, categoría, marca, precio como texto y USD, URL de producto, thumbnail, URL de origen y timestamp. La disponibilidad debe revalidarse antes de recomendar una compra o anunciar precio.

## MetaBusiness

Código inspeccionado: `run-publication.ps1`, `publish-meta-carousel.mjs`, `lib/meta-api.mjs` y `lib/meta-publisher.mjs`. Se localizaron también runner y módulos de video.

- El token protegido existe y el runner lo descifra solo durante la ejecución, bajo la cuenta de Windows.
- `node --test` ejecutado en `D:\ElaBela\MetaBusiness`: **66 pass, 0 fail**.
- Graph API v25.0: GET de identidad de la página y cuenta vinculada exitoso; ElaBela Glow y @ela.bela.glow coinciden con el job existente.
- No se ejecutaron POST de publicación ni se publicaron piezas de prueba.
- El contrato de carrusel exige al menos dos imágenes y una caption compartida. No hay soporte verificado para imagen individual en este runner.
- Publica ambos destinos y usa estados/locks/reconciliación. La web deberá expresar la publicación parcial por destino.
- La función de archivo mueve/elimina fuentes tras publicación. La integración deberá usar copias de staging y mantener masters intactos.
- La comprobación independiente de caption/tipo/permalink de carruseles debe formar parte del adaptador; no basta confiar en la existencia de IDs.

Pendiente: probar el futuro adaptador web; validar permisos de escritura y resultado de publicación solo cuando exista una campaña aprobada. No se confunde conexión de lectura con prueba de publicación.

## Viabilidad técnica

Vite está soportado oficialmente en Vercel: https://vercel.com/docs/frameworks/frontend/vite. El frontend puede alojarse allí; el trabajo sobre disco y Meta requiere proceso local. Chrome documenta restricciones/permisos de acceso a red local: https://developer.chrome.com/blog/local-network-access. La combinación real de navegador + Vercel + servicio local requiere E2E; no se declara ya validada.

OpenAI documenta generación/edición por API, dimensiones personalizadas y controles de calidad: https://developers.openai.com/api/docs/guides/image-generation. Hay capacidad de generación asistida dentro de esta sesión, pero no equivale a una credencial instalada para la futura página. No se contrató ni consumió una API de pago.
