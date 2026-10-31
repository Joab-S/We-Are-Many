/**
 * Distância de um mundo às metas, para o ajuste automático (tools/tune.mjs, docs/AJUSTE-AUTOMATICO.md): 0 com
 * todo indicador dentro da faixa; fora dela, a distância até a borda mais perto, na escala da meta, ao quadrado e
 * vezes o peso. Ao quadrado para o otimizador correr primeiro atrás do que está mais longe.
 */
import type { Indicators } from './calibrate';

export interface Goal {
  key: keyof Indicators;
  /** Faixa aceita; sem `min` ou sem `max`, o lado fica aberto. */
  min?: number;
  max?: number;
  /** Peso na soma (1 sem ele). */
  weight?: number;
  /** Quanto vale "uma unidade" de erro (sem ela: o tamanho da borda que conta, ou 1). */
  scale?: number;
}

/** Metas da calibração (`LONG_TARGETS`, com 99999 como "sem teto") no formato do ajuste. */
export function goalsFrom(targets: { key: keyof Indicators; min: number; max: number }[]): Goal[] {
  return targets.map((t) => ({ key: t.key, min: t.min, max: t.max >= 99999 ? undefined : t.max }));
}

/** Erro de um indicador contra a meta, já na escala dela (0 dentro da faixa). */
export function goalMiss(value: number, g: Goal): number {
  if (!Number.isFinite(value)) return 10;
  const below = g.min !== undefined && value < g.min ? g.min - value : 0;
  const above = g.max !== undefined && value > g.max ? value - g.max : 0;
  if (!below && !above) return 0;
  const edge = below ? g.min! : g.max!;
  const scale = g.scale ?? (Math.abs(edge) > 1e-9 ? Math.abs(edge) : 1);
  return (below + above) / scale;
}

/** Distância total e a parte de cada meta (já com peso e ao quadrado). */
export function goalLoss(ind: Indicators, goals: Goal[]): { loss: number; parts: Record<string, number> } {
  const parts: Record<string, number> = {};
  let loss = 0;
  for (const g of goals) {
    const miss = goalMiss(Number(ind[g.key]), g);
    const part = (g.weight ?? 1) * miss * miss;
    parts[g.key] = (parts[g.key] ?? 0) + part;
    loss += part;
  }
  return { loss, parts };
}
