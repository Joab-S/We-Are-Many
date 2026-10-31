import { bvToTemperature, stellarRadius } from '../core/astro';
import { mulberry32, seedFor } from '../core/rng';
import { KM_PER_AU } from '../core/units';
import { alienName, nativeLifeTier, type LifeTier } from '../sim/species';
import { compressOrbit, SOL_PLANETS, SUN_VISUAL_RADIUS, type PlanetData } from './planets';

/**
 * Sistemas planetários de todas as estrelas (RF-SYS-01). O Sistema Solar é
 * fixo; algumas vizinhas têm os exoplanetas reais conhecidos; as demais
 * recebem planetas e cometas gerados de forma determinística pelo id da
 * estrela, coerentes com a luminosidade (zona habitável e linha de gelo).
 */

export interface StarInfo {
  id: number;
  name: string;
  absmag: number;
  ci: number;
}

export interface CometData {
  id: string;
  name: string;
  /** Semieixo maior real, em UA. */
  aAu: number;
  eccentricity: number;
  periodYears: number;
  /** Anomalia média inicial (rad). */
  phase: number;
  /** Inclinação do plano da órbita (rad). */
  tilt: number;
  /** Direção do periélio no plano (rad). */
  perihelion: number;
}

export interface SystemData {
  starId: number;
  name: string;
  /** Luminosidade em sóis. */
  luminosity: number;
  /** Zona habitável real, em UA. */
  habitable: [number, number];
  planets: PlanetData[];
  comets: CometData[];
  /** Planetas vindos de catálogo real (e não gerados). */
  catalogued: boolean;
}

export const SOL_ID = 0;

/** Raio visual da estrela, em UA (mesma regra de createStarBody). */
export function starVisualRadius(star: StarInfo): number {
  if (star.id === SOL_ID) return SUN_VISUAL_RADIUS;
  return SUN_VISUAL_RADIUS * Math.min(Math.max(stellarRadius(star.absmag, star.ci), 0.15), 30);
}

export function luminosity(absmag: number): number {
  return Math.pow(10, -0.4 * (absmag - 4.83));
}

/** Zona habitável conservadora (Kasting), em UA. */
export function habitableZone(lum: number): [number, number] {
  return [Math.sqrt(lum / 1.1), Math.sqrt(lum / 0.53)];
}

/** Temperatura de equilíbrio aproximada (K) a uma distância da estrela. */
export function equilibriumTemperature(lum: number, aAu: number): number {
  return 278 * Math.pow(lum, 0.25) / Math.sqrt(aAu);
}

/** Quanto o clima favorece vida (0..1), usado como potencial de vida nativa. */
export function lifePotential(kind: PlanetData['kind'], temperatureK: number, water: number): number {
  if (kind !== 'rocky' || water < 0.15) return 0;
  const t = 1 - Math.abs(temperatureK - 288) / 40;
  return t <= 0 ? 0 : Math.min(0.85, t * (0.4 + water * 0.6));
}

type Known = Omit<PlanetData, 'id' | 'life' | 'color'> & { color?: number };

/**
 * Exoplanetas confirmados de estrelas vizinhas (NASA Exoplanet Archive).
 * Raio e temperatura são estimativas a partir da massa mínima e do fluxo.
 */
