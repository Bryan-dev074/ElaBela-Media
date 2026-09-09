import { randomBytes, randomUUID } from 'node:crypto';
import { access, mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import sharp from 'sharp';
import type {
  Asset,
  Bootstrap,
  Campaign,
  CodexGenerationRequest,
  CreateCampaign,
  Job,
  Product,
  ServiceStatus,
  Trend,
} from '../shared/types.js';
import { codexContentHash, generationProvider, pendingCodexRequest, ServiceError } from './contracts.js';

interface AssetPaths {
  original: string;
  preview: string;
}

interface PersistedState {
  version: 1;
  trends: Trend[];
  campaigns: Campaign[];
  assets: Asset[];
  assetPaths: Record<string, AssetPaths>;
  jobs: Job[];
  allowedOrigins: string[];
}

interface CatalogueFile {
  observedDate?: string;
  items?: Product[];
}

const DEFAULT_ORIGINS = [
  'http://127.0.0.1:4317',
  'http://localhost:4317',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
];

export class Store {
  readonly root: string;
  private readonly localDirectory: string;
  private readonly statePath: string;
  private readonly connectionPath: string;
  private state: PersistedState = emptyState();
  private products: Product[] = [];
  private catalogueObservedAt: string | null = null;
  private connectionToken = '';
  private writeQueue: Promise<void> = Promise.resolve();
  private draining = false;
  private idleWaiters: (() => void)[] = [];

  constructor(root: string) {
    this.root = resolve(root);
    this.localDirectory = join(this.root, '.local');
    this.statePath = join(this.localDirectory, 'state.json');
    this.connectionPath = join(this.localDirectory, 'connection.json');
  }

  async init(initialAllowedOrigins?: string[]): Promise<void> {
    await mkdir(this.localDirectory, { recursive: true });
    this.state = await this.readState(initialAllowedOrigins);
    this.connectionToken = await this.readOrCreateConnectionToken();
    await this.loadCatalogue();
    await this.importSeedTrends();
    await this.attachLocalReferences();
  }

  getToken(): string {
    return this.connectionToken;
  }

  getAllowedOrigins(): string[] {
    return [...this.state.allowedOrigins];
  }

  assertAcceptingWork(): void {
    if (this.draining)
      throw new ServiceError(
        'El servicio se está cerrando. Esperá a que termine el trabajo activo y volvé a iniciarlo.',
        503,
      );
  }

  async beginShutdown(): Promise<{ draining: true; activeJobs: number }> {
    return this.withWrite(async () => {
      this.draining = true;
      return { draining: true, activeJobs: this.activeJobCount() };
    });
  }

  waitForIdle(): Promise<void> {
    if (!this.activeJobCount()) return Promise.resolve();
    return new Promise((resolveIdle) => {
      this.idleWaiters.push(resolveIdle);
    });
  }

  private activeJobCount(): number {
    return this.state.jobs.filter((job) => job.status === 'running' || job.status === 'queued').length;
  }

  async bootstrap(): Promise<Bootstrap> {
    const status: ServiceStatus = {
      connected: true,
      generationProvider: generationProvider(),
      generationConfigured: generationProvider() === 'codex-chat' || Boolean(process.env.OPENAI_API_KEY),
      metaConfigured: await this.hasProtectedMetaToken(),
      catalogueCount: this.products.length,
      catalogueObservedAt: this.catalogueObservedAt,
      allowedOrigins: this.getAllowedOrigins(),
    };
    return {
      trends: structuredClone(this.state.trends),
      campaigns: structuredClone(this.state.campaigns),
      assets: structuredClone(this.state.assets),
      jobs: structuredClone(this.state.jobs),
      status,
    };
  }

  listProducts(options: { q?: string; category?: string; brand?: string; page?: number } = {}) {
    const query = options.q?.trim().toLocaleLowerCase('es') ?? '';
    const filtered = this.products.filter((product) => {
      const matchesQuery =
        !query ||
        product.name.toLocaleLowerCase('es').includes(query) ||
        product.id.toLocaleLowerCase('es').includes(query) ||
        product.brand.toLocaleLowerCase('es').includes(query);
      return (
        matchesQuery &&
        (!options.category || product.category === options.category) &&
        (!options.brand || product.brand === options.brand)
      );
    });
    const page = Math.max(1, options.page ?? 1);
    const offset = (page - 1) * 36;
    return {
      items: structuredClone(filtered.slice(offset, offset + 36)),
      total: filtered.length,
      categories: uniqueSorted(this.products.map((product) => product.category)),
      brands: uniqueSorted(this.products.map((product) => product.brand)),
    };
  }

  getProduct(id: string): Product {
    const product = this.products.find((candidate) => candidate.id === id);
    if (!product) throw new ServiceError('Producto no encontrado', 404);
    return structuredClone(product);
  }

  getCampaign(id: string): Campaign {
    const campaign = this.state.campaigns.find((candidate) => candidate.id === id);
    if (!campaign) throw new ServiceError('Campaña no encontrada', 404);
    return structuredClone(campaign);
  }

  assertCampaignEditable(id: string): void {
    this.assertAcceptingWork();
    const active = this.state.jobs.some(
      (job) =>
        job.campaignId === id &&
        (job.type === 'generate' || job.type === 'publish') &&
        (job.status === 'queued' || job.status === 'running'),
    );
    const campaign = this.state.campaigns.find((candidate) => candidate.id === id);
    const publicationLocked =
      campaign?.publication &&
      ['publishing', 'partial', 'unknown', 'verified'].includes(campaign.publication.status);
    if (active || publicationLocked) throw new ServiceError('La campaña tiene una operación activa', 409);
  }

  async createCampaign(input: CreateCampaign): Promise<Campaign> {
    return this.withWrite(async () => {
      this.assertAcceptingWork();
      this.validateReference(input);
      const now = new Date().toISOString();
      const campaign: Campaign = {
        id: randomUUID(),
        title: input.title,
        trendId: input.trendId,
        referenceId: input.referenceId,
        productIds: [...input.productIds],
        language: input.language,
        slideCount: input.slideCount,
        variantCount: input.variantCount,
        copyOptions: [],
        selectedCopyId: null,
        copyApproved: false,
        variants: Array.from({ length: input.variantCount }, (_, index) => ({
          id: randomUUID(),
          label: `Opción ${index + 1}`,
          assetIds: Array.from({ length: input.slideCount }, () => null),
        })),
        finalAssetIds: [],
        approvedRevision: null,
        revision: 0,
        createdAt: now,
        updatedAt: now,
      };
      this.state.campaigns.push(campaign);
      await this.persist();
      return structuredClone(campaign);
    });
  }

  async saveCampaign(input: Campaign): Promise<Campaign> {
    return this.withWrite(() => this.commitCampaign(input));
  }

  async claimPublication(id: string, revision: number, fingerprint: string, job: Job): Promise<Campaign> {
    return this.withWrite(async () => {
      this.assertCampaignEditable(id);
      const current = this.getCampaign(id);
      this.assertNoPendingCodexRequest(current);
      if (current.revision !== revision || current.approvedRevision !== revision)
        throw new ServiceError('La publicación necesita aprobar esta revisión exacta.', 409);
      const selected = current.copyOptions.find((option) => option.id === current.selectedCopyId);
      if (
        !current.copyApproved ||
        !selected ||
        selected.slides.length !== current.slideCount ||
        !selected.caption.trim() ||
        selected.caption.length > 2200 ||
        current.finalAssetIds.length !== current.slideCount
      )
        throw new ServiceError('El contenido aprobado está incompleto.', 400);
      this.validateFinalAssets(current);
      for (const id of current.finalAssetIds) {
        const asset = this.getAsset(id);
        if (asset.width * 5 !== asset.height * 4)
          throw new ServiceError('La publicación requiere imágenes 4:5.', 400);
      }
      if (
        !fingerprint ||
        job.type !== 'publish' ||
        job.campaignId !== id ||
        !['queued', 'running'].includes(job.status)
      )
        throw new ServiceError('La solicitud de publicación no es válida.', 400);
      if (
        this.state.jobs.some((item) => item.type === 'publish' && ['queued', 'running'].includes(item.status))
      )
        throw new ServiceError('Ya hay una publicación activa.', 409);
      if (
        this.state.campaigns.some(
          (item) => item.publication?.fingerprint === fingerprint && item.publication.status !== 'failed',
        )
      )
        throw new ServiceError(
          'Este contenido ya tiene una publicación registrada. Revisá su estado para evitar duplicados.',
          409,
        );
      const next: Campaign = {
        ...current,
        revision: current.revision + 1,
        approvedRevision: current.revision + 1,
        updatedAt: new Date().toISOString(),
        publication: {
          status: 'publishing',
          fingerprint,
          updatedAt: new Date().toISOString(),
          message: 'Publicación confirmada. Preparando el envío a ambas redes.',
        },
      };
      const index = this.state.campaigns.findIndex((item) => item.id === id);
      this.state.campaigns[index] = next;
      this.state.jobs.push(structuredClone(job));
      await this.persist();
      return structuredClone(next);
    });
  }

  async claimGeneration(id: string, revision: number, job: Job): Promise<Campaign> {
    return this.withWrite(async () => {
      this.assertCampaignEditable(id);
      const current = this.getCampaign(id);
      this.assertNoPendingCodexRequest(current);
      if (current.revision !== revision)
        throw new ServiceError('La campaña cambió antes de iniciar la generación. Revisá sus textos.', 409);
      const copy = current.copyOptions.find((option) => option.id === current.selectedCopyId);
      if (!current.copyApproved || !copy || copy.slides.length !== current.slideCount)
        throw new ServiceError('Aprobá el texto antes de generar.', 400);
      if (job.type !== 'generate' || job.campaignId !== id || !['queued', 'running'].includes(job.status))
        throw new ServiceError('Trabajo de generación inválido.', 400);
      this.state.jobs.push(structuredClone(job));
      await this.persist();
      return structuredClone(current);
    });
  }

  async saveCampaignEditable(input: Campaign): Promise<Campaign> {
    return this.withWrite(async () => {
      this.assertCampaignEditable(input.id);
      return this.commitCampaign(input);
    });
  }

  async approveCampaign(id: string, revision: number): Promise<Campaign> {
    return this.withWrite(async () => {
      this.assertCampaignEditable(id);
      const index = this.state.campaigns.findIndex((candidate) => candidate.id === id);
      if (index < 0) throw new ServiceError('Campaña no encontrada', 404);
      const campaign = this.state.campaigns[index];
      if (!campaign) throw new ServiceError('Campaña no encontrada', 404);
      this.assertNoPendingCodexRequest(campaign);
      if (campaign.revision !== revision) throw new ServiceError('Conflicto de revisión', 409);
      if (!campaign.copyApproved || !campaign.selectedCopyId) {
        throw new ServiceError('El texto seleccionado debe estar aprobado', 400);
      }
      if (!campaign.copyOptions.some((option) => option.id === campaign.selectedCopyId)) {
        throw new ServiceError('El texto seleccionado no pertenece a la campaña', 400);
      }
      if (campaign.finalAssetIds.length !== campaign.slideCount) {
        throw new ServiceError('El carrusel final está incompleto', 400);
      }
      for (const assetId of campaign.finalAssetIds) {
        const asset = this.state.assets.find((candidate) => candidate.id === assetId);
        if (!asset || asset.campaignId !== campaign.id) {
          throw new ServiceError('El carrusel contiene un asset ajeno', 400);
        }
        if (asset.width * 5 !== asset.height * 4) {
          throw new ServiceError('El carrusel contiene una imagen que no es 4:5', 400);
        }
      }
      const approved: Campaign = {
        ...campaign,
        revision: campaign.revision + 1,
        approvedRevision: campaign.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      this.state.campaigns[index] = approved;
      await this.persist();
      return structuredClone(approved);
    });
  }

  async prepareCodexRequest(
    id: string,
    revision: number,
    selection: { variantId?: string; slot?: number },
    prepare: (
      campaign: Campaign,
      targets: CodexGenerationRequest['targets'],
    ) => Promise<CodexGenerationRequest>,
  ): Promise<Campaign> {
    return this.withWrite(async () => {
      this.assertCampaignEditable(id);
      const current = this.getCampaign(id);
      if (current.revision !== revision)
        throw new ServiceError('La campaña cambió. Actualizá la página y revisá el pedido.', 409);
      const copy = current.copyOptions.find((option) => option.id === current.selectedCopyId);
      if (!current.copyApproved || !copy || copy.slides.length !== current.slideCount)
        throw new ServiceError('Elegí y aprobá el texto antes de preparar el pedido.', 400);
      if (current.productIds.length < 1 || current.productIds.length > 8)
        throw new ServiceError('Elegí entre uno y ocho productos para esta campaña.', 400);
      if (!!selection.variantId !== (selection.slot !== undefined))
        throw new ServiceError('Indicá propuesta y pieza para regenerar.', 400);
      const previous = current.codexRequest;
      if (pendingCodexRequest(previous) && previous) {
        const sameSelection = selection.variantId
          ? previous.targets.length === 1 &&
            previous.targets[0]?.variantId === selection.variantId &&
            previous.targets[0]?.slot === selection.slot
          : previous.targets.every((target) => target.originalAssetId === null) &&
            current.variants.every((variant) =>
              variant.assetIds.every(
                (asset, slot) =>
                  asset ||
                  previous.targets.some((target) => target.variantId === variant.id && target.slot === slot),
              ),
            );
        if (!sameSelection || previous.contentHash !== codexContentHash(current))
          throw new ServiceError(
            'Cancelá el pedido pendiente antes de preparar otro contenido o destino.',
            409,
          );
        for (const target of previous.targets) this.assertCodexTarget(current, target);
        return current;
      }
      this.validateReference(current);
      const targets = current.variants
        .flatMap((variant) =>
          variant.assetIds.map((assetId, slot) => ({
            variantId: variant.id,
            slot,
            originalAssetId: assetId,
          })),
        )
        .filter((target) =>
          selection.variantId
            ? target.variantId === selection.variantId && target.slot === selection.slot
            : target.originalAssetId === null,
        );
      if (!targets.length)
        throw new ServiceError('No hay piezas pendientes. Elegí una pieza válida para regenerar.', 400);
      const request = await prepare(current, targets);
      if (
        request.contentHash !== codexContentHash(current) ||
        request.total !== targets.length ||
        request.status !== 'ready'
      )
        throw new ServiceError('El pedido preparado no coincide con la campaña.', 409);
      const next = {
        ...current,
        codexRequest: structuredClone(request),
        revision: current.revision + 1,
        approvedRevision: null,
        updatedAt: new Date().toISOString(),
      };
      this.state.campaigns[this.state.campaigns.findIndex((item) => item.id === id)] = next;
      await this.persist();
      return structuredClone(next);
    });
  }

  async cancelCodexRequest(id: string, requestId: string): Promise<Campaign> {
    return this.withWrite(async () => {
      this.assertCampaignEditable(id);
      const current = this.getCampaign(id);
      if (!current.codexRequest || current.codexRequest.id !== requestId)
        throw new ServiceError('El pedido ya no es el vigente. Actualizá la campaña.', 409);
      if (current.codexRequest.status === 'cancelled') return current;
      if (current.codexRequest.status === 'completed')
        throw new ServiceError('El pedido ya está completado.', 409);
      const next: Campaign = {
        ...current,
        codexRequest: { ...current.codexRequest, status: 'cancelled' },
        revision: current.revision + 1,
        approvedRevision: null,
        updatedAt: new Date().toISOString(),
      };
      this.state.campaigns[this.state.campaigns.findIndex((item) => item.id === id)] = next;
      await this.persist();
      return structuredClone(next);
    });
  }

  async addCodexAsset(
    input: { campaignId: string; requestId: string; variantId: string; slot: number; sha256: string },
    createAsset: (request: CodexGenerationRequest) => Promise<{ asset: Asset; paths: AssetPaths }>,
  ): Promise<{ campaign: Campaign; asset: Asset }> {
    return this.withWrite(async () => {
      this.assertCampaignEditable(input.campaignId);
      const current = this.getCampaign(input.campaignId);
      const request = current.codexRequest;
      if (
        !request ||
        request.id !== input.requestId ||
        request.status === 'cancelled' ||
        request.contentHash !== codexContentHash(current)
      )
        throw new ServiceError('El pedido es obsoleto o está cancelado. Prepará uno vigente.', 409);
      const target = request.targets.find(
        (item) => item.variantId === input.variantId && item.slot === input.slot,
      );
      if (!target) throw new ServiceError('El destino no pertenece a este pedido.', 400);
      this.assertCodexTarget(current, target);
      if (target.assetId) {
        if (target.sha256 !== input.sha256)
          throw new ServiceError(
            'Este destino ya recibió otra imagen. Prepará un nuevo pedido para reemplazarla.',
            409,
          );
        return { campaign: current, asset: this.getAsset(target.assetId) };
      }
      const stored = await createAsset(structuredClone(request));
      if (stored.asset.campaignId !== current.id || stored.asset.width * 5 !== stored.asset.height * 4)
        throw new ServiceError('La imagen debe ser 4:5 y pertenecer a esta campaña.', 400);
      target.assetId = stored.asset.id;
      target.sha256 = input.sha256;
      request.completed = request.targets.filter((item) => item.assetId).length;
      request.status = request.completed === request.total ? 'completed' : 'partial';
      this.state.campaigns[this.state.campaigns.findIndex((item) => item.id === current.id)] = current;
      const result = await this.commitAsset(stored.asset, stored.paths, input);
      if (!result.campaign) throw new ServiceError('Campaña no encontrada', 404);
      return { campaign: result.campaign, asset: result.asset };
    });
  }

  private assertCodexTarget(campaign: Campaign, target: CodexGenerationRequest['targets'][number]): void {
    const variant = campaign.variants.find((item) => item.id === target.variantId);
    if (!variant || variant.assetIds[target.slot] !== (target.assetId ?? target.originalAssetId))
      throw new ServiceError(
        'El destino cambió después de preparar el pedido. Cancelalo y prepará otro.',
        409,
      );
  }

  private assertNoPendingCodexRequest(campaign: Campaign): void {
    if (pendingCodexRequest(campaign.codexRequest))
      throw new ServiceError('Completá o cancelá el pedido de Codex antes de continuar.', 409);
  }

  private validateReference(input: Pick<Campaign, 'trendId' | 'referenceId'>): void {
    if (!input.referenceId) return;
    const trend = this.state.trends.find((item) => item.id === input.trendId);
    if (trend?.visualStatus === 'context' || trend?.visualStatus === 'unavailable')
      throw new ServiceError('Esta idea no tiene una referencia visual disponible para elegir.', 400);
    if (!trend?.references.some((reference) => reference.id === input.referenceId))
      throw new ServiceError('La referencia elegida no pertenece a esta idea.', 400);
  }

  async addAsset(
    asset: Asset,
    paths: AssetPaths,
    placement?: { campaignId: string; variantId: string; slot: number },
  ): Promise<{ campaign?: Campaign; asset: Asset }> {
    return this.withWrite(() => this.commitAsset(asset, paths, placement));
  }

  async addCampaignAsset(
    placement: { campaignId: string; variantId: string; slot: number },
    createAsset: () => Promise<{ asset: Asset; paths: AssetPaths }>,
  ): Promise<{ campaign: Campaign; asset: Asset }> {
    return this.withWrite(async () => {
      this.assertCampaignEditable(placement.campaignId);
      const campaign = this.getCampaign(placement.campaignId);
      if (!campaign.copyApproved || !campaign.selectedCopyId) {
        throw new ServiceError('Debe aprobar el texto antes de agregar imágenes', 400);
      }
      const selected = campaign.copyOptions.find((option) => option.id === campaign.selectedCopyId);
      if (!selected || selected.slides.length !== campaign.slideCount) {
        throw new ServiceError('Debe aprobar el texto antes de agregar imágenes', 400);
      }
      const stored = await createAsset();
      const result = await this.commitAsset(stored.asset, stored.paths, placement);
      if (!result.campaign) throw new ServiceError('Campaña no encontrada', 404);
      return { campaign: result.campaign, asset: result.asset };
    });
  }

  getAsset(id: string): Asset {
    const asset = this.state.assets.find((candidate) => candidate.id === id);
    if (!asset) throw new ServiceError('Asset no encontrado', 404);
    return structuredClone(asset);
  }

  async getAssetPath(id: string, kind: 'original' | 'preview' = 'original'): Promise<string> {
    const paths = this.state.assetPaths[id];
    if (!paths) throw new ServiceError('Asset no encontrado', 404);
    const storedPath = paths[kind];
    if (isAbsolute(storedPath)) throw new ServiceError('Ruta de asset no autorizada', 403);
    const candidate = resolve(this.root, storedPath);
    const allowedDirectories = [join(this.root, 'contenido'), join(this.root, 'data', 'references')];
    if (!allowedDirectories.some((directory) => isPathInside(directory, candidate))) {
      throw new ServiceError('Ruta de asset no autorizada', 403);
    }
    try {
      const resolvedFile = await realpath(candidate);
      const rootReal = await realpath(this.root);
      const resolvedAllowed = await Promise.all(
        allowedDirectories.map(async (directory) => {
          try {
            return await realpath(directory);
          } catch {
            return null;
          }
        }),
      );
      const allowed = resolvedAllowed.filter((directory): directory is string =>
        Boolean(directory && isPathInside(rootReal, directory)),
      );
      if (
        !isPathInside(rootReal, resolvedFile) ||
        !allowed.some((directory) => isPathInside(directory, resolvedFile))
      ) {
        throw new ServiceError('Ruta de asset no autorizada', 403);
      }
      return resolvedFile;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('Asset no encontrado', 404);
    }
  }

  async upsertTrend(trend: Trend): Promise<Trend> {
    return this.withWrite(async () => {
      const index = this.state.trends.findIndex((candidate) => candidate.id === trend.id);
      const current = index >= 0 ? this.state.trends[index] : undefined;
      const next = current ? { ...structuredClone(trend), saved: current.saved } : structuredClone(trend);
      if (index >= 0) this.state.trends[index] = next;
      else this.state.trends.push(next);
      await this.persist();
      return structuredClone(next);
    });
  }

  async setTrendSaved(id: string, saved: boolean): Promise<Trend> {
    return this.withWrite(async () => {
      const index = this.state.trends.findIndex((candidate) => candidate.id === id);
      if (index < 0) throw new ServiceError('Tendencia no encontrada', 404);
      const current = this.state.trends[index];
      if (!current) throw new ServiceError('Tendencia no encontrada', 404);
      this.state.trends[index] = { ...current, saved };
      await this.persist();
      return structuredClone(this.state.trends[index] as Trend);
    });
  }

  async importTrends(trends: Trend[]): Promise<Trend[]> {
    return this.withWrite(async () => {
      const imported: Trend[] = [];
      for (const trend of trends) {
        const index = this.state.trends.findIndex((candidate) => candidate.id === trend.id);
        const current = index >= 0 ? this.state.trends[index] : undefined;
        const next = current ? { ...structuredClone(trend), saved: current.saved } : structuredClone(trend);
        if (index >= 0) this.state.trends[index] = next;
        else this.state.trends.push(next);
        imported.push(structuredClone(next));
      }
      await this.persist();
      return imported;
    });
  }

  async setAllowedOrigins(origins: string[]): Promise<string[]> {
    return this.withWrite(async () => {
      this.state.allowedOrigins = [...origins];
      await this.persist();
      return this.getAllowedOrigins();
    });
  }

  async upsertJob(job: Job): Promise<Job> {
    return this.withWrite(async () => {
      const index = this.state.jobs.findIndex((candidate) => candidate.id === job.id);
      const previous = this.state.jobs[index];
      if (
        ['running', 'queued'].includes(job.status) &&
        (!previous || !['running', 'queued'].includes(previous.status))
      )
        this.assertAcceptingWork();
      if (index >= 0) this.state.jobs[index] = structuredClone(job);
      else this.state.jobs.push(structuredClone(job));
      await this.persist();
      return structuredClone(job);
    });
  }

  private async readState(initialAllowedOrigins?: string[]): Promise<PersistedState> {
    try {
      const parsed = JSON.parse(await readFile(this.statePath, 'utf8')) as Partial<PersistedState>;
      return {
        ...emptyState(),
        ...parsed,
        version: 1,
        assetPaths: parsed.assetPaths ?? {},
        allowedOrigins: parsed.allowedOrigins ?? initialAllowedOrigins ?? DEFAULT_ORIGINS,
      };
    } catch (error) {
      if (!isMissing(error)) throw error;
      const state = emptyState();
      state.allowedOrigins = [...(initialAllowedOrigins ?? DEFAULT_ORIGINS)];
      this.state = state;
      await this.persist();
      return state;
    }
  }

  private async readOrCreateConnectionToken(): Promise<string> {
    try {
      const parsed = JSON.parse(await readFile(this.connectionPath, 'utf8')) as { token?: unknown };
      if (typeof parsed.token === 'string' && parsed.token.length >= 32) return parsed.token;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    const token = randomBytes(32).toString('base64url');
    await atomicJsonWrite(this.connectionPath, { token, createdAt: new Date().toISOString() });
    return token;
  }

  private async loadCatalogue(): Promise<void> {
    const catalogueRoot = join(this.root, 'datos', 'catalogo');
    let files: string[] = [];
    try {
      const dates = await readdir(catalogueRoot, { withFileTypes: true });
      files = dates
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(catalogueRoot, entry.name, 'productos.json'))
        .sort((a, b) => b.localeCompare(a));
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    for (const file of files) {
      try {
        const catalogue = JSON.parse(await readFile(file, 'utf8')) as CatalogueFile;
        if (!Array.isArray(catalogue.items)) continue;
        this.products = catalogue.items;
        this.catalogueObservedAt = catalogue.observedDate ?? catalogue.items[0]?.observedAt ?? null;
        return;
      } catch {
        // Keep looking for the newest valid complete snapshot.
      }
    }
  }

  private async importSeedTrends(): Promise<void> {
    if (this.state.trends.length > 0) return;
    const seedPath = join(this.root, 'data', 'trends.json');
    try {
      const parsed = JSON.parse(await readFile(seedPath, 'utf8')) as Trend[] | { trends?: Trend[] };
      const trends = Array.isArray(parsed) ? parsed : parsed.trends;
      if (trends?.length) {
        this.state.trends = structuredClone(trends);
        await this.persist();
      }
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }

  private async attachLocalReferences(): Promise<void> {
    const referenceDirectory = join(this.root, 'data', 'references');
    let changed = false;
    for (const trend of this.state.trends) {
      for (const reference of trend.references) {
        if (reference.assetId) continue;
        const file = join(referenceDirectory, `${reference.id}.webp`);
        let fileStat: Awaited<ReturnType<typeof stat>>;
        try {
          fileStat = await stat(file);
        } catch (error) {
          if (isMissing(error)) continue;
          throw error;
        }
        const metadata = await sharp(file).metadata();
        if (!metadata.width || !metadata.height) continue;
        const asset: Asset = {
          id: randomUUID(),
          filename: `${reference.id}.webp`,
          mime: 'image/webp',
          width: metadata.width,
          height: metadata.height,
          bytes: fileStat.size,
          createdAt: new Date().toISOString(),
          role: 'reference',
        };
        const relativePath = relative(this.root, file);
        this.state.assets.push(asset);
        this.state.assetPaths[asset.id] = { original: relativePath, preview: relativePath };
        reference.assetId = asset.id;
        changed = true;
      }
    }
    if (changed) await this.persist();
  }

  private async hasProtectedMetaToken(): Promise<boolean> {
    const candidates = [
      join(
        process.env.META_BUSINESS_DIR || 'D:\\ElaBela\\MetaBusiness',
        '.secrets',
        'meta-access-token.protected',
      ),
    ];
    for (const candidate of candidates) {
      try {
        await access(candidate);
        return true;
      } catch {
        // A missing protected token means the integration is not configured.
      }
    }
    return false;
  }

  private async withWrite<T>(operation: () => Promise<T>): Promise<T> {
    let result!: T;
    let failure: unknown;
    const run = this.writeQueue.then(async () => {
      const stateBefore = structuredClone(this.state);
      try {
        result = await operation();
        if (this.draining && !this.activeJobCount()) {
          const waiters = this.idleWaiters.splice(0);
          for (const resolveIdle of waiters) resolveIdle();
        }
      } catch (error) {
        this.state = stateBefore;
        failure = error;
      }
    });
    this.writeQueue = run.catch(() => undefined);
    await run;
    if (failure) throw failure;
    return result;
  }

  private async persist(): Promise<void> {
    await atomicJsonWrite(this.statePath, this.state);
  }

  private async commitAsset(
    asset: Asset,
    paths: AssetPaths,
    placement?: { campaignId: string; variantId: string; slot: number },
  ): Promise<{ campaign?: Campaign; asset: Asset }> {
    if (this.state.assets.some((candidate) => candidate.id === asset.id)) {
      throw new ServiceError('El asset ya existe', 409);
    }
    let campaign: Campaign | undefined;
    if (placement) {
      const campaignIndex = this.state.campaigns.findIndex(
        (candidate) => candidate.id === placement.campaignId,
      );
      if (campaignIndex < 0) throw new ServiceError('Campaña no encontrada', 404);
      const current = this.state.campaigns[campaignIndex];
      if (!current) throw new ServiceError('Campaña no encontrada', 404);
      const variantIndex = current.variants.findIndex((candidate) => candidate.id === placement.variantId);
      if (variantIndex < 0) throw new ServiceError('Variante no encontrada', 400);
      if (placement.slot < 0 || placement.slot >= current.slideCount) {
        throw new ServiceError('Posición de pieza no válida', 400);
      }
      const variants = structuredClone(current.variants);
      const variant = variants[variantIndex];
      if (!variant) throw new ServiceError('Variante no encontrada', 400);
      variant.assetIds[placement.slot] = asset.id;
      campaign = {
        ...current,
        variants,
        revision: current.revision + 1,
        approvedRevision: null,
        updatedAt: new Date().toISOString(),
      };
      this.state.campaigns[campaignIndex] = campaign;
    }
    this.state.assets.push(structuredClone(asset));
    this.state.assetPaths[asset.id] = { ...paths };
    await this.persist();
    return { campaign: campaign ? structuredClone(campaign) : undefined, asset: structuredClone(asset) };
  }

  private async commitCampaign(input: Campaign): Promise<Campaign> {
    const index = this.state.campaigns.findIndex((candidate) => candidate.id === input.id);
    if (index < 0) throw new ServiceError('Campaña no encontrada', 404);
    const current = this.state.campaigns[index];
    if (!current) throw new ServiceError('Campaña no encontrada', 404);
    if (input.revision !== current.revision) throw new ServiceError('Conflicto de revisión', 409);
    if (input.trendId !== current.trendId || input.referenceId !== current.referenceId)
      this.validateReference(input);
    if (pendingCodexRequest(current.codexRequest) && codexContentHash(input) !== codexContentHash(current))
      throw new ServiceError(
        'Cancelá el pedido pendiente antes de cambiar el brief o los textos de imagen.',
        409,
      );
    this.validateFinalAssets(input);

    const approvalChanged = changedApprovalInputs(current, input);
    const next: Campaign = {
      ...structuredClone(input),
      id: current.id,
      createdAt: current.createdAt,
      codexRequest: current.codexRequest,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
      approvedRevision: approvalChanged ? null : current.approvedRevision,
    };
    this.state.campaigns[index] = next;
    await this.persist();
    return structuredClone(next);
  }

  private validateFinalAssets(campaign: Campaign): void {
    if (campaign.finalAssetIds.length > campaign.slideCount) {
      throw new ServiceError('El carrusel final supera la cantidad de piezas', 400);
    }
    for (const assetId of campaign.finalAssetIds) {
      const asset = this.state.assets.find((candidate) => candidate.id === assetId);
      if (!asset || asset.campaignId !== campaign.id) {
        throw new ServiceError('El carrusel contiene un asset ajeno', 400);
      }
    }
  }
}

function emptyState(): PersistedState {
  return {
    version: 1,
    trends: [],
    campaigns: [],
    assets: [],
    assetPaths: {},
    jobs: [],
    allowedOrigins: [...DEFAULT_ORIGINS],
  };
}

async function atomicJsonWrite(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

function changedApprovalInputs(current: Campaign, input: Campaign): boolean {
  return (
    JSON.stringify(current.finalAssetIds) !== JSON.stringify(input.finalAssetIds) ||
    JSON.stringify(current.copyOptions) !== JSON.stringify(input.copyOptions) ||
    current.selectedCopyId !== input.selectedCopyId ||
    current.copyApproved !== input.copyApproved ||
    current.language !== input.language ||
    JSON.stringify(current.productIds) !== JSON.stringify(input.productIds) ||
    current.slideCount !== input.slideCount
  );
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

function isPathInside(parent: string, child: string): boolean {
  const from = resolve(parent).toLocaleLowerCase();
  const to = resolve(child).toLocaleLowerCase();
  return to === from || to.startsWith(`${from}${sep}`);
}
