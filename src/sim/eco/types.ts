/** Tipos do ecossistema: crônica, guerras, barcos, jangadas, construções, assentamentos, rebanhos e carcaças. */

import type * as P from '../progress';
import type { Culture, Good, Made, Stock } from '../economy';
import type { ColonyMotive, Polity } from '../community';
import type { BuildMaterial } from '../architecture';
import type { Cargo, Luxury } from '../trade';
import type { DeathCause, Sample, Vital } from '../people';
import type { Needs, Vocation } from '../needs';
import type { BUILDINGS, HERDS } from './constants';
import type { AreaYield, Lifeway } from '../biomeYield';

/** Tipo de acontecimento, para filtrar a crônica. */
export type ChronicleKind = 'povo' | 'era' | 'guerra' | 'natureza' | 'mar' | 'economia' | 'jogador';

export interface ChronicleEntry {
  year: number;
  text: string;
  kind: ChronicleKind;
  /** Onde aconteceu (tile), para a câmera ir até lá; -1 sem lugar. */
  x: number;
  y: number;
  /** Importante: aparece no painel e conta contra o marasmo. */
  major: boolean;
  /** Acontecimentos repetidos com a mesma chave se juntam numa linha só. */
  key: string;
  count: number;
  /** Lugares envolvidos nas repetições (ex.: assentamentos). */
  places: string[];
  /** Ids dos assentamentos da linha (`note`); saves antigos não têm, e a janela do assentamento procura pelo nome. */
  villages?: number[];
}

/** Efeito visual na superfície; `age` e `life` em segundos de jogo. */
export interface Effect {
  kind: 'comet' | 'boom' | 'smoke' | 'flame' | 'quake' | 'skull' | 'tent' | 'heart' | 'swords';
  x: number;
  y: number;
  age: number;
  life: number;
  /** Tamanho em tiles. */
  size: number;
}

/** Guerra entre dois reinos (ids das capitais): `a` ataca o assentamento `target` de `b`. */
export interface War {
  a: number;
  b: number;
  target: number;
  /** Mortos de cada lado em combate. */
  losses: [number, number];
  years: number;
  /** Sem caminho por terra: o atacante manda soldados de barco. */
  naval: boolean;
  /** Motivo (seção 19.7): decide o objetivo e o fim. */
  motive: WarMotive;
  /** Saque: o bem cobiçado, o que o bando já leva e se está voltando para casa. */
  good?: LootGood;
  loot?: number;
  herd?: number;
  returning?: number;
  /** Assentamento de onde o exército saiu (leva comida dele) e a comida que tem (0 a 1). */
  home: number;
  supply: number;
  /** Anos seguidos com pouca comida. */
  hungry?: number;
  /** Mercenários contratados por cada lado. */
  mercs: [number, number];
}

/**
 * Motivo da guerra (RF-VIDA-240): saque de um bem (curta, acaba quando o saque volta),
 * território (conquista ou paz com cessão), extermínio (arrasa o assentamento e funda
 * outro nas ruínas) e guerra civil (RF-VIDA-138).
 */
export type WarMotive = 'loot' | 'land' | 'dominion' | 'revenge' | 'faith' | 'extermination' | 'civil';
export type LootGood = 'food' | 'wood' | 'horses' | 'iron' | 'gold';

/** Plano de guerra de um reino (seção 19.7): ele junta o que falta e só declara quando acha que está pronto e em vantagem. */
export interface WarPlan {
  enemy: number;
  target: number;
  motive: WarMotive;
  good?: LootGood;
  since: number;
  /** Quanto ele acha que o inimigo vale (1 = a força de verdade), fixo no plano. */
  belief: number;
}

