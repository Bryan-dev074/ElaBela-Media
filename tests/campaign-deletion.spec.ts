import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Bootstrap, Campaign } from '../shared/types';

const headers = { Authorization: 'Bearer elabela-e2e-test-token' };
let campaign: Campaign;
let other: Campaign;

test.beforeEach(async ({ request }) => {
  const create = async (title: string) => {
    const result = await request.post('/api/campaigns', {
      headers,
      data: {
        title,
        trendId: 'trend-test',
        productIds: ['13451'],
        language: 'es',
        slideCount: 1,
        variantCount: 3,
      },
    });
    expect(result.ok()).toBe(true);
    return (await result.json()) as Campaign;
  };
  campaign = await create(`Eliminar · ${randomUUID()}`);
  other = await create(`Conservar · ${randomUUID()}`);
});

test.afterEach(async ({ request }) => {
  const state = (await (await request.get('/api/bootstrap', { headers })).json()) as Bootstrap;
  for (const item of state.campaigns.filter((item) => [campaign.id, other.id].includes(item.id))) {
    expect(
      (
        await request.delete(`/api/campaigns/${item.id}`, { headers, data: { revision: item.revision } })
      ).ok(),
    ).toBe(true);
  }
});

test('cancels safely, then removes only the chosen campaign and preserves its original through reload', async ({
  page,
  request,
}) => {
  campaign = (await (
    await request.put(`/api/campaigns/${campaign.id}`, {
      headers,
      data: {
        ...campaign,
        copyOptions: [
          { id: 'copy', title: 'Texto', slides: [{ headline: 'Prueba', body: '' }], caption: 'Prueba' },
        ],
        selectedCopyId: 'copy',
        copyApproved: true,
      },
    })
  ).json()) as Campaign;
  const fixture = JSON.parse(await readFile('.local/e2e-fixture.json', 'utf8')) as { images: string[] };
  const original = await readFile(fixture.images[0] || '');
  const upload = await request.post(`/api/campaigns/${campaign.id}/assets`, {
    headers,
    multipart: {
      file: { name: 'original.png', mimeType: 'image/png', buffer: original },
      variantId: campaign.variants[0]?.id || '',
      slot: '0',
    },
  });
  expect(upload.ok()).toBe(true);
  const state = (await (await request.get('/api/bootstrap', { headers })).json()) as Bootstrap;
  const asset = state.assets.find((item) => item.campaignId === campaign.id);
  expect(asset).toBeDefined();
  await page.goto('/');
  await page.getByRole('button', { name: 'Mis campañas', exact: true }).click();
  const trigger = page.getByRole('button', { name: `Eliminar campaña ${campaign.title}`, exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Eliminar campaña', exact: true });
  await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  await expect(dialog.getByText(campaign.title, { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(trigger).toBeFocused();
  await trigger.press('Enter');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.screenshot({ path: '.local/campaign-delete-list-desktop.png', fullPage: true });
  await trigger.click();
  await page.screenshot({ path: '.local/campaign-delete-confirm-desktop.png' });
  expect(
    (
      await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await dialog.getByRole('button', { name: 'Eliminar campaña', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Tus campañas, tomando forma.' })).toBeFocused();
  await expect(page.getByRole('button', { name: `Abrir campaña ${other.title}`, exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Mis campañas', exact: true }).click();
  await expect(trigger).toHaveCount(0);
  expect(await (await request.get(`/api/assets/${asset?.id}`, { headers })).body()).toEqual(original);
});

test('a mobile confirmation stays readable with a long Portuguese title and supports keyboard cancellation', async ({
  page,
  request,
}) => {
  campaign = (await (
    await request.put(`/api/campaigns/${campaign.id}`, {
      headers,
      data: {
        ...campaign,
        title:
          'O ritual de beleza, visto de cima: texturas, cores e pequenos detalhes que transformam a rotina em um momento especial para você e seus produtos favoritos.',
        language: 'pt',
      },
    })
  ).json()) as Campaign;
  await page.goto('/');
  await page.getByRole('button', { name: 'Mis campañas', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: `Eliminar campaña ${campaign.title}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Eliminar campaña', exact: true });
  await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  expect(
    (
      await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(await dialog.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false);
  await page.screenshot({ path: '.local/campaign-delete-confirm-mobile.png' });
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
});

test('a stale confirmation reports a real concurrent edit and requires reviewing the new campaign name', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Mis campañas', exact: true }).click();
  await page.getByRole('button', { name: `Eliminar campaña ${campaign.title}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Eliminar campaña', exact: true });
  campaign = (await (
    await request.put(`/api/campaigns/${campaign.id}`, {
      headers,
      data: { ...campaign, title: `Nombre actualizado · ${campaign.id}` },
    })
  ).json()) as Campaign;
  await dialog.getByRole('button', { name: 'Eliminar campaña', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('La campaña cambió');
  await expect(dialog.getByRole('button', { name: 'Eliminar campaña', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: `Eliminar campaña ${campaign.title}`, exact: true }).click();
  await expect(dialog.getByText(campaign.title, { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Eliminar campaña', exact: true }).click();
  await expect(dialog).toBeHidden();
});

test('keeps the confirmation open during deletion and prevents a duplicate submission', async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await page.route(`**/api/campaigns/${campaign.id}`, async (route) => {
    if (route.request().method() !== 'DELETE') return route.continue();
    calls++;
    await gate;
    await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Mis campañas', exact: true }).click();
  await page.getByRole('button', { name: `Eliminar campaña ${campaign.title}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Eliminar campaña', exact: true });
  try {
    await dialog.getByRole('button', { name: 'Eliminar campaña', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Eliminando…', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Cerrar', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    expect(calls).toBe(1);
  } finally {
    release();
  }
  await expect(dialog).toBeHidden();
  expect(calls).toBe(1);
});

test('reconciles a lost deletion response by reading state without sending DELETE again', async ({
  page,
}) => {
  let calls = 0;
  await page.route(`**/api/campaigns/${campaign.id}`, async (route) => {
    if (route.request().method() !== 'DELETE') return route.continue();
    calls++;
    const result = await route.fetch();
    expect(result.ok()).toBe(true);
    await route.abort('failed');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Mis campañas', exact: true }).click();
  const trigger = page.getByRole('button', { name: `Eliminar campaña ${campaign.title}`, exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Eliminar campaña', exact: true });
  await dialog.getByRole('button', { name: 'Eliminar campaña', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toHaveCount(0);
  expect(calls).toBe(1);
});

test('shows a service failure inside the confirmation and retains the campaign', async ({ page }) => {
  await page.route(`**/api/campaigns/${campaign.id}`, (route) =>
    route.fulfill({ status: 503, json: { error: 'El servicio se está cerrando. Volvé a iniciarlo.' } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Mis campañas', exact: true }).click();
  const trigger = page.getByRole('button', { name: `Eliminar campaña ${campaign.title}`, exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Eliminar campaña', exact: true });
  await dialog.getByRole('button', { name: 'Eliminar campaña', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('El servicio se está cerrando');
  await expect(dialog.getByRole('button', { name: 'Eliminar campaña', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(trigger).toBeFocused();
});
