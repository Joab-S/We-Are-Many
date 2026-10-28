/**
 * Calibração Monte Carlo (REQUISITOS-VIDA.md, RF-VIDA-308 e 311): roda um
 * mundo sem tela por alguns anos e mede os indicadores que têm faixa-alvo.
 * Usado pelos testes (poucas sementes) e por `npm run calibrar` (muitas).
 */

import { generateSurface, type PlanetParams } from '../procgen/surface';
import { Ecosystem, isLand, YEAR_SECONDS } from './ecosystem';
import { isStreet } from './architecture';
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
  /** Etapa 0 da evolução dos povos: mediana de moradores, parte do povo em cidades e metrópoles, metrópoles e reinos com 3 ou mais assentamentos. */
  medianPop: number;
  cityShare: number;
  metropoles: number;
  bigKingdoms: number;
  /** Assentamentos fundados depois das aldeias semeadas (por êxodo, colonos, barco ou alguém sozinho). */
  founded: number;
  /** Média de guerras ao mesmo tempo, amostrada uma vez por ano. */
  wars: number;
  /** Maior era alcançada (0 = Pedra) e o progresso dentro dela. */
  era: number;
  /** Técnicas conhecidas por assentamento vivo (média) e a diferença de progresso entre o mais e o menos adiantado (seção 19.10). */
  techs: number;
  eraSpread: number;
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
  /** Média de caravanas e barcos mercantes ao mesmo tempo, amostrada uma vez por ano (RF-VIDA-230 e 236), e o máximo. */
  caravans: number;
  caravansMax: number;
  /** Acordos comerciais em vigor no fim (RF-VIDA-232). */
  agreements: number;
  /** Tiles de estrada que nasceram do uso (RF-VIDA-233). */
  routeTiles: number;
  /** Assentamentos que produzem algum luxo (RF-VIDA-282). */
  luxuries: number;
  /** Postos de pedágio (RF-VIDA-286). */
  tolls: number;
  /** Seção 19.19: moradores no fim e a razão entre o fim e 60% da rodada (boom acima de 1, declínio abaixo). */
  people: number;
  peopleTrend: number;
  /** Atendimento médio de comida e de lenha. */
  foodNeed: number;
  fuelNeed: number;
  /** Mortes de fome e de frio por ano, por 100 moradores. */
  hunger: number;
  cold: number;
  /** Casas que desabaram sem conserto, guerras por cobiça, êxodos e migrantes por ano. */
  collapsed: number;
  greedWars: number;
  exodus: number;
  migrants: number;
  /** Famílias que se mudaram por ano (migração por nota, etapa 2). */
  familyMoves: number;
  /** Comida que o campo mandou para cidades e vilas maiores do reino, por ano. */
  supplied: number;
  /** Árvores cortadas por ano, parte delas replantada, assentamentos que manejam a mata e a mata que sobrou em volta. */
  treesCut: number;
  replanted: number;
  forestry: number;
  forestLeft: number;
  /** Árvores de pé no planeta no fim ÷ no começo. */
  worldTrees: number;
  /** Etapa F: guerras por motivo, pico ao mesmo tempo, vezes acima do teto, crônica sem motivo e o que as guerras deixaram. */
  lootWars: number;
  landWars: number;
  exterminations: number;
  civilWars: number;
  warsPeak: number;
  plans: number;
  plansDropped: number;
  /** Anos médios de preparo até declarar. */
  prepYears: number;
  warsDeclared: number;
  warsNoMotive: number;
  looted: number;
  burned: number;
  refugees: number;
  mercenaries: number;
  retreats: number;
  cavalry: number;
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
  let cavalry = 0;
  let caravans = 0;
  let caravansMax = 0;
  let mid = 0;
  const countTrees = () => {
    let n = 0;
    for (let i = 0; i < map.width * map.height; i++) if (eco.standingTree(i)) n++;
    return n;
  };
  const trees0 = countTrees();
  const sapient = () => eco.villages.reduce((n, v) => n + (v.abandoned ? 0 : v.population), 0);
  for (let y = 0; y < years; y++) {
    for (let t = 0; t < YEAR_SECONDS; t += 0.25) eco.step(0.25);
    if (y === Math.floor(years * 0.6)) mid = sapient();
    wars += eco.wars.length;
    for (let i = 0; i < eco.count; i++) if (eco.alive[i] && eco.mounted(i)) cavalry++;
    const moving = eco.caravans.filter((c) => c.kind !== 'flock').length + eco.boats.filter((b) => b.purpose === 'trade' && b.sunk < 0).length;
    caravans += moving;
    caravansMax = Math.max(caravansMax, moving);
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
          if (isStreet(r)) near = true;
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
      medianPop: live.length ? [...live].sort((p, q) => p.population - q.population)[live.length >> 1].population : 0,
      cityShare: live.reduce((n, v) => n + (v.tier >= 2 ? v.population : 0), 0) / Math.max(1, sapient()),
      metropoles: live.filter((v) => v.tier >= 3).length,
      bigKingdoms: live.filter((v) => v.kingdom === v.id && eco.kingdomSize(v) >= 3).length,
      founded: eco.villages.length - placed,
      wars: wars / Math.max(1, years),
      era: Math.max(0, ...live.map((v) => v.tech)),
      techs: live.length ? live.reduce((n, v) => n + (v.techs?.length ?? 0), 0) / live.length : 0,
      eraSpread: live.length ? Math.max(...live.map((v) => v.tech)) - Math.min(...live.map((v) => v.tech)) : 0,
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
      caravans: caravans / Math.max(1, years),
      caravansMax,
      agreements: eco.agreements.length,
      routeTiles: eco.routeTiles,
      luxuries: live.filter((v) => v.luxury && Math.floor(v.tech) >= 0).filter((v) => (v.ledger?.[v.luxury!]?.[0] ?? 0) > 0).length,
      tolls: eco.tolls.size,
      people: sapient(),
      peopleTrend: mid ? sapient() / mid : 0,
      foodNeed: live.reduce((n, v) => n + (v.needs?.food ?? 1), 0) / Math.max(1, live.length),
      fuelNeed: live.reduce((n, v) => n + (v.needs?.fuel ?? 1), 0) / Math.max(1, live.length),
      hunger: (eco.tally.hunger / Math.max(1, years)) * (100 / Math.max(1, sapient())),
      cold: (eco.tally.cold / Math.max(1, years)) * (100 / Math.max(1, sapient())),
      collapsed: eco.tally.collapsed / Math.max(1, years),
      greedWars: eco.tally.greedWars,
      exodus: eco.tally.exodus,
      migrants: eco.tally.migrants / Math.max(1, years),
      familyMoves: eco.tally.familyMoves / Math.max(1, years),
      supplied: eco.tally.supplied / Math.max(1, years),
      treesCut: eco.treesCut / Math.max(1, years),
      replanted: eco.treesCut ? eco.treesPlanted / eco.treesCut : 0,
      forestry: live.filter((v) => v.forestry).length,
      worldTrees: countTrees() / Math.max(1, trees0),
      lootWars: eco.tally.lootWars,
      landWars: eco.tally.landWars,
      exterminations: eco.tally.exterminations,
      civilWars: eco.tally.civilWars,
      warsPeak: eco.tally.warsPeak,
      plans: eco.tally.plans,
      plansDropped: eco.tally.plansDropped,
      prepYears: eco.tally.wars ? eco.tally.prepYears / eco.tally.wars : 0,
      warsDeclared: eco.tally.wars,
      // Toda declaração de guerra na crônica diz o motivo (RF-VIDA-244): "para tomar", "para arrasar" ou guerra civil.
      warsNoMotive: eco.chronicle.filter((c) => c.kind === 'guerra' && /^Guerra!|atacou/.test(c.text) && !/para tomar|para arrasar|para dominar|por vingança|em nome da fé/.test(c.text)).length,
      looted: eco.tally.looted,
      burned: eco.tally.burned,
      refugees: eco.tally.refugees,
      mercenaries: eco.tally.mercenaries,
      retreats: eco.tally.retreats,
      cavalry: cavalry / Math.max(1, years),
      forestLeft: live.reduce((n, v) => n + (v.treesStart ? (v.trees ?? 0) / v.treesStart : 1), 0) / Math.max(1, live.length),
    },
  };
}

