import { describe, expect, it } from 'vitest';
import { generateSurface, type PlanetParams } from '../procgen/surface';
import { Ecosystem, isLand, YEAR_SECONDS } from './ecosystem';
import { worldFingerprint } from './fingerprint';
import { nativeSpecies } from './species';

/** Planeta pequeno (192×96), para a rodada caber em poucos segundos. */
const small: PlanetParams = { id: 'sol-3', name: 'Terra', radiusEarth: 0.15, temperatureK: 288, water: 0.6, life: 0.85 };

/** Mundo pequeno com fauna e duas aldeias, rodado `years` anos; devolve a impressão digital. */
function fingerprintOf(seed: number, years: number): string {
  const map = generateSurface(small);
  const eco = new Ecosystem(map, seed);
  for (const sp of nativeSpecies(small)) eco.addSpecies(sp);
  eco.populate();
  const s = eco.species.findIndex((sp) => sp.kind === 'sapient');
  let placed = 0;
  for (let i = 0; i < map.width * map.height && placed < 2; i += 997) {
    const x = i % map.width;
    const y = Math.floor(i / map.width);
    if (isLand(map, i) && map.vegetation[i] > 0.3 && eco.canFound(x, y) && eco.introduceOne(s, x + 0.5, y + 0.5) >= 0) {
      eco.foundVillage(s, x, y, 8);
      placed++;
    }
  }
  for (let y = 0; y < years; y++) {
    // A vista sobre a primeira aldeia, para rodar também as jornadas do modo completo.
    const v = eco.villages.find((q) => !q.abandoned);
    eco.focus = v ? { x: v.x, y: v.y, r: 16 } : null;
    for (let t = 0; t < YEAR_SECONDS; t += 0.25) eco.step(0.25);
  }
  return worldFingerprint(eco);
}

describe('determinismo', () => {
  it('a mesma semente dá a mesma impressão digital (e outra semente, outra)', () => {
    const a = fingerprintOf(7, 15);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(fingerprintOf(7, 15)).toBe(a);
    expect(fingerprintOf(8, 15)).not.toBe(a);
  });
});
