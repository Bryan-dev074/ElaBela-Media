import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import type { Bootstrap, Campaign, CreateCampaign, Trend } from '../shared/types';

test('visual references exclude reports, keep broken images honest and preserve the selected image in the campaign', async ({
  page,
}) => {
  const image = await sharp({ create: { width: 80, height: 100, channels: 3, background: '#70528b' } })
    .png()
    .toBuffer();
  const now = new Date().toISOString();
  const visual: Trend = {
    id: 'beauty-example',
    title: 'Gloss entre flores',
    summary: 'Composición cosmética de prueba.',
    rationale: 'Referencia visual para labios.',
    category: 'Maquillaje',
    format: 'Carrusel',
    platform: 'Pinterest',
    evidence: 'editorial',
    sourceUrl: 'https://www.pinterest.com/pin/123456789/',
    sourceName: 'Pin de prueba',
    observedAt: now,
    region: 'Prueba',
    productIds: ['gloss'],
    suggestedSlides: 3,
    saved: false,
    palette: ['#70528b'],
    keywords: ['gloss'],
    visualStatus: 'example',
    references: [
      {
        id: 'first',
        url: 'https://i.pinimg.com/test-first.png',
        title: 'Flores rosas',
        sourceUrl: 'https://www.pinterest.com/pin/123456789/',
      },
      {
        id: 'second',
        url: 'https://i.pinimg.com/test-second.png',
        title: 'Textura de gloss',
        sourceUrl: 'https://www.pinterest.com/pin/987654321/',
      },
    ],
  };
  const state: Bootstrap = {
    trends: [
      visual,
      {
        ...visual,
        id: 'context',
        title: 'Informe de belleza',
        visualStatus: 'context',
        visualReason: 'Informe, sin ejemplo visual concreto.',
      },
      {
        ...visual,
        id: 'broken',
        title: 'Referencia no disponible',
        references: [
          { id: 'broken', url: 'https://i.pinimg.com/broken.png', title: 'Imagen no recuperable' },
        ],
      },
    ],
    campaigns: [],
    assets: [],
    jobs: [],
    status: {
      connected: true,
      generationConfigured: false,
      metaConfigured: false,
      catalogueCount: 1,
      catalogueObservedAt: now,
      allowedOrigins: [],
    },
  };
  const submitted: CreateCampaign[] = [];
  await page.addInitScript(() => sessionStorage.setItem('elabela-session', 'visual-test'));
  await page.route('https://i.pinimg.com/**', (route) =>
    route.request().url().endsWith('broken.png')
      ? route.fulfill({ status: 404 })
      : route.fulfill({ contentType: 'image/png', body: image }),
  );
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/bootstrap') return route.fulfill({ json: state });
    if (path === '/api/products')
      return route.fulfill({
        json: {
          items: [
            {
              id: 'gloss',
              name: 'Gloss de prueba',
              brand: 'Prueba',
              category: 'Labios',
              priceText: '',
              currency: 'USD',
              productUrl: 'https://www.elabela.com.py/',
              thumbnailUrl: '/brand/mark.svg',
              listedInStock: true,
              observedAt: now,
            },
          ],
          total: 1,
          categories: ['Labios'],
          brands: ['Prueba'],
        },
      });
    if (path === '/api/campaigns' && route.request().method() === 'POST') {
      const input = route.request().postDataJSON() as CreateCampaign;
      submitted.push(input);
      const campaign: Campaign = {
        ...input,
        id: 'chosen-reference',
        copyOptions: [],
        selectedCopyId: null,
        copyApproved: false,
        variants: [0, 1, 2].map((index) => ({
          id: `v-${index}`,
          label: `Opción ${index + 1}`,
          assetIds: [null, null, null],
        })),
        finalAssetIds: [],
        approvedRevision: null,
        revision: 0,
        createdAt: now,
        updatedAt: now,
      };
      state.campaigns.push(campaign);
      return route.fulfill({ json: campaign });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Referencias visuales', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.trend-card')).toHaveCount(2);
  await expect(page.locator('.trend-card').filter({ hasText: 'Referencia no disponible' })).toContainText(
    'No se pudo cargar esta imagen',
  );
  await page.getByRole('button', { name: 'Todas las ideas', exact: true }).click();
  await expect(page.locator('.trend-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Ver idea: Gloss entre flores', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Elegí una imagen para continuar', exact: true }),
  ).toBeDisabled();
  const enlarge = page.getByRole('button', { name: 'Ampliar referencia: Textura de gloss', exact: true });
  await enlarge.click();
  const preview = page.getByRole('dialog', { name: 'Textura de gloss', exact: true });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Cerrar', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(preview).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Gloss entre flores', exact: true })).toBeVisible();
  await expect(enlarge).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Gloss entre flores', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Ver idea: Gloss entre flores', exact: true }).click();
  await page.getByRole('button', { name: 'Elegir referencia: Textura de gloss', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Elegir referencia: Textura de gloss', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Crear con esta imagen', exact: true }).click();
  await expect(page.getByText('Referencia elegida: Textura de gloss', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar con los textos', exact: true }).click();
  await expect.poll(() => submitted[0]?.referenceId).toBe('second');
  await page.reload();
  await page.getByRole('button', { name: 'Mis campañas', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Referencia para Gloss entre flores' })).toHaveAttribute(
    'src',
    /test-second/,
  );
});
