/**
 * Relógio da simulação da superfície (Game Loop com passo fixo, Game
 * Programming Patterns): o tempo real do quadro, vezes a velocidade, entra
 * num acumulador e sai em passos sempre do mesmo tamanho. Quem desenha usa
 * `alpha` (a fração do próximo passo já passada) para interpolar as
 * criaturas entre o passo anterior e o atual.
 *
 * As ações do jogador chegam como comandos numa fila e são aplicadas na
 * fronteira entre dois passos: antes do próximo passo, ou no fim do quadro
 * quando nenhum passo roda (pausa ou velocidade baixa). Cada comando entra
 * num log com o número do passo (base para replay).
 */

/** O que o relógio precisa do mundo: dar um passo e as posições das criaturas (para interpolar). */
export interface SimTarget {
  step(h: number): void;
  readonly count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly uid: Uint32Array;
  /** Ano do mundo: se mudou sem o relógio saber (passos dados por fora), não interpola. */
  readonly year: number;
}

/**
 * Passo fixo, em segundos de jogo: o mesmo `dt` com que a calibração
 * (`src/sim/calibrate.ts`) e os testes longos chamam `eco.step`, para o jogo
 * rodar a mesma simulação calibrada em qualquer velocidade.
 */
export const SIM_STEP = 0.25;
/** Velocidades do jogo (multiplicam o tempo real); a primeira é a pausa. */
export const SPEEDS = [0, 1, 2, 5];
/**
 * Teto de passos por quadro. Se o quadro pede mais (computador lento, aba que
 * voltou do fundo), o tempo de jogo que sobra é descartado: o jogo desacelera,
 * o passo não aumenta.
 */
export const MAX_STEPS_PER_FRAME = 3;
/** Comandos guardados no log (os mais antigos saem). */
export const LOG_LIMIT = 4096;
/** Acima disso (tiles num passo) a criatura saltou (barco, mudança): desenha onde está, sem deslizar. */
const JUMP = 3;

export interface LoggedCommand<C> {
  tick: number;
  cmd: C;
}

export class SimDriver<C> {
  /** Índice em SPEEDS. */
  speed = 1;
  /** Passos dados desde o começo (o relógio do log). */
  tick = 0;
  /** Tempo de jogo acumulado que ainda não virou passo (sempre menor que um passo, salvo no teto). */
  private acc = 0;
  private readonly queue: C[] = [];
  /** Log dos comandos aplicados, com o passo em que entraram (no máximo `logLimit`). */
  readonly log: LoggedCommand<C>[] = [];
  // Posições do passo anterior, para interpolar.
  private prevX = new Float32Array(0);
  private prevY = new Float32Array(0);
  private prevUid = new Uint32Array(0);
  private prevCount = 0;
  /** Ano do mundo logo depois do último passo dado aqui (ver SimTarget.year). */
  private stamp = NaN;
  /** Medidas do último quadro: passos, tempo deles (ms) e tempo de jogo descartado pelo teto. */
  readonly stats = { steps: 0, stepMs: 0, dropped: 0, totalSteps: 0, totalMs: 0 };

  constructor(
    private readonly target: SimTarget,
    private readonly apply: (cmd: C) => void,
    readonly opts: { step?: number; maxSteps?: number; logLimit?: number; wrapWidth?: number; now?: () => number } = {},
  ) {}

  get h(): number {
    return this.opts.step ?? SIM_STEP;
  }

  get paused(): boolean {
    return SPEEDS[this.speed] === 0;
  }

  /** Multiplicador da velocidade atual (0 na pausa). */
  get factor(): number {
    return SPEEDS[this.speed];
  }

  /** Fração do próximo passo já decorrida (0 a 1), para interpolar o desenho. */
  get alpha(): number {
    return Math.min(1, this.acc / this.h);
  }

  /** Comandos esperando a próxima fronteira de passo. */
  get pending(): number {
    return this.queue.length;
  }

  setSpeed(index: number): void {
    this.speed = Math.min(Math.max(0, Math.floor(index)), SPEEDS.length - 1);
  }

  enqueue(cmd: C): void {
    this.queue.push(cmd);
  }

