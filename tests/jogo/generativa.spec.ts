import { capturar, espaco, expect, MAPA_MS, superficie, test } from './apoio';

/** O que o teste lê do mundo pela alça de depuração (`window.surface`, só com `?debug`). */
type Alca = { eco: { count: number; alive: Uint8Array; uid: Uint32Array; x: Float32Array; y: Float32Array; year: number; villages: unknown[]; gen: { pessoas: Map<number, unknown> } | null }; goTo(x: number, row: number): void; sel: { select(i: number): void } };

test('?mente=generativa: gente espalhada, nenhuma vila, e o painel explica a decisão', async ({ page }, info) => {
  test.setTimeout(300_000);
  await page.goto('/?debug&mente=generativa&soft');
  await expect(espaco(page)).toBeVisible();
  await page.evaluate(() => window.debugEarth!());
  await expect(superficie(page)).toBeVisible({ timeout: MAPA_MS });

  // O mundo começa com pessoas do modelo generativo e sem assentamento; fixa a ficha de uma delas.
  const mundo = await page.evaluate(() => {
    const s = window.surface as unknown as Alca;
    const eco = s.eco;
    let gente = 0;
    let i = -1;
    for (let k = 0; k < eco.count; k++) {
      if (!eco.alive[k] || !eco.gen?.pessoas.has(eco.uid[k])) continue;
      gente++;
      if (i < 0) i = k;
    }
    if (i >= 0) {
      s.goTo(eco.x[i], Math.floor(eco.y[i]));
      s.sel.select(i);
    }
    return { generativo: !!eco.gen, gente, vilas: eco.villages.length };
  });
  expect(mundo.generativo).toBe(true);
  expect(mundo.gente).toBeGreaterThan(20);
  expect(mundo.vilas).toBe(0);

  // Uns segundos de mundo: as pessoas pensam, e continua sem vila nenhuma.
  await page.waitForFunction(() => (window.surface as unknown as Alca).eco.year > 0.8, null, { timeout: 60_000 });
  expect(await page.evaluate(() => (window.surface as unknown as Alca).eco.villages.length)).toBe(0);

  await page.keyboard.press('F3');
  await page.click('[data-dtab="mind"]');
  const painel = page.locator('.wb-debugp');
  await expect(painel).toContainText('Por quê: as opções geradas agora');
  await expect(painel).toContainText('Crenças');
  await expect(painel).toContainText('de nascença');
  await capturar(page, info, 'mente');
  await page.click('[data-dtab="collective"]');
  await expect(painel).toContainText('Agrupamentos de agora');
  await expect(painel).toContainText('Primeiras vezes vistas');
  await capturar(page, info, 'coletivo');
});
