import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('a fresh local tab connects without a launcher link and survives reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Conectar mi estudio', exact: true })).toBeHidden();
  await expect(page.locator('.trend-card').first()).toBeVisible();
  await page.reload();
  await expect(page.locator('.trend-card').first()).toBeVisible();
  await expect(page).toHaveURL('http://127.0.0.1:5187/');
});

test('Connect retries local pairing with manual fields collapsed and reports failures inside the dialog', async ({
  page,
}) => {
  let available = false;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/local-connection', (route) =>
    available
      ? route.continue()
      : route.fulfill({ status: 503, json: { error: 'No se pudo conectar con el servicio local.' } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Conectar mi estudio', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Conectar tu estudio', exact: true });
  await dialog.getByRole('button', { name: 'Conectar', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('No se pudo conectar con el servicio local.');
  await expect(dialog.getByRole('button', { name: 'Conectar', exact: true })).toBeEnabled();
  const accessibility = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  available = true;
  await dialog.getByRole('button', { name: 'Conectar', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.trend-card').first()).toBeVisible();
});

test('an outdated session reconnects automatically on the local page', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('elabela-session', 'outdated-test-session'));
  await page.goto('/');
  await expect(page.locator('.trend-card').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Conectar mi estudio', exact: true })).toBeHidden();
});

test('manual pairing still works when opened explicitly', async ({ page }) => {
  await page.route('**/api/local-connection', (route) =>
    route.fulfill({ status: 503, json: { error: 'Conexión automática no disponible.' } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Conectar mi estudio', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Conectar tu estudio', exact: true });
  await dialog.getByText('Conexión manual', { exact: true }).click();
  await dialog.getByLabel('Código de conexión').fill('elabela-e2e-test-token');
  await dialog.getByRole('button', { name: 'Conectar', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.trend-card').first()).toBeVisible();
});
