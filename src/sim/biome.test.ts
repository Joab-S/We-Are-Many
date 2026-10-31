import { describe, expect, it } from 'vitest';
import { Biome } from '../procgen/biomes';
import { generateSurface, type PlanetParams, type SurfaceMap } from '../procgen/surface';
import * as B from './balance';
import { areaYield, BIOME_YIELD, latitudeAmp, lifewayFor, lifewayReach, seasonWeight } from './biomeYield';
import { Ecosystem, isLand, YEAR_SECONDS } from './ecosystem';
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

/**
 * Mapa de mentira, todo de terra, com um bioma só: só o que `areaYield` lê (altura, umidade, calor,
 * vegetação e bioma). O equador fica na linha do meio; `heat` desloca a temperatura.
 */
function flatMap(biome: Biome, opts: { size?: number; vegetation?: number; heat?: number; elevation?: number } = {}): SurfaceMap {
  const size = opts.size ?? 64;
  const n = size * size;
  return {
    params: { id: 'teste', name: 'Teste', radiusEarth: 0.1, temperatureK: 270, water: 0, life: 1 },
    width: size,
    height: size,
    elevation: new Float32Array(n).fill(opts.elevation ?? 0.1),
    moisture: new Float32Array(n).fill(0.5),
    heat: new Float32Array(n).fill(opts.heat ?? 0),
    vegetation: new Float32Array(n).fill(opts.vegetation ?? 0.4),
    biome: new Uint8Array(n).fill(biome),
  };
}

describe('bioma: rendimento por área (BIOME_YIELD)', () => {
  it('a planície tem a melhor roça e o melhor pasto; a mata temperada, a lenha; o deserto só planta irrigado', () => {
    const Y = BIOME_YIELD;
    for (const b of [Biome.Forest, Biome.Jungle, Biome.Savanna, Biome.Taiga, Biome.Tundra, Biome.Desert, Biome.Mountain, Biome.Swamp]) {
      expect(Y[Biome.Grass].farm).toBeGreaterThan(Y[b].farm);
      expect(Y[Biome.Grass].graze).toBeGreaterThan(Y[b].graze);
    }
    expect(Y[Biome.Forest].wood).toBeGreaterThan(Y[Biome.Grass].wood);
    expect(Y[Biome.Forest].wood).toBeGreaterThanOrEqual(Math.max(Y[Biome.Jungle].wood, Y[Biome.Taiga].wood, Y[Biome.Savanna].wood));
    expect(Y[Biome.Desert].farm).toBeLessThan(0.3);
    expect(Y[Biome.Desert].irrigated).toBeGreaterThan(Y[Biome.Desert].farm * 4);
    expect(Y[Biome.Swamp].irrigated).toBeGreaterThan(Y[Biome.Swamp].farm);
    // Costa e frio pescam mais que o interior seco; o frio e o seco conservam a comida.
    expect(Y[Biome.Mangrove].fish).toBeGreaterThan(Y[Biome.Desert].fish);
    expect(Y[Biome.Tundra].fish).toBeGreaterThan(Y[Biome.Grass].fish);
    expect(Y[Biome.Tundra].spoil).toBeLessThan(Y[Biome.Grass].spoil);
    expect(Y[Biome.Desert].spoil).toBeLessThan(Y[Biome.Jungle].spoil);
    // Nenhum bioma estraga mais que o de base, e todo bioma tem um cultivo (ou 'nada').
    for (const k of Object.values(Y)) {
      expect(k.spoil).toBeLessThanOrEqual(1);
      expect(k.crop.length).toBeGreaterThan(0);
    }
  });

  it('a média da área é a do bioma que a cobre, e o frio encurta a estação da roça', () => {
    const grass = areaYield(flatMap(Biome.Grass), 32, 32, 10);
    expect(grass.farm).toBeCloseTo(BIOME_YIELD[Biome.Grass].farm, 5);
    expect(grass.graze).toBeCloseTo(BIOME_YIELD[Biome.Grass].graze, 5);
    expect(grass.main).toBe(Biome.Grass);
    const desert = areaYield(flatMap(Biome.Desert), 32, 32, 10);
    expect(desert.farm).toBeLessThan(grass.farm / 4);
    expect(desert.irrigated).toBeGreaterThan(desert.farm * 4);
    // O mesmo campo 30 K mais frio: a roça quase não amadurece, o pasto continua.
    const cold = areaYield(flatMap(Biome.Grass, { heat: -30 }), 32, 32, 10);
    expect(cold.farm).toBeLessThan(grass.farm * 0.3);
    expect(cold.graze).toBeCloseTo(grass.graze, 5);
  });

  it('a lenha só conta onde há mata, e a coleta esgotada aparece em `forage`', () => {
    // Campo aberto quase sem árvore: a lenha vale a da mata de base (não há o que pesar).
    expect(areaYield(flatMap(Biome.Grass, { vegetation: 0.2 }), 32, 32, 10).wood).toBe(1);
    expect(areaYield(flatMap(Biome.Forest, { vegetation: 0.9 }), 32, 32, 10).wood).toBeCloseTo(BIOME_YIELD[Biome.Forest].wood, 5);
    // Vegetação na metade do que o lugar aguenta (1 com umidade 0,5): coleta pela metade.
    expect(areaYield(flatMap(Biome.Grass, { vegetation: 0.5 }), 32, 32, 10).forage).toBeCloseTo(0.5, 5);
  });

  it('o relevo junta a altura do centro e o chão acidentado', () => {
    expect(areaYield(flatMap(Biome.Grass), 32, 32, 10).relief).toBe(0);
    const hill = flatMap(Biome.Rock, { elevation: 0.5 });
    for (let t = 0; t < hill.elevation.length; t++) hill.elevation[t] = (t * 7919) % 5 === 0 ? 0.25 : 0.5;
    hill.elevation[32 * 64 + 32] = 0.55;
    expect(areaYield(hill, 32, 32, 10).relief).toBeGreaterThan(0.5);
  });
});

