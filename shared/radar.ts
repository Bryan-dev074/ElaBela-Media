import type { Trend } from './types';

export const radarTopics = [
  {
    id: 'makeup',
    label: 'Maquillaje',
    detail: 'Colores · Técnicas · Looks',
    prompt: 'maquillaje, labios y looks',
    description: 'Color, texturas y looks para darle protagonismo a cada producto.',
    terms: [
      'maquillaje',
      'maquiagem',
      'makeup',
      'make up',
      'labios',
      'labial',
      'labiales',
      'batom',
      'batons',
      'gloss',
      'lip',
      'lips',
      'lipstick',
      'sombras',
      'delineado',
      'blush',
    ],
  },
  {
    id: 'skincare',
    label: 'Skincare',
    detail: 'Rutinas · Ingredientes',
    prompt: 'skincare y cuidado de la piel',
    description: 'Rutinas, ingredientes y pequeños rituales de cuidado para contar con claridad.',
    terms: [
      'skincare',
      'skin care',
      'piel',
      'pele',
      'serum',
      'serums',
      'facial',
      'hidratante',
      'hidratantes',
      'protector solar',
      'protetor solar',
    ],
  },
  {
    id: 'nails',
    label: 'Uñas',
    detail: 'Diseños · Colores',
    prompt: 'uñas, esmaltes y nail art',
    description: 'Diseños, combinaciones y detalles que convierten el color en una idea.',
    terms: ['uñas', 'unhas', 'nails', 'nail', 'esmalte', 'esmaltes', 'manicura', 'manicure'],
  },
  {
    id: 'fragrance',
    label: 'Fragancias',
    detail: 'Notas · Sensaciones',
    prompt: 'perfumes y fragancias',
    description: 'Notas, momentos y sensaciones para construir una historia alrededor del perfume.',
    terms: [
      'fragancia',
      'fragancias',
      'fragrancia',
      'fragrancias',
      'fragrance',
      'perfume',
      'perfumes',
      'perfumaria',
      'aroma',
      'aromas',
      'body splash',
    ],
  },
  {
    id: 'hair',
    label: 'Cabello',
    detail: 'Texturas · Peinados',
    prompt: 'cabello, peinados y cuidado capilar',
    description: 'Peinados, texturas y rutinas que muestran el producto en contexto.',
    terms: [
      'cabello',
      'cabelo',
      'cabelos',
      'hair',
      'peinado',
      'peinados',
      'penteado',
      'penteados',
      'capilar',
      'shampoo',
      'champu',
    ],
  },
  {
    id: 'lifestyle',
    label: 'Estilo de vida',
    detail: 'Bienestar · Rituales',
    prompt: 'estilo de vida, rituales de belleza y bienestar',
    description: 'Objetos, momentos cotidianos y rituales que conectan belleza con vida real.',
    terms: [
      'estilo de vida',
      'lifestyle',
      'bienestar',
      'bem estar',
      'ritual',
      'rituales',
      'rituais',
      'autocuidado',
      'self care',
      'wellness',
    ],
  },
] as const;

export type RadarTopic = (typeof radarTopics)[number];
export const researchStyles = [
  'Inspiración',
  'Carruseles',
  'Tutoriales',
  'Humor',
  'Diseño de producto',
] as const;
export type ResearchStyle = (typeof researchStyles)[number];

export function normalizeRadarText(value: string) {
  return (
    value
      .normalize('NFD')
      // Ñ is a distinct Spanish letter: "unas ideas" does not mean nail ideas.
      .replace(/n\u0303/gi, 'ñ')
      .replace(/\p{M}/gu, '')
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  );
}

// Thematic navigation, not an assertion about the original source's category.
// Whole normalized words avoid "piel" matching "pincel" or "lip" matching "clip".
export function matchesRadarTopic(
  trend: Pick<Trend, 'category' | 'title' | 'summary' | 'keywords'>,
  topic: RadarTopic | undefined,
): boolean {
  if (!topic) return true;
  const text = ` ${normalizeRadarText(`${trend.category} ${trend.title} ${trend.summary} ${trend.keywords.join(' ')}`)} `;
  return topic.terms.some((term) => text.includes(` ${term} `));
}

export function radarResearchQuery(topic: RadarTopic | undefined, style: ResearchStyle): string {
  const direction =
    style === 'Inspiración' ? 'tendencias y estilos visuales de marketing' : style.toLocaleLowerCase();
  return `Buscá ${direction} sobre ${topic?.prompt || 'belleza y cosméticos'} para ElaBela. Priorizá pins y posts de cosméticos con imágenes de la fuente original: anuncios, collages o carruseles. Explorá Pinterest e Instagram. Excluí deporte, moda ajena y portadas de informes. Público Paraguay/Brasil, español/portugués. Distinguí tendencias de inspiración editorial.`;
}

export function hasBeautySubject(value: string): boolean {
  const text = ` ${normalizeRadarText(value)} `;
  const terms = [
    ...radarTopics.filter((topic) => topic.id !== 'lifestyle').flatMap((topic) => [...topic.terms]),
    'belleza',
    'beleza',
    'beauty',
    'cosmetico',
    'cosmeticos',
    'cosmetic',
    'cosmetics',
    'maquilhagem',
    'lipgloss',
    'lip oil',
    'limpieza facial',
    'sunscreen',
    'eyeshadow',
    'mascara',
    'eyeliner',
    'foundation',
    'concealer',
    'lipbalm',
  ];
  return terms.some((term) => text.includes(` ${term} `));
}

export function hasUnrelatedSubject(value: string): boolean {
  return /\b(football|futbol|futebol|soccer|stadium|basketball|deportes|sports|home decor|living room|interior design|fashion outfits|outfits collection)\b/.test(
    normalizeRadarText(value),
  );
}
