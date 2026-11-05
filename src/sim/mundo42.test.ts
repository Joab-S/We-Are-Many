import { beforeAll, describe, expect, it } from 'vitest';
import { AVENUE, mainStreets } from './architecture';
import { MAIN_STREET_SHARE } from './balance';
import { housesOffStreet, liveVillages } from './calibrate';
import { YEAR_SECONDS } from './ecosystem';
import { roadBlocks } from './settlement';
import { sharedWorld } from './sharedWorld';

/**
 * Os testes de mundo longo da semente 42: rodam um mundo só, de 200 anos, fotografado aos 120 e aos 200 (antes cada
 * um rodava o seu, em settlement, roads e architecture). Cada teste recebe a sua cópia do mundo.
 */
let world: ReturnType<typeof sharedWorld>;
beforeAll(() => {
  world = sharedWorld(42, [120, 200]);
}, 180000);

describe('assentamentos num mundo de 120 anos (semente 42)', () => {
  it('o contorno do assentamento envolve todas as casas, plantações e currais sem deixar nenhum de fora', () => {
    const eco = world.at(120);
    const mw = eco.map.width;
    for (const v of eco.villages) {
      if (v.abandoned) continue;
      for (const h of v.houses) {
        const s = h.kind === 'port' ? 1 : 2;
        expect(eco.villageAt(h.x + s * 0.5, h.y + s * 0.5)).toBe(v);
      }
      for (const p of v.pens ?? []) {
        expect(eco.villageAt(p.x + 1, p.y + 1)).toBe(v);
      }
      const cx = Math.floor(v.x);
      const cy = Math.floor(v.y);
      const scanR = Math.ceil(eco.radius(v)) + 3;
      for (let dy = -scanR; dy <= scanR; dy++) {
        for (let dx = -scanR; dx <= scanR; dx++) {
          const y = cy + dy;
          if (y < 0 || y >= eco.map.height) continue;
          const x = (((cx + dx) % mw) + mw) % mw;
          if (eco.road[y * mw + x] !== 4) continue;
          expect(eco.villageAt(cx + dx + 0.5, cy + dy + 0.5)).toBeTruthy();
        }
      }
    }
  }, 60000);
});

describe('ruas num mundo de 200 anos (semente 42)', () => {
  it('nenhuma rua dupla e toda casa na beira da rua', () => {
    const eco = world.at(200);
    const live = liveVillages(eco);
    expect(live.length).toBeGreaterThan(5);
    expect(roadBlocks(eco.road, eco.map.width, eco.map.height)).toBe(0);
    expect(housesOffStreet(eco, live)).toBe(0);
  });
});

describe('arquitetura num mundo de 200 anos (semente 42)', () => {
  it('num mundo de 200 anos as cidades ganham avenida e ruas principais sem blocos 2x2 fora dela, e a troca de era é gradual', () => {
    const eco = world.at(200);
    const e = eco as unknown as { road: Uint8Array };
    expect(roadBlocks(e.road, eco.map.width, eco.map.height)).toBe(0);
    const live = eco.villages.filter((v) => !v.abandoned);
    expect(live.every((v) => v.material)).toBe(true);
    // As ruas principais são revistas a cada 10 anos (e na troca de era): o lugar que virou vila há pouco ainda não
    // passou por isso. Revê agora, para o teste não depender do ano em que a semente promoveu o lugar.
    for (const v of live) if (v.tier >= 1) eco.rankStreets(v);
    let main = 0;
    for (let i = 0; i < eco.mainStreet.length; i++) main += eco.mainStreet[i];
    // Rua principal pede tronco: as ruas nascem do uso (RF-AS-13), e a vila com trilhas e trechos soltos, longe da
    // praça, não tem tronco. Cobra a marcação só da vila cuja rede ligada à praça já forma um (antes, de qualquer vila;
    // quantas ruas cada uma abriu em 200 anos, e onde, depende da história da semente).
    const w = eco.map.width;
    const trunk = (v: (typeof live)[number]) => {
      const streets = new Set<number>();
      const r = Math.ceil(eco.radius(v));
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const t = eco.tileAt(v.x + dx, Math.floor(v.y + dy));
          if (t >= 0 && dx * dx + dy * dy <= r * r && (e.road[t] === 1 || e.road[t] === 2 || e.road[t] === AVENUE)) streets.add(t);
        }
      }
      const square: number[] = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) square.push(eco.tileAt(Math.floor(v.x) + dx, Math.floor(v.y) + dy));
      const next = (t: number) => {
        const x = t % w;
        const y = (t - x) / w;
        return [eco.tileAt(x + 1, y), eco.tileAt(x - 1, y), eco.tileAt(x, y + 1), eco.tileAt(x, y - 1)];
      };
      return mainStreets(streets, square.filter((t) => t >= 0), next, MAIN_STREET_SHARE).size;
    };
    if (live.some((v) => v.tier >= 1 && trunk(v) > 0)) expect(main).toBeGreaterThan(0);
    const city = live.filter((v) => v.tier >= 2).sort((a, b) => b.population - a.population)[0];
    if (city) {
      let avenue = 0;
      for (let i = 0; i < e.road.length; i++) if (e.road[i] === AVENUE) avenue++;
      expect(avenue).toBeGreaterThan(0);
    }
    // Era nova: casas antigas continuam de pé e vão sendo trocadas aos poucos.
    // Lugar com canteiro livre: obra parada por falta de lenha não diz nada sobre a troca de estilo.
    const idle = live.filter((o) => o.houses.every((h) => !((h.labor ?? 0) > 0)));
    const v = (idle.length ? idle : live).sort((a, b) => b.houses.length - a.houses.length)[0];
    v.tech = Math.floor(v.tech) + 1.01;
    v.stock.wood = v.stock.stone = v.stock.brick = 200;
    const old = () => v.houses.filter((h) => h.kind === 'house' && (h.era ?? 99) < Math.floor(v.tech)).length;
    const before = old();
    expect(before).toBeGreaterThan(2);
    for (let t = 0; t < YEAR_SECONDS * 2; t += 0.25) eco.step(0.25);
    const mid = old();
    expect(mid).toBeGreaterThan(0);
    for (let t = 0; t < YEAR_SECONDS * 30; t += 0.25) eco.step(0.25);
    expect(old()).toBeLessThan(before);
  }, 120000);
});
