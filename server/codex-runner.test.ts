import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { expect, it, vi } from 'vitest';
import { runCodexResearch } from './codex-runner.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

it('decodes split UTF-8 output without corrupting Spanish and Portuguese characters', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codex-decoder-'));
  try {
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(),
    });
    vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
    const operation = runCodexResearch({
      directory,
      prompt: 'test',
      schema: { type: 'object' },
      timeoutMs: 1000,
    });
    await vi.waitFor(() => expect(spawn).toHaveBeenCalled());
    const web = JSON.stringify({
      type: 'item.completed',
      item: { type: 'web_search', query: 'https://business.pinterest.com/', action: { type: 'other' } },
    });
    const message = JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', text: 'Inspiración de diseño · português' },
    });
    const bytes = Buffer.from(`${web}\n${message}\n`);
    const split = bytes.indexOf(Buffer.from('ó')) + 1;
    child.stdout.write(bytes.subarray(0, split));
    child.stdout.write(bytes.subarray(split));
    child.emit('close', 0);
    expect((await operation).text).toBe('Inspiración de diseño · português');
    expect(spawn).toHaveBeenCalledTimes(1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
