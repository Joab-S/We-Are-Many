import { capturar, espaco, expect, MAPA_MS, superficie, test, usaWebGL } from './apoio';

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

  // A ficha da pessoa, na aba da mente: mostra o que ela gerou (a ficha generativa), não a decisão do andarilho da aldeia.
  const ficha = page.locator('[data-sheet]');
  await expect(ficha).toBeVisible();
  await ficha.locator('[data-ctab="journey"]').click();
  await expect(ficha).toContainText('além do instinto');
  await expect(ficha).not.toContainText('O que decidiu');

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

/**
 * Pela rota principal, sem `?mente=generativa` nem `?soft`: o jogador escolhe a mente generativa no botão Mundo novo,
 * no WebGL. Um save com a Terra já visitada guardava o mundo de vilas, e o parâmetro só valia para planeta nunca
 * visitado; agora a escolha vai no estado do jogo e no save. O `?debug` aqui só dá as alças para o teste ler o mundo.
 */
test('Mundo novo com a mente generativa, no WebGL, e o save guarda a escolha', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/?debug');
  await expect(espaco(page)).toBeVisible();
  // Um mundo de vilas já visitado, como num save de antes: a Terra tem aldeias.
  await page.evaluate(() => window.debugEarth!());
  await expect(superficie(page)).toBeVisible({ timeout: MAPA_MS });
  expect(await page.evaluate(() => !!(window.surface as unknown as Alca).eco.gen)).toBe(false);
  await page.keyboard.press('Escape');
  await expect(espaco(page)).toBeVisible();

  await page.click('.save-bar [data-a="new"]');
  const caixa = page.locator('.new-world-box');
  await expect(caixa).toContainText('Mente generativa');
  await caixa.locator('[data-nw="generativa"]').click();
  await expect(caixa).toHaveCount(0);
  await expect(espaco(page)).toBeVisible();
  await page.evaluate(() => window.debugEarth!());
  await expect(superficie(page)).toBeVisible({ timeout: MAPA_MS });
  expect(await usaWebGL(page)).toBe(true);
  const mundo = await page.evaluate(() => {
    const eco = (window.surface as unknown as Alca).eco;
    let gente = 0;
    for (let k = 0; k < eco.count; k++) if (eco.alive[k] && eco.gen?.pessoas.has(eco.uid[k])) gente++;
    return { gente, vilas: eco.villages.length };
  });
  expect(mundo.gente).toBeGreaterThan(20);
  expect(mundo.vilas).toBe(0);

  // O resumo da ficha diz o que a pessoa gerou, e não o "andando sem rumo" de quem vive solto no mundo de vilas.
  await page.waitForFunction(() => (window.surface as unknown as Alca).eco.year > 0.5, null, { timeout: 60_000 });
  await page.evaluate(() => {
    const s = window.surface as unknown as Alca;
    const eco = s.eco;
    for (let k = 0; k < eco.count; k++) {
      if (!eco.alive[k] || !eco.gen?.pessoas.has(eco.uid[k])) continue;
      s.goTo(eco.x[k], Math.floor(eco.y[k]));
      s.sel.select(k);
      return;
    }
  });
  const ficha = page.locator('[data-sheet]');
  await expect(ficha).toBeVisible();
  await expect(ficha.locator('.cs-now').first()).not.toContainText('andando sem rumo');

  // Voltar ao espaço grava (pelo botão: com a ficha aberta, o Esc fecha a ficha); recarregar sem parâmetro nenhum de
  // mente traz a escolha e a Terra generativa.
  await superficie(page).click();
  await expect(espaco(page)).toBeVisible();
  await page.reload();
  await expect(espaco(page)).toBeVisible();
  expect(await page.evaluate(() => (window.space as unknown as { state: { mente?: string } }).state.mente)).toBe('generativa');
  await page.evaluate(() => window.debugEarth!());
  await expect(superficie(page)).toBeVisible({ timeout: MAPA_MS });
  expect(await page.evaluate(() => !!(window.surface as unknown as Alca).eco.gen)).toBe(true);
});
