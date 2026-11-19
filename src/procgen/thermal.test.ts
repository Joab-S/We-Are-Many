import { describe, expect, it } from 'vitest';
import { yearLabel, seasonLabel, NO_SEASONS } from '../client/surface/calendar';
import { planetParams, SOL_PLANETS } from '../nav/planets';
import { windAt } from '../sim/climate';
import { Ecosystem } from '../sim/ecosystem';
import { rainfall, westerlyAt, isSlowRotator } from './climate';
import { Biome, EARTH_PHYSICS, EARTH_THERMAL, generateSurface, isTidallyLocked, seasonStrength, temperatureAt, thermalOf, type PlanetParams } from './surface';

const EARTH = planetParams(SOL_PLANETS[2]);
const MARS = planetParams(SOL_PLANETS[3]);
const VENUS = planetParams(SOL_PLANETS[1]);

/** Um mundo como Proxima b: colado na estrela, sem dia. */
const LOCKED: PlanetParams = {
  id: 'travado',
  name: 'Travado',
  radiusEarth: 0.5,
  temperatureK: 260,
  water: 0.3,
  life: 0.5,
  axialTilt: 0,
  periodYears: 0.03,
  dayHours: 0.03 * 8766,
  atmosphere: { pressure: 0.5, greenhouse: 20 },
};
const HOT_OCEAN: PlanetParams = {
  id: 'oceano',
  name: 'Oceano',
  radiusEarth: 0.5,
  temperatureK: 320,
  water: 0.95,
  life: 0.8,
  axialTilt: 0.3,
  dayHours: 20,
  periodYears: 1.4,
  atmosphere: { pressure: 3, greenhouse: 60 },
};

const tile = (m: { width: number; height: number }, x: number, y: number) => y * m.width + x;

/** Temperatura média de uma linha do mapa. */
function rowMean(map: ReturnType<typeof generateSurface>, y: number): number {
  let sum = 0;
  for (let x = 0; x < map.width; x++) sum += temperatureAt(map, tile(map, x, y));
  return sum / map.width;
}

describe('a Terra continua igual, por valor', () => {
  it('o hemisfério sul tem a mesma estação do norte, como foi calibrado', () => {
    const map = generateSurface({ ...EARTH, radiusEarth: 0.25 }, 0.25);
    const eco = new Ecosystem(map, 1);
    eco.step(0.25);
    expect(eco.weather!.seasonAmp).toBe(1);
    expect(eco.weather!.southShift).toBe(0);
  });

  it('as contas são as de sempre, nos dados do jogo e num mapa sem física', () => {
    expect(thermalOf(EARTH)).toEqual(EARTH_THERMAL);
    expect(thermalOf({ id: 'sol-3', name: 'Terra', radiusEarth: 0.4, temperatureK: 288, water: 0.6, life: 0.85 })).toEqual(EARTH_THERMAL);
    expect(seasonStrength(EARTH)).toBe(1);
    expect(isTidallyLocked(EARTH)).toBe(false);
    expect(isSlowRotator(EARTH)).toBe(false);
  });

  it('um mapa sem `thermal`, de um save antigo, dá a temperatura de antes', () => {
    const map = generateSurface({ ...MARS }, 0.25);
    const y = Math.floor(map.height / 3);
    const i = tile(map, 5, y);
    const lat = Math.abs(y / (map.height - 1) - 0.5) * 2;
    delete map.thermal;
    const expected = map.params.temperatureK + 22 - lat * lat * 55 - Math.max(0, map.elevation[i]) * 30 + map.climate![i] + map.heat[i];
    expect(temperatureAt(map, i)).toBe(expected);
  });

  it('as três faixas de vento continuam em dias de 10 a 40 h', () => {
    for (const dayHours of [10, 24, 40]) expect(isSlowRotator({ dayHours })).toBe(false);
  });

  it('o calendário é o de hoje', () => {
    expect(yearLabel(12.7, EARTH)).toBe('Ano 12');
    expect(seasonLabel(1, EARTH)).toBe('verão');
  });
});

