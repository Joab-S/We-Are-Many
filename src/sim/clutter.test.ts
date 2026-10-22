import { describe, expect, it } from 'vitest';
import { runWorld } from './calibrate';
import { maxFieldsOf, maxPensOf } from './settlement';

/** Mapa limpo: currais do tamanho do rebanho e sem cercas largadas pelo mundo. */
describe('currais e roças', () => {
  it('em 300 anos cada assentamento tem só os cercados de que o rebanho precisa, e no máximo 5 cercados e 5 roças', () => {
    const { eco } = runWorld(7, 300);
    const road = (eco as unknown as { road: Uint8Array }).road;
    let pens = 0;
    for (const v of eco.villages) {
      const n = v.pens?.length ?? 0;
      if (v.abandoned) continue;
      pens += n;
      // No máximo 5 cercados e 5 roças, pelo tamanho (pedido do Joab); a sobra de quem caiu de nível some em poucos anos.
      expect(n).toBeLessThanOrEqual(Math.min(5, maxPensOf(v.tier, v.vocation) + 1));
      expect(v.fields).toBeLessThanOrEqual(Math.min(5, maxFieldsOf(v.tier) + 1));
      // Sem rebanho, o curral vazio é desmontado em poucos anos.
      if (!v.herd) expect(n).toBeLessThanOrEqual(2);
    }
    let pasture = 0;
    for (let t = 0; t < road.length; t++) if (road[t] === 5) pasture++;
    // Quase todo tile de pasto é de um cercado de quem ainda vive (sobra só o das ruínas que ainda não sumiram).
    expect(pasture).toBeLessThanOrEqual(pens * 4 + 40);
  }, 120000);
});
