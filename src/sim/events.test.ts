import { describe, expect, it } from 'vitest';
import { generateSurface, type PlanetParams } from '../procgen/surface';
import { Ecosystem, isLand, YEAR_SECONDS } from './ecosystem';
import { runEvent } from './events';
import { ITEMS, pickItem } from './items';
import { nativeSpecies } from './species';

const earth: PlanetParams = { id: 'sol-3', name: 'Terra', radiusEarth: 0.4, temperatureK: 288, water: 0.6, life: 0.85 };

function world() {
  const map = generateSurface(earth);
  const eco = new Ecosystem(map, 42);
  for (const sp of nativeSpecies(earth)) eco.addSpecies(sp);
  eco.populate();
  return { map, eco };
}

const years = (eco: Ecosystem, n: number) => {
  for (let t = 0; t < n * YEAR_SECONDS; t += 0.1) eco.step(0.1);
};

describe('crônica', () => {
  it('repetições do mesmo assunto viram uma linha com contagem e lugares', () => {
    const { eco } = world();
    const before = eco.chronicle.length;
    eco.note('Tempestades afundaram barcos de pesca', 'mar', null, { key: 'storm-fish', place: 'Aldeia A' });
    eco.note('Tempestades afundaram barcos de pesca', 'mar', null, { key: 'storm-fish', place: 'Aldeia B' });
    eco.note('Tempestades afundaram barcos de pesca', 'mar', null, { key: 'storm-fish', place: 'Aldeia A' });
    expect(eco.chronicle.length).toBe(before + 1);
    expect(Ecosystem.describe(eco.chronicle[0])).toBe('Tempestades afundaram barcos de pesca (Aldeia A, Aldeia B) ×3');
  });
});

describe('eventos do mundo', () => {
  it('um cometa abre uma cratera com água e deixa minério', () => {
    const { map, eco } = world();
    let i = 0;
    while (!(isLand(map, i) && map.elevation[i] > 0.15)) i++;
    const x = (i % map.width) + 0.5;
    const y = Math.floor(i / map.width) + 0.5;
    const deposits = eco.deposits.length;
    expect(runEvent(eco, 'comet', x, y)).toBe(true);
    expect(map.elevation[i]).toBeLessThan(0);
    expect(eco.deposits.length).toBeGreaterThanOrEqual(deposits);
    expect(eco.chronicle[0].text).toContain('cometa');
    expect(eco.chronicle[0].major).toBe(true);
  });

  it('um terremoto mexe no relevo', () => {
    const { map, eco } = world();
    const before = Float32Array.from(map.elevation);
    expect(runEvent(eco, 'quake')).toBe(true);
    expect(map.elevation.some((e, k) => e !== before[k])).toBe(true);
  });

  it('nômades fundam um povo novo noutro lugar', () => {
    const { eco } = world();
    years(eco, 5);
    const villages = eco.villages.length;
    expect(runEvent(eco, 'nomads')).toBe(true);
    expect(eco.villages.length).toBe(villages + 1);
    const v = eco.villages[eco.villages.length - 1];
    expect(v.kingdom).toBe(v.id);
  });

  it('surge uma variante de uma espécie', () => {
    const { eco } = world();
    const species = eco.species.length;
    expect(runEvent(eco, 'newSpecies')).toBe(true);
    expect(eco.species.length).toBe(species + 1);
    expect(eco.species[species].parent).toBeDefined();
  });
});

describe('itens', () => {
  it('o catálogo tem ferramentas, armas, armaduras e joias, e a era limita o que sai', () => {
    for (const c of ['ferramenta', 'arma', 'armadura', 'joia']) expect(ITEMS.some((it) => it.category === c)).toBe(true);
    expect(pickItem('steel', 'arma', 3, 0.99)!.name).not.toBe('Mosquete');
    expect(pickItem('steel', 'arma', 4, 0.99)!.name).toBe('Mosquete');
  });

  it('os povos fazem itens com o tempo', () => {
    const { eco } = world();
    years(eco, 40);
    expect(eco.crafted.size).toBeGreaterThan(0);
  });
});

describe('soltar uma criatura', () => {
  const landFar = (eco: Ecosystem, map: ReturnType<typeof generateSurface>, s: number) => {
    for (let i = 0; i < map.width * map.height; i++) {
      const x = (i % map.width) + 0.5;
      const y = Math.floor(i / map.width) + 0.5;
      if (y > map.height * 0.3 && y < map.height * 0.7 && eco.habitable(s, i) && eco.villages.every((v) => Math.hypot(v.x - x, v.y - y) > 60)) return { x, y };
    }
    throw new Error('sem lugar');
  };

  it('um inteligente sozinho e longe de todos funda um assentamento só com ele', () => {
    const { map, eco } = world();
    const s = eco.species.findIndex((sp) => sp.kind === 'sapient');
    const { x, y } = landFar(eco, map, s);
    const villages = eco.villages.length;
    const i = eco.introduceOne(s, x, y);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(eco.village[i]).toBe(-1);
    // Ele anda até achar um lugar bom e funda quando decide (sorteio), dentro de alguns anos.
    for (let k = 0; k < 20 && eco.villages.length === villages; k++) years(eco, 1);
    expect(eco.villages.length).toBe(villages + 1);
    const v = eco.villages[villages];
    expect(eco.village[i]).toBe(v.id);
    expect(v.population).toBeGreaterThanOrEqual(1);
  });

  it('um inteligente solto perto de um assentamento do seu povo se junta a ele', () => {
    const { eco } = world();
    const v = eco.villages[0];
    const before = v.population;
    const i = eco.introduceOne(v.species, v.x + 2, v.y);
    years(eco, 0.2);
    expect(eco.village[i]).toBe(v.id);
    expect(v.population).toBeGreaterThanOrEqual(before);
  });

  it('sozinho não tem filhos: precisa de pelo menos dois', () => {
    const { map, eco } = world();
    const s = eco.species.findIndex((sp) => sp.name === 'Bisão');
    for (let i = 0; i < eco.count; i++) if (eco.alive[i] && eco.kind[i] === s) eco.kill(i, true);
    const { x, y } = landFar(eco, map, s);
    eco.introduceOne(s, x, y);
    years(eco, 6);
    expect(eco.population[s]).toBeLessThanOrEqual(1);
  });
  it('o fundador sozinho escolhe um lugar onde consegue viver e não morre de fome', () => {
    const { map, eco } = world();
    const s = eco.species.findIndex((sp) => sp.kind === 'sapient');
    const { x, y } = landFar(eco, map, s);
    const villages = eco.villages.length;
    const i = eco.introduceOne(s, x, y);
    years(eco, 15);
    const v = eco.villages[villages];
    expect(v).toBeDefined();
    expect(v.abandoned).toBe(false);
    expect(eco.alive[i]).toBe(1);
    expect(eco.village[i]).toBe(v.id);
  });
});

