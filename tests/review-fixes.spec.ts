import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import type { Bootstrap, Campaign } from '../shared/types';

async function studioFixture(page: Page) {
  const now = new Date().toISOString();
  let campaign: Campaign = {
    id: 'review-campaign',
    title: 'REVIEW TEST',
    trendId: 'test',
    productIds: [],
    language: 'es',
    slideCount: 1,
    variantCount: 1,
    copyOptions: [
      {
        id: 'copy',
        title: 'Dirección',
        caption: 'Texto confirmado original',
        slides: [{ headline: 'Texto original', body: 'Detalle' }],
      },
    ],
    selectedCopyId: 'copy',
    copyApproved: true,
    variants: [{ id: 'variant', label: 'Opción 1', assetIds: ['image'] }],
    finalAssetIds: ['image'],
    approvedRevision: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  const mutations: { path: string; body: Record<string, unknown> }[] = [];
  let pendingSave: Promise<void> | undefined;
  const fixture = JSON.parse(await readFile('.local/e2e-fixture.json', 'utf8')) as { images: string[] };
  const image = await readFile(fixture.images[0] || '');
  await page.addInitScript(() => sessionStorage.setItem('elabela-session', 'test-session'));
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/api/assets/'))
      return route.fulfill({ status: 200, contentType: 'image/png', body: image });
    if (route.request().method() !== 'GET') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      mutations.push({ path, body });
      if (body.revision !== campaign.revision)
        return route.fulfill({ status: 409, json: { error: 'Conflicto de revisión' } });
      if (path === `/api/campaigns/${campaign.id}`) {
        await pendingSave;
        pendingSave = undefined;
        campaign = { ...campaign, ...body, revision: campaign.revision + 1 } as Campaign;
        return route.fulfill({ json: campaign });
      }
      return route.fulfill({ status: 400, json: { error: 'No publicar en esta prueba' } });
    }
    const state: Bootstrap = {
      campaigns: [campaign],
      assets: [
        {
          id: 'image',
          campaignId: campaign.id,
          filename: 'test.png',
          mime: 'image/png',
          width: 800,
          height: 1000,
          bytes: image.length,
          role: 'imported',
          createdAt: now,
        },
      ],
      trends: [],
      jobs: [],
      status: {
        connected: true,
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
    await page.getByRole('button', { name: 'Mis campañas', exact: true }).first().click();
    await page.getByRole('button', { name: /REVIEW TEST/ }).click();
    await expect(page.getByRole('heading', { name: 'REVIEW TEST' })).toBeVisible();
  };
  await page.goto('/');
  await open();
  return {
    mutations,
    open,
    holdNextSave: () => {
      let release = () => {};
      pendingSave = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
    get campaign() {
      return campaign;
    },
    update: (next: Partial<Campaign>) => {
      campaign = { ...campaign, ...next };
    },
  };
}

test('a new polled revision invalidates the checked publication confirmation', async ({ page }) => {
  await page.clock.install();
  const fixture = await studioFixture(page);
  await page.locator('.studio-steps button').nth(2).click();
  await page.getByRole('button', { name: 'Revisar y publicar', exact: true }).click();
  const checkbox = page.getByRole('checkbox', { name: /Revisé el orden/ });
  await checkbox.check();
  fixture.update({
    revision: 2,
    copyOptions: fixture.campaign.copyOptions.map((copy) => ({
      ...copy,
      caption: 'Texto nuevo durante la revisión',
    })),
  });
  await page.clock.runFor(30001);
  await expect(page.getByLabel('Descripción final de la publicación')).toContainText(
    'Texto nuevo durante la revisión',
  );
  await expect(checkbox).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Publicar ahora', exact: true })).toBeDisabled();
  expect(fixture.mutations).toEqual([]);
});

test('an unsaved caption survives stage navigation, main navigation and reload without approving it', async ({
  page,
}) => {
  page.on('dialog', (dialog) => {
    void dialog.accept();
  });
  const fixture = await studioFixture(page);
  await page.locator('.studio-steps button').first().click();
  await page
    .getByRole('textbox', { name: 'Descripción del post', exact: true })
    .fill('Borrador pendiente que no puede perderse');
  await expect(page.locator('.autosave')).toContainText(/pendiente|navegador/i);
  await page.locator('.studio-steps button').nth(1).click();
  await page.locator('.studio-steps button').first().click();
  await expect(page.getByRole('textbox', { name: 'Descripción del post', exact: true })).toHaveValue(
    'Borrador pendiente que no puede perderse',
  );
  await page.getByRole('button', { name: 'Productos', exact: true }).click();
  await fixture.open();
  await page.locator('.studio-steps button').first().click();
  await expect(page.getByRole('textbox', { name: 'Descripción del post', exact: true })).toHaveValue(
    'Borrador pendiente que no puede perderse',
  );
  await page.reload();
  await fixture.open();
  await page.locator('.studio-steps button').first().click();
  await expect(page.getByRole('textbox', { name: 'Descripción del post', exact: true })).toHaveValue(
    'Borrador pendiente que no puede perderse',
  );
  expect(fixture.mutations).toEqual([]);
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(page.locator('.autosave')).toContainText('Guardado en tu PC');
  expect(fixture.mutations.at(-1)?.body.copyApproved).toBe(false);
  expect(fixture.campaign.copyOptions[0]?.caption).toBe('Borrador pendiente que no puede perderse');
  await expect(page.getByRole('textbox', { name: 'Descripción del post', exact: true })).toBeVisible();
});

test('a stale local caption cannot overwrite newer server text without an explicit decision', async ({
  page,
}) => {
  await page.clock.install();
  const fixture = await studioFixture(page);
  await page.locator('.studio-steps button').first().click();
  await page.getByRole('textbox', { name: 'Descripción del post', exact: true }).fill('Borrador viejo');
  fixture.update({
    revision: 2,
    copyOptions: fixture.campaign.copyOptions.map((copy) => ({
      ...copy,
      caption: 'Texto nuevo guardado en PC',
    })),
  });
  await page.clock.runFor(30001);
  await expect(page.getByText(/cambió en.*PC|versión.*nueva/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar borrador', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Elegir estos textos y continuar', exact: true }),
  ).toBeDisabled();
  expect(fixture.mutations).toEqual([]);
});

test('a pending draft save keeps text controls locked after stage navigation', async ({ page }) => {
  const fixture = await studioFixture(page);
  const release = fixture.holdNextSave();
  const caption = page.getByRole('textbox', { name: 'Descripción del post', exact: true });
  await page.locator('.studio-steps button').first().click();
  await caption.fill('Borrador A guardándose');
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect.poll(() => fixture.mutations.length).toBe(1);
  try {
    await page.locator('.studio-steps button').nth(1).click();
    await page.locator('.studio-steps button').first().click();
    await expect(caption).toBeDisabled();
    await expect(caption).toHaveValue('Borrador A guardándose');
    await expect(page.locator('.autosave')).toContainText('Guardando');
  } finally {
    release();
  }
  await expect(caption).toBeEnabled();
  await expect(caption).toHaveValue('Borrador A guardándose');
  await expect(page.locator('.autosave')).toContainText('Guardado en tu PC');
  expect(fixture.campaign.copyOptions[0]?.caption).toBe('Borrador A guardándose');
});

test('an old draft save cannot clear newer text after leaving and reopening the studio', async ({ page }) => {
  const fixture = await studioFixture(page);
  const release = fixture.holdNextSave();
  const caption = page.getByRole('textbox', { name: 'Descripción del post', exact: true });
  await page.locator('.studio-steps button').first().click();
  await caption.fill('Borrador A guardándose');
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect.poll(() => fixture.mutations.length).toBe(1);
  try {
    await page.getByRole('button', { name: 'Productos', exact: true }).click();
    await fixture.open();
    await page.locator('.studio-steps button').first().click();
    await caption.fill('Borrador B más reciente');
  } finally {
    release();
  }
  await expect.poll(() => fixture.campaign.revision).toBe(2);
  await expect(page.getByText(/cambió en.*PC|versión.*nueva/i)).toBeVisible();
  await expect(caption).toHaveValue('Borrador B más reciente');
  await expect(page.locator('.autosave')).toContainText('Borrador en navegador');
  const persisted = await page.evaluate(() => sessionStorage.getItem('elabela-copy-draft:review-campaign'));
  expect(JSON.parse(persisted || 'null')?.options[0].caption).toBe('Borrador B más reciente');
  expect(fixture.campaign.copyOptions[0]?.caption).toBe('Borrador A guardándose');
});

test('a closed mobile navigation is outside tab order and Escape restores the menu trigger', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => sessionStorage.setItem('elabela-session', 'elabela-e2e-test-token'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tu próxima gran idea está acá.' })).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Abrir navegación' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.sidebar .brand')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Abrir navegación' })).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await page.locator('.sidebar').evaluate((element) => element.contains(document.activeElement))).toBe(
    false,
  );
});
