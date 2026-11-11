// brain.ts — O Cérebro: dono das packs, do histórico e do ciclo de pensamento.
//
// Ciclo de pensamento (Think Cycle):
//   1. Pode pensar? (não incapacitado) É hora de pensar? (intervalo ~250 ms)
//   2. Processa os históricos (descarta entradas velhas)
//   3. Reconstrói a lista de vizinhos
//   4. Reconstrói a lista de decisões (behavior × alvo, conforme o Context Type)
//   5. Pontua as decisões
//   6. Escolhe; se mudou, encerra a atual e inicia a nova
//   7. Agenda o próximo ciclo
//
// Pontuação de uma decisão:
//   score = weight × Π(considerations compensadas) × momento (se for a atual e Continuous)
// com corte antecipado quando o score já não pode superar a melhor decisão.

import { AiEntity, Tags, World } from './aiEntity';
import { Behavior, BehaviorAbilityPair } from './behavior';
import { BehaviorTypeBase, BehaviorTypes } from './behaviorTypes';
import { ContextInfo, Decision } from './context';
import { ContextType, DurationType, SelectionMode } from './enums';
import { BehaviorHistory } from './history';
import type { ImapManager } from './imap';
import { Rng, defaultRng, distance } from './math';
import { AbilityPackage, BehaviorPackage } from './packs';

// ---------------------------------------------------------------------------
// Definições estáticas (compartilhadas por todos os brains)
// ---------------------------------------------------------------------------

/** Dados crus de um brain vindos do banco/arquivo: com o que ele "nasce". */
export interface BrainSeed {
  id: number;
  name: string;
  description?: string;
  behaviorPackIds: number[];
  abilityPackIds: number[];
}

export class BrainLibrary {
  static readonly behaviors = new Map<number, Behavior>();
  static readonly behaviorPackages = new Map<number, BehaviorPackage>();
  static readonly abilityPackages = new Map<number, AbilityPackage>();
  static readonly brains = new Map<number, BrainSeed>();

  static clear(): void {
    BrainLibrary.behaviors.clear();
    BrainLibrary.behaviorPackages.clear();
    BrainLibrary.abilityPackages.clear();
    BrainLibrary.brains.clear();
  }
}

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

export interface SelectionConfig {
  mode: SelectionMode;
  /** WeightedRandomTop: considerar só as N melhores. */
  topN?: number;
  /** WeightedRandomTop: considerar só as X% melhores (0..1) — preferível a topN. */
  topPercent?: number;
  /** Descarta decisões com score < fração × melhor (ex.: 0.75 = até 25% abaixo). */
  withinFractionOfBest?: number;
}

export interface BrainOptions {
  /** Intervalo entre ciclos de pensamento (s). Padrão 0.25. */
  thinkInterval?: number;
  /** Variação aleatória do intervalo (s), para espalhar os agentes pelos frames. */
  thinkJitter?: number;
  /**
   * Intervalo quando o agente fica sem nada em andamento depois de pensar (escolheu uma decisão Instant, ou
   * nenhuma). Padrão: o próprio `thinkInterval`. Menor deixa quem pensa devagar encadear ações rápidas.
   */
  idleThinkInterval?: number;
  /** Raio da lista de vizinhos. */
  maxNeighborDistance?: number;
  /** Compensação pelo número de considerations (recomendado: true). */
  useCompensation?: boolean;
  /** Abaixo disto, a decisão é descartada. */
  minScore?: number;
  selection?: SelectionConfig;
  rng?: Rng;
  imap?: ImapManager | null;
  /** Guardar as decisões pontuadas para depuração. */
  debug?: boolean;
  /**
   * Percepção: quem o agente enxerga neste ciclo. Sem ela, o cérebro varre `world.entities()` pela
   * distância. Mundos grandes passam a própria (grade espacial, conhecidos, lugares lembrados).
   */
  perceive?: ((brain: Brain, now: number) => Iterable<AiEntity>) | null;
}

interface ActiveDecision {
  decision: Decision;
  instance: BehaviorTypeBase;
  startTime: number;
}

// ---------------------------------------------------------------------------
// Brain
// ---------------------------------------------------------------------------

export class Brain {
  readonly owner: AiEntity;
  readonly world: World;
  readonly history = new BehaviorHistory();
  readonly behaviorPacks: BehaviorPackage[] = [];
  readonly abilityPacks: AbilityPackage[] = [];

  neighbors: AiEntity[] = [];
  decisions: Decision[] = [];
  /** Últimas decisões pontuadas, ordenadas (só com debug). */
  lastScored: Decision[] = [];

