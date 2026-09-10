import { readFile, writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import type { Bootstrap } from '../shared/types';

const token = 'elabela-e2e-test-token';
test.beforeEach(async ({ page }) => {
  await page.addInitScript((value) => sessionStorage.setItem('elabela-session', value), token);
});

test('save inspiration, select PT copy, mix proposals, persist original quality and explicitly confirm a simulated publication', async ({
  page,
  request,
}) => {
  const fixture = JSON.parse(await readFile('.local/e2e-fixture.json', 'utf8')) as { images: string[] };
  const state = async () =>
    (await (
      await request.get('/api/bootstrap', { headers: { Authorization: `Bearer ${token}` } })
    ).json()) as Bootstrap;
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tu próxima gran idea está acá.' })).toBeVisible();
  await page.getByRole('button', { name: 'Guardar Brillo que se siente', exact: true }).click();
  await page.getByRole('button', { name: /Ideas guardadas/ }).click();
  await expect(page.locator('.trend-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Ver idea: Brillo que se siente' }).click();
  await page.getByRole('button', { name: 'Elegir referencia: Referencia de prueba', exact: true }).click();
  await page.getByRole('button', { name: 'Crear con esta imagen' }).click();
  await page.getByLabel('Nombre de la campaña').fill('E2E — campaña de prueba');
  await page.getByLabel('Idioma de la publicación').selectOption('pt');
  await page.getByRole('button', { name: 'Continuar con los textos' }).click();
  await page.getByRole('button', { name: 'Preparar opciones de texto' }).click();
  await expect(page.locator('.copy-choice')).toHaveCount(3);
  await page.locator('.copy-choice').nth(1).click();
  await page.getByLabel('Titular · pieza 1', { exact: true }).fill('Um detalhe, muitas possibilidades.');
  await page.setViewportSize({ width: 390, height: 844 });
  const copyAxe = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
    .violations;
  expect(
    copyAxe.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: '.local/copy-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Elegir estos textos y continuar' }).click();
  for (let variant = 1; variant <= 3; variant++) {
    for (let slide = 1; slide <= 3; slide++) {
      const fileChooser = page.waitForEvent('filechooser');
      await page
        .getByRole('button', { name: `Importar Opción ${variant}, pieza ${slide}`, exact: true })
        .click();
      await (await fileChooser).setFiles(fixture.images[(variant - 1) * 3 + slide - 1] || '');
      await expect(
        page.getByRole('button', { name: `Ampliar Opción ${variant}, pieza ${slide}`, exact: true }),
      ).toBeAttached();
      await expect(page.locator('.autosave')).toContainText('Guardado en tu PC');
    }
  }
  await page.getByRole('button', { name: 'Usar propuesta completa' }).first().click();
  await expect(page.locator('.final-slot.filled')).toHaveCount(3);
  const before = (await state()).campaigns[0];
  expect(before).toBeDefined();
  const source = page.locator('.variant-row').nth(1).locator('.piece-image').nth(2);
  await expect(source).toHaveAttribute('draggable', 'true');
  const target = page.locator('.final-slot').nth(2);
  await source.hover();
  const start = await source.boundingBox();
  expect(start).not.toBeNull();
  if (!start) throw new Error('La pieza origen no tiene un área visible.');
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2 + 15, start.y + start.height / 2 + 15, { steps: 5 });
  await target.scrollIntoViewIfNeeded();
  const end = await target.boundingBox();
  expect(end).not.toBeNull();
  if (!end) throw new Error('La posición final no tiene un área visible.');
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => (await state()).campaigns[0]?.finalAssetIds[2])
    .toBe(before?.variants[1]?.assetIds[2]);
  await page.getByRole('button', { name: 'Mover pieza 3 a la izquierda' }).click();
  await expect
    .poll(async () => (await state()).campaigns[0]?.finalAssetIds[1])
    .toBe(before?.variants[1]?.assetIds[2]);
  const composed = (await state()).campaigns[0];
  expect(composed?.variants).toEqual(before?.variants);
  const studioAxe = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
    .violations;
  await writeFile('.local/axe-studio.json', JSON.stringify(studioAxe, null, 2));
  expect(
    studioAxe.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
  await page.screenshot({ path: '.local/studio-desktop.png', fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: 'Mis campañas', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir campaña E2E — campaña de prueba', exact: true }).click();
  expect((await state()).campaigns[0]?.finalAssetIds).toEqual(composed?.finalAssetIds);
  await page.getByRole('button', { name: 'Ampliar pieza final 1', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar original' }).click();
  const download = await downloadEvent;
  const path = await download.path();
  expect(path).not.toBeNull();
  const downloaded = await readFile(path || '');
  const metadata = await sharp(downloaded).metadata();
  expect([metadata.width, metadata.height]).toEqual([800, 1000]);
  expect(downloaded).toEqual(await readFile(fixture.images[0] || ''));
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('button', { name: 'Revisar publicación', exact: true }).click();
  await page.getByRole('button', { name: 'Revisar y publicar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
  const modalAxe = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
    .violations;
  expect(
    modalAxe.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
  await expect(page.getByRole('button', { name: 'Publicar ahora' })).toBeDisabled();
  expect((await (await request.get('/test-only/calls')).json()).publishCalls).toBe(0);
  await page.getByRole('checkbox', { name: /Revisé el orden/ }).check();
  await page.getByRole('button', { name: 'Publicar ahora' }).click();
  await expect(page.getByText('PRUEBA AUTOMATIZADA. No se publicó nada en Meta.')).toBeVisible();
  expect((await (await request.get('/test-only/calls')).json()).publishCalls).toBe(1);
});

test('radar works at mobile width, respects reduced motion and meets measured WCAG AA checks', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tu próxima gran idea está acá.' })).toBeVisible();
  const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
    .violations;
  await writeFile('.local/axe-mobile.json', JSON.stringify(violations, null, 2));
  expect(
    violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: '.local/radar-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Abrir navegación' }).click();
  await page.getByRole('button', { name: 'Productos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Un producto. Muchas posibilidades.' })).toBeVisible();
});
