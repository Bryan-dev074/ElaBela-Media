import { readFile } from 'node:fs/promises';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Campaign, Trend } from '../shared/types.js';
import { importCodexAsset } from './codex-generation.js';
import type { Integrations } from './contracts.js';
import { pendingCodexRequest, ServiceError } from './contracts.js';
import { recoverInterruptedJobs } from './jobs.js';
import { removeStoredImage, type StoredImage, storeCampaignImage } from './media.js';
import { cacheTrendReferences } from './providers.js';
import { Store } from './store.js';

export interface BuildAppOptions {
  root?: string;
  localPort?: number;
  token?: string;
  allowedOrigins?: string[];
  integrations?: Integrations;
  researchStatus?: { researchProvider: 'codex' | 'api'; researchReady: boolean };
  generationStatus?: { generationProvider: 'codex-chat' | 'api'; generationConfigured: boolean };
  recoverJobs?: boolean;
  notFoundHandler?: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
}
export type LocalApp = FastifyInstance & {
  beginShutdown(): Promise<{ draining: true; activeJobs: number }>;
};

const createCampaignSchema = z.object({
  title: z.string().trim().min(1).max(160),
  trendId: z.string().trim().min(1).max(120),
  referenceId: z.string().min(1).max(120).optional(),
  productIds: z.array(z.string().min(1).max(120)).max(100),
  language: z.enum(['es', 'pt']),
  slideCount: z.number().int().min(1).max(20),
  variantCount: z.number().int().min(1).max(3),
});

const referenceSchema = z.object({
  id: z.string().trim().min(1).max(120),
  url: z.string().url().max(2_000).refine(isHttpsUrl, 'La referencia debe usar HTTPS'),
  title: z.string().trim().min(1).max(300),
  assetId: z.string().max(120).optional(),
  sourceUrl: z.string().url().max(2_000).refine(isHttpsUrl, 'La fuente debe usar HTTPS').optional(),
});

const trendSchema = z.object({
  id: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(2_000),
  rationale: z.string().trim().min(1).max(4_000),
  category: z.string().trim().min(1).max(120),
  format: z.string().trim().min(1).max(120),
  platform: z.string().trim().min(1).max(120),
  evidence: z.enum(['recent', 'annual', 'editorial']),
  sourceUrl: z.string().url().max(2_000).refine(isHttpsUrl, 'La fuente debe usar HTTPS'),
  sourceName: z.string().trim().min(1).max(200),
  observedAt: z.string().datetime({ offset: true }),
  publishedAt: z
    .string()
    .max(40)
    .refine(
      (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isFinite(Date.parse(value)),
      'Fecha de publicación no válida',
    )
    .optional(),
  region: z.string().trim().min(1).max(120),
  productIds: z.array(z.string().min(1).max(120)).max(100),
  suggestedSlides: z.number().int().min(1).max(20),
  references: z.array(referenceSchema).max(30),
  visualStatus: z.enum(['example', 'context', 'unavailable']).optional(),
  visualReason: z.string().max(2_000).optional(),
  saved: z.boolean(),
  palette: z.array(z.string().max(80)).max(20),
  keywords: z.array(z.string().max(100)).max(50),
});

const slideCopySchema = z.object({ headline: z.string().max(300), body: z.string().max(2_000) });
const copyOptionSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  slides: z.array(slideCopySchema).max(20),
  caption: z.string().max(10_000),
});
const assetIdSchema = z.string().min(1).max(120);
const variantSchema = z.object({
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(120),
  assetIds: z.array(assetIdSchema.nullable()).max(20),
});
const publicationSchema = z.object({
  status: z.enum(['publishing', 'partial', 'verified', 'unknown', 'failed']),
  fingerprint: z.string().max(500),
  instagramUrl: z.string().url().max(2_000).optional(),
  facebookUrl: z.string().url().max(2_000).optional(),
  message: z.string().max(2_000).optional(),
  updatedAt: z.string().datetime({ offset: true }),
});
const campaignSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().trim().min(1).max(160),
  trendId: z.string().max(120),
  referenceId: z.string().min(1).max(120).optional(),
  productIds: z.array(z.string().min(1).max(120)).max(100),
  language: z.enum(['es', 'pt']),
  slideCount: z.number().int().min(1).max(20),
  variantCount: z.number().int().min(1).max(3),
  copyOptions: z.array(copyOptionSchema).max(20),
  selectedCopyId: assetIdSchema.nullable(),
  copyApproved: z.boolean(),
  variants: z.array(variantSchema).min(1).max(3),
  finalAssetIds: z.array(assetIdSchema).max(20),
  approvedRevision: z.number().int().nonnegative().nullable(),
  revision: z.number().int().nonnegative(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  publication: publicationSchema.optional(),
});

