import type { SurfaceMap } from '../../procgen/surface';
import { restoreEcosystem, snapshotEcosystem, type EcosystemSnapshot } from '../../save/snapshot';
import * as B from '../balance';
import { siteValue, type ColonyMotive, type SiteLook } from '../community';
import { ECO_CELL } from '../fauna';
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
 * Hoje a vista é um objeto que lê o Ecosystem vivo campo a campo (`LiveView`:
 * o motor roda no mesmo processo); com o motor num Worker ela vira uma cópia
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
  /** Campo de notas dos sítios (onde assentar), para a camada de depuração; null antes de existir (mundo sem povos). */
  siteField(): SiteFieldView | null;
  /**
   * O que os batedores veem para fundar no tile (x, linha y) e a nota, parte por parte; `from` é o lugar de origem
   * (padrão: o lugar vivo mais perto). Null sem campo ou sem espécie inteligente.
   */
  siteAt(x: number, y: number, from?: number): SiteReading | null;
}

/** Nota das células do campo quase sem terra (mar aberto): a de `scoreSiteCell` (eco/settlements/siteField.ts). */
export const SITE_NONE = -9;

/**
 * Campo de notas dos sítios visto de fora: uma nota por célula de `cell`×`cell` tiles, linha a linha, para um
 * fundador genérico da Idade da Pedra e já descontada a presença dos lugares vivos (SITE_NONE no mar). Dado puro
 * (vai por `postMessage`). `score` é um buffer da fachada, atualizado no lugar quando alguma nota muda: leia, não
 * guarde. `version` sobe a cada mudança (Dirty Flag de quem desenha).
 */
export interface SiteFieldView {
  cols: number;
  rows: number;
  cell: number;
  score: Float32Array;
  version: number;
}

/** Fatores da nota de um sítio, na ordem da ficha. */
export const SITE_PARTS = ['water', 'fertile', 'forest', 'rock', 'ore', 'flat', 'coast', 'defense', 'climate', 'ruin', 'route', 'motive', 'overlap', 'crowd', 'capital', 'dist'] as const;
export type SitePart = (typeof SITE_PARTS)[number];

/** Leitura de um sítio (`siteAt`), dado puro. */
export interface SiteReading {
  /** Quem funda: o lugar de origem (-1 sem origem), a espécie, a técnica e o motivo considerado. */
  from: number;
  species: number;
  tech: number;
  motive: ColonyMotive;
  /** O que os batedores veem (`siteLook`): fatores de 0 a 1, distâncias em tiles e `crowd` em pessoas. */
  look: SiteLook;
  /**
   * Quanto cada fator soma à nota (pontos, negativos para o que desconta). A soma é `value`: os recursos contam
   * inteiros, e `crowd` é o que a divisão da captação com quem já a explora tira deles.
   */
  parts: Record<SitePart, number>;
  /** Nota final (`siteValue`) e a mínima das colônias (SITE_MIN_VALUE). */
  value: number;
  min: number;
  /** Nota da célula do campo onde o tile cai (a da camada), ou SITE_NONE. */
  cell: number;
  /** Por que não dá para fundar ali (`siteFilter`: filtro rápido e exame da área), ou null. */
  problem: string | null;
}

/** Motivo da leitura da ficha: o da fissão por pressão, o mais comum. */
const READING_MOTIVE: ColonyMotive = 'espaço';

/**
 * Parte de cada fator na nota, pela própria `siteValue` (nada da fórmula é repetido aqui): cada termo é a nota
 * menos a nota com o fator no neutro (zero; a distância ideal para a distância da origem), sem a divisão da
 * captação; a divisão (`crowd`) entra à parte. Os termos são independentes, então somam a nota.
 */
