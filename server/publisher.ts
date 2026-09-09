import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { access, open, readFile, realpath, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import type { Job, Publication } from '../shared/types.js';
import { type CampaignIntegrationResult, type IntegrationContext, ServiceError } from './contracts.js';
import { ensureDirectoryInside } from './media.js';
import { writeMetaJson } from './meta-files.js';
import type { MetaCheckpoint, MetaPlan, MetaWorker, MetaWorkerRequest } from './meta-types.js';
import type { Store } from './store.js';

export type { MetaWorker } from './meta-types.js';
export interface PublisherOptions {
  pageId?: string;
  instagramBusinessId?: string;
  worker?: MetaWorker;
  metaBusinessDir?: string;
}
const activeRoots = new Set<string>();
const UNCERTAIN_MESSAGE =
  'El resultado requiere conciliación. No se repetirá ningún envío; consultá el estado antes de actuar.';

export function createPublisher(options: PublisherOptions = {}) {
  const metaBusinessDir =
    options.metaBusinessDir ?? process.env.META_BUSINESS_DIR ?? 'D:\\ElaBela\\MetaBusiness';
  const worker = options.worker ?? runMetaWorker;
  return {
    publish: async ({
      campaign,
      payload,
      store,
    }: IntegrationContext<{ revision: number }>): Promise<CampaignIntegrationResult> => {
      const current = store.getCampaign(campaign.id);
      store.assertCampaignEditable(current.id);
      if (payload.revision !== current.revision)
        throw new ServiceError('La revisión cambió. Revisá la campaña otra vez.', 409);
      const copy = current.copyOptions.find((item) => item.id === current.selectedCopyId);
      if (
        current.approvedRevision !== current.revision ||
        !current.copyApproved ||
        !copy ||
        !copy.caption.trim() ||
        copy.caption.length > 2200 ||
        copy.slides.length !== current.slideCount
      )
        throw new ServiceError('Aprobá el texto y la revisión final de la campaña antes de publicar.', 400);
      if (
        current.slideCount < 1 ||
        current.slideCount > 10 ||
        current.finalAssetIds.length !== current.slideCount
      )
        throw new ServiceError('Elegí de 1 a 10 imágenes finales antes de publicar.', 400);
      const pageId = options.pageId ?? process.env.META_PAGE_ID ?? '';
      const instagramBusinessId = options.instagramBusinessId ?? process.env.META_INSTAGRAM_BUSINESS_ID ?? '';
      if (!/^\d+$/.test(pageId) || !/^\d+$/.test(instagramBusinessId))
        throw new ServiceError(
          'Configurá META_PAGE_ID y META_INSTAGRAM_BUSINESS_ID en el archivo .env local.',
          503,
        );
      if (!options.worker) await assertMetaConfigured(metaBusinessDir);
      const release = await acquirePublisherLock(store.root);
      let handedOff = false;
      try {
        const sources = [];
        for (const assetId of current.finalAssetIds) {
          const asset = store.getAsset(assetId);
          if (asset.campaignId !== current.id || asset.width * 5 !== asset.height * 4)
            throw new ServiceError('Las imágenes finales deben pertenecer a esta campaña y ser 4:5.', 400);
          const buffer = await readFile(await store.getAssetPath(assetId));
          const metadata = await sharp(buffer, { failOn: 'error' }).metadata();
          if (
            !metadata.width ||
            !metadata.height ||
            metadata.width * 5 !== metadata.height * 4 ||
            (metadata.pages ?? 1) !== 1 ||
            (metadata.orientation && metadata.orientation !== 1)
          )
            throw new ServiceError('Una imagen final no tiene orientación y dimensiones 4:5 válidas.', 400);
          sources.push({ assetId, buffer, sourceSha256: sha256(buffer) });
        }
        const fingerprint = sha256(
          JSON.stringify({
            pageId,
            instagramBusinessId,
            caption: copy.caption,
            images: sources.map((source) => source.sourceSha256),
          }),
        );
        const now = new Date();
        const job: Job = {
          id: randomUUID(),
          campaignId: current.id,
          type: 'publish',
          status: 'running',
          total: 2,
          completed: 0,
          message: 'Preparando la publicación aprobada en Instagram y Facebook…',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        };
        const directory = await ensureDirectoryInside(store.root, [
          'contenido',
          String(now.getUTCFullYear()),
          String(now.getUTCMonth() + 1).padStart(2, '0'),
          current.id,
          'publicacion',
          job.id,
        ]);
        const staging = await ensureDirectoryInside(store.root, [
          ...relative(store.root, directory).split(sep),
          'staging',
        ]);
        const plan: MetaPlan = {
          version: 1,
          campaignId: current.id,
          revision: current.revision,
          fingerprint,
          kind: sources.length === 1 ? 'image' : 'carousel',
          caption: copy.caption,
          pageId,
          instagramBusinessId,
          images: [],
        };
        for (const [index, source] of sources.entries()) {
          const path = join(staging, `${String(index + 1).padStart(2, '0')}.jpg`);
          const jpeg = await sharp(source.buffer)
            .flatten({ background: '#ffffff' })
            .resize(1080, 1350, { fit: 'inside' })
            .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
            .toBuffer();
          await writeFile(path, jpeg, { flag: 'wx', mode: 0o600 });
          plan.images.push({
            assetId: source.assetId,
            path,
            sourceSha256: source.sourceSha256,
            stageSha256: sha256(jpeg),
          });
        }
        const planPath = join(directory, 'plan.json');
        const statePath = join(directory, 'checkpoint.json');
        await writeMetaJson(planPath, plan);
        await writeMetaJson(statePath, emptyCheckpoint(fingerprint));
        const indexDirectory = await ensureDirectoryInside(store.root, ['.local', 'meta-publications']);
        await writeMetaJson(join(indexDirectory, `${current.id}.json`), {
          planPath: relative(store.root, planPath),
          statePath: relative(store.root, statePath),
          jobId: job.id,
        });
        // Save the recovery pointer first. The store then claims revision, approval, work and fingerprint in one write.
        const claimed = await store.claimPublication(current.id, payload.revision, fingerprint, job);
        const request: MetaWorkerRequest = { mode: 'publish', plan, planPath, statePath, metaBusinessDir };
        handedOff = true;
        setImmediate(() => {
          void completeOperation(store, current.id, job, request, worker)
            .finally(release)
            .catch(() => undefined);
        });
        return { campaign: claimed, job };
      } finally {
        if (!handedOff) await release();
      }
    },
    reconcile: async ({
      campaign,
      payload,
      store,
    }: IntegrationContext<{ revision?: number }>): Promise<CampaignIntegrationResult> => {
      const current = store.getCampaign(campaign.id);
      if (payload.revision !== undefined && payload.revision !== current.revision)
        throw new ServiceError('La revisión cambió. Actualizá la campaña antes de consultar.', 409);
      if (!current.publication)
        throw new ServiceError('Esta campaña todavía no tiene una publicación que conciliar.', 400);
      if (!options.worker) await assertMetaConfigured(metaBusinessDir);
      const release = await acquirePublisherLock(store.root);
      try {
        const recordPath = await confinedPath(
          store.root,
          join('.local', 'meta-publications', `${current.id}.json`),
          '.local',
        );
        const record = JSON.parse(await readFile(recordPath, 'utf8')) as {
          planPath: string;
          statePath: string;
          jobId: string;
        };
        const planPath = await confinedPath(store.root, record.planPath);
        const statePath = await confinedPath(store.root, record.statePath);
        const plan = JSON.parse(await readFile(planPath, 'utf8')) as MetaPlan;
        if (plan.campaignId !== current.id || plan.fingerprint !== current.publication.fingerprint)
          throw new ServiceError('El checkpoint no corresponde a la publicación de esta campaña.', 409);
        const job = (await store.bootstrap()).jobs.find((item) => item.id === record.jobId);
        if (!job) throw new ServiceError('No se encontró el trabajo original de publicación.', 409);
        await completeOperation(
          store,
          current.id,
          job,
          { mode: 'reconcile', plan, planPath, statePath, metaBusinessDir },
          worker,
        );
        return {
          campaign: store.getCampaign(current.id),
          job: (await store.bootstrap()).jobs.find((item) => item.id === job.id),
        };
      } finally {
        await release();
      }
    },
  };
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}
function emptyCheckpoint(fingerprint: string): MetaCheckpoint {
  return { version: 1, fingerprint, attempts: [], items: [], instagram: {}, facebook: {} };
}
async function completeOperation(
  store: Store,
  campaignId: string,
  job: Job,
  request: MetaWorkerRequest,
  worker: MetaWorker,
): Promise<void> {
  let checkpoint = emptyCheckpoint(request.plan.fingerprint);
  try {
    checkpoint = await worker(request);
  } catch {
    try {
      checkpoint = JSON.parse(await readFile(request.statePath, 'utf8')) as MetaCheckpoint;
    } catch {
      /* An uncertain worker must never be retried. */
    }
  }
  const result = assessPublication(request.plan, checkpoint);
  const current = store.getCampaign(campaignId);
  await store.saveCampaign({
    ...current,
    publication: { fingerprint: request.plan.fingerprint, ...result, updatedAt: new Date().toISOString() },
  });
  job.status = result.status === 'verified' ? 'completed' : 'interrupted';
  job.completed = Number(Boolean(result.instagramUrl)) + Number(Boolean(result.facebookUrl));
  job.message = result.message ?? UNCERTAIN_MESSAGE;
  job.updatedAt = new Date().toISOString();
  await store.upsertJob(job);
}

export function assessPublication(
  plan: MetaPlan,
  checkpoint: MetaCheckpoint,
): Omit<Publication, 'fingerprint' | 'updatedAt'> {
  try {
    if (
      checkpoint?.fingerprint !== plan.fingerprint ||
      !Array.isArray(checkpoint.items) ||
      !Array.isArray(checkpoint.attempts) ||
      !checkpoint.instagram ||
      !checkpoint.facebook
    )
      return { status: 'unknown', message: UNCERTAIN_MESSAGE };
    const ig = checkpoint.instagram?.evidence;
    const fb = checkpoint.facebook?.evidence;
    const igUrl = validPermalink(ig?.permalink, 'instagram.com');
    const fbUrl = validPermalink(fb?.permalink, 'facebook.com');
    const children = plan.kind === 'carousel' ? ig?.childIds : [ig?.id];
    const igVerified =
      ig &&
      ig.id === checkpoint.instagram.mediaId &&
      ig.caption === plan.caption &&
      ig.containerStatus === 'PUBLISHED' &&
      ig.mediaType === (plan.kind === 'image' ? 'IMAGE' : 'CAROUSEL_ALBUM') &&
      igUrl &&
      children?.length === plan.images.length &&
      ig.imageChecks?.length === plan.images.length &&
      ig.imageChecks.every(
        (check, index) =>
          check.matched === true &&
          check.mediaId === children[index] &&
          check.stageSha256 === plan.images[index]?.stageSha256,
      );
    const photos = checkpoint.items?.map((item) => item.photoId);
    const fbVerified =
      fb &&
      fb.id === checkpoint.facebook.postId &&
      fb.message === plan.caption &&
      fb.isPublished === true &&
      fbUrl &&
      fb.photoIds?.length === plan.images.length &&
      photos?.length === plan.images.length &&
      fb.photoIds.every((id, index) => id && id === photos[index]);
    return {
      status:
        igVerified && fbVerified
          ? 'verified'
          : checkpoint.instagram?.mediaId || checkpoint.facebook?.postId
            ? 'partial'
            : 'unknown',
      ...(igVerified ? { instagramUrl: igUrl } : {}),
      ...(fbVerified ? { facebookUrl: fbUrl } : {}),
      message:
        igVerified && fbVerified
          ? 'Publicado en Instagram y Facebook. Texto, imágenes en orden y enlaces comprobados mediante consultas de lectura.'
          : UNCERTAIN_MESSAGE,
    };
  } catch {
    return { status: 'unknown', message: UNCERTAIN_MESSAGE };
  }
}
function validPermalink(value: unknown, domain: string): string | undefined {
  if (typeof value !== 'string') return;
  try {
    const url = new URL(value);
    const allowedQuery = [...url.searchParams].every(
      ([key, item]) => domain === 'facebook.com' && ['id', 'story_fbid'].includes(key) && /^\d+$/.test(item),
    );
    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (url.hostname === domain || url.hostname === `www.${domain}`) &&
      url.pathname !== '/' &&
      allowedQuery
    )
      return url.href;
  } catch {
    /* A remote string is not a verified permalink. */
  }
}
async function confinedPath(root: string, path: string, area = 'contenido'): Promise<string> {
  const rootReal = await realpath(root);
  const base = await realpath(join(root, area));
  if (!base.toLowerCase().startsWith(`${rootReal.toLowerCase()}${sep}`))
    throw new ServiceError('El directorio de publicación no pertenece a este proyecto.', 403);
  const resolved = await realpath(resolve(root, path));
  if (!resolved.toLowerCase().startsWith(`${base.toLowerCase()}${sep}`))
    throw new ServiceError('Ruta de checkpoint no autorizada.', 403);
  return resolved;
}
async function assertMetaConfigured(directory: string): Promise<void> {
  if (process.platform !== 'win32')
    throw new ServiceError('El publicador protegido de Meta requiere la cuenta local de Windows.', 503);
  try {
    await Promise.all(
      ['.secrets/meta-access-token.protected', 'lib/meta-api.mjs'].map((path) =>
        access(join(directory, path)),
      ),
    );
  } catch {
    throw new ServiceError(
      'No está disponible el publicador Meta o su token protegido. Revisá META_BUSINESS_DIR y la cuenta de Windows.',
      503,
    );
  }
}
async function acquirePublisherLock(root: string): Promise<() => Promise<void>> {
  const key = (await realpath(root)).toLowerCase();
  if (activeRoots.has(key)) throw new ServiceError('Ya hay una publicación o conciliación activa.', 409);
  activeRoots.add(key);
  let path = '';
  try {
    const directory = await ensureDirectoryInside(root, ['.local']);
    path = join(directory, 'meta-publisher.lock');
    try {
      const previous = JSON.parse(await readFile(path, 'utf8')) as { pid?: number };
      if (typeof previous.pid === 'number' && previous.pid > 0) {
        let alive = true;
        try {
          process.kill(previous.pid, 0);
        } catch (error) {
          alive = !(error && typeof error === 'object' && 'code' in error && error.code === 'ESRCH');
        }
        if (!alive) await unlink(path);
      }
    } catch {
      /* Creation with wx is the authority; never replace an unreadable active lock. */
    }
    const file = await open(path, 'wx', 0o600);
    await file.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
    await file.close();
    return async () => {
      try {
        await unlink(path);
      } finally {
        activeRoots.delete(key);
      }
    };
  } catch {
    activeRoots.delete(key);
    throw new ServiceError('Hay otra publicación activa o un bloqueo local pendiente de revisión.', 409);
  }
}
async function runMetaWorker(request: MetaWorkerRequest): Promise<MetaCheckpoint> {
  const script = fileURLToPath(new URL('../scripts/meta-worker.ps1', import.meta.url));
  const executable = join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      executable,
      [
        '-NoProfile',
        '-NonInteractive',
        '-File',
        script,
        '-Mode',
        request.mode,
        '-PlanFile',
        request.planPath,
        '-StateFile',
        request.statePath,
        '-MetaBusinessDir',
        request.metaBusinessDir,
        '-NodePath',
        process.execPath,
      ],
      {
        shell: false,
        windowsHide: true,
        cwd: dirname(script),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, META_ACCESS_TOKEN: undefined, OPENAI_API_KEY: undefined },
      },
    );
    // No raw subprocess line reaches logs or the browser, even if an external module includes a token in an error.
    child.stdout.resume();
    child.stderr.resume();
    child.on('error', () => reject(new ServiceError(UNCERTAIN_MESSAGE, 502)));
    child.on('exit', (code) =>
      code === 0 ? resolvePromise() : reject(new ServiceError(UNCERTAIN_MESSAGE, 502)),
    );
  });
  return JSON.parse(await readFile(request.statePath, 'utf8')) as MetaCheckpoint;
}
