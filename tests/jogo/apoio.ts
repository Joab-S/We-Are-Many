import { expect, test as base, type Page, type TestInfo } from '@playwright/test';

/**
 * O que os testes do jogo têm em comum. As teclas vão pelo `KeyboardEvent.code`, como o jogo as lê (`Digit1`, `KeyF`,
 * tabelas em `src/client/space/commands.ts` e `surface/keys.ts`): o `Input` guarda o aperto até o próximo quadro, e cada
 * modo tem o seu `Input`, então uma tecla só vale depois que o modo abriu. Por isso cada passo espera o anterior aparecer
 * na tela: F fora de órbita não faz nada, e F é outra coisa na superfície (seguir), como 1 (velocidade).
 */

export const test = base.extend<{ erros: string[] }>({
  // Automático: qualquer teste falha se o jogo registrar um erro. Os "Falha ao salvar" e "Falha ao gerar a prévia" o jogo
  // registra como aviso e continua, mas são erros. Um teste que provoca um erro de propósito esvazia a lista.
  erros: [
    async ({ page }, use) => {
      const erros: string[] = [];
      page.on('pageerror', (e) => erros.push(`exceção: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error' || (m.type() === 'warning' && m.text().startsWith('Falha'))) erros.push(`console.${m.type()}: ${m.text()}`);
      });
      // As fontes vêm do Google: sem resposta aqui, um teste offline falharia por causa delas (e o teste não depende de rede).
      await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) => r.fulfill({ contentType: 'text/css', body: '' }));
      await use(erros);
      expect(erros, 'o console do jogo não pode ter erros').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Tempo para a nave descer: o mapa é gerado num Worker. */
export const MAPA_MS = 120_000;

/** A barra de comandos do espaço: aparece quando o modo abriu (a `.space-hud` em si não tem tamanho). */
export const espaco = (page: Page) => page.locator('.space-hud .hud-help');
export const orbita = (page: Page) => page.locator('.space-hud .hud-orbit');
/** O botão de voltar à órbita só existe depois que o mapa da superfície ficou pronto e o laço começou. */
export const superficie = (page: Page) => page.locator('.surface-hud:not(.fusing) [data-a="back"]');

/** Espera o menu de órbita do planeta. Pelo texto visível: o CSS põe em maiúsculas, e no `hidden` ele fica vazio. */
export async function esperarOrbita(page: Page, planeta: string): Promise<void> {
  await expect(orbita(page)).toContainText('EM ÓRBITA', { useInnerText: true });
  await expect(orbita(page)).toContainText(planeta.toUpperCase(), { useInnerText: true });
}

/** A cortina da troca de modo já abriu, até o fim da transição: antes disso ela ainda escurece as fotos. */
export async function esperarSemCortina(page: Page): Promise<void> {
  await expect(page.locator('#fade')).not.toHaveClass(/\bon\b/);
  await expect(page.locator('#fade')).toHaveCSS('opacity', '0');
}

/** O canvas do jogo está no WebGL (e não caiu sozinho no renderizador por software). */
export const usaWebGL = (page: Page) => page.evaluate(() => !!document.querySelector<HTMLCanvasElement>('#app canvas')?.getContext('webgl2'));

/** Foto da tela, guardada em `test-results/<teste>/`. */
export async function capturar(page: Page, info: TestInfo, nome: string): Promise<void> {
  await page.screenshot({ path: info.outputPath(`${nome}.png`) });
}

/** O meio da tela, longe do HUD: em órbita, o planeta; na superfície, o mapa. */
const MEIO = { x: 540, y: 280, width: 200, height: 120 };

/**
 * Parte do meio da tela com imagem de verdade, de 0 a 1, medida na própria foto (o que o jogador vê). Pega a tela preta
 * com o console limpo: o WebGL que desenha nada não registra erro. O branco também não conta: no primeiro segundo de um
 * navegador recém-aberto, sem GPU, o contexto WebGL às vezes cai e volta sozinho, e nesse meio tempo a foto sai branca.
 */
export async function parteDesenhada(page: Page): Promise<number> {
  const png = await page.screenshot({ clip: MEIO });
  return page.evaluate(async (base64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      const sum = data[i] + data[i + 1] + data[i + 2];
      if (sum > 30 && sum < 735) lit++;
    }
    return lit / (data.length / 4);
  }, png.toString('base64'));
}

/** Espera a imagem aparecer no meio da tela. Vem antes da foto, para ela não sair branca nem preta. */
export async function esperarImagem(page: Page, oQue: string, minimo = 0.5): Promise<void> {
  await expect.poll(() => parteDesenhada(page), { message: oQue }).toBeGreaterThan(minimo);
}
