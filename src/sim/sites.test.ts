import { describe, expect, it } from 'vitest';
import { Biome, type SurfaceMap } from '../procgen/surface';
import * as B from './balance';
import { earthParams } from './calibrate';
import { Ecosystem } from './ecosystem';
import { SITE_LAYER } from './eco/settlements/siteField';
import { nativeSpecies } from './species';

/**
 * Onde assentar (onda 3, frente 3A): campo de notas dos sítios, captação no alcance real, água graduada,
 * penalidades graduais e a escolha única do lugar de fundação. Mundos pequenos e planos, feitos à mão: nada
 * depende da história de uma semente.
 */

/** Mundo plano de capim baixo (sem árvores), úmido, com o povo inteligente da Terra e nada mais. */
function flatWorld(w = 128, h = 64, veg = 0.3) {
  const n = w * h;
  const map = {
    params: { id: 'teste', name: 'Teste', radiusEarth: 0.2, temperatureK: 288, water: 0.6, life: 0.85 },
    width: w,
    height: h,
    elevation: new Float32Array(n).fill(0.1),
    moisture: new Float32Array(n).fill(0.7),
    heat: new Float32Array(n),
    vegetation: new Float32Array(n).fill(veg),
    biome: new Uint8Array(n).fill(Biome.Grass),
  } as SurfaceMap;
  const eco = new Ecosystem(map, 7);
  eco.addSpecies(nativeSpecies(earthParams()).find((sp) => sp.kind === 'sapient')!);
  return { map, eco, s: eco.species.length - 1 };
}

/** Pinta um retângulo de tiles. */
function paint(map: SurfaceMap, x0: number, y0: number, x1: number, y1: number, f: (i: number) => void): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) f(y * map.width + (((x % map.width) + map.width) % map.width));
}

const water = (map: SurfaceMap) => (i: number) => {
  map.elevation[i] = -0.2;
  map.biome[i] = Biome.Ocean;
};

