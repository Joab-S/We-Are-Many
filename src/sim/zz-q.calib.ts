import { it } from 'vitest';
import { generateSurface, type PlanetParams } from '../procgen/surface';
import { Ecosystem } from './ecosystem';
import { nativeSpecies } from './species';
it('q', () => {
  const earth: PlanetParams = { id: 'sol-3', name: 'Terra', radiusEarth: 1, temperatureK: 288, water: 0.6, life: 0.85 };
  const map = generateSurface(earth);
  const eco = new Ecosystem(map, Number(process.env.SEED ?? 42));
  eco.yearSpan = 12;
  for (const sp of nativeSpecies(earth)) eco.addSpecies(sp);
  eco.populate();
  for (let y = 1; y <= 40; y++) {
    for (let t = 0; t < 12; t += 0.1) eco.step(0.1);
    if (y % 10 === 0) console.log('Y' + y, eco.species.map((sp, s) => `${sp.name}:${eco.population[s]}`).join(' '));
  }
  console.log('EXT', [...eco.extinct].map((s) => eco.species[s].name).join(', '), 'fome', eco.tally.wildStarved, eco.tally.wildStarvedNearFood);
}, 900000);
