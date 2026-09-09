export function addToFinal(items: string[], assetId: string, max: number): string[] {
  if (items.length >= max) throw new Error('El carrusel está completo. Reemplazá una pieza.');
  return [...items, assetId];
}
export function replaceFinal(items: string[], assetId: string, index: number): string[] {
  if (!Number.isInteger(index) || index < 0 || index >= items.length) throw new Error('Posición inválida.');
  return items.map((item, i) => (i === index ? assetId : item));
}
export function moveFinal(items: string[], from: number, to: number): string[] {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  )
    throw new Error('Posición inválida.');
  const result = [...items];
  const [item] = result.splice(from, 1);
  if (item) result.splice(to, 0, item);
  return result;
}
