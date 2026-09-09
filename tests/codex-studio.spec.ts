import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import type { Bootstrap, Campaign, CodexGenerationRequest } from '../shared/types';

async function codexStudio(page: Page, initial?: 'partial' | 'completed') {
  const now = new Date().toISOString();
  const fixture = JSON.parse(await readFile('.local/e2e-fixture.json', 'utf8')) as { images: string[] };
  const imagePath = fixture.images[0] || '';
  const image = await readFile(imagePath);
  const mutations: { path: string; method: string; body: unknown }[] = [];
  let campaign: Campaign = {
    id: 'codex-studio-test',
    title: 'CODEX STUDIO PRUEBA',
    trendId: 'test',
    productIds: [],
    language: 'es',
    slideCount: 1,
    variantCount: 3,
    copyOptions: [
      {
        id: 'copy',
        title: 'Texto de prueba',
        caption: 'Descripción aprobada',
        slides: [{ headline: 'PRUEBA', body: 'No publicar' }],
      },
    ],
    selectedCopyId: 'copy',
    copyApproved: true,
    variants: [0, 1, 2].map((index) => ({
      id: `variant-${index}`,
      label: `Propuesta ${index + 1}`,
      assetIds: [index === 0 && initial ? 'image' : null],
    })),
    finalAssetIds: initial ? ['image'] : [],
    approvedRevision: null,
    revision: 4,
    createdAt: now,
    updatedAt: now,
  };
  const makeRequest = (variantId?: string, slot?: number): CodexGenerationRequest => ({
    id: `codex-request-${campaign.revision}`,
    createdAt: now,
    status: 'ready',
    briefPath: 'contenido/PRUEBA/brief.md',
    manifestPath: 'contenido/PRUEBA/manifest.json',
    instruction:
      'Leé contenido/PRUEBA/brief.md y generá las piezas en este chat. Importá los originales del pedido de prueba. No publicar.',
    contentHash: 'test-content-hash',
    total: variantId ? 1 : 3,
    completed: 0,
    targets: campaign.variants
      .filter((variant) => !variantId || variant.id === variantId)
      .map((variant) => ({
        variantId: variant.id,
        slot: slot ?? 0,
        originalAssetId: variant.assetIds[slot ?? 0] ?? null,
      })),
  });
  if (initial) {
    const pending = makeRequest(initial === 'completed' ? 'variant-0' : undefined);
    pending.status = initial;
    pending.completed = 1;
    pending.targets = pending.targets.map((target, index) =>
      index === 0 ? { ...target, assetId: 'image', sha256: 'test-image-hash' } : target,
    );
    campaign.codexRequest = pending;
  }
  await page.addInitScript(() => sessionStorage.setItem('elabela-session', 'codex-ui-test-only'));
  await page.route('**/api/**', async (route) => {
    const { pathname: path } = new URL(route.request().url());
    const method = route.request().method();
    if (path.startsWith('/api/assets/')) return route.fulfill({ contentType: 'image/png', body: image });
    if (method !== 'GET') {
      const multipart = route.request().headers()['content-type']?.startsWith('multipart/form-data');
      const body = multipart ? route.request().postData() : route.request().postDataJSON();
      mutations.push({ path, method, body });
      if (path.endsWith('/generate')) {
        const data = body as { revision: number; variantId?: string; slot?: number };
        if (data.revision !== campaign.revision)
          return route.fulfill({ status: 409, json: { error: 'Conflicto de revisión' } });
        campaign = {
          ...campaign,
          revision: campaign.revision + 1,
          codexRequest: makeRequest(data.variantId, data.slot),
        };
        return route.fulfill({ json: { campaign } });
      }
      if (path.endsWith('/codex-request') && method === 'DELETE' && campaign.codexRequest) {
        expect(body).toEqual({ requestId: campaign.codexRequest.id });
        campaign = {
          ...campaign,
          revision: campaign.revision + 1,
          codexRequest: { ...campaign.codexRequest, status: 'cancelled' },
        };
        return route.fulfill({ json: { campaign } });
      }
      if (path.endsWith('/codex-assets') && campaign.codexRequest) {
        campaign = {
          ...campaign,
          revision: campaign.revision + 1,
          variants: campaign.variants.map((variant, index) =>
            index === 1 ? { ...variant, assetIds: ['image-2'] } : variant,
          ),
          codexRequest: {
            ...campaign.codexRequest,
            status: 'partial',
            completed: 2,
            targets: campaign.codexRequest.targets.map((target, index) =>
              index === 1 ? { ...target, assetId: 'image-2', sha256: 'test-second-hash' } : target,
            ),
          },
        };
        return route.fulfill({ json: { campaign } });
      }
      return route.fulfill({
        status: 400,
        json: { error: 'Acción fuera de la prueba. Ninguna llamada paga o publicación.' },
      });
    }
    const state: Bootstrap = {
      campaigns: [campaign],
      trends: [],
      jobs: [],
      assets: ['image', 'image-2'].map((id) => ({
        id,
        campaignId: campaign.id,
        filename: 'PRUEBA.png',
        mime: 'image/png',
        width: 800,
        height: 1000,
        bytes: image.length,
        role: 'imported',
        createdAt: now,
      })),
      status: {
        connected: true,
        generationProvider: 'codex-chat',
        generationConfigured: false,
        metaConfigured: true,
        catalogueCount: 0,
        catalogueObservedAt: null,
        allowedOrigins: ['http://127.0.0.1:5187'],
      },
    };
    return route.fulfill({
      json: path === '/api/bootstrap' ? state : { items: [], total: 0, categories: [], brands: [] },
    });
  });
  const open = async () => {
    const menu = page.getByRole('button', { name: 'Abrir navegación', exact: true });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole('button', { name: 'Mis campañas', exact: true }).first().click();
    await page.getByRole('button', { name: /CODEX STUDIO PRUEBA/ }).click();
    await expect(page.getByRole('heading', { name: 'CODEX STUDIO PRUEBA' })).toBeVisible();
  };
  await page.goto('/');
  await open();
  return {
    mutations,
    imagePath,
    open,
    get campaign() {
      return campaign;
    },
  };
}

