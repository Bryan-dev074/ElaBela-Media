import { describe, expect, it } from 'vitest';
import { addToFinal, moveFinal, replaceFinal } from './composition';

describe('componer un carrusel con variantes', () => {
  it('copia una selección sin cambiar las propuestas ni el final anterior', () => {
    const original = ['a1', 'a2'];
    expect(addToFinal(original, 'b3', 3)).toEqual(['a1', 'a2', 'b3']);
    expect(original).toEqual(['a1', 'a2']);
  });
  it('impide añadir más piezas que la cantidad elegida', () => {
    expect(() => addToFinal(['a1'], 'b1', 1)).toThrow();
  });
  it('reemplaza una posición conservando el orden del resto', () => {
    expect(replaceFinal(['a1', 'a2', 'a3'], 'b3', 2)).toEqual(['a1', 'a2', 'b3']);
  });
  it('mueve sin duplicar ni perder piezas', () => {
    expect(moveFinal(['a1', 'b2', 'c3'], 2, 0)).toEqual(['c3', 'a1', 'b2']);
    expect(() => moveFinal(['a1'], -1, 0)).toThrow();
  });
});