export async function buildApp(options: BuildAppOptions = {}): Promise<LocalApp> {
  const root = options.root ?? process.cwd();
  const localPort = z
    .number()
    .int()
    .min(1)
    .max(65535)
    .parse(options.localPort ?? 4317);
  const store = new Store(root);
  await store.init(options.allowedOrigins);
  if (options.recoverJobs) await recoverInterruptedJobs(store);
  const token = options.token ?? store.getToken();
  let allowedOrigins = options.allowedOrigins ? [...options.allowedOrigins] : store.getAllowedOrigins();
  validateAllowedOrigins(allowedOrigins, localPort);

  // The decorator below supplies the public lifecycle method before this instance is returned.
  const app = Fastify({ logger: false, bodyLimit: 21 * 1024 * 1024 }) as unknown as LocalApp;
  let shutdownScheduled = false;
  app.decorate('beginShutdown', async () => {
    const result = await store.beginShutdown();
    if (!shutdownScheduled) {
      shutdownScheduled = true;
      setImmediate(() => {
        void store
          .waitForIdle()
          .then(() => app.close())
          .catch(() => {
            process.stderr.write('El cierre del servicio requiere revisión. No se forzó ningún proceso.\n');
          });
      });
    }
    return result;
  });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 4 } });

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    if (!isLoopbackHost(request.headers.host, localPort)) {
      throw new ServiceError('Host no autorizado', 403);
    }
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) {
      throw new ServiceError('Origen no autorizado', 403);
    }
    if (origin) {
      reply.header('access-control-allow-origin', origin);
      reply.header('vary', 'Origin');
    }
    if (request.url === '/api/local-connection') {
      if (
        request.method !== 'POST' ||
        origin !== `http://${request.headers.host}` ||
        request.headers['sec-fetch-site'] !== 'same-origin' ||
        request.headers['x-elabela-connect'] !== 'local'
      ) {
        throw new ServiceError('Abrí la página local para conectar automáticamente.', 403);
      }
      store.assertAcceptingWork();
      return;
    }
    if (request.method === 'OPTIONS') return;
    if (request.url === '/api/health') return;
    if (request.headers.authorization !== `Bearer ${token}`) {
      throw new ServiceError('No autorizado', 401);
    }
    if (!['GET', 'HEAD'].includes(request.method) && request.url !== '/api/shutdown')
      store.assertAcceptingWork();
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ServiceError) {
      return reply.status(error.statusCode).send({ error: error.message });
    }
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ error: firstZodMessage(error) });
    }
    if (error && typeof error === 'object' && 'code' in error && error.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.status(413).send({ error: 'La imagen supera el límite de 20 MB' });
    }
    if (
      error &&
      typeof error === 'object' &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      return reply.status(error.statusCode).send({ error: 'Solicitud no válida' });
    }
    return reply.status(500).send({ error: 'Error interno del servicio' });
  });

  app.setNotFoundHandler(
    options.notFoundHandler ??
      (async (_request, reply) => reply.status(404).send({ error: 'Ruta no encontrada' })),
  );

  app.get('/api/health', async () => ({ ready: true }));
  app.post('/api/local-connection', async (_request, reply) =>
    reply.header('cache-control', 'no-store').send({ token }),
  );

  app.options('/api/*', async (request, reply) => {
    if (!request.headers.origin) throw new ServiceError('Origen no autorizado', 403);
    return reply
      .header('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
      .header('access-control-allow-headers', 'authorization,content-type')
      .header('access-control-max-age', '600')
      .status(204)
      .send();
  });

  app.get('/api/bootstrap', async () => {
    const data = await store.bootstrap();
    return { ...data, status: { ...data.status, ...options.researchStatus, ...options.generationStatus } };
  });
  app.post('/api/shutdown', async (_request, reply) => {
    const result = await app.beginShutdown();
    return reply.status(202).send(result);
  });

  app.get('/api/products', async (request) => {
    const query = z
      .object({
        q: z.string().max(200).optional(),
        category: z.string().max(120).optional(),
        brand: z.string().max(120).optional(),
        page: z.coerce.number().int().min(1).optional(),
      })
      .parse(request.query);
    return store.listProducts(query);
  });

  app.get('/api/products/:id', async (request) => {
    const { id } = z.object({ id: z.string().min(1).max(120) }).parse(request.params);
    return store.getProduct(id);
  });

  app.patch('/api/trends/:id', async (request) => {
    const { id } = z.object({ id: z.string().min(1).max(120) }).parse(request.params);
    const { saved } = z.object({ saved: z.boolean() }).parse(request.body);
    return store.setTrendSaved(id, saved);
  });

  app.post('/api/trends/import', async (request) => {
    const body = z.object({ trends: z.array(trendSchema).max(100) }).parse(request.body);
    return cacheTrendReferences(store, body.trends as Trend[]);
  });

  app.post('/api/campaigns', async (request, reply) => {
    const body = createCampaignSchema.parse(request.body);
    const campaign = await store.createCampaign(body);
    return reply.status(201).send(campaign);
  });

  app.put('/api/campaigns/:id', async (request) => {
    const { id } = z.object({ id: z.string().min(1).max(120) }).parse(request.params);
    const submitted = campaignSchema.parse(request.body) as Campaign;
    const current = store.getCampaign(id);
    submitted.referenceId ??= current.referenceId;
    store.assertCampaignEditable(id);
    assertFrozenCreativeInputs(current, submitted);
    const campaign: Campaign = {
      ...submitted,
      variants: resizeVariants(current, submitted.slideCount),
      variantCount: current.variantCount,
      publication: current.publication,
      codexRequest: current.codexRequest,
    };
    if (id !== campaign.id) throw new ServiceError('El ID de campaña no coincide', 400);
    validateCampaignShape(campaign);
    validateCopySelection(campaign);
    return store.saveCampaignEditable(campaign);
  });

  app.post('/api/campaigns/:id/approve', async (request) => {
    const { id } = z.object({ id: z.string().min(1).max(120) }).parse(request.params);
    const { revision } = z.object({ revision: z.number().int().nonnegative() }).parse(request.body);
    return store.approveCampaign(id, revision);
  });

  app.post('/api/campaigns/:id/assets', async (request, reply) => {
    const { id: campaignId } = z.object({ id: z.string().min(1).max(120) }).parse(request.params);
    const currentCampaign = store.getCampaign(campaignId);
    store.assertCampaignEditable(campaignId);
    if (!currentCampaign.copyApproved) {
      throw new ServiceError('Debe aprobar el texto antes de agregar imágenes', 400);
    }
    validateCopySelection(currentCampaign);
    let image: Buffer | undefined;
    const fields: Record<string, string> = {};
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== 'file' || image) throw new ServiceError('Se admite una sola imagen', 400);
        image = await part.toBuffer();
      } else if (typeof part.value === 'string') {
        fields[part.fieldname] = part.value;
      }
    }
    if (!image) throw new ServiceError('Falta la imagen', 400);
    const placement = z
      .object({ variantId: z.string().min(1).max(120), slot: z.coerce.number().int().min(0) })
      .parse(fields);
    if (!currentCampaign.variants.some((variant) => variant.id === placement.variantId)) {
      throw new ServiceError('Variante no encontrada', 400);
    }
    if (placement.slot >= currentCampaign.slideCount) {
      throw new ServiceError('Posición de pieza no válida', 400);
    }
    let stored: StoredImage | undefined;
    try {
      const result = await store.addCampaignAsset({ campaignId, ...placement }, async () => {
        stored = await storeCampaignImage({ root, campaignId, buffer: image, role: 'imported' });
        return stored;
      });
      return reply.status(201).send(result);
    } catch (error) {
      if (stored) await removeStoredImage(root, stored.paths);
      throw error;
    }
  });

  app.delete('/api/campaigns/:id/codex-request', async (request) => {
    const { id } = z.object({ id: z.string().min(1).max(120) }).parse(request.params);
    const { requestId } = z.object({ requestId: z.string().min(1).max(120) }).parse(request.body);
    return { campaign: await store.cancelCodexRequest(id, requestId) };
  });

  app.post('/api/campaigns/:id/codex-assets', async (request, reply) => {
    const { id: campaignId } = z.object({ id: z.string().min(1).max(120) }).parse(request.params);
    let image: Buffer | undefined;
    const fields: Record<string, string> = {};
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== 'file' || image) throw new ServiceError('Se admite una sola imagen', 400);
        image = await part.toBuffer();
      } else if (typeof part.value === 'string') {
        if (fields[part.fieldname] !== undefined) throw new ServiceError('Campo repetido', 400);
        fields[part.fieldname] = part.value;
      }
    }
    if (!image) throw new ServiceError('Falta la imagen', 400);
    const placement = z
      .object({
        requestId: z.string().min(1).max(120),
        variantId: z.string().min(1).max(120),
        slot: z.coerce.number().int().min(0),
      })
      .strict()
      .parse(fields);
    const result = await importCodexAsset({ store, campaignId, ...placement, buffer: image });
    return reply.status(201).send(result);
  });

  app.get('/api/assets/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1).max(120) }).parse(request.params);
    const query = z.object({ download: z.enum(['1']).optional() }).parse(request.query);
    return sendAsset(store, id, 'original', query.download === '1', reply);
  });

  app.get('/api/assets/:id/preview', async (request, reply) => {
    const { id } = z.object({ id: z.string().min(1).max(120) }).parse(request.params);
    return sendAsset(store, id, 'preview', false, reply);
  });

  app.post('/api/settings', async (request) => {
    if (!isLoopbackAddress(request)) throw new ServiceError('Solo se admite configuración local', 403);
    if (request.headers.origin && !isLocalOrigin(request.headers.origin)) {
      throw new ServiceError('La configuración solo se cambia desde la interfaz local', 403);
    }
    const body = z.object({ allowedOrigins: z.array(z.string()).min(1).max(20) }).parse(request.body);
    validateAllowedOrigins(body.allowedOrigins, localPort);
    allowedOrigins = await store.setAllowedOrigins(body.allowedOrigins);
    return { allowedOrigins };
  });

  app.post('/api/campaigns/:id/copy', async (request) => {
    const campaign = campaignFromRequest(store, request);
    if (!options.integrations?.copy) throw new ServiceError('Proveedor de textos no configurado', 503);
    const payload = z.record(z.string(), z.unknown()).parse(request.body ?? {});
    return options.integrations.copy({ campaign, payload, store });
  });

  app.post('/api/campaigns/:id/generate', async (request) => {
    const campaign = campaignFromRequest(store, request);
    if (!options.integrations?.generate) throw new ServiceError('Proveedor de imágenes no configurado', 503);
    const payload = z
      .object({
        revision: z.number().int().nonnegative(),
        variantId: z.string().min(1).max(120).optional(),
        slot: z.number().int().min(0).optional(),
      })
      .parse(request.body ?? {});
    if (payload.revision !== campaign.revision) throw new ServiceError('Conflicto de revisión', 409);
    return options.integrations.generate({ campaign, payload, store });
  });

  app.post('/api/campaigns/:id/publish', async (request) => {
    const campaign = campaignFromRequest(store, request);
    if (!options.integrations?.publish) throw new ServiceError('Publicador no configurado', 503);
    const payload = z.object({ revision: z.number().int().nonnegative() }).parse(request.body);
    return options.integrations.publish({ campaign, payload, store });
  });

  app.post('/api/trends/search', async (request) => {
    if (!options.integrations?.searchTrends)
      throw new ServiceError('Proveedor de búsqueda no configurado', 503);
    const payload = z
      .object({ query: z.string().trim().min(1).max(500), category: z.string().trim().max(120).optional() })
      .parse(request.body);
    return options.integrations.searchTrends({ ...payload, store });
  });

  app.post('/api/campaigns/:id/reconcile', async (request) => {
    const campaign = campaignFromRequest(store, request);
    if (!options.integrations?.reconcile) throw new ServiceError('Conciliación no configurada', 503);
    const payload = z
      .object({ revision: z.number().int().nonnegative().optional() })
      .parse(request.body ?? {});
    return options.integrations.reconcile({ campaign, payload, store });
  });

  return app;
}

