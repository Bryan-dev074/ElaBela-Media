import { randomUUID } from 'node:crypto';
import { open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { ensureDirectoryInside } from './media.js';

interface Owner {
  pid: number;
  nonce: string;
}
export async function acquireServiceLock(root: string): Promise<() => Promise<void>> {
  const directory = await ensureDirectoryInside(root, ['.local']);
  const path = join(directory, 'service.lock');
  const nonce = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(path, 'wx');
      try {
        await handle.writeFile(JSON.stringify({ pid: process.pid, nonce }));
      } finally {
        await handle.close();
      }
      return async () => {
        try {
          const current = JSON.parse(await readFile(path, 'utf8')) as Owner;
          if (current.pid === process.pid && current.nonce === nonce) await unlink(path);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      let owner: Owner;
      try {
        owner = JSON.parse(await readFile(path, 'utf8')) as Owner;
      } catch {
        throw new Error('El servicio está iniciando o su bloqueo requiere revisión.');
      }
      if (!Number.isSafeInteger(owner.pid) || owner.pid < 1)
        throw new Error('El bloqueo del servicio requiere revisión.');
      try {
        process.kill(owner.pid, 0);
      } catch (probe) {
        if ((probe as NodeJS.ErrnoException).code === 'ESRCH') {
          const latest = JSON.parse(await readFile(path, 'utf8')) as Owner;
          if (latest.pid === owner.pid && latest.nonce === owner.nonce) await unlink(path);
          continue;
        }
        throw probe;
      }
      throw new Error('ElaBela Media ya está abierto para este proyecto.');
    }
  }
  throw new Error('No se pudo reclamar el servicio local.');
}
