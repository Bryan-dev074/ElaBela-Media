# LIBRERÍAS — catálogo de ElaBela Media

Consultar completo antes de UI, animaciones o efectos. Última revisión: 2026-09-09. Estructura adaptada del Anexo A de STACK-AGENTE.

## Contexto de este proyecto

- Estado: primera versión implementada y verificada; package.json y package-lock.json fijan versiones.
- Framework adoptado: React 19.2.8 + TypeScript 7.0.2 + Vite 8.2.2.
- Estilos: CSS propio con tokens. Sin Tailwind ni CSS-in-JS.
- Base: controles semánticos y Radix Dialog para foco, Escape y modales.
- Motor JS de animación adoptado: **Motion 13.2.0**. No sumar GSAP.
- Scroll: nativo. Sin controlador adicional.
- Presupuesto configurado: 220 KiB gzip de JS inicial (`npm run check:bundle`). Medición tras el radar orbital: 112,9 KiB gzip; resultado en `docs/verificacion.md`.
- Uso: herramienta de marketing comercial, código en repositorio público. Mantener avisos de licencia de código/assets reutilizados; no vender un kit de terceros.

## ADOPTADAS

Instalación local: `npm install --ignore-scripts`, 165 paquetes, auditoría inicial sin vulnerabilidades. Node 24.17.0 y npm 11.13.0 ya existían; no instalaciones globales. Versiones/licencias en la tabla siguiente corresponden a versiones fijadas, salvo TanStack Query, que continúa candidata. Se comprobaron peers y engines antes de instalar. Build y flujo E2E comprobados; axe sin infracciones en radar móvil, estudio y confirmación. Resultado final de gates en `docs/verificacion.md`.

| Adopción | Uso y motivo | Validación realizada / control permanente |
|---|---|---|
| React, TypeScript, Vite | `src/`, contratos `shared/`, compilación estática para Vercel | Typecheck y build completos |
| Radix Dialog | `src/components/ui.tsx`; foco, Escape, visor y confirmación | Axe y teclado con diálogos reales |
| Motion | `src/App.tsx`; entrada breve de pantallas, sin scroll controlado | Importación selectiva, reduced-motion, bundle |
| Lucide React | Acciones con nombres accesibles en componentes | Tree shaking y medición final |
| Simple Icons, cinco SVG individuales | Logos de Pinterest, Instagram, Facebook, TikTok y YouTube junto a fuentes; sin paquete npm | CC0 1.0 revisada en repositorio oficial, revisión SVG sin scripts/enlaces; commit y licencia en `public/brand/social/README.md`. Etiqueta visible y SVG decorativo para evitar duplicar el nombre accesible |
| Fastify + multipart 10.1.1 + static 10.1.3 (MIT) | `server/app.ts`; API loopback, uploads y frontend local | Contratos, autorización y límites mediante Vitest |
| Zod | `server/`; validación en frontera de entrada | Evitar validación duplicada en cada componente |
| Sharp | `server/media.ts`; validar imágenes, previews y exportaciones | Comprobar binario Windows y originales intactos |
| Biome | Formato y lint únicos; `biome.json` | Ejecutar checks completos |
| Vitest, Playwright, axe | Pruebas de estado/API, flujo real y a11y | Sin publicaciones ni gasto real en las pruebas |

También adoptados: react-dom 19.2.8, @vitejs/plugin-react 6.1.1 (MIT), tsx 4.23.13 (MIT), tipos de Node/React (MIT). Las dependencias de desarrollo no entran en el bundle del navegador. Rollback: restaurar manifiestos/lock del commit anterior y ejecutar `npm ci --ignore-scripts`; no tocar contenido ni `.local`.

Avisos redistribuidos en `public/THIRD_PARTY_NOTICES.txt` y licencias OFL junto a las fuentes. Codex CLI se reutiliza desde la instalación existente; no se añadió como dependencia npm ni se cambió el PATH de Windows.

## VERSIONES Y LICENCIAS EVALUADAS — estado final en ADOPTADAS