/** Faixas-alvo da tabela de 19.15 que já podem ser medidas. */
export const TARGETS: { key: keyof Indicators; label: string; min: number; max: number }[] = [
  { key: 'extinct', label: 'Espécies extintas', min: 0, max: 2 },
  // Antes: 12 a 40. O povo agora evolui o assentamento inicial antes de fundar outros (pedido do Joab), então são menos e maiores.
  { key: 'settlements', label: 'Assentamentos vivos', min: 6, max: 40 },
  { key: 'cities', label: 'Cidades', min: 1, max: 99 },
  { key: 'wars', label: 'Guerras ao mesmo tempo (média)', min: 0, max: 3 },
  { key: 'roadBlocks', label: 'Blocos 2x2 de rua fora das praças', min: 0, max: 0 },
  { key: 'housesOffStreet', label: 'Casas longe de rua', min: 0, max: 0 },
  { key: 'completeness', label: 'Completude média da planta', min: 0.5, max: 1 },
  { key: 'vocations', label: 'Vocações diferentes', min: 4, max: 8 },
  // Antes: 0,3 a 0,8. Com recursos finitos (seção 19.19) o estoque vive mais vazio, sem fartura.
  { key: 'stockFill', label: 'Preenchimento médio dos estoques', min: 0.2, max: 0.8 },
  { key: 'overCap', label: 'Recursos acima do teto', min: 0, max: 0 },
  { key: 'caravansMax', label: 'Caravanas e barcos mercantes ao mesmo tempo (máximo)', min: 1, max: 10 },
  // Recursos com peso (seção 19.19): a fome existe mas não acaba com o mundo, a população não explode nem some e a mata não some nem toma tudo.
  { key: 'hunger', label: 'Mortes de fome por ano, por 100 moradores', min: 0.05, max: 3 },
  // Casas que desabam por falta de conserto (seção 19.20).
  { key: 'collapsed', label: 'Casas desabadas sem conserto por ano', min: 0, max: 0.2 },
  { key: 'peopleTrend', label: 'Moradores: fim ÷ 60% da rodada', min: 0.7, max: 1.5 },
  { key: 'worldTrees', label: 'Árvores do mundo: fim ÷ começo', min: 0.7, max: 1.3 },
  { key: 'forestry', label: 'Assentamentos que replantam', min: 1, max: 99 },
  // Etapa F (seção 19.7): sem teto de guerras; toda guerra tem motivo na crônica.
  { key: 'warsNoMotive', label: 'Declarações de guerra sem motivo na crônica', min: 0, max: 0 },
];

