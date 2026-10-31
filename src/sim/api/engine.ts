import type { SurfaceMap } from '../../procgen/surface';
import { restoreEcosystem, snapshotEcosystem, type EcosystemSnapshot } from '../../save/snapshot';
import type { Caravan } from '../trade';
import { Ecosystem, type Boat, type ChronicleEntry, type Effect, type Village, type War } from '../ecosystem';
import type { Species } from '../species';
import { applyCommand, type ApplyContext, type CommandResult, type EngineCommand } from './commands';
import type { EngineEvent } from './events';

/**
 * Fachada do motor (padrão Facade, preparação para separar back-end e
 * front-end): o cliente fala com a simulação da superfície só por aqui.
 *
 *   entrada  `apply(cmd)`     comandos (`commands.ts`), dados puros
 *   relógio  `step(dt)`       um passo fixo (o SimDriver do cliente decide quantos)
 *   saída    `drainEvents()`  eventos de domínio (`events.ts`), dados puros
 *   leitura  `view`           o que o cliente desenha e mostra, só de leitura
 *   estado   `snapshot()` / `restore()`  o mundo inteiro, para save e replay
 *
 * Hoje a vista é o próprio Ecosystem visto por uma interface menor (o motor
 * roda no mesmo processo); com o motor num Worker ela vira uma cópia
 * recebida a cada passo (SharedArrayBuffer para os arrays das criaturas e
 * diffs para o resto). O caminho está em docs/ARQUITETURA.md.
 *
 * Este módulo não importa nada de `src/client` nem do three.js.
 */

/**
 * O que o cliente lê do mundo: arrays SoA das criaturas (índice `i` < `count`, vale com `alive[i]`), as
 * listas do mundo e as consultas da interface. Só leitura por contrato: o TypeScript não tem array tipado
 * readonly, então nada impede escrever, mas quem muda o mundo é só `apply`.
 */
export interface EngineView {
  readonly map: Readonly<SurfaceMap>;
  /** Ano do mundo (com fração) e quantos segundos de jogo formam um ano. */
  readonly year: number;
  readonly yearSpan: number;
  // Criaturas (Data Locality: um array por campo).
  readonly count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly age: Float32Array;
  readonly energy: Float32Array;
  readonly kind: Uint8Array;
  readonly alive: Uint8Array;
  readonly village: Int16Array;
  readonly role: Uint8Array;
  readonly uid: Uint32Array;
  readonly family: Uint32Array;
  readonly carry: Uint8Array;
  readonly gesture: Uint8Array;
  readonly species: readonly Species[];
  readonly population: readonly number[];
  // O mundo dos povos.
  readonly villages: readonly Readonly<Village>[];
  readonly chronicle: readonly Readonly<ChronicleEntry>[];
  readonly wars: readonly Readonly<War>[];
  readonly boats: readonly Readonly<Boat>[];
  readonly caravans: readonly Readonly<Caravan>[];
  readonly effects: readonly Readonly<Effect>[];
  /** Ruas, casas, muralhas e ruas principais por tile. */
  readonly road: Uint8Array;
  readonly built: Uint8Array;
  readonly wall: Uint8Array;
  readonly mainStreet: Uint8Array;
  /** Tremor de terra (segundos) e as opções dos eventos aleatórios. */
  readonly shake: number;
  readonly autoEvents: boolean;
  readonly eventRate: number;
  // Consultas.
  pick(x: number, y: number, radius: number): number;
  pickAll(x: number, y: number, radius: number): number[];
  findUid(uid: number): number;
  activityOf(i: number): string;
  tierName(v: Village): string;
  polityName(v: Village): string;
  settlementAt(x: number, y: number): Village | null;
}

/**
 * Avisos síncronos do motor que não passam pela fila, por serem quentes ou pedirem resposta na hora: o
 * tile que mudou (dezenas de milhares por passo quando a mata cresce; a tela só marca o que repintar) e a
 * espécie nova (variante) que entrou no planeta (o catálogo do cliente).
 */
export interface EngineHooks {
  tileChanged?: (i: number) => void;
  species?: (sp: Species) => void;
}

/** O mundo inteiro num objeto que o `structuredClone` (e o `postMessage`) entende: terreno e ecossistema. */
export interface EngineSnapshot {
  map: SurfaceMap;
  eco: EcosystemSnapshot;
}

