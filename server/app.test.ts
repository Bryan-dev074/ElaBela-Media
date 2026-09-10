import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Asset, Campaign, Job, Trend } from '../shared/types.js';
import { buildApp } from './app.js';
import { Store } from './store.js';

const TOKEN = 'fixed-test-token';
const ORIGIN = 'http://127.0.0.1:5173';

function authHeaders(extra: Record<string, string> = {}) {
  return {
    authorization: `Bearer ${TOKEN}`,
    origin: ORIGIN,
    host: '127.0.0.1:4317',
    ...extra,
  };
}

function sampleTrend(overrides: Partial<Trend> = {}): Trend {
  return {
    id: 'trend-1',
    title: 'Rutina de labios',
    summary: 'Idea editorial',
    rationale: 'Relaciona una rutina con productos reales.',
    category: 'Labios',
    format: 'carousel',
    platform: 'Instagram',
    evidence: 'editorial',
    sourceUrl: 'https://example.com/source',
    sourceName: 'Example',
    observedAt: '2026-09-09T12:00:00.000Z',
    region: 'Paraguay',
    productIds: ['17'],
    suggestedSlides: 2,
    references: [{ id: 'ref-1', url: 'https://example.com/ref', title: 'Referencia' }],
    saved: false,
    palette: ['#ffffff'],
    keywords: ['labios'],
    ...overrides,
  };
}