/**
 * Metas da rodada longa (`npm run calibrar:longa`, 1000 anos na Terra do jogo): o povo se
 * concentra em cidades com o tempo, em vez de se espalhar em aldeias pequenas (evolução dos povos, etapa 0).
 */
export const LONG_TARGETS: { key: keyof Indicators; label: string; min: number; max: number }[] = [
  { key: 'medianPop', label: 'Mediana de moradores por assentamento', min: 30, max: 9999 },
  { key: 'cityShare', label: 'Parte do povo em cidades e metrópoles', min: 0.2, max: 0.6 },
  { key: 'metropoles', label: 'Metrópoles', min: 1, max: 6 },
  { key: 'bigKingdoms', label: 'Reinos com 3 ou mais assentamentos', min: 3, max: 25 },
  { key: 'kingdoms', label: 'Reinos', min: 5, max: 40 },
  { key: 'hunger', label: 'Mortes de fome por ano, por 100 moradores', min: 0, max: 0.5 },
  { key: 'peopleTrend', label: 'Moradores: fim ÷ 60% da rodada', min: 1, max: 3 },
];

/** Nome de cada indicador no relatório. */
export const LABELS: Partial<Record<keyof Indicators, string>> = {
  settlements: 'Assentamentos vivos',
  cities: 'Cidades',
  biggest: 'Maior assentamento (moradores)',
  kingdoms: 'Reinos',
  medianPop: 'Mediana de moradores por assentamento',
  cityShare: 'Parte do povo em cidades e metrópoles',
  metropoles: 'Metrópoles',
  bigKingdoms: 'Reinos com 3 ou mais assentamentos',
  founded: 'Assentamentos fundados na rodada',
  era: 'Maior era (0 = Pedra, 1 = Bronze...)',
  techs: 'Técnicas por assentamento (média)',
  eraSpread: 'Diferença de progresso entre o mais e o menos adiantado',
  droughts: 'Secas na crônica',
  reformed: 'Casas reformadas (com andar a mais)',
  herds: 'Assentamentos com rebanho',
  welfare: 'Atendimento médio das necessidades',
  stability: 'Estabilidade média',
  caravans: 'Caravanas e barcos mercantes ao mesmo tempo (média)',
  agreements: 'Acordos comerciais no fim',
  routeTiles: 'Tiles de estrada nascidos do uso',
  luxuries: 'Assentamentos que produzem luxo',
  tolls: 'Postos de pedágio',
  people: 'Moradores no fim',
  peopleTrend: 'Moradores: fim ÷ 60% da rodada',
  foodNeed: 'Atendimento médio de comida',
  fuelNeed: 'Atendimento médio de lenha',
  hunger: 'Mortes de fome por ano, por 100 moradores',
  cold: 'Mortes de frio por ano, por 100 moradores',
  collapsed: 'Casas desabadas sem conserto por ano',
  greedWars: 'Guerras por cobiça (comida ou lenha)',
  exodus: 'Êxodos por falta',
  migrants: 'Migrantes por ano',
  familyMoves: 'Famílias que se mudaram por ano',
  supplied: 'Comida do campo para lugares maiores do reino, por ano',
  treesCut: 'Árvores cortadas por ano',
  replanted: 'Parte das árvores replantada',
  forestry: 'Assentamentos que manejam a mata',
  forestLeft: 'Mata que sobrou em volta (÷ a do começo)',
  worldTrees: 'Árvores no planeta (fim ÷ começo)',
  lootWars: 'Guerras de saque',
  landWars: 'Guerras de território',
  exterminations: 'Guerras de extermínio',
  civilWars: 'Guerras civis',
  warsPeak: 'Guerras ao mesmo tempo (pico)',
  plans: 'Preparos de guerra começados',
  plansDropped: 'Preparos que caíram (desistência, paz, alvo perdido)',
  prepYears: 'Anos de preparo até declarar (média)',
  warsDeclared: 'Guerras declaradas',
  looted: 'Saques que chegaram ao alvo',
  burned: 'Casas e roças queimadas',
  refugees: 'Refugiados de guerra',
  mercenaries: 'Mercenários contratados',
  retreats: 'Exércitos que voltaram sem comida',
  cavalry: 'Soldados montados (média por ano)',
};

