import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Campaign, Product, Trend } from '../shared/types.js';
import { buildApp } from './app.js';
import { createCodexGeneration, importCodexAsset } from './codex-generation.js';
import { ServiceError } from './contracts.js';
import { storeCampaignImage } from './media.js';
import { Store } from './store.js';

const roots: string[] = [];

it('identifies the failed product without persisting a misleading request', async () => {
  const { store, campaign } = await fixture();
  const before = store.getCampaign(campaign.id);
  const generate = createCodexGeneration({
    productReference: async () => {
      throw new ServiceError('No está habilitada la descarga desde images.example.test.', 400);
    },
  }).generate;
  await expect(
    required(generate)({ campaign: before, payload: { revision: before.revision }, store }),
  ).rejects.toThrow(/Gloss de PRUEBA.*images\.example\.test/s);
  expect(store.getCampaign(campaign.id)).toEqual(before);
});
function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error('Falta un dato esperado de la prueba');
  return value;
}
const product: Product = {
  id: 'p1',
  name: 'Gloss de PRUEBA',
  brand: 'PRUEBA',
  category: 'Labios',
  priceText: '0',
  currency: 'USD',
  productUrl: 'https://www.elabela.com.py/producto',
  thumbnailUrl: 'https://www.elabela.com.py/imagen.png',
  listedInStock: true,
  observedAt: '2026-09-09T12:00:00.000Z',
};
const trend: Trend = {
  id: 't1',
  title: 'Composición de gloss de PRUEBA',
  summary: 'Referencia de prueba',
  rationale: 'Gloss del catálogo',
  category: 'Belleza',
  format: 'Carrusel',
  platform: 'Pinterest',
  evidence: 'editorial',
  sourceUrl: 'https://www.pinterest.com/pin/123456/',
  sourceName: 'Pinterest',
  observedAt: '2026-09-09T12:00:00.000Z',
  region: 'Paraguay',
  productIds: [product.id],
  suggestedSlides: 1,
  saved: false,
  palette: ['#fff'],
  keywords: ['gloss'],
  references: [
    { id: 'ref1', url: 'https://i.pinimg.com/primera.png', title: 'Primera' },
    {
      id: 'ref2',
      url: 'https://i.pinimg.com/segunda.png',
      title: 'Segunda',
      sourceUrl: 'https://www.pinterest.com/pin/654321/',
    },
  ],
};
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'elabela-codex-generation-'));
  roots.push(root);
  const image = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#deadda' } })
    .png()
    .toBuffer();
  const reference = await sharp({ create: { width: 600, height: 900, channels: 3, background: '#334455' } })
    .png()
    .toBuffer();
  for (const directory of ['datos/catalogo/2026-09-09', 'data/references', 'logo'])
    await mkdir(join(root, directory), { recursive: true });
  await writeFile(
    join(root, 'datos/catalogo/2026-09-09/productos.json'),
    JSON.stringify({ items: [product] }),
  );
  await writeFile(join(root, 'data/trends.json'), JSON.stringify([trend]));
  await writeFile(join(root, 'data/references/ref1.webp'), image);
  await writeFile(join(root, 'data/references/ref2.webp'), reference);
  await writeFile(join(root, 'logo/logosinfondo.png'), image);
  const store = new Store(root);
  await store.init();
  let campaign = await store.createCampaign({
    title: 'Campaña de PRUEBA',
    trendId: 't1',
    referenceId: 'ref2',
    productIds: ['p1'],
    language: 'es',
    slideCount: 1,
    variantCount: 3,
  });
  const integrations = createCodexGeneration({ productReference: async () => image });
  const result = await integrations.copy?.({ campaign, payload: {}, store });
  if (!result) throw new Error('Falta integración de textos');
  campaign = await store.saveCampaignEditable({
    ...result.campaign,
    selectedCopyId: result.campaign.copyOptions[0]?.id ?? null,
    copyApproved: true,
  });
  const prepare = (current = store.getCampaign(campaign.id), payload = {}) =>
    required(integrations.generate)({
      campaign: current,
      payload: { revision: current.revision, ...payload },
      store,
    });
  const upload = (current: Campaign, buffer = image, index = 0) => {
    const request = required(current.codexRequest);
    const target = required(request.targets[index]);
    return importCodexAsset({
      store,
      campaignId: current.id,
      requestId: request.id,
      variantId: target.variantId,
      slot: target.slot,
      buffer,
    });
  };
  return { root, store, campaign, image, reference, integrations, prepare, upload };
}

