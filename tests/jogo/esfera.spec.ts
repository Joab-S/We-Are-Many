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

  test('a nave desce voando até perto do chão, sem atravessar, e anda com o planeta', async ({ page }, info) => {
    test.setTimeout(MAPA_MS + 120_000);
    await page.goto('/?debug');
    await page.keyboard.press('Digit1');
    await esperarOrbita(page, 'Terra');
    await esperarSemCortina(page);
    await expect.poll(() => page.evaluate(() => !!window.space!.systems.orbitBody!.quad), { timeout: MAPA_MS }).toBe(true);
    await page.evaluate(() => void window.space!.goToPlanet('Terra', 1.5));

    const altitude = () =>
      page.evaluate(() => {
        const { state, systems } = window.space!;
        const b = systems.orbitBody!;
        return state.shipPos.distanceTo(b.pos) / b.radius - 1;
      });
    // Acelera para baixo, como quem joga, e guarda a menor altitude de todos os quadros.
    await page.evaluate(() => {
      const w = window as unknown as { menor: number };
      w.menor = Infinity;
      const espia = () => {
        const s = window.space;
        if (!s) return;
        const b = s.systems.orbitBody;
        if (b) w.menor = Math.min(w.menor, s.state.shipPos.distanceTo(b.pos) / b.radius - 1);
        requestAnimationFrame(espia);
      };
      requestAnimationFrame(espia);
    });
    await page.keyboard.down('KeyW');
    await expect.poll(altitude, { timeout: 60_000, message: 'a nave chega a 0,05 raio' }).toBeLessThan(0.05);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(500);
    await esperarImagem(page, 'o chão na tela');
    await capturar(page, info, 'a-prumo-0-05-raio');

    // Sem o motor, a nave para sobre o mesmo ponto do mapa, mesmo com o planeta girando embaixo.
    await page.waitForTimeout(3000);
    const ponto = () =>
      page.evaluate(() => {
        const { state, systems } = window.space!;
        const b = systems.orbitBody!;
        const inverso = b.surface!.quaternion.clone().invert();
        const local = state.shipPos.clone().sub(b.pos).applyQuaternion(inverso).divideScalar(b.radius);
        return { x: local.x, y: local.y, z: local.z, giro: b.surface!.rotation.y };
      });
    const a = await ponto();
    await page.waitForTimeout(2000);
    const b = await ponto();
    expect(b.giro, 'o planeta girou').toBeGreaterThan(a.giro + 0.05);
    expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), 'a nave ficou sobre o mesmo ponto').toBeLessThan(0.002);

    // Até o piso, sem passar dele.
    await page.keyboard.down('KeyW');
    await expect.poll(altitude, { timeout: 60_000, message: 'a nave chega ao piso' }).toBeLessThan(0.0205);
    await page.waitForTimeout(1000);
    await page.keyboard.up('KeyW');
    await capturar(page, info, 'a-prumo-no-piso');
    const menor = await page.evaluate(() => (window as unknown as { menor: number }).menor);
    expect(menor, 'não atravessou o chão').toBeGreaterThanOrEqual(0.0199);
    const pedacos = await page.evaluate(() => window.space!.systems.orbitBody!.quad!.drawn);
    expect(pedacos).toBeLessThan(300);
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
