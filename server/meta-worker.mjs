import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const identifier = (value) =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : undefined;

// Network and persistence are injected at their boundary. Production imports the existing local Graph client.
export async function executeMetaPlan(plan, state, dependencies) {
  const { api, request, saveState, mode } = dependencies;
  if (
    !['publish', 'reconcile'].includes(mode) ||
    state.fingerprint !== plan.fingerprint ||
    !Array.isArray(plan.images) ||
    plan.images.length < 1 ||
    plan.images.length > 10 ||
    plan.kind !== (plan.images.length === 1 ? 'image' : 'carousel')
  )
    throw new Error('Invalid publication plan');
  if (
    digest(
      JSON.stringify({
        pageId: plan.pageId,
        instagramBusinessId: plan.instagramBusinessId,
        caption: plan.caption,
        images: plan.images.map((image) => image.sourceSha256),
      }),
    ) !== plan.fingerprint
  )
    throw new Error('Publication fingerprint mismatch');
  const expected = await Promise.all(
    plan.images.map(async (image) => {
      const buffer = await readFile(image.path);
      if (digest(buffer) !== image.stageSha256) throw new Error('Staging differs from approved plan');
      const metadata = await sharp(buffer).metadata();
      if (metadata.format !== 'jpeg' || metadata.width !== 1080 || metadata.height !== 1350)
        throw new Error('Invalid staging format');
      return buffer;
    }),
  );
  const now = dependencies.now ?? (() => new Date().toISOString());
  const mutation = async (key, operation, apply) => {
    if (mode !== 'publish' || state.attempts.some((item) => item.key === key))
      throw new Error('Mutation cannot be repeated');
    const attempt = { key, status: 'attempting', startedAt: now() };
    state.attempts.push(attempt);
    await saveState(state);
    try {
      const id = identifier(await operation());
      if (!id) throw new Error('Missing mutation identifier');
      attempt.id = id;
      attempt.status = 'succeeded';
      apply(id);
      await saveState(state);
      return id;
    } catch {
      attempt.status = 'unknown';
      await saveState(state);
      throw new Error('Uncertain mutation; no retry');
    }
  };
  if (mode === 'publish') {
    // Persisted work, including a crash before its response, is handled exclusively by GET reconciliation.
    if (state.attempts.length || state.instagram.mediaId || state.facebook.postId)
      throw new Error('Publication already attempted');
    state.items = plan.images.map(() => ({}));
    await saveState(state);
    try {
      for (const [index, image] of plan.images.entries()) {
        const item = state.items[index];
        await mutation(
          `photo-${index}`,
          () => api.uploadFacebookPhoto(image.path),
          (id) => {
            item.photoId = id;
          },
        );
        item.imageUrl = await api.getFacebookImageUrl(item.photoId);
        await saveState(state);
      }
      if (plan.kind === 'image') {
        await mutation(
          'instagram-container',
          async () => {
            const result = await request(`${plan.instagramBusinessId}/media`, {
              method: 'POST',
              params: { image_url: state.items[0].imageUrl, caption: plan.caption },
            });
            return result.id;
          },
          (id) => {
            state.instagram.containerId = id;
          },
        );
      } else {
        for (const [index, item] of state.items.entries()) {
          await mutation(
            `instagram-child-${index}`,
            () => api.createInstagramItem(item.imageUrl),
            (id) => {
              item.containerId = id;
            },
          );
          await api.waitForInstagramContainer(item.containerId);
        }
        await mutation(
          'instagram-container',
          () =>
            api.createInstagramCarousel(
              state.items.map((item) => item.containerId),
              plan.caption,
            ),
          (id) => {
            state.instagram.containerId = id;
          },
        );
      }
      await api.waitForInstagramContainer(state.instagram.containerId);
      await mutation(
        'instagram-publish',
        () => api.publishInstagramCarousel(state.instagram.containerId),
        (id) => {
          state.instagram.mediaId = id;
        },
      );
      await mutation(
        'facebook-publish',
        () =>
          api.publishFacebookCarousel(
            state.items.map((item) => item.photoId),
            plan.caption,
          ),
        (id) => {
          state.facebook.postId = id;
        },
      );
    } catch {
      // All uploads and publishes stop here. Only the GET verification below may run afterward.
    }
  }

  const get = (path, fields, extra = {}) => request(path, { method: 'GET', params: { fields, ...extra } });
  const loadInstagram = async (id) => {
    const media = await get(
      id,
      `id,caption,media_type,permalink,media_url${plan.kind === 'carousel' ? ',children.limit(10){id,media_type,media_url}' : ''}`,
    );
    const container = state.instagram.containerId
      ? await get(state.instagram.containerId, 'status_code')
      : {};
    const children = plan.kind === 'image' ? [media] : (media.children?.data ?? []);
    let matches = [];
    if (
      children.length === plan.images.length &&
      children.every(
        (item) => identifier(item.id) && item.media_type === 'IMAGE' && typeof item.media_url === 'string',
      )
    ) {
      try {
        const downloaded = await Promise.all(
          children.map((item) => (dependencies.fetchImage ?? fetchMetaImage)(item.media_url)),
        );
        matches = await matchImagesInOrder(expected, downloaded);
      } catch {
        /* Missing image evidence keeps the publication unverified. */
      }
    }
    return {
      id: identifier(media.id) ?? '',
      caption: media.caption === plan.caption ? plan.caption : '',
      mediaType: ['IMAGE', 'CAROUSEL_ALBUM'].includes(media.media_type) ? media.media_type : '',
      permalink: safePermalink(media.permalink, 'instagram.com'),
      containerStatus: container.status_code === 'PUBLISHED' ? 'PUBLISHED' : '',
      childIds: plan.kind === 'carousel' ? children.map((item) => identifier(item.id) ?? '') : [],
      imageChecks: children.map((item, index) => ({
        mediaId: identifier(item.id) ?? '',
        stageSha256: plan.images[index]?.stageSha256 ?? '',
        matched: matches[index] === true,
      })),
    };
  };
  const loadFacebook = async (id) => {
    const post = await get(
      id,
      'id,message,is_published,permalink_url,attachments{target,subattachments.limit(10){target}}',
    );
    const attachments = (post.attachments?.data ?? []).flatMap((item) => item.subattachments?.data ?? [item]);
    return {
      id: identifier(post.id) ?? '',
      message: post.message === plan.caption ? plan.caption : '',
      isPublished: post.is_published === true,
      permalink: safePermalink(post.permalink_url, 'facebook.com'),
      photoIds: attachments.map((item) => identifier(item.target?.id) ?? ''),
    };
  };
  const facebookMatches = (evidence) =>
    evidence.id &&
    evidence.message === plan.caption &&
    evidence.isPublished &&
    evidence.permalink &&
    evidence.photoIds.length === plan.images.length &&
    evidence.photoIds.every((id, index) => id && id === state.items[index]?.photoId);
  if (mode === 'reconcile') {
    // Instagram exposes no proven container -> published media mapping here. A recent
    // lookalike (even byte-identical) cannot establish which post answered our lost POST.
    // Keep a missing Instagram ID unknown; only the returned, persisted ID is authoritative.
    const attempt = state.attempts.find((item) => item.key === 'facebook-publish');
    if (!state.facebook.postId && attempt) {
      try {
        const found = await get(`${plan.pageId}/posts`, 'id,message,created_time', { limit: 25 });
        const since = Math.floor(Date.parse(attempt.startedAt) / 1000) * 1000;
        const candidates = (found.data ?? []).filter((item) => {
          const timestamp = Date.parse(item.created_time);
          return (
            identifier(item.id) &&
            item.message === plan.caption &&
            timestamp >= since &&
            timestamp <= since + 10 * 60_000
          );
        });
        const matches = [];
        for (const candidate of candidates) {
          const evidence = await loadFacebook(candidate.id);
          if (facebookMatches(evidence)) matches.push(evidence);
        }
        if (matches.length === 1) {
          state.facebook.postId = matches[0].id;
          await saveState(state);
        }
      } catch {
        /* GET failure leaves the uncertain destination locked. */
      }
    }
  }
  delete state.instagram.evidence;
  delete state.facebook.evidence;
  if (state.instagram.mediaId) {
    try {
      state.instagram.evidence = await loadInstagram(state.instagram.mediaId);
    } catch {
      /* Keep the returned ID, without claiming verification. */
    }
  }
  if (state.facebook.postId) {
    try {
      state.facebook.evidence = await loadFacebook(state.facebook.postId);
    } catch {
      /* Keep each destination independently. */
    }
  }
  await saveState(state);
  return state;
}

