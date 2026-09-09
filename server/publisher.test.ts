import { access, cp, mkdir, mkdtemp, readFile, rename, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { storeCampaignImage } from './media.js';
import type { MetaCheckpoint, MetaPlan } from './meta-types.js';
import { executeMetaPlan, matchImagesInOrder } from './meta-worker.mjs';
import { assessPublication, createPublisher, type MetaWorker } from './publisher.js';
import { Store } from './store.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(count = 1) {
  const root = await mkdtemp(join(tmpdir(), 'elabela-publisher-'));
  roots.push(root);
  const store = new Store(root);
  await store.init();
  let campaign = await store.createCampaign({
    title: 'PRUEBA',
    trendId: 'test',
    productIds: [],
    language: 'es',
    slideCount: count,
    variantCount: 1,
  });
  campaign = await store.saveCampaign({
    ...campaign,
    copyOptions: [
      {
        id: 'copy',
        title: 'Texto',
        caption: 'Texto aprobado para PRUEBA',
        slides: Array.from({ length: count }, () => ({ headline: 'Prueba', body: '' })),
      },
    ],
    selectedCopyId: 'copy',
    copyApproved: true,
  });
  const masters = [];
  for (let index = 0; index < count; index++) {
    const buffer = await sharp({
      create: { width: 800, height: 1000, channels: 3, background: index ? '#c894bc' : '#ac6d91' },
    })
      .png()
      .toBuffer();
    const stored = await storeCampaignImage({ root, campaignId: campaign.id, buffer });
    await store.addAsset(stored.asset, stored.paths);
    masters.push({ ...stored, buffer });
  }
  campaign = await store.saveCampaign({
    ...campaign,
    finalAssetIds: masters.map((master) => master.asset.id),
  });
  const unapproved = campaign;
  campaign = await store.approveCampaign(campaign.id, campaign.revision);
  return { root, store, campaign, unapproved, masters };
}
const options = { pageId: '123', instagramBusinessId: '456' };

