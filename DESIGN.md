---
name: ElaBela Media
description: Atelier digital de campañas de belleza, en porcelana lila y berenjena.
colors:
  primary: "#7652B7"
  primary-deep: "#53328B"
  ink: "#30203F"
  muted: "#6D5B7A"
  background: "#F7F5FA"
  surface: "#FFFFFF"
  lilac: "#EEE7F7"
  border: "#E5DEED"
  sidebar: "#241632"
  nude: "#E8C7BC"
  danger: "#9C304D"
  danger-deep: "#7E223B"
  danger-wash: "#FBF0F3"
typography:
  body:
    fontFamily: "DM Sans, Segoe UI, sans-serif"
    fontSize: "14px"
    lineHeight: 1.5
  headline:
    fontFamily: "Manrope, Segoe UI, sans-serif"
    fontWeight: 600
    letterSpacing: "-0.03em"
  ornament:
    fontFamily: "Georgia, serif"
    fontSize: "31px"
rounded:
  control: "8px"
  panel: "14px"
spacing:
  unit: "4px"
  group: "16px"
  section: "32px"
---

## Overview

Un atelier digital de belleza que Bryan usa en su escritorio. El trabajo visual dirige la composición: radar de referencias grandes, tira de progreso y estudio con propuestas separadas y montaje final. Prima la precisión de selección frente a decoración de dashboard.

## Colors

Canvas porcelana lila, navegación berenjena, acciones moradas, tipografía ciruela y blanco en controles activos. El contenido conserva sus colores, sin overlays que distorsionen cosméticos. Nude recuerda la identidad original de ElaBela.

Eliminar usa carmín `#9C304D`, hover `#7E223B` y fondo suave `#FBF0F3`, reservados a esta acción. El texto y el icono identifican su función sin depender del color. La confirmación usa el diálogo existente, título de campaña a 18px/1.125rem y párrafos a 15px, con ajuste de línea para nombres largos.

## Typography

DM Sans variable para interfaz y Manrope variable para titulares, autoalojadas en WOFF2 Latin con licencia OFL. Segoe UI como fallback. Soporte de español/portugués y 61.768 bytes de fuentes en total. Marcas y SKU mantienen capitalización original; titulares directos, párrafos breves.

Georgia del sistema se reserva al pequeño monograma decorativo «e.» de la nota editorial; no es una tercera fuente de lectura ni un recurso descargado. A petición de Bryan, se aumentó la escala en toda la aplicación: metadatos desde 12px, apoyo 13px, lectura y controles 14–15px, titulares de referencia 17–18px, sección 21–25px y página 28–32px. Los cuatro tamaños menores son tokens `rem` para respetar el tamaño base del navegador. En teléfono se mantiene una columna con títulos 17px y descripciones 15px. La edición de textos usa contraste medido, también en índices, ayudas y contadores.

## Layout

Sidebar 234px, header discreto con enlace de autor, contenido ancho con márgenes generosos. Radar de tres columnas en escritorio y referencias grandes. En Estudio, cada propuesta tiene su propia fila y el carrusel final es un destino separado. En móvil, navegación compacta y etapas secuenciales.

Revisión solicitada por Bryan: el radar sigue la propuesta A que adjuntó, con una esfera violeta y seis categorías en órbita. La selección guía una investigación editable y filtra la biblioteca por temática. En escritorio el radar comparte espacio con el contexto de búsqueda; en móvil mantiene las seis posiciones alrededor del centro y sitúa el contexto debajo. La biblioteca tiene su propio título y filtros de fuente/formato; los logos identifican el dominio real del enlace. Guardados conserva acceso directo a las referencias.

## Elevation & Depth

Separación por superficies y espacio. Sombra con desplazamiento solo para elementos flotantes/visor. El enlace GitHub admite un borde luminoso en movimiento porque Bryan lo pidió; el resto de la herramienta no compite con él.

## Shapes

Piezas y referencias verticales, radios de panel moderados. Controles compactos con radio de 8px. Símbolo de estudio vectorial de dos marcos 4:5 superpuestos, formando una E. Logo corporativo provisto en las creatividades.

## Components

Nav, buscador, filtros, tarjetas de referencia, selector de productos, editor de copy, bandejas de propuestas A/B/C y tira de carrusel final. Acciones primarias con texto. Iconos solos únicamente con nombre accesible. Visor accesible con escape, foco contenido y retorno.

## Do's and Don'ts

- Mostrar fuente/fecha y estados reales; la foto de referencia no es una pieza generada.
- Tres propuestas completas separadas; el final referencia imágenes sin destruirlas.
- La animación de GitHub es continua lenta, pausable y estática con prefers-reduced-motion.
- Cargar contenido visible por defecto y usar transiciones breves al cambiar de selección.
- No usar números de viralidad, progreso, precio o publicación inventados.
- No 3D ni motor de scroll; Motion es el único motor JS adoptado.
