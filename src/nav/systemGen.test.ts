import { describe, expect, it } from 'vitest';
import { EARTH_PHYSICS, generateSurface, withPhysics } from '../procgen/surface';
import { planetParams, SOL_PLANETS } from './planets';
import { generateSystem, type StarInfo, type SystemData } from './systemGen';

/** Os campos que os planetas já tinham antes da física (A1 de docs/TODO-PLANETAS-E-3D.md): estes não podem mudar. */
const ORIGINAL_FIELDS = ['id', 'name', 'kind', 'aAu', 'periodYears', 'radiusKm', 'temperatureK', 'water', 'life', 'color', 'rings', 'atmosphere'] as const;

function originalData(sys: SystemData) {
  return {
    planets: sys.planets.map((p) => ORIGINAL_FIELDS.map((k) => p[k] ?? null)),
    comets: sys.comets,
    luminosity: sys.luminosity,
    habitable: sys.habitable,
  };
}

/** FNV-1a do JSON, com os números em 10 algarismos: uma linha de teste no lugar de milhares de valores. */
function digest(value: unknown): string {
  const text = JSON.stringify(value, (_k, v: unknown) => (typeof v === 'number' ? Number(v.toPrecision(10)) : v));
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Estrelas de catálogo com exoplanetas conhecidos: id próprio de cada uma, magnitude absoluta e índice de cor reais. */
const CATALOGUED: StarInfo[] = [
  { id: 70890, name: 'Proxima Centauri', absmag: 15.6, ci: 1.82 },
  { id: 87937, name: "Barnard's Star", absmag: 13.2, ci: 1.57 },
  { id: 57548, name: 'Ross 128', absmag: 13.5, ci: 1.75 },
  { id: 80824, name: 'Wolf 1061', absmag: 11.9, ci: 1.6 },
  { id: 54035, name: 'Lalande 21185', absmag: 10.5, ci: 1.5 },
  { id: 36208, name: "Luyten's Star", absmag: 12.0, ci: 1.57 },
  { id: 16537, name: 'Ran', absmag: 6.2, ci: 0.88 },
];

/** Estrelas sem nome, de todos os tipos: 400 sistemas gerados, de ids fixos que não caem nos de cima. */
const GENERATED: StarInfo[] = Array.from({ length: 400 }, (_, k) => {
  const id = 200000 + k * 37;
  return { id, name: `HYG ${id}`, absmag: -2 + (k % 17), ci: -0.2 + ((k * 7) % 23) / 10 };
});

describe('sistemas gerados: os mesmos ids dão os mesmos planetas de antes', () => {
  it('exoplanetas conhecidos', () => {
    const ids = CATALOGUED.map((s) => generateSystem(s).planets.map((p) => `${p.id} ${p.name}`));
    expect(ids).toEqual([
      ['hyg-70890-1 Proxima d', 'hyg-70890-2 Proxima b'],
      ['hyg-87937-1 Barnard b'],
      ['hyg-57548-1 Ross 128 b'],
      ['hyg-80824-1 Wolf 1061 b', 'hyg-80824-2 Wolf 1061 c', 'hyg-80824-3 Wolf 1061 d'],
      ['hyg-54035-1 Lalande 21185 b', 'hyg-54035-2 Lalande 21185 c'],
      ['hyg-36208-1 Luyten c', 'hyg-36208-2 Luyten b'],
      ['hyg-16537-1 Ægir'],
    ]);
    expect(digest(CATALOGUED.map((s) => originalData(generateSystem(s))))).toBe('31e0f7ce');
  });

  it('sistemas sorteados', () => {
    const systems = GENERATED.map((s) => originalData(generateSystem(s)));
    // A amostra exercita o gerador: planetas de todos os tipos, anéis e cometas.
    const kinds = new Set(systems.flatMap((s) => s.planets.map((p) => p[2])));
    expect([...kinds].sort()).toEqual(['gas', 'ice', 'rocky']);
    expect(systems.some((s) => s.comets.length > 0)).toBe(true);
    expect(digest(systems)).toBe('d49ee32e');
  });
});

describe('física dos planetas', () => {
  it('a Terra tem exatamente os valores padrão', () => {
    const { star, axialTilt, dayHours, periodYears, atmosphere } = planetParams(SOL_PLANETS[2]);
    expect({ star, axialTilt, dayHours, periodYears, atmosphere }).toEqual(EARTH_PHYSICS);
  });

  it('o que falta vem da Terra, e o que existe fica', () => {
    const bare = { id: 'x', name: 'X', radiusEarth: 1, temperatureK: 280, water: 0.5, life: 0.5 };
    expect(withPhysics(bare)).toEqual({ ...bare, ...EARTH_PHYSICS });
    expect(withPhysics({ ...bare, axialTilt: 0, dayHours: 100 })).toEqual({ ...bare, ...EARTH_PHYSICS, axialTilt: 0, dayHours: 100 });
  });

  it('todo planeta, do Sol ou gerado, sai com a física completa e valores possíveis', () => {
    const all = [...SOL_PLANETS, ...[...CATALOGUED, ...GENERATED].flatMap((s) => generateSystem(s).planets)];
    expect(all.length).toBeGreaterThan(500);
    for (const p of all) {
      const q = planetParams(p);
      expect(q.star!.luminosity, p.id).toBeGreaterThan(0);
      expect(q.star!.kelvin, p.id).toBeGreaterThan(0);
      expect(q.axialTilt!, p.id).toBeGreaterThanOrEqual(0);
      expect(q.axialTilt!, p.id).toBeLessThanOrEqual(Math.PI);
      expect(q.dayHours!, p.id).toBeGreaterThan(0);
      expect(q.periodYears!, p.id).toBeGreaterThan(0);
      expect(q.atmosphere!.pressure, p.id).toBeGreaterThanOrEqual(0);
      expect(q.atmosphere!.greenhouse, p.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('a luz é a da estrela do sistema', () => {
    const sys = generateSystem(CATALOGUED[0]);
    for (const p of sys.planets) expect(p.star!.luminosity).toBe(sys.luminosity);
    // Proxima é uma anã vermelha.
    expect(sys.planets[0].star!.kelvin).toBeLessThan(4000);
  });

  it('planeta colado na estrela é travado por maré: sem inclinação, e o dia é a órbita', () => {
    const proximaB = generateSystem(CATALOGUED[0]).planets[1];
    expect(proximaB.axialTilt).toBe(0);
    expect(proximaB.dayHours).toBeCloseTo(proximaB.periodYears * 8766, 6);
  });

  it('os planetas gerados não saem todos iguais', () => {
    const planets = GENERATED.flatMap((s) => generateSystem(s).planets);
    expect(new Set(planets.map((p) => p.axialTilt)).size).toBeGreaterThan(50);
    expect(new Set(planets.map((p) => p.dayHours)).size).toBeGreaterThan(50);
  });

  it('a física ainda não muda o mapa gerado', () => {
    const proximaB = generateSystem(CATALOGUED[0]).planets[1];
    const full = planetParams(proximaB);
    const bare = { id: full.id, name: full.name, radiusEarth: full.radiusEarth, temperatureK: full.temperatureK, water: full.water, life: full.life };
    const a = generateSurface(full, 0.25);
    const b = generateSurface(bare, 0.25);
    expect(a.elevation).toEqual(b.elevation);
    expect(a.moisture).toEqual(b.moisture);
    expect(a.biome).toEqual(b.biome);
  });
});