async function sendAsset(
  store: Store,
  id: string,
  kind: 'original' | 'preview',
  download: boolean,
  reply: FastifyReply,
) {
  const asset = store.getAsset(id);
  const path = await store.getAssetPath(id, kind);
  const bytes = await readFile(path);
  reply.header('cache-control', 'private, no-store');
  reply.header('x-content-type-options', 'nosniff');
  reply.type(kind === 'preview' ? 'image/webp' : asset.mime);
  if (download) reply.header('content-disposition', `attachment; filename="${asset.filename}"`);
  return reply.send(bytes);
}

function campaignFromRequest(store: Store, request: FastifyRequest): Campaign {
  const { id } = z.object({ id: z.string().min(1).max(120) }).parse(request.params);
  return store.getCampaign(id);
}

function isLoopbackHost(host: string | undefined, localPort: number): boolean {
  if (!host) return false;
  const match = /^(localhost|127\.0\.0\.1|\[::1\])(?::(\d+))?$/.exec(host);
  return Boolean(match && (!match[2] || [4317, 5173, localPort].includes(Number(match[2]))));
}

function isLoopbackAddress(request: FastifyRequest): boolean {
  const ip = request.ip.replace(/^::ffff:/, '');
  return ip === '127.0.0.1' || ip === '::1';
}

