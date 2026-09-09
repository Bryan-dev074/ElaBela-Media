import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { acquireServiceLock } from './service-lock.js';

it('prevents a second service from touching persisted jobs until the first service releases its lock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'elabela-service-lock-'));
  try {
    const release = await acquireServiceLock(root);
    await expect(acquireServiceLock(root)).rejects.toThrow(/ya está abierto/);
    await release();
    const secondRelease = await acquireServiceLock(root);
    await secondRelease();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
