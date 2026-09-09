import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, expect, it, vi } from 'vitest';
import type { Trend } from '../shared/types.js';
import { createCodexResearch } from './codex-research.js';
import { cacheTrendReferences, searchIdeas } from './provider-trends.js';
import { Store } from './store.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const source = 'https://www.pinterest.com/pin/123456789/';
const goodImage = 'https://i.pinimg.com/cosmetics-original.png';
const invalidImages = ['https://i.pinimg.com/FOOTBALL-cover.jpg', 'https://s.pinimg.com/webapp/logo.png'];
const base: Trend = {
  id: 'saved-pin',
  title: 'Collage de gloss',
  summary: 'Composición de cosméticos',
  rationale: 'Una referencia editorial para labios',
  category: 'Maquillaje',
  format: 'Carrusel',
  platform: 'Pinterest',
  evidence: 'editorial',
  sourceUrl: source,
  sourceName: 'Pinterest',
  observedAt: '2026-09-09T12:00:00.000Z',
  region: 'Prueba',
  productIds: [],
  suggestedSlides: 3,
  references: [],
  saved: true,
  palette: [],
  keywords: ['gloss'],
};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'elabela-preserved-reference-'));
  roots.push(root);
  await mkdir(join(root, 'data/references'), { recursive: true });
  await writeFile(join(root, 'data/trends.json'), '[]');
  const store = new Store(root);
  await store.init();
  const bytes = await sharp({ create: { width: 400, height: 500, channels: 3, background: '#ddbbcc' } })
    .png()
    .toBuffer();
  const references = [];
  for (const [index, url] of [goodImage, ...invalidImages].entries()) {
    const id = `reference-${index}`;
    const assetId = `cached-${index}`;
    const filename = `${id}.png`;
    await writeFile(join(root, 'data/references', filename), bytes);
    await store.addAsset(
      {
        id: assetId,
        filename,
        mime: 'image/png',
        width: 400,
        height: 500,
        bytes: bytes.length,
        role: 'reference',
        createdAt: base.observedAt,
      },
      { original: `data/references/${filename}`, preview: `data/references/${filename}` },
    );
    references.push({ id, url, sourceUrl: source, title: 'Referencia original', assetId });
  }
  const trend = { ...base, references };
  const context: Trend = {
    ...base,
    id: 'saved-report',
    title: 'Informe cosmético conservado',
    sourceUrl: 'https://business.pinterest.com/pinterest-predicts/',
    visualStatus: 'context',
    visualReason: 'Informe anual, sin imagen',
    references: [],
  };
  await store.importTrends([trend, context]);
  return { store, trend, context, bytes };
}

async function expectPreserved(store: Store, result: Trend | undefined, context: Trend, bytes: Buffer) {
  expect(result?.saved).toBe(true);
  expect(result?.references.map((reference) => reference.url)).toEqual([goodImage]);
  expect(result?.references[0]?.assetId).toBe('cached-0');
  expect(await readFile(await store.getAssetPath('cached-0'))).toEqual(bytes);
  // Filtering a reference must not erase its archived bytes or unrelated contextual ideas.
  expect(await readFile(await store.getAssetPath('cached-1'))).toEqual(bytes);
  expect((await store.bootstrap()).trends.find((trend) => trend.id === context.id)).toEqual(context);
}

it('filters previous API favorites by image URL while retaining a valid cached original and other context', async () => {
  const { store, trend, context, bytes } = await fixture();
  const found = await searchIdeas('gloss', undefined, 'test-key', 'test-model', store, async () => ({
    output: [
      { type: 'web_search_call', action: { sources: [{ url: source }] } },
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify({ trends: [{ ...trend, publishedAt: null, references: [] }] }),
          },
        ],
      },
    ],
  }));
  await expectPreserved(store, found[0], context, bytes);
});

it('filters previous Codex favorites by image URL when a later source fetch has no new images', async () => {
  const { store, trend, context, bytes } = await fixture();
  const downloader = vi.fn(async () => bytes);
  const hooks = createCodexResearch({
    available: async () => true,
    runner: async () => ({
      text: JSON.stringify({ trends: [{ ...trend, publishedAt: null }] }),
      openedUrls: [source],
      searches: 1,
    }),
    verifySource: async () => ({
      url: source,
      title: 'Gloss collage de cosméticos',
      imageUrls: [],
      checkedAt: base.observedAt,
    }),
    downloader,
  });
  await hooks.searchTrends?.({ query: 'gloss', store });
  await vi.waitFor(async () => expect((await store.bootstrap()).jobs[0]?.status).toBe('completed'));
  await expectPreserved(
    store,
    (await store.bootstrap()).trends.find((item) => item.id === trend.id),
    context,
    bytes,
  );
  expect(downloader).not.toHaveBeenCalled();
});

it.each(['previous', 'incoming'] as const)(
  'filters %s cache candidates before reusing their saved assets',
  async (origin) => {
    const { store, trend, context, bytes } = await fixture();
    const downloader = vi.fn(async () => bytes);
    const input = { ...trend, references: origin === 'previous' ? [] : trend.references };
    const found = await cacheTrendReferences(store, [input], { downloader });
    await expectPreserved(
      store,
      found.find((item) => item.id === trend.id),
      context,
      bytes,
    );
    expect(downloader).not.toHaveBeenCalled();
  },
);

it('rejects newly imported generic image URLs before the downloader is called', async () => {
  const { store, context, bytes } = await fixture();
  const downloader = vi.fn(async () => bytes);
  const trend = {
    ...base,
    id: 'new-import',
    visualStatus: 'example' as const,
    references: invalidImages.map((url, index) => ({
      id: `new-${index}`,
      url,
      sourceUrl: source,
      title: 'Referencia original',
    })),
  };
  const found = await cacheTrendReferences(store, [trend], { downloader });
  expect(found.find((item) => item.id === trend.id)?.references).toEqual([]);
  expect(found.find((item) => item.id === trend.id)?.visualStatus).toBe('unavailable');
  expect(downloader).not.toHaveBeenCalled();
  expect((await store.bootstrap()).trends.find((item) => item.id === context.id)).toEqual(context);
});
