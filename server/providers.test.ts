import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Campaign, Product, Trend } from '../shared/types.js';
import {
  type CopyGenerationRequest,
  cacheTrendReferences,
  createCreativeIntegrations,
  type SearchGenerationRequest,
  selectCatalogCandidates,
} from './providers.js';
import { Store } from './store.js';

const roots: string[] = [];
const trend: Trend = {
  id: 'gummy',
  title: 'Brillo que se siente',
  summary: 'Texturas de gloss',
  rationale: 'Inspiración para maquillaje',
  category: 'Belleza',
  format: 'Carrusel',
  platform: 'Pinterest',
  evidence: 'annual',
  sourceUrl: 'https://business.pinterest.com/pinterest-predicts/',
  sourceName: 'Pinterest',
  observedAt: new Date().toISOString(),
  region: 'Global',
  productIds: ['13451'],
  suggestedSlides: 3,
  references: [
    {
      id: 'gummy-reference',
      url: 'https://images.ctfassets.net/gummy.webp',
      title: 'Referencia editorial',
    },
  ],
  saved: false,
  palette: ['#dec2dd'],
  keywords: ['gloss'],
};
const product: Product = {
  id: '13451',
  name: 'NYX This Is Milky Gloss',
  brand: 'NYX',
  category: 'Gloss',
  currency: 'USD',
  priceText: '4',
  thumbnailUrl: 'https://www.elabela.com.py/test.jpg',
  productUrl: 'https://www.elabela.com.py/index.php?id_product=13451&controller=product',
  listedInStock: true,
  observedAt: new Date().toISOString(),
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(language: 'es' | 'pt' = 'es') {
  const root = await mkdtemp(join(tmpdir(), 'elabela-providers-'));
  roots.push(root);
  await mkdir(join(root, 'datos/catalogo/2026-09-09'), { recursive: true });
  await mkdir(join(root, 'data'), { recursive: true });
  await mkdir(join(root, 'data/references'), { recursive: true });
  await mkdir(join(root, 'logo'), { recursive: true });
  await writeFile(join(root, 'data/trends.json'), JSON.stringify([trend]));
  await writeFile(
    join(root, 'datos/catalogo/2026-09-09/productos.json'),
    JSON.stringify({ items: [product] }),
  );
  const image = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#c9a4df' } })
    .png()
    .toBuffer();
  await writeFile(join(root, 'logo/logosinfondo.png'), image);
  await writeFile(join(root, 'data/references/gummy-reference.webp'), image);
  const store = new Store(root);
  await store.init();
  const campaign = await store.createCampaign({
    title: 'Campaña de prueba',
    trendId: trend.id,
    productIds: [product.id],
    language,
    slideCount: 3,
    variantCount: 3,
  });
  return { root, store, campaign, image };
}
async function approveCopy(store: Store, campaign: Campaign) {
  const hooks = createCreativeIntegrations();
  const result = await hooks.copy?.({ campaign, payload: {}, store });
  if (!result) throw new Error('No copy');
  return store.saveCampaign({
    ...result.campaign,
    selectedCopyId: result.campaign.copyOptions[0]?.id || '',
    copyApproved: true,
  });
}

describe('creative integrations', () => {
  it.each(['es', 'pt'] as const)(
    'offers three complete editable copy options in %s before any image request',
    async (language) => {
      const { store, campaign } = await fixture(language);
      const hooks = createCreativeIntegrations();
      const result = await hooks.copy?.({ campaign, payload: {}, store });
      expect(result?.campaign.copyOptions).toHaveLength(3);
      expect(
        result?.campaign.copyOptions.every(
          (option) => option.slides.length === 3 && option.caption.includes('ElaBela'),
        ),
      ).toBe(true);
      expect(result?.campaign.copyApproved).toBe(false);
      expect(result?.campaign.copyOptions[0]?.caption).toContain(language === 'es' ? 'Consultá' : 'Consulte');
    },
  );
  it('uses the configured copy provider with a strict 3-by-N schema and persists its result', async () => {
    const { store, campaign } = await fixture('pt');
    const copyGenerator = vi.fn(async (request: CopyGenerationRequest) => {
      const payload = request.payload as {
        input: string;
        text: { format: { schema: { properties?: Record<string, unknown> } } };
      };
      const providerInput = JSON.parse(payload.input) as { products: Record<string, unknown>[] };
      expect(providerInput.products[0]).not.toHaveProperty('priceText');
      expect(JSON.stringify(payload.text.format.schema)).toContain('maxItems');
      return responsesOutput({
        options: Array.from({ length: 3 }, (_, option) => ({
          title: `Opção ${option + 1}`,
          slides: Array.from({ length: campaign.slideCount }, (_, slide) => ({
            headline: `Título ${slide + 1}`,
            body: `Texto ${slide + 1}`,
          })),
          caption: `Legenda ElaBela ${option + 1}`,
        })),
      });
    });
    const hooks = createCreativeIntegrations({ apiKey: 'test-key', copyGenerator });
    const result = await hooks.copy?.({ campaign, payload: {}, store });
    expect(copyGenerator).toHaveBeenCalledOnce();
    expect(result?.campaign.copyOptions).toHaveLength(3);
    expect(result?.campaign.copyOptions.every((option) => option.slides.length === 3)).toBe(true);
    expect(store.getCampaign(campaign.id).copyOptions).toEqual(result?.campaign.copyOptions);
  });

  it('surfaces a configured copy provider failure without switching to local copy', async () => {
    const { store, campaign } = await fixture();
    const hooks = createCreativeIntegrations({
      apiKey: 'test-key',
      copyGenerator: async () => {
        throw new Error('provider unavailable');
      },
    });
    await expect(hooks.copy?.({ campaign, payload: {}, store })).rejects.toThrow(/proveedor/i);
    expect(store.getCampaign(campaign.id).copyOptions).toEqual([]);
  });

  it('rejects copy that does not contain exactly three complete options', async () => {
    const { store, campaign } = await fixture();
    const hooks = createCreativeIntegrations({
      apiKey: 'test-key',
      copyGenerator: async () => responsesOutput({ options: [] }),
    });
    await expect(hooks.copy?.({ campaign, payload: {}, store })).rejects.toThrow(/tres propuestas/i);
    expect(store.getCampaign(campaign.id).copyOptions).toEqual([]);
  });
  it('blocks generation until the text is approved, without invoking the provider', async () => {
    const { store, campaign } = await fixture();
    const imageGenerator = vi.fn();
    const hooks = createCreativeIntegrations({ apiKey: 'test-key', imageGenerator });
    await expect(hooks.generate?.({ campaign, payload: {}, store })).rejects.toThrow(/texto/i);
    expect(imageGenerator).not.toHaveBeenCalled();
  });
  it('creates nine distinct masters, preserves 4:5 and rejects a concurrent generation', async () => {
    const { root, store, campaign, image } = await fixture();
    const approved = await approveCopy(store, campaign);
    const sourceRoot = join(
      root,
      'contenido',
      new Date().getUTCFullYear().toString(),
      String(new Date().getUTCMonth() + 1).padStart(2, '0'),
      campaign.id,
      'fuentes-generacion',
    );
    const imageGenerator = vi.fn(async () => {
      const jobDirectories = await readdir(sourceRoot);
      expect(jobDirectories).toHaveLength(1);
      await expect(
        readFile(join(sourceRoot, jobDirectories[0] as string, 'manifest.json'), 'utf8'),
      ).resolves.toContain(campaign.id);
      return image;
    });
    const hooks = createCreativeIntegrations({
      apiKey: 'test-key',
      imageGenerator,
      productReference: async () => image,
    });
    const result = await hooks.generate?.({ campaign: approved, payload: {}, store });
    expect(result?.job?.total).toBe(9);
    await expect(hooks.generate?.({ campaign: approved, payload: {}, store })).rejects.toThrow(/activa/i);
    await vi.waitFor(async () => expect((await store.bootstrap()).jobs[0]?.status).toBe('completed'), {
      timeout: 10000,
    });
    expect(imageGenerator).toHaveBeenCalledTimes(9);
    const state = await store.bootstrap();
    expect(new Set(state.campaigns[0]?.variants.flatMap((variant) => variant.assetIds)).size).toBe(9);
    expect(state.assets.every((asset) => asset.width * 5 === asset.height * 4)).toBe(true);
    expect(state.campaigns[0]?.finalAssetIds).toEqual([]);
    const jobDirectories = await readdir(sourceRoot);
    expect(jobDirectories).toHaveLength(1);
    const jobDirectory = join(sourceRoot, jobDirectories[0] as string);
    const manifest = JSON.parse(await readFile(join(jobDirectory, 'manifest.json'), 'utf8')) as {
      products: { path: string; mime: string; sha256: string }[];
      logo: { path: string; mime: string; sha256: string };
      references: { path: string; mime: string; sha256: string }[];
    };
    expect(manifest.products).toHaveLength(1);
    expect(manifest.references).toHaveLength(1);
    expect([manifest.products[0]?.mime, manifest.logo.mime, manifest.references[0]?.mime]).toEqual([
      'image/png',
      'image/png',
      'image/png',
    ]);
    expect(manifest.products[0]?.path).toMatch(/\.png$/);
    expect(manifest.references[0]?.path).toMatch(/\.png$/);
    expect(manifest.products[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(readFile(join(jobDirectory, manifest.products[0]?.path as string))).resolves.toEqual(image);
    await expect(readFile(join(jobDirectory, manifest.logo.path))).resolves.toEqual(image);
    await expect(readFile(join(jobDirectory, manifest.references[0]?.path as string))).resolves.toEqual(
      image,
    );
    expect(
      (await readdir(jobDirectory, { recursive: true })).filter((name) => name.endsWith('.json')),
    ).toEqual(['manifest.json']);
  });
  it('keeps completed pieces after an uncertain provider failure and never retries automatically', async () => {
    const { store, campaign, image } = await fixture();
    const approved = await approveCopy(store, campaign);
    let calls = 0;
    const hooks = createCreativeIntegrations({
      apiKey: 'test-key',
      productReference: async () => image,
      imageGenerator: async () => {
        calls++;
        if (calls === 4) throw new Error('network timeout');
        return image;
      },
    });
    await hooks.generate?.({ campaign: approved, payload: {}, store });
    await vi.waitFor(async () => expect((await store.bootstrap()).jobs[0]?.status).toBe('failed'), {
      timeout: 10000,
    });
    const state = await store.bootstrap();
    expect(calls).toBe(4);
    expect(state.assets.filter((asset) => asset.role === 'generated')).toHaveLength(3);
    expect(state.jobs[0]?.message).not.toContain('test-key');
    expect(state.campaigns[0]?.variants[0]?.assetIds.every(Boolean)).toBe(true);
  });

  it.each(['square', 'invalid'])(
    'preserves original provider bytes when validation fails: %s',
    async (kind) => {
      const { store, campaign, image, root } = await fixture();
      const approved = await approveCopy(store, campaign);
      const raw =
        kind === 'square'
          ? await sharp(image).resize(1000, 1000).png().toBuffer()
          : Buffer.from('invalid-image-output');
      const imageGenerator = vi.fn(async () => raw);
      const hooks = createCreativeIntegrations({
        apiKey: 'test-key',
        productReference: async () => image,
        imageGenerator,
      });
      const result = await hooks.generate?.({ campaign: approved, payload: {}, store });
      await vi.waitFor(async () => expect((await store.bootstrap()).jobs[0]?.status).toBe('failed'));
      const date = new Date(result?.job?.createdAt || '');
      const directory = join(
        root,
        'contenido',
        String(date.getUTCFullYear()),
        String(date.getUTCMonth() + 1).padStart(2, '0'),
        campaign.id,
        'fuentes-generacion',
        result?.job?.id || '',
        'salidas-proveedor',
      );
      const outputs = await readdir(directory);
      expect(outputs).toHaveLength(1);
      expect(await readFile(join(directory, outputs[0] || ''))).toEqual(raw);
      expect(imageGenerator).toHaveBeenCalledTimes(1);
      expect((await store.bootstrap()).assets.filter((asset) => asset.role === 'generated')).toHaveLength(0);
    },
  );
});

describe('catalogue, search evidence and reference cache', () => {
  it('selects a relevant product beyond the first catalogue page', async () => {
    const items = Array.from(
      { length: 50 },
      (_, index): Product => ({
        ...product,
        id: `p-${index}`,
        name: index === 49 ? 'Labial ciruela especial' : `Producto neutro ${index}`,
        brand: `Marca ${index % 5}`,
      }),
    );
    const { store } = await catalogueFixture(items);
    const selected = selectCatalogCandidates(store, 'ciruela', undefined, 20);
    expect(selected.map((item) => item.id)).toContain('p-49');
  });

  it('keeps only reference URLs evidenced by web_search_call results and preserves favorites on repeat', async () => {
    const { store } = await fixture();
    const sourceUrl = 'https://business.pinterest.com/pinterest-predicts/';
    const evidencedUrl = 'https://i.pinimg.com/reference.webp';
    const inventedUrl = 'https://s.pinimg.com/invented.webp';
    let searchCount = 0;
    const searchGenerator = vi.fn(async (_request: SearchGenerationRequest) =>
      responsesOutput(
        {
          trends: [
            {
              title: 'Ciruela editorial',
              summary: 'Texturas y contraste',
              rationale: 'Idea adaptable, sin afirmar métricas.',
              category: 'Gloss',
              format: 'Carrusel',
              platform: 'Pinterest',
              evidence: 'annual',
              sourceUrl,
              sourceName: 'Pinterest Business',
              publishedAt: null,
              region: 'Global',
              suggestedSlides: 3,
              productIds: [product.id],
              references:
                searchCount++ === 0
                  ? [
                      { url: evidencedUrl, title: 'Resultado real' },
                      { url: inventedUrl, title: 'Inventada por modelo' },
                    ]
                  : [],
              palette: ['#884466'],
              keywords: ['ciruela'],
            },
          ],
        },
        [
          {
            type: 'web_search_call',
            results: [
              {
                type: 'image_result',
                image_url: evidencedUrl,
                source_website_url: sourceUrl,
                title: 'Imagen encontrada',
              },
            ],
          },
        ],
      ),
    );
    const downloader = vi.fn(async () =>
      sharp({ create: { width: 600, height: 900, channels: 3, background: '#884466' } })
        .webp()
        .toBuffer(),
    );
    const hooks = createCreativeIntegrations({
      apiKey: 'test-key',
      searchGenerator,
      referenceDownloader: downloader,
    });
    await hooks.searchTrends?.({ query: 'ciruela', store });
    await vi.waitFor(async () => {
      const jobs = (await store.bootstrap()).jobs;
      expect(jobs.find((job) => job.type === 'search')?.status).toBe('completed');
    });
    let discovered = (await store.bootstrap()).trends.find((item) => item.title === 'Ciruela editorial');
    expect(discovered?.references).toHaveLength(1);
    expect(discovered?.references[0]?.url).toBe(evidencedUrl);
    expect(discovered?.references[0]?.assetId).toBeTruthy();
    const investigationDirectory = join(store.root, 'investigacion', new Date().toISOString().slice(0, 10));
    const evidenceFile = (await readdir(investigationDirectory))[0] as string;
    const evidence = JSON.parse(await readFile(join(investigationDirectory, evidenceFile), 'utf8')) as {
      provenance: { imageUrls: string[]; results: unknown[] };
    };
    expect(evidence.provenance.imageUrls).toEqual([evidencedUrl]);
    expect(JSON.stringify(evidence.provenance.results)).not.toContain(inventedUrl);
    if (!discovered) throw new Error('trend missing');
    await store.setTrendSaved(discovered.id, true);

    await hooks.searchTrends?.({ query: 'ciruela', store });
    await vi.waitFor(async () => {
      const searchJobs = (await store.bootstrap()).jobs.filter((job) => job.type === 'search');
      expect(searchJobs).toHaveLength(2);
      expect(searchJobs.every((job) => job.status === 'completed')).toBe(true);
    });
    discovered = (await store.bootstrap()).trends.find((item) => item.id === discovered?.id);
    expect(discovered?.saved).toBe(true);
    expect(discovered?.references).toHaveLength(1);
    expect(discovered?.references[0]?.assetId).toBeTruthy();
    expect(downloader).toHaveBeenCalledTimes(1);
  });

  it('caches duplicate references once and leaves failed downloads visibly pending', async () => {
    const { store } = await fixture();
    const sharedUrl = 'https://images.ctfassets.net/shared.webp';
    const failedUrl = 'https://i.pinimg.com/missing.webp';
    const downloader = vi.fn(async (url: string) => {
      if (url === failedUrl) throw new Error('network');
      return sharp({ create: { width: 400, height: 700, channels: 3, background: '#333333' } })
        .jpeg()
        .toBuffer();
    });
    const copies: Trend[] = [0, 1].map((index) => ({
      ...trend,
      id: `cache-${index}`,
      title: `Cache ${index}`,
      references: [
        { id: `shared-${index}`, url: sharedUrl, title: 'Compartida' },
        { id: `failed-${index}`, url: failedUrl, title: 'Pendiente' },
      ],
    }));
    const cached = await cacheTrendReferences(store, copies, { downloader });
    expect(cached[0]?.references[0]?.assetId).toBe(cached[1]?.references[0]?.assetId);
    expect(cached[0]?.references[1]?.title).toContain('pendiente');
    expect(downloader).toHaveBeenCalledTimes(2);
  });
});

function responsesOutput(value: unknown, extraOutput: unknown[] = []) {
  return {
    output: [
      ...extraOutput,
      { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] },
    ],
  };
}

async function catalogueFixture(items: Product[]) {
  const root = await mkdtemp(join(tmpdir(), 'elabela-catalogue-'));
  roots.push(root);
  await mkdir(join(root, 'datos/catalogo/2026-09-09'), { recursive: true });
  await writeFile(join(root, 'datos/catalogo/2026-09-09/productos.json'), JSON.stringify({ items }));
  const store = new Store(root);
  await store.init();
  return { root, store };
}
