# ADR 0005 — Conexión desde la página local

Fecha: 2026-09-10. Estado: aceptado dentro de la corrección de conexión solicitada por Bryan.

## Problema y decisión

Abrir la URL local en una pestaña nueva no aportaba la credencial del iniciador. El formulario exigía un código en un campo oculto y no llegaba a ejecutar Conectar. Se conserva la credencial de sesión existente y la API con Bearer, añadiendo `POST /api/local-connection` exclusivamente para la página servida por el mismo origen local.

La ruta exige Host loopback del puerto configurado, Origin permitido e idéntico a `http://Host`, `Sec-Fetch-Site: same-origin`, método POST y el encabezado propio `X-ElaBela-Connect: local`. No comparte la sesión con orígenes Vercel, otros puertos, navegación GET ni peticiones sin esos indicadores. Responde con `Cache-Control: no-store`. Solo devuelve la capacidad local que ya usa el iniciador; nunca tokens de Meta ni del proveedor de imágenes. Sigue siendo una herramienta de un operador de esta PC, no un sistema multiusuario.

Tras fallar la carga inicial, la página local intenta emparejarse una vez. Conectar permite repetir explícitamente con progreso y errores visibles dentro del diálogo. La conexión manual conserva su función; los campos cerrados quedan deshabilitados y no bloquean la validación. La credencial permanece en sessionStorage, sin añadirla a la URL ni al almacenamiento persistente del navegador. El enlace del iniciador sigue funcionando para Vercel, sin emparejamiento automático entre orígenes.

## Alternativas, validación y reversión

Se descarta quitar autenticación a la API, ampliar CORS, guardar la credencial en localStorage o pedir que Bryan copie claves para cada pestaña local. Se reutilizan Fetch, Fastify, React y Radix, sin nuevas dependencias.

Regresiones cubren pestaña nueva, recarga, sesión antigua, botón con campos cerrados, error visible, modo manual, accesibilidad móvil y rechazo de otros orígenes. La conexión real se comprobó en las pestañas existentes de Codex y Chrome, que muestran PC conectada. No se generaron ni publicaron campañas durante la prueba.

Reversión: restaurar el código anterior y reiniciar el servicio; el iniciador y su enlace siguen siendo la vía de conexión anterior. Conservar `.local`, credencial, campañas y originales; no se migró el estado privado.
