/**
 * Uma avaliação do ajuste automático (tools/tune.mjs, docs/AJUSTE-AUTOMATICO.md): o mundo da calibração longa
 * numa semente, com as constantes de TUNE já trocadas no código pelo vitest.tune.config.ts, e a distância às
 * metas. Escreve em SAIDA (JSON) os indicadores, a distância, a parte de cada meta e os valores que o módulo
 * de fato viu (para conferir que a troca valeu). Variáveis: TUNE (JSON nome → valor), SEMENTE (índice: a semente
 * é 1000 + 37 × SEMENTE, como na longa), ANOS, RAIO, YEAR_SPAN, METAS (JSON com a lista de `Goal`; sem ela, as
 * metas da calibração longa) e SAIDA.
 */
import { it } from 'vitest';
import * as B from './balance';
import * as T from '../ai/tuning';
import { LONG_TARGETS, runWorld } from './calibrate';
import { YEAR_SECONDS } from './ecosystem';
import { goalLoss, goalsFrom, type Goal } from './tuneGoals';

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

/** O valor que o módulo carregado tem para `name` (`NOME`, `NOME.campo` ou `NOME[i]`). */
function seen(name: string): number | null {
  const m = /^([A-Z_][A-Z0-9_]*)(?:\.(\w+)|\[(\d+)\])?$/.exec(name);
  if (!m) return null;
  const mod = (m[1] in B ? B : T) as unknown as Record<string, unknown>;
  const v = mod[m[1]];
  const out = m[2] !== undefined ? (v as Record<string, unknown> | undefined)?.[m[2]] : m[3] !== undefined ? (v as unknown[] | undefined)?.[Number(m[3])] : v;
  return typeof out === 'number' ? out : null;
}

it('avaliação do ajuste', async () => {
  const tune = JSON.parse(env.TUNE ?? '{}') as Record<string, number>;
  const k = Number(env.SEMENTE ?? 0);
  const years = Number(env.ANOS ?? 200);
  const radius = Number(env.RAIO ?? 1);
  const yearSpan = Number(env.YEAR_SPAN ?? YEAR_SECONDS);
  const goals: Goal[] = env.METAS ? JSON.parse(env.METAS) : goalsFrom(LONG_TARGETS);
  const applied: Record<string, number | null> = {};
  for (const name of Object.keys(tune)) applied[name] = seen(name);
  const t0 = performance.now();
  const { indicators } = runWorld(1000 + k * 37, years, radius, yearSpan);
  const { loss, parts } = goalLoss(indicators, goals);
  const result = { seed: k, years, radius, tune, applied, loss, parts, indicators, seconds: (performance.now() - t0) / 1000 };
  // Sem tipos do Node no projeto: o módulo é carregado pelo nome.
  const fsName = 'node:fs';
  const fs = (await import(/* @vite-ignore */ fsName)) as { writeFileSync: (path: string, text: string) => void };
  fs.writeFileSync(env.SAIDA ?? 'ajuste.json', JSON.stringify(result));
});
