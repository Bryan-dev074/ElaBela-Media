import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { searchIdeas } from './provider-trends.js';
import { Store } from './store.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const pin = 'https://www.pinterest.com/pin/905856912651470473/';
const image = 'https://i.pinimg.com/cosmetic-test.jpg';
const idea = {
  title: 'Gloss protagonista',
  summary: 'Collage de cosméticos',
  rationale: 'Idea editorial de prueba',
  category: 'Maquillaje',
  format: 'Carrusel',
  platform: 'Pinterest',
  evidence: 'editorial',
  sourceUrl: pin,
  sourceName: 'Pinterest',
  publishedAt: null,
  region: 'Prueba',
  suggestedSlides: 3,
  productIds: [],
  references: [{ url: image, title: 'Gloss de prueba' }],
  palette: [],
  keywords: ['gloss'],
};

async function search(
  sourceUrl: string,
  imageSource: string,
  sourceTitle = 'Gloss collage de cosméticos',
  imageUrl = image,
) {
  const root = await mkdtemp(join(tmpdir(), 'elabela-visual-test-'));
  roots.push(root);
  await mkdir(join(root, 'data'));
  await writeFile(join(root, 'data/trends.json'), '[]');
  const store = new Store(root);
  await store.init();
  return searchIdeas('gloss', undefined, 'test-key', 'test-model', store, async () => ({
    output: [
      {
        type: 'web_search_call',
        action: { sources: [{ url: sourceUrl }] },
        results: [
          { type: 'image_result', image_url: imageUrl, source_website_url: imageSource, title: sourceTitle },
        ],
      },
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify({
              trends: [{ ...idea, sourceUrl, references: [{ url: imageUrl, title: 'Gloss de prueba' }] }],
            }),
          },
        ],
      },
    ],
  }));
}

it('does not join an image from another search result to a cosmetics pin', async () => {
  const results = await search(pin, 'https://www.pinterest.com/pin/123456789/');
  expect(results[0]?.references).toEqual([]);
  expect(results[0]?.visualStatus).toBe('unavailable');
});

it('keeps API report results as context, even when a generic image is present', async () => {
  const report = 'https://business.pinterest.com/pinterest-predicts/';
  const results = await search(report, report, 'Pinterest annual beauty report FOOTBALL');
  expect(results[0]?.references).toEqual([]);
  expect(results[0]?.visualStatus).toBe('context');
});

it('accepts a cosmetics image attached to the same specific source result', async () => {
  const results = await search(pin, pin);
  expect(results[0]?.references).toMatchObject([{ url: image, sourceUrl: pin }]);
  expect(results[0]?.visualStatus).toBe('example');
});

it('rejects an unrelated source result despite the model labelling it as cosmetics', async () => {
  const results = await search(pin, pin, 'FOOTBALL stadium poster');
  expect(results[0]?.references).toEqual([]);
  expect(results[0]?.visualStatus).toBe('unavailable');
});

it.each([
  'https://s.pinimg.com/webapp/logo.png',
  'https://i.pinimg.com/FOOTBALL-cover.jpg',
  'https://images.ctfassets.net/test/placeholder.jpg',
  'https://i.pinimg.com/test/share-image.png',
])(
  'rejects a generic or unrelated API image even when its source result is cosmetic: %s',
  async (imageUrl) => {
    const results = await search(pin, pin, 'Gloss collage de cosméticos', imageUrl);
    expect(results[0]?.references).toEqual([]);
    expect(results[0]?.visualStatus).toBe('unavailable');
  },
);
