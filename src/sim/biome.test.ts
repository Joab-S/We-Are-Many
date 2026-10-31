import { describe, expect, it } from 'vitest';
import { Biome } from '../procgen/biomes';
import { generateSurface, type PlanetParams, type SurfaceMap } from '../procgen/surface';
import * as B from './balance';
import { areaYield, BIOME_YIELD, latitudeAmp, lifewayFor, lifewayReach, seasonWeight } from './biomeYield';
import { Ecosystem, isLand, YEAR_SECONDS } from './ecosystem';
import { fullNeeds, herdFor } from './needs';
import { TECH_BY_ID } from './progress';
import { domesticable, earthCatalog, herdFormsOf, nativeSpecies } from './species';
import { usefulness } from './trade';
import { buildingType } from './buildingTypes';
import { ROLE } from './roles';

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

describe('Boserup: a necessidade puxa a intensificação', () => {
  it('a fome acelera a descoberta da lavoura e do rebanho e trava as outras técnicas', () => {
    const { eco } = world();
    const v = eco.villages[0];
    v.needs = fullNeeds();
    v.fedShare = 1;
    for (const id of B.BOSERUP_TECHS) expect(eco.needPull(v, TECH_BY_ID[id])).toBe(1);
    expect(eco.needPull(v, TECH_BY_ID.escrita)).toBe(1);
    // Metade comendo bem e o celeiro vazio: o arado e a irrigação vêm mais depressa; a escrita espera.
    v.needs = { ...fullNeeds(), food: 0.3 };
    v.fedShare = 0.5;
    for (const id of ['arado', 'irrigacao', 'moinho', 'domesticacao']) expect(eco.needPull(v, TECH_BY_ID[id])).toBeCloseTo(1 + B.BOSERUP_K * 0.5, 5);
    expect(eco.needPull(v, TECH_BY_ID.escrita)).toBe(0);
    expect(eco.needPull(v, TECH_BY_ID.fundicao)).toBe(0);
    // Fome extrema: ninguém experimenta nada.
    v.fedShare = B.BOSERUP_STARVING / 2;
    expect(eco.needPull(v, TECH_BY_ID.arado)).toBe(0);
  });
});

describe('trava local da era', () => {
  /** Dois lugares do mesmo reino: a capital minera e forja; a vila não tem minério nem forja. */
  function kingdom() {
    const { eco } = world();
    const [capital, village] = eco.villages;
    village.kingdom = capital.id;
    capital.techs = ['ceramica', 'fundicao', 'siderurgia'];
    capital.made = { bronze: 20, iron: 40, steel: 0, stone: 60, coal: 0 };
    village.techs = ['ceramica'];
    village.tech = 0.5;
    village.made = { bronze: 0, iron: 0, steel: 0, stone: 0, coal: 0 };
    for (const k of ['copper', 'tin', 'gold', 'iron', 'coal'] as const) village.stock[k] = 0;
    // Ninguém do reino conhece jazida nenhuma perto da vila: falta a condição material da fundição.
    for (const d of eco.deposits) {
      d.known.clear();
      if (d.mine === village.id) d.mine = -1;
    }
    village.mines = [];
    return { eco, capital, village };
  }

  it('a era e as peças forjadas são do lugar, não o máximo do reino', () => {
    const { eco, village } = kingdom();
    eco.develop(village, 1, []);
    expect(Math.floor(village.tech)).toBe(0);
    expect(eco.useContext(village).forgedBronze).toBe(false);
    expect(eco.useContext(village).forgedIron).toBe(false);
  });

  it('aprender com o vizinho pede a condição material do próprio lugar', () => {
    const { eco, village } = kingdom();
    village.stock.tools = 2;
    expect(eco.useContext(village).softOre).toBe(false);
    for (let k = 0; k < 200; k++) {
      village.learnAt = eco.year - 10;
      eco.develop(village, 1, []);
    }
    expect(eco.knew(village, 'fundicao')).toBe(false);
    // Com cobre no estoque (e ferramentas) a condição existe, e a técnica vem do vizinho.
    village.stock.copper = 3;
    for (let k = 0; k < 200 && !eco.knew(village, 'fundicao'); k++) {
      village.learnAt = eco.year - 10;
      eco.develop(village, 1, []);
    }
    expect(eco.knew(village, 'fundicao')).toBe(true);
  });

  it('o comércio traz peças: o metal de quem forjou conta para quem recebe', () => {
    const { eco, capital, village } = kingdom();
    eco.tradedPieces(capital, village, 'tools', 4);
    expect(village.made.iron).toBeCloseTo(4 * B.TRADED_PIECES, 5);
    eco.tradedPieces(capital, village, 'wood', 10);
    expect(village.made.iron).toBeCloseTo(4 * B.TRADED_PIECES, 5);
    eco.develop(village, 1, []);
    expect(Math.floor(village.tech)).toBeGreaterThanOrEqual(2);
  });
});

