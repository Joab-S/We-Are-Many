import { describe, expect, it } from 'vitest';
import { generateSurface, type PlanetParams } from '../procgen/surface';
import { emptyStock, forge } from './economy';
import { Ecosystem, isLand } from './ecosystem';
import { ROLE } from './roles';
import { nativeSpecies } from './species';

const earth: PlanetParams = { id: 'sol-3', name: 'Terra', radiusEarth: 0.4, temperatureK: 288, water: 0.6, life: 0.85 };

function world() {
  const map = generateSurface(earth);
  const eco = new Ecosystem(map, 42);
  for (const sp of nativeSpecies(earth)) eco.addSpecies(sp);
  eco.populate();
  return { map, eco };
}

describe('economia', () => {
  it('o planeta tem jazidas limitadas em rocha e colinas', () => {
    const { eco, map } = world();
    expect(eco.deposits.length).toBeGreaterThan(3);
    for (const d of eco.deposits) {
      expect(d.amount).toBeGreaterThan(0);
      expect(eco.depositAt[d.y * map.width + d.x]).toBe(d.id);
    }
  });

  it('ferreiros respeitam a sequência física: bronze/cobre primeiro, ferro só com siderurgia e aço com carvão', () => {
    const st = { ...emptyStock(), copper: 4, tin: 1, iron: 4, coal: 2 };
    expect(forge(st, 0)?.kind).toBe('bronze');
    expect(forge(st, 0)).toBeNull();
    // Com a técnica de fundição, o cobre que sobrou pode ser forjado mesmo sem estanho; ferro ainda não.
    expect(forge(st, 0, new Set(['fundicao']))?.kind).toBe('bronze');
    expect(forge(st, 0, new Set(['fundicao']))).toBeNull();
    // Com siderurgia, o ferro passa a ser forjado; com aço, usa ferro + carvão.
    expect(forge(st, 1, new Set(['fundicao', 'siderurgia']))?.kind).toBe('iron');
    expect(forge(st, 2, new Set(['fundicao', 'siderurgia', 'aco']))?.kind).toBe('steel');
  });

  it('sem minério trabalhado ou fundição a era não muda, respeitando a sequência lógica', () => {
    const { eco } = world();
    const v = eco.villages[0];
    eco.teach(v.x, v.y, 3, 3);
    expect(v.tech).toBeLessThan(1);
    expect(eco.eraNeed(v)).toContain('bronze');
    v.made.bronze = 5;
    eco.teach(v.x, v.y, 3, 0.1);
    expect(v.tech).toBeLessThan(1);
    v.pts = [200, 200, 200, 0, 0, 0];
    eco.teach(v.x, v.y, 3, 0.1);
    expect(v.tech).toBeGreaterThanOrEqual(1);
  });

  it('o jogador coloca um veio; o povo o descobre e abre uma mina', () => {
    const { eco, map } = world();
    const v = eco.villages[0];
    // Um tile de terra livre perto da aldeia.
    let spot = -1;
    for (let r = 4; r < 12 && spot < 0; r++) {
      for (let a = 0; a < 16 && spot < 0; a++) {
        const x = Math.floor(v.x + Math.cos(a) * r);
        const y = Math.floor(v.y + Math.sin(a) * r);
        const t = y * map.width + x;
        if (isLand(map, t) && !eco.road[t] && !eco.built[t] && eco.depositAt[t] < 0) spot = t;
      }
    }
    expect(eco.placeOre(spot % map.width, Math.floor(spot / map.width), 'copper')).toBe(true);
    const d = eco.deposits[eco.depositAt[spot]];
    expect(d.ore).toBe('copper');
    d.known.add(v.kingdom);
    // Garante mineradores e madeira para abrir a mina.
    for (let i = 0; i < eco.count; i++) if (eco.alive[i] && eco.village[i] === v.id && eco.role[i] !== 255) eco.role[i] = ROLE.miner;
    v.stock.wood = 100;
    for (let t = 0; t < 600 && d.mine < 0; t++) eco.step(0.1);
    expect(d.mine).toBe(v.id);
    const before = d.amount;
    for (let t = 0; t < 300; t++) eco.step(0.1);
    expect(d.amount).toBeLessThan(before);
    expect(v.stock.copper).toBeGreaterThan(0);
  });
});
