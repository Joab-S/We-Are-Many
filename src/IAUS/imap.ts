// imap.ts — Mapa de influência (Imap) simples em grade.
//
// Agentes "escrevem" influência numa grade (ameaça, presença de aliados,
// recursos…), e as considerations leem essas camadas: "quanta ameaça há
// onde o alvo está?", "qual o ponto mais denso de inimigos para um fireball?".

import { Vec2, clamp01 } from './math';

export class InfluenceLayer {
  readonly cols: number;
  readonly rows: number;
  readonly cells: Float32Array;

  constructor(
    readonly name: string,
    readonly width: number,
    readonly height: number,
    readonly cellSize: number,
    readonly origin: Vec2 = { x: 0, y: 0 },
  ) {
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    this.cells = new Float32Array(this.cols * this.rows);
  }

  clear(): void {
    this.cells.fill(0);
  }

  private cellOf(p: Vec2): [number, number] {
    return [
      Math.floor((p.x - this.origin.x) / this.cellSize),
      Math.floor((p.y - this.origin.y) / this.cellSize),
    ];
  }

  cellCenter(cx: number, cy: number): Vec2 {
    return {
      x: this.origin.x + (cx + 0.5) * this.cellSize,
      y: this.origin.y + (cy + 0.5) * this.cellSize,
    };
  }

  /**
   * Carimba influência num raio, com queda linear até 0 na borda
   * (ou `falloffPower` > 1 para cair mais rápido).
   */
  stamp(center: Vec2, radius: number, magnitude: number, falloffPower = 1): void {
    const [ccx, ccy] = this.cellOf(center);
    const rc = Math.ceil(radius / this.cellSize);
    for (let y = ccy - rc; y <= ccy + rc; y++) {
      if (y < 0 || y >= this.rows) continue;
      for (let x = ccx - rc; x <= ccx + rc; x++) {
        if (x < 0 || x >= this.cols) continue;
        const c = this.cellCenter(x, y);
        const d = Math.hypot(c.x - center.x, c.y - center.y);
        if (d > radius) continue;
        const f = Math.pow(1 - d / radius, falloffPower);
        this.cells[y * this.cols + x] += magnitude * f;
      }
    }
  }

  valueAt(p: Vec2): number {
    const [x, y] = this.cellOf(p);
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return 0;
    return this.cells[y * this.cols + x];
  }

  maxValue(): number {
    let m = 0;
    for (const v of this.cells) if (v > m) m = v;
    return m;
  }

  /** Valor normalizado pelo máximo atual da camada (0..1). */
  normalizedAt(p: Vec2): number {
    const m = this.maxValue();
    return m > 0 ? clamp01(this.valueAt(p) / m) : 0;
  }

  /** Melhor célula (maior valor × pesoOpcional) dentro de um raio de busca. */
  findBest(
    from: Vec2,
    searchRadius: number,
    score: (value: number, pos: Vec2) => number = (v) => v,
  ): { pos: Vec2; value: number } | null {
    const [ccx, ccy] = this.cellOf(from);
    const rc = Math.ceil(searchRadius / this.cellSize);
    let best: { pos: Vec2; value: number } | null = null;
    let bestScore = -Infinity;
    for (let y = ccy - rc; y <= ccy + rc; y++) {
      if (y < 0 || y >= this.rows) continue;
      for (let x = ccx - rc; x <= ccx + rc; x++) {
        if (x < 0 || x >= this.cols) continue;
        const pos = this.cellCenter(x, y);
        if (Math.hypot(pos.x - from.x, pos.y - from.y) > searchRadius) continue;
        const v = this.cells[y * this.cols + x];
        const s = score(v, pos);
        if (s > bestScore) {
          bestScore = s;
          best = { pos, value: v };
        }
      }
    }
    return best;
  }

  /** this += other × weight (combinar camadas, ex.: ameaça − apoio). */
  addLayer(other: InfluenceLayer, weight = 1): void {
    if (other.cells.length !== this.cells.length) throw new Error('Camadas de tamanhos diferentes');
    for (let i = 0; i < this.cells.length; i++) this.cells[i] += other.cells[i] * weight;
  }
}

/** Gerencia camadas nomeadas. Reconstrua as camadas dinâmicas a cada ciclo do jogo. */
export class ImapManager {
  private readonly layers = new Map<string, InfluenceLayer>();

  constructor(
    readonly width: number,
    readonly height: number,
    readonly cellSize: number,
    readonly origin: Vec2 = { x: 0, y: 0 },
  ) {}

  layer(name: string): InfluenceLayer {
    let l = this.layers.get(name);
    if (!l) {
      l = new InfluenceLayer(name, this.width, this.height, this.cellSize, this.origin);
      this.layers.set(name, l);
    }
    return l;
  }

  has(name: string): boolean {
    return this.layers.has(name);
  }

  clearAll(): void {
    for (const l of this.layers.values()) l.clear();
  }
}
