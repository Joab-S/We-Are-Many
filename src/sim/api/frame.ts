import type { Engine, EngineView } from './engine';

/**
 * Quanto a tela leria do motor por passo, se o motor estivesse num Worker (`docs/SEPARACAO-MOTOR.md`). Só mede:
 * não sorteia nem muda o mundo, mas drena os tiles sujos, então o meter é o único que os drena durante a medição.
 *
 * As listas (barcos, caravanas, efeitos) e os lugares não têm array tipado: o tamanho é o do JSON, que é uma
 * aproximação do custo do `structuredClone`.
 */

/** Índice do tile, vegetação (float32), bioma e `felled`. */
export const DIRTY_TILE_BYTES = 10;

/** Bytes de uma criatura: a soma de um elemento de cada array da vista. */
export function creatureBytes(v: EngineView): number {
  return [v.x, v.y, v.vx, v.vy, v.age, v.energy, v.kind, v.alive, v.village, v.role, v.uid, v.family, v.carry, v.gesture].reduce((n, a) => n + a.BYTES_PER_ELEMENT, 0);
}

export interface Stat {
  mean: number;
  p95: number;
  max: number;
}

export interface FrameReport {
  steps: number;
  /** Slots de criatura (`count`). */
  count: Stat;
  /** Tiles sujos por passo. */
  tiles: Stat;
  /** JSON de barcos, caravanas e efeitos juntos, por passo. */
  lists: Stat;
  /** JSON de todos os lugares juntos, e o do maior deles (medidos uma vez por ano). */
  villages: Stat;
  village: Stat;
  /** O que iria por passo: as criaturas, os tiles sujos e as listas. */
  bytesPerStep: Stat;
}

const statOf = (values: number[]): Stat => {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((n, x) => n + x, 0);
  return {
    mean: sorted.length ? sum / sorted.length : 0,
    p95: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0,
    max: sorted.length ? sorted[sorted.length - 1] : 0,
  };
};

/** Os lugares têm `Set` e `Map` que o JSON não leria direito; aqui eles contam como listas. */
const jsonBytes = (value: unknown): number =>
  JSON.stringify(value, (_k, v: unknown) => {
    if (v instanceof Set) return [...v];
    if (v instanceof Map) return [...v.entries()];
    if (ArrayBuffer.isView(v)) return { bytes: v.byteLength };
    return v;
  })?.length ?? 0;

export class FrameMeter {
  private readonly count: number[] = [];
  private readonly tiles: number[] = [];
  private readonly lists: number[] = [];
  private readonly villages: number[] = [];
  private readonly village: number[] = [];
  private readonly bytes: number[] = [];
  private lastYear = -1;

  constructor(private readonly engine: Engine) {}

  /** Chamar depois de cada passo. */
  sample(): void {
    const v = this.engine.view;
    const tiles = this.engine.drainTiles().length;
    const lists = jsonBytes(v.boats) + jsonBytes(v.caravans) + jsonBytes(v.effects);
    this.count.push(v.count);
    this.tiles.push(tiles);
    this.lists.push(lists);
    this.bytes.push(v.count * creatureBytes(v) + tiles * DIRTY_TILE_BYTES + lists);
    const year = Math.floor(v.year);
    if (year !== this.lastYear) {
      this.lastYear = year;
      const each = v.villages.filter((x) => !x.abandoned).map(jsonBytes);
      this.villages.push(each.reduce((n, x) => n + x, 0));
      this.village.push(each.length ? Math.max(...each) : 0);
    }
  }

  report(): FrameReport {
    return {
      steps: this.count.length,
      count: statOf(this.count),
      tiles: statOf(this.tiles),
      lists: statOf(this.lists),
      villages: statOf(this.villages),
      village: statOf(this.village),
      bytesPerStep: statOf(this.bytes),
    };
  }
}
