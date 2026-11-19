import { capturar, espaco, esperarImagem, esperarOrbita, esperarSemCortina, expect, MAPA_MS, orbita, superficie, test, usaWebGL } from './apoio';

const MODOS = [
  { nome: 'WebGL', endereco: '/', webgl: true },
  { nome: 'software', endereco: '/?soft', webgl: false },
];

for (const { nome, endereco, webgl } of MODOS) {
  test.describe(nome, () => {
    test('da órbita da Terra à superfície e de volta', async ({ page }, info) => {
      await page.goto(endereco);
      await expect(espaco(page)).toBeVisible();
      await esperarSemCortina(page);
      expect(await usaWebGL(page), 'o renderizador esperado').toBe(webgl);
      // A nave começa olhando para o Sol: no meio da tela, o brilho dele. Só as estrelas não chegariam a isso.
      await esperarImagem(page, 'o espaço na tela', 0.1);
      await capturar(page, info, '1-inicio');

      // Atalho 1: a nave salta para perto da Terra, já em órbita. Sem isso o F não faz nada.
      await page.keyboard.press('Digit1');
      await esperarOrbita(page, 'Terra');
      await esperarImagem(page, 'a Terra na tela');
      await capturar(page, info, '2-orbita');

      // F: observar a superfície. Espera ela abrir de verdade: sem isso, um F perdido passaria no teste,
      // porque o Esc também não faria nada e o menu de órbita continuaria lá.
      await page.keyboard.press('KeyF');
      await expect(superficie(page)).toBeVisible({ timeout: MAPA_MS });
      await expect(orbita(page)).toHaveCount(0);
      await esperarSemCortina(page);
      await page.waitForTimeout(3000);
      await esperarImagem(page, 'o mapa na tela');
      await capturar(page, info, '3-superficie');

      // Esc de mão vazia: de volta à órbita, na mesma Terra.
      await page.keyboard.press('Escape');
      await expect(superficie(page)).toHaveCount(0);
      await esperarOrbita(page, 'Terra');
      await esperarSemCortina(page);
      await esperarImagem(page, 'a Terra de novo na tela');
      await capturar(page, info, '4-volta');
    });

    test('clicar captura o mouse, e descer à superfície o solta', async ({ page }) => {
      await page.goto(endereco);
      await expect(espaco(page)).toBeVisible();
      await page.keyboard.press('Digit1');
      await esperarOrbita(page, 'Terra');

      // Como quem joga: o clique no canvas pede a trava do mouse (e o aviso "Clique para pilotar" some).
      await page.locator('#app canvas').first().click();
      await expect.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('CANVAS');
      await expect(page.locator('.hud-lock')).toBeHidden();

      await page.keyboard.press('KeyF');
      await expect(superficie(page)).toBeVisible({ timeout: MAPA_MS });
      expect(await page.evaluate(() => document.pointerLockElement), 'o mouse tem que ficar solto na superfície').toBeNull();
    });
  });
}