const KNOWN_EXOPLANETS: Record<string, Known[]> = {
  'Proxima Centauri': [
    { name: 'Proxima d', kind: 'rocky', aAu: 0.02885, periodYears: 0.01402, radiusKm: 5000, temperatureK: 360, water: 0 },
    { name: 'Proxima b', kind: 'rocky', aAu: 0.04856, periodYears: 0.03063, radiusKm: 6800, temperatureK: 234, water: 0.35, atmosphere: 0xb0c0e0 },
  ],
  "Barnard's Star": [{ name: 'Barnard b', kind: 'rocky', aAu: 0.0229, periodYears: 0.00862, radiusKm: 4600, temperatureK: 400, water: 0 }],
  'Ross 128': [{ name: 'Ross 128 b', kind: 'rocky', aAu: 0.0496, periodYears: 0.02702, radiusKm: 7000, temperatureK: 280, water: 0.45, atmosphere: 0x9fb8e8 }],
  'Wolf 1061': [
    { name: 'Wolf 1061 b', kind: 'rocky', aAu: 0.0375, periodYears: 0.01339, radiusKm: 7000, temperatureK: 400, water: 0 },
    { name: 'Wolf 1061 c', kind: 'rocky', aAu: 0.089, periodYears: 0.04901, radiusKm: 9500, temperatureK: 275, water: 0.4, atmosphere: 0xa8c4f0 },
    { name: 'Wolf 1061 d', kind: 'ice', aAu: 0.47, periodYears: 0.5941, radiusKm: 16000, temperatureK: 130, water: 0 },
  ],
  'Lalande 21185': [
    { name: 'Lalande 21185 b', kind: 'rocky', aAu: 0.0789, periodYears: 0.03545, radiusKm: 9000, temperatureK: 370, water: 0 },
    { name: 'Lalande 21185 c', kind: 'ice', aAu: 2.94, periodYears: 8.07, radiusKm: 24000, temperatureK: 70, water: 0 },
  ],
  "Luyten's Star": [
    { name: 'Luyten c', kind: 'rocky', aAu: 0.0365, periodYears: 0.01287, radiusKm: 7600, temperatureK: 410, water: 0 },
    { name: 'Luyten b', kind: 'rocky', aAu: 0.0911, periodYears: 0.05093, radiusKm: 9300, temperatureK: 259, water: 0.5, atmosphere: 0x98b4e8 },
  ],
  Ran: [{ name: 'Ægir', kind: 'gas', aAu: 3.53, periodYears: 7.37, radiusKm: 70000, temperatureK: 150, water: 0 }],
};

const ROCKY_COLORS = [0x9a8f86, 0xb0784c, 0x8c7a6b, 0xc9a77c, 0x7d6f63, 0xa65f3c];
const GAS_COLORS = [0xd2b48c, 0xe3cf98, 0xc9a07a, 0xb8c4d0, 0xd8a878, 0xe8dcc0];
const ICE_COLORS = [0x9fd8e0, 0x4a6fd6, 0x7fb8e0, 0x8fc0c8];
const LETTERS = 'bcdefghij';

const pick = <T>(rnd: () => number, list: readonly T[]): T => list[Math.floor(rnd() * list.length)];

function rockyColor(rnd: () => number, temperatureK: number, water: number): number {
  if (water > 0.4 && temperatureK > 255 && temperatureK < 330) return 0x4f7fc9;
  if (temperatureK < 200) return 0xb8c8d8;
  if (temperatureK > 600) return 0xd08a50;
  return pick(rnd, ROCKY_COLORS);
}

const cache = new Map<number, SystemData>();

/** Sistema da estrela, sempre o mesmo para o mesmo id. */
export function generateSystem(star: StarInfo): SystemData {
  const hit = cache.get(star.id);
  if (hit) return hit;
  const sys = star.id === SOL_ID ? solSystem() : build(star);
  cache.set(star.id, sys);
  return sys;
}

function solSystem(): SystemData {
  return {
    starId: SOL_ID,
    name: 'Sol',
    luminosity: 1,
    habitable: habitableZone(1),
    planets: SOL_PLANETS,
    comets: [
      { id: 'sol-c1', name: 'Cometa Halley', aAu: 17.8, eccentricity: 0.967, periodYears: 75.3, phase: 2.6, tilt: 2.83, perihelion: 1.95 },
      { id: 'sol-c2', name: 'Cometa Encke', aAu: 2.22, eccentricity: 0.848, periodYears: 3.3, phase: 0.4, tilt: 0.2, perihelion: 3.4 },
    ],
    catalogued: true,
  };
}

