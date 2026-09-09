import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '../shared/types.js';
import { buildApp } from './app.js';
import { Store } from './store.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'elabela-shutdown-'));
  roots.push(root);
  const store = new Store(root);
  await store.init();
  let campaign = await store.createCampaign({
    title: 'Shutdown test',
    trendId: 'test',
    productIds: [],
    language: 'es',
    slideCount: 1,
    variantCount: 1,
  });
  const now = new Date().toISOString();
  await store.addAsset(
    {
      id: 'asset',
      campaignId: campaign.id,
      filename: 'image.png',
      mime: 'image/png',
      width: 800,
      height: 1000,
      bytes: 1,
      createdAt: now,
      role: 'imported',
    },
    { original: 'contenido/image.png', preview: 'contenido/image.webp' },
  );
  campaign = await store.saveCampaign({
    ...campaign,
    copyOptions: [
      { id: 'copy', title: 'Copy', caption: 'Approved', slides: [{ headline: 'Test', body: '' }] },
    ],
    selectedCopyId: 'copy',
    copyApproved: true,
    finalAssetIds: ['asset'],
  });
  campaign = await store.approveCampaign(campaign.id, campaign.revision);
  const job: Job = {
    id: 'publish-test',
    campaignId: campaign.id,
    type: 'publish',
    status: 'running',
    total: 2,
    completed: 0,
    message: 'Test',
    createdAt: now,
    updatedAt: now,
  };
  return { root, store, campaign, job };
}
describe('atomic shutdown', () => {
  it('seals publication and generation claims plus new jobs before reporting idle', async () => {
    const { store, campaign, job } = await fixture();
    expect(await store.beginShutdown()).toEqual({ draining: true, activeJobs: 0 });
    await expect(
      store.claimPublication(campaign.id, campaign.revision, 'test-fingerprint', job),
    ).rejects.toMatchObject({ statusCode: 503 });
    await expect(
      store.claimGeneration(campaign.id, campaign.revision, { ...job, type: 'generate' }),
    ).rejects.toMatchObject({ statusCode: 503 });
    await expect(store.upsertJob({ ...job, id: 'search', type: 'search' })).rejects.toMatchObject({
      statusCode: 503,
    });
    expect((await store.bootstrap()).jobs).toHaveLength(0);
  });
  it('lets already claimed work finish and waits for its persisted terminal state', async () => {
    const { store, campaign, job } = await fixture();
    await store.claimPublication(campaign.id, campaign.revision, 'test-fingerprint', job);
    expect(await store.beginShutdown()).toEqual({ draining: true, activeJobs: 1 });
    const idle = vi.fn();
    const waiting = store.waitForIdle().then(idle);
    await store.upsertJob({ ...job, completed: 1 });
    expect(idle).not.toHaveBeenCalled();
    await store.upsertJob({ ...job, completed: 2, status: 'completed' });
    await waiting;
    expect(idle).toHaveBeenCalledOnce();
    expect((await store.bootstrap()).jobs[0]?.status).toBe('completed');
  });
  it('authenticates shutdown and rejects a publish handler that awaited before claiming', async () => {
    const { root, campaign, job } = await fixture();
    let enter!: () => void;
    let resume!: () => void;
    let closed!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const pause = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const closing = new Promise<void>((resolve) => {
      closed = resolve;
    });
    const mutation = vi.fn();
    const app = await buildApp({
      root,
      token: 'shutdown-test',
      integrations: {
        publish: async (context) => {
          enter();
          await pause;
          const next = await context.store.claimPublication(
            campaign.id,
            context.payload.revision,
            'test-fingerprint',
            job,
          );
          mutation();
          return { campaign: next, job };
        },
      },
    });
    app.addHook('onClose', async () => {
      closed();
    });
    const headers = { host: '127.0.0.1:4317', authorization: 'Bearer shutdown-test' };
    try {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/shutdown',
            headers: { host: headers.host },
            payload: {},
          })
        ).statusCode,
      ).toBe(401);
      const publishing = app
        .inject({
          method: 'POST',
          url: `/api/campaigns/${campaign.id}/publish`,
          headers,
          payload: { revision: campaign.revision },
        })
        .then((response) => response);
      await entered;
      const shutdown = await app.inject({ method: 'POST', url: '/api/shutdown', headers, payload: {} });
      expect(shutdown.statusCode).toBe(202);
      expect(shutdown.json()).toEqual({ draining: true, activeJobs: 0 });
      resume();
      expect((await publishing).statusCode).toBe(503);
      await closing;
      expect(mutation).not.toHaveBeenCalled();
    } finally {
      resume();
      await app.close();
    }
  });
});
