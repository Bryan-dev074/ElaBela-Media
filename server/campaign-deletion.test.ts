import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, expect, it } from 'vitest';
import type { Campaign, Job, Publication } from '../shared/types.js';
import { buildApp } from './app.js';
import { storeCampaignImage } from './media.js';
import { Store } from './store.js';

const roots: string[] = [];
const input = {
  title: 'Para eliminar',
  trendId: 't',
  productIds: [],
  language: 'es',
  slideCount: 1,
  variantCount: 3,
} as const;
const headers = { authorization: 'Bearer delete-test-token', host: '127.0.0.1:4317' };

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'elabela-deletion-'));
  roots.push(root);
  const store = new Store(root);
  await store.init();
  const campaign = await store.createCampaign({ ...input, productIds: [] });
  return { root, store, campaign };
}

function job(campaign: Campaign, type: Job['type'] = 'generate', status: Job['status'] = 'running'): Job {
  return {
    id: 'job',
    campaignId: campaign.id,
    type,
    status,
    total: 1,
    completed: 0,
    message: 'Prueba',
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
  };
}

it('authenticates deletion, preserves original bytes and other campaigns, and persists removal across restart', async () => {
  const { root, store, campaign } = await fixture();
  const other = await store.createCampaign({ ...input, productIds: [], title: 'Conservar' });
  const image = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#eee' } })
    .png()
    .toBuffer();
  const stored = await storeCampaignImage({ root, campaignId: campaign.id, buffer: image, role: 'imported' });
  await store.addAsset(stored.asset, stored.paths);
  const app = await buildApp({ root, token: 'delete-test-token' });
  const url = `/api/campaigns/${campaign.id}`;
  try {
    expect(
      (await app.inject({ method: 'DELETE', url, headers: { host: headers.host }, payload: { revision: 0 } }))
        .statusCode,
    ).toBe(401);
    expect((await app.inject({ method: 'DELETE', url, headers, payload: {} })).statusCode).toBe(400);
    const response = await app.inject({ method: 'DELETE', url, headers, payload: { revision: 0 } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: campaign.id, deleted: true });
    const original = await app.inject({ url: `/api/assets/${stored.asset.id}`, headers });
    expect(original.statusCode).toBe(200);
    expect(original.rawPayload).toEqual(image);
    expect((await app.inject({ method: 'PUT', url, headers, payload: campaign })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url, headers, payload: { revision: 0 } })).statusCode).toBe(
      200,
    );
  } finally {
    await app.close();
  }
  const restarted = new Store(root);
  await restarted.init();
  const state = await restarted.bootstrap();
  expect(state.campaigns).toEqual([other]);
  expect(state.assets).toContainEqual(stored.asset);
  expect(await readFile(join(root, stored.paths.original))).toEqual(image);
  const persisted = JSON.parse(await readFile(join(root, '.local/state.json'), 'utf8'));
  expect(persisted.deletedCampaigns).toHaveLength(1);
  expect(persisted.deletedCampaigns[0].campaign).toEqual(campaign);
  expect(persisted.deletedCampaigns[0].deletedAt).toEqual(expect.any(String));
  expect(state).not.toHaveProperty('deletedCampaigns');
});

it('rejects stale confirmation after a concurrent edit and does not resurrect a deleted campaign', async () => {
  const { store, campaign } = await fixture();
  const saved = await store.saveCampaignEditable({ ...campaign, title: 'Nuevo nombre' });
  await expect(store.deleteCampaign(campaign.id, campaign.revision)).rejects.toThrow(/cambió/);
  expect(store.getCampaign(campaign.id)).toEqual(saved);
  await store.deleteCampaign(saved.id, saved.revision);
  await expect(store.saveCampaignEditable({ ...saved, title: 'Guardado tardío' })).rejects.toThrow(
    /no encontrada/,
  );
  await expect(store.deleteCampaign('missing', 0)).rejects.toThrow(/no encontrada/);
});

it.each(['generate', 'publish'] as const)('keeps a campaign while a %s job is active', async (type) => {
  const { store, campaign } = await fixture();
  for (const status of ['queued', 'running'] as const) {
    await store.upsertJob(job(campaign, type, status));
    await expect(store.deleteCampaign(campaign.id, campaign.revision)).rejects.toThrow(/trabajo activo/);
  }
  expect(store.getCampaign(campaign.id)).toEqual(campaign);
  await store.upsertJob(job(campaign, type, 'completed'));
  await store.deleteCampaign(campaign.id, campaign.revision);
  expect((await store.bootstrap()).campaigns).toHaveLength(0);
});

it.each(['publishing', 'unknown', 'partial'] as const)(
  'preserves a %s publication for reconciliation',
  async (status) => {
    const { store, campaign } = await fixture();
    const saved = await store.saveCampaign({ ...campaign, publication: publication(status) });
    await expect(store.deleteCampaign(saved.id, saved.revision)).rejects.toThrow(/estado de la publicación/);
    expect(store.getCampaign(saved.id)).toEqual(saved);
  },
);

function publication(status: Publication['status']): Publication {
  return { status, fingerprint: 'same-content', updatedAt: new Date().toISOString(), message: 'Prueba' };
}

it('retains publication deduplication after deleting a verified campaign and restarting', async () => {
  const { root, store, campaign } = await fixture();
  const published = await store.saveCampaign({ ...campaign, publication: publication('verified') });
  await store.deleteCampaign(published.id, published.revision);
  const restarted = new Store(root);
  await restarted.init();
  let other = await restarted.createCampaign({ ...input, productIds: [] });
  await restarted.addAsset(
    {
      id: 'a',
      campaignId: other.id,
      filename: 'a.png',
      width: 800,
      height: 1000,
      mime: 'image/png',
      bytes: 100,
      createdAt: other.createdAt,
      role: 'imported',
    },
    { original: 'contenido/a.png', preview: 'contenido/a.webp' },
  );
  other = await restarted.saveCampaign({
    ...other,
    copyApproved: true,
    copyOptions: [{ id: 'copy', title: 'Texto', slides: [{ headline: 'Hola', body: '' }], caption: 'Texto' }],
    selectedCopyId: 'copy',
    finalAssetIds: ['a'],
  });
  other = await restarted.approveCampaign(other.id, other.revision);
  await expect(
    restarted.claimPublication(other.id, other.revision, 'same-content', job(other, 'publish')),
  ).rejects.toThrow(/evitar duplicados/);
  expect((await restarted.bootstrap()).jobs).toHaveLength(0);
});

it('serializes deletion and generation claims so only one can win', async () => {
  const { store, campaign } = await fixture();
  const approved = await store.saveCampaign({
    ...campaign,
    copyApproved: true,
    selectedCopyId: 'copy',
    copyOptions: [{ id: 'copy', title: 'Texto', caption: 'Texto', slides: [{ headline: 'Hola', body: '' }] }],
  });
  const result = await Promise.allSettled([
    store.claimGeneration(approved.id, approved.revision, job(approved)),
    store.deleteCampaign(approved.id, approved.revision),
  ]);
  expect(result.map((item) => item.status)).toEqual(['fulfilled', 'rejected']);
  expect(store.getCampaign(approved.id)).toEqual(approved);
});
