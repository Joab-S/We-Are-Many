import type { SurfaceMap } from '../../procgen/surface';
import { restoreEcosystem, snapshotEcosystem } from '../../save/snapshot';
import type { Ecosystem } from '../ecosystem';
import { applyCommand, type EngineCommand } from './commands';
import type { EngineEvent } from './events';
import { RUN_STEP, type RunRequest, type RunResult } from './runSnapshot';

/** Teto do pôr em dia (decisão de 05/11/2026): o que passar disso vira nota na crônica, sem rodar. */
export const CATCH_UP_YEARS = 200;
/** Tempo de máquina que o pôr em dia pode gastar, em ms: quem volta ao planeta não fica esperando. */
export const CATCH_UP_MS = 5000;

/** Anos inteiros que o planeta passou sem ser olhado. Um planeta nunca visto não perdeu nada. */
export function lostYears(now: number, leftAt: number | undefined, yearSeconds: number): number {
  return leftAt === undefined ? 0 : Math.max(0, Math.floor((now - leftAt) / yearSeconds));
}

/** Sem ninguém olhando, nenhum lugar roda as jornadas: é assim que o mundo anda enquanto o jogador está fora. */
export const UNWATCHED: EngineCommand = { kind: 'view', focus: null, pinned: -1 };

/** Quem roda o motor: o Worker, no jogo; nos testes, direto. */
export type Runner = (req: RunRequest, onYear?: (yearsRun: number) => void) => Promise<RunResult>;

export interface CatchUpResult {
  eco: Ecosystem;
  map: SurfaceMap;
  lost: number;
  yearsRun: number;
  /** Anos que passaram sem rodar: o teto de anos ou de tempo de máquina. */
  skipped: number;
  /** Passos que o motor deu: entram na conta do log, para o replay continuar valendo. */
  steps: number;
  /** O comando que anotou a volta, já aplicado: entra no log depois desses passos. */
  note: EngineCommand;
  /** O que aconteceu nesses anos. A fila fica vazia: quem está na tela não recebe a história inteira como novidade. */
  events: EngineEvent[];
}

/**
 * Põe um mundo em dia a partir de um retrato: o mundo de antes fica intacto até o novo chegar. A vista passa a "sem
 * ninguém olhando" e quem chama guarda esse comando no log. Os anos que não rodam não entram no calendário do planeta,
 * porque ninguém sabe o que houve neles: viram uma nota, e `skippedYears` os conta (painel F3). Quem chama guarda no log
 * também a nota (`note`), para o replay chegar ao mesmo mundo.
 */
export async function catchUpWorld(
  eco: Ecosystem,
  map: SurfaceMap,
  seed: number,
  lost: number,
  run: Runner,
  onYear?: (yearsRun: number) => void,
  /** Um pedaço só, em segundo plano: roda até tantos anos, nada é pulado e o resto fica para depois. */
  slice?: number,
): Promise<CatchUpResult> {
  applyCommand(eco, map, UNWATCHED);
  const years = slice ? Math.min(lost, slice) : Math.min(lost, CATCH_UP_YEARS);
  const result = await run({ snapshot: { map, eco: snapshotEcosystem(eco, seed) }, years, budgetMs: CATCH_UP_MS }, onYear);
  const newMap = result.snapshot.map;
  const fresh = restoreEcosystem(result.snapshot.eco, newMap);
  const ran = Math.round(result.yearsRun);
  const note: EngineCommand = slice ? { kind: 'caughtUp', lost: ran, ran, quiet: true } : { kind: 'caughtUp', lost, ran };
  applyCommand(fresh, newMap, note);
  return {
    eco: fresh,
    map: newMap,
    lost,
    yearsRun: result.yearsRun,
    skipped: slice ? 0 : lost - ran,
    note,
    steps: Math.round((result.yearsRun * fresh.yearSpan) / RUN_STEP),
    events: fresh.drainEvents(),
  };
}