describe('servicio local', () => {
  let root: string;
  let app: FastifyInstance;
  let extraRoots: string[];

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'elabela-service-'));
    extraRoots = [];
    app = await buildApp({ root, token: TOKEN, allowedOrigins: [ORIGIN] });
  });

  afterEach(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
    await Promise.all(extraRoots.map((path) => rm(path, { recursive: true, force: true })));
  });
  it('allows an explicitly configured loopback test port without accepting arbitrary ports', async () => {
    const customRoot = await mkdtemp(join(tmpdir(), 'elabela-port-'));
    extraRoots.push(customRoot);
    const customApp = await buildApp({
      root: customRoot,
      token: TOKEN,
      localPort: 5187,
      allowedOrigins: ['http://127.0.0.1:5187'],
    });
    try {
      expect(
        (await customApp.inject({ method: 'GET', url: '/api/health', headers: { host: '127.0.0.1:5187' } }))
          .statusCode,
      ).toBe(200);
      expect(
        (await customApp.inject({ method: 'GET', url: '/api/health', headers: { host: '127.0.0.1:5188' } }))
          .statusCode,
      ).toBe(403);
    } finally {
      await customApp.close();
    }
  });

  it('expone un health mínimo y protege las demás rutas con token y origen exactos', async () => {
    const health = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { host: 'localhost:4317' },
    });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ ready: true });

    const missingToken = await app.inject({
      method: 'GET',
      url: '/api/bootstrap',
      headers: { origin: ORIGIN, host: '127.0.0.1:4317' },
    });
    expect(missingToken.statusCode).toBe(401);
    expect(missingToken.json()).toEqual({ error: 'No autorizado' });

    const badOrigin = await app.inject({
      method: 'GET',
      url: '/api/bootstrap',
      headers: authHeaders({ origin: 'https://evil.example' }),
    });
    expect(badOrigin.statusCode).toBe(403);
    expect(badOrigin.json()).toEqual({ error: 'Origen no autorizado' });

    const badHost = await app.inject({
      method: 'GET',
      url: '/api/bootstrap',
      headers: authHeaders({ host: 'evil.example' }),
    });
    expect(badHost.statusCode).toBe(403);
    expect(badHost.json()).toEqual({ error: 'Host no autorizado' });

    const unexpectedLoopbackPort = await app.inject({
      method: 'GET',
      url: '/api/bootstrap',
      headers: authHeaders({ host: '127.0.0.1:9999' }),
    });
    expect(unexpectedLoopbackPort.statusCode).toBe(403);

    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/api/bootstrap',
      headers: {
        host: '127.0.0.1:4317',
        origin: ORIGIN,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(ORIGIN);

    const missingRoute = await app.inject({ method: 'GET', url: '/api/no-existe', headers: authHeaders() });
    expect(missingRoute.statusCode).toBe(404);
    expect(missingRoute.json()).toEqual({ error: 'Ruta no encontrada' });

    const malformedJson = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: authHeaders({ 'content-type': 'application/json' }),
      payload: '{',
    });
    expect(malformedJson.statusCode).toBe(400);
    expect(malformedJson.json()).toEqual({ error: 'Solicitud no válida' });

    const settings = await app.inject({
      method: 'POST',
      url: '/api/settings',
      headers: authHeaders({ 'content-type': 'application/json' }),
      payload: { allowedOrigins: [ORIGIN, 'http://127.0.0.1:4317'] },
    });
    expect(settings.statusCode).toBe(200);
    expect(settings.json().allowedOrigins).toContain('http://127.0.0.1:4317');
  });

  it('pairs only the same-origin local page and does not cache its session capability', async () => {
    await app.close();
    app = await buildApp({ root, token: TOKEN, allowedOrigins: ['http://127.0.0.1:4317'] });
    const paired = await app.inject({
      method: 'POST',
      url: '/api/local-connection',
      headers: {
        host: '127.0.0.1:4317',
        origin: 'http://127.0.0.1:4317',
        'sec-fetch-site': 'same-origin',
        'x-elabela-connect': 'local',
      },
    });
    expect(paired.statusCode).toBe(200);
    expect(paired.json()).toEqual({ token: TOKEN });
    expect(paired.headers['cache-control']).toBe('no-store');
    const connected = await app.inject({
      url: '/api/bootstrap',
      headers: { host: '127.0.0.1:4317', authorization: `Bearer ${paired.json().token}` },
    });
    expect(connected.statusCode).toBe(200);
  });

  it('does not share local pairing with other origins, navigation or unmarked requests', async () => {
    await app.close();
    app = await buildApp({
      root,
      token: TOKEN,
      allowedOrigins: ['http://127.0.0.1:4317', ORIGIN, 'https://studio.example'],
    });
    const headers = {
      host: '127.0.0.1:4317',
      origin: 'http://127.0.0.1:4317',
      'sec-fetch-site': 'same-origin',
      'x-elabela-connect': 'local',
    };
    for (const extra of [
      { origin: 'https://studio.example' },
      { origin: ORIGIN },
      { origin: '' },
      { 'sec-fetch-site': 'cross-site' },
      { 'sec-fetch-site': 'same-site' },
      { 'sec-fetch-site': '' },
      { 'x-elabela-connect': '' },
      { host: 'evil.example:4317' },
    ]) {
      const denied = await app.inject({
        method: 'POST',
        url: '/api/local-connection',
        headers: { ...headers, ...extra },
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.body).not.toContain(TOKEN);
    }
    const navigation = await app.inject({ method: 'GET', url: '/api/local-connection', headers });
    expect(navigation.statusCode).toBe(403);
    expect(navigation.body).not.toContain(TOKEN);
  });

  it('persiste tendencias importadas y conserva el estado guardado al reimportarlas', async () => {
    const trend = sampleTrend({ saved: true, publishedAt: '2026-05-26' });
    const imported = await app.inject({
      method: 'POST',
      url: '/api/trends/import',
      headers: authHeaders({ 'content-type': 'application/json' }),
      payload: { trends: [trend] },
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json()[0].saved).toBe(true);

    const reimported = await app.inject({
      method: 'POST',
      url: '/api/trends/import',
      headers: authHeaders({ 'content-type': 'application/json' }),
      payload: { trends: [{ ...trend, title: 'Título renovado', saved: false }] },
    });
    expect(reimported.statusCode).toBe(200);
    expect(reimported.json()[0]).toMatchObject({ title: 'Título renovado', saved: true });

    await app.close();
    app = await buildApp({ root, token: TOKEN, allowedOrigins: [ORIGIN] });
    const bootstrap = await app.inject({ method: 'GET', url: '/api/bootstrap', headers: authHeaders() });
    expect(bootstrap.json().trends).toEqual([expect.objectContaining({ id: trend.id, saved: true })]);
  });

  it('crea tres variantes y rechaza una escritura con revisión obsoleta', async () => {
    const createdResponse = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: authHeaders({ 'content-type': 'application/json' }),
      payload: {
        title: 'Campaña labios',
        trendId: 'trend-1',
        productIds: ['17'],
        language: 'es',
        slideCount: 2,
        variantCount: 3,
      },
    });
    expect(createdResponse.statusCode).toBe(201);
    const campaign = createdResponse.json<Campaign>();
    expect(campaign.revision).toBe(0);
    expect(campaign.variants.map((variant) => variant.label)).toEqual(['Opción 1', 'Opción 2', 'Opción 3']);
    expect(campaign.variants.every((variant) => variant.assetIds.length === 2)).toBe(true);

    const changed = { ...campaign, title: 'Campaña actualizada' };
    const first = await app.inject({
      method: 'PUT',
      url: `/api/campaigns/${campaign.id}`,
      headers: authHeaders({ 'content-type': 'application/json' }),
      payload: changed,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().revision).toBe(1);

    const stale = await app.inject({
      method: 'PUT',
      url: `/api/campaigns/${campaign.id}`,
      headers: authHeaders({ 'content-type': 'application/json' }),
      payload: changed,
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ error: 'Conflicto de revisión' });
  });

  it('rechaza IDs finales que no pertenecen al registro de assets de la campaña', async () => {
    const campaign = await createCampaign(app);
    const response = await app.inject({
      method: 'PUT',
      url: `/api/campaigns/${campaign.id}`,
      headers: authHeaders({ 'content-type': 'application/json' }),
      payload: { ...campaign, finalAssetIds: ['no-existe'] },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'El carrusel contiene un asset ajeno' });
  });

  it('no permite inventar estado de publicación ni aprobar textos incompletos desde PUT', async () => {
    const campaign = await createCampaign(app);
    const forged = {
      ...campaign,
      copyOptions: [
        { id: 'copy-1', title: 'Incompleto', slides: [{ headline: 'Solo una', body: '' }], caption: 'Texto' },
      ],
      selectedCopyId: 'copy-1',
      copyApproved: true,
      publication: {
        status: 'verified',
        fingerprint: 'inventado',
        instagramUrl: 'https://instagram.com/p/inventado',
        updatedAt: new Date().toISOString(),
      },
    };
    const invalidCopy = await app.inject({
      method: 'PUT',
      url: `/api/campaigns/${campaign.id}`,
      headers: authHeaders({ 'content-type': 'application/json' }),
      payload: forged,
    });
    expect(invalidCopy.statusCode).toBe(400);

    const validDraft = {
      ...forged,
      copyApproved: false,
      selectedCopyId: null,
      copyOptions: [],
    };
    const saved = await app.inject({
      method: 'PUT',
      url: `/api/campaigns/${campaign.id}`,
      headers: authHeaders({ 'content-type': 'application/json' }),
      payload: validDraft,
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().publication).toBeUndefined();
  });

  it('bloquea ediciones mientras una generación de la campaña está activa', async () => {
    await app.close();
    const runningJob: Job = {
      id: 'job-running',
      type: 'generate',
      status: 'running',
      total: 6,
      completed: 0,
      message: 'Generando',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    app = await buildApp({
      root,
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      integrations: {
        generate: async ({ campaign, store }) => {
          const job = { ...runningJob, campaignId: campaign.id };
          await store.upsertJob(job);
          return { campaign, job };
        },
      },
    });
    const campaign = await createCampaign(app);
    const generation = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaign.id}/generate`,
      headers: authHeaders({ 'content-type': 'application/json' }),
      payload: { revision: campaign.revision },
    });
    expect(generation.statusCode).toBe(200);

    const edit = await app.inject({
      method: 'PUT',
      url: `/api/campaigns/${campaign.id}`,
      headers: authHeaders({ 'content-type': 'application/json' }),
      payload: { ...campaign, title: 'Cambio durante job' },
    });
    expect(edit.statusCode).toBe(409);
    expect(edit.json()).toEqual({ error: 'La campaña tiene una operación activa' });

    const approval = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaign.id}/approve`,
      headers: authHeaders({ 'content-type': 'application/json' }),
      payload: { revision: campaign.revision },
    });
    expect(approval.statusCode).toBe(409);
    expect(approval.json()).toEqual({ error: 'La campaña tiene una operación activa' });
  });

  it('revalida edición dentro de la cola si un job se encola antes del guardado público', async () => {
    const isolatedRoot = await mkdtemp(join(tmpdir(), 'elabela-store-race-'));
    extraRoots.push(isolatedRoot);
    const store = new Store(isolatedRoot);
    await store.init();
    const campaignA = await store.createCampaign({
      title: 'Campaña A',
      trendId: 'trend-a',
      productIds: [],
      language: 'es',
      slideCount: 1,
      variantCount: 1,
    });
    let campaignB = await store.createCampaign({
      title: 'Campaña B',
      trendId: 'trend-b',
      productIds: [],
      language: 'es',
      slideCount: 1,
      variantCount: 1,
    });
    campaignB = await store.saveCampaign({
      ...campaignB,
      copyOptions: [{ id: 'copy-b', title: 'Texto B', slides: [{ headline: 'B', body: '' }], caption: 'B' }],
      selectedCopyId: 'copy-b',
      copyApproved: true,
    });
    let releaseAsset!: () => void;
    let reportEntered!: () => void;
    const assetGate = new Promise<void>((resolve) => {
      releaseAsset = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      reportEntered = resolve;
    });
    const asset: Asset = {
      id: 'asset-b',
      filename: 'asset-b.png',
      mime: 'image/png',
      width: 400,
      height: 500,
      bytes: 1,
      createdAt: new Date().toISOString(),
      campaignId: campaignB.id,
      role: 'imported',
    };
    const holdingWrite = store.addCampaignAsset(
      { campaignId: campaignB.id, variantId: getVariant(campaignB, 0).id, slot: 0 },
      async () => {
        reportEntered();
        await assetGate;
        return {
          asset,
          paths: { original: 'contenido/asset-b.png', preview: 'contenido/asset-b-preview.webp' },
        };
      },
    );
    await entered;
    const now = new Date().toISOString();
    const jobWrite = store.upsertJob({
      id: 'job-a',
      campaignId: campaignA.id,
      type: 'generate',
      status: 'running',
      total: 1,
      completed: 0,
      message: 'Generando A',
      createdAt: now,
      updatedAt: now,
    });
    const publicSave = store.saveCampaignEditable({ ...campaignA, title: 'Cambio tardío' });
    const rejection = expect(publicSave).rejects.toThrow('operación activa');
    releaseAsset();
    await Promise.all([holdingWrite, jobWrite, rejection]);
    expect(store.getCampaign(campaignA.id).title).toBe('Campaña A');
  });

  it('vuelve a validar dentro de la cola si una generación empieza durante el stream multipart', async () => {
    await app.close();
    app = await buildApp({
      root,
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      integrations: {
        generate: async ({ campaign, store }) => {
          const now = new Date().toISOString();
          const job: Job = {
            id: `active-${campaign.id}`,
            campaignId: campaign.id,
            type: 'generate',
            status: 'running',
            total: 6,
            completed: 0,
            message: 'Generando',
            createdAt: now,
            updatedAt: now,
          };
          await store.upsertJob(job);
          return { campaign, job };
        },
      },
    });
    const campaign = await prepareCopy(app, await createCampaign(app));
    const image = await sharp({ create: { width: 400, height: 500, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    const boundary = '----elabela-upload-race';
    const stream = new PassThrough();
    const pendingUpload = app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaign.id}/assets`,
      headers: authHeaders({ 'content-type': `multipart/form-data; boundary=${boundary}` }),
      payload: stream,
    });
    stream.write(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
    );
    stream.write(image);
    await delay(50);

    const generation = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaign.id}/generate`,
      headers: authHeaders({ 'content-type': 'application/json' }),
      payload: { revision: campaign.revision },
    });
    expect(generation.statusCode).toBe(200);
    stream.end(
      Buffer.from(
        `\r\n--${boundary}\r\nContent-Disposition: form-data; name="variantId"\r\n\r\n${getVariant(campaign, 0).id}\r\n--${boundary}\r\nContent-Disposition: form-data; name="slot"\r\n\r\n0\r\n--${boundary}--\r\n`,
      ),
    );

    const upload = await pendingUpload;
    expect(upload.statusCode).toBe(409);
    expect(upload.json()).toEqual({ error: 'La campaña tiene una operación activa' });
    const bootstrap = await app.inject({ method: 'GET', url: '/api/bootstrap', headers: authHeaders() });
    expect(bootstrap.json().assets).toEqual([]);
  });

  it('congela el texto de piezas al existir imágenes pero permite editar el caption', async () => {
    let campaign = await createCampaign(app);
    campaign.copyOptions = [
      {
        id: 'copy-1',
        title: 'Texto elegido',
        slides: [
          { headline: 'Portada original', body: 'Uno' },
          { headline: 'Cierre original', body: 'Dos' },
        ],
        caption: 'Caption inicial',
      },
    ];
    campaign.selectedCopyId = 'copy-1';
    campaign.copyApproved = true;
    const prepared = await app.inject({
      method: 'PUT',
      url: `/api/campaigns/${campaign.id}`,
      headers: authHeaders({ 'content-type': 'application/json' }),
      payload: campaign,
    });
    campaign = prepared.json<Campaign>();
    const uploaded = await uploadImage(app, campaign, getVariant(campaign, 0).id, 0, '#8b5cf6');
    campaign = uploaded.campaign;

    const changedSlide = structuredClone(campaign);
    getSlide(getCopyOption(changedSlide, 0), 0).headline = 'Texto distinto';
    const rejected = await app.inject({
      method: 'PUT',
      url: `/api/campaigns/${campaign.id}`,
      headers: authHeaders({ 'content-type': 'application/json' }),
      payload: changedSlide,
    });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json()).toEqual({ error: 'El brief y los textos quedan fijos al generar imágenes' });

    const captionEdit = structuredClone(campaign);
    getCopyOption(captionEdit, 0).caption = 'Caption corregido';
    const accepted = await app.inject({
      method: 'PUT',
      url: `/api/campaigns/${campaign.id}`,
      headers: authHeaders({ 'content-type': 'application/json' }),
      payload: captionEdit,
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().copyOptions[0].caption).toBe('Caption corregido');
  });

  it('sube un original 4:5 aunque el archivo multipart llegue antes de sus campos y conserva sus bytes', async () => {
    const campaign = await prepareCopy(app, await createCampaign(app));
    const image = await sharp({
      create: { width: 400, height: 500, channels: 4, background: '#8b5cf6' },
    })
      .png()
      .toBuffer();
    const boundary = '----elabela-test-boundary';
    const body = multipartBody(boundary, image, getVariant(campaign, 1).id, 0);

    const response = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaign.id}/assets`,
      headers: authHeaders({ 'content-type': `multipart/form-data; boundary=${boundary}` }),
      payload: body,
    });
    expect(response.statusCode).toBe(201);
    const payload = response.json();
    expect(payload.asset).toMatchObject({ width: 400, height: 500, campaignId: campaign.id });
    expect(payload.campaign.variants[1]?.assetIds[0]).toBe(payload.asset.id);

    const downloaded = await app.inject({
      method: 'GET',
      url: `/api/assets/${payload.asset.id}`,
      headers: authHeaders(),
    });
    expect(downloaded.statusCode).toBe(200);
    expect(downloaded.rawPayload.equals(image)).toBe(true);
    expect(downloaded.headers['cache-control']).toContain('private');
  });

  it('rechaza imágenes cuyo contenido no es 4:5 y no confía en la extensión', async () => {
    const campaign = await prepareCopy(app, await createCampaign(app));
    const image = await sharp({ create: { width: 500, height: 500, channels: 3, background: '#fff' } })
      .jpeg()
      .toBuffer();
    const boundary = '----elabela-square';
    const body = multipartBody(boundary, image, getVariant(campaign, 0).id, 0, 'falsa.png', 'image/png');
    const response = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaign.id}/assets`,
      headers: authHeaders({ 'content-type': `multipart/form-data; boundary=${boundary}` }),
      payload: body,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'La imagen debe tener proporción 4:5' });
  });

  it('no registra un asset cuando la posición solicitada no pertenece a la campaña', async () => {
    const campaign = await prepareCopy(app, await createCampaign(app));
    const image = await sharp({ create: { width: 400, height: 500, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    const boundary = '----elabela-bad-slot';
    const response = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaign.id}/assets`,
      headers: authHeaders({ 'content-type': `multipart/form-data; boundary=${boundary}` }),
      payload: multipartBody(boundary, image, getVariant(campaign, 0).id, 99),
    });
    expect(response.statusCode).toBe(400);

    const bootstrap = await app.inject({ method: 'GET', url: '/api/bootstrap', headers: authHeaders() });
    expect(bootstrap.json().assets).toEqual([]);
  });

  it('mezcla el carrusel final por referencia sin alterar los originales e invalida su aprobación', async () => {
    let campaign = await prepareCopy(app, await createCampaign(app));
    const first = await uploadImage(app, campaign, getVariant(campaign, 0).id, 0, '#8b5cf6');
    campaign = first.campaign;
    const second = await uploadImage(app, campaign, getVariant(campaign, 1).id, 1, '#f0abfc');
    campaign = second.campaign;
    const variantsBefore = structuredClone(campaign.variants);
    campaign.finalAssetIds = [first.asset.id, second.asset.id];

    const saved = await app.inject({
      method: 'PUT',
      url: `/api/campaigns/${campaign.id}`,
      headers: authHeaders({ 'content-type': 'application/json' }),
      payload: campaign,
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().variants).toEqual(variantsBefore);

    const approval = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaign.id}/approve`,
      headers: authHeaders({ 'content-type': 'application/json' }),
      payload: { revision: saved.json().revision },
    });
    expect(approval.statusCode).toBe(200);
    const approved = approval.json<Campaign>();
    expect(approved.approvedRevision).toBe(approved.revision);

    const reordered = await app.inject({
      method: 'PUT',
      url: `/api/campaigns/${campaign.id}`,
      headers: authHeaders({ 'content-type': 'application/json' }),
      payload: { ...approved, finalAssetIds: [...approved.finalAssetIds].reverse() },
    });
    expect(reordered.statusCode).toBe(200);
    expect(reordered.json().approvedRevision).toBeNull();
    expect(reordered.json().variants).toEqual(variantsBefore);
  });

  it('rechaza rutas de assets manipuladas que escapan del directorio local', async () => {
    const campaign = await prepareCopy(app, await createCampaign(app));
    const uploaded = await uploadImage(app, campaign, getVariant(campaign, 0).id, 0, '#8b5cf6');
    const statePath = join(root, '.local', 'state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.assetPaths[uploaded.asset.id].original = '../../outside.png';
    await writeFile(statePath, JSON.stringify(state));
    await app.close();
    app = await buildApp({ root, token: TOKEN, allowedOrigins: [ORIGIN] });

    const response = await app.inject({
      method: 'GET',
      url: `/api/assets/${uploaded.asset.id}`,
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Ruta de asset no autorizada' });
  });

  it('rechaza escribir imágenes si contenido es un junction que sale del root real', async () => {
    const campaign = await prepareCopy(app, await createCampaign(app));
    const outside = await mkdtemp(join(tmpdir(), 'elabela-outside-write-'));
    extraRoots.push(outside);
    await symlink(outside, join(root, 'contenido'), 'junction');
    const image = await sharp({ create: { width: 400, height: 500, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    const boundary = '----elabela-junction-write';
    const response = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaign.id}/assets`,
      headers: authHeaders({ 'content-type': `multipart/form-data; boundary=${boundary}` }),
      payload: multipartBody(boundary, image, getVariant(campaign, 0).id, 0),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Ruta de asset no autorizada' });
  });

  it('rechaza leer assets si contenido resuelve mediante junction fuera del root real', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'elabela-outside-read-'));
    extraRoots.push(outside);
    const image = await sharp({ create: { width: 400, height: 500, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    await writeFile(join(outside, 'outside.png'), image);
    await symlink(outside, join(root, 'contenido'), 'junction');
    const statePath = join(root, '.local', 'state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    state.assets.push({
      id: 'outside-asset',
      filename: 'outside.png',
      mime: 'image/png',
      width: 400,
      height: 500,
      bytes: image.length,
      createdAt: new Date().toISOString(),
      role: 'imported',
    });
    state.assetPaths['outside-asset'] = {
      original: 'contenido/outside.png',
      preview: 'contenido/outside.png',
    };
    await writeFile(statePath, JSON.stringify(state));
    await app.close();
    app = await buildApp({ root, token: TOKEN, allowedOrigins: [ORIGIN] });

    const response = await app.inject({
      method: 'GET',
      url: '/api/assets/outside-asset',
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'Ruta de asset no autorizada' });
  });

  it('revierte el estado en memoria cuando falla el rename atómico', async () => {
    const statePath = join(root, '.local', 'state.json');
    await rm(statePath);
    await mkdir(statePath);
    const response = await app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: authHeaders({ 'content-type': 'application/json' }),
      payload: {
        title: 'No debe quedar',
        trendId: 'trend-1',
        productIds: [],
        language: 'es',
        slideCount: 2,
        variantCount: 3,
      },
    });
    expect(response.statusCode).toBe(500);
    const bootstrap = await app.inject({ method: 'GET', url: '/api/bootstrap', headers: authHeaders() });
    expect(bootstrap.json().campaigns).toEqual([]);
  });

  it('rechaza importar imágenes antes de aprobar el texto que se renderizará', async () => {
    const campaign = await createCampaign(app);
    const image = await sharp({ create: { width: 400, height: 500, channels: 3, background: '#fff' } })
      .png()
      .toBuffer();
    const boundary = '----elabela-no-copy';
    const response = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaign.id}/assets`,
      headers: authHeaders({ 'content-type': `multipart/form-data; boundary=${boundary}` }),
      payload: multipartBody(boundary, image, getVariant(campaign, 0).id, 0),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Debe aprobar el texto antes de agregar imágenes' });
  });
});

async function createCampaign(app: FastifyInstance): Promise<Campaign> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: authHeaders({ 'content-type': 'application/json' }),
    payload: {
      title: 'Campaña de prueba',
      trendId: 'trend-1',
      productIds: ['17'],
      language: 'es',
      slideCount: 2,
      variantCount: 3,
    },
  });
  return response.json<Campaign>();
}

