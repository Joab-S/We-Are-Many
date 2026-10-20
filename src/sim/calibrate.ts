/**
 * Calibração Monte Carlo (REQUISITOS-VIDA.md, RF-VIDA-308 e 311): roda um
 * mundo sem tela por alguns anos e mede os indicadores que têm faixa-alvo.
 * Usado pelos testes (poucas sementes) e por `npm run calibrar` (muitas).
 */

import { generateSurface, type PlanetParams } from '../procgen/surface';
import { Ecosystem, isLand, YEAR_SECONDS } from './ecosystem';
import { GOODS } from './economy';
import { welfare } from './needs';
import { roadBlocks } from './settlement';
import { nativeSpecies } from './species';

export interface Indicators {
  seed: number;
  years: number;
  extinct: number;
  settlements: number;
  cities: number;
  biggest: number;
  kingdoms: number;
  /** Média de guerras ao mesmo tempo, amostrada uma vez por ano. */
  wars: number;
  /** Maior era alcançada (0 = Pedra) e o progresso dentro dela. */
  era: number;
  roadBlocks: number;
  droughts: number;
  /** Casas sem nenhuma rua a até 2 tiles. */
  housesOffStreet: number;
  /** Completude média da planta (RF-VIDA-201). */
  completeness: number;
  /** Casas com andar a mais (reformas). */
  reformed: number;
  /** Vocações diferentes entre os assentamentos vivos (RF-VIDA-220). */
  vocations: number;
  /** Assentamentos com rebanho (RF-VIDA-215). */
  herds: number;
  /** Atendimento médio das necessidades (RF-VIDA-210). */
  welfare: number;
  /** Preenchimento médio dos estoques do que o assentamento produz além do que gasta (RF-VIDA-219b). */
  stockFill: number;
  /** Recursos acima do teto no fim (deve ser zero, RF-VIDA-218). */
  overCap: number;
  /** Estabilidade média (RF-VIDA-280). */
  stability: number;
}

/** Terra do tamanho dos testes; `radius` 1 é a Terra do jogo (1024×512). */
export function earthParams(radius = 0.4): PlanetParams {
  return { id: 'sol-3', name: 'Terra', radiusEarth: radius, temperatureK: 288, water: 0.6, life: 0.85 };
}

/**
 * Um mundo com a fauna da Terra e 6 aldeias semeadas em terra boa, rodando
 * `years` anos em passos de 0,25 s.
 */
