import { espaco, esperarOrbita, expect, MAPA_MS, orbita, superficie, test } from './apoio';

test('o motor roda num Worker e dá o mesmo mundo que rodando direto', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/?debug');
  await expect(espaco(page)).toBeVisible();
  const r = await page.evaluate(() => window.debugEngineWorker!(30));
  expect(r.worker).toMatch(/^[0-9a-f]+$/);
  expect(r.worker).toBe(r.direct);
  expect(r.yearsSeen).toBe(30);
});

test.describe('?debug', () => {
  test('window.space leva a um planeta a N raios', async ({ page }) => {
    await page.goto('/?debug');
    await expect(espaco(page)).toBeVisible();

    const planeta = await page.evaluate(() => window.space!.goToPlanet('Saturno', 3).id);
    expect(planeta).toBe('sol-6');
    await esperarOrbita(page, 'Saturno');
    const emOrbita = await page.evaluate(() => {
      const { state, systems, ship } = window.space!;
      const corpo = systems.orbitBody!;
      return { id: corpo.planet!.id, raios: state.shipPos.distanceTo(corpo.pos) / corpo.radius, velocidade: ship.velocity.length() };
    });
    expect(emOrbita.id).toBe('sol-6');
    expect(emOrbita.raios).toBeCloseTo(3, 1);
    expect(emOrbita.velocidade).toBe(0);

    // Órbita é a menos de 4 raios: a 6 o menu some, e a nave segue a 6 raios.
    await page.evaluate(() => window.space!.goToPlanet('sol-4', 6));
    await expect(orbita(page)).toBeHidden();
    expect(await page.evaluate(() => window.space!.systems.orbitBody)).toBeNull();

    await expect(page.evaluate(() => window.space!.goToPlanet('Plutão'))).rejects.toThrow('Planeta desconhecido');
  });

  test('as alças acompanham o modo aberto', async ({ page }) => {
    await page.goto('/?debug');
    await expect(espaco(page)).toBeVisible();
    expect(await page.evaluate(() => [typeof window.debugEarth, !!window.space, !!window.surface])).toEqual(['function', true, false]);

    await page.evaluate(() => window.debugEarth!());
    await expect(superficie(page)).toBeVisible({ timeout: MAPA_MS });
    expect(await page.evaluate(() => [!!window.space, !!window.surface])).toEqual([false, true]);

    await page.keyboard.press('Escape');
    await expect(espaco(page)).toBeVisible();
    expect(await page.evaluate(() => [!!window.space, !!window.surface])).toEqual([true, false]);
  });

  test('a aba Tempo do painel mostra a impressão digital e a refaz a cada avanço', async ({ page }) => {
    await page.goto('/?debug');
    await expect(espaco(page)).toBeVisible();
    await page.evaluate(() => window.debugEarth!());
    await expect(superficie(page)).toBeVisible({ timeout: MAPA_MS });

    const painel = page.locator('.wb-debugp');
    await page.keyboard.press('F3');
    await painel.locator('[data-dtab="time"]').click();
    const pausa = painel.locator('[data-dspeed="0"]');
    await pausa.click();
    // O botão aceso e a linha saem no mesmo HTML: com ele aceso, a impressão digital já é a do passo em que o jogo parou.
    await expect(pausa).toHaveClass(/\bon\b/);
    const linha = painel.locator('.wb-kv', { hasText: 'Impressão digital' });
    const ler = async () => {
      const texto = await linha.innerText();
      return { valor: texto.match(/[0-9a-f]{8}/)![0], passo: Number(texto.match(/no passo (\d+)/)![1]) };
    };
    const antes = await ler();

    await painel.locator('[data-dstep="1"]').click();
    await expect(linha).toContainText(`no passo ${antes.passo + 1}`);
    expect((await ler()).valor).not.toBe(antes.valor);
  });

  test('sem ?debug não há alça nenhuma', async ({ page }) => {
    await page.goto('/');
    await expect(espaco(page)).toBeVisible();
    expect(await page.evaluate(() => [typeof window.debugEarth, typeof window.space, typeof window.surface])).toEqual(['undefined', 'undefined', 'undefined']);
  });
});