  rng: Rng;
  imap: ImapManager | null;

  private current: ActiveDecision | null = null;
  private readonly perceiveFn: BrainOptions['perceive'];
  /** Nota da última pontuação de cada Behavior (a melhor entre os alvos), para o grafo do cérebro. */
  readonly lastBehaviorScore = new Map<number, number>();
  private nextThinkTime = 0;
  private readonly opt: Required<Omit<BrainOptions, 'rng' | 'imap' | 'selection' | 'perceive'>> & {
    selection: SelectionConfig;
  };

  /** Ouvintes opcionais (log, UI de depuração). */
  onDecisionChanged: ((brain: Brain, from: Decision | null, to: Decision) => void) | null = null;

  constructor(owner: AiEntity, world: World, options: BrainOptions = {}) {
    this.owner = owner;
    this.world = world;
    this.rng = options.rng ?? defaultRng;
    this.imap = options.imap ?? null;
    this.perceiveFn = options.perceive ?? null;
    this.opt = {
      thinkInterval: options.thinkInterval ?? 0.25,
      thinkJitter: options.thinkJitter ?? 0.05,
      idleThinkInterval: options.idleThinkInterval ?? options.thinkInterval ?? 0.25,
      maxNeighborDistance: options.maxNeighborDistance ?? 30,
      useCompensation: options.useCompensation ?? true,
      minScore: options.minScore ?? 0.0001,
      debug: options.debug ?? false,
      selection: options.selection ?? { mode: SelectionMode.Best },
    };
  }

  /** Cria um brain a partir de um BrainSeed da biblioteca. */
  static fromSeed(seedId: number, owner: AiEntity, world: World, options?: BrainOptions): Brain {
    const seed = BrainLibrary.brains.get(seedId);
    if (!seed) throw new Error(`BrainSeed ${seedId} não existe`);
    const brain = new Brain(owner, world, options);
    for (const id of seed.behaviorPackIds) {
      const p = BrainLibrary.behaviorPackages.get(id);
      if (!p) throw new Error(`Behavior Pack ${id} não existe (brain ${seed.name})`);
      brain.addBehaviorPack(p);
    }
    for (const id of seed.abilityPackIds) {
      const p = BrainLibrary.abilityPackages.get(id);
      if (!p) throw new Error(`Ability Pack ${id} não existe (brain ${seed.name})`);
      brain.addAbilityPack(p);
    }
    return brain;
  }

  // ---- Packs em tempo de jogo (ganhar/perder comportamentos) ----

  addBehaviorPack(p: BehaviorPackage): void {
    if (!this.behaviorPacks.includes(p)) this.behaviorPacks.push(p);
  }
  removeBehaviorPack(id: number): void {
    const i = this.behaviorPacks.findIndex((p) => p.id === id);
    if (i >= 0) this.behaviorPacks.splice(i, 1);
  }
  addAbilityPack(p: AbilityPackage): void {
    if (!this.abilityPacks.includes(p)) this.abilityPacks.push(p);
  }
  removeAbilityPack(id: number): void {
    const i = this.abilityPacks.findIndex((p) => p.id === id);
    if (i >= 0) this.abilityPacks.splice(i, 1);
  }

  // ---- Estado atual (usado por inputs) ----

  get currentDecision(): Decision | null {
    return this.current?.decision ?? null;
  }
  get currentKey(): string | null {
    return this.current?.decision.key ?? null;
  }
  currentRuntime(key: string): number {
    return this.current && this.current.decision.key === key
      ? this.world.now() - this.current.startTime
      : 0;
  }

  /** Força pensar no próximo update (ex.: evento "granada!", "levei dano"). */
  interrupt(): void {
    this.nextThinkTime = 0;
  }

  // ---- Laço principal: chame a cada frame ----

  update(dt: number): void {
    const now = this.world.now();
    if (this.wantsToThink(now)) this.think(now);
    const cur = this.current;
    if (cur) {
      cur.instance.update(dt);
      if (cur.instance.isDone()) {
        this.finishCurrent(now);
        this.interrupt(); // terminou sozinho: pensa de novo já
      }
    }
  }

  wantsToThink(now: number): boolean {
    if (!this.canThink(now)) return false;
    return now >= this.nextThinkTime;
  }

  canThink(now: number): boolean {
    return (
      this.owner.isAlive(now) &&
      !this.owner.tags.has(Tags.Incapacitated, now)
    );
  }

