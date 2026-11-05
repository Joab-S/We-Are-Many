import { espaco, expect, MAPA_MS, superficie, test } from './apoio';

/**
 * Recarregar um save de verdade, no IndexedDB do navegador. As funções abaixo rodam dentro da página e repetem o banco
 * e a chave de `src/save/store.ts` e `manager.ts`: o teste mexe no que está gravado, como um save feito por uma versão
 * antiga do jogo.
 */

/** Abre o banco de saves e entrega a `fn` a loja, numa transação; o resultado sai quando a transação termina. */
function comSaves<T>(modo: IDBTransactionMode, fn: (loja: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const aberto = indexedDB.open('we-are-many', 1);
    aberto.onerror = () => reject(aberto.error);
    aberto.onsuccess = () => {
      const tx = aberto.result.transaction('saves', modo);
      const pedido = fn(tx.objectStore('saves'));
      tx.oncomplete = () => resolve(pedido.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    };
  });
}

test('um save da versão 1, sem a física dos planetas, recarrega com a da Terra', async ({ page }) => {
  await page.goto('/?debug');
  await expect(espaco(page)).toBeVisible();
  await page.evaluate(() => window.debugEarth!());
  await expect(superficie(page)).toBeVisible({ timeout: MAPA_MS });
  // Voltar ao espaço grava o jogo.
  await page.keyboard.press('Escape');
  await expect(espaco(page)).toBeVisible();

  const temTerra = `(${comSaves})('readonly', (loja) => loja.get('atual')).then((save) => !!save?.surfaces?.has('sol-3'))`;
  await expect.poll(() => page.evaluate(temTerra)).toBe(true);

  const envelhecer = `(async () => {
    // O jogo grava ao sair da página: isso apagaria o save antigo antes de ele ser carregado.
    window.addEventListener('pagehide', (e) => e.stopImmediatePropagation(), { capture: true });
    document.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), { capture: true });
    const comSaves = ${comSaves};
    const save = await comSaves('readonly', (loja) => loja.get('atual'));
    save.version = 1;
    for (const map of save.surfaces.values()) {
      for (const campo of ['star', 'axialTilt', 'dayHours', 'periodYears', 'atmosphere']) delete map.params[campo];
    }
    await comSaves('readwrite', (loja) => loja.put(save, 'atual'));
  })()`;
  await page.evaluate(envelhecer);

  await page.reload();
  await expect(espaco(page)).toBeVisible();

  // Num jogo novo, a Terra só tem mapa depois de visitada: com ele aqui, o jogo veio do save.
  const params = await page.evaluate(() => window.space!.state.surfaces.get('sol-3')?.params);
  expect(params).toMatchObject({
    id: 'sol-3',
    star: { luminosity: 1, kelvin: 5772 },
    axialTilt: 0.41,
    dayHours: 24,
    periodYears: 1,
    atmosphere: { pressure: 1, greenhouse: 33 },
  });
  // E o save não foi recusado.
  expect(await page.evaluate(`(${comSaves})('readonly', (loja) => loja.getKey('recusado'))`)).toBeUndefined();
});
