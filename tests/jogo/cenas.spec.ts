import { capturar, espaco, esperarImagem, esperarOrbita, esperarSemCortina, expect, superficie, test, usaWebGL } from './apoio';

/** Simular até surgir a cidade leva cerca de 1 min numa máquina boa e bem mais num Chromium sem GPU de CI. */
const CIDADE_MS = 600_000;

/** O save de verdade, lido direto do IndexedDB (`src/save/store.ts`). */
const lerSave = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () =>
      new Promise<{ orbitPlanetId: string | null } | undefined>((resolve, reject) => {
        const req = indexedDB.open('we-are-many', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('saves');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const get = req.result.transaction('saves').objectStore('saves').get('atual');
          get.onerror = () => reject(get.error);
          get.onsuccess = () => {
            req.result.close();
            resolve(get.result && { orbitPlanetId: get.result.orbitPlanetId });
          };
        };
      }),
  );

test.describe('?cena', () => {
  for (const { nome, endereco, webgl } of [
    { nome: 'WebGL', endereco: '/?cena=saturno&debug', webgl: true },
    { nome: 'software', endereco: '/?cena=saturno&debug&soft', webgl: false },
  ]) {
    test(`saturno abre em órbita (${nome})`, async ({ page }, info) => {
      await page.goto(endereco);
      await esperarOrbita(page, 'Saturno');
      await esperarSemCortina(page);
      expect(await usaWebGL(page)).toBe(webgl);
      const raios = await page.evaluate(() => {
        const { state, systems } = window.space!;
        const corpo = systems.orbitBody!;
        return state.shipPos.distanceTo(corpo.pos) / corpo.radius;
      });
      expect(raios).toBeCloseTo(3, 1);
      await esperarImagem(page, 'Saturno na tela');
      await capturar(page, info, 'saturno');
    });
  }

  test('terra-cidade abre numa cidade grande, com as ruas na esfera', async ({ page }, info) => {
    test.setTimeout(CIDADE_MS + 60_000);
    await page.goto('/?cena=terra-cidade&debug');
    // A cena que não acha a cidade avisa na tela de carregamento: não adianta esperar até o fim do prazo.
    const falha = page.locator('#loading', { hasText: 'Falha' });
    await expect(superficie(page).or(falha)).toBeVisible({ timeout: CIDADE_MS });
    await expect(falha).toHaveCount(0);
    await esperarSemCortina(page);

    // A câmera abre parada, em cima de uma cidade cheia.
    const aberta = await page.evaluate(() => {
      const surface = window.surface!;
      const { center, speed } = surface.snapshotView();
      const row = surface.eco.map.height - center[1];
      const lugar = surface.eco.villages.find((v) => !v.abandoned && v.x === center[0] && v.y === row);
      return { speed, ano: Math.floor(surface.eco.year), cidade: lugar && { x: lugar.x, y: lugar.y, tier: lugar.tier, gente: lugar.population, nome: surface.eco.tierName(lugar) } };
    });
    expect(aberta.speed, 'o mundo abre parado').toBe(0);
    const cidade = aberta.cidade!;
    expect(cidade, 'a câmera em cima de um lugar').toBeTruthy();
    console.log(`cena terra-cidade: ${cidade.nome} com ${cidade.gente} moradores no ano ${aberta.ano}`);
    expect(cidade.tier).toBeGreaterThanOrEqual(2);
    expect(cidade.gente).toBeGreaterThanOrEqual(200);
    await page.waitForTimeout(1000);
    await esperarImagem(page, 'a cidade na tela');
    await capturar(page, info, 'cidade');

    // O modo lendas: a história do reino mais movimentado, do começo até agora, e a exportação.
    await page.keyboard.press('KeyL');
    const janela = page.locator('[data-win]');
    await expect(janela.locator('[data-ltl]')).toBeVisible();
    // Sem lendas não há reino para escolher: falha logo, em vez de esperar o prazo do teste.
    await janela.locator('[data-filter^="realm:"]').first().click({ timeout: 15_000 });
    const linhas = janela.locator('[data-legends] .wb-row');
    await expect(linhas.first()).toBeVisible();
    const anos = (await janela.locator('[data-legends] .wb-yr').allInnerTexts()).map(Number);
    expect(anos.length, 'a história tem mais de uma linha').toBeGreaterThan(1);
    expect(anos).toEqual([...anos].sort((a, b) => a - b));
    expect(anos.at(-1)!, 'chega perto do ano de hoje').toBeLessThanOrEqual(aberta.ano);
    await capturar(page, info, 'lendas');
    const baixou = page.waitForEvent('download');
    await janela.locator('[data-legends-json]').click();
    const arquivo = await baixou;
    expect(arquivo.suggestedFilename()).toBe(`lendas-sol-3-ano-${aberta.ano}.json`);
    await page.keyboard.press('KeyL');
    await expect(janela).toBeHidden();

    // Esc: a esfera recebe o mapa pintado pela superfície, com as ruas, e a nave volta à órbita combinada.
    await page.keyboard.press('Escape');
    await expect(superficie(page)).toHaveCount(0);
    await esperarOrbita(page, 'Terra');
    await esperarSemCortina(page);
    expect(await page.evaluate(() => window.space!.state.surfaceArt.has('sol-3'))).toBe(true);

    // A cidade de frente, o mais perto que a colisão deixa.
    await page.evaluate(({ x, y }) => void window.space!.goToPlanet('Terra', 1.7, { x, y }), cidade);
    await page.waitForTimeout(1000);
    await esperarImagem(page, 'a cidade na esfera');
    await capturar(page, info, 'cidade-na-esfera');

    // A mesma cidade ao anoitecer: o relógio anda até o terminador passar por ela, e as casas acendem.
    const sol = await page.evaluate(({ x, y }) => {
      const space = window.space!;
      const { state, systems } = space;
      const corpo = systems.orbitBody!;
      const estrela = systems.system!.star;
      const altura = () => {
        systems.updateBodies(state.time, null);
        space.goToPlanet('Terra', 1.7, { x, y });
        const lado = state.shipPos.clone().sub(corpo.pos).normalize();
        return lado.dot(estrela.pos.clone().sub(corpo.pos).normalize());
      };
      for (let i = 0; i < 300 && !(altura() > -0.12 && altura() < -0.02); i++) state.time += 0.5;
      return altura();
    }, cidade);
    expect(sol, 'a cidade no crepúsculo').toBeLessThan(0.1);
    await page.waitForTimeout(1000);
    await capturar(page, info, 'cidade-ao-anoitecer');
  });

  test('não mexe no save de verdade', async ({ page }) => {
    // Um jogo normal grava o save ao abrir.
    await page.goto('/');
    await expect(espaco(page)).toBeVisible();
    await expect.poll(() => lerSave(page)).toBeTruthy();

    await page.goto('/?cena=saturno');
    await esperarOrbita(page, 'Saturno');
    // A cena pede a órbita de Saturno ao abrir: um autosave dela gravaria isso no save.
    expect((await lerSave(page))?.orbitPlanetId).toBeNull();
    await expect(page.locator('.save-bar')).toHaveCount(0);
  });

  test('cena desconhecida avisa na tela, sem abrir um jogo', async ({ page, erros }) => {
    await page.goto('/?cena=nada');
    await expect(page.locator('#loading')).toContainText('cena desconhecida: "nada"');
    await expect(page.locator('#loading')).toContainText('terra-cidade');
    await expect(espaco(page)).toHaveCount(0);
    // Esperado: o boot registra a falha no console.
    expect(erros.length).toBe(1);
    erros.length = 0;
  });
});
