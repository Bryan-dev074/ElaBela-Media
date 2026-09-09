import { readFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

interface ImportTarget {
  campaign: string;
  request: string;
  variant: string;
  slot: number;
  file: string;
}

export async function importCodexOutput(
  target: ImportTarget,
  options: { root?: string; fetcher?: typeof fetch } = {},
) {
  const root = resolve(options.root ?? process.cwd());
  if (!Number.isInteger(target.slot) || target.slot < 0 || target.slot > 19)
    throw new Error('La posición debe ser un entero entre 0 y 19.');
  for (const id of [target.campaign, target.request, target.variant]) {
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id)) throw new Error('Falta un identificador válido del pedido.');
  }
  const file = resolve(root, target.file);
  const info = await stat(file);
  if (!info.isFile() || !info.size || info.size > 20 * 1024 * 1024)
    throw new Error('Elegí una imagen original de hasta 20 MB.');
  const bytes = await readFile(file);
  const { token } = JSON.parse(await readFile(join(root, '.local/connection.json'), 'utf8')) as {
    token?: string;
  };
  if (!token) throw new Error('Iniciá el servicio local de este proyecto antes de importar.');
  const form = new FormData();
  form.set('requestId', target.request);
  form.set('variantId', target.variant);
  form.set('slot', String(target.slot));
  form.set('file', new Blob([bytes]), basename(file));
  const response = await (options.fetcher ?? fetch)(
    `http://127.0.0.1:4317/api/campaigns/${encodeURIComponent(target.campaign)}/codex-assets`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(60000),
    },
  );
  if (!response.ok) {
    const result: unknown = await response.json().catch(() => null);
    const message =
      result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
        ? result.error
        : `No se pudo incorporar la imagen (HTTP ${response.status}).`;
    throw new Error(message);
  }
  return response.json() as Promise<{ asset: { id: string }; campaign: { id: string } }>;
}

async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: 'boolean' },
      campaign: { type: 'string' },
      request: { type: 'string' },
      variant: { type: 'string' },
      slot: { type: 'string' },
      file: { type: 'string' },
    },
  });
  if (values.help) {
    console.log(
      'npm run codex:importar -- --campaign ID --request ID --variant ID --slot 0 --file "ruta/imagen.png"\nUsá los IDs del manifest.json del pedido. La posición empieza en 0. Incorpora el original 4:5 sin modificarlo; no genera imágenes ni publica. No reintenta si falla.',
    );
    return;
  }
  if (!values.campaign || !values.request || !values.variant || values.slot === undefined || !values.file)
    throw new Error('Faltan datos. Consultá npm run codex:importar -- --help.');
  const result = await importCodexOutput({
    campaign: values.campaign,
    request: values.request,
    variant: values.variant,
    slot: Number(values.slot),
    file: values.file,
  });
  console.log(
    `Imagen registrada en la campaña ${result.campaign.id}. Asset: ${result.asset.id}. El original se conserva.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'No se pudo incorporar la imagen.');
    process.exitCode = 1;
  });
}
