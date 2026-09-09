import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, expect, it, vi } from 'vitest';
import { createCodexResearch } from './codex-research.js';
import {
  type CodexResult,
  codexArguments,
  codexEnvironment,
  collectCodexEvent,
  resolveCodexExecutable,
} from './codex-runner.js';
import { extractSourceImages, sourceImages, sourcePreview } from './codex-sources.js';
import { Store } from './store.js';

const roots: string[] = [];
it('finds the bundled Windows CLI when launched outside the Codex-injected PATH', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-discovery-'));
  roots.push(root);
  const directory = join(root, 'OpenAI', 'Codex', 'bin', 'test-version');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'codex.exe'), 'fixture only');
  vi.stubEnv('LOCALAPPDATA', root);
  vi.stubEnv('ELABELA_CODEX_PATH', '');
  expect(await resolveCodexExecutable('win32')).toBe(join(directory, 'codex.exe'));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const source = 'https://business.pinterest.com/pinterest-predicts/2026/gimme-gummy/';
const imageUrl = 'https://images.ctfassets.net/example/Gummy.jpg?fm=webp&q=85';
const idea = {
  title: 'Brillo con textura',
  summary: 'Referencia de acabado brillante',
  rationale: 'Un carrusel de texturas de maquillaje',
  category: 'Belleza',
  format: 'Carrusel',
  evidence: 'annual',
  sourceUrl: source,
  sourceName: 'Pinterest Predicts',
  publishedAt: null,
  region: 'Global; validar respuesta local',
  suggestedSlides: 3,
  productIds: ['inexistente'],
  palette: ['#b4a1df'],
  keywords: ['gloss'],
};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'elabela-codex-'));
  roots.push(root);
  await mkdir(join(root, 'data'), { recursive: true });
  await writeFile(join(root, 'data/trends.json'), '[]');
  const store = new Store(root);
  await store.init();
  return { root, store };
}
async function finished(store: Store) {
  await vi.waitFor(async () =>
    expect((await store.bootstrap()).jobs.some((job) => job.status === 'running')).toBe(false),
  );
  return (await store.bootstrap()).jobs[0];
}

it('limits Codex to read-only research and removes provider secrets from its environment', () => {
  const args = codexArguments('C:\\private folder\\schema.json');
  expect(args).toContain('read-only');
  expect(args).toContain('--ignore-user-config');
  expect(args).toContain('shell_tool');
  expect(args).toContain('plugins');
  expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
  vi.stubEnv('OPENAI_API_KEY', 'test-only');
  vi.stubEnv('META_ACCESS_TOKEN', 'test-only');
  expect(codexEnvironment().OPENAI_API_KEY).toBeUndefined();
  expect(codexEnvironment().META_ACCESS_TOKEN).toBeUndefined();
});

it('accepts directly opened URLs from actual web events, never model text or keyword queries', () => {
  const result: CodexResult = { text: '', searches: 0, openedUrls: [] };
  collectCodexEvent({ type: 'item.completed', item: { type: 'agent_message', text: source } }, result);
  collectCodexEvent(
    {
      type: 'item.completed',
      item: { type: 'web_search', query: 'site:pinterest.com gummy', action: { type: 'search' } },
    },
    result,
  );
  expect(result.openedUrls).toEqual([]);
  collectCodexEvent(
    { type: 'item.completed', item: { type: 'web_search', query: source, action: { type: 'search' } } },
    result,
  );
  expect(result.openedUrls).toEqual([]);
  collectCodexEvent(
    { type: 'item.completed', item: { type: 'web_search', query: source, action: { type: 'other' } } },
    result,
  );
  expect(result.openedUrls).toEqual([source]);
  expect(result.searches).toBe(3);
});

it('extracts the original page image with either meta attribute order and rejects unreviewed image hosts', () => {
  const html = `<meta content="${imageUrl.replace('&', '&amp;')}" name="og:image"><meta property="og:image" content="https://127.0.0.1/a.jpg">`;
  expect(extractSourceImages(html, source)).toEqual([imageUrl]);
});

it('records independently retrieved page evidence and rejects login/challenge pages', async () => {
  const preview = await sourcePreview(
    source,
    async () =>
      new Response(
        `<title>Gimme Gummy | Pinterest Predicts 2026</title><meta property="og:image" content="${imageUrl}">`,
      ),
  );
  expect(preview?.title).toBe('Gimme Gummy | Pinterest Predicts 2026');
  expect(preview?.imageUrls).toEqual([imageUrl]);
  expect(
    await sourcePreview(source, async () => new Response('<title>Login • Instagram</title>')),
  ).toBeUndefined();
});