describe('domesticação (Diamond)', () => {
  const byName = new Map(earthCatalog().map((sp) => [sp.name, sp]));
  const forms = (name: string) => [...herdFormsOf(byName.get(name)!)];

  it('só vira rebanho quem come capim, tem porte de curral, vive em manada e não é bravo', () => {
    expect(forms('Bisão')).toEqual(['cattle']);
    expect(forms('Cabra-montesa')).toEqual(['goat', 'sheep']);
    expect(forms('Camelo')).toEqual(['camel']);
    expect(forms('Cavalo-selvagem')).toEqual(['horse']);
    expect(forms('Ovelha')).toEqual(['sheep']);
    expect(forms('Lhama')).toEqual(['camel']);
    // A zebra é brava; o elefante é grande e lento demais; o cervo come ramagem e foge; o sapo e o caranguejo, nem pensar.
    for (const name of ['Zebra', 'Elefante', 'Mamute', 'Cervo', 'Coelho', 'Sapo', 'Caranguejo', 'Tartaruga', 'Pinguim', 'Macaco', 'Javali', 'Galinha', 'Lobo', 'Humano']) {
      expect(domesticable(byName.get(name)!), name).toBe(false);
    }
  });

  it('o rebanho sai da fauna da região: a vocação escolhe entre o que há, e sem domesticável não há rebanho', () => {
    const site = { cold: 0, dry: 0, hills: 0, open: 0.8 };
    expect(herdFor('ovelhas', site, false, [])).toBeNull();
    expect(herdFor(undefined, site, false, ['cattle'])).toBe('cattle');
    // Quer ovelhas, mas só há bisão por perto: cria gado.
    expect(herdFor('ovelhas', site, false, ['cattle'])).toBe('cattle');
    expect(herdFor('ovelhas', site, false, ['goat', 'sheep'])).toBe('sheep');
    expect(herdFor('cavalos', site, false, ['cattle', 'horse'])).toBe('horse');
    expect(herdFor(undefined, { ...site, cold: 0.8 }, false, ['goat', 'sheep'])).toBe('sheep');
  });

  it('domesticar só captura bicho domesticável da região', () => {
    const { eco } = world();
    const v = eco.villages[0];
    eco.buildGrid();
    for (const [, j] of eco.wildHerdsNear(v, false)) expect(domesticable(eco.species[eco.kind[j]])).toBe(true);
    // Sem nenhum domesticável vivo, nem os outros herbívoros da região viram rebanho.
    for (let j = 0; j < eco.count; j++) if (eco.alive[j] && domesticable(eco.species[eco.kind[j]])) eco.kill(j, true);
    let others = 0;
    eco.forEachNear(v.x, v.y, eco.radius(v) + B.DOMESTIC_REACH, (j) => {
      if (eco.species[eco.kind[j]].kind === 'herbivore') others++;
    });
    expect(others).toBeGreaterThan(0);
    v.herd = undefined;
    eco.domesticate(v);
    expect(v.herd).toBeUndefined();
  });
});

describe('preço por utilidade na era', () => {
  it('minério que o lugar não sabe fundir vale menos; o bronze perde para o ferro; o carvão vale mais com o vapor', () => {
    const none = new Set<string>();
    const bronze = new Set(['ceramica', 'fundicao']);
    const iron = new Set(['ceramica', 'fundicao', 'siderurgia']);
    expect(usefulness('copper', none)).toBe(B.USELESS_GOOD);
    expect(usefulness('copper', bronze)).toBe(1);
    expect(usefulness('copper', iron)).toBe(B.BRONZE_AFTER_IRON);
    expect(usefulness('iron', bronze)).toBe(B.USELESS_GOOD);
    expect(usefulness('iron', iron)).toBe(1);
    expect(usefulness('coal', iron)).toBe(1);
    expect(usefulness('coal', new Set([...iron, 'aco', 'vapor']))).toBe(B.STEAM_COAL);
    expect(usefulness('clay', none)).toBe(B.USELESS_GOOD);
    expect(usefulness('food', none)).toBe(1);
    expect(usefulness('tools', none)).toBe(1);
  });

  it('o preço local aplica a utilidade', () => {
    const { eco } = world();
    const v = eco.villages[0];
    v.techs = ['ceramica'];
    v.stock.iron = 0;
    const before = eco.priceAt(v, 'iron');
    v.techs = ['ceramica', 'fundicao', 'siderurgia'];
    expect(eco.priceAt(v, 'iron')).toBeCloseTo(before / B.USELESS_GOOD, 5);
  });
});

describe('defesa pelo relevo e densidade na costa', () => {
  it('quem luta em casa, no alto e no acidentado, vale mais; longe de casa, não', () => {
    const { eco } = world();
    const v = eco.villages[0];
    let i = -1;
    for (const j of eco.residents(v.id)) i = j;
    expect(i).toBeGreaterThanOrEqual(0);
    eco.role[i] = ROLE.soldier;
    eco.x[i] = v.x;
    eco.y[i] = v.y;
    v.area = { ...eco.sampleArea(v), relief: 0 };
    const flat = eco.strength(i);
    v.area = { ...v.area, relief: 1 };
    expect(eco.strength(i)).toBeCloseTo(flat * (1 + B.DEFENSE_RELIEF), 5);
    eco.x[i] = (v.x + eco.radius(v) + 5) % eco.map.width;
    expect(eco.homeGround(i, v)).toBe(1);
  });

  it('o porto abriga gente (cais e casas de pescadores)', () => {
    expect(buildingType('port').housing(0, 0, false)).toBe(B.PORT_HOUSING);
    expect(buildingType('port').housing(3, 0, false)).toBe(B.PORT_HOUSING + 3);
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
