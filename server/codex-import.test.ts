import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { importCodexOutput } from '../scripts/codex-import.js';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(join(tmpdir(), 'elabela-codex-cli-')))
      throw new Error('Unsafe test cleanup');
    await rm(root, { recursive: true, force: true });
  }
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'elabela-codex-cli-'));
  roots.push(root);
  await mkdir(join(root, '.local'));
  await writeFile(join(root, '.local/connection.json'), JSON.stringify({ token: 'test-token' }));
  const file = join(root, 'salida original.png');
  const bytes = Buffer.from('TEST-IMAGE-BYTES — validated by backend');
  await writeFile(file, bytes);
  return { root, file, bytes };
}

test('imports exact original bytes to one named target using local authentication', async () => {
  const { root, file, bytes } = await fixture();
  let called = 0;
  await importCodexOutput(
    { campaign: 'campaign', request: 'request', variant: 'variant', slot: 2, file },
    {
      root,
      fetcher: async (url, options) => {
        called++;
        expect(url).toBe('http://127.0.0.1:4317/api/campaigns/campaign/codex-assets');
        expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer test-token');
        const form = options?.body as FormData;
        expect(form.get('requestId')).toBe('request');
        expect(form.get('variantId')).toBe('variant');
        expect(form.get('slot')).toBe('2');
        expect(Buffer.from(await (form.get('file') as File).arrayBuffer())).toEqual(bytes);
        return Response.json({ asset: { id: 'saved' }, campaign: { id: 'campaign' } });
      },
    },
  );
  expect(called).toBe(1);
  expect(await readFile(file)).toEqual(bytes);
});

test('refuses ambiguous targets and never retries a stale import', async () => {
  const { root, file } = await fixture();
  let called = 0;
  const fetcher: typeof fetch = async () => {
    called++;
    return Response.json({ error: 'El pedido ya no coincide con los textos aprobados.' }, { status: 409 });
  };
  const input = { campaign: 'campaign', request: 'request', variant: 'variant', slot: 0, file };
  await expect(importCodexOutput({ ...input, slot: -1 }, { root, fetcher })).rejects.toThrow(/posición/i);
  expect(called).toBe(0);
  await expect(importCodexOutput(input, { root, fetcher })).rejects.toThrow(/textos aprobados/);
  expect(called).toBe(1);
  expect(await readFile(file)).toBeDefined();
});