test('prepares a chat request without an API key, preserves revision and reopens without another call', async ({
  page,
}) => {
  const fixture = await codexStudio(page);
  const prepare = page.getByRole('button', { name: 'Preparar 3 propuestas en Codex', exact: true });
  await expect(prepare).toBeEnabled();
  await prepare.click();
  const panel = page.getByRole('dialog', { name: 'Tu pedido para Codex' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Pendiente de generar en el chat');
  await expect(panel).toContainText('0 de 3 imágenes importadas');
  await page.screenshot({ path: '.local/codex-request-desktop.png', animations: 'disabled' });
  expect(fixture.mutations).toEqual([
    { path: '/api/campaigns/codex-studio-test/generate', method: 'POST', body: { revision: 4 } },
  ]);
  await expect(page.locator('.job-progress')).toHaveCount(0);
  await page.keyboard.press('Escape');
  const reopen = page.getByRole('button', { name: 'Ver pedido de Codex', exact: true });
  await expect(reopen).toBeFocused();
  await reopen.click();
  await expect(panel).toBeVisible();
  expect(fixture.mutations).toHaveLength(1);
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await page.locator('.studio-steps button').first().click();
  await expect(page.getByRole('textbox', { name: 'Titular · pieza 1', exact: true })).toBeDisabled();
  await expect(page.getByRole('textbox', { name: 'Descripción del post', exact: true })).toBeEnabled();
});

test('clipboard denial gives a selectable instruction and keeps the mobile panel usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Test browser permission denial without changing the real clipboard.
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new Error('Permission denied');
        },
      },
    }),
  );
  await codexStudio(page, 'partial');
  await page.getByRole('button', { name: 'Ver pedido de Codex', exact: true }).click();
  await page.screenshot({ path: '.local/codex-request-mobile.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Copiar instrucción', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'No se pudo copiar' })).toBeVisible();
  const instruction = page.getByRole('textbox', { name: 'Instrucción para pegar en el chat de Codex' });
  await expect(instruction).toBeFocused();
  expect(
    await instruction.evaluate((element) => {
      const input = element as HTMLTextAreaElement;
      return input.selectionEnd - input.selectionStart === input.value.length;
    }),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual([]);
});

test('partial request survives reload, imports into its target and preserves the chosen final image', async ({
  page,
}) => {
  const fixture = await codexStudio(page, 'partial');
  await page.reload();
  await fixture.open();
  await page.getByRole('button', { name: 'Ver pedido de Codex', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('1 de 3 imágenes importadas');
  await page.keyboard.press('Escape');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importar Propuesta 2, pieza 1', exact: true }).click();
  await (await chooserPromise).setFiles(fixture.imagePath);
  await expect.poll(() => fixture.mutations.length).toBe(1);
  expect(fixture.mutations[0]?.path).toBe('/api/campaigns/codex-studio-test/codex-assets');
  expect(fixture.mutations[0]?.body).toContain('name="requestId"');
  expect(fixture.mutations[0]?.body).toContain('codex-request-4');
  expect(fixture.campaign.finalAssetIds).toEqual(['image']);
  await page.getByRole('button', { name: 'Ver pedido de Codex', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('2 de 3 imágenes importadas');
});

test('cancels acceptance of old outputs and allows preparing another request', async ({ page }) => {
  const fixture = await codexStudio(page, 'partial');
  await page.getByRole('button', { name: 'Ver pedido de Codex', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'no detiene una generación que ya empezaste en el chat',
  );
  await page.getByRole('button', { name: 'Cancelar pedido', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Pedido cancelado');
  expect(fixture.campaign.codexRequest?.status).toBe('cancelled');
  expect(fixture.campaign.finalAssetIds).toEqual(['image']);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Preparar piezas pendientes en Codex', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Pendiente de generar en el chat');
  expect(fixture.mutations.at(-1)?.body).toEqual({ revision: 5 });
});

test('a completed single-piece request allows preparing missing proposals and individual regeneration uses an explicit target', async ({
  page,
}) => {
  const fixture = await codexStudio(page, 'completed');
  await expect(
    page.getByRole('button', { name: 'Preparar piezas pendientes en Codex', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'Preparar reemplazo en Codex para Propuesta 1, pieza 1', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(fixture.mutations.at(-1)?.body).toEqual({ revision: 4, variantId: 'variant-0', slot: 0 });
});

test('pending imports keep composition usable but require completing or cancelling the request before publication', async ({
  page,
}) => {
  const fixture = await codexStudio(page, 'partial');
  await expect(page.getByRole('button', { name: 'Quitar pieza final 1', exact: true })).toBeEnabled();
  await page.locator('.studio-steps button').nth(2).click();
  await expect(page.getByRole('button', { name: 'Revisar y publicar', exact: true })).toBeDisabled();
  await expect(
    page.getByText('Completá o cancelá el pedido de Codex antes de publicar.', { exact: true }),
  ).toBeVisible();
  expect(fixture.mutations).toEqual([]);
});
