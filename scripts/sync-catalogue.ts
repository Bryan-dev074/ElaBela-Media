import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCataloguePage, validateCatalogue } from '../server/catalogue.js';
import { ensureDirectoryInside } from '../server/media.js';

if (process.argv.includes('--help')) {
  console.log(
    'npm run catalogo:actualizar [-- --comprobar]\nConsulta la lista oficial y guarda una captura nueva. --comprobar valida solo la primera página, sin escribir el catálogo.',
  );
} else {
  try {
    const now = new Date().toISOString();
    async function fetchPage(page: number) {
      const response = await fetch(`https://lista.elabela.com.py/?page=${page}`, {
        signal: AbortSignal.timeout(30000),
        headers: { 'User-Agent': 'ElaBela-Media/0.1 (catalogue-sync)' },
      });
      if (!response.ok) throw new Error(`La página ${page} respondió HTTP ${response.status}.`);
      return parseCataloguePage(await response.text(), page, now);
    }
    const first = await fetchPage(1);
    if (first.pages > 500) throw new Error('La cantidad de páginas requiere revisión.');
    if (process.argv.includes('--comprobar')) {
      console.log(
        `Estructura verificada: ${first.items.length} productos en página 1; fuente anuncia ${first.total} productos, ${first.pages} páginas. Sin escribir catálogo.`,
      );
    } else {
      const items = [...first.items];
      for (let page = 2; page <= first.pages; page += 2) {
        const pages = [page, page + 1].filter((value) => value <= first.pages);
        const batch = await Promise.all(pages.map(fetchPage));
        for (const result of batch) {
          if (result.total !== first.total)
            throw new Error('El catálogo cambió durante la captura. Volvé a ejecutar la actualización.');
          items.push(...result.items);
        }
        console.log(`Catálogo: ${items.length}/${first.total}`);
      }
      validateCatalogue(items, first.total);
      const directory = await ensureDirectoryInside(process.cwd(), [
        'datos',
        'catalogo',
        now.replaceAll(':', '-').replace(/\.\d+Z$/, 'Z'),
      ]);
      const output = join(directory, 'productos.json');
      await writeFile(
        output,
        JSON.stringify(
          {
            source: 'https://lista.elabela.com.py/',
            observedDate: now.slice(0, 10),
            advertisedTotal: first.total,
            fetchedPages: first.pages,
            fetchedCount: items.length,
            stockScope: 'Listado como disponible al capturar; no es stock en tiempo real.',
            items,
          },
          null,
          2,
        ),
        { flag: 'wx' },
      );
      console.log(
        `Guardados ${items.length} productos en ${output}\nReiniciá ElaBela Media para cargar esta captura.`,
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'No se pudo actualizar el catálogo.');
    process.exitCode = 1;
  }
}
