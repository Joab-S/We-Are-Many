/**
 * Calibração Monte Carlo (REQUISITOS-VIDA.md, RF-VIDA-308 e 311): roda um
 * mundo sem tela por alguns anos e mede os indicadores que têm faixa-alvo.
 * Usado pelos testes (poucas sementes) e por `npm run calibrar` (muitas).
 */

import { generateSurface, type PlanetParams } from '../procgen/surface';
import * as B from './balance';
import { Ecosystem, isLand, YEAR_SECONDS, type Village } from './ecosystem';
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
  /** Plano novo dos assentamentos (RF-AS, seção 7 do plano): nascimento e tamanho. */
  realms: number;
  smallShare: number;
  soloShare: number;
  shortLived: number;
  colonies: number;
  farmsteads: number;
  merged: number;
  tierDowns: number;
  /** Visual: densidade do núcleo de cidades, árvores nativas no núcleo de vilas em diante, roças perto das casas. */
  coreDensity: number;
  coreTrees: number;
  fieldsNear: number;
  /** Comportamento (lugares no modo completo): tarefa reservada, tempo parado e passos sobre rua ou trilha. */
  taskShare: number;
  idleShare: number;
  onStreet: number;
  /** Relações: casamentos entre lugares, aldeias e vilas com cidade de referência, anexações pacíficas, povos novos, ajudas e rivalidades. */
  interMarriage: number;
  refCoverage: number;
  annexations: number;
  newPeoples: number;
  aid: number;
  rivalries: number;
  /**
   * Quando sair e fissão (agente 3B): parte das fundações por pressão social contra as por fome (as por recurso
   * não entram na conta), quantas foram por fome, fissões e o tamanho médio da origem na hora da fissão (alvo 100 a 300).
   */
  pressureShare: number;
  famineFounds: number;
  fissions: number;
  fissionPop: number;
}

/** Terra do tamanho dos testes; `radius` 1 é a Terra do jogo (1024×512). */
export function earthParams(radius = 0.4): PlanetParams {
  return { id: 'sol-3', name: 'Terra', radiusEarth: radius, temperatureK: 288, water: 0.6, life: 0.85 };
}

/** Um mundo com a fauna da Terra e 6 aldeias semeadas em terra boa, ainda sem rodar (`placed` é quantas couberam). */
export function seedWorld(seed: number, radius = 0.4): { eco: Ecosystem; map: ReturnType<typeof generateSurface>; placed: number } {
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
  return { eco, map, placed };
}

/**
 * Um mundo com a fauna da Terra e 6 aldeias semeadas em terra boa, rodando
 * `years` anos em passos de 0,25 s.
 *
 * `yearSpan` é a duração do ano de calendário em segundos (eco/core/clock.ts). O padrão é o ano de ação
 * (`YEAR_SECONDS`), em que os dois relógios coincidem e toda a calibração foi feita; com o ano do jogo
 * (`REAL_YEAR_SECONDS`, 12 s) mede o que o jogador vê: `years` anos exibidos, cada um com dois anos de ação.
 * Nos scripts de calibração, pela variável de ambiente YEAR_SPAN.
 */
