import { beforeAll, describe, expect, it } from 'vitest';
import { housesOffStreet, indicatorsOf, liveVillages } from './calibrate';
import { roadBlocks, maxFieldsOf, maxPensOf } from './settlement';
import { sharedWorld } from './sharedWorld';

/**
 * Os testes de mundo longo da semente 7: rodam um mundo só, de 300 anos, fotografado aos 200, 250 e 300 (antes cada
 * um rodava o seu, em roads, war e clutter). Cada teste recebe a sua cópia do mundo.
 */
let world: ReturnType<typeof sharedWorld>;
beforeAll(() => {
  world = sharedWorld(7, [200, 250, 300]);
}, 240000);

describe('ruas num mundo de 200 anos (semente 7)', () => {
  it('nenhuma rua dupla e toda casa na beira da rua', () => {
    const eco = world.at(200);
    const live = liveVillages(eco);
    expect(live.length).toBeGreaterThan(5);
    expect(roadBlocks(eco.road, eco.map.width, eco.map.height)).toBe(0);
    expect(housesOffStreet(eco, live)).toBe(0);
  });
});

describe('guerras num mundo de 250 anos (semente 7)', () => {
  it('toda declaração tem motivo na crônica e toda guerra de preparo teve um plano', () => {
    const eco = world.at(250);
    const nan = { wars: NaN, cavalry: NaN, caravans: NaN, caravansMax: NaN, mid: NaN, trees0: NaN, trees: NaN };
    expect(indicatorsOf(eco, 7, { years: 250, villages: 6 }, nan).warsNoMotive).toBe(0);
    expect(eco.tally.plans).toBeGreaterThanOrEqual(eco.tally.wars - eco.tally.civilWars);
  });
});

/** Mapa limpo: currais do tamanho do rebanho e sem cercas largadas pelo mundo. */
describe('currais e roças num mundo de 300 anos (semente 7)', () => {
  it('em 300 anos cada assentamento tem só os cercados de que o rebanho precisa, e no máximo 5 cercados e 5 roças', () => {
    const eco = world.at(300);
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
