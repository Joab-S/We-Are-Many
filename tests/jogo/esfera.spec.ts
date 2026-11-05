import { capturar, esperarImagem, esperarOrbita, esperarSemCortina, expect, MAPA_MS, test, usaWebGL } from './apoio';

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