describe('ruínas', () => {
  /** Esvazia todos os assentamentos do povo do primeiro (ninguém por perto para se juntar) e devolve o primeiro. */
  const emptied = (eco: Ecosystem) => {
    const v = eco.villages[0];
    for (let i = 0; i < eco.count; i++) if (eco.alive[i] && eco.kind[i] === v.species) eco.kill(i, true);
    years(eco, 0.5);
    expect(v.abandoned).toBe(true);
    return v;
  };
  const roadsAround = (eco: Ecosystem, map: ReturnType<typeof generateSurface>, v: { x: number; y: number }) => {
    let n = 0;
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) n += eco.road[(Math.floor(v.y) + dy) * map.width + ((Math.floor(v.x) + dx + map.width) % map.width)] ? 1 : 0;
    return n;
  };

  it('as ruas de um assentamento abandonado somem com o tempo', () => {
    const { map, eco } = world();
    const v = emptied(eco);
    expect(roadsAround(eco, map, v)).toBeGreaterThan(0);
    v.abandonedAt = eco.year - 100;
    years(eco, 1);
    expect(v.decay).toBe(3);
    expect(roadsAround(eco, map, v)).toBe(0);
    expect(eco.chronicle.some((e) => e.text === `As últimas ruínas de ${v.name} sumiram`)).toBe(true);
  });

  it('quem chega perto das ruínas recomeça na antiga praça', () => {
    const { eco } = world();
    const old = emptied(eco);
    // O lugar ao lado das ruínas pode ser água ou pedra, conforme o mundo: tenta alguns pontos a uns 8 tiles.
    let i = -1;
    for (const [ox, oy] of [[8, 0], [-8, 0], [0, 8], [0, -8], [6, 6], [-6, -6]]) {
      i = eco.introduceOne(old.species, old.x + ox, old.y + oy);
      if (i >= 0) break;
    }
    expect(i).toBeGreaterThanOrEqual(0);
    years(eco, 2);
    const v = eco.villages.find((o) => o.ruinOf === old.id)!;
    expect(v).toBeDefined();
    expect(v.x).toBe(old.x);
    expect(v.y).toBe(old.y);
    expect(eco.village[i]).toBe(v.id);
    expect(old.decay).toBe(3);
  });
});

describe('sobrevivência', () => {
  it('perto do teto quase não nascem filhotes; uma espécie rara tem mais', () => {
    const { eco } = world();
    const s = eco.species.findIndex((sp) => sp.name === 'Cervo');
    const caps = (eco as unknown as { caps: number[] }).caps;
    const before = eco.population[s];
    eco.population[s] = caps[s];
    const full = eco.fertility(s);
    eco.population[s] = Math.floor(caps[s] * 0.1);
    const rare = eco.fertility(s);
    eco.population[s] = before;
    expect(full).toBeLessThan(0.15);
    expect(rare).toBeGreaterThan(1.5);
  });

  it('os peixes não ficam presos no teto: o mar alimenta menos um cardume apertado', () => {
    const { eco } = world();
    const s = eco.species.findIndex((sp) => sp.name === 'Peixe');
    const caps = (eco as unknown as { caps: number[] }).caps;
    years(eco, 25);
    expect(eco.population[s]).toBeGreaterThan(caps[s] * 0.3);
    expect(eco.population[s]).toBeLessThan(caps[s] * 0.95);
  });

  it('em 80 anos, no máximo uma espécie da Terra some', () => {
    const { eco } = world();
    years(eco, 80);
    expect(eco.extinct.size).toBeLessThanOrEqual(1);
  }, 30000);

  it('uma aldeia quase vazia recebe andarilhos do seu povo', () => {
    const { eco } = world();
    const v = eco.villages[0];
    let kept = 0;
    for (let i = 0; i < eco.count; i++) {
      if (!eco.alive[i] || eco.village[i] !== v.id) continue;
      if (kept++ < 1) eco.age[i] = eco.species[v.species].maturity + 1;
      else eco.kill(i, true);
    }
    let most = v.population;
    for (let y = 0; y < 15 && !v.abandoned; y++) {
      years(eco, 1);
      most = Math.max(most, v.population);
    }
    expect(most).toBeGreaterThanOrEqual(2);
    expect(eco.chronicle.some((e) => e.text.includes(`se juntou a ${v.name}`))).toBe(true);
  }, 20000);
});
