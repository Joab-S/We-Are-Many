import { describe, expect, it } from 'vitest';
import { runWorld } from './calibrate';

/** Mapa limpo: currais do tamanho do rebanho e sem cercas largadas pelo mundo. */
describe('currais e roças', () => {
  it('em 300 anos cada assentamento tem só os cercados de que o rebanho precisa', () => {
    const { eco } = runWorld(7, 300);
    const road = (eco as unknown as { road: Uint8Array }).road;
    let pens = 0;
    for (const v of eco.villages) {
      const n = v.pens?.length ?? 0;
      if (v.abandoned) continue;
      pens += n;
      const max = 1 + v.tier * 2 + (v.vocation === 'gado' || v.vocation === 'ovelhas' || v.vocation === 'cavalos' ? 2 : 0);
      expect(n).toBeLessThanOrEqual(max + 1);
      // Sem rebanho, o curral vazio é desmontado em poucos anos.
      if (!v.herd) expect(n).toBeLessThanOrEqual(2);
    }
    let pasture = 0;
    for (let t = 0; t < road.length; t++) if (road[t] === 5) pasture++;
    // Quase todo tile de pasto é de um cercado de quem ainda vive (sobra só o das ruínas que ainda não sumiram).
    expect(pasture).toBeLessThanOrEqual(pens * 4 + 40);
  }, 120000);
});
