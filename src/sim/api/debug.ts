import type { Lifeway } from '../biomeYield';

/**
 * Vista de depuração do motor (`engine.debug`): o que o painel de depuração do cliente (`?debug`, F3) mostra
 * para entender o que a simulação está fazendo. Mesmo contrato da fachada: dados puros (vão por `postMessage`
 * quando o motor for para um Worker), só leitura, e nada daqui sorteia ou muda o mundo. A única chave é
 * `setRecording`, que liga a gravação das decisões e a medição do passo: desligada, custa zero e a simulação
 * é exatamente a mesma (a impressão digital do mundo não muda com ela ligada ou desligada).
 *
 * Este módulo só tem tipos e constantes; a implementação mora em debugView.ts (a fachada, engine.ts, só a liga).
 */

/** Uma meta da calibração longa (`LONG_TARGETS`), como o painel a mostra. */
export interface DebugTarget {
  key: string;
  label: string;
  min: number;
  /** 99999 na calibração quer dizer sem teto; aqui vem `Infinity`. */
  max: number;
}

/** Os indicadores dos assentamentos medidos no mundo vivo, num ano. */
export interface IndicatorSample {
  year: number;
  /** Chave de `Indicators` (src/sim/calibrate.ts) → valor. Só os que fazem sentido no mundo vivo. */
  values: Record<string, number>;
}

export interface WorldDebug {
  /** Semente do mundo e ano agora (com fração). */
  seed: number;
  year: number;
  /** Ano desde o qual as taxas contam (o começo do mundo, ou o ano em que o save foi carregado). */
  since: number;
  /** Os indicadores de agora e as metas da calibração longa que têm indicador no mundo vivo. */
  now: IndicatorSample;
  targets: DebugTarget[];
  /** Uma amostra por ano de jogo com a gravação ligada, as últimas `DEBUG_SERIES_LIMIT`, da mais velha para a mais nova. */
  series: IndicatorSample[];
}

/** Um fator de uma nota (consideração da IA de utilidade, ou parte de uma conta). */
export interface DebugFactor {
  name: string;
  value: number;
}

/** Uma opção avaliada numa decisão: o rótulo legível, a nota e os fatores, do que mais puxou para baixo ao que menos. */
export interface DebugOption {
  label: string;
  score: number;
  factors: DebugFactor[];
}

/** Uma decisão de mudança de uma família (IA de quando sair, src/ai/decisions/move.ts): ficar, migrar ou fundar. */
export interface FamilyDecision {
  /** Ano da decisão, o lugar onde a família morava e a família (o `family` das criaturas na vista). */
  year: number;
  village: number;
  family: number;
  /** Adultos que decidiram (a família decide pela média deles). */
  adults: number;
  /** Era êxodo (anos de falta: ficar perde o costume e a histerese). */
  exodus: boolean;
  picked: DebugOption;
  /** As outras opções avaliadas, da melhor para a pior. */
  others: DebugOption[];
  /** O porquê em uma linha, como no diário (`moveWhy`). */
  why: string;
}

/** O estado de um assentamento que a janela do jogo não mostra: pressão, cerco, modo de vida, era, bioma e falta. */
export interface PlaceDebug {
  id: number;
  name: string;
  population: number;
  /** Ano de fundação e idade em anos. */
  founded: number;
  age: number;
  lifeway: Lifeway;
  /**
   * Pressão do ano: social ((pop/DUNBAR)² / (1 + instituições)), da terra, a soma, e os limiares: a partir de
   * `scout` os batedores procuram sítio, a partir de `fission` o lugar se divide (ou fica cercado sem sítio).
   */
  pressure: { social: number; land: number; total: number; scout: number; fission: number };
  /** Anos seguidos cercado (pressão acima da fissão sem sítio livre); 0 quando não está. */
  circumscribed: number;
  /** Era (0 = Pedra) com fração, o nome, e o que falta para a próxima (null quando nada trava). */
  era: { tech: number; name: string; blocked: string | null };
  /** Raio da captação (tiles) e o rendimento médio do bioma na área, por parte (roça, pasto, pesca, lenha...). */
  catchment: number;
  area: DebugFactor[];
  /** Atendimento das necessidades (0 a 1, por nome legível) e estabilidade. */
  needs: DebugFactor[];
  stability: number;
  /** O que falta agora (nome legível) e há quantos anos seguidos; null quando nada falta. */
  lack: { what: string; years: number } | null;
  /** Taxas por ano (as do `?debug` da ficha: nascimentos, mortes, chegadas...). */
  rates: DebugFactor[];
  /** Nota do sítio onde o lugar está, pela regra de hoje (`siteAt` no centro), ou null sem campo. */
  site: number | null;
}

/** Tempo do passo por parte, para achar o que pesa. */
export interface ProfileDebug {
  /** Passos medidos e o tempo médio por passo (ms). */
  steps: number;
  msPerStep: number;
  /** Tempo médio por passo (ms) de cada parte do `Ecosystem.step`, da mais cara para a mais barata. */
  parts: DebugFactor[];
}

export interface DebugView {
  /** Liga ou desliga a gravação das decisões, a série dos indicadores e a medição do passo (começa desligada). */
  setRecording(on: boolean): void;
  readonly recording: boolean;
  world(): WorldDebug;
  /** O assentamento `id` (vivo ou abandonado), ou null se não existe. */
  place(id: number): PlaceDebug | null;
  /**
   * Últimas decisões de mudança gravadas, das mais novas para as mais velhas (no máximo `DEBUG_DECISION_LIMIT` no
   * motor): todas, só as de um lugar, ou só as de uma família; `limit` corta a lista.
   */
  decisions(filter?: { village?: number; family?: number; limit?: number }): FamilyDecision[];
  /** Medição do passo desde que a gravação ligou; null com ela desligada. */
  profile(): ProfileDebug | null;
  /**
   * Impressão digital do mundo agora (`worldFingerprint`): a mesma semente e o mesmo log, no mesmo passo, dão o mesmo
   * valor. Varre o mundo inteiro (dezenas de ms na Terra), então não é para chamar a cada quadro.
   */
  fingerprint(): string;
}

/** Amostras da série dos indicadores guardadas (uma por ano de jogo). */
export const DEBUG_SERIES_LIMIT = 300;
/** Decisões de mudança guardadas no motor (anel: as mais velhas saem). */
export const DEBUG_DECISION_LIMIT = 1000;

/** A vista vazia: o que o painel recebe enquanto o motor não implementa a sua (e em testes do cliente). */
export const EMPTY_DEBUG: DebugView = {
  setRecording() {},
  recording: false,
  world: () => ({ seed: 0, year: 0, since: 0, now: { year: 0, values: {} }, targets: [], series: [] }),
  place: () => null,
  decisions: () => [],
  profile: () => null,
  fingerprint: () => '',
};