export interface Boat {
  village: number;
  /** Índice em BOATS (a era de quem construiu). */
  kind: number;
  /** Pesca, colonos, soldados de uma invasão, exploradores ou carga de um barco mercante (RF-VIDA-235). */
  purpose: 'fish' | 'colonize' | 'invade' | 'explore' | 'trade';
  x: number;
  y: number;
  /** Direção para onde a proa aponta: 1 leste, -1 oeste. */
  facing: number;
  heading: number;
  /** Rota de colonização: tiles de água do porto até a costa de destino. */
  path: number[];
  step: number;
  /** Tile de terra onde os colonos vão desembarcar. */
  landing: number;
  passengers: { age: number; role: number; who?: Identity }[];
  /** Segundos de pesca restantes (barcos de pesca). */
  timer: number;
  /** Segundos à deriva, perdido no mar. */
  adrift: number;
  /** Segundos desde o naufrágio; -1 enquanto navega. */
  sunk: number;
  /** Barco mercante: porto de destino, carga, ouro a bordo e se já está voltando. */
  trade?: { target: number; cargo: Cargo[]; purse: number; back: boolean };
  /** Segundos sem conseguir avançar (a costa mudou no caminho); passou de REROUTE_SECONDS, refaz a rota. */
  blocked?: number;
}

/**
 * Jangada (seção 19.18): um inteligente travado na beira da água, com o
 * destino do outro lado, corta árvores por perto (ou usa a madeira do
 * estoque) e atravessa sozinho.
 */
export interface Raft {
  x: number;
  y: number;
  facing: number;
  /** Tiles de água até a outra margem. */
  path: number[];
  step: number;
  /** Tile de terra onde desembarca. */
  landing: number;
  species: number;
  /** Assentamento de quem rema (-1 sem assentamento). */
  village: number;
  age: number;
  role: number;
  energy: number;
  who: Identity;
  blocked: number;
}
export type BuildingKind = 'house' | 'port' | (typeof BUILDINGS)[number];

/** O que decide se um assentamento pode erguer uma construção. */
export interface BuildContext {
  era: number;
  tier: number;
  /** Tem metal no estoque. */
  metal: boolean;
  culture: Culture;
  capital: boolean;
  vocation?: Vocation;
  herd?: HerdKind;
  /** Tem água por perto (barro para a olaria). */
  clay: boolean;
  forest: number;
  /** Técnicas conhecidas (seção 19.10). */
  techs: ReadonlySet<string>;
}

export interface Building {
  /** Canto superior esquerdo de 2x2 tiles (o porto ocupa 1 tile). */
  x: number;
  y: number;
  kind: BuildingKind;
  /** Variação de aparência (casas). */
  variant: number;
  /** Andares a mais (casas reformadas e adensadas, RF-VIDA-203). */
  level?: number;
  /** Ano até o qual a obra continua, com andaime (saves antigos; hoje a obra é por trabalho, `labor`). */
  workUntil?: number;
  /**
   * Obra presencial (seção 19.21): trabalho que falta, em segundos de construtor, e o total. Só os
   * construtores no lugar o reduzem. `site` marca a obra de um prédio novo, ainda sem uso; `crew`, quantos trabalham nela agora.
   */
  labor?: number;
  laborMax?: number;
  site?: boolean;
  crew?: number;
  /** Era do estilo da casa: a da construção ou da última reforma (transição gradual, RF-VIDA-251). */
  era?: number;
  /** Casa vazia num assentamento em crise (RF-VIDA-254). */
  empty?: boolean;
  /** Anos seguidos sem conserto por falta de madeira ou pedra (seção 19.19). */
  wear?: number;
  /** Casa de sítio rural, fora do núcleo (RF-AS-02). */
  farm?: boolean;
  /** Nome do bairro, quando veio de uma aldeia que a cidade engoliu (RF-AS-06). */
  quarter?: string;
  /** Família que mora nela (chave da família) e anos seguidos sem ninguém (RF-AS-17). */
  owner?: number;
  idle?: number;
}

