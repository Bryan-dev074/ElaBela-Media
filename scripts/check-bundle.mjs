import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const assets = await readdir('dist/assets');
const entry = assets.find((file) => /^index-.*\.js$/.test(file));
if (!entry) throw new Error('Falta el build del frontend.');
const bytes = gzipSync(await readFile(join('dist/assets', entry))).length;
const budget = 220 * 1024;
console.log(`JavaScript inicial: ${(bytes / 1024).toFixed(1)} KiB gzip / presupuesto ${budget / 1024} KiB.`);
if (bytes > budget) process.exitCode = 1;