export function runWorld(seed: number, years: number, radius = 0.4, yearSpan = YEAR_SECONDS): { eco: Ecosystem; indicators: Indicators } {
  const { eco, map, placed } = seedWorld(seed, radius);
  // Como no jogo: o ano da tela é definido depois de povoar o mundo.
  eco.yearSpan = yearSpan;
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
  // Os 3 maiores lugares rodam no modo completo (jornadas), revistos todo ano, para medir o comportamento (seção 7.3).
  const watch = () => {
    const top = eco.villages.filter((v) => !v.abandoned).sort((p, q) => q.population - p.population).slice(0, 3);
    eco.watch(top.map((v) => v.id));
  };
  const sapient = () => eco.villages.reduce((n, v) => n + (v.abandoned ? 0 : v.population), 0);
  for (let y = 0; y < years; y++) {
    watch();
    for (let t = 0; t < yearSpan; t += 0.25) eco.step(0.25);
    if (y === Math.floor(years * 0.6)) mid = sapient();
    wars += eco.wars.length;
    for (let i = 0; i < eco.count; i++) if (eco.alive[i] && eco.mounted(i)) cavalry++;
    const moving = eco.caravans.filter((c) => c.kind === 'trade' || c.kind === 'tribute').length + eco.boats.filter((b) => b.purpose === 'trade' && b.sunk < 0).length;
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
  const ring = settlementForm(eco, live);
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
      realms: live.filter((v) => eco.isRealm(v)).length,
      smallShare: live.filter((v) => v.population < 15).length / Math.max(1, live.length),
      soloShare: eco.tally.soloFounds / Math.max(1, eco.villages.length - placed),
      shortLived: eco.tally.shortLived / Math.max(1, eco.villages.length),
      colonies: eco.tally.colonies,
      farmsteads: eco.tally.farmsteads,
      merged: eco.tally.merged,
      tierDowns: eco.tally.tierDowns,
      coreDensity: ring.density,
      coreTrees: ring.trees,
      fieldsNear: ring.fieldsNear,
      taskShare: eco.dayStats.samples ? eco.dayStats.tasked / eco.dayStats.samples : 0,
      idleShare: eco.dayStats.samples ? eco.dayStats.idle / eco.dayStats.samples : 0,
      onStreet: eco.dayStats.steps ? eco.dayStats.streetSteps / eco.dayStats.steps : 0,
      interMarriage: eco.tally.interMarriages / Math.max(1, eco.tally.marriages),
      refCoverage: (() => {
        const small = live.filter((v) => v.tier <= 1 && !eco.isMarket(v));
        return small.filter((v) => v.ref !== undefined && !eco.villages[v.ref]?.abandoned).length / Math.max(1, small.length);
      })(),
      annexations: eco.tally.annexations,
      newPeoples: eco.tally.newPeoples,
      aid: eco.tally.aid,
      rivalries: eco.tally.rivalries,
      pressureShare: eco.tally.foundPressure / Math.max(1, eco.tally.foundPressure + eco.tally.foundFamine),
      famineFounds: eco.tally.foundFamine,
      fissions: eco.tally.fissions,
      fissionPop: eco.tally.fissions ? eco.tally.fissionPop / eco.tally.fissions : 0,
    },
  };
}

/**
 * Forma dos lugares no fim (seção 7.2 do plano): parte da metade interna da pegada de cidades e
 * metrópoles ocupada (casa, prédio, rua ou praça), árvores nativas no núcleo de vilas em diante
 * e parte das roças a até `FIELD_RING` tiles de uma casa.
 */
