import { restoreEcosystem, snapshotEcosystem } from '../../save/snapshot';
import { worldFingerprint } from '../fingerprint';
import type { EngineSnapshot } from './engine';

/** Passo com que o mundo anda sem tela: o mesmo do jogo (`SIM_STEP`) e da calibração. */
export const RUN_STEP = 0.25;

export interface RunRequest {
  /** O mundo de partida. Fica com o Worker: quem pede manda uma cópia. */
  snapshot: EngineSnapshot;
  /** Anos a rodar (pode ter fração). */
  years: number;
  /** Tempo de máquina, em ms: estourado, para no fim do ano em que está. */
  budgetMs: number;
}

export interface RunResult {
  snapshot: EngineSnapshot;
  /** Anos que rodaram de fato (menos que os pedidos quando o tempo acabou). */
  yearsRun: number;
  /** O tempo acabou antes dos anos pedidos. */
  cut: boolean;
  /** Impressão digital do mundo no fim, para quem quer conferir que veio o mesmo. */
  fingerprint: string;
  ms: number;
}

/**
 * Roda um mundo a partir de um retrato, sem tela e sem nada do navegador: o relógio entra de fora e só decide quando
 * parar, nunca o que acontece. É a entrada "sem vitest" do motor: o Worker (`worker.ts`) e os testes chamam isto.
 */
export function runSnapshot(req: RunRequest, clock: () => number, onYear?: (yearsRun: number) => void): RunResult {
  const t0 = clock();
  const seed = req.snapshot.eco.seed;
  const map = req.snapshot.map;
  const eco = restoreEcosystem(req.snapshot.eco, map);
  const stepsPerYear = Math.round(eco.yearSpan / RUN_STEP);
  const total = Math.round(req.years * stepsPerYear);
  let done = 0;
  let cut = false;
  while (done < total) {
    const stop = Math.min(total, done + stepsPerYear);
    for (; done < stop; done++) eco.step(RUN_STEP);
    onYear?.(done / stepsPerYear);
    if (done < total && clock() - t0 > req.budgetMs) {
      cut = true;
      break;
    }
  }
  return {
    snapshot: { map, eco: snapshotEcosystem(eco, seed) },
    yearsRun: done / stepsPerYear,
    cut,
    fingerprint: worldFingerprint(eco),
    ms: clock() - t0,
  };
}

/** Os buffers dos arrays tipados dentro de um valor, cada um uma vez: a lista de transferência do `postMessage`. */
export function buffersOf(value: unknown): ArrayBuffer[] {
  const seen = new Set<object>();
  const out = new Set<ArrayBuffer>();
  const stack: unknown[] = [value];
  while (stack.length) {
    const v = stack.pop();
    if (typeof v !== 'object' || v === null || seen.has(v)) continue;
    seen.add(v);
    if (ArrayBuffer.isView(v)) {
      if (v.buffer instanceof ArrayBuffer) out.add(v.buffer);
    } else if (Array.isArray(v)) {
      for (const x of v) stack.push(x);
    } else if (v instanceof Map) {
      for (const [k, x] of v) stack.push(k, x);
    } else if (v instanceof Set) {
      for (const x of v) stack.push(x);
    } else {
      for (const x of Object.values(v)) stack.push(x);
    }
  }
  return [...out];
}
