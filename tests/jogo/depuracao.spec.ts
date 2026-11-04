import { espaco, esperarOrbita, expect, MAPA_MS, orbita, superficie, test } from './apoio';

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

  test('sem ?debug não há alça nenhuma', async ({ page }) => {
    await page.goto('/');
    await expect(espaco(page)).toBeVisible();
    expect(await page.evaluate(() => [typeof window.debugEarth, typeof window.space, typeof window.surface])).toEqual(['undefined', 'undefined', 'undefined']);
  });
});
