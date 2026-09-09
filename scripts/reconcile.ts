import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function main(): Promise<void> {
  const campaignId = process.argv[2];
  if (campaignId === '--help' || campaignId === '-h') {
    process.stdout.write(
      'Uso: npm run reconcile -- <campaign-id>\nRequiere el servicio local en http://127.0.0.1:4317. Solo consulta publicaciones existentes en Meta; no reanuda ni repite envíos.\n',
    );
    return;
  }
  if (!campaignId || !/^[a-zA-Z0-9_-]{1,100}$/.test(campaignId))
    throw new Error('Uso: npm run reconcile -- <campaign-id>');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const connection = JSON.parse(await readFile(join(root, '.local', 'connection.json'), 'utf8')) as {
    token?: unknown;
  };
  if (typeof connection.token !== 'string' || connection.token.length < 32)
    throw new Error('Iniciá el servicio local antes de conciliar.');
  const response = await fetch(
    `http://127.0.0.1:4317/api/campaigns/${encodeURIComponent(campaignId)}/reconcile`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${connection.token}`,
        Origin: 'http://127.0.0.1:4317',
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(300_000),
    },
  );
  if (!response.ok)
    throw new Error(
      `La conciliación no se pudo completar (HTTP ${response.status}). Revisá el estado en la interfaz local.`,
    );
  const result = (await response.json()) as { campaign?: { publication?: { status?: string } } };
  const status = result.campaign?.publication?.status;
  process.stdout.write(
    `Consulta terminada: ${['verified', 'partial', 'unknown', 'publishing', 'failed'].includes(status ?? '') ? status : 'requiere revisión'}. Abrí Publicaciones para revisar la evidencia y los enlaces.\n`,
  );
}
main().catch(() => {
  process.stderr.write(
    'No se pudo consultar la campaña. Comprobá el identificador, el servicio local y su configuración. No se repitió ninguna publicación.\n',
  );
  process.exitCode = 1;
});