export function settlementForm(eco: Ecosystem, live: Village[]): { density: number; trees: number; fieldsNear: number } {
  const map = eco.map;
  const w = map.width;
  const e = eco as unknown as { road: Uint8Array; built: Uint8Array };
  let filled = 0;
  let cells = 0;
  let trees = 0;
  for (const v of live) {
    if (v.tier < 1) continue;
    const r = eco.footprint(v) / 2;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const ty = Math.floor(v.y) + dy;
        if (ty < 0 || ty >= map.height) continue;
        const t = ty * w + ((((Math.floor(v.x) + dx) % w) + w) % w);
        if (!isLand(map, t)) continue;
        if (eco.standingTree(t)) trees++;
        if (v.tier < 2) continue;
        cells++;
        if (e.built[t] || (e.road[t] && e.road[t] !== 4 && e.road[t] !== 5)) filled++;
      }
    }
  }
  let fields = 0;
  let near = 0;
  for (let t = 0; t < w * map.height; t++) {
    if (e.road[t] !== 4) continue;
    fields++;
    const x = t % w;
    const y = Math.floor(t / w);
    let hit = false;
    for (let dy = -B.FIELD_RING; dy <= B.FIELD_RING && !hit; dy++) {
      const ty = y + dy;
      if (ty < 0 || ty >= map.height) continue;
      for (let dx = -B.FIELD_RING; dx <= B.FIELD_RING && !hit; dx++) if (e.built[ty * w + ((((x + dx) % w) + w) % w)]) hit = true;
    }
    if (hit) near++;
  }
  return { density: cells ? filled / cells : 1, trees, fieldsNear: fields ? near / fields : 1 };
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
  // Seção 7.1 do plano novo dos assentamentos (RF-AS): menos fundações, lugares maiores e reino só com cidade.
  { key: 'founded', label: 'Assentamentos fundados na rodada', min: 60, max: 110 },
  { key: 'settlements', label: 'Assentamentos vivos', min: 40, max: 90 },
  { key: 'medianPop', label: 'Mediana de moradores por assentamento', min: 50, max: 99999 },
  { key: 'biggest', label: 'Maior assentamento (moradores)', min: 400, max: 99999 },
  { key: 'metropoles', label: 'Metrópoles (400 ou mais)', min: 1, max: 4 },
  { key: 'smallShare', label: 'Parte dos lugares com menos de 15 moradores', min: 0, max: 0.2 },
  { key: 'soloShare', label: 'Parte das fundações feitas por uma família sozinha', min: 0, max: 0.15 },
  { key: 'shortLived', label: 'Parte dos lugares que morreram antes de 50 anos', min: 0, max: 0.15 },
  { key: 'realms', label: 'Reinos (com cidade como capital)', min: 5, max: 25 },
  { key: 'cityShare', label: 'Parte do povo em cidades e metrópoles', min: 0.2, max: 0.6 },
  { key: 'hunger', label: 'Mortes de fome por ano, por 100 moradores', min: 0, max: 0.5 },
  { key: 'peopleTrend', label: 'Moradores: fim ÷ 60% da rodada', min: 1, max: 3 },
  // Seção 7.2: forma.
  { key: 'coreDensity', label: 'Metade interna da pegada das cidades ocupada', min: 0.6, max: 1 },
  { key: 'coreTrees', label: 'Árvores nativas no núcleo de vilas em diante', min: 0, max: 0 },
  { key: 'fieldsNear', label: 'Roças a até 6 tiles de uma casa', min: 0.8, max: 1 },
  { key: 'housesOffStreet', label: 'Casas longe de rua ou trilha', min: 0, max: 0 },
  { key: 'roadBlocks', label: 'Blocos 2x2 de rua fora das praças', min: 0, max: 0 },
  // Seção 7.3: comportamento nos lugares em modo completo.
  { key: 'taskShare', label: 'Adultos que trabalham com tarefa reservada', min: 0.8, max: 1 },
  { key: 'idleShare', label: 'Tempo dos adultos parado sem tarefa nem necessidade', min: 0, max: 0.1 },
  { key: 'onStreet', label: 'Passos dentro da pegada sobre rua ou trilha', min: 0.7, max: 1 },
  // Seção 7.4: relações.
  { key: 'interMarriage', label: 'Casamentos entre pessoas de lugares diferentes', min: 0.1, max: 0.3 },
  { key: 'refCoverage', label: 'Aldeias e vilas com cidade de referência', min: 0.95, max: 1 },
  { key: 'annexations', label: 'Anexações pacíficas na rodada', min: 5, max: 9999 },
  { key: 'newPeoples', label: 'Povos novos por deriva cultural', min: 1, max: 9999 },
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
  pressureShare: 'Parte das fundações por pressão (contra as por fome)',
  famineFounds: 'Fundações por fome',
  fissions: 'Fissões por pressão',
  fissionPop: 'Tamanho médio da origem na fissão (alvo 100 a 300)',
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
