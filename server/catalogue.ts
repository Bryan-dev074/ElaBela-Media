import type { Product } from '../shared/types.js';

function decode(value: string): string {
  const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (all, entity: string) => {
    if (!entity.startsWith('#')) return named[entity.toLowerCase()] ?? all;
    const code =
      entity[1]?.toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
  });
}
const text = (value: string) =>
  decode(value.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
function officialUrl(value: string): string {
  const url = new URL(decode(value));
  if (
    url.protocol !== 'https:' ||
    !['www.elabela.com.py', 'elabela.com.py'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error('El catálogo contiene una URL fuera de la tienda oficial.');
  return url.href;
}
export function parseCataloguePage(html: string, page: number, observedAt: string) {
  const total = Number(/\d+\s+de\s+(\d+)\s+resultados/.exec(html)?.[1]);
  const tbody = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i.exec(html)?.[1];
  if (!Number.isSafeInteger(total) || total < 1 || !tbody)
    throw new Error('Cambió la estructura del catálogo. No se reemplazó la captura anterior.');
  const pages = Math.max(
    page,
    ...Array.from(html.matchAll(/[?&](?:amp;)?page=(\d+)/g), (match) => Number(match[1])),
  );
  const items: Product[] = [];
  for (const row of tbody.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = Array.from(
      (row[1] || '').matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi),
      (cell) => cell[1] || '',
    );
    const id = text(cells[1] || '');
    const photo = /\bsrc=["']([^"']+)["']/i.exec(cells[2] || '')?.[1];
    const link = /\bhref=["']([^"']+)["']/i.exec(cells[3] || '')?.[1];
    if (cells.length !== 7 || !/^\d+$/.test(id) || !photo || !link || !text(cells[3] || ''))
      throw new Error('Cambió la estructura de una fila del catálogo.');
    items.push({
      id,
      name: text(cells[3] || ''),
      category: text(cells[4] || ''),
      brand: text(cells[5] || ''),
      priceText: text(cells[6] || ''),
      currency: 'USD',
      productUrl: officialUrl(link),
      thumbnailUrl: officialUrl(photo),
      listedInStock: true,
      observedAt,
    });
  }
  return { total, pages, items };
}
export function validateCatalogue(items: Product[], expected: number): Product[] {
  if (new Set(items.map((product) => product.id)).size !== items.length)
    throw new Error('El catálogo contiene IDs duplicados. Conservamos la captura anterior.');
  if (items.length !== expected)
    throw new Error(`Catálogo incompleto: ${items.length} de ${expected}. Conservamos la captura anterior.`);
  return items;
}
