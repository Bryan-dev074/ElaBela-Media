# ElaBela Media — especificación vigente

Fecha: 2026-09-09. Alcance confirmado por Bryan e implementado. La clave API y el despliegue Vercel son configuraciones externas pendientes; la validación de una publicación real requiere su primera campaña aprobada.

## Flujo acordado

1. Encontrar trends o estilos de marketing, guardar fuente/fecha/referencias y explicar por qué sirven para productos reales de ElaBela. Guardar favoritos y conservarlos al investigar de nuevo.
2. Elegir idea, productos, idioma ES o PT-BR y N imágenes. La interfaz admite 1–10 piezas.
3. Presentar tres opciones editables de textos de imagen y descripción. No generar antes de que Bryan elija y apruebe.
4. Crear tres propuestas completas de N piezas cada una: 3N archivos separados, coherencia dentro de cada propuesta, proporción 4:5, envase real y logo suministrado.
5. Armar una selección final independiente: usar una propuesta completa o mezclar piezas. Arrastre copia referencias; botones permiten añadir, reemplazar, mover y quitar sin destruir las propuestas.
6. Ver las imágenes originales, zoom al 100 %, descargar los bytes reales y revisar orden/texto/productos.
7. Confirmar el contenido concreto para Instagram y Facebook. Cualquier edición invalida la revisión anterior; publicación incierta queda bloqueada contra reenvío.

La interfaz se mantiene en español; el contenido publicitario se elige por campaña. El mensaje accidental sobre «A / ajustar espacio» fue retirado por Bryan y no cambia el diseño.

## Arquitectura y persistencia

React/Vite estático, servido en localhost o desplegable en Vercel. Fastify/Node24 en `127.0.0.1:4317` conserva datos e imágenes dentro del proyecto. La página alojada conecta desde el navegador de esta PC; Vercel no ejecuta PowerShell ni accede al disco.

`.local/state.json` conserva campañas, copy, propuestas, orden final, revisiones, jobs y assets. Escrituras serializadas y atómicas. `contenido/AAAA/MM/<id>/` conserva originales, previews, entradas/salidas del generador, staging y checkpoints. Capturas públicas de productos en `datos/catalogo/`; referencias en `data/references/`; fuentes en `investigacion/`.

Servicio ligado a loopback; token local de emparejamiento, Host y Origin exactos, sin CORS comodín. El token de emparejamiento persiste en disco y se guarda en sessionStorage de la pestaña, no es de un solo uso. Secretos Meta/OpenAI nunca se empaquetan en el navegador o Git.

## Búsqueda y generación

Búsqueda web con fuente trazable y distinción entre señal reciente, informe anual e idea editorial. No prometer viralidad, métricas, stock vigente ni beneficios no verificados. El catálogo es una captura; los IDs y fotos se contrastan con fichas oficiales al generar.

Proveedor configurable desde `.env` local. Perfil de imagen: alta calidad, PNG 1536×1920, 4:5. Los inputs son fotos de producto, referencias y logo. La firma de marca se aplica desde el archivo original en el pie reservado; se guarda también la salida cruda del proveedor. Las previews son archivos separados. Todo resultado requiere revisión visual humana de texto/envase/tono.

Por confirmación explícita de Bryan, el botón inicia `codex exec` en esta PC para investigar y devolver fuentes e imágenes de referencia al radar. Usa la sesión de Codex, sin clave API; no envía mensajes al chat actual. Sin API key también funcionan biblioteca, opciones locales de texto e importaciones de piezas. La generación de imágenes desde la web usa la API de imágenes separada. Los jobs sobreviven a la recarga; tras un corte abrupto quedan interrumpidos sin reintentos automáticos.

## Publicación

Adaptador del cliente Graph en `D:\ElaBela\MetaBusiness`, sin alterar sus archivos. Soporte de imagen única y carrusel. Worker Windows descifra el token protegido solo en el proceso hijo. Caption y orden proceden de la revisión aprobada; fingerprint deduplica contenido/destinos. Staging JPEG 1080×1350 conserva masters.

Checkpoints anteriores/posteriores a cada mutación. Ante incertidumbre, parar y conciliar solo con GET. El estado verificado exige evidencia del destino; si no alcanza, permanece pendiente. No hay reanudación automática de destinos parcialmente publicados. La primera versión prioriza evitar duplicados.

Las pruebas nunca publican en cuentas reales. El fixture de E2E indica explícitamente «PRUEBA AUTOMATIZADA. No se publicó nada en Meta».

## Diseño y entrega

Atelier de belleza: lienzo lila porcelana, navegación berenjena, acentos morados, referencias protagonistas, DM Sans/Manrope autoalojadas. Marca original del estudio y crédito GitHub animado a Bryan, con preferencia de movimiento reducido y pausa en Mi espacio. Tres propuestas separadas y carrusel final visible como destino propio. Radix Dialog resuelve foco/Escape en visor y confirmación.

Comprobaciones: tipos estrictos, Biome, tests API/archivos/concurrencia/publicación, build Vite, E2E de flujo, axe WCAG AA, revisión visual, bundle inicial ≤220 KiB gzip y auditoría de dependencias. El estado de esas comprobaciones se registra en `docs/verificacion.md`; no equivale a probar proveedores remotos con credenciales reales.

Bryan autorizó subir el resultado revisado a `Bryan-dev074/ElaBela-Media`. Él importará el repositorio en Vercel. No se autorizó una publicación de marketing durante este desarrollo ni un despliegue de infraestructura adicional.

## Ampliaciones separadas

Calendario/programación, estadísticas de publicaciones, acceso desde el teléfono, presets editoriales y exportaciones 2:3/9:16. Requieren nueva elección de Bryan. ES/PT-BR, tres propuestas y mezcla ya forman parte del alcance principal.

## Fuentes técnicas

- [Generación de imágenes](https://developers.openai.com/api/docs/guides/image-generation).
- [Búsqueda web con fuentes](https://developers.openai.com/api/docs/guides/tools-web-search).
- [Vite en Vercel](https://vercel.com/docs/frameworks/frontend/vite).
- [Acceso de Chrome a red local](https://developer.chrome.com/blog/local-network-access).
- Cliente Graph y pruebas locales de MetaBusiness; detalles de adaptador en `docs/task-reports/publisher.md`.