export function siteParts(look: SiteLook): Record<SitePart, number> {
  const free: SiteLook = { ...look, crowd: 0 };
  const base = siteValue(free);
  const out = {} as Record<SitePart, number>;
  for (const k of SITE_PARTS) {
    if (k === 'crowd') out.crowd = siteValue(look) - base;
    else out[k] = base - siteValue({ ...free, [k]: k === 'dist' ? B.SITE_IDEAL_DIST : 0 });
  }
  return out;
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
 * A vista de leitura de hoje (o motor no mesmo processo): lê o Ecosystem vivo campo a campo, sem cópia, e
 * responde às consultas. É um objeto próprio, e não o Ecosystem, para a fachada ter consultas suas (o campo de
 * sítios) sem mexer no mundo; `eco` troca no `restore`. Nenhuma consulta daqui sorteia nem muda o mundo.
 */
class LiveView implements EngineView {
  /** De qual campo de sítios veio a cópia, a cópia das notas e a versão dela (Dirty Flag por comparação). */
  private siteFrom: object | null = null;
  private siteCopy = new Float32Array(0);
  private siteVersion = 0;

  constructor(public eco: Ecosystem) {}

  get map() {
    return this.eco.map;
  }
  get year() {
    return this.eco.year;
  }
  get yearSpan() {
    return this.eco.yearSpan;
  }
  get count() {
    return this.eco.count;
  }
  get x() {
    return this.eco.x;
  }
  get y() {
    return this.eco.y;
  }
  get vx() {
    return this.eco.vx;
  }
  get vy() {
    return this.eco.vy;
  }
  get age() {
    return this.eco.age;
  }
  get energy() {
    return this.eco.energy;
  }
  get kind() {
    return this.eco.kind;
  }
  get alive() {
    return this.eco.alive;
  }
  get village() {
    return this.eco.village;
  }
  get role() {
    return this.eco.role;
  }
  get uid() {
    return this.eco.uid;
  }
  get family() {
    return this.eco.family;
  }
  get carry() {
    return this.eco.carry;
  }
  get gesture() {
    return this.eco.gesture;
  }
  get species() {
    return this.eco.species;
  }
  get population() {
    return this.eco.population;
  }
  get villages() {
    return this.eco.villages;
  }
  get chronicle() {
    return this.eco.chronicle;
  }
  get wars() {
    return this.eco.wars;
  }
  get boats() {
    return this.eco.boats;
  }
  get caravans() {
    return this.eco.caravans;
  }
  get effects() {
    return this.eco.effects;
  }
  get road() {
    return this.eco.road;
  }
  get built() {
    return this.eco.built;
  }
  get wall() {
    return this.eco.wall;
  }
  get mainStreet() {
    return this.eco.mainStreet;
  }
  get shake() {
    return this.eco.shake;
  }
  get autoEvents() {
    return this.eco.autoEvents;
  }
  get eventRate() {
    return this.eco.eventRate;
  }

  pick(x: number, y: number, radius: number): number {
    return this.eco.pick(x, y, radius);
  }
  pickAll(x: number, y: number, radius: number): number[] {
    return this.eco.pickAll(x, y, radius);
  }
  findUid(uid: number): number {
    return this.eco.findUid(uid);
  }
  activityOf(i: number): string {
    return this.eco.activityOf(i);
  }
  tierName(v: Village): string {
    return this.eco.tierName(v);
  }
  polityName(v: Village): string {
    return this.eco.polityName(v);
  }
  settlementAt(x: number, y: number): Village | null {
    return this.eco.settlementAt(x, y);
  }

  /** O campo como está, ou null se ainda não existe ou é de outro tamanho de mapa (o motor o refaz na próxima consulta dele). */
  private sites() {
    const f = this.eco.sites;
    const map = this.eco.map;
    return f && f.cols === Math.ceil(map.width / ECO_CELL) && f.rows === Math.ceil(map.height / ECO_CELL) ? f : null;
  }

  siteField(): SiteFieldView | null {
    const f = this.sites();
    if (!f) return null;
    // Dirty Flag por comparação: o campo muda aos poucos a cada passo, e a cópia diz se mudou mesmo (algumas mil células).
    const live = f.score;
    let copy = this.siteCopy;
    let changed = f !== this.siteFrom || copy.length !== live.length;
    if (changed) copy = this.siteCopy = new Float32Array(live.length);
    else for (let k = 0; k < live.length && !changed; k++) changed = live[k] !== copy[k];
    if (changed) {
      copy.set(live);
      this.siteFrom = f;
      this.siteVersion++;
    }
    return { cols: f.cols, rows: f.rows, cell: ECO_CELL, score: copy, version: this.siteVersion };
  }

  siteAt(x: number, y: number, from = -1): SiteReading | null {
    const eco = this.eco;
    const f = this.sites();
    const map = eco.map;
    const tx = ((Math.floor(x) % map.width) + map.width) % map.width;
    const ty = Math.floor(y);
    if (!f || ty < 0 || ty >= map.height) return null;
    // Quem funda: o lugar pedido ou o lugar vivo mais perto (de espécie inteligente); sem nenhum, um bando da Pedra.
    let origin: Village | null = from >= 0 ? (eco.villages[from] ?? null) : null;
    if (!origin) {
      let best = Infinity;
      for (const v of eco.villages) {
        if (v.abandoned || v.population <= 0) continue;
        const d = eco.distance(v, tx + 0.5, ty + 0.5);
        if (d < best) {
          best = d;
          origin = v;
        }
      }
    }
    const s = origin ? origin.species : eco.species.findIndex((sp) => sp.kind === 'sapient');
    if (s < 0) return null;
    const tech = origin ? origin.tech : 0;
    // Os rótulos dos corpos d'água sujos seriam refeitos pela consulta: guarda e devolve como estavam, para a
    // consulta não adiantar o que o passo faria (o replay só é exato se a vista não mexe no mundo).
    const stale = f.waterDirty ? f.water.slice() : null;
    try {
      const look = eco.siteLook(s, tx, ty, origin, READING_MOTIVE, tech);
      return {
        from: origin ? origin.id : -1,
        species: s,
        tech,
        motive: READING_MOTIVE,
        look,
        parts: siteParts(look),
        value: siteValue(look),
        min: B.SITE_MIN_VALUE,
        cell: f.score[Math.floor(ty / ECO_CELL) * f.cols + Math.floor(tx / ECO_CELL)],
        problem: eco.siteFilter(s, tx, ty, tech),
      };
    } finally {
      if (stale) {
        f.water.set(stale);
        f.waterDirty = true;
      }
    }
  }
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
  // A vista lê o mundo vivo; no `restore` ela passa a ler o mundo novo.
  const view = new LiveView(eco);
  const engine: Engine = {
    view,
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
      view.eco = eco;
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