function build(star: StarInfo): SystemData {
  const rnd = mulberry32(seedFor(`sys:${star.id}`));
  const lum = Math.min(Math.max(luminosity(star.absmag), 1e-4), 1e5);
  const hz = habitableZone(lum);
  const mass = Math.pow(lum, 1 / 3.5);
  // Planetas não podem orbitar dentro do desenho (exagerado) da estrela.
  const minOrbit = starVisualRadius(star) * 3;
  const planets: PlanetData[] = [];
  const known = KNOWN_EXOPLANETS[star.name];

  if (known) {
    known.forEach((k, i) => {
      const life = lifePotential(k.kind, k.temperatureK, k.water);
      planets.push({ ...k, id: `hyg-${star.id}-${i + 1}`, life, color: k.color ?? (k.kind === 'rocky' ? rockyColor(rnd, k.temperatureK, k.water) : pick(rnd, k.kind === 'gas' ? GAS_COLORS : ICE_COLORS)) });
    });
  } else {
    const hot = bvToTemperature(star.ci) > 10000;
    // Estrelas muito quentes têm vida curta e poucos planetas; cerca de 1 em 6 não tem nenhum.
    const roll = rnd();
    const count = roll < (hot ? 0.45 : 0.16) ? 0 : 1 + Math.floor(rnd() * (hot ? 3 : 7));
    const snow = 2.7 * Math.sqrt(lum);
    let a = Math.max(0.03, (0.15 + rnd() * 0.35) * Math.sqrt(lum));
    for (let i = 0; i < count; i++) {
      if (compressOrbit(a) > minOrbit) {
        const n = planets.length;
        const cold = a > snow;
        const r = rnd();
        // Júpiter quente: raro, mas existe.
        const kind: PlanetData['kind'] = cold ? (r < 0.5 ? 'gas' : r < 0.8 ? 'ice' : 'rocky') : r < 0.06 ? 'gas' : 'rocky';
        const greenhouse = kind === 'rocky' ? 1 + rnd() * 0.18 : 1;
        const temperatureK = Math.round(equilibriumTemperature(lum, a) * greenhouse);
        const radiusKm = Math.round(
          kind === 'gas' ? 40000 + rnd() * 45000 : kind === 'ice' ? 18000 + rnd() * 10000 : 2200 + Math.pow(rnd(), 1.4) * 9500,
        );
        const temperate = temperatureK > 250 && temperatureK < 340;
        const water = kind !== 'rocky' ? 0 : temperate ? 0.15 + rnd() * 0.75 : temperatureK < 250 ? rnd() * 0.12 : 0;
        const life = lifePotential(kind, temperatureK, water);
        const color = kind === 'rocky' ? rockyColor(rnd, temperatureK, water) : pick(rnd, kind === 'gas' ? GAS_COLORS : ICE_COLORS);
        const thick = kind === 'rocky' && (water > 0.1 || temperatureK > 500) && radiusKm > 3500;
        planets.push({
          id: `hyg-${star.id}-${n + 1}`,
          name: `${star.name} ${LETTERS[n]}`,
          kind,
          aAu: Number(a.toFixed(a < 1 ? 3 : 2)),
          periodYears: Math.sqrt((a * a * a) / mass),
          radiusKm,
          temperatureK,
          water: Number(water.toFixed(2)),
          life,
          color,
          rings: kind === 'gas' && rnd() < 0.3 ? true : undefined,
          atmosphere: thick ? (water > 0.3 ? 0x7fb0ff : 0xe0c090) : undefined,
        });
      }
      a *= 1.45 + rnd() * 0.9;
    }
  }

  const comets: CometData[] = [];
  const cometCount = rnd() < 0.55 ? 1 + Math.floor(rnd() * 2) : 0;
  for (let i = 0; i < cometCount; i++) {
    const aAu = Math.sqrt(lum) * (2 + rnd() * 14);
    comets.push({
      id: `hyg-${star.id}-c${i + 1}`,
      name: `Cometa ${star.name} ${'ABC'[i]}`,
      aAu,
      eccentricity: 0.55 + rnd() * 0.35,
      periodYears: Math.sqrt((aAu * aAu * aAu) / mass),
      phase: rnd() * Math.PI * 2,
      tilt: (rnd() - 0.5) * 1.6,
      perihelion: rnd() * Math.PI * 2,
    });
  }

  return { starId: star.id, name: star.name, luminosity: lum, habitable: hz, planets, comets, catalogued: !!known };
}

/** Distância (UA, na cena) em que a nave para ao chegar a um sistema: dá para ver todas as órbitas. */
export function systemViewRadius(sys: SystemData, star: StarInfo): number {
  let outer = 0;
  for (const p of sys.planets) outer = Math.max(outer, compressOrbit(p.aAu));
  return Math.max(outer * 1.25, starVisualRadius(star) * 12, 0.25);
}

export interface SystemSummary {
  planets: number;
  rocky: number;
  /** Planetas rochosos na zona habitável. */
  habitable: number;
  /** Melhor sinal de vida nativa encontrado na varredura. */
  life: LifeTier;
  comets: number;
}

const LIFE_ORDER: LifeTier[] = ['none', 'plants', 'animals', 'sapient'];

export function lifeTierOf(p: PlanetData): LifeTier {
  return nativeLifeTier(p.id, p.life);
}

export function summarize(sys: SystemData): SystemSummary {
  let life: LifeTier = 'none';
  let rocky = 0;
  let habitable = 0;
  for (const p of sys.planets) {
    if (p.kind !== 'rocky') continue;
    rocky++;
    if (p.aAu >= sys.habitable[0] && p.aAu <= sys.habitable[1]) habitable++;
    const tier = lifeTierOf(p);
    if (LIFE_ORDER.indexOf(tier) > LIFE_ORDER.indexOf(life)) life = tier;
  }
  return { planets: sys.planets.length, rocky, habitable, life, comets: sys.comets.length };
}

