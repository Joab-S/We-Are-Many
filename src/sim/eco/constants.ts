/** Constantes do ecossistema: eras, barcos, construções, rebanhos, ritmos da IA e da fauna. */

import { Biome } from '../../procgen/surface';
import { ROLE } from '../roles';
import { DAY } from '../../ai/decisions/day';
import { BUILDING_TYPES } from '../buildingTypes';
import type { SpeciesKind } from '../species';
import type { WarMotive, BuildingKind, HerdKind, Behaviour } from './types';

/** Segundos de jogo (velocidade 1x) que formam um ano. */
export const YEAR_SECONDS = 6;

export const ERAS = ['Idade da Pedra', 'Idade do Bronze', 'Idade do Ferro', 'Era Medieval', 'Era Industrial'];

/**
 * Anos para passar de cada era à seguinte num assentamento de 30 habitantes.
 * Lento de propósito: mesmo acelerando o tempo dá para acompanhar a história.
 */
export const ERA_YEARS = [300, 350, 450, 550];

/** Chance por ano de um assentamento cheio mandar colonos. */

/**
 * Embarcações por era: mais rápidas, maiores, com mais alcance e mais seguras
 * com o avanço. `risk` é a chance de naufragar numa tempestade a cada tile
 * navegado; `range` é o alcance em tiles de mar.
 */
export const BOATS = [
  { name: 'Canoa', the: 'a canoa', on: 'na canoa', sprite: 'canoe', speed: 1.1, range: 35, risk: 0.004, capacity: 4 },
  { name: 'Barco a remo', the: 'o barco a remo', on: 'no barco a remo', sprite: 'rowboat', speed: 1.4, range: 70, risk: 0.0022, capacity: 6 },
  { name: 'Veleiro', the: 'o veleiro', on: 'no veleiro', sprite: 'sailboat', speed: 2, range: 140, risk: 0.0011, capacity: 8 },
  { name: 'Caravela', the: 'a caravela', on: 'na caravela', sprite: 'caravel', speed: 2.4, range: 320, risk: 0.0005, capacity: 12 },
  { name: 'Navio a vapor', the: 'o navio a vapor', on: 'no navio a vapor', sprite: 'steamship', speed: 3.2, range: 700, risk: 0.0001, capacity: 20 },
];

/** Anos de trégua depois de uma paz. */

/** Tamanho máximo da crônica guardada. */
export const CHRONICLE_MAX = 400;

/** Anos em que repetições com a mesma chave se juntam na mesma linha. */
export const MERGE_YEARS = 30;
export const WAR_MOTIVES: Record<WarMotive, string> = { loot: 'saque', land: 'território', dominion: 'domínio', revenge: 'vingança', faith: 'fé', extermination: 'extermínio', civil: 'guerra civil' };

/** Cores vivas dos reinos (telhados e roupas), como nos jogos de deus em pixel art. */
export const KINGDOM_COLORS: [number, number, number][] = [
  [52, 110, 220],
  [214, 64, 52],
  [232, 140, 40],
  [64, 168, 80],
  [148, 72, 200],
  [36, 170, 176],
  [226, 196, 56],
  [210, 84, 150],
  [240, 240, 240],
  [120, 60, 30],
  [150, 210, 60],
  [30, 60, 140],
  [250, 150, 170],
  [100, 100, 110],
  [170, 30, 90],
  [90, 220, 200],
];

/** Construções especiais, na ordem em que um assentamento costuma erguê-las (a tabela dos tipos está em buildingTypes.ts). */
export { BUILDINGS } from '../buildingTypes';

/** Nome de cada construção, lido da tabela dos tipos (`BUILDING_TYPES`). */
export const BUILDING_NAMES = Object.fromEntries(Object.entries(BUILDING_TYPES).map(([k, t]) => [k, t.name])) as Record<BuildingKind, string>;

/** Animais que um povo cria (RF-VIDA-215). */
export const HERDS = ['sheep', 'cattle', 'goat', 'horse', 'camel'] as const;
export const HERD_NAMES: Record<HerdKind, string> = { sheep: 'ovelhas', cattle: 'gado', goat: 'cabras', horse: 'cavalos', camel: 'camelos' };

/** Anos entre cada etapa do sumiço das ruínas (plantações, depois ruas, depois a praça). */
export const RUIN_YEARS = 12;

export const BEHAVIOUR: Record<SpeciesKind, Behaviour> = {
  fish: { metabolism: 0.03, birthRate: 0.12, cap: 1400, crowd: 6 },
  herbivore: { metabolism: 0.09, birthRate: 0.14, cap: 1600, crowd: 8 },
  predator: { metabolism: 0.026, birthRate: 0.1, cap: 500, crowd: 4 },
  shark: { metabolism: 0.012, birthRate: 0.1, cap: 220, crowd: 3 },
  // Inteligentes crescem devagar: poucos filhos por ano, para a história durar.
  sapient: { metabolism: 0.045, birthRate: 0.022, cap: 6000, crowd: 40 },
};