  think(now: number): void {
    this.owner.tags.purge(now);
    this.owner.beliefs.purge(now);
    this.history.process(now);
    this.rebuildNeighborList(now);
    this.rebuildDecisionList();
    const chosen = this.selectDecision();
    if (chosen) this.setDecision(chosen, now);
    else if (this.current && this.current.decision.context.behavior.duration === DurationType.Continuous) {
      // Nenhuma decisão válida: encerra o que estava fazendo.
      this.finishCurrent(now);
    }
    const jitter = this.opt.thinkJitter > 0 ? (this.rng.next() * 2 - 1) * this.opt.thinkJitter : 0;
    const interval = this.current ? this.opt.thinkInterval : Math.min(this.opt.thinkInterval, this.opt.idleThinkInterval);
    this.nextThinkTime = now + Math.max(0.01, interval + jitter * (interval / this.opt.thinkInterval));
  }

  // ---- Passo 3: vizinhos ----

  rebuildNeighborList(now: number): void {
    this.neighbors = [];
    const o = this.owner;
    if (this.perceiveFn) {
      for (const e of this.perceiveFn(this, now)) if (e !== o) this.neighbors.push(e);
      return;
    }
    for (const e of this.world.entities()) {
      if (e === o) continue;
      if (e.tags.has(Tags.Landmark, now) || distance(o.position, e.position) < this.opt.maxNeighborDistance) {
        this.neighbors.push(e);
      }
    }
  }

  // ---- Passo 4: lista de decisões ----

  rebuildDecisionList(): void {
    this.decisions = [];
    for (const pack of this.behaviorPacks)
      for (const b of pack.behaviors) this.addDecisionsFor(b, null);
    for (const pack of this.abilityPacks)
      for (const pair of pack.pairs) this.addDecisionsFor(pair.behavior, pair);
  }

  private addDecisionsFor(b: Behavior, pair: BehaviorAbilityPair | null): void {
    const ability = pair?.abilityId ?? null;
    if (b.isTargeted) {
      for (const n of this.neighbors) {
        if (b.targetTypes && !b.targetTypes.includes(n.type)) continue;
        this.decisions.push(new Decision(new ContextInfo(this, b, this.owner, n, ability)));
      }
    } else {
      const target = b.contextType === ContextType.Self ? this.owner : null;
      this.decisions.push(new Decision(new ContextInfo(this, b, this.owner, target, ability)));
    }
  }

  // ---- Passo 5: pontuação ----

  /**
   * Fator de compensação: sem ele, behaviors com muitas considerations
   * perdem para os com poucas (o produto de vários números < 1 cai rápido).
   * Cada score é "puxado" de volta proporcionalmente ao que perdeu.
   */
  private compensate(score: number, count: number): number {
    if (!this.opt.useCompensation || count <= 1) return score;
    const modFactor = 1 - 1 / count;
    const makeUp = (1 - score) * modFactor;
    return score + makeUp * score;
  }

  scoreDecision(d: Decision, bestSoFar: number): number {
    const ctx = d.context;
    const b = ctx.behavior;
    const isCurrent = this.currentKey === d.key;
    const momentum = isCurrent && b.duration === DurationType.Continuous ? b.momentum : 1;

    let score = b.weight * momentum;
    if (this.opt.debug) d.breakdown.length = 0;
    // Corte antecipado: considerations só podem baixar o score.
    // (Desligado em debug, para ver o score completo de tudo.)
    // No sorteio entre as melhores, quem já ficou abaixo da fração do melhor até aqui não entra no sorteio
    // (o melhor final só pode ser maior): dá para cortar do mesmo jeito.
    const sel = this.opt.selection;
    const cut = sel.mode === SelectionMode.Best ? 1 : sel.withinFractionOfBest ?? 0;
    const earlyOut = cut > 0 && !this.opt.debug;
    const floor = bestSoFar * cut;
    const below = (x: number) => (cut === 1 ? x <= floor : x < floor);
    if (earlyOut && below(score)) return 0;

    const n = b.considerations.length;
    for (const c of b.considerations) {
      const s = this.compensate(c.getScore(ctx), n);
      if (this.opt.debug) d.breakdown.push({ name: c.name, score: s });
      score *= s;
      if (score <= 0) return 0;
      if (earlyOut && below(score)) return 0;
    }
    return score;
  }

  // ---- Passo 6: seleção ----