describe('estações pela latitude', () => {
  it('a amplitude cresce do equador ao polo, e o ano soma o mesmo em qualquer amplitude', () => {
    expect(latitudeAmp(0)).toBeLessThan(latitudeAmp(0.5));
    expect(latitudeAmp(0.5)).toBeLessThan(latitudeAmp(1));
    for (const amp of [0, 0.3, 1, B.SEASON_AMP_MAX]) {
      let year = 0;
      for (let s = 0; s < 4; s++) {
        const w = seasonWeight(B.SEASON_HARVEST, s, amp);
        expect(w).toBeGreaterThanOrEqual(0);
        year += w;
      }
      expect(year).toBeCloseTo(4, 5);
    }
    // Sem amplitude, a colheita do outono é igual à da primavera; com a de base, é o vetor SEASON_HARVEST.
    expect(seasonWeight(B.SEASON_HARVEST, 2, 0)).toBe(seasonWeight(B.SEASON_HARVEST, 0, 0));
    expect(seasonWeight(B.SEASON_HARVEST, 2, 1)).toBeCloseTo(B.SEASON_HARVEST[2], 5);
  });

  it('o mesmo bioma tem estação mais marcada perto do polo, e a mata tropical tem estação mais branda', () => {
    const map = flatMap(Biome.Grass, { size: 96 });
    const equator = areaYield(map, 48, 48, 6).amp;
    const north = areaYield(map, 48, 6, 6).amp;
    expect(north).toBeGreaterThan(equator * 1.4);
    expect(north).toBeLessThanOrEqual(B.SEASON_AMP_MAX);
    expect(areaYield(flatMap(Biome.Jungle, { size: 96 }), 48, 48, 6).amp).toBeLessThan(equator);
  });
});

describe('perecimento', () => {
  it('a comida estraga pelo bioma da área e quase não estraga no celeiro gelado do inverno', () => {
    const { eco, map } = world();
    const v = eco.villages[0];
    v.area = { ...eco.sampleArea(v), spoil: 0.6 };
    const t = Math.floor(v.y) * map.width + Math.floor(v.x);
    // Verão: só o bioma. Inverno com o centro bem abaixo de 0 °C: o celeiro congela.
    eco.yearClock = 0.5 * YEAR_SECONDS;
    expect(eco.spoilOf(v)).toBeCloseTo(0.6, 5);
    map.heat[t] = -80;
    eco.yearClock = 0.85 * YEAR_SECONDS;
    expect(eco.spoilOf(v)).toBeCloseTo(0.6 * B.FROZEN_SPOIL, 5);
  });
});

