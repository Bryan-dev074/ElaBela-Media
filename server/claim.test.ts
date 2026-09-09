import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { Job } from '../shared/types.js';
import { Store } from './store.js';

it('claims an approved publication once and locks edits atomically with its persistent job', async () => {
  const root = await mkdtemp(join(tmpdir(), 'elabela-claim-'));
  try {
    const store = new Store(root);
    await store.init();
    let campaign = await store.createCampaign({
      title: 'Claim',
      trendId: 't',
      productIds: [],
      language: 'es',
      slideCount: 1,
      variantCount: 3,
    });
    const now = new Date().toISOString();
    const job: Job = {
      id: 'job1',
      campaignId: campaign.id,
      type: 'publish',
      status: 'running',
      total: 2,
      completed: 0,
      createdAt: now,
      updatedAt: now,
      message: 'Publicando',
    };
    await expect(store.claimPublication(campaign.id, campaign.revision, 'fingerprint', job)).rejects.toThrow(
      /aprob/i,
    );
    campaign = await store.saveCampaign({
      ...campaign,
      copyOptions: [
        { id: 'copy', title: 'Copy', caption: 'caption', slides: [{ headline: 'test', body: '' }] },
      ],
      selectedCopyId: 'copy',
      copyApproved: true,
    });
    await store.addAsset(
      {
        id: 'asset',
        campaignId: campaign.id,
        filename: 'test.png',
        width: 800,
        height: 1000,
        mime: 'image/png',
        bytes: 1000,
        createdAt: now,
        role: 'imported',
      },
      { original: 'contenido/test.png', preview: 'contenido/test.webp' },
    );
    campaign = await store.saveCampaign({ ...campaign, finalAssetIds: ['asset'] });
    campaign = await store.approveCampaign(campaign.id, campaign.revision);
    const results = await Promise.allSettled([
      store.claimPublication(campaign.id, campaign.revision, 'fingerprint', job),
      store.claimPublication(campaign.id, campaign.revision, 'fingerprint', { ...job, id: 'job2' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await store.bootstrap()).jobs).toHaveLength(1);
    const claimed = store.getCampaign(campaign.id);
    expect(claimed.publication?.status).toBe('publishing');
    expect(claimed.approvedRevision).toBe(claimed.revision);
    await expect(store.saveCampaignEditable({ ...claimed, title: 'changed' })).rejects.toThrow(/activa/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