/** Linhas da tabela do relatório: média, mediana, faixa de 10% a 90% e, quando há meta, se ficou dentro. */
export function reportRows(runs: Indicators[], targets: { key: keyof Indicators; label: string; min: number; max: number }[], only?: (keyof Indicators)[]): string[] {
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2)).replace('.', ',');
  return (only ?? (Object.keys(runs[0]) as (keyof Indicators)[]))
    .filter((k) => k !== 'seed' && k !== 'years')
    .map((key) => {
      const s = summary(runs.map((r) => r[key]));
      const target = targets.find((t) => t.key === key);
      const ok = target ? (s.p10 >= target.min && s.p90 <= target.max ? 'dentro' : '**fora**') : '';
      return `| ${target?.label ?? LABELS[key] ?? key} | ${fmt(s.mean)} | ${fmt(s.median)} | ${fmt(s.p10)} a ${fmt(s.p90)} | ${target ? `${fmt(target.min)} a ${fmt(target.max)}` : ''} | ${ok} |`;
    });
}

/** Média, mediana e faixa de 10% a 90% de uma lista. */
export function summary(values: number[]): { mean: number; median: number; p10: number; p90: number } {
  const s = [...values].sort((x, y) => x - y);
  const at = (q: number) => s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
  return { mean: s.reduce((x, y) => x + y, 0) / Math.max(1, s.length), median: at(0.5), p10: at(0.1), p90: at(0.9) };
}