// Local pixel evidence detects a changed price or missing small text, which a global
// average over a thumbnail can hide. This verifies an already identified post only.
export async function matchImagesInOrder(expected, actual) {
  if (expected.length !== actual.length) return actual.map(() => false);
  const downsample = async (buffer) => {
    const metadata = await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata();
    if (!metadata.width || !metadata.height || Math.abs(metadata.width / metadata.height - 0.8) > 0.02)
      throw new Error('Unexpected remote image aspect');
    return sharp(buffer, { limitInputPixels: 40_000_000 })
      .flatten({ background: '#fff' })
      .toColourspace('srgb')
      .removeAlpha()
      .resize(1080, 1350, { fit: 'fill' })
      .raw()
      .toBuffer();
  };
  const [sources, targets] = await Promise.all([
    Promise.all(expected.map(downsample)),
    Promise.all(actual.map(downsample)),
  ]);
  const distance = (left, right) => {
    let sum = 0;
    let largestTile = 0;
    let localMismatch = false;
    for (let top = 0; top < 1350; top += 16) {
      for (let start = 0; start < 1080; start += 16) {
        let tileSum = 0;
        let pixels = 0;
        let changed = 0;
        for (let y = top; y < Math.min(top + 16, 1350); y++) {
          for (let x = start; x < Math.min(start + 16, 1080); x++) {
            const offset = (y * 1080 + x) * 3;
            const delta =
              (Math.abs(left[offset] - right[offset]) +
                Math.abs(left[offset + 1] - right[offset + 1]) +
                Math.abs(left[offset + 2] - right[offset + 2])) /
              3;
            tileSum += delta;
            pixels++;
            if (delta > 40) changed++;
          }
        }
        sum += tileSum;
        largestTile = Math.max(largestTile, tileSum / pixels);
        if (changed / pixels > 0.03) localMismatch = true;
      }
    }
    return { mean: sum / (1080 * 1350), largestTile, localMismatch };
  };
  const matches = (comparison) =>
    comparison.mean <= 8 && comparison.largestTile <= 12 && !comparison.localMismatch;
  return targets.map((target, index) => {
    const ownDistance = distance(sources[index], target);
    if (!matches(ownDistance)) return false;
    return sources.every(
      (other, otherIndex) =>
        otherIndex === index ||
        digest(expected[otherIndex]) === digest(expected[index]) ||
        !matches(distance(other, target)),
    );
  });
}
function safePermalink(value, domain) {
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
      [domain, `www.${domain}`].includes(url.hostname) &&
      url.pathname !== '/' &&
      allowedQuery
    )
      return url.href;
  } catch {
    /* Untrusted remote URL. */
  }
  return '';
}
function assertMetaImageUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !['cdninstagram.com', 'fbcdn.net'].some(
      (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
    )
  )
    throw new Error('Unexpected Meta image host');
  return url;
}
async function fetchMetaImage(value) {
  let url = assertMetaImageUrl(value);
  for (let redirects = 0; redirects < 4; redirects++) {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
    if (response.status >= 300 && response.status < 400) {
      url = assertMetaImageUrl(new URL(response.headers.get('location'), url).href);
      await response.body?.cancel();
      continue;
    }
    if (!response.ok || !response.body || Number(response.headers.get('content-length')) > 12 * 1024 * 1024) {
      await response.body?.cancel();
      throw new Error('Remote image unavailable');
    }
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > 12 * 1024 * 1024) throw new Error('Remote image exceeds limit');
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  throw new Error('Too many image redirects');
}
async function persistCheckpoint(path, state) {
  const history = join(dirname(path), 'checkpoints');
  await mkdir(history, { recursive: true });
  const snapshot = JSON.stringify(state, null, 2);
  await writeFile(join(history, `${Date.now()}-${randomUUID()}.json`), snapshot, { flag: 'wx', mode: 0o600 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, snapshot, { flag: 'wx', mode: 0o600 });
  await rename(temporary, path);
}
async function main() {
  const argument = (name) => process.argv[process.argv.indexOf(name) + 1];
  const planPath = await realpath(argument('--plan'));
  const statePath = await realpath(argument('--state'));
  if (dirname(planPath) !== dirname(statePath)) throw new Error('Checkpoint directory mismatch');
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  const staging = await realpath(join(dirname(planPath), 'staging'));
  for (const image of plan.images) {
    const imagePath = await realpath(image.path);
    if (!imagePath.toLowerCase().startsWith(`${staging.toLowerCase()}${sep}`))
      throw new Error('Image outside staging');
  }
  const businessDirectory = resolve(argument('--meta-dir'));
  const { createMetaApi, getPageToken, graphRequest } = await import(
    pathToFileURL(join(businessDirectory, 'lib', 'meta-api.mjs')).href
  );
  if (!process.env.META_ACCESS_TOKEN) throw new Error('Protected credential unavailable');
  const fetchImpl = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(120_000) });
  const token = await getPageToken(plan.pageId, process.env.META_ACCESS_TOKEN, { fetchImpl });
  const api = createMetaApi(plan, token, { fetchImpl });
  const request = (path, options) => graphRequest(path, options, token, { fetchImpl });
  await executeMetaPlan(plan, state, {
    mode: argument('--mode'),
    api,
    request,
    saveState: (next) => persistCheckpoint(statePath, next),
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch {
    // Never print the caught object, stack, Graph URL or raw response: any of them may contain a credential.
    process.stderr.write('META_WORKER_UNCERTAIN: consultá el checkpoint; no se repitió ninguna mutación.\n');
    process.exitCode = 1;
  } finally {
    delete process.env.META_ACCESS_TOKEN;
  }
}