export function runWorld(seed: number, years: number, radius = 0.4): { eco: Ecosystem; indicators: Indicators } {
  const params = earthParams(radius);
  const map = generateSurface(params);
  const eco = new Ecosystem(map, seed);
  for (const sp of nativeSpecies(params)) eco.addSpecies(sp);
  eco.populate();
  const s = eco.species.findIndex((sp) => sp.kind === 'sapient');
  // Aldeias semeadas com um gerador próprio, para não mexer nos sorteios do mundo.
  let a = (seed * 2654435761) >>> 0;
  const rnd = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
  let placed = 0;
  for (let t = 0; t < 4000 && placed < 6; t++) {
    const x = Math.floor(rnd() * map.width);
    const y = Math.floor(map.height * (0.3 + 0.4 * rnd()));
    const i = y * map.width + x;
    if (isLand(map, i) && map.vegetation[i] > 0.3 && eco.canFound(x, y) && eco.introduceOne(s, x + 0.5, y + 0.5) >= 0) {
      eco.foundVillage(s, x, y, 8);
      placed++;
    }
  }
  let wars = 0;
  for (let y = 0; y < years; y++) {
    for (let t = 0; t < YEAR_SECONDS; t += 0.25) eco.step(0.25);
    wars += eco.wars.length;
  }
  const live = eco.villages.filter((v) => !v.abandoned);
  const e = eco as unknown as { road: Uint8Array };
  let off = 0;
  for (const v of live) {
    for (const h of v.houses) {
      if (h.kind !== 'house') continue;
      let near = false;
      for (let dy = -2; dy <= 3 && !near; dy++) {
        for (let dx = -2; dx <= 3 && !near; dx++) {
          const ty = h.y + dy;
          if (ty < 0 || ty >= map.height) continue;
          const r = e.road[ty * map.width + (((h.x + dx) % map.width) + map.width) % map.width];
          if (r >= 1 && r <= 3) near = true;
        }
      }
      if (!near) off++;
    }
  }
  let fill = 0;
  let fills = 0;
  let over = 0;
  for (const v of live) {
    for (const g of [...GOODS, 'food'] as const) {
      const cap = eco.capOf(v, g);
      const have = g === 'food' ? v.food : v.stock[g];
      if (have > cap + 1e-6) over++;
      // Só o que sobra no ano (feito > gasto) forma estoque; o resto é consumido ao chegar.
      const l = v.ledger?.[g];
      if (l && l[0] > l[1]) {
        fill += have / cap;
        fills++;
      }
    }
  }
  return {
    eco,
    indicators: {
      seed,
      years,
      extinct: eco.species.filter((_, k) => eco.population[k] === 0).length,
      settlements: live.length,
      cities: live.filter((v) => v.tier >= 2).length,
      biggest: Math.max(0, ...live.map((v) => v.population)),
      kingdoms: live.filter((v) => v.kingdom === v.id).length,
      wars: wars / Math.max(1, years),
      era: Math.max(0, ...live.map((v) => v.tech)),
      roadBlocks: roadBlocks(e.road, map.width, map.height),
      droughts: eco.chronicle.filter((c) => c.text.startsWith('Uma seca')).reduce((n, c) => n + (c.count ?? 1), 0),
      housesOffStreet: off,
      completeness: live.reduce((n, v) => n + (v.completeness ?? 1), 0) / Math.max(1, live.length),
      reformed: live.reduce((n, v) => n + v.houses.filter((h) => (h.level ?? 0) > 0).length, 0),
      vocations: new Set(live.map((v) => v.vocation)).size,
      herds: live.filter((v) => v.herd && v.herd.head > 0).length,
      welfare: live.reduce((n, v) => n + (v.needs ? welfare(v.needs) : 1), 0) / Math.max(1, live.length),
      stockFill: fills ? fill / fills : 0,
      overCap: over,
      stability: live.reduce((n, v) => n + (v.stability ?? 1), 0) / Math.max(1, live.length),
    },
  };
}

/** Faixas-alvo da tabela de 19.15 que já podem ser medidas. */
export const TARGETS: { key: keyof Indicators; label: string; min: number; max: number }[] = [
  { key: 'extinct', label: 'Espécies extintas', min: 0, max: 2 },
  { key: 'settlements', label: 'Assentamentos vivos', min: 12, max: 40 },
  { key: 'cities', label: 'Cidades', min: 1, max: 99 },
  { key: 'wars', label: 'Guerras ao mesmo tempo (média)', min: 0, max: 3 },
  { key: 'roadBlocks', label: 'Blocos 2x2 de rua fora das praças', min: 0, max: 0 },
  { key: 'housesOffStreet', label: 'Casas longe de rua', min: 0, max: 0 },
  { key: 'completeness', label: 'Completude média da planta', min: 0.5, max: 1 },
  { key: 'vocations', label: 'Vocações diferentes', min: 4, max: 8 },
  { key: 'stockFill', label: 'Preenchimento médio dos estoques', min: 0.3, max: 0.8 },
  { key: 'overCap', label: 'Recursos acima do teto', min: 0, max: 0 },
];

/** Nome de cada indicador no relatório. */
export const LABELS: Partial<Record<keyof Indicators, string>> = {
  biggest: 'Maior assentamento (moradores)',
  kingdoms: 'Reinos',
  era: 'Maior era (0 = Pedra, 1 = Bronze...)',
  droughts: 'Secas na crônica',
  reformed: 'Casas reformadas (com andar a mais)',
  herds: 'Assentamentos com rebanho',
  welfare: 'Atendimento médio das necessidades',
  stability: 'Estabilidade média',
};

/** Média, mediana e faixa de 10% a 90% de uma lista. */
export function summary(values: number[]): { mean: number; median: number; p10: number; p90: number } {
  const s = [...values].sort((x, y) => x - y);
  const at = (q: number) => s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
  return { mean: s.reduce((x, y) => x + y, 0) / Math.max(1, s.length), median: at(0.5), p10: at(0.1), p90: at(0.9) };
}
