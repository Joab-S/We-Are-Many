import { describe, expect, it } from 'vitest';
import { generateSurface, type PlanetParams } from '../procgen/surface';
import { Ecosystem, isLand } from './ecosystem';
import { nativeSpecies } from './species';

/**
 * Bioma, flora e sociedade (agente 3C): regras pequenas, cada uma conferida sem depender da história
 * de uma semente (o mundo só serve de palco: os números vêm do que o teste põe nele).
 */

const earth: PlanetParams = { id: 'sol-3', name: 'Terra', radiusEarth: 0.4, temperatureK: 288, water: 0.6, life: 0.85 };

function world() {
  const map = generateSurface(earth);
  const eco = new Ecosystem(map, 42);
  for (const sp of nativeSpecies(earth)) eco.addSpecies(sp);
  eco.populate();
  return { map, eco };
}

/** Um tile de terra livre perto do assentamento (para pôr um veio). */
function freeTileNear(eco: Ecosystem, x: number, y: number): number {
  const map = eco.map;
  for (let r = 4; r < 14; r++) {
    for (let a = 0; a < 24; a++) {
      const t = Math.floor(y + Math.sin(a) * r) * map.width + Math.floor(x + Math.cos(a) * r);
      if (isLand(map, t) && !eco.road[t] && !eco.built[t] && eco.depositAt[t] < 0) return t;
    }
  }
  return -1;
}

describe('vocação: amostra do lugar', () => {
  it('conta só as jazidas que o reino conhece', () => {
    const { eco, map } = world();
    const v = eco.villages[0];
    // Esquece tudo o que o reino sabia do subsolo em volta.
    for (const d of eco.deposits) d.known.delete(v.kingdom);
    const before = eco.siteSample(v).deposits;
    const spot = freeTileNear(eco, v.x, v.y);
    expect(eco.placeOre(spot % map.width, Math.floor(spot / map.width), 'copper')).toBe(true);
    const d = eco.deposits[eco.depositAt[spot]];
    d.known.delete(v.kingdom);
    expect(eco.siteSample(v).deposits).toBe(before);
    d.known.add(v.kingdom);
    expect(eco.siteSample(v).deposits).toBe(before + 1);
  });
});
