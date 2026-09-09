# ADR 0002 — Investigación iniciada desde la app con Codex local

Estado: aceptado por Bryan el 9 de septiembre de 2026 e implementado.

## Decisión

El botón de investigación inicia `codex exec` en esta PC, con la sesión existente de Codex. La app envía el objetivo y hasta 120 productos relevantes del catálogo completo. Codex devuelve de una a seis ideas estructuradas con fuentes y adaptación editorial. No hace falta una clave API para este recorrido. Consume los límites de la cuenta de Codex y requiere conexión a Internet.

El servicio escucha en loopback y exige el emparejamiento ya existente. Lanza un proceso con argumentos separados, sin shell, ventana oculta, sandbox de solo lectura, configuración de usuario omitida, herramientas de shell/apps/plugins desactivadas y búsqueda web habilitada. La autenticación queda bajo control de Codex: no se leen ni copian sus archivos de credenciales. La clave API y variables de Meta se eliminan del entorno del investigador.

Cada investigación tiene un trabajo persistido antes de iniciar el proceso y una carpeta privada en `investigacion/AAAA-MM-DD/codex-ID/`. Una ejecución dura como máximo diez minutos, no se reintenta automáticamente y no publica ni genera imágenes. Una búsqueda nueva se rechaza mientras hay otra activa. El cierre ordenado espera los trabajos activos; un corte abrupto deja constancia de interrupción al reiniciar.

## Evidencia y referencias

El contrato pide a Codex abrir explícitamente cada URL original. CLI 0.153.4 representa algunas aperturas con `item.query` igual a la URL y `action.type=other`; búsquedas cuyo texto es una URL no cuentan como aperturas. La ejecución real también mostró investigaciones que terminan con fuentes válidas pero solo exponen eventos de búsqueda, sin URLs de sus resultados. Por eso se aceptan dos caminos auditables: una apertura registrada de Codex, o una consulta HTTP independiente del servicio a la página original en los dominios revisados. Esta última exige respuesta correcta y título de contenido, y rechaza páginas de inicio de sesión, bloqueo y error. Se conserva por separado en `verifiedPages`, con título, URL final, fecha e imágenes; no se atribuye esa apertura a Codex. Un enlace escrito únicamente en el JSON final y no comprobado por ninguna vía se descarta.

La CLI no entrega todo el contenido de los resultados de búsqueda en sus eventos. Para conservar referencias visuales se consulta la página de origen en dominios revisados de Pinterest, Instagram, Facebook, TikTok y YouTube, siguiendo solo redirecciones permitidas. Se extraen metadatos de imagen de la página, y las descargas usan la lista acotada de CDN del proyecto. No se inventan URLs. Cuando una plataforma impide el acceso o usa un CDN no admitido, una fuente ya respaldada conserva su enlace sin fingir que se descargó su imagen. No se evaden sesiones ni controles de acceso. `respuesta-codex.json` conserva la salida y eventos web antes de validar, incluso si después se rechazan los hallazgos.

Cada ficha distingue señal reciente, predicción anual e inspiración editorial. Abrir una fuente no prueba viralidad local ni rendimiento comercial. Los favoritos y sus referencias anteriores se conservan.

## Alternativas

- Responses API: queda como proveedor opcional de investigación mediante `ELABELA_RESEARCH_PROVIDER=api`; requiere clave y facturación API. No es el valor predeterminado solicitado.
- App-server persistente: añade un protocolo de sesiones y control que no hace falta para búsquedas independientes de un usuario. `exec --json` resuelve el alcance actual.
- Automatización periódica o control remoto: no se configura; el usuario inicia la investigación desde el botón.

Decisión inicial reemplazada por [ADR 0004](0004-referencias-visuales-y-generacion-chat.md): la generación predeterminada prepara un pedido para el chat, sin API paga. La API separada queda opt-in explícito. La suscripción de Codex no se presenta como una clave ni como crédito para esa API.

Referencias oficiales: [ejecución no interactiva](https://learn.chatgpt.com/docs/non-interactive-mode), [configuración](https://learn.chatgpt.com/docs/config-file/config-reference). Opciones contrastadas con `codex exec --help` de la instalación local.