describe('modo de vida', () => {
  const none = new Set<string>();
  it('nômade na terra que não dá roça e com pouca gente; intensivo com técnica, terra boa e gente apertada', () => {
    expect(lifewayFor({ farm: 0.15, density: 3, techs: none, now: 'sedentario' })).toBe('nomade');
    // Gente demais para andar atrás da coleta: fixa-se mesmo na terra pobre.
    expect(lifewayFor({ farm: 0.15, density: 8, techs: none, now: 'sedentario' })).toBe('sedentario');
    expect(lifewayFor({ farm: 1.4, density: 3, techs: none, now: 'sedentario' })).toBe('sedentario');
    expect(lifewayFor({ farm: 1.4, density: 7, techs: none, now: 'sedentario' })).toBe('sedentario');
    for (const t of ['arado', 'irrigacao', 'moinho']) expect(lifewayFor({ farm: 1.4, density: 7, techs: new Set([t]), now: 'sedentario' })).toBe('intensivo');
    // Terra pobre não intensifica, nem com arado.
    expect(lifewayFor({ farm: 0.5, density: 7, techs: new Set(['arado']), now: 'sedentario' })).toBe('sedentario');
  });

  it('o modo de agora segura a mudança (histerese) e o nômade capta mais longe', () => {
    const edge = B.NOMAD_FARM + B.LIFEWAY_MARGIN / 2;
    expect(lifewayFor({ farm: edge, density: 3, techs: none, now: 'nomade' })).toBe('nomade');
    expect(lifewayFor({ farm: edge, density: 3, techs: none, now: 'sedentario' })).toBe('sedentario');
    const plough = new Set(['arado']);
    const tight = B.INTENSIVE_DENSITY - B.LIFEWAY_DENSITY_MARGIN / 2;
    expect(lifewayFor({ farm: 1.2, density: tight, techs: plough, now: 'intensivo' })).toBe('intensivo');
    expect(lifewayFor({ farm: 1.2, density: tight, techs: plough, now: 'sedentario' })).toBe('sedentario');
    expect(lifewayReach('nomade')).toBeGreaterThan(lifewayReach('sedentario'));
    expect(lifewayReach('sedentario')).toBeGreaterThan(lifewayReach('intensivo'));
  });

  it('o nômade não planta e sente falta quando a coleta se esgota; o intensivo põe mais braços na roça', () => {
    const { eco } = world();
    const v = eco.villages[0];
    const area = eco.sampleArea(v);
    v.population = Math.min(v.population, 6);
    v.area = { ...area, farm: 0.1, irrigated: 0.1, forage: 0.9 };
    eco.updateLifeway(v);
    expect(eco.lifewayOf(v)).toBe('nomade');
    expect(eco.plants(v)).toBe(false);
    expect(eco.forageLack(v)).toBe(0);
    v.area = { ...v.area, forage: 0.1 };
    expect(eco.forageLack(v)).toBeGreaterThan(0.5);
    v.needs = { food: 1, water: 1, fuel: 1, material: 1, cloth: 1, tools: 1 };
    v.fedShare = 1;
    expect(eco.scarcity(v)).toBeGreaterThan(0.5);
    // A mesma terra pobre num lugar sedentário não pesa na falta.
    v.lifeway = 'sedentario';
    expect(eco.forageLack(v)).toBe(0);
    const farm = eco.farmYield(v);
    expect(eco.intensity(v)).toBe(1);
    v.lifeway = 'intensivo';
    expect(eco.intensity(v)).toBeCloseTo(1 + B.INTENSIVE_HANDS, 5);
    expect(eco.farmYield(v)).toBeCloseTo(farm * B.INTENSIVE_YIELD, 5);
  });
});

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
