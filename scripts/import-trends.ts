import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const input = process.argv[2];
if (!input || input === '--help') {
  console.log(
    'npm run trends:importar -- ruta/hallazgos.json\nImporta hallazgos en el servicio local iniciado. Conserva favoritos.',
  );
} else {
  try {
    const data: unknown = JSON.parse(await readFile(resolve(input), 'utf8'));
    const { token } = JSON.parse(await readFile('.local/connection.json', 'utf8')) as { token: string };
    const response = await fetch('http://127.0.0.1:4317/api/trends/import', {
      method: 'POST',
      signal: AbortSignal.timeout(180000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(Array.isArray(data) ? { trends: data } : data),
    });
    if (!response.ok)
      throw new Error(
        `No se completó la importación (HTTP ${response.status}). Revisá el JSON y el servicio local.`,
      );
    console.log('Hallazgos importados. Abrí el radar para revisarlos.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'No se pudo importar.');
    process.exitCode = 1;
  }
}
