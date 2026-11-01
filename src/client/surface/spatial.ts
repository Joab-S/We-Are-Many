/**
 * Partição espacial das criaturas para o desenho (Spatial Partition, Game
 * Programming Patterns): uma grade de células de `cell` tiles com lista ligada
 * em Int32Array, como a `buildGrid` do Ecosystem. O desenho percorre só as
 * células da vista em vez de todas as criaturas.
 *
 * A grade do Ecosystem é refeita no começo de cada passo e não vê quem nasceu
 * depois (nem quem o jogador soltou com o jogo pausado); esta é refeita pelo
 * cliente quando o mundo andou ou recebeu um comando (`stale`), e fica igual
 * enquanto nada muda.
 */
export class CreatureGrid {
  readonly cols: number;
  readonly rows: number;
  private readonly head: Int32Array;
  private next = new Int32Array(0);
  private out = new Int32Array(0);
  /** Refazer antes de consultar (o mundo mudou). */
  stale = true;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly cell = 16,
  ) {
    this.cols = Math.ceil(width / cell);
    this.rows = Math.ceil(height / cell);
    this.head = new Int32Array(this.cols * this.rows).fill(-1);
  }

  /** Refaz a grade com as criaturas vivas (x e linha de cada uma). */
  rebuild(count: number, alive: ArrayLike<number>, x: ArrayLike<number>, y: ArrayLike<number>): void {
    if (this.next.length < count) {
      this.next = new Int32Array(Math.max(count, this.next.length * 2, 256));
      this.out = new Int32Array(this.next.length);
    }
    const head = this.head;
    head.fill(-1);
    const c = this.cell;
    const w = this.width;
    for (let i = count - 1; i >= 0; i--) {
      if (!alive[i]) continue;
      const cx = Math.floor((((x[i] % w) + w) % w) / c);
      const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y[i] / c)));
      const k = cy * this.cols + cx;
      this.next[i] = head[k];
      head[k] = i;
    }
    this.stale = false;
  }

  /**
   * Índices das criaturas nas células que tocam o retângulo (colunas x0..x1,
   * com volta horizontal; linhas r0..r1), em ordem crescente (a mesma ordem
   * de desenho de antes). Devolve quantos; os índices ficam em `indices`.
   */
  query(x0: number, x1: number, r0: number, r1: number): number {
    const c = this.cell;
    const gy0 = Math.max(0, Math.floor(r0 / c));
    const gy1 = Math.min(this.rows - 1, Math.floor(r1 / c));
    let gx0 = Math.floor(x0 / c);
    let gx1 = Math.floor(x1 / c);
    // A vista mais larga que o mapa vê todas as colunas uma vez só.
    if (gx1 - gx0 + 1 >= this.cols) {
      gx0 = 0;
      gx1 = this.cols - 1;
    }
    let n = 0;
    const out = this.out;
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let g = gx0; g <= gx1; g++) {
        const gx = ((g % this.cols) + this.cols) % this.cols;
        for (let i = this.head[gy * this.cols + gx]; i >= 0; i = this.next[i]) out[n++] = i;
      }
    }
    // Cada célula já sai em ordem crescente; entre células, ordena (poucos itens: só os da vista).
    out.subarray(0, n).sort();
    return n;
  }

  get indices(): Int32Array {
    return this.out;
  }
}
