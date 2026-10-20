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