describe('Marte', () => {
  const map = generateSurface(MARS, 0.25);

  it('é frio em todo lugar, e o equador não passa do ponto de congelar', () => {
    expect(rowMean(map, Math.floor(map.height / 2))).toBeLessThan(250);
    expect(rowMean(map, 0)).toBeLessThan(rowMean(map, Math.floor(map.height / 2)) - 20);
  });

  it('as estações são mais fracas que as da Terra: o Sol está longe', () => {
    expect(seasonStrength(MARS)).toBeLessThan(0.6);
    expect(seasonStrength(MARS)).toBeGreaterThan(0.2);
  });

  it('o mundo vivo usa essa força, e o sul fica ao contrário do norte', () => {
    const eco = new Ecosystem(map, 1);
    eco.step(0.25);
    const live = eco.weather!;
    expect(live.seasonAmp).toBe(seasonStrength(MARS));
    const { cols, rows } = live;
    const north = cols * 1;
    const south = cols * (rows - 2);
    live.temp[north] = 200;
    live.temp[south] = 200;
    const summer = 0.375;
    expect(live.tempNow(north, summer)).toBeGreaterThan(200);
    expect(live.tempNow(south, summer)).toBeLessThan(200);
    // A amplitude no polo: menos de metade dos 14 K da Terra.
    expect(live.tempNow(north, summer) - 200).toBeLessThan(7);
  });

  it('tem ano próprio no calendário', () => {
    expect(yearLabel(10, MARS)).toBe('Ano 10 · ≈19 da Terra');
  });
});

describe('um mundo travado por maré', () => {
  const map = generateSurface(LOCKED, 0.25);

  it('um lado é quente e o outro é frio, sem depender da hora', () => {
    expect(isTidallyLocked(LOCKED)).toBe(true);
    const y = Math.floor(map.height / 2);
    const day = temperatureAt({ ...map, climate: undefined }, tile(map, 0, y));
    const night = temperatureAt({ ...map, climate: undefined }, tile(map, Math.floor(map.width / 2), y));
    expect(day - night).toBeGreaterThan(50);
    // E os dois lados têm a mesma diferença em relação à média, tirando a altitude.
    expect(thermalOf(LOCKED).lock).toBeGreaterThan(25);
  });

  it('sem inclinação não há estação', () => {
    expect(seasonStrength(LOCKED)).toBe(0);
    expect(seasonLabel(1, LOCKED)).toBe(NO_SEASONS);
  });

  it('o vento é uma célula só, e vai do polo ao equador em toda latitude', () => {
    expect(isSlowRotator(LOCKED)).toBe(true);
    const h = 512;
    for (const y of [10, 130, 256, 380, 500]) expect(windAt(y, h, true).x).toBeLessThan(0);
    expect(windAt(130, h, true).y).toBeGreaterThan(0);
    expect(windAt(380, h, true).y).toBeLessThan(0);
    // Na Terra, a faixa de oeste continua lá.
    expect(westerlyAt(130, h)).toBeGreaterThan(0);
  });

  it('a chuva segue esse vento', () => {
    const w = 64;
    const elevation = new Float32Array(w * 32).fill(0.1);
    for (let i = 0; i < w * 32; i++) if (i % w < 8) elevation[i] = -0.5;
    const rows = 32;
    const row = 8;
    const fast = rainfall(elevation, w, rows, w, 1, false);
    const slow = rainfall(elevation, w, rows, w, 1, true);
    expect([...slow.subarray(row * w, row * w + w)]).not.toEqual([...fast.subarray(row * w, row * w + w)]);
  });
});

describe('Vênus', () => {
  it('é uniforme: o ar denso iguala o equador e os polos', () => {
    const th = thermalOf(VENUS);
    expect(th.b).toBeLessThan(5);
    expect(th.lock).toBeLessThan(10);
    expect(seasonLabel(1, VENUS)).toBe(NO_SEASONS);
  });
});

describe('um oceano quente', () => {
  const map = generateSurface(HOT_OCEAN, 0.25);

  it('não congela, e as cidades teriam calor no ano inteiro', () => {
    expect(map.biome.filter((b) => b === Biome.Ice).length).toBe(0);
    expect(rowMean(map, 0)).toBeGreaterThan(280);
  });

  it('a física ausente vale a da Terra, inclusive a gravidade', () => {
    expect(EARTH_PHYSICS.gravity).toBe(1);
    expect(thermalOf({ ...HOT_OCEAN, gravity: 2 }).c).toBe(2 * EARTH_THERMAL.c);
  });
});