function validateAllowedOrigins(origins: string[], localPort = 4317): void {
  for (const origin of origins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new ServiceError('Origen permitido no válido', 400);
    }
    const localOrigin =
      url.protocol === 'http:' &&
      [4317, 5173, localPort].includes(Number(url.port)) &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]');
    const exactHttps = url.protocol === 'https:';
    if ((!localOrigin && !exactHttps) || url.origin !== origin || origin.includes('*')) {
      throw new ServiceError('Solo se admiten orígenes HTTPS exactos o el desarrollo local', 400);
    }
  }
}

function validateCampaignShape(campaign: Campaign): void {
  if (campaign.variants.length !== campaign.variantCount) {
    throw new ServiceError('La cantidad de variantes no coincide', 400);
  }
  if (campaign.variants.some((variant) => variant.assetIds.length !== campaign.slideCount)) {
    throw new ServiceError('La cantidad de piezas no coincide', 400);
  }
  if (campaign.finalAssetIds.length > campaign.slideCount) {
    throw new ServiceError('El carrusel final supera la cantidad de piezas', 400);
  }
}

function validateCopySelection(campaign: Campaign): void {
  if (!campaign.selectedCopyId) {
    if (campaign.copyApproved) throw new ServiceError('Debe seleccionar un texto antes de aprobarlo', 400);
    return;
  }
  const selected = campaign.copyOptions.find((option) => option.id === campaign.selectedCopyId);
  if (!selected) throw new ServiceError('El texto seleccionado no pertenece a la campaña', 400);
  if (campaign.copyApproved && selected.slides.length !== campaign.slideCount) {
    throw new ServiceError('El texto aprobado debe incluir una opción por pieza', 400);
  }
}