function getVariant(campaign: Campaign, index: number): Campaign['variants'][number] {
  const variant = campaign.variants[index];
  if (!variant) throw new Error(`Falta la variante ${index}`);
  return variant;
}

function getCopyOption(campaign: Campaign, index: number): Campaign['copyOptions'][number] {
  const option = campaign.copyOptions[index];
  if (!option) throw new Error(`Falta la opción de texto ${index}`);
  return option;
}

function getSlide(
  option: Campaign['copyOptions'][number],
  index: number,
): Campaign['copyOptions'][number]['slides'][number] {
  const slide = option.slides[index];
  if (!slide) throw new Error(`Falta el texto de pieza ${index}`);
  return slide;
}

async function prepareCopy(app: FastifyInstance, campaign: Campaign): Promise<Campaign> {
  const prepared: Campaign = {
    ...campaign,
    copyOptions: [
      {
        id: 'copy-1',
        title: 'Texto de prueba',
        slides: Array.from({ length: campaign.slideCount }, (_, index) => ({
          headline: `Pieza ${index + 1}`,
          body: 'Texto aprobado',
        })),
        caption: 'Caption de prueba',
      },
    ],
    selectedCopyId: 'copy-1',
    copyApproved: true,
  };
  const response = await app.inject({
    method: 'PUT',
    url: `/api/campaigns/${campaign.id}`,
    headers: authHeaders({ 'content-type': 'application/json' }),
    payload: prepared,
  });
  expect(response.statusCode).toBe(200);
  return response.json<Campaign>();
}

async function uploadImage(
  app: FastifyInstance,
  campaign: Campaign,
  variantId: string,
  slot: number,
  color: string,
) {
  const image = await sharp({ create: { width: 400, height: 500, channels: 4, background: color } })
    .png()
    .toBuffer();
  const boundary = `----elabela-${variantId}-${slot}`;
  const response = await app.inject({
    method: 'POST',
    url: `/api/campaigns/${campaign.id}/assets`,
    headers: authHeaders({ 'content-type': `multipart/form-data; boundary=${boundary}` }),
    payload: multipartBody(boundary, image, variantId, slot),
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

function multipartBody(
  boundary: string,
  file: Buffer,
  variantId: string,
  slot: number,
  filename = 'original.png',
  mime = 'image/png',
): Buffer {
  const chunks = [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
    ),
    file,
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="slot"\r\n\r\n${slot}`),
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="variantId"\r\n\r\n${variantId}`),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ];
  return Buffer.concat(chunks);
}