it('imports a source independently opened by the service when CLI search events omit result URLs', async () => {
  const { store } = await fixture();
  const verifiedPage = {
    url: source,
    title: 'Gimme Gummy | Pinterest Predicts 2026',
    imageUrls: [],
    checkedAt: new Date().toISOString(),
  };
  const hooks = createCodexResearch({
    available: async () => true,
    runner: async () => ({ text: JSON.stringify({ trends: [idea] }), openedUrls: [], searches: 2 }),
    verifySource: async () => verifiedPage,
  });
  const result = await hooks.searchTrends?.({ query: 'gloss', store });
  expect((await finished(store))?.status).toBe('completed');
  expect((await store.bootstrap()).trends[0]?.sourceUrl).toBe(source);
  const record = JSON.parse(
    await readFile(
      join(
        store.root,
        'investigacion',
        result?.job?.createdAt.slice(0, 10) || '',
        `codex-${result?.job?.id}`,
        'hallazgos.json',
      ),
      'utf8',
    ),
  );
  expect(record.verifiedPages).toEqual([verifiedPage]);
  expect(record.openedUrls).toEqual([]);
});

it('rejects off-domain redirects before a second request and caps streamed page bytes', async () => {
  const redirect = vi.fn(
    async () => new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/private' } }),
  );
  await expect(sourceImages(source, redirect)).rejects.toThrow();
  expect(redirect).toHaveBeenCalledTimes(1);
  const large = vi.fn(async () => new Response('x'.repeat(3 * 1024 * 1024 + 1)));
  expect(await sourceImages(source, large)).toEqual([]);
});

it('persists button research and original references without an API key, preserving favorites on a later search', async () => {
  const { store, root } = await fixture();
  const bytes = await sharp({ create: { width: 400, height: 500, channels: 3, background: '#c3afe1' } })
    .png()
    .toBuffer();
  const runner = vi.fn(async () => ({
    text: JSON.stringify({ trends: [idea] }),
    openedUrls: [source],
    searches: 2,
  }));
  const images = vi.fn(async () => [imageUrl]);
  const hooks = createCodexResearch({
    available: async () => true,
    runner,
    images,
    downloader: async () => bytes,
  });
  const first = await hooks.searchTrends?.({ query: 'gloss', store });
  expect(first?.job?.status).toBe('running');
  expect((await finished(store))?.status).toBe('completed');
  const trend = (await store.bootstrap()).trends[0];
  expect(trend?.platform).toBe('Pinterest');
  expect(trend?.productIds).toEqual([]);
  expect(trend?.references[0]?.assetId).toBeTruthy();
  if (!trend?.references[0]?.assetId) throw new Error('Missing reference');
  expect(await readFile(await store.getAssetPath(trend.references[0].assetId))).toEqual(bytes);
  await store.setTrendSaved(trend.id, true);
  images.mockResolvedValue([]);
  await hooks.searchTrends?.({ query: 'gloss otra vez', store });
  await finished(store);
  const saved = (await store.bootstrap()).trends[0];
  expect(saved?.saved).toBe(true);
  expect(saved?.references).toEqual(trend.references);
  expect(
    await readFile(
      join(
        root,
        'investigacion',
        first?.job?.createdAt.slice(0, 10) || '',
        `codex-${first?.job?.id}`,
        'hallazgos.json',
      ),
      'utf8',
    ),
  ).toContain('codex-local');
});

it('rejects unobserved source URLs and duplicate active requests without retrying the runner', async () => {
  const { store } = await fixture();
  let release: ((value: CodexResult) => void) | undefined;
  const runner = vi.fn(
    () =>
      new Promise<CodexResult>((resolve) => {
        release = resolve;
      }),
  );
  const hooks = createCodexResearch({
    available: async () => true,
    runner,
    verifySource: async () => undefined,
  });
  await hooks.searchTrends?.({ query: 'gloss', store });
  await expect(hooks.searchTrends?.({ query: 'gloss', store })).rejects.toThrow('en curso');
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  release?.({ text: JSON.stringify({ trends: [idea] }), openedUrls: [], searches: 1 });
  expect((await finished(store))?.status).toBe('failed');
  expect(runner).toHaveBeenCalledTimes(1);
  expect((await store.bootstrap()).trends).toEqual([]);
});