describe('campo de notas dos sítios (mapa de influência)', () => {
  it('separa lago de mar pelo tamanho do corpo d’água', () => {
    const { map, eco } = flatWorld();
    paint(map, 10, 10, 14, 14, water(map));
    paint(map, 60, 30, 100, 50, water(map));
    const bodies = eco.waterBodies();
    expect(bodies[12 * map.width + 12]).toBe(1);
    expect(bodies[40 * map.width + 80]).toBe(2);
    expect(bodies[20 * map.width + 30]).toBe(0);
  });

  it('Double Buffer: a volta em curso não muda o que as consultas leem até a virada', () => {
    const { map, eco } = flatWorld(128, 64, 0.6);
    const f = eco.siteField();
    const food = () => eco.sites!.raw[0 * 8 + SITE_LAYER.food];
    const before = food();
    expect(before).toBeGreaterThan(0.5);
    // A célula 0 fica pelada: a fatia a refaz na volta em curso, mas a completa continua igual.
    paint(map, 0, 0, 15, 15, (i) => (map.vegetation[i] = 0));
    eco.updateSites(1 / f.n);
    expect(f.rawNext[0 * 8 + SITE_LAYER.food]).toBe(0);
    expect(food()).toBeCloseTo(before);
    // Fecha a volta: as voltas trocam e a consulta enxerga o chão pelado.
    for (let k = 1; k < f.n; k++) eco.updateSites(1 / f.n);
    expect(f.passes).toBe(1);
    expect(food()).toBe(0);
  });

  it('Dirty Flag: a fundação baixa a nota das células em volta; o terreno mudado refaz a célula na hora', () => {
    const { map, eco, s } = flatWorld(128, 64, 0.6);
    const f = eco.siteField();
    const k = 2 * f.cols + 4;
    const before = f.score[k];
    eco.foundVillage(s, 4 * 16 + 8, 2 * 16 + 8, 12);
    expect(f.queue.length).toBeGreaterThan(0);
    // Sem fatia da volta (ano 0): só as sujas.
    while (f.queue.length) eco.updateSites(0);
    expect(f.score[k]).toBeLessThan(before - B.SITE_W_OVERLAP * 0.5);
    // Um lago aberto no meio da célula 1: `sweep` suja as camadas, que mudam já na volta completa.
    paint(map, 20, 4, 27, 11, water(map));
    eco.sweep(24, 8, 4);
    while (f.queue.length) eco.updateSites(0);
    expect(f.raw[1 * 8 + SITE_LAYER.fresh]).toBeGreaterThan(0);
    expect(eco.waterBodies()[8 * map.width + 24]).toBe(1);
  });

  it('o raio de captação depende do modo de vida (pela era) e do tamanho do lugar', () => {
    const { eco } = flatWorld();
    expect(eco.catchRadius(0, 'food')).toBeGreaterThan(eco.catchRadius(2, 'food'));
    expect(eco.catchRadius(2, 'wood')).toBeGreaterThan(eco.catchRadius(0, 'wood'));
    expect(eco.catchRadius(0, 'stone')).toBeGreaterThan(eco.catchRadius(0, 'wood'));
    const small = { population: 4, tech: 0 } as never;
    const big = { population: 200, tech: 0 } as never;
    expect(eco.catchRadius(big, 'food')).toBeGreaterThan(eco.catchRadius(small, 'food'));
  });

  it('captação: a mata além do disco da fundação conta, com decaimento', () => {
    const { map, eco } = flatWorld(256, 64);
    // Mata fechada numa faixa de 14 a 24 tiles a leste de A (fora do disco de SITE_RADIUS, dentro do corte).
    paint(map, 60 + 14, 0, 60 + 24, 63, (i) => {
      map.biome[i] = Biome.Forest;
      map.vegetation[i] = 0.8;
    });
    const rw = eco.catchRadius(0, 'wood');
    const near = eco.catchmentAt(60, 32, 20, rw, 20);
    const far = eco.catchmentAt(200, 32, 20, rw, 20);
    expect(14).toBeGreaterThan(B.SITE_RADIUS);
    expect(near.wood).toBeGreaterThan(0.05);
    expect(far.wood).toBe(0);
    // Mais perto da mata, mais ela pesa.
    expect(eco.catchmentAt(66, 32, 20, rw, 20).wood).toBeGreaterThan(near.wood);
  });

  it('presença: sobreposição e gente que já explora a captação (IFD)', () => {
    const { eco, s } = flatWorld(256, 64);
    const v = eco.foundVillage(s, 60, 32, 20);
    const r = eco.catchRadius(0);
    const here = eco.sitePresence(v.x, v.y, r);
    expect(here.overlap).toBeGreaterThan(0.9);
    expect(here.crowd).toBeGreaterThan(v.population * 0.5);
    const mid = eco.sitePresence(v.x + r, v.y, r);
    expect(mid.overlap).toBeGreaterThan(0);
    expect(mid.overlap).toBeLessThan(here.overlap);
    expect(mid.crowd).toBeLessThan(here.crowd);
    expect(eco.sitePresence(v.x + 120, v.y, r)).toEqual({ overlap: 0, crowd: 0 });
  });
});

describe('filtro único e caminho a pé', () => {
  it('o filtro rápido pede a faixa de temperatura da espécie, verde no centro (ou poço sobre água no subsolo) e espaço', () => {
    const { map, eco, s } = flatWorld();
    expect(eco.siteQuick(s, 40, 32)).toBeNull();
    // Frio: fora da faixa da espécie, mas ainda habitável (antes valia até 5 K fora).
    map.heat[32 * map.width + 40] = -55;
    expect(eco.siteQuick(s, 40, 32)).toContain('frio');
    map.heat[32 * map.width + 40] = 0;
    // Chão pelado: só com poço da Idade do Ferro sobre água no subsolo.
    map.vegetation[32 * map.width + 40] = 0.05;
    expect(eco.siteQuick(s, 40, 32, 0)).toContain('pelado');
    expect(eco.siteQuick(s, 40, 32, 2)).toBeNull();
    map.moisture[32 * map.width + 40] = B.SITE_WELL_MOISTURE - 0.1;
    expect(eco.siteQuick(s, 40, 32, 2)).toContain('pelado');
    eco.foundVillage(s, 90, 32, 4);
    expect(eco.siteQuick(s, 95, 32)).toContain('perto');
  });

  it('com desvio, uma baía no meio não fecha o caminho a pé', () => {
    const { map, eco } = flatWorld();
    paint(map, 50, 20, 60, 44, water(map));
    expect(eco.landPath(40, 32, 70, 32)).toBe(false);
    expect(eco.landPath(40, 32, 70, 32, true)).toBe(true);
    // Mar de lado a lado: nem com desvio.
    paint(map, 50, 0, 60, 63, water(map));
    expect(eco.landPath(40, 32, 70, 32, true)).toBe(false);
  });
});