function resizeVariants(current: Campaign, slideCount: number): Campaign['variants'] {
  return current.variants.map((variant) => ({
    ...variant,
    assetIds: Array.from({ length: slideCount }, (_, index) => variant.assetIds[index] ?? null),
  }));
}

function assertFrozenCreativeInputs(current: Campaign, submitted: Campaign): void {
  const hasImages =
    current.variants.some((variant) => variant.assetIds.some(Boolean)) ||
    pendingCodexRequest(current.codexRequest);
  if (!hasImages) return;
  const changed =
    current.trendId !== submitted.trendId ||
    current.referenceId !== submitted.referenceId ||
    current.selectedCopyId !== submitted.selectedCopyId ||
    current.language !== submitted.language ||
    current.slideCount !== submitted.slideCount ||
    current.variantCount !== submitted.variantCount ||
    JSON.stringify(current.productIds) !== JSON.stringify(submitted.productIds) ||
    JSON.stringify(copyShapeWithoutCaptions(current)) !== JSON.stringify(copyShapeWithoutCaptions(submitted));
  if (changed) {
    throw new ServiceError('El brief y los textos quedan fijos al generar imágenes', 409);
  }
}

function copyShapeWithoutCaptions(campaign: Campaign): unknown {
  return campaign.copyOptions.map((option) => ({
    id: option.id,
    title: option.title,
    slides: option.slides,
  }));
}

function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      url.protocol === 'http:' &&
      (url.port === '4317' || url.port === '5173') &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
    );
  } catch {
    return false;
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message || 'Solicitud no válida';
}
