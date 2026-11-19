import { describe, expect, it } from 'vitest';
import { generateSurface, type PlanetParams } from '../procgen/surface';
import { Weather } from './weather';

const earth: PlanetParams = { id: 'sol-3', name: 'Terra', radiusEarth: 0.4, temperatureK: 288, water: 0.6, life: 0.85 };
const map = generateSurface(earth);

/** Roda `years` anos de tempo, em passos de 1/48 de ano; devolve as médias de cada fase pedida. */
function run(dryness: number, years: number, at: number[] = []) {
  const w = new Weather(map.width, map.height);
  const seen: Record<number, { snow: number; soil: number; rain: number }> = {};
  const step = 1 / 48;
  for (let n = 1; n <= years * 48; n++) {
    const year = n * step;
    w.step(map, year, year % 1, step, () => dryness);
    const phase = Math.round((year % 1) * 48) / 48;
    if (year > years - 1 && at.includes(phase)) {
      let snow = 0;
      let soil = 0;
      let rain = 0;
      let land = 0;
      for (let k = 0; k < w.n; k++) {
        // Só a terra das zonas temperadas e frias que degelam (fora o gelo de sempre dos polos).
        if (w.land[k] < 0.5 || w.temp[k] < 268 || w.temp[k] > 288) continue;
        land++;
        snow += w.snow[k];
        soil += w.soil[k];
        rain += w.rain[k];
      }
      seen[phase] = { snow: snow / land, soil: soil / land, rain: rain / land };
    }
  }
  return { w, seen };
}

describe('clima vivo', () => {
  it('neva no inverno e a neve derrete no verão', () => {
    // Começo da primavera (ainda com a neve do inverno) contra o começo do outono.
    const { seen } = run(0, 3, [0.125, 0.625]);
    expect(seen[0.125].snow).toBeGreaterThan(seen[0.625].snow * 1.5);
  });

  it('ano de seca deixa o solo mais seco e chove menos', () => {
    const wet = run(0, 2, [0.5]).seen[0.5];
    const dry = run(1, 2, [0.5]).seen[0.5];
    expect(dry.soil).toBeLessThan(wet.soil * 0.9);
    expect(dry.rain).toBeLessThan(wet.rain);
  });

  it('chove: alguma célula de terra tem chuva forte em algum momento do ano', () => {
    const { w } = run(0, 1);
    let most = 0;
    for (let k = 0; k < w.n; k++) if (w.land[k] > 0.5) most = Math.max(most, w.rain[k]);
    expect(most).toBeGreaterThan(0.3);
  });
});