export const CELL = 8;
export const THINK_INTERVAL = 0.4;

/** Tipos de ação presencial (seção 19.21); 0 é nenhuma. */
export const JOB = { fell: 1, plant: 2, build: 3 } as const;
/** Bens brutos que só chegam ao estoque com uma entrega no modo completo (RF-AS-23). */
export const RAW = new Set<string>(['food', 'wood', 'stone', 'clay', 'copper', 'tin', 'iron', 'coal', 'gold']);
/** Carga na mão (RF-AS-24): o código é a posição em CARRIED mais 1 (0 = mãos vazias); a tela desenha o feixe, o cesto ou a pedra. */
export const CARRIED = ['food', 'wood', 'stone', 'clay', 'copper', 'tin', 'iron', 'coal', 'gold', 'water'] as const;
export const CARGO_NAMES: Record<string, string> = { food: 'cesto de comida', wood: 'feixe de lenha', stone: 'pedra', clay: 'barro', copper: 'minério de cobre', tin: 'minério de estanho', iron: 'minério de ferro', coal: 'carvão', gold: 'ouro', water: 'balde de água' };
/** Gesto no lugar da tarefa (RF-AS-27): a tela anima cada um. */
export const GESTURE = { none: 0, dig: 1, reap: 2, chop: 3, hammer: 4, row: 5, pray: 6, pick: 7, carry: 8, talk: 9, rest: 10, cheer: 11 } as const;
export const GESTURE_OF: Record<number, number> = {
  [DAY.harvest]: GESTURE.reap,
  [DAY.build]: GESTURE.hammer,
  [DAY.water]: GESTURE.dig,
  [DAY.bucket]: GESTURE.dig,
  [DAY.militia]: GESTURE.hammer,
  [DAY.eat]: GESTURE.rest,
  [DAY.rest]: GESTURE.rest,
  [DAY.social]: GESTURE.talk,
  [DAY.pray]: GESTURE.pray,
  [DAY.festival]: GESTURE.cheer,
  [DAY.funeral]: GESTURE.pray,
  [DAY.curious]: GESTURE.talk,
  [DAY.haul]: GESTURE.carry,
  // Trabalho no posto: 100 + ofício.
  [100 + ROLE.farmer]: GESTURE.dig,
  [100 + ROLE.gatherer]: GESTURE.reap,
  [100 + ROLE.miner]: GESTURE.pick,
  [100 + ROLE.fisher]: GESTURE.row,
  [100 + ROLE.blacksmith]: GESTURE.hammer,
  [100 + ROLE.weaver]: GESTURE.hammer,
  [100 + ROLE.potter]: GESTURE.hammer,
  [100 + ROLE.miller]: GESTURE.hammer,
  [100 + ROLE.merchant]: GESTURE.talk,
  [100 + ROLE.priest]: GESTURE.pray,
  [100 + ROLE.shepherd]: GESTURE.talk,
  [100 + ROLE.horsekeeper]: GESTURE.hammer,
  [100 + ROLE.leader]: GESTURE.talk,
  [100 + ROLE.king]: GESTURE.talk,
};
/** Teto mínimo de qualquer espécie: abaixo disso, um azar qualquer acaba com ela. */
export const MIN_CAP = 30;
/** Teto mínimo de um bicho de terra (rede de segurança; quem regula é a capacidade de cada célula). */
export const MIN_WILD = 12;
/** Abaixo disso a espécie vira relicta: gasta menos e se reproduz mais (piso contra a extinção). */
export const RELICT = 10;
/** Energia extra por ano (fração do metabolismo) de quem está numa célula sem água. */
export const THIRST_COST = 0.2;
/** Até onde um adulto procura parceiro (tiles); bem mais longe quando a espécie está rara. */
export const MATE_RANGE = 24;

/** O que um bicho de terra está fazendo (IA híbrida: portões fixos + IAUS, docs/REFATORACAO-ECOSSISTEMA.md). */
export const ACT = { rest: 0, eat: 1, hunt: 2, scavenge: 3, flee: 4, shelter: 5, mate: 6, disperse: 7, herd: 8, hibernate: 9, drink: 10 } as const;

/** Distância do bote (tiles) e decisões de perseguição antes de desistir. */
export const STRIKE = 2.5;
export const CHASE_TRIES = 10;
/** Teto do contador de esforço da caçada (a perseguição começa já descontando o caminho até a presa). */
export const CHASE_LIMIT = 250;
export const GOAL_TRIES = 10;

/** Carcaças ao mesmo tempo no mapa, no máximo (as mais velhas somem primeiro). */
export const MAX_CARCASSES = 900;

/** Biomas que escondem bichos pequenos do predador (refúgio). */
export const REFUGES = new Set<number>([Biome.Forest, Biome.Jungle, Biome.Taiga, Biome.Swamp, Biome.Mangrove, Biome.Rock, Biome.Mountain, Biome.Cliff]);