describe('Meta publisher approval and staging', () => {
  it('exports a publisher factory', () => expect(typeof createPublisher).toBe('function'));
  it('requires the exact current and approved revision before any worker call', async () => {
    const { campaign, store } = await fixture();
    const worker = vi.fn<MetaWorker>();
    const publisher = createPublisher({ ...options, worker });
    await expect(
      publisher.publish({ campaign, payload: { revision: campaign.revision - 1 }, store }),
    ).rejects.toThrow(/revisión/i);
    const draft = await store.saveCampaign({ ...campaign, copyApproved: false });
    await expect(
      publisher.publish({ campaign: draft, payload: { revision: draft.revision }, store }),
    ).rejects.toThrow(/aprob/i);
    expect(worker).not.toHaveBeenCalled();
  });
  it('fails with actionable configuration error before claiming or spawning', async () => {
    const { campaign, store } = await fixture();
    const publisher = createPublisher({ pageId: '', instagramBusinessId: '' });
    await expect(
      publisher.publish({ campaign, payload: { revision: campaign.revision }, store }),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(store.getCampaign(campaign.id).publication).toBeUndefined();
  });
  it('requires the existing protected-token installation when no worker is injected', async () => {
    const { campaign, store, root } = await fixture();
    const publisher = createPublisher({ ...options, metaBusinessDir: root });
    await expect(
      publisher.publish({ campaign, payload: { revision: campaign.revision }, store }),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect((await store.bootstrap()).jobs).toHaveLength(0);
  });
  it.each([1, 3])(
    'stages %i ordered JPEGs at 1080x1350 with intact masters and persisted claim before the worker',
    async (count) => {
      const { campaign, store, masters } = await fixture(count);
      const worker = vi.fn<MetaWorker>(async (request) => {
        const current = store.getCampaign(campaign.id);
        expect(current.publication?.status).toBe('publishing');
        expect((await store.bootstrap()).jobs[0]?.status).toBe('running');
        expect(request.plan.images).toHaveLength(count);
        expect(request.plan.kind).toBe(count === 1 ? 'image' : 'carousel');
        expect(request.mode).toBe('publish');
        for (const [index, staged] of request.plan.images.entries()) {
          expect(staged.path).toContain('staging');
          expect(await sharp(staged.path).metadata()).toMatchObject({
            format: 'jpeg',
            width: 1080,
            height: 1350,
          });
          const master = masters[index];
          if (!master) throw new Error('Missing test master');
          expect(await readFile(await store.getAssetPath(master.asset.id))).toEqual(master.buffer);
        }
        return {
          version: 1,
          fingerprint: request.plan.fingerprint,
          attempts: [],
          items: [],
          instagram: {},
          facebook: {},
        };
      });
      const publisher = createPublisher({ ...options, worker });
      await publisher.publish({ campaign, payload: { revision: campaign.revision }, store });
      await vi.waitFor(async () => expect((await store.bootstrap()).jobs[0]?.status).toBe('interrupted'));
      expect(worker).toHaveBeenCalledTimes(1);
    },
  );
  it('blocks double click even across publisher instances', async () => {
    const { campaign, store } = await fixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const worker = vi.fn<MetaWorker>(async (request) => {
      await gate;
      return {
        version: 1,
        fingerprint: request.plan.fingerprint,
        attempts: [],
        items: [],
        instagram: {},
        facebook: {},
      };
    });
    const first = createPublisher({ ...options, worker });
    const second = createPublisher({ ...options, worker });
    const result = await Promise.allSettled([
      first.publish({ campaign, payload: { revision: campaign.revision }, store }),
      second.publish({ campaign, payload: { revision: campaign.revision }, store }),
    ]);
    expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    release();
    await vi.waitFor(async () => expect((await store.bootstrap()).jobs[0]?.status).toBe('interrupted'));
    expect(worker).toHaveBeenCalledTimes(1);
  });
  it('blocks identical destinations, caption and ordered source bytes across campaigns', async () => {
    const { campaign, store, masters, root } = await fixture();
    const worker = vi.fn<MetaWorker>(async ({ plan }) => emptyState(plan));
    const publisher = createPublisher({ ...options, worker });
    await publisher.publish({ campaign, payload: { revision: campaign.revision }, store });
    await vi.waitFor(async () => expect((await store.bootstrap()).jobs[0]?.status).toBe('interrupted'));
    let other = await store.createCampaign({
      title: 'Otra campaña',
      trendId: 'test',
      productIds: [],
      language: 'es',
      slideCount: 1,
      variantCount: 1,
    });
    const master = masters[0];
    if (!master) throw new Error('Missing test master');
    const image = await storeCampaignImage({ root, campaignId: other.id, buffer: master.buffer });
    await store.addAsset(image.asset, image.paths);
    other = await store.saveCampaign({
      ...other,
      copyOptions: campaign.copyOptions,
      selectedCopyId: 'copy',
      copyApproved: true,
      finalAssetIds: [image.asset.id],
    });
    other = await store.approveCampaign(other.id, other.revision);
    await expect(
      publisher.publish({ campaign: other, payload: { revision: other.revision }, store }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(worker).toHaveBeenCalledTimes(1);
    expect(store.getCampaign(other.id).publication).toBeUndefined();
  });
  it('keeps raw worker exceptions out of the response and all public job state', async () => {
    const { campaign, store } = await fixture();
    const publisher = createPublisher({
      ...options,
      worker: async () => {
        throw new Error('https://graph.facebook.com/?access_token=FAKE-SENSITIVE-TOKEN');
      },
    });
    const result = await publisher.publish({ campaign, payload: { revision: campaign.revision }, store });
    expect(JSON.stringify(result)).not.toContain('FAKE-SENSITIVE');
    await vi.waitFor(async () => expect((await store.bootstrap()).jobs[0]?.status).toBe('interrupted'));
    expect(JSON.stringify(await store.bootstrap())).not.toContain('FAKE-SENSITIVE');
    expect(store.getCampaign(campaign.id).publication?.status).toBe('unknown');
  });
  it('does not claim a publication if its local reconciliation record cannot be persisted', async () => {
    const { campaign, store, root } = await fixture();
    await mkdir(join(root, '.local', 'meta-publications', `${campaign.id}.json`), { recursive: true });
    const worker = vi.fn<MetaWorker>();
    await expect(
      createPublisher({ ...options, worker }).publish({
        campaign,
        payload: { revision: campaign.revision },
        store,
      }),
    ).rejects.toThrow();
    expect(worker).not.toHaveBeenCalled();
    expect(store.getCampaign(campaign.id).publication).toBeUndefined();
    expect((await store.bootstrap()).jobs).toHaveLength(0);
  });
});

function emptyState(plan: MetaPlan): MetaCheckpoint {
  return { version: 1, fingerprint: plan.fingerprint, attempts: [], items: [], instagram: {}, facebook: {} };
}
async function publicationHarness(
  count = 3,
  behavior: { failAt?: string; wrongCaption?: boolean; swapImages?: boolean } = {},
) {
  const data = await fixture(count);
  const calls: string[] = [];
  const imageFields: string[] = [];
  const checkpoints: MetaCheckpoint[] = [];
  let capturedPlan!: MetaPlan;
  let checkpoint!: MetaCheckpoint;
  const worker: MetaWorker = async ({ plan, mode }) => {
    capturedPlan = plan;
    let photoCount = 0;
    let childCount = 0;
    const post = async (name: string, result: string) => {
      calls.push(`POST ${name}`);
      expect(checkpoints.at(-1)?.attempts.at(-1)?.status).toBe('attempting');
      if (behavior.failAt === name) throw new Error('Secret: FAKE-TOKEN-DO-NOT-EXPOSE');
      return result;
    };
    const state = checkpoint ?? emptyState(plan);
    checkpoint = await executeMetaPlan(plan, state, {
      mode,
      api: {
        uploadFacebookPhoto: async () => post('upload', `photo-${++photoCount}`),
        getFacebookImageUrl: async (id) => {
          calls.push('GET image');
          return `https://scontent.fbcdn.net/${id}.jpg`;
        },
        createInstagramItem: async () => post('child', `container-${++childCount}`),
        createInstagramCarousel: async () => post('carousel', 'parent'),
        publishInstagramCarousel: async () => post('instagram', 'ig-media'),
        publishFacebookCarousel: async () => post('facebook', '123_fb-post'),
        waitForInstagramContainer: async () => {
          calls.push('GET readiness');
          return { status_code: 'FINISHED' };
        },
      },
      request: async (path, request) => {
        const method = request.method ?? 'GET';
        calls.push(`${method} ${path}`);
        if (method === 'POST') return { id: await post('image', 'parent') };
        if (path === 'parent') return { status_code: 'PUBLISHED' };
        if (path === '456/media')
          return { data: [{ id: 'ig-media', caption: plan.caption, timestamp: new Date().toISOString() }] };
        if (path === '123/posts')
          return {
            data: [{ id: '123_fb-post', message: plan.caption, created_time: new Date().toISOString() }],
          };
        if (path === 'ig-media') {
          imageFields.push(String(request.params.fields));
          return {
            id: 'ig-media',
            caption: behavior.wrongCaption ? 'Distinto' : plan.caption,
            media_type: count === 1 ? 'IMAGE' : 'CAROUSEL_ALBUM',
            permalink: 'https://www.instagram.com/p/TEST/',
            media_url: 'https://scontent.cdninstagram.com/0.jpg',
            ...(count > 1
              ? {
                  children: {
                    data: plan.images.map((_, index) => ({
                      id: `media-${index}`,
                      media_type: 'IMAGE',
                      media_url: `https://scontent.cdninstagram.com/${index}.jpg`,
                    })),
                  },
                }
              : {}),
          };
        }
        if (path === '123_fb-post')
          return {
            id: path,
            message: plan.caption,
            is_published: true,
            permalink_url: 'https://www.facebook.com/123/posts/TEST/',
            attachments: {
              data:
                count === 1
                  ? [{ target: { id: 'photo-1' } }]
                  : [
                      {
                        subattachments: {
                          data: plan.images.map((_, index) => ({ target: { id: `photo-${index + 1}` } })),
                        },
                      },
                    ],
            },
          };
        throw new Error(`Unexpected GET in test: ${path}`);
      },
      fetchImage: async (url) => {
        const position = Number(new URL(url).pathname.match(/\d+/)?.[0]);
        const index = behavior.swapImages && position < 2 ? 1 - position : position;
        const source = plan.images[index];
        if (!source) throw new Error('Bad fixture image');
        return sharp(await readFile(source.path))
          .jpeg({ quality: 82 })
          .toBuffer();
      },
      saveState: async (next) => {
        checkpoints.push(structuredClone(next));
        checkpoint = structuredClone(next);
      },
    });
    return checkpoint;
  };
  const publisher = createPublisher({ ...options, worker });
  return {
    ...data,
    publisher,
    calls,
    imageFields,
    checkpoints,
    get plan() {
      return capturedPlan;
    },
    get state() {
      return checkpoint;
    },
  };
}

describe('Meta worker publication and reconciliation', () => {
  it('keeps a lost Instagram ID unknown even when a visually identical recent post exists', async () => {
    const data = await publicationHarness(1, { failAt: 'instagram' });
    await data.publisher.publish({
      campaign: data.campaign,
      payload: { revision: data.campaign.revision },
      store: data.store,
    });
    await vi.waitFor(async () => expect((await data.store.bootstrap()).jobs[0]?.status).toBe('interrupted'));
    const before = data.calls.filter((call) => call.startsWith('POST')).length;
    const result = await data.publisher.reconcile({
      campaign: data.store.getCampaign(data.campaign.id),
      payload: {},
      store: data.store,
    });
    expect(result.campaign.publication?.status).toBe('unknown');
    expect(result.campaign.publication?.instagramUrl).toBeUndefined();
    expect(data.state.instagram.mediaId).toBeUndefined();
    expect(data.calls.filter((call) => call.startsWith('POST'))).toHaveLength(before);
  });
  it('rejects removed small text and similar prices while permitting JPEG recompression', async () => {
    const price = async (text: string) =>
      sharp({ create: { width: 1080, height: 1350, channels: 3, background: '#ffffff' } })
        .composite([
          {
            input: Buffer.from(
              `<svg width="1080" height="1350"><text x="40" y="1000" font-family="sans-serif" font-size="22" fill="black">${text}</text></svg>`,
            ),
          },
        ])
        .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
        .toBuffer();
    const approved = await price('Gs. 150.000');
    const blank = await price('');
    const otherPrice = await price('Gs. 160.000');
    const compressed = await sharp(approved).jpeg({ quality: 70 }).toBuffer();
    expect(await matchImagesInOrder([approved], [blank])).toEqual([false]);
    expect(await matchImagesInOrder([approved], [otherPrice])).toEqual([false]);
    expect(await matchImagesInOrder([approved], [compressed])).toEqual([true]);
    expect(await matchImagesInOrder([approved, otherPrice], [approved, otherPrice])).toEqual([true, true]);
    expect(await matchImagesInOrder([approved, otherPrice], [compressed, otherPrice])).toEqual([true, true]);
    expect(await matchImagesInOrder([approved, otherPrice], [otherPrice, approved])).toEqual([false, false]);
  });
  it('rejects reconciliation when contenido is a junction to an external directory', async () => {
    const data = await publicationHarness(1);
    await data.publisher.publish({
      campaign: data.campaign,
      payload: { revision: data.campaign.revision },
      store: data.store,
    });
    await vi.waitFor(async () => expect((await data.store.bootstrap()).jobs[0]?.status).toBe('completed'));
    // The job status is persisted before the publisher's finally releases its lock.
    // Move the fixture directory only after that cleanup, so this tests confinement, not contention.
    await vi.waitFor(async () => {
      await expect(access(join(data.root, '.local', 'meta-publisher.lock'))).rejects.toHaveProperty(
        'code',
        'ENOENT',
      );
    });
    const outside = await mkdtemp(join(tmpdir(), 'elabela-junction-review-'));
    roots.push(outside);
    const originalContent = join(data.root, 'contenido');
    await cp(originalContent, join(outside, 'contenido'), { recursive: true });
    await rename(originalContent, join(data.root, 'contenido-original'));
    await symlink(
      join(outside, 'contenido'),
      originalContent,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const worker = vi.fn<MetaWorker>(async ({ plan }) => emptyState(plan));
    await expect(
      createPublisher({ ...options, worker }).reconcile({
        campaign: data.store.getCampaign(data.campaign.id),
        payload: {},
        store: data.store,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(worker).not.toHaveBeenCalled();
  });
  it.each([1, 3])(
    'publishes %i images and requires independent GET evidence before verified',
    async (count) => {
      const data = await publicationHarness(count);
      await data.publisher.publish({
        campaign: data.campaign,
        payload: { revision: data.campaign.revision },
        store: data.store,
      });
      await vi.waitFor(async () => expect((await data.store.bootstrap()).jobs[0]?.status).toBe('completed'), {
        timeout: 5000,
      });
      expect(data.store.getCampaign(data.campaign.id).publication).toMatchObject({
        status: 'verified',
        instagramUrl: 'https://www.instagram.com/p/TEST/',
        facebookUrl: 'https://www.facebook.com/123/posts/TEST/',
      });
      expect(data.calls.filter((call) => call === 'POST upload')).toHaveLength(count);
      expect(data.calls.filter((call) => call === 'POST child')).toHaveLength(count === 1 ? 0 : count);
      expect(data.calls).toContain('GET ig-media');
      expect(data.calls).toContain('GET 123_fb-post');
      expect(data.state.instagram.evidence?.childIds).toEqual(
        count === 1 ? [] : ['media-0', 'media-1', 'media-2'],
      );
      expect(data.imageFields.every((fields) => fields.includes('children') === count > 1)).toBe(true);
    },
  );
  it.each(['upload', 'child', 'instagram', 'facebook'])(
    'persists unknown at %s and forbids any retry',
    async (failAt) => {
      const data = await publicationHarness(3, { failAt });
      await data.publisher.publish({
        campaign: data.campaign,
        payload: { revision: data.campaign.revision },
        store: data.store,
      });
      await vi.waitFor(
        async () => expect((await data.store.bootstrap()).jobs[0]?.status).toBe('interrupted'),
        { timeout: 5000 },
      );
      expect(data.state.attempts.at(-1)?.status).toBe('unknown');
      const uncertain = data.store.getCampaign(data.campaign.id);
      expect(uncertain.publication?.status).toBe(failAt === 'facebook' ? 'partial' : 'unknown');
      expect(JSON.stringify(await data.store.bootstrap())).not.toContain('FAKE-TOKEN');
      const mutations = data.calls.filter((call) => call.startsWith('POST'));
      await expect(
        data.publisher.publish({
          campaign: uncertain,
          payload: { revision: uncertain.revision },
          store: data.store,
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(data.calls.filter((call) => call.startsWith('POST'))).toEqual(mutations);
    },
  );
  it('reconciles existing uncertain publications with GET only, retaining the original image order', async () => {
    const data = await publicationHarness(3, { failAt: 'facebook' });
    await data.publisher.publish({
      campaign: data.campaign,
      payload: { revision: data.campaign.revision },
      store: data.store,
    });
    await vi.waitFor(async () => expect((await data.store.bootstrap()).jobs[0]?.status).toBe('interrupted'));
    const before = data.calls.length;
    const result = await data.publisher.reconcile({
      campaign: data.store.getCampaign(data.campaign.id),
      payload: {},
      store: data.store,
    });
    expect(data.calls.slice(before).every((call) => call.startsWith('GET'))).toBe(true);
    expect(result.campaign.publication?.status).toBe('verified');
  });
  it.each([{ wrongCaption: true }, { swapImages: true }])(
    'leaves incomplete verification partial (%j)',
    async (behavior) => {
      const data = await publicationHarness(3, behavior);
      await data.publisher.publish({
        campaign: data.campaign,
        payload: { revision: data.campaign.revision },
        store: data.store,
      });
      await vi.waitFor(async () =>
        expect((await data.store.bootstrap()).jobs[0]?.status).toBe('interrupted'),
      );
      expect(data.store.getCampaign(data.campaign.id).publication).toMatchObject({ status: 'partial' });
      expect(data.store.getCampaign(data.campaign.id).publication?.instagramUrl).toBeUndefined();
    },
  );
  it('compares image order conservatively while tolerating JPEG recompression and identical duplicates', async () => {
    const a = await sharp({ create: { width: 160, height: 200, channels: 3, background: '#aa3377' } })
      .jpeg({ quality: 95 })
      .toBuffer();
    const b = await sharp({ create: { width: 160, height: 200, channels: 3, background: '#22ccaa' } })
      .jpeg({ quality: 95 })
      .toBuffer();
    const recompressed = await sharp(a).jpeg({ quality: 70 }).toBuffer();
    expect(await matchImagesInOrder([a, b], [recompressed, b])).toEqual([true, true]);
    expect(await matchImagesInOrder([a, b], [b, a])).toEqual([false, false]);
    expect(await matchImagesInOrder([a, a], [recompressed, recompressed])).toEqual([true, true]);
  });
  it('rejects unsafe links and malformed worker evidence without failing the job handler', async () => {
    const data = await publicationHarness(1);
    await data.publisher.publish({
      campaign: data.campaign,
      payload: { revision: data.campaign.revision },
      store: data.store,
    });
    await vi.waitFor(async () => expect((await data.store.bootstrap()).jobs[0]?.status).toBe('completed'));
    const state = structuredClone(data.state);
    if (!state.instagram.evidence || !state.facebook.evidence) throw new Error('Missing evidence');
    state.instagram.evidence.permalink = 'https://www.instagram.com/p/TEST/?token=SENSITIVE';
    state.facebook.evidence.permalink = 'https://www.facebook.com/123/posts/TEST/?Token=SENSITIVE';
    const result = assessPublication(data.plan, state);
    expect(result.status).toBe('partial');
    expect(JSON.stringify(result)).not.toContain('SENSITIVE');
    expect(() =>
      assessPublication(data.plan, { ...state, items: null } as unknown as MetaCheckpoint),
    ).not.toThrow();
    expect(assessPublication(data.plan, { ...state, items: null } as unknown as MetaCheckpoint).status).toBe(
      'unknown',
    );
  });
  it('rejects a plan whose caption was changed after fingerprinting before any request', async () => {
    const data = await publicationHarness(1);
    await data.publisher.publish({
      campaign: data.campaign,
      payload: { revision: data.campaign.revision },
      store: data.store,
    });
    await vi.waitFor(async () => expect((await data.store.bootstrap()).jobs[0]?.status).toBe('completed'));
    const request = vi.fn(async () => ({}));
    const operation = vi.fn(async () => 'unexpected');
    await expect(
      executeMetaPlan({ ...data.plan, caption: 'Texto alterado' }, emptyState(data.plan), {
        mode: 'publish',
        request,
        saveState: async () => {},
        api: {
          uploadFacebookPhoto: operation,
          getFacebookImageUrl: operation,
          createInstagramItem: operation,
          createInstagramCarousel: operation,
          publishInstagramCarousel: operation,
          publishFacebookCarousel: operation,
          waitForInstagramContainer: operation,
        },
      }),
    ).rejects.toThrow(/fingerprint/i);
    expect(request).not.toHaveBeenCalled();
    expect(operation).not.toHaveBeenCalled();
  });
});
