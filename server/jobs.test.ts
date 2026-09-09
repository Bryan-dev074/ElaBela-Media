import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { recoverInterruptedJobs } from './jobs.js';
import { Store } from './store.js';

it('marks interrupted work without retrying generation or sending a publication again', async () => {
  const root = await mkdtemp(join(tmpdir(), 'elabela-recovery-'));
  try {
    const store = new Store(root);
    await store.init();
    const campaign = await store.createCampaign({
      title: 'Recovery',
      trendId: 't',
      productIds: [],
      language: 'es',
      slideCount: 1,
      variantCount: 3,
    });
    const now = new Date().toISOString();
    await store.saveCampaign({
      ...campaign,
      publication: { status: 'publishing', fingerprint: 'test', updatedAt: now },
    });
    await store.upsertJob({
      id: 'job',
      campaignId: campaign.id,
      type: 'publish',
      status: 'running',
      total: 2,
      completed: 1,
      createdAt: now,
      updatedAt: now,
      message: 'Sending',
    });
    await recoverInterruptedJobs(store);
    expect((await store.bootstrap()).jobs[0]?.status).toBe('interrupted');
    expect(store.getCampaign(campaign.id).publication?.status).toBe('unknown');
    await recoverInterruptedJobs(store);
    expect((await store.bootstrap()).jobs).toHaveLength(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