export const LIFE_LABEL: Record<LifeTier, string> = {
  none: 'sem sinais de vida',
  plants: 'sinais de vegetação',
  animals: 'sinais de vida animal',
  sapient: 'sinais de vida inteligente',
};

/** Posição do cometa (UA de cena, relativa à estrela) e distância real à estrela, em UA. */
export function cometOffset(c: CometData, t: number, out: { x: number; y: number; z: number }): number {
  const M = c.phase + (t / (c.periodYears * 1200)) * Math.PI * 2;
  let E = M;
  for (let i = 0; i < 8; i++) E -= (E - c.eccentricity * Math.sin(E) - M) / (1 - c.eccentricity * Math.cos(E));
  const x = c.aAu * (Math.cos(E) - c.eccentricity);
  const y = c.aAu * Math.sqrt(1 - c.eccentricity * c.eccentricity) * Math.sin(E);
  const r = Math.hypot(x, y);
  const k = compressOrbit(r) / r;
  const cp = Math.cos(c.perihelion);
  const sp = Math.sin(c.perihelion);
  const px = (x * cp - y * sp) * k;
  const py = (x * sp + y * cp) * k;
  out.x = px;
  out.y = py * Math.cos(c.tilt);
  out.z = py * Math.sin(c.tilt);
  return r;
}

/** Raio visual do núcleo do cometa, em UA. */
export const COMET_RADIUS = (40 / KM_PER_AU) * 2000;

/** Pontos da órbita comprimida do cometa (UA de cena, relativos à estrela), para desenhar a elipse. */
export function cometPath(c: CometData, n = 128): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  // Amostrar a anomalia excêntrica distribui os pontos melhor que o tempo.
  for (let i = 0; i < n; i++) {
    const E = (i / n) * Math.PI * 2;
    const M = E - c.eccentricity * Math.sin(E);
    const p = { x: 0, y: 0, z: 0 };
    cometOffset({ ...c, phase: M, periodYears: Infinity }, 0, p);
    out.push(p);
  }
  return out;
}

/** Frase curta sobre o sistema, para o GUIA e o diário de bordo. */
export function describeSystem(s: SystemSummary): string {
  if (!s.planets) return s.comets ? `nenhum planeta, ${s.comets} cometa(s)` : 'nenhum planeta';
  const parts = [`${s.planets} planeta(s)`];
  if (s.rocky) parts.push(`${s.rocky} rochoso(s)`);
  if (s.habitable) parts.push(`${s.habitable} na zona habitável`);
  let text = parts.join(', ');
  if (s.life !== 'none') text += `; ${LIFE_LABEL[s.life]}`;
  if (s.comets) text += `; ${s.comets} cometa(s)`;
  return text;
}

/** Duração (s de jogo) da janela em que um cometa visitante pode passar por um sistema. */
export const VISITOR_WINDOW_S = 480;

/**
 * Cometa visitante: de tempos em tempos um cometa de órbita muito alongada
 * mergulha no sistema, passa perto da estrela no meio da janela e volta para
 * longe. Sorteado pelo id da estrela e pela janela de tempo, então é o mesmo
 * para todos os jogadores no mesmo instante (RNF-06).
 */
export function visitorComet(sys: SystemData, window: number): CometData | null {
  const rnd = mulberry32(seedFor(`visitor:${sys.starId}:${window}`));
  if (rnd() > 0.6) return null;
  const sq = Math.sqrt(sys.luminosity);
  const q = sq * (0.3 + rnd() * 1.2);
  const eccentricity = 0.93 + rnd() * 0.05;
  const aAu = q / (1 - eccentricity);
  const mass = Math.pow(sys.luminosity, 1 / 3.5);
  const periodYears = Math.sqrt((aAu * aAu * aAu) / mass);
  const mid = (window + 0.5) * VISITOR_WINDOW_S;
  return {
    id: `hyg-${sys.starId}-v${window}`,
    name: `Cometa visitante ${alienName(rnd)}`,
    aAu,
    eccentricity,
    periodYears,
    // Periélio no meio da janela.
    phase: -((mid / (periodYears * 1200)) % 1) * Math.PI * 2,
    tilt: (rnd() - 0.5) * 2.4,
    perihelion: rnd() * Math.PI * 2,
  };
}
