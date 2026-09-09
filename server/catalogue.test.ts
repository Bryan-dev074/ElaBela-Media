import { describe, expect, it } from 'vitest';
import { parseCataloguePage, validateCatalogue } from './catalogue.js';

const html = `<span>1 de 1 resultados</span><table><tbody><tr><td><input value="17"></td><td><span>17</span></td><td><img src="https://www.elabela.com.py/photo.jpg"></td><td><a href="https://www.elabela.com.py/index.php?id_product=17&amp;controller=product">NYX &amp; color</a></td><td>Labios</td><td>NYX</td><td>U$ 15.00</td></tr></tbody></table>`;
describe('public catalogue snapshots', () => {
  it('preserves actual source identity, decoded names, currency and observation date', () => {
    const result = parseCataloguePage(html, 1, '2026-09-09T12:00:00.000Z');
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: '17',
      name: 'NYX & color',
      currency: 'USD',
      productUrl: 'https://www.elabela.com.py/index.php?id_product=17&controller=product',
      observedAt: '2026-09-09T12:00:00.000Z',
    });
    expect(validateCatalogue(result.items, 1)).toHaveLength(1);
  });
  it('rejects incomplete, duplicated or changed markup snapshots before replacement', () => {
    const parsed = parseCataloguePage(html, 1, '2026-09-09T12:00:00.000Z');
    expect(() => validateCatalogue(parsed.items, 2)).toThrow(/incompleto/);
    expect(() => validateCatalogue([...parsed.items, ...parsed.items], 2)).toThrow(/duplicados/);
    expect(() => parseCataloguePage('<html>Mantenimiento</html>', 1, '')).toThrow(/estructura/);
    expect(() =>
      parseCataloguePage(html.replaceAll('https://www.elabela.com.py', 'https://example.com'), 1, ''),
    ).toThrow(/oficial/);
  });
});