describe('pedidos locales de Codex Chat', () => {
  it.each(['es', 'pt'] as const)(
    'keeps all nine prompts anchored to the selected reference in %s',
    async (language) => {
      const { root, store, campaign, prepare } = await fixture();
      await store.upsertTrend({
        ...required((await store.bootstrap()).trends.find((item) => item.id === trend.id)),
        rationale: 'Usar el serum L’Oreal y una paleta beige ajena a la imagen elegida.',
      });
      const current = await store.saveCampaignEditable({
        ...campaign,
        language,
        slideCount: 3,
        copyOptions: campaign.copyOptions.map((copy) => ({
          ...copy,
          slides: Array.from({ length: 3 }, () => required(copy.slides[0])),
        })),
        variants: campaign.variants.map((variant) => ({ ...variant, assetIds: [null, null, null] })),
      });
      const result = await prepare(current);
      const request = required(result.campaign.codexRequest);
      const manifest = JSON.parse(await readFile(join(root, request.manifestPath), 'utf8'));
      expect(manifest.requests).toHaveLength(9);
      for (const item of manifest.requests) {
        expect(item.prompt).toContain('selected reference is the visual blueprint');
        expect(item.prompt).toContain('Preserve its recognizable composition');
        expect(item.prompt).toContain(
          'Derive the palette, textures and materials from the selected product photos',
        );
        expect(item.prompt).not.toContain('Preserve its recognizable composition, dominant palette');
        expect(item.prompt).toContain('Do not transfer ingredients, benefits or claims');
        expect(item.prompt).toContain('Compare the result side by side');
        expect(item.prompt).toContain('"referenceId":"ref2"');
        expect(item.prompt).not.toMatch(
          /porcelain surfaces|Editorial:|Expressive:|Bold:|L’Oreal|mood references/,
        );
      }
      expect(await readFile(join(root, request.briefPath), 'utf8')).toContain(
        'Recrear la referencia elegida con los productos seleccionados',
      );
    },
  );

  it('defaults to chat even with an API key and prepares immutable sources for the chosen second reference', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'not-a-real-key');
    vi.stubEnv('ELABELA_GENERATION_PROVIDER', '');
    const { root, store, campaign, prepare, image, reference } = await fixture();
    expect((await store.bootstrap()).status).toMatchObject({
      generationProvider: 'codex-chat',
      generationConfigured: true,
    });
    const result = await prepare();
    expect(result.job).toBeUndefined();
    expect((await store.bootstrap()).jobs).toEqual([]);
    expect(result.campaign.referenceId).toBe('ref2');
    const request = required(result.campaign.codexRequest);
    expect(request).toMatchObject({ status: 'ready', total: 3, completed: 0 });
    expect(request.instruction).toContain('chat');
    expect(request.instruction).not.toContain('not-a-real-key');
    const manifestBytes = await readFile(join(root, request.manifestPath));
    const manifest = JSON.parse(manifestBytes.toString());
    expect(manifest).toMatchObject({
      campaignId: campaign.id,
      referenceId: 'ref2',
      contentHash: request.contentHash,
      language: 'es',
    });
    expect(manifest.references).toHaveLength(1);
    expect(manifest.references[0].id).toBe('ref2');
    expect(await readFile(join(root, dirname(request.manifestPath), manifest.references[0].path))).toEqual(
      reference,
    );
    expect(await readFile(join(root, dirname(request.manifestPath), manifest.products[0].path))).toEqual(
      image,
    );
    expect(await readFile(join(root, request.briefPath), 'utf8')).toContain('PRUEBA');
    const repeated = await prepare();
    expect(repeated.campaign.codexRequest).toEqual(request);
    expect(await readFile(join(root, request.manifestPath))).toEqual(manifestBytes);
  });

  it('requires approved text, exact revision and a reference belonging to the selected trend', async () => {
    const { store, campaign, integrations, prepare } = await fixture();
    await expect(store.createCampaign({ ...campaign, referenceId: 'foreign' })).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(prepare({ ...campaign, revision: 0 })).rejects.toMatchObject({ statusCode: 409 });
    const unapproved = await store.saveCampaignEditable({ ...campaign, copyApproved: false });
    await expect(
      required(integrations.generate)({
        campaign: unapproved,
        payload: { revision: unapproved.revision },
        store,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it.each(['context', 'unavailable'] as const)(
    'rejects a reference from a %s idea even if a legacy URL remains',
    async (visualStatus) => {
      const { store, campaign } = await fixture();
      await store.upsertTrend({ ...trend, visualStatus });
      await expect(store.createCampaign({ ...campaign, referenceId: 'ref2' })).rejects.toMatchObject({
        statusCode: 400,
      });
    },
  );

  it('serializes duplicate preparations without duplicate requests', async () => {
    const { campaign, prepare } = await fixture();
    const outcomes = await Promise.allSettled([prepare(campaign), prepare(campaign)]);
    const fulfilled = outcomes.filter((result) => result.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThan(0);
    if (fulfilled.length === 2)
      expect(required(required(fulfilled[0]).value.campaign.codexRequest).id).toBe(
        required(required(fulfilled[1]).value.campaign.codexRequest).id,
      );
  });

  it.each(['removed', 'context'] as const)(
    'preserves existing campaign edits and captured requests when its radar reference becomes %s',
    async (change) => {
      const { store, prepare, upload } = await fixture();
      const prepared = (await prepare()).campaign;
      const imported = await upload(prepared);
      await store.upsertTrend({
        ...trend,
        references: change === 'removed' ? [] : trend.references,
        ...(change === 'context' ? { visualStatus: 'context' as const } : {}),
      });
      const edited = await store.saveCampaignEditable({
        ...imported.campaign,
        finalAssetIds: [imported.asset.id],
        copyOptions: imported.campaign.copyOptions.map((copy) => ({
          ...copy,
          caption: 'Descripción editada después de curar el radar',
        })),
      });
      expect(edited.referenceId).toBe('ref2');
      expect(edited.finalAssetIds).toEqual([imported.asset.id]);
      expect(edited.codexRequest).toEqual(imported.campaign.codexRequest);
      expect((await prepare(edited)).campaign.codexRequest).toEqual(edited.codexRequest);
      await expect(store.saveCampaignEditable({ ...edited, referenceId: 'foreign' })).rejects.toMatchObject({
        statusCode: 400,
      });
      await expect(store.createCampaign({ ...edited, referenceId: 'ref2' })).rejects.toMatchObject({
        statusCode: 400,
      });
      const cancelled = await store.cancelCodexRequest(edited.id, required(edited.codexRequest).id);
      await expect(prepare(cancelled)).rejects.toMatchObject({ statusCode: 400 });
    },
  );

  it('leaves the campaign unchanged when a chosen source cannot be captured', async () => {
    const { root, store, campaign, prepare } = await fixture();
    await rm(join(root, 'data/references/ref2.webp'));
    await expect(prepare()).rejects.toMatchObject({ statusCode: 404 });
    expect(store.getCampaign(campaign.id)).toEqual(campaign);
    expect((await store.bootstrap()).jobs).toEqual([]);
  });

  it('serializes duplicate imports and rejects an old request after cancellation and replacement', async () => {
    const { store, prepare, upload } = await fixture();
    const prepared = (await prepare()).campaign;
    const before = (await store.bootstrap()).assets.length;
    const [first, duplicate] = await Promise.all([upload(prepared), upload(prepared)]);
    expect(duplicate.asset.id).toBe(first.asset.id);
    expect((await store.bootstrap()).assets).toHaveLength(before + 1);
    const cancelled = await store.cancelCodexRequest(prepared.id, required(prepared.codexRequest).id);
    const renewed = (await prepare(cancelled)).campaign;
    expect(renewed.codexRequest?.id).not.toBe(prepared.codexRequest?.id);
    await expect(upload(prepared)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('regenerates a filled target with an immutable prior asset and leaves final selection unchanged', async () => {
    const { store, prepare, upload, image } = await fixture();
    let current = (await prepare()).campaign;
    const first = await upload(current);
    current = (await upload(first.campaign, image, 1)).campaign;
    current = (await upload(current, image, 2)).campaign;
    current = await store.saveCampaignEditable({ ...current, finalAssetIds: [first.asset.id] });
    const oldManifest = required(current.codexRequest).manifestPath;
    const regenerated = (await prepare(current, { variantId: required(current.variants[0]).id, slot: 0 }))
      .campaign;
    expect(regenerated.codexRequest?.targets).toEqual([
      { variantId: required(current.variants[0]).id, slot: 0, originalAssetId: first.asset.id },
    ]);
    const replacement = await upload(regenerated);
    expect(replacement.asset.id).not.toBe(first.asset.id);
    expect(replacement.campaign.finalAssetIds).toEqual([first.asset.id]);
    expect(await readFile(await store.getAssetPath(first.asset.id))).toEqual(image);
    expect(required(replacement.campaign.codexRequest).manifestPath).not.toBe(oldManifest);
  });

  it('imports exact original bytes once and advances targets without changing the final composition', async () => {
    const { root, store, prepare, upload, image } = await fixture();
    const prepared = (await prepare()).campaign;
    const first = await upload(prepared);
    expect(first.campaign.codexRequest).toMatchObject({ status: 'partial', completed: 1 });
    expect(first.campaign.finalAssetIds).toEqual([]);
    expect(first.campaign.approvedRevision).toBeNull();
    expect(first.campaign.codexRequest?.targets[0]).toMatchObject({
      assetId: first.asset.id,
      sha256: createHash('sha256').update(image).digest('hex'),
    });
    expect(await readFile(await store.getAssetPath(first.asset.id))).toEqual(image);
    const repeated = await upload(prepared);
    expect(repeated.asset.id).toBe(first.asset.id);
    expect(repeated.campaign.revision).toBe(first.campaign.revision);
    const second = await upload(first.campaign, image, 1);
    const third = await upload(second.campaign, image, 2);
    expect(third.campaign.codexRequest).toMatchObject({ status: 'completed', completed: 3 });
    expect((await upload(third.campaign)).asset.id).toBe(first.asset.id);
    const reloaded = new Store(root);
    await reloaded.init();
    expect(reloaded.getCampaign(prepared.id)).toEqual(third.campaign);
  });

  it('retains invalid output and rejects non-4:5 images without registering an asset', async () => {
    const { root, store, prepare, upload } = await fixture();
    const prepared = (await prepare()).campaign;
    const invalid = await sharp({ create: { width: 600, height: 600, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    const before = (await store.bootstrap()).assets.length;
    await expect(upload(prepared, invalid)).rejects.toMatchObject({ statusCode: 400 });
    expect((await store.bootstrap()).assets).toHaveLength(before);
    expect(store.getCampaign(prepared.id).codexRequest?.completed).toBe(0);
    const target = required(required(prepared.codexRequest).targets[0]);
    const hash = createHash('sha256').update(invalid).digest('hex');
    const path = join(
      root,
      dirname(required(prepared.codexRequest).manifestPath),
      'salidas-chat',
      `${target.variantId}-${target.slot}-${hash}.bin`,
    );
    expect(await readFile(path)).toEqual(invalid);
  });

  it('rejects different bytes on a completed destination and a manually replaced pending destination', async () => {
    const { root, store, prepare, upload, image } = await fixture();
    const prepared = (await prepare()).campaign;
    await upload(prepared);
    const different = await sharp(image).tint('#112233').png().toBuffer();
    await expect(upload(prepared, different)).rejects.toMatchObject({ statusCode: 409 });
    const target = required(required(prepared.codexRequest).targets[1]);
    await store.addCampaignAsset(
      { campaignId: prepared.id, variantId: target.variantId, slot: target.slot },
      () => storeCampaignImage({ root, campaignId: prepared.id, buffer: image }),
    );
    await expect(upload(prepared, image, 1)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('freezes pending creative inputs, keeps request server-owned, allows caption/final edits and cancels without deleting files', async () => {
    const { root, store, prepare, upload } = await fixture();
    let current = (await prepare()).campaign;
    const original = required(current.codexRequest);
    await expect(store.saveCampaignEditable({ ...current, referenceId: 'ref1' })).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(
      prepare(current, { variantId: required(current.variants[1]).id, slot: 0 }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
    current = await store.saveCampaignEditable({
      ...current,
      codexRequest: { ...original, status: 'completed' },
      copyOptions: current.copyOptions.map((copy) => ({ ...copy, caption: 'Descripción editada' })),
    });
    expect(current.codexRequest).toEqual(original);
    current = await store.cancelCodexRequest(current.id, original.id);
    expect(current.codexRequest?.status).toBe('cancelled');
    await expect(upload(current)).rejects.toMatchObject({ statusCode: 409 });
    expect(await readFile(join(root, original.manifestPath), 'utf8')).toContain(original.id);
    current = await store.saveCampaignEditable({ ...current, referenceId: 'ref1' });
    const next = (await prepare(current)).campaign;
    expect(next.codexRequest?.id).not.toBe(original.id);
    await expect(store.cancelCodexRequest(next.id, original.id)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('does not block shutdown while waiting for chat and rejects new work after draining', async () => {
    const { store, prepare, upload } = await fixture();
    const campaign = (await prepare()).campaign;
    expect(await store.beginShutdown()).toEqual({ draining: true, activeJobs: 0 });
    await expect(store.waitForIdle()).resolves.toBeUndefined();
    await expect(upload(campaign)).rejects.toMatchObject({ statusCode: 503 });
    await expect(prepare(campaign)).rejects.toMatchObject({ statusCode: 503 });
  });

  it('imports approved image texts while a caption draft remains unapproved for publication', async () => {
    const { store, prepare, upload } = await fixture();
    const prepared = (await prepare()).campaign;
    const request = required(prepared.codexRequest);
    const draft = await store.saveCampaignEditable({
      ...prepared,
      copyApproved: false,
      copyOptions: prepared.copyOptions.map((copy) => ({
        ...copy,
        caption: 'Descripción pendiente de aprobar',
      })),
    });
    expect(draft.copyApproved).toBe(false);
    expect(draft.codexRequest).toEqual(request);
    const imported = await upload(draft);
    expect(imported.campaign.copyApproved).toBe(false);
    const cancelled = await store.cancelCodexRequest(prepared.id, request.id);
    const selected = await store.saveCampaignEditable({ ...cancelled, finalAssetIds: [imported.asset.id] });
    await expect(store.approveCampaign(selected.id, selected.revision)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('blocks publication approval until a pending request is finished or cancelled', async () => {
    const { store, prepare, upload } = await fixture();
    const prepared = (await prepare()).campaign;
    const imported = await upload(prepared);
    const selected = await store.saveCampaignEditable({
      ...imported.campaign,
      finalAssetIds: [imported.asset.id],
    });
    await expect(store.approveCampaign(selected.id, selected.revision)).rejects.toMatchObject({
      statusCode: 409,
    });
    const cancelled = await store.cancelCodexRequest(selected.id, required(selected.codexRequest).id);
    await expect(store.approveCampaign(cancelled.id, cancelled.revision)).resolves.toMatchObject({
      approvedRevision: cancelled.revision + 1,
    });
  });

  it('exposes authenticated revision/cancel/import endpoints and preserves server request on PUT', async () => {
    const { root, campaign, integrations, image } = await fixture();
    const app = await buildApp({ root, token: 'test-token', integrations });
    const headers = { host: '127.0.0.1:4317', authorization: 'Bearer test-token' };
    try {
      const missingRevision = await app.inject({
        method: 'POST',
        url: `/api/campaigns/${campaign.id}/generate`,
        headers,
        payload: {},
      });
      expect(missingRevision.statusCode).toBe(400);
      const response = await app.inject({
        method: 'POST',
        url: `/api/campaigns/${campaign.id}/generate`,
        headers,
        payload: { revision: campaign.revision },
      });
      expect(response.statusCode).toBe(200);
      const prepared = response.json().campaign as Campaign;
      const request = required(prepared.codexRequest);
      const submitted = await app.inject({
        method: 'PUT',
        url: `/api/campaigns/${campaign.id}`,
        headers,
        payload: { ...prepared, codexRequest: { ...request, status: 'completed' } },
      });
      expect(submitted.statusCode).toBe(200);
      expect(submitted.json().codexRequest).toEqual(request);
      const form = new FormData();
      form.set('requestId', request.id);
      form.set('variantId', required(request.targets[0]).variantId);
      form.set('slot', '0');
      form.set('file', new Blob([new Uint8Array(image)], { type: 'image/png' }), 'PRUEBA.png');
      const multipart = new Request('http://localhost', { method: 'POST', body: form });
      const payload = Buffer.from(await multipart.arrayBuffer());
      const contentType = required(multipart.headers.get('content-type'));
      const url = `/api/campaigns/${campaign.id}/codex-assets`;
      expect(
        (
          await app.inject({
            method: 'POST',
            url,
            headers: { host: headers.host, 'content-type': contentType },
            payload,
          })
        ).statusCode,
      ).toBe(401);
      const imported = await app.inject({
        method: 'POST',
        url,
        headers: { ...headers, 'content-type': contentType },
        payload,
      });
      expect(imported.statusCode).toBe(201);
      expect(imported.json().campaign.codexRequest.completed).toBe(1);
      const cancelled = await app.inject({
        method: 'DELETE',
        url: `/api/campaigns/${campaign.id}/codex-request`,
        headers,
        payload: { requestId: request.id },
      });
      expect(cancelled.statusCode).toBe(200);
      expect(cancelled.json().campaign.codexRequest.status).toBe('cancelled');
    } finally {
      await app.close();
    }
  });
});
