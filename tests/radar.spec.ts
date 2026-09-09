import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import type { Bootstrap, Trend } from '../shared/types';

async function radarFixture(page: Page) {
  const sources = [
    ['nails', 'Unhas em azul', 'Esmaltes', 'https://www.instagram.com/p/test/', 'Pinterest'],
    ['makeup', 'Gloss protagonista', 'Labios', 'https://business.pinterest.com/report/', 'Instagram'],
    ['skin', 'Cuidado facial', 'Skincare', 'https://www.facebook.com/test/', 'Facebook'],
    ['hair', 'Peinados para crear', 'Cabello', 'https://www.tiktok.com/@test/video/1', 'TikTok'],
    ['perfume', 'Una historia de perfume', 'Fragancias', 'https://www.youtube.com/watch?v=test', 'YouTube'],
    ['life', 'Pequeños rituales', 'Estilo de vida', 'https://example.com/editorial', 'Sitio web'],
    ['other', 'Un clip editorial', 'Diseño', 'https://instagram.com.example.com/editorial', 'Instagram'],
  ];
  const trends = sources.map(([id, title, category, sourceUrl, platform]) => ({
    id,
    title,
    category,
    sourceUrl,
    platform,
    summary: 'Referencia ilustrativa de prueba.',
    rationale: 'Prueba de interfaz, no publicar.',
    format: 'Carrusel',
    evidence: 'editorial',
    sourceName: 'Fuente de prueba',
    observedAt: '2026-09-09T12:00:00Z',
    region: 'Prueba',
    productIds: [],
    suggestedSlides: 3,
    references: [],
    saved: false,
    palette: ['#7652b7'],
    keywords: [],
  })) as Trend[];
  const state: Bootstrap = {
    trends,
    campaigns: [],
    assets: [],
    jobs: [],
    status: {
      connected: true,
      researchProvider: 'codex',
      researchReady: true,
      generationConfigured: false,
      metaConfigured: false,
      catalogueCount: 0,
      catalogueObservedAt: null,
      allowedOrigins: [],
    },
  };
  const searches: string[] = [];
  await page.addInitScript(() => sessionStorage.setItem('elabela-session', 'test-session'));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/bootstrap') return route.fulfill({ json: state });
    if (path === '/api/trends/search' && request.method() === 'POST') {
      searches.push((request.postDataJSON() as { query: string }).query);
      return route.fulfill({ json: { id: 'search-test', status: 'queued' } });
    }
    if (request.method() === 'PATCH' && path.startsWith('/api/trends/')) {
      const trend = trends.find((item) => path.endsWith(`/${item.id}`));
      if (!trend) throw new Error('Missing trend');
      trend.saved = (request.postDataJSON() as { saved: boolean }).saved;
      return route.fulfill({ json: trend });
    }
    return route.fulfill({ json: { items: [], total: 0, categories: [], brands: [] } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tu próxima gran idea está acá.' })).toBeVisible();
  return { searches };
}

test('orbital topic and creative style guide the editable Codex research request and reference filtering', async ({
  page,
}) => {
  const fixture = await radarFixture(page);
  const categories = page.getByRole('group', { name: 'Categorías del radar' });
  const nails = categories.getByRole('button', { name: 'Uñas', exact: true });
  await nails.focus();
  await page.keyboard.press('Space');
  await expect(nails).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.trend-card')).toHaveCount(1);
  await expect(page.locator('.trend-card')).toContainText('Unhas em azul');
  await page.getByRole('button', { name: 'Tutoriales', exact: true }).click();
  await page.getByRole('button', { name: 'Explorar Uñas', exact: true }).click();
  const query = page.getByRole('textbox', { name: 'Qué querés encontrar' });
  await expect(query).toHaveValue(/tutoriales sobre uñas, esmaltes y nail art/);
  const editedQuery = `${await query.inputValue()} Usá tonos ciruela.`;
  await query.fill(editedQuery);
  await page.getByRole('button', { name: 'Iniciar investigación', exact: true }).click();
  await expect.poll(() => fixture.searches).toEqual([editedQuery]);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await expect(page.locator('.trend-card')).toHaveCount(7);
  await categories.getByRole('button', { name: 'Maquillaje', exact: true }).click();
  await expect(page.locator('.trend-card')).toHaveCount(1);
  await expect(page.locator('.trend-card')).toContainText('Gloss protagonista');
});

test('source logos follow actual domains in the library and original-source detail, and favorites still persist', async ({
  page,
}) => {
  await radarFixture(page);
  for (const platform of ['pinterest', 'instagram', 'facebook', 'tiktok', 'youtube']) {
    const image = page.locator(`.trend-card .social-source[data-platform="${platform}"] img`);
    await expect(image).toHaveCount(1);
    await expect
      .poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0))
      .toBe(true);
  }
  const spoof = page.locator('.trend-card').filter({ hasText: 'Un clip editorial' });
  await expect(spoof.locator('.social-source')).toHaveText('Sitio web');
  await page.getByLabel('Fuente de las referencias').selectOption('Instagram');
  await expect(page.locator('.trend-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Ver idea: Unhas em azul', exact: true }).click();
  await expect(page.locator('.trend-brief .social-source[data-platform="instagram"]')).toHaveCount(3);
  await expect(page.getByRole('link', { name: /Abrir fuente original/ })).toHaveAttribute(
    'href',
    'https://www.instagram.com/p/test/',
  );
  await page.getByRole('button', { name: 'Guardar idea', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Guardada', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('button', { name: /Ideas guardadas/ }).click();
  await expect(page.locator('.trend-card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Quitar Unhas em azul de guardados' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('circular categories stay usable at narrow phone width with measured accessible selected states', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await radarFixture(page);
  const group = page.getByRole('group', { name: 'Categorías del radar' });
  for (const name of ['Maquillaje', 'Skincare', 'Uñas', 'Fragancias', 'Cabello', 'Estilo de vida']) {
    const button = group.getByRole('button', { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.trend-card')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
    .violations;
  expect(
    violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  ).toEqual([]);
  await page.getByRole('button', { name: 'Preparar búsqueda', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Qué querés encontrar' })).toHaveValue(
    /estilo de vida, rituales de belleza/,
  );
});
