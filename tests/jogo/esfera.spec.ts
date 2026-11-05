import { capturar, espaco, esperarImagem, esperarOrbita, esperarSemCortina, expect, MAPA_MS, superficie, test, usaWebGL } from './apoio';

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

/** O tile mais alto fora dos polos, do mapa adiantado da Terra. */
function montanhaMaisAlta(page: import('@playwright/test').Page): Promise<{ u: number; v: number }> {
  return page.evaluate(() => {
    const map = window.space!.state.pregen!.map!;
    let melhor = 0;
    for (let i = 0; i < map.width * map.height; i++) {
      const fora = Math.abs(i / map.width / map.height - 0.5) < 0.3;
      if (fora && map.elevation[i] > map.elevation[melhor]) melhor = i;
    }
    return { u: (melhor % map.width) / map.width, v: Math.floor(melhor / map.width) / map.height };
  });
}

/** Leva a nave a `raios` do centro, sobre o ponto, na hora do meio-dia dele; a prumo ou, com `rente`, olhando o horizonte. */
function voarSobre(page: import('@playwright/test').Page, ponto: { u: number; v: number }, raios: number, rente: boolean): Promise<void> {
  return page.evaluate(
    ({ u, v, raios, rente }) => {
      const space = window.space!;
      const b = space.systems.orbitBody!;
      const estrela = space.systems.system!.star;
      const phi = u * Math.PI * 2;
      const theta = v * Math.PI;
      const direcao = () => b.pos.clone().set(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)).applyEuler(b.surface!.rotation);
      // O planeta gira e o tempo corre entre as fotos: cada uma pega o meio-dia do lugar, ou a última sai à noite.
      let melhor = space.state.time;
      let maior = -2;
      const inicio = space.state.time;
      for (let i = 0; i < 300; i++) {
        space.state.time = inicio + i * 0.5;
        space.systems.updateBodies(space.state.time, null);
        const sol = direcao().dot(estrela.pos.clone().sub(b.pos).normalize());
        if (sol > maior) {
          maior = sol;
          melhor = space.state.time;
        }
      }
      space.state.time = melhor;
      space.systems.updateBodies(melhor, null);
      const d = direcao();
      space.state.shipPos.copy(b.pos).addScaledVector(d, raios * b.radius);
      const lado = b.pos.clone().set(0, 0, 1).cross(d).normalize();
      const mira = rente ? space.state.shipPos.clone().addScaledVector(lado, 0.2 * b.radius).addScaledVector(d, -0.015 * b.radius) : b.pos;
      (space as unknown as { lookAt(t: unknown): void }).lookAt(mira);
    },
    { ...ponto, raios, rente },
  );
}