export interface Engine {
  readonly view: EngineView;
  readonly seed: number;
  /** Um passo da simulação (`dt` em segundos de jogo; o jogo usa sempre SIM_STEP). */
  step(dt: number): void;
  /** Aplica um comando agora; quem chama garante que é na fronteira do passo (o SimDriver faz isso). */
  apply(cmd: EngineCommand, ctx?: ApplyContext): CommandResult;
  /** Os eventos desde a última drenagem, do mais antigo para o mais novo. */
  drainEvents(): EngineEvent[];
  /** Retrato independente do mundo (cópia funda: mexer no mundo depois não muda o retrato). */
  snapshot(): EngineSnapshot;
  /** Troca o mundo pelo do retrato (que continua intacto); `view` passa a ser o mundo novo. */
  restore(snap: EngineSnapshot): void;
  /** Liga os avisos síncronos (substitui os anteriores). */
  setHooks(hooks: EngineHooks): void;
}

export interface EngineOptions {
  /** Semente do mundo: com o log de comandos, determina tudo (vai também no retrato). */
  seed: number;
  /** Ecossistema já existente (estado do jogo, save carregado), adotado como está. */
  eco?: Ecosystem;
  /** Espécies que entram num mundo novo, antes de povoar. */
  species?: readonly Species[];
  /** Povoa o mundo novo (padrão: sim, quando há espécies). */
  populate?: boolean;
  /** Segundos de jogo por ano (padrão YEAR_SECONDS, o da calibração). */
  yearSpan?: number;
}

/** O Ecosystem por trás de cada motor (ver `ecosystemOf`). */
const ECOSYSTEMS = new WeakMap<Engine, () => Ecosystem>();

/**
 * Ponte de transição: o Ecosystem de verdade por trás da fachada, para as partes do cliente que ainda
 * não passam por ela (HUD, seleção, desenho, o save do GameState; a lista está em docs/ARQUITETURA.md).
 * Código novo usa `view`, `apply` e os eventos; cada uso disto é uma dívida a pagar antes do Worker.
 */
export function ecosystemOf(engine: Engine): Ecosystem {
  const get = ECOSYSTEMS.get(engine);
  if (!get) throw new Error('motor desconhecido');
  return get();
}

/**
 * Cria o motor sobre um mapa: adota `opts.eco` ou monta um mundo novo com a semente e as espécies. Os
 * eventos do nascimento do mundo (as aldeias do povoamento) são descartados: a história começa agora.
 */
export function createEngine(map: SurfaceMap, opts: EngineOptions): Engine {
  let eco = opts.eco ?? new Ecosystem(map, opts.seed);
  if (!opts.eco) {
    for (const sp of opts.species ?? []) eco.addSpecies(sp);
    if (opts.populate ?? !!opts.species?.length) eco.populate();
    eco.drainEvents();
  }
  if (opts.yearSpan !== undefined) eco.yearSpan = opts.yearSpan;
  let hooks: EngineHooks = {};
  const attach = () => {
    eco.onTileChanged = hooks.tileChanged ?? (() => {});
    eco.onSpecies = hooks.species ?? (() => {});
  };
  // A vista hoje é o próprio Ecosystem (a atribuição confere que ele cumpre a interface).
  const viewOf = (e: Ecosystem): EngineView => e;
  const engine: Engine = {
    get view() {
      return viewOf(eco);
    },
    seed: opts.seed,
    step: (dt) => eco.step(dt),
    apply(cmd, ctx) {
      // O aviso curto do motor sai com o resultado do comando que o gerou (e não fica no mundo para o cliente ler e limpar).
      eco.hint = '';
      const res = applyCommand(eco, eco.map, cmd, ctx);
      if (eco.hint) {
        res.hint = eco.hint;
        eco.hint = '';
      }
      return res;
    },
    drainEvents: () => eco.drainEvents(),
    snapshot: () => structuredClone({ map: eco.map, eco: snapshotEcosystem(eco, opts.seed) }),
    restore(snap) {
      const copy = structuredClone(snap);
      eco = restoreEcosystem(copy.eco, copy.map);
      attach();
    },
    setHooks(h) {
      hooks = h;
      attach();
    },
  };
  ECOSYSTEMS.set(engine, () => eco);
  return engine;
}
