import { randomUUID } from 'node:crypto';
import { rename, writeFile } from 'node:fs/promises';

export async function writeMetaJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
  await rename(temporary, path);
}
