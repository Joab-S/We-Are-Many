import { describe, expect, it } from 'vitest';
import { AVENUE, houseStyle, isStreet, mainStreets, pickMaterial } from './architecture';
import { runWorld } from './calibrate';
import { YEAR_SECONDS } from './ecosystem';
import { roadBlocks } from './settlement';

describe('arquitetura que acompanha a era (19.8)', () => {
  it('estilo pela era da casa, com sobrado na cidade medieval e um estilo a mais por andar', () => {
    expect(houseStyle(0, 0)).toBe('hut');
    expect(houseStyle(2, 1)).toBe('house');
    expect(houseStyle(3, 1)).toBe('stoneHouse');
    expect(houseStyle(3, 2)).toBe('townhouse');
    expect(houseStyle(1, 0, 1)).toBe('house');
    expect(houseStyle(4, 0, 2)).toBe('townhouse');
  });

  it('material pelo entorno: frio, deserto, rocha, mata, barro', () => {
    const base = { rock: 0, forest: 0, desert: 0, cold: 0, wet: false };
    expect(pickMaterial({ ...base, cold: 0.6, rock: 0.5 })).toBe('snow');
    expect(pickMaterial({ ...base, desert: 0.5 })).toBe('adobe');
    expect(pickMaterial({ ...base, rock: 0.3, forest: 0.7 })).toBe('stone');
    expect(pickMaterial({ ...base, forest: 0.7, wet: true })).toBe('wood');
    expect(pickMaterial({ ...base, wet: true })).toBe('brick');
    expect(pickMaterial(base)).toBe('plain');
  });

  it('rua principal é o tronco por onde passa a maior parte da rede', () => {
    // Uma linha de 10 tiles saindo da praça (0) com 3 vielas curtas no fim.
    const streets = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 101, 102, 103]);
    const next = (t: number) => (t === 10 ? [9, 101, 102, 103] : t > 100 ? [10] : [t - 1, t + 1]);
    const main = mainStreets(streets, [0], next, 0.3, 4);
    expect(main.has(1)).toBe(true);
    expect(main.has(8)).toBe(true);
    expect(main.has(101)).toBe(false);
    expect(isStreet(AVENUE)).toBe(true);
    expect(isStreet(4)).toBe(false);
  });

  it('num mundo de 200 anos as cidades ganham avenida e ruas principais sem blocos 2x2 fora dela, e a troca de era é gradual', () => {
    const { eco } = runWorld(42, 200);
    const e = eco as unknown as { road: Uint8Array };
    expect(roadBlocks(e.road, eco.map.width, eco.map.height)).toBe(0);
    const live = eco.villages.filter((v) => !v.abandoned);
    expect(live.every((v) => v.material)).toBe(true);
    // As ruas principais são revistas a cada 10 anos (e na troca de era): o lugar que virou vila há pouco ainda não
    // passou por isso. Revê agora, para o teste não depender do ano em que a semente promoveu o lugar.
    for (const v of live) if (v.tier >= 1) eco.rankStreets(v);
    let main = 0;
    for (let i = 0; i < eco.mainStreet.length; i++) main += eco.mainStreet[i];
    // Rua principal pede rede de ruas: as ruas nascem do uso (RF-AS-13), e a vila que ainda só tem trilhas e um
    // trecho solto não tem tronco. Conta só a vila com ruas de verdade no território (antes, qualquer vila; quantas
    // ruas cada uma abriu em 200 anos depende da história da semente).
    const streetsOf = (v: (typeof live)[number]) => {
      let n = 0;
      const r = Math.ceil(eco.radius(v));
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const t = eco.tileAt(v.x + dx, Math.floor(v.y + dy));
          if (t >= 0 && dx * dx + dy * dy <= r * r && (e.road[t] === 1 || e.road[t] === 2 || e.road[t] === AVENUE)) n++;
        }
      }
      return n;
    };
    if (live.some((v) => v.tier >= 1 && streetsOf(v) >= 20)) expect(main).toBeGreaterThan(0);
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
