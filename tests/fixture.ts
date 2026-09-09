import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import sharp from 'sharp';
import { buildApp } from '../server/app.js';
import { createCreativeIntegrations } from '../server/providers.js';
import type { Trend } from '../shared/types.js';

const root = await mkdtemp(join(tmpdir(), 'elabela-e2e-'));
const now = new Date().toISOString();
process.env.META_BUSINESS_DIR = join(root, 'meta-test');
await mkdir(join(root, 'meta-test/.secrets'), { recursive: true });
await writeFile(
  join(root, 'meta-test/.secrets/meta-access-token.protected'),
  'NOT A CREDENTIAL — AUTOMATED TEST FIXTURE',
);
await mkdir(join(root, 'data/references'), { recursive: true });
await mkdir(join(root, 'datos/catalogo/2026-09-09'), { recursive: true });
const palette = [
  '#c4a1d5',
  '#dcc3e6',
  '#a580bc',
  '#acbacf',
  '#d9c9b8',
  '#9d99bb',
  '#dbb5c3',
  '#9dbea7',
  '#cfb3d8',
];
const images: string[] = [];
for (const [index, color] of palette.entries()) {
  const path = join(root, `prueba-${index + 1}.png`);
  const title = Buffer.from(
    `<svg width="800" height="1000"><text x="65" y="440" font-family="sans-serif" font-size="70" fill="#30203f">PRUEBA ${index + 1}</text><text x="65" y="525" font-family="sans-serif" font-size="25" fill="#30203f">Fixture de verificación. No publicar.</text></svg>`,
  );
  await sharp({ create: { width: 800, height: 1000, channels: 4, background: color } })
    .composite([{ input: title }])
    .png()
    .toFile(path);
  images.push(path);
}
await sharp(images[0]).resize(700, 875).webp().toFile(join(root, 'data/references/ref-test.webp'));
const trend: Trend = {
  id: 'trend-test',
  title: 'Brillo que se siente',
  summary: 'Referencia de prueba para comprobar el estudio.',
  rationale: 'Prueba automatizada del flujo de selección.',
  category: 'Labios',
  format: 'Carrusel',
  platform: 'Pinterest',
  evidence: 'editorial',
  sourceUrl: 'https://business.pinterest.com/',
  sourceName: 'Referencia de prueba',
  observedAt: now,
  region: 'Datos de prueba',
  productIds: ['13451'],
  suggestedSlides: 3,
  references: [
    { id: 'ref-test', url: 'https://images.ctfassets.net/test.png', title: 'Referencia de prueba' },
  ],
  saved: false,
  palette: ['#c4a1d5'],
  keywords: ['gloss'],
};
await writeFile(join(root, 'data/trends.json'), JSON.stringify([trend]));
await writeFile(
  join(root, 'datos/catalogo/2026-09-09/productos.json'),
  JSON.stringify({
    observedDate: '2026-09-09',
    items: [
      {
        id: '13451',
        name: 'NYX This Is Milky Gloss',
        brand: 'NYX',
        category: 'Gloss',
        currency: 'USD',
        priceText: '4',
        thumbnailUrl: '/brand/mark.svg',
        productUrl: 'https://www.elabela.com.py/index.php?id_product=13451&controller=product',
        listedInStock: true,
        observedAt: now,
      },
    ],
  }),
);
await mkdir('.local', { recursive: true });
await writeFile('.local/e2e-fixture.json', JSON.stringify({ root, images }));
let publishCalls = 0;
const app = await buildApp({
  root,
  localPort: 5187,
  token: 'elabela-e2e-test-token',
  allowedOrigins: ['http://127.0.0.1:5187'],
  integrations: {
    ...createCreativeIntegrations({ apiKey: '' }),
    publish: async ({ campaign, payload, store }) => {
      if (payload.revision !== campaign.approvedRevision) throw new Error('Approval required');
      publishCalls++;
      const next = await store.saveCampaign({
        ...campaign,
        publication: {
          status: 'verified',
          fingerprint: 'E2E-TEST-ONLY',
          updatedAt: now,
          message: 'PRUEBA AUTOMATIZADA. No se publicó nada en Meta.',
        },
      });
      return { campaign: next };
    },
  },
});
app.get('/test-only/calls', async () => ({ publishCalls }));
await app.register(fastifyStatic, { root: join(process.cwd(), 'dist') });
await app.listen({ host: '127.0.0.1', port: 5187 });
process.on('SIGTERM', () => {
  void app.close().then(() => process.exit(0));
});
process.on('SIGINT', () => {
  void app.close().then(() => process.exit(0));
});
