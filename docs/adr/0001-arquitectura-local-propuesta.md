# ADR-0001 — Web estática con servicio local

Fecha: 2026-09-09. Estado: **ACEPTADO E IMPLEMENTADO** dentro del alcance autorizado por Bryan.

## Contexto

Una interfaz profesional desplegable en Vercel, con campañas/imágenes en esta PC, y reutilización del publicador Node/PowerShell de MetaBusiness. Uso individual, sin necesidad de acceso remoto con PC apagada.

## Decisión

React 19 + TypeScript estricto + Vite 8 compilan una interfaz estática. Fastify en Node 24 sirve la API y el mismo build en loopback. El navegador de la PC conecta al servicio; Vercel no lee el disco Windows. npm y un lockfile; Biome para formato/lint; Motion como único motor JS de animación, Radix Dialog y CSS propio.

Estado JSON versionado con cola de escritor, revisión optimista y rename atómico. Assets registrados y rutas canónicas confinadas. Trabajos largos siguen en el proceso local y se conservan al recargar; un reinicio marca los inconclusos y nunca reenvía mutaciones ambiguas.

El adaptador Meta reutiliza el cliente Graph existente sin modificar el proyecto externo. Descifra DPAPI en el worker, prepara copias JPEG de los masters, persiste checkpoints y verifica por GET. Una campaña requiere selección final y revisión aprobada. Las pruebas usan transporte simulado.

## Alternativas consideradas

- Next.js/SSR: sin necesidad funcional para este estudio local; Vite reduce componentes de despliegue.
- Solo localhost: implementado como modo completo; Vercel es una entrada adicional al mismo servicio.
- Todo cloud / base y colas cloud: cambiaría la ubicación requerida del trabajo y sumaría servicios.
- SQLite: alternativa si crece concurrencia/volumen. JSON atómico cubre un operador actual.
- TanStack Query/Table, GSAP, 3D: diferidos; polling acotado, catálogo paginado y Motion/CSS cubren el flujo.

## Consecuencias y límites

La PC y el servicio deben estar activos. Un dominio Vercel necesita permiso local del navegador, origen exacto y emparejamiento; integración real pendiente del despliegue de Bryan. Las claves solo viven localmente. El proveedor de imágenes recibe los productos/referencias para generar; Meta recibe las piezas al publicar.

No se instalaron herramientas globales, túneles ni servicios permanentes. No se publicó una campaña real como prueba. La presencia de una credencial no garantiza permisos vigentes. La primera campaña explícitamente aprobada valida el tramo remoto real.

## Reversión

Detener el servicio, volver a un commit revisado y ejecutar `npm ci --ignore-scripts`. Conservar `.local`, campañas, capturas y checkpoints. El proyecto MetaBusiness original permanece intacto. No limpiar archivos de recuperación para permitir un reenvío.