export interface Village {
  id: number;
  name: string;
  species: number;
  x: number;
  y: number;
  /** Casas e construções especiais. */
  houses: Building[];
  /** Plantações (2x2 tiles cada). */
  fields: number;
  /** Índice da criatura que lidera o assentamento, ou -1. */
  leader: number;
  /** `uid` do líder atual, para achar o herdeiro quando ele morre (IA local). */
  leaderUid?: number;
  /** Nível: 0 aldeia, 1 vila, 2 cidade (TIER_NAMES). */
  tier: number;
  /** Id do assentamento capital do reino a que pertence (o próprio, se independente). */
  kingdom: number;
  /** Lotes livres ou não, relativos ao centro, do nível atual. */
  lots: { x: number; y: number }[];
  tech: number;
  population: number;
  /** Tile de água ao lado do porto, onde os barcos atracam; -1 sem porto. */
  port: number;
  /** Peixe trazido pelos barcos de pesca, ainda não comido. */
  food: number;
  /** Estoque e produção histórica; valem os da capital do reino (ver `store`). */
  stock: Stock;
  made: Made;
  /** Povo do assentamento (colônias herdam; conquistados mantêm o seu). */
  culture: Culture;
  /** Jazidas que o assentamento explora (ids em `deposits`). */
  mines: number[];
  /** Trabalho de ferraria acumulado, em peças. */
  forgeWork: number;
  /** Floresta e rocha por perto (lenha e pedra). */
  forest: number;
  rock: boolean;
  /** Cor das roupas dos moradores. */
  color: [number, number, number];
  abandoned: boolean;
  /** Ano em que foi abandonado. */
  abandonedAt?: number;
  /** Quanto das ruínas já sumiu: 0 tudo de pé, 3 limpo (ou reocupado por outro assentamento). */
  decay?: number;
  /** Como morreu o último morador, para a crônica ("de fome", "de velhice"). */
  lastCause?: string;
  /** Id das ruínas que este assentamento reocupou, se for o caso. */
  ruinOf?: number;
  /** Ruas e área rumo ao nível seguinte, de 0 a 1 (ruas sob demanda, RF-VIDA-207). */
  growth?: number;
  /** Já tem estrada para um vizinho do mesmo reino. */
  linked?: boolean;
  /** Tiles da planta de ruas já abertos e o total da planta (ruas bloco a bloco). */
  streetLen?: number;
  streetPlan?: number;
  /** Completude da estrutura de referência, de 0 a 1, e o que falta (RF-VIDA-201). */
  completeness?: number;
  missing?: string;
  /** Vocação (RF-VIDA-220) e anos ruins seguidos dela (RF-VIDA-222). */
  vocation?: Vocation;
  badYears?: number;
  /** Atendimento das necessidades, de 0 a 1 (RF-VIDA-210), e estabilidade (RF-VIDA-280). */
  needs?: Needs;
  /** Parte dos moradores que comeu bem no ano que passou (sem contar o celeiro): a fome de verdade, para filhos e mudanças. */
  fedShare?: number;
  stability?: number;
  /** Rebanho domesticado e os cercados de pasto (canto 2x2 de cada um, RF-VIDA-215). */
  herd?: Herd;
  pens?: { x: number; y: number }[];
  /** Fertilidade do solo das roças, de 0 a 1 (RF-VIDA-294). */
  soil?: number;
  /** Produção e consumo do ano passado, do ano corrente e histórico acumulado, por recurso (painel de economia, RF-VIDA-217). */
  ledger?: Ledger;
  ledgerNow?: Ledger;
  ledgers?: Ledger[];
  ledgerTotal?: Ledger;
  /** Ano até o qual dura a corrida do ouro (RF-VIDA-285). */
  goldRush?: number;
  /** Tem água por perto (barro e poço). */
  wet?: boolean;
  /** Material das casas, pelo que há em volta (RF-VIDA-252). */
  material?: BuildMaterial;
  /** Era do último calçamento das ruas. */
  paveEra?: number;
  /** Nascimentos, mortes, chegadas e partidas do ano passado, do ano corrente e histórico acumulado (RF-VIDA-343). */
  vital?: Vital;
  vitalNow?: Vital;
  vitals?: Vital[];
  vitalTotal?: Vital;
  /** Uma amostra por ano de população e estoque, para os gráficos (RF-VIDA-347). */
  history?: Sample[];
  /** Bem de luxo da região (RF-VIDA-282); null quando a região não dá nenhum. */
  luxury?: Luxury | null;
  /** Os ricos consumiram luxo no ano passado (estabilidade a mais). */
  luxuryJoy?: boolean;
  /** Ano da última feira anual (RF-VIDA-234). */
  fair?: number;
  /** Pedido da capital ainda aberto e quantos pedidos a colônia já recusou (RF-VIDA-289). */
  request?: { good: Good | 'food'; amount: number; until: number };
  refused?: number;
  /** A capital cunha moeda própria (RF-VIDA-291). */
  mint?: boolean;
  /**
   * Recursos do mapa (seção 19.19): árvores de pé ao alcance, a lista delas da mais perto
   * para a mais longe, a próxima a cair (onde os lenhadores trabalham) e o trabalho de corte
   * acumulado; o povo replanta a mata (manejo).
   */
  trees?: number;
  treesStart?: number;
  treeList?: number[];
  treeNext?: number;
  treeScan?: number;
  fellAt?: number;
  chop?: number;
  forestry?: boolean;
  /** Mudas a plantar nos tocos antigos: cada árvore cortada soma `PLANT_PER_FELL` (seção 19.21). */
  plantDue?: number;
  /** Construtores do assentamento (adultos em idade de trabalhar): sem nenhum, coletores e o líder ajudam nas obras. */
  crew?: number;
  /** Pedreira: tiles com pedra ao alcance, do melhor para o pior, e a pedra que ainda dão. */
  stoneList?: number[];
  stoneNext?: number;
  stoneScan?: number;
  stoneLeft?: number;
  /** Coleta acumulada (porções) e a parte do inverno frio que passou sem lenha. */
  gatherWork?: number;
  chill?: number;
  /** Anos seguidos de falta de comida ou madeira (cobiça e êxodo). */
  want?: number;
  /** Eras por desenvolvimento (seção 19.10): nível de cada pilar agora, pontos na era atual e técnicas conhecidas. */
  levels?: P.Points;
  pts?: P.Points;
  techs?: string[];
  /** Técnica descoberta por um morador específico (`uid`), que ele está ensinando à aldeia. */
  pendingTech?: { id: string; uid: number; name: string; progress: number };
  /** Amostras trazidas por caravanas: técnica -> ano até quando ainda inspiram os trabalhadores. */
  samples?: Record<string, number>;
  /** Maior população já alcançada, para reconhecer o colapso (RF-VIDA-275). */
  peak?: number;
  /** Última vez que as técnicas foram sorteadas. */
  learnAt?: number;
  /** Plano novo dos assentamentos (seção 20): ano e jeito da fundação (RF-AS-01 a 08). */
  foundedAt?: number;
  /** Lugar de onde vieram os fundadores (a deriva cultural de um lugar livre conta a partir dele, RF-AS-52). */
  mother?: number;
  foundedBy?: 'bando' | 'colônia' | 'sítio' | 'refúgio' | 'cisma' | 'família' | 'mar';
  /** Colônia em formação: motivo, sítios que os batedores visitam e quando o grupo parte (RF-AS-03). */
  colony?: { motive: ColonyMotive; sites: { x: number; y: number; value: number }[]; until: number; scouts: number[] };
  /** Ano em que a última colônia partiu daqui (COLONY_COOLDOWN). */
  colonyAt?: number;
  /** Bairros que vieram de aldeias engolidas pela cidade (RF-AS-06). */
  quarters?: { name: string; culture: number; foreign: boolean }[];
  /** Virou bairro deste assentamento (some do mapa como lugar à parte). */
  mergedInto?: number;
  /** Para onde foi a última leva de moradores (RF-AS-08). */
  leftTo?: number;
  /** Anos seguidos abaixo do que o degrau pede (descida de nível). */
  lowYears?: number;
  /** Degrau político do centro (RF-AS-48), cidade de referência e quantos a têm como referência (RF-AS-44). */
  polity?: Polity;
  ref?: number;
  market?: number;
  /** Lealdade ao centro (0 a 1), e o outro centro que atrai o lugar e há quantos anos (RF-AS-49 e 50). */
  loyalty?: number;
  lure?: { k: number; years: number };
  /** Deriva cultural acumulada (RF-AS-52) e a cidade que cresce mais que a capital (RF-AS-51). */
  drift?: number;
  rival?: { id: number; years: number };
  /** Ano da última revisão da muralha (RF-AS-18) e os tiles dela. */
  wallAt?: number;
  walls?: number[];
  /** Pegada (raio das casas do núcleo mais a folga, RF-AS-10), refeita quando as casas mudam. */
  foot?: number;
  /** Produção só por entrega (RF-AS-23): o que foi feito no modo completo e ainda não chegou ao celeiro. */
  yard?: Partial<Record<Good | 'food', number>>;
  /** Eventos que juntam gente (RF-AS-28 e 29): festa, enterro (com o tile), alarme e caravana na praça. */
  festivalUntil?: number;
  funeral?: { tile: number; until: number; family: number };
  alarmUntil?: number;
  curiousUntil?: number;

