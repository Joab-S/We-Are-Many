/**
 * Gancho da vista de depuração no Ecosystem (a vista mora em src/sim/api/debugView.ts). Com a gravação ligada, o
 * motor marca o fim de cada parte do passo (`lap`) e entrega cada decisão de mudança das famílias (`decision`);
 * desligada, o campo `probe` do Ecosystem é null e cada ponto custa um teste. O gancho só lê e anota fora do mundo:
 * nada dele volta para a simulação (o tempo medido nunca entra numa conta), e ele não vai no save nem na impressão
 * digital (o campo não é enumerável).
 */

import type { Choice } from '../../../IAUS/npc/mundo/decisor';
import type { MoveAction } from '../../../IAUS/npc/mundo/mudanca';
import type { Village } from '../types';

/** Partes do passo (`Ecosystem.step` e o fim do ano de ação, `yearly`), na ordem em que rodam. */
export const STEP_PARTS = [
  'vista (modo completo)',
  'clima vivo',
  'fogo natural',
  'grade espacial',
  'criaturas (andar e decidir)',
  'fauna (células)',
  'campo de sítios',
  'barcos e jangadas',
  'caravanas',
  'vegetação',
  'efeitos',
  'assentamentos',
  'ano: clima, relações e ruas',
  'ano: economia',
  'ano: migração',
  'ano: epidemias, diplomacia e mundo',
] as const;

/** Índice de cada parte em `STEP_PARTS`. */
export const STEP = {
  view: 0,
  weather: 1,
  fire: 2,
  grid: 3,
  creatures: 4,
  wildlife: 5,
  sites: 6,
  boats: 7,
  caravans: 8,
  vegetation: 9,
  effects: 10,
  villages: 11,
  yearWorld: 12,
  yearEconomy: 13,
  yearMigration: 14,
  yearRest: 15,
} as const;

/** Um sítio que os batedores viram para a família fundar. */
export interface ProbeSite {
  x: number;
  y: number;
  value: number;
}

export interface EcoProbe {
  /** Começo de um passo: zera a marca do tempo. */
  begin(): void;
  /** Uma parte do passo terminou: o tempo desde a marca anterior vai para ela (índice em `STEP_PARTS`). */
  lap(part: number): void;
  /**
   * A família `members` de `v` decidiu se fica, migra ou funda (`thinkMove`): os adultos que decidiram, se era
   * êxodo, a escolha com as notas e os fatores, os sítios das opções de fundar e o porquê do diário (`moveWhy`).
   */
  decision(v: Village, members: readonly number[], adults: readonly number[], exodus: boolean, choice: Choice<MoveAction>, sites: readonly ProbeSite[], why: string): void;
}