  /**
   * Um quadro: `dt` segundos reais. Roda os passos que couberem (até o
   * teto) e aplica os comandos na fronteira. Devolve quantos passos deu.
   */
  update(dt: number): number {
    const h = this.h;
    const max = this.opts.maxSteps ?? MAX_STEPS_PER_FRAME;
    const now = this.opts.now ?? (() => performance.now());
    this.stats.steps = 0;
    this.stats.stepMs = 0;
    this.stats.dropped = 0;
    this.acc += Math.max(0, dt) * SPEEDS[this.speed];
    let n = 0;
    while (this.acc >= h && n < max) {
      this.flush();
      this.snapshot();
      const t0 = now();
      this.target.step(h);
      this.stats.stepMs += now() - t0;
      this.stamp = this.target.year;
      this.acc -= h;
      this.tick++;
      n++;
    }
    if (this.acc >= h) {
      // Estourou o teto: o tempo que sobra é descartado (o jogo desacelera); fica só a fração do próximo passo.
      const keep = this.acc % h;
      this.stats.dropped = this.acc - keep;
      this.acc = keep;
    }
    // Sem passo neste quadro, os comandos entram no fim dele (ainda entre dois passos).
    if (!n) this.flush();
    this.stats.steps = n;
    this.stats.totalSteps += n;
    this.stats.totalMs += this.stats.stepMs;
    return n;
  }

  /** Aplica os comandos da fila agora (fronteira de passo) e os guarda no log. */
  flush(): void {
    if (!this.queue.length) return;
    const limit = this.opts.logLimit ?? LOG_LIMIT;
    // A fila pode crescer enquanto aplica (um comando que gera outro): vale para o mesmo passo.
    for (let k = 0; k < this.queue.length; k++) {
      const cmd = this.queue[k];
      this.apply(cmd);
      this.log.push({ tick: this.tick, cmd });
    }
    this.queue.length = 0;
    if (this.log.length > limit) this.log.splice(0, this.log.length - limit);
  }

  /** Copia as posições de agora para o passo anterior (antes de cada passo). */
  private snapshot(): void {
    const t = this.target;
    const n = t.count;
    if (this.prevX.length < n) {
      const cap = Math.max(n, this.prevX.length * 2, 256);
      this.prevX = new Float32Array(cap);
      this.prevY = new Float32Array(cap);
      this.prevUid = new Uint32Array(cap);
    }
    this.prevX.set(t.x.subarray(0, n));
    this.prevY.set(t.y.subarray(0, n));
    this.prevUid.set(t.uid.subarray(0, n));
    this.prevCount = n;
  }

  /** Vale interpolar a criatura `i`: o slot é o mesmo indivíduo do passo anterior e o mundo não andou por fora. */
  private interpolates(i: number): boolean {
    return i < this.prevCount && this.prevUid[i] === this.target.uid[i] && this.target.year === this.stamp;
  }

  /** Coluna para desenhar a criatura `i`, entre o passo anterior e o atual. */
  x(i: number): number {
    const x = this.target.x[i];
    if (!this.interpolates(i)) return x;
    const px = this.prevX[i];
    let d = x - px;
    // Atravessou a borda leste-oeste: interpola pelo lado curto.
    const w = this.opts.wrapWidth;
    if (w && Math.abs(d) > w / 2) d -= Math.sign(d) * w;
    if (Math.abs(d) > JUMP || Math.abs(this.target.y[i] - this.prevY[i]) > JUMP) return x;
    const v = px + d * this.alpha;
    return w ? ((v % w) + w) % w : v;
  }

  /** Linha para desenhar a criatura `i`. */
  y(i: number): number {
    const y = this.target.y[i];
    if (!this.interpolates(i)) return y;
    const py = this.prevY[i];
    let dx = this.target.x[i] - this.prevX[i];
    const w = this.opts.wrapWidth;
    if (w && Math.abs(dx) > w / 2) dx -= Math.sign(dx) * w;
    if (Math.abs(dx) > JUMP || Math.abs(y - py) > JUMP) return y;
    return py + (y - py) * this.alpha;
  }
}