  // ---- Bioma e modo de vida (agente 3C: src/sim/biomeYield.ts e eco/economy/biome.ts) ----
  /** Média do bioma na área do lugar (roça, pasto, pesca, estação, perecimento, lenha, coleta e relevo), refeita uma vez por ano. */
  area?: AreaYield;
  /**
   * Modo de vida (nômade, sedentário ou intensivo), refeito uma vez por ano pelo bioma, pela técnica e pela
   * densidade (`lifewayFor`). Nasce sedentário; saves antigos ganham 'sedentario' em `fixAfterLoad`.
   */
  lifeway: Lifeway;
}

/** Quem a pessoa é, guardado quando ela embarca e devolvido quando desembarca. */
export interface Identity {
  uid: number;
  parent: number;
  family: number;
  bornAt: number;
  bornYear: number;
  movedAt: number;
  /** Traços de personalidade (IA local); saves antigos não têm. */
  traits?: Int8Array;
}

/** Uma morte recente, para o aviso de quem estava sendo seguido (RF-VIDA-333). */
export interface Death {
  uid: number;
  cause: DeathCause;
  age: number;
  x: number;
  y: number;
}

/** Produção e consumo por recurso num ano. */
export type Ledger = Record<string, [number, number]>;
export type HerdKind = (typeof HERDS)[number];

export interface Herd {
  kind: HerdKind;
  head: number;
  /** Ano até o qual o rebanho está com praga. */
  plague?: number;
  /** Parte do rebanho está no pasto alto com os pastores (RF-VIDA-293). */
  away?: number;
}

export interface Behaviour {
  /** Energia gasta por segundo. */
  metabolism: number;
  /** Chance de reprodução por segundo, com energia sobrando. */
  birthRate: number;
  /** Teto da espécie no planeta. */
  cap: number;
  /** Máximo de indivíduos da mesma espécie numa célula de 8x8 tiles. */
  crowd: number;
}

/** Corpo de um bicho morto: alimenta quem matou, depois os necrófagos, depois aduba o chão. */
export interface Carcass {
  x: number;
  y: number;
  /** Carne que sobrou (kg). */
  kg: number;
  /** Ano da morte. */
  at: number;
  /** Espécie do morto. */
  sp: number;
}