test.describe('a esfera do rochoso', () => {
  test('no WebGL o rochoso usa o shader por longitude e latitude, sem costura no polo', async ({ page }, info) => {
    test.setTimeout(MAPA_MS + 60_000);
    await page.goto('/?debug');
    await expect(espaco(page)).toBeVisible();
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
    await expect(espaco(page)).toBeVisible();
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
    await expect(espaco(page)).toBeVisible();
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
    await expect(espaco(page)).toBeVisible();
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
    // Acelera para baixo, como quem joga, e guarda a menor altitude de todos os quadros. Inclinada 35° em relação ao prumo:
    // a prumo ela pousaria (o último passo do teste).
    await page.evaluate(() => {
      const space = window.space!;
      const b = space.systems.orbitBody!;
      const baixo = b.pos.clone().sub(space.state.shipPos).normalize();
      const lado = b.pos.clone().set(0, 0, 1).cross(baixo).normalize();
      const mira = space.state.shipPos.clone().addScaledVector(baixo, Math.cos(0.61)).addScaledVector(lado, Math.sin(0.61));
      (space as unknown as { lookAt(t: unknown): void }).lookAt(mira);
    });
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
    await capturar(page, info, 'inclinada-0-05-raio');

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
    await capturar(page, info, 'inclinada-no-piso');
    const menor = await page.evaluate(() => (window as unknown as { menor: number }).menor);
    expect(menor, 'não atravessou o chão').toBeGreaterThanOrEqual(0.0199);
    const pedacos = await page.evaluate(() => window.space!.systems.orbitBody!.quad!.drawn);
    expect(pedacos).toBeLessThan(300);

    // Parada a prumo, ela só olha; a prumo e acelerando, pousa.
    await page.evaluate(() => {
      const space = window.space!;
      (space as unknown as { lookAt(t: unknown): void }).lookAt(space.systems.orbitBody!.pos);
    });
    await page.waitForTimeout(500);
    await expect(page.locator('.surface-hud')).toHaveCount(0);
    await page.keyboard.down('KeyW');
    await expect(superficie(page)).toBeVisible({ timeout: 30_000 });
    await page.keyboard.up('KeyW');
    expect(await page.evaluate(() => window.space)).toBeUndefined();
  });

  test('a fusão: três fotos, a mesma célula no centro antes e depois', async ({ page }, info) => {
    test.setTimeout(MAPA_MS + 90_000);
    await page.goto('/?debug');
    await expect(espaco(page)).toBeVisible();
    await page.keyboard.press('Digit1');
    await esperarOrbita(page, 'Terra');
    await esperarSemCortina(page);
    await expect.poll(() => page.evaluate(() => !!window.space!.systems.orbitBody!.quad), { timeout: MAPA_MS }).toBe(true);
    await voarSobre(page, await montanhaMaisAlta(page), 1.04, false);
    await page.waitForTimeout(1000);
    const orbita0 = await page.evaluate(() => window.space!.gpuBytes());

    // O centro da tela do 3D, no referencial do planeta, em (coluna, linha).
    const noCentro3d = () =>
      page.evaluate(() => {
        const { state, systems } = window.space!;
        const b = systems.orbitBody!;
        const local = state.shipPos.clone().sub(b.pos).applyQuaternion(b.surface!.quaternion.clone().invert()).normalize();
        const u = Math.atan2(local.z, -local.x) / (Math.PI * 2);
        return { coluna: (u < 0 ? u + 1 : u) * 1024, linha: (Math.acos(local.y) / Math.PI) * 512 };
      });
    const antes = await noCentro3d();

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const heap = async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      const { metrics } = await cdp.send('Performance.getMetrics');
      return metrics.find((m) => m.name === 'JSHeapUsedSize')!.value;
    };
    await page.keyboard.press('KeyF');
    // Pausa a fusão assim que ela começa: as fotos saem em momentos exatos, mesmo sem GPU.
    await expect
      .poll(() => page.evaluate(() => {
        const fades = document.getAnimations().filter((a) => (a.effect as KeyframeEffect).target instanceof HTMLCanvasElement);
        for (const a of document.getAnimations()) a.pause();
        return fades.length;
      }), { timeout: MAPA_MS })
      .toBeGreaterThan(0);
    const irPara = (ms: number) =>
      page.evaluate((t) => {
        for (const a of document.getAnimations()) a.currentTime = t;
      }, ms);
    await irPara(0);
    await page.waitForTimeout(400);
    await capturar(page, info, 'fusao-comeco');
    await irPara(300);
    await page.waitForTimeout(400);
    await capturar(page, info, 'fusao-meio');
    const pico = await page.evaluate(() => window.space!.gpuBytes());
    const heapVivo = await heap();
    await irPara(599);
    await page.waitForTimeout(400);
    await capturar(page, info, 'fusao-fim');

    // No último quadro do 3D, a nave aponta para o chão, com o norte para cima; e a célula é a do centro do mapa.
    const noFim = await page.evaluate(() => {
      const { state, systems } = window.space!;
      const b = systems.orbitBody!;
      const nariz = state.shipQuat.clone();
      const baixo = b.pos.clone().sub(state.shipPos).normalize();
      const frente = baixo.clone().set(0, 0, -1).applyQuaternion(nariz);
      const cima = baixo.clone().set(0, 1, 0).applyQuaternion(nariz);
      const norte = baixo.clone().set(0, 1, 0).applyEuler(b.surface!.rotation);
      const { center } = window.surface!.snapshotView();
      return { prumo: frente.dot(baixo), norte: cima.dot(norte.addScaledVector(baixo, -norte.dot(baixo)).normalize()), coluna: center[0], linha: 512 - center[1] };
    });
    const depois = await noCentro3d();
    expect(noFim.prumo, 'a prumo').toBeGreaterThan(0.999);
    expect(noFim.norte, 'o norte para cima').toBeGreaterThan(0.99);
    expect(Math.abs(depois.coluna - antes.coluna), 'a nave não se mexeu').toBeLessThan(0.5);
    expect(Math.abs(noFim.coluna - depois.coluna), 'a mesma coluna no centro').toBeLessThan(1);
    expect(Math.abs(noFim.linha - depois.linha), 'a mesma linha no centro').toBeLessThan(1);

    await page.evaluate(() => {
      for (const a of document.getAnimations()) a.play();
    });
    await expect(superficie(page)).toBeVisible();
    expect(await page.evaluate(() => window.space)).toBeUndefined();
    await expect(page.locator('#app canvas').first()).toBeHidden();
    await esperarImagem(page, 'o mapa na tela');
    await capturar(page, info, 'fusao-depois');
    // O que a fusão custa a mais que a troca de antes é o espaço vivo junto com a superfície: os bytes dele na GPU, mais o heap que some quando ele é descartado.
    const heapDepois = await heap();
    const aMais = pico + Math.max(0, heapVivo - heapDepois);
    console.log(`na fusão, o 3D ainda vivo ocupa ${(pico / 1048576).toFixed(1)} MB na GPU (${(orbita0 / 1048576).toFixed(1)} MB em órbita) e ${((heapVivo - heapDepois) / 1048576).toFixed(1)} MB de heap`);
    expect(aMais, 'o pico da descida, além do que a superfície já ocupava').toBeLessThan(40 * 1048576);
  });

  test('descer e subir dez vezes, sem vazar memória da GPU nem perder a órbita', async ({ page }) => {
    test.setTimeout(MAPA_MS + 300_000);
    await page.goto('/?debug');
    await expect(espaco(page)).toBeVisible();
    await page.keyboard.press('Digit1');
    await esperarOrbita(page, 'Terra');
    await esperarSemCortina(page);
    await expect.poll(() => page.evaluate(() => !!window.space!.state.pregen?.map), { timeout: MAPA_MS }).toBe(true);
    // Sobe pelo zoom: no mínimo, um giro novo da roda.
    let centro: [number, number] = [0, 0];
    const subir = async () => {
      await page.evaluate(() => {
        window.surface!.zoom = 0.5;
      });
      await page.waitForTimeout(500);
      centro = await page.evaluate(() => window.surface!.snapshotView().center);
      await page.mouse.move(640, 400);
      await page.mouse.wheel(0, 100);
      await expect.poll(() => page.evaluate(() => !window.surface && !!window.space && !document.querySelector('.space-hud.fusing')), { timeout: 30_000 }).toBe(true);
    };
    const contas = () =>
      page.evaluate(() => {
        const { memory } = (window.space as unknown as { renderer: { info: { memory: { geometries: number; textures: number } } } }).renderer.info;
        return { geometrias: memory.geometries, texturas: memory.textures };
      });
    // Com a nave longe, o quadtree foi embora: as contas só dizem algo no mesmo lugar, e em descanso.
    const longe = async () => {
      await page.evaluate(() => void window.space!.goToPlanet('Terra', 5));
      await page.waitForTimeout(1000);
      const r = await contas();
      await page.evaluate(() => void window.space!.goToPlanet('Terra', 3));
      await esperarOrbita(page, 'Terra');
      return r;
    };
    let primeira: Awaited<ReturnType<typeof contas>> | null = null;
    for (let i = 0; i < 10; i++) {
      await esperarOrbita(page, 'Terra');
      await page.keyboard.press('KeyF');
      await expect(superficie(page)).toBeVisible({ timeout: 30_000 });
      expect(await page.evaluate(() => window.space)).toBeUndefined();
      await subir();
      const sobre = await page.evaluate(() => {
        const { state, systems } = window.space!;
        const b = systems.orbitBody;
        if (!b) return { altitude: -1, coluna: -1, linha: -1 };
        const local = state.shipPos.clone().sub(b.pos).applyQuaternion(b.surface!.quaternion.clone().invert()).normalize();
        const u = Math.atan2(local.z, -local.x) / (Math.PI * 2);
        return { orbita: b.name, altitude: state.shipPos.distanceTo(b.pos) / b.radius - 1, coluna: (u < 0 ? u + 1 : u) * 1024, linha: (Math.acos(local.y) / Math.PI) * 512, baixo: b.pos.clone().set(0, 0, -1).applyQuaternion(state.shipQuat).dot(b.pos.clone().sub(state.shipPos).normalize()) };
      });
      expect(sobre.orbita, `volta ${i + 1}: a nave ficou em órbita`).toBe('Terra');
      expect(sobre.altitude).toBeCloseTo(2.9, 1);
      // A nave não para sobre o mesmo ponto: a 2,9 raios ela não anda com o planeta, e o tempo corre desde a subida, 8 tiles por segundo.
      expect(Math.abs(((sobre.coluna - centro[0] + 1536) % 1024) - 512), 'a mesma coluna do centro do mapa').toBeLessThan(40);
      expect(Math.abs(sobre.linha - (512 - centro[1])), 'a mesma linha do centro do mapa').toBeLessThan(40);
      expect(sobre.baixo, 'apontando para baixo').toBeGreaterThan(0.99);
      if (i === 0) primeira = await longe();
      else if (i === 9) {
        const ultima = await longe();
        console.log('contas da GPU na primeira e na décima volta:', primeira, ultima);
        expect(ultima).toEqual(primeira);
      }
      await page.evaluate(() => void window.space!.goToPlanet('Terra', 3));
    }
  });

  test('o Esc sobe direto; a nave volta ao mesmo lugar, e não pousa de novo sozinha', async ({ page }) => {
    test.setTimeout(MAPA_MS + 60_000);
    await page.goto('/?debug');
    await expect(espaco(page)).toBeVisible();
    await page.keyboard.press('Digit1');
    await esperarOrbita(page, 'Terra');
    await esperarSemCortina(page);
    await expect.poll(() => page.evaluate(() => !!window.space!.systems.orbitBody!.quad), { timeout: MAPA_MS }).toBe(true);
    await page.evaluate(() => void window.space!.goToPlanet('Terra', 1.04));
    await page.waitForTimeout(500);
    await page.keyboard.press('KeyF');
    await expect(superficie(page)).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');
    await esperarOrbita(page, 'Terra');
    await esperarSemCortina(page);
    await page.waitForTimeout(1000);
    const altitude = await page.evaluate(() => {
      const { state, systems } = window.space!;
      const b = systems.orbitBody!;
      return state.shipPos.distanceTo(b.pos) / b.radius - 1;
    });
    expect(altitude).toBeCloseTo(0.04, 3);
    await expect(page.locator('.surface-hud')).toHaveCount(0);
  });

  test('rente à montanha mais alta, sem frestas entre os pedaços', async ({ page }, info) => {
    test.setTimeout(MAPA_MS + 60_000);
    await page.goto('/?debug');
    await expect(espaco(page)).toBeVisible();
    await page.keyboard.press('Digit1');
    await esperarOrbita(page, 'Terra');
    await esperarSemCortina(page);
    await expect.poll(() => page.evaluate(() => !!window.space!.systems.orbitBody!.quad), { timeout: MAPA_MS }).toBe(true);
    const alvo = await montanhaMaisAlta(page);
    const voar = (raios: number, rente: boolean) => voarSobre(page, alvo, raios, rente);
    for (const [nome, raios, rente] of [
      ['a-prumo-0-15-raio', 1.15, false],
      ['a-prumo-0-05-raio', 1.05, false],
      ['rente-0-05-raio', 1.05, true],
      ['rente-no-piso', 1.022, true],
    ] as const) {
      await voar(raios, rente);
      await page.waitForTimeout(1500);
      // Rente, o meio da tela é o céu: só faz sentido medir a prumo. Foto tirada na hora: o tempo corre, e o lugar anoitece.
      if (!rente) await esperarImagem(page, nome, 0.2);
      await capturar(page, info, nome);
    }
  });

  test('sem WebGL, fica a esfera, e a nave para a 1,6 raio', async ({ page }, info) => {
    await page.goto('/?debug&soft');
    await expect(espaco(page)).toBeVisible();
    await page.keyboard.press('Digit1');
    await esperarOrbita(page, 'Terra');
    await esperarSemCortina(page);
    expect(await usaWebGL(page)).toBe(false);
    await page.evaluate(() => void window.space!.goToPlanet('Terra', 1.2));
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyW');
    const estado = await page.evaluate(() => {
      const { state, systems } = window.space!;
      const b = systems.orbitBody!;
      return { raios: state.shipPos.distanceTo(b.pos) / b.radius, quad: !!b.quad, esfera: b.surface!.visible, tipo: (b.surface as unknown as { material: { type: string } }).material.type };
    });
    expect(estado.raios).toBeGreaterThanOrEqual(1.6 - 1e-6);
    expect(estado).toMatchObject({ quad: false, esfera: true, tipo: 'MeshLambertMaterial' });
    await esperarImagem(page, 'a esfera na tela');
    await capturar(page, info, 'sem-webgl-1-6-raio');
  });

  test('a medida da descida: chamadas de desenho e bytes na GPU, no painel DEV', async ({ page }) => {
    test.setTimeout(MAPA_MS + 60_000);
    await page.goto('/?debug');
    await expect(espaco(page)).toBeVisible();
    await page.keyboard.press('Digit1');
    await esperarOrbita(page, 'Terra');
    await esperarSemCortina(page);
    await expect.poll(() => page.evaluate(() => !!window.space!.systems.orbitBody!.quad), { timeout: MAPA_MS }).toBe(true);
    await page.locator('.dev-pill').click();
    const medir = () => page.evaluate(() => ({ chamadas: window.space!.drawCalls, bytes: window.space!.gpuBytes() }));
    for (const raios of [1.6, 1.2, 1.05, 1.02]) {
      await page.evaluate((r) => void window.space!.goToPlanet('Terra', r), raios);
      await page.waitForTimeout(1500);
      const { chamadas, bytes } = await medir();
      console.log(`a ${raios} raios: ${chamadas} chamadas de desenho, ${(bytes / 1048576).toFixed(1)} MB na GPU`);
      expect(chamadas).toBeGreaterThan(0);
      expect(chamadas).toBeLessThan(300);
      expect(bytes).toBeLessThan(64 * 1048576);
    }
    await expect(page.locator('[data-h="drawCalls"]')).toHaveText(/^\d+$/);
    await expect(page.locator('[data-h="gpuBytes"]')).toHaveText(/\d MB$/);
  });

  test('a borda azul da Terra e a alaranjada de Marte', async ({ page }, info) => {
    await page.goto('/?debug');
    await expect(espaco(page)).toBeVisible();
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