Metadata consultada en el registro oficial npm el 2026-09-09. Las versiones adoptadas se fijaron en package-lock.json; TanStack Query sigue diferida. La licencia publicada y los peers son evidencia preliminar; revisar LICENSE, dependencias transitivas y bundle antes de adoptar.

| Candidata | Versión observada | Licencia declarada | Uso concreto y compatibilidad preliminar | Pendiente |
|---|---|---|---|---|
| [React](https://github.com/facebook/react) | 19.2.8 | MIT | Estado y composición de pantallas | Parear react-dom, types y compilación real |
| [Vite](https://github.com/vitejs/vite) | 8.2.2 | MIT | Build estático; Node actual satisface engines publicados | Plugin React, config y build en Windows/Vercel |
| [TypeScript](https://github.com/microsoft/TypeScript) | 7.0.2 | Apache-2.0 | Tipos estrictos de catálogo/jobs/API | Compatibilidad del toolchain al fijar versión |
| [Radix Dialog](https://github.com/radix-ui/primitives) | 1.1.23 | MIT | Visor y confirmación, peer incluye React 19 | Medir foco/teclado/ARIA en producto y peso selectivo |
| [Motion](https://github.com/motiondivision/motion) | 13.2.0 | MIT | Transiciones de selección/paneles; peer React 18/19 | Cargar funciones necesarias; bundle y reduced motion |
| [Lucide React](https://github.com/lucide-icons/lucide) | 1.43.0 | ISC | Iconos de acciones, imports selectivos, peer React 19 | Etiquetas accesibles; símbolo de GitHub desde asset oficial revisado |
| [TanStack Query](https://github.com/TanStack/query) | 5.102.8 | MIT | Estado remoto, catálogo y jobs; peer React 18/19 | Adoptar solo si simplifica caché/reconexión real |
| [Fastify](https://github.com/fastify/fastify) | 5.12.3 | MIT | API local y contratos | Revisión plugins mínimos, Node y límites/orígenes |
| [Zod](https://github.com/colinhacks/zod) | 4.5.4 | MIT | Contratos de importación/campaña/config | Evitar duplicación de validadores sin motivo |
| [Sharp](https://github.com/lovell/sharp) | 0.35.4 | Apache-2.0 | Previews/exportación de archivos, solo servidor | Binarios Windows, avisos libvips, fidelidad y dimensiones |
| [Biome](https://github.com/biomejs/biome) | 2.5.12 | MIT OR Apache-2.0 | Un formateador/linter | Cobertura React/a11y y ejecución en CI |
| [Vitest](https://github.com/vitest-dev/vitest) | 5.0.0 | MIT | Contratos y estados críticos, peers aceptan Vite 8 | Node 24 soportado según engines; comprobar pruebas |
| [Playwright Test](https://github.com/microsoft/playwright) | 1.63.0 | Apache-2.0 | E2E y capturas | Navegadores de esa versión, sin MCP duplicado |
| [axe Playwright](https://github.com/dequelabs/axe-core-npm) | 4.13.0 | MPL-2.0 | Auditoría automatizada a11y, solo desarrollo | Licencias/avisos y auditoría real de pantallas |

Para cada adopción registrar: comando real, versión fijada, ruta donde se usa, motivo, impacto medido de bundle, licencia y fecha. No sustituir este registro con «compatible» sin prueba.

## EVALUADAS Y DESCARTADAS PARA LA PRIMERA VERSIÓN

### GSAP — descartada por alcance, 2026-09-09

El flujo operativo pide microinteracciones y transiciones de paneles. No hay scroll narrativo complejo que justifique otro motor. Reconsiderar solo si aparece una timeline que Motion/CSS no resuelva con claridad; reevaluar licencia vigente entonces.

### React Bits — diferida, 2026-09-09

No se eligió un componente decorativo que justifique dependencias adicionales. El trazo luminoso del enlace de autor puede resolverse con CSS propio. Reconsiderar un componente específico con licencia, dependencias, accesibilidad y peso verificados.

### Uiverse como fuente de código — descartada, 2026-09-09

Mantener tokens, semántica y estilos coherentes. Puede servir de referencia técnica visual sin copiar fragmentos indiscriminadamente; no se utilizó ningún diseño de la galería.

### Three.js / img2threejs / WebGL — diferidas, 2026-09-09

No existe una tarea de producto que requiera 3D. Priorizar imágenes de campaña, color fiel y navegación. No se presupuestó ni midió 3D.

### TanStack Table — diferida, 2026-09-09

La búsqueda inicial admite resultados filtrados/paginados sin una tabla analítica avanzada. Reconsiderar al necesitar selección masiva, columnas configurables o grandes grids.

## CATÁLOGO DE REFERENCIA

| Recurso | Categoría | Evaluación en este proyecto |
|---|---|---|
| [shadcn/ui](https://ui.shadcn.com/) | Base de UI | Candidata alternativa. Evaluar por componente; no introducir Tailwind solo por costumbre |
| [Radix](https://www.radix-ui.com/) / [Ark](https://ark-ui.com/) | Primitivas headless | Radix Dialog adoptada. Ark no adoptada; no duplicar primitivas |
| [Motion](https://motion.dev/) | Animación | Adoptada; único motor JS |
| [GSAP](https://gsap.com/) | Animación compleja | Fuera de alcance inicial, no instalada |
| [React Bits](https://reactbits.dev/) | Decoración | Diferida; licencia por componente/versión pendiente |
| [Uiverse](https://uiverse.io/) | Referencia | No usada; reinterpretación con tokens propios si se consulta |
| [img2threejs](https://github.com/img2threejs/img2threejs) | Procedural 3D / skill | Fuera de alcance; no considerar sus ejemplos una dependencia instalada |
| [TanStack](https://tanstack.com/) | Datos | Query y Table diferidas |

## Criterios permanentes

### Tipografía adoptada — 2026-09-09

DM Sans variable para controles y Manrope variable para titulares. Fuente: repositorio oficial google/fonts y CSS de Google Fonts. Ambas SIL OFL 1.1, revisada en `ofl/dmsans/OFL.txt` y `ofl/manrope/OFL.txt`; permite este empaquetado con los avisos conservados. Archivos WOFF2 Latin autoalojados en `public/fonts/`, sin petición externa para tipografía. No requieren biblioteca JS, soportan ES/PT-BR; fallback Segoe UI. Peso descargado total: 61.768 bytes. Se descarta cargar Google Fonts remoto por privacidad, offline y estabilidad visual.

Antes de incorporar una candidata, comprobar framework/versiones/estilos, motores duplicados, bytes reales frente al presupuesto, permiso de uso comercial/redistribución y foco/ARIA/movimiento reducido. Lo decorativo no necesita una librería si CSS resuelve el caso. La licencia de un icono de marca no equivale a permiso de endoso; el enlace a Bryan debe identificarse como autor del proyecto.

### Radar orbital — revisión 2026-09-09

Referencia A elegida explícitamente por Bryan. Se adopta CSS propio para anillos y esfera, y botones nativos con iconos Lucide ya instalados para las seis categorías. No necesita WebGL, React Bits ni otro motor de animación. Selección con `aria-pressed`, foco visible, tamaño táctil y composición orbital también en móvil; transiciones respetan pausa y movimiento reducido. Simple Icons se evaluó como candidata nueva antes de usar sus cinco assets: compatible con cualquier framework, sin JS ni dependencias, licencia CC0 redistribuida. Son identificadores de las fuentes, sin implicar asociación con las plataformas. Peso y pruebas del resultado se registran en `docs/verificacion.md`.

Revisión de legibilidad solicitada por Bryan: escala tipográfica con tokens `rem`, metadatos desde 12px, lectura habitual 14–16px y botones de 14px. Reutiliza fuentes y CSS existentes; sin nueva dependencia. Verificar controles, encabezados y estudio en móvil después del aumento.