  selectDecision(): Decision | null {
    let best = 0;
    this.lastBehaviorScore.clear();
    for (const d of this.decisions) {
      d.score = this.scoreDecision(d, best);
      if (d.score > best) best = d.score;
      const id = d.context.behavior.id;
      if (d.score > (this.lastBehaviorScore.get(id) ?? -1)) this.lastBehaviorScore.set(id, d.score);
    }
    const valid = this.decisions.filter((d) => d.score >= this.opt.minScore);
    if (this.opt.debug) this.lastScored = [...valid].sort((a, b) => b.score - a.score);
    if (valid.length === 0) return null;

    const sel = this.opt.selection;
    if (sel.mode === SelectionMode.Best) {
      return valid.reduce((a, b) => (b.score > a.score ? b : a));
    }

    let pool = valid;
    if (sel.withinFractionOfBest !== undefined) {
      pool = pool.filter((d) => d.score >= best * sel.withinFractionOfBest!);
    }
    if (sel.mode === SelectionMode.WeightedRandomTop) {
      pool = [...pool].sort((a, b) => b.score - a.score);
      let count = pool.length;
      if (sel.topPercent !== undefined) count = Math.max(1, Math.ceil(pool.length * sel.topPercent));
      if (sel.topN !== undefined) count = Math.min(count, Math.max(1, sel.topN));
      pool = pool.slice(0, count);
    }
    return this.weightedPick(pool);
  }

  /** Sorteio ponderado pelo score (baldes com bordas cumulativas). */
  private weightedPick(pool: Decision[]): Decision {
    const total = pool.reduce((s, d) => s + d.score, 0);
    let r = this.rng.next() * total;
    for (const d of pool) {
      r -= d.score;
      if (r < 0) return d;
    }
    return pool[pool.length - 1];
  }

  /**
   * Pensa sem agir: monta as decisões (com `neighbors` como os alvos, se vier), pontua e escolhe, mas não
   * executa nem mexe no histórico. Para simulações que aplicam a escolha elas mesmas (decisões anuais,
   * o mundo agregado) e para o "e se" da ficha. Com `debug`, `lastScored` guarda todas as notas.
   */
  decide(neighbors?: AiEntity[]): Decision | null {
    const now = this.world.now();
    this.owner.tags.purge(now);
    this.owner.beliefs.purge(now);
    if (neighbors) this.neighbors = neighbors;
    else this.rebuildNeighborList(now);
    this.rebuildDecisionList();
    return this.selectDecision();
  }

  /** Executa uma decisão escolhida por fora (a mesma porta do ciclo de pensamento). */
  commit(d: Decision): void {
    this.setDecision(d, this.world.now());
  }

  /** Todos os Behaviors deste cérebro, sem repetir (para o grafo e a ficha). */
  behaviors(): Behavior[] {
    const out = new Map<number, Behavior>();
    for (const p of this.behaviorPacks) for (const b of p.behaviors) out.set(b.id, b);
    for (const p of this.abilityPacks) for (const pair of p.pairs) out.set(pair.behavior.id, pair.behavior);
    return [...out.values()];
  }

  // ---- Execução ----

  private setDecision(d: Decision, now: number): void {
    const cur = this.current;
    if (cur && cur.decision.key === d.key) {
      // Mesma decisão: Continuous segue executando (só execute, sem setup).
      cur.decision = d;
      cur.instance.execute();
      return;
    }
    const prev = cur?.decision ?? null;
    if (cur) this.finishCurrent(now);

    const instance = BehaviorTypes.create(d.context.behavior.behaviorType, d.context);
    instance.setup();
    instance.execute();
    this.onDecisionChanged?.(this, prev, d);

    if (d.context.behavior.duration === DurationType.Instant) {
      // Instant: roda uma vez e já entra no histórico.
      this.record(d, now);
      instance.end();
      this.current = null;
    } else {
      this.current = { decision: d, instance, startTime: now };
    }
  }

  /** Encerra a decisão atual (Continuous só entra no histórico ao terminar). */
  private finishCurrent(now: number): void {
    const cur = this.current;
    if (!cur) return;
    cur.instance.end();
    this.record(cur.decision, now);
    this.current = null;
  }

  private record(d: Decision, now: number): void {
    const ctx = d.context;
    this.history.record(ctx.behavior.id, ctx.target?.id ?? null, ctx.behavior.behaviorType, now);
  }

  /** Tabela legível das últimas decisões (requer debug: true). */
  debugReport(limit = 8): string {
    return this.lastScored
      .slice(0, limit)
      .map((d) => {
        const parts = d.breakdown.map((x) => `${x.name}=${x.score.toFixed(2)}`).join(' ');
        return `${d.score.toFixed(3).padStart(6)}  ${d.describe()}  ${parts}`;
      })
      .join('\n');
  }
}
