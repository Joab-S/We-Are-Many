import { replayCase, type ReplayCase } from '../../src/sim/api/replay';
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

  test('a aba Ajustes muda uma constante na hora, sem as teclas irem para o jogo, e provoca um evento', async ({ page }) => {
    await page.goto('/?debug');
    await expect(espaco(page)).toBeVisible();
    await page.evaluate(() => window.debugEarth!());
    await expect(superficie(page)).toBeVisible({ timeout: MAPA_MS });

    const painel = page.locator('.wb-debugp');
    await page.keyboard.press('F3');
    await painel.locator('[data-dtab="time"]').click();
    await painel.locator('[data-dspeed="0"]').click();
    // A câmera também entra no log (`view`), e abrir o painel muda o que ela vê: conta só o que veio da aba.
    const log = () =>
      page.evaluate(() => {
        const { driver } = window.surface as unknown as { driver: { log: { cmd: { kind: string } }[] } };
        return driver.log.map((e) => e.cmd.kind).filter((k) => k !== 'view');
      });
    const antes = await log();

    await painel.locator('[data-dtab="tune"]').click();
    // "site_min_value" tem T, N e I, que abririam camadas e janelas no jogo.
    await painel.locator('[data-dfilter]').pressSequentially('site_min_value');
    await expect(page.locator('.wb-window:visible')).toHaveCount(0);
    const linhas = painel.locator('[data-dname]:visible');
    await expect(linhas).toHaveCount(1);

    const minima = () =>
      page.evaluate(() => {
        const { engine } = window.surface as unknown as { engine: { view: { siteAt(x: number, y: number): { min: number } | null } } };
        return engine.view.siteAt(300, 200)?.min;
      });
    expect(await minima()).toBe(4.2);
    const campo = painel.locator('[data-dtune="SITE_MIN_VALUE"]');
    await campo.fill('2.5');
    await campo.press('Enter');
    await expect.poll(minima).toBe(2.5);
    await expect(painel.locator('.wb-dtune.on')).toContainText('era 4.2');
    // A busca continua valendo depois que o HTML é refeito.
    await expect(linhas).toHaveCount(1);

    await painel.locator('[data-dsurprise]').click();
    await painel.locator('[data-dtab="time"]').click();
    await expect.poll(log).toEqual([...antes, 'tune', 'surprise']);
  });

  test('o caso copiado depois de sair e voltar refaz o mesmo mundo fora do navegador', async ({ page, context }, info) => {
    test.setTimeout(240_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/?debug');
    await expect(espaco(page)).toBeVisible();
    await page.evaluate(() => window.debugEarth!());
    await expect(superficie(page)).toBeVisible({ timeout: MAPA_MS });

    const painel = page.locator('.wb-debugp');
    const avancar = async () => {
      await page.keyboard.press('F3');
      await painel.locator('[data-dtab="time"]').click();
      await painel.locator('[data-dspeed="0"]').click();
      // Um ano inteiro de cada vez: com poucos passos, quase nada do motor rodou e a comparação não prova muito.
      await painel.locator('[data-dstep]').last().click();
    };
    await avancar();
    const passo = async () => Number((await painel.locator('.wb-kv', { hasText: /^Passo/ }).innerText()).match(/\d+/)![0]);
    await expect.poll(passo).toBeGreaterThan(0);
    const antes = await passo();

    await page.keyboard.press('F3');
    await superficie(page).click();
    await expect(espaco(page)).toBeVisible();
    await page.evaluate(() => window.debugEarth!());
    await expect(superficie(page)).toBeVisible({ timeout: MAPA_MS });
    await avancar();
    await expect.poll(passo).toBeGreaterThan(antes);

    await painel.locator('[data-dcopy]').click();
    await expect(painel.locator('.good')).toBeVisible();
    const json = await page.evaluate(() => navigator.clipboard.readText());
    await info.attach('caso.json', { body: json, contentType: 'application/json' });
    const caso = JSON.parse(json) as ReplayCase;
    expect(caso.fresh).toBe(true);
    expect(caso.log.length).toBeGreaterThan(0);
    expect(replayCase(caso)).toMatchObject({ tick: caso.tick, fingerprint: caso.fingerprint, same: true });
  });

  test('uma criatura colhida na Terra vai no porão até Marte, e lá soltar gasta a carga e o frio cobra', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/?debug');
    await expect(espaco(page)).toBeVisible();
    await page.evaluate(() => window.debugEarth!());
    await expect(superficie(page)).toBeVisible({ timeout: MAPA_MS });

    // Colhe um bicho de verdade: a ferramenta só escolhe o ponto, e o resto é o comando.
    const nome = await page.evaluate(() => {
      const { eco, driver } = window.surface as unknown as {
        eco: { count: number; alive: Uint8Array; kind: Uint8Array; x: Float32Array; y: Float32Array; species: { kind: string; name: string; tempMin: number }[] };
        driver: { enqueue(cmd: unknown): void };
      };
      for (let i = 0; i < eco.count; i++) {
        if (!eco.alive[i] || eco.species[eco.kind[i]].kind !== 'herbivore') continue;
        driver.enqueue({ kind: 'collect', x: eco.x[i], y: eco.y[i], r: 0.01, room: 0 });
        return eco.species[eco.kind[i]].name;
      }
      throw new Error('nenhum herbívoro');
    });
    const noPorao = page.locator('.wb-sp', { hasText: 'no porão' });
    await page.keyboard.press('KeyE');
    await expect(noPorao).toContainText(nome);

    await page.keyboard.press('KeyE');
    await superficie(page).click();
    await expect(espaco(page)).toBeVisible();
    await expect(page.locator('.probe-panel')).toContainText(nome);

    await page.evaluate(() => void window.space!.goToPlanet('Marte', 3));
    await esperarOrbita(page, 'Marte');
    await page.keyboard.press('KeyF');
    await expect(superficie(page)).toBeVisible({ timeout: MAPA_MS });

    // Em Marte, só dá para soltar o que veio no porão.
    await page.keyboard.press('KeyE');
    await expect(noPorao.locator('[data-pick]')).toBeEnabled();
    await expect(page.locator('.wb-sp', { hasNotText: 'no porão' }).first().locator('[data-pick]')).toBeDisabled();
    // Escolher a ferramenta já fecha a janela (o Esc largaria a ferramenta).
    await noPorao.locator('[data-pick]').click();
    // O mapa abre sob a nave, que pode estar sobre o gelo: o clique vai em terra firme.
    await page.evaluate(() => {
      const { eco, view } = window.surface as unknown as { eco: { map: { width: number; height: number; elevation: Float32Array } }; view: { center: { x: number; y: number } } };
      const { width, height, elevation } = eco.map;
      const linha = height >> 1;
      for (let x = 0; x < width; x++) {
        if (elevation[linha * width + x] < 0.1) continue;
        view.center.x = x + 0.5;
        view.center.y = height - linha - 0.5;
        return;
      }
      throw new Error('o equador sem terra');
    });
    await page.waitForTimeout(100);
    await page.mouse.click(640, 400);
    const estado = () =>
      page.evaluate(() => {
        const { eco, state } = window.surface as unknown as { eco: { exposures: unknown[] }; state: { probes: { specimens: Record<string, number> } } };
        return { expostas: eco.exposures.length, porao: Object.keys(state.probes.specimens).length };
      });
    await expect.poll(estado).toEqual({ expostas: 1, porao: 0 });
  });

  test('quem volta a um planeta o encontra em dia, num Worker, e o caso copiado ainda refaz o mundo', async ({ page, context }, info) => {
    test.setTimeout(240_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/?debug');
    await expect(espaco(page)).toBeVisible();
    await page.evaluate(() => window.debugEarth!());
    await expect(superficie(page)).toBeVisible({ timeout: MAPA_MS });
    const mundo = () =>
      page.evaluate(() => {
        const { eco } = window.surface as unknown as { eco: { year: number; caughtUpYears: number; skippedYears: number; chronicle: { text: string }[] } };
        return { ano: eco.year, rodados: eco.caughtUpYears, pulados: eco.skippedYears, nota: eco.chronicle.find((e) => e.text.startsWith('Você esteve fora'))?.text };
      });
    const antes = await mundo();
    expect(antes.rodados).toBe(0);

    await superficie(page).click();
    await expect(espaco(page)).toBeVisible();
    // Seis anos fora, sem esperar 72 s de verdade.
    await page.evaluate(() => {
      window.space!.state.time += 6 * 12;
    });
    await page.evaluate(() => window.debugEarth!());
    await expect(page.locator('.wb-loading')).toContainText('Pondo em dia Terra');
    await expect(superficie(page)).toBeVisible({ timeout: MAPA_MS });

    const depois = await mundo();
    expect(depois.rodados, 'rodou alguma coisa').toBeGreaterThan(0);
    expect(depois.rodados + depois.pulados).toBe(6);
    expect(depois.ano - antes.ano).toBeGreaterThanOrEqual(depois.rodados - 0.01);
    expect(depois.nota).toContain('Você esteve fora por 6 anos');

    const painel = page.locator('.wb-debugp');
    await page.keyboard.press('F3');
    await painel.locator('[data-dtab="time"]').click();
    await expect(painel).toContainText('Pôr em dia');
    await painel.locator('[data-dspeed="0"]').click();
    await painel.locator('[data-dcopy]').click();
    await expect(painel.locator('.good')).toBeVisible();
    const json = await page.evaluate(() => navigator.clipboard.readText());
    await info.attach('caso.json', { body: json, contentType: 'application/json' });
    const caso = JSON.parse(json) as ReplayCase;
    expect(replayCase(caso)).toMatchObject({ tick: caso.tick, fingerprint: caso.fingerprint, same: true });
  });

  test('um planeta visitado anda enquanto a nave voa, e o que acontece nele chega ao GUIA', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/?debug');
    await expect(espaco(page)).toBeVisible();
    await page.evaluate(() => window.debugEarth!());
    await expect(superficie(page)).toBeVisible({ timeout: MAPA_MS });
    await superficie(page).click();
    await expect(espaco(page)).toBeVisible();

    // Em órbita de um planeta longe, com a Terra atrasada: um povo dela chegou a uma era nova nesse tempo.
    const andou = await page.evaluate(() => {
      const { state } = window.space as unknown as { state: { time: number; ecosystems: Map<string, { year: number; emit(e: unknown): void }> } };
      const eco = state.ecosystems.get('sol-3')!;
      eco.emit({ kind: 'era', year: eco.year, village: 0, era: 1, first: true });
      state.time += 7 * 12;
      return eco.year;
    });
    await page.evaluate(() => void window.space!.goToPlanet('Netuno', 3));
    await esperarOrbita(page, 'Netuno');

    const sinais = () =>
      page.evaluate(() => {
        const { state } = window.space as unknown as { state: { nav: { signals: { planet: string; reason: string }[] }; ecosystems: Map<string, { year: number }> } };
        return { sinais: state.nav.signals.map((s) => s.planet), ano: state.ecosystems.get('sol-3')!.year };
      });
    await expect.poll(async () => (await sinais()).sinais, { timeout: 60_000 }).toEqual(['sol-3']);
    expect((await sinais()).ano).toBeGreaterThan(andou);

    // É uma sugestão como as outras, no painel do GUIA.
    await page.keyboard.press('KeyG');
    await expect(page.locator('.guide-row', { hasText: 'Um povo chegou à' })).toContainText('Terra');

    // Pousar lá apaga o aviso.
    await page.evaluate(() => window.debugEarth!());
    await expect(superficie(page)).toBeVisible({ timeout: MAPA_MS });
    expect(await page.evaluate(() => (window.surface as unknown as { state: { nav: { signals: unknown[] } } }).state.nav.signals.length)).toBe(0);
  });

  test('sem ?debug não há alça nenhuma', async ({ page }) => {
    await page.goto('/');
    await expect(espaco(page)).toBeVisible();
    expect(await page.evaluate(() => [typeof window.debugEarth, typeof window.space, typeof window.surface])).toEqual(['undefined', 'undefined', 'undefined']);
  });
});
