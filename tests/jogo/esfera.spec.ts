import { capturar, esperarImagem, esperarOrbita, esperarSemCortina, expect, MAPA_MS, superficie, test, usaWebGL } from './apoio';

/** Põe a nave sobre o polo do planeta em órbita, olhando para o centro: é onde o uv da esfera apertava a imagem. */
async function sobreOPolo(page: import('@playwright/test').Page, raios: number): Promise<void> {
  await page.evaluate((r) => {
    const space = window.space!;
    const corpo = space.systems.orbitBody!;
    corpo.surface!.updateMatrixWorld(true);
    // O polo é o eixo Y da esfera.
    const m = corpo.surface!.matrixWorld.elements;
    const eixo = corpo.pos.clone().set(m[4], m[5], m[6]).normalize();
    space.state.shipPos.copy(corpo.pos).addScaledVector(eixo, r * corpo.radius);
    (space as unknown as { lookAt(t: unknown): void }).lookAt(corpo.pos);
  }, raios);
}

test.describe('a esfera do rochoso', () => {
  test('no WebGL o rochoso usa o shader por longitude e latitude, sem costura no polo', async ({ page }, info) => {
    test.setTimeout(MAPA_MS + 60_000);
    await page.goto('/?debug');
    await page.keyboard.press('Digit1');
    await esperarOrbita(page, 'Terra');
    await esperarSemCortina(page);
    expect(await usaWebGL(page)).toBe(true);
    // A prévia vem de um Worker: até ela chegar, o planeta tem as faixas provisórias.
    await expect.poll(() => page.evaluate(() => window.space!.systems.orbitBody!.previewPending)).toBe(false);
    const tipo = await page.evaluate(() => (window.space!.systems.orbitBody!.surface as unknown as { material: { type: string } }).material.type);
    expect(tipo).toBe('ShaderMaterial');
    await esperarImagem(page, 'a Terra na tela');
    await capturar(page, info, 'terra-de-lado');

    await sobreOPolo(page, 2.2);
    await page.waitForTimeout(500);
    await esperarImagem(page, 'o polo na tela', 0.2);
    await capturar(page, info, 'terra-polo');
  });

  test('o mapa do planeta em órbita fica pronto antes de descer', async ({ page }) => {
    test.setTimeout(MAPA_MS + 60_000);
    await page.goto('/?debug');
    await page.keyboard.press('Digit1');
    await esperarOrbita(page, 'Terra');
    await esperarSemCortina(page);
    await expect.poll(() => page.evaluate(() => !!window.space!.state.pregen?.map), { timeout: MAPA_MS }).toBe(true);
    // Em órbita, a esfera já tem o mapa inteiro, e a Terra ainda não conta como visitada.
    const antes = await page.evaluate(() => {
      const { state, systems } = window.space!;
      const material = (systems.orbitBody!.surface as unknown as { material: { uniforms: { uMap: { value: { image: { width: number } } } } } }).material;
      return { visitada: state.surfaces.has('sol-3'), largura: material.uniforms.uMap.value.image.width, mapa: state.pregen!.map!.width };
    });
    expect(antes.visitada).toBe(false);
    expect(antes.largura).toBe(antes.mapa);
    await page.evaluate(() => void ((window.space!.state.pregen!.map as unknown as { marcado: boolean }).marcado = true));

    // Do F até o mapa na tela, medido dentro da página.
    const ms = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let inicio = 0;
          window.addEventListener('keydown', () => (inicio = performance.now()), { capture: true, once: true });
          const espia = setInterval(() => {
            if (!document.querySelector('.surface-hud [data-a="back"]')) return;
            clearInterval(espia);
            resolve(performance.now() - inicio);
          }, 4);
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true }));
        }),
    );
    console.log(`do F ao mapa, com o mapa adiantado: ${Math.round(ms)} ms`);
    await expect(superficie(page)).toBeVisible();
    // O mesmo objeto, e não um mapa gerado de novo.
    expect(await page.evaluate(() => (window.surface!.eco.map as unknown as { marcado?: boolean }).marcado)).toBe(true);
  });

  test('de perto, o quadtree toma o lugar da esfera', async ({ page }, info) => {
    test.setTimeout(MAPA_MS + 60_000);
    await page.goto('/?debug');
    await page.keyboard.press('Digit1');
    await esperarOrbita(page, 'Terra');
    await esperarSemCortina(page);
    await expect.poll(() => page.evaluate(() => !!window.space!.state.pregen?.map), { timeout: MAPA_MS }).toBe(true);
    await expect.poll(() => page.evaluate(() => !!window.space!.systems.orbitBody!.quad)).toBe(true);

    // Em órbita alta, ainda a esfera; a 1,7 raio, o quadtree. Um tile do mapa na frente, a prumo: é onde uma fresta apareceria.
    const estado = () =>
      page.evaluate(() => {
        const b = window.space!.systems.orbitBody!;
        return { esfera: b.surface!.visible, quad: b.quad!.group.visible, pedacos: b.quad!.drawn, construidos: b.quad!.built };
      });
    await page.evaluate(() => void window.space!.goToPlanet('Terra', 3.5));
    await expect.poll(estado).toMatchObject({ esfera: true, quad: false });
    await capturar(page, info, 'esfera-3-5-raios');
    await page.evaluate(() => void window.space!.goToPlanet('Terra', 1.7));
    await expect.poll(estado).toMatchObject({ esfera: false, quad: true });
    await page.waitForTimeout(1000);
    await esperarImagem(page, 'o quadtree na tela');
    const perto = await estado();
    expect(perto.pedacos).toBeGreaterThan(0);
    expect(perto.pedacos).toBeLessThan(300);
    await capturar(page, info, 'quadtree-1-7-raios');
  });

  test('a borda azul da Terra e a alaranjada de Marte', async ({ page }, info) => {
    await page.goto('/?debug');
    await page.keyboard.press('Digit1');
    await esperarOrbita(page, 'Terra');
    await esperarSemCortina(page);
    await esperarImagem(page, 'a Terra na tela');
    await capturar(page, info, 'atmosfera-terra');
    await page.evaluate(() => void window.space!.goToPlanet('Marte', 2.2));
    await esperarOrbita(page, 'Marte');
    await expect.poll(() => page.evaluate(() => window.space!.systems.orbitBody!.previewPending)).toBe(false);
    await page.waitForTimeout(500);
    await esperarImagem(page, 'Marte na tela');
    await capturar(page, info, 'atmosfera-marte');
  });
});
