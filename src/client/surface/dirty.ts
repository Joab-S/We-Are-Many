/**
 * Dirty Flag para o mapa da superfície (Game Programming Patterns): em vez
 * de reenviar o mapa inteiro quando um tile muda, junta-se o que mudou e só
 * isso vai para a tela.
 */

/** Retângulo sujo em tiles (inclusivo), que cresce para cobrir cada ponto marcado. */
export class DirtyRect {
  x0 = Infinity;
  y0 = Infinity;
  x1 = -Infinity;
  y1 = -Infinity;

  get empty(): boolean {
    return this.x1 < this.x0;
  }

  get width(): number {
    return this.empty ? 0 : this.x1 - this.x0 + 1;
  }

  get height(): number {
    return this.empty ? 0 : this.y1 - this.y0 + 1;
  }

  add(x: number, y: number): void {
    if (x < this.x0) this.x0 = x;
    if (x > this.x1) this.x1 = x;
    if (y < this.y0) this.y0 = y;
    if (y > this.y1) this.y1 = y;
  }

  /** Junta outro retângulo a este. */
  union(o: DirtyRect): void {
    if (o.empty) return;
    this.add(o.x0, o.y0);
    this.add(o.x1, o.y1);
  }

  clear(): void {
    this.x0 = Infinity;
    this.y0 = Infinity;
    this.x1 = -Infinity;
    this.y1 = -Infinity;
  }
}

/**
 * O mapa dividido em blocos de `size`×`size` tiles, cada um com o seu
 * retângulo sujo. A vegetação muda em tiles sorteados pelo mapa inteiro a
 * cada passo, então um retângulo só cobriria quase sempre tudo; por bloco, o
 * envio pode ir primeiro para o que está na tela e o resto aos poucos.
 */
export class DirtyBlocks {
  readonly cols: number;
  readonly rows: number;
  private readonly x0: Int16Array;
  private readonly y0: Int16Array;
  private readonly x1: Int16Array;
  private readonly y1: Int16Array;
  /** Blocos sujos, sem repetição, na ordem em que sujaram. */
  private readonly list: Int32Array;
  private n = 0;
  /** Blocos que o jogador sujou (pincel, comandos): vão antes dos outros. */
  private readonly urgent: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly size = 64,
  ) {
    this.cols = Math.ceil(width / size);
    this.rows = Math.ceil(height / size);
    const n = this.cols * this.rows;
    this.x0 = new Int16Array(n).fill(-1);
    this.y0 = new Int16Array(n);
    this.x1 = new Int16Array(n);
    this.y1 = new Int16Array(n);
    this.list = new Int32Array(n);
    this.urgent = new Uint8Array(n);
  }

  /** Quantos blocos estão sujos. */
  get count(): number {
    return this.n;
  }

  blockOf(x: number, y: number): number {
    return Math.floor(y / this.size) * this.cols + Math.floor(x / this.size);
  }

  isDirty(b: number): boolean {
    return this.x0[b] >= 0;
  }

  isUrgent(b: number): boolean {
    return this.urgent[b] === 1;
  }

  /** Marca o tile (x, y); `urgent` quando a mudança veio do jogador e deve aparecer já. */
  mark(x: number, y: number, urgent = false): void {
    const b = this.blockOf(x, y);
    if (this.x0[b] < 0) {
      this.x0[b] = x;
      this.x1[b] = x;
      this.y0[b] = y;
      this.y1[b] = y;
      this.list[this.n++] = b;
    } else {
      if (x < this.x0[b]) this.x0[b] = x;
      if (x > this.x1[b]) this.x1[b] = x;
      if (y < this.y0[b]) this.y0[b] = y;
      if (y > this.y1[b]) this.y1[b] = y;
    }
    if (urgent) this.urgent[b] = 1;
  }

  /** Esquece tudo o que estava sujo (o mapa inteiro foi enviado). */
  clear(): void {
    for (let k = 0; k < this.n; k++) {
      this.x0[this.list[k]] = -1;
      this.urgent[this.list[k]] = 0;
    }
    this.n = 0;
  }

  /** Marca tudo (troca de visão do mapa, por exemplo). */
  markAll(urgent = false): void {
    for (let by = 0; by < this.rows; by++) {
      for (let bx = 0; bx < this.cols; bx++) {
        const x = bx * this.size;
        const y = by * this.size;
        this.mark(x, y, urgent);
        this.mark(Math.min(this.width, x + this.size) - 1, Math.min(this.height, y + this.size) - 1, urgent);
      }
    }
  }

  /** Retângulo sujo do bloco `b` (tiles, inclusivo); `out` é preenchido e devolvido. */
  rect(b: number, out: DirtyRect): DirtyRect {
    out.clear();
    if (this.x0[b] < 0) return out;
    out.add(this.x0[b], this.y0[b]);
    out.add(this.x1[b], this.y1[b]);
    return out;
  }

  /**
   * Entrega blocos sujos a `fn` e os limpa: os urgentes sempre, todos; depois,
   * até completar `budget`, os que passam em `visible` e por fim os outros, na
   * ordem em que sujaram (os que sobram ficam para o próximo quadro). Devolve
   * quantos entregou.
   */
  drain(budget: number, visible: (b: number) => boolean, fn: (b: number, x0: number, y0: number, x1: number, y1: number) => void): number {
    let done = 0;
    for (let pass = 0; pass < 3; pass++) {
      let keep = 0;
      for (let k = 0; k < this.n; k++) {
        const b = this.list[k];
        const go = pass === 0 ? this.urgent[b] === 1 : done < budget && (pass === 2 || visible(b));
        if (go) {
          this.emit(b, fn);
          done++;
        } else this.list[keep++] = b;
      }
      this.n = keep;
    }
    return done;
  }

  private emit(b: number, fn: (b: number, x0: number, y0: number, x1: number, y1: number) => void): void {
    const x0 = this.x0[b];
    const y0 = this.y0[b];
    const x1 = this.x1[b];
    const y1 = this.y1[b];
    this.x0[b] = -1;
    this.urgent[b] = 0;
    fn(b, x0, y0, x1, y1);
  }
}
