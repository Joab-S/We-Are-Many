import { describe, expect, it } from 'vitest';
import { earthParams, seedPlanet } from '../calibrate';
import { pessoasGen } from '../observador/retrato';

/**
 * Encontro da mente generativa com o andarilho da development: as duas tratam quem vive sem lugar. Num mundo
 * generativo, quem está perto da tela pensa pelo modelo generativo (`genStep`) e nunca ganha a mente do andarilho
 * (`lonerStep`), que é do mundo de vilas.
 */
describe('mundo generativo e o andarilho', () => {
  it('perto da tela, quem vive sem lugar pensa pelo modelo generativo, não pela mente do andarilho', () => {
    const { eco } = seedPlanet(earthParams(0.25), 17, undefined, { espalhados: 16 });
    const e = eco as unknown as { mindNow(i: number): unknown; lonerMinded(i: number): boolean };
    const alguem = pessoasGen(eco)[0];
    expect(alguem).toBeDefined();
    const uid = eco.uid[alguem.i];
    let perto = 0;
    for (let t = 0; t < 24; t += 0.25) {
      const i = eco.findUid(uid);
      if (i < 0) break;
      eco.focus = { x: eco.x[i], y: eco.y[i], r: 30 };
      eco.step(0.25);
      for (const { i: k } of pessoasGen(eco)) {
        if (!e.lonerMinded(k)) continue;
        perto++;
        // Nenhuma mente do andarilho, e a ficha não lê decisão do andarilho para ela.
        expect(e.mindNow(k)).toBeUndefined();
        expect(eco.dayOf(k).note).toBeNull();
      }
    }
    // Quem a câmera segue pensa de perto pelo modelo generativo.
    const j = eco.findUid(uid);
    expect(j).toBeGreaterThanOrEqual(0);
    expect(eco.genMenteDe(j)?.detalhe).toBe(1);
    expect(perto).toBeGreaterThan(0);
    expect(eco.villages).toHaveLength(0);
  }, 60_000);
});
