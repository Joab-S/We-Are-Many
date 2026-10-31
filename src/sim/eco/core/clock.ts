/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): os dois relógios da simulação.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 *
 * O laço do jogo (Game Loop, Game Programming Patterns) tem DE PROPÓSITO dois anos diferentes:
 *
 * - **Ano de ação**: `YEAR_SECONDS` (6 s de simulação), contado em `yearClock`. É o ritmo do que acontece
 *   por taxa: produção, consumo, obras, colheita e a estação da economia (`actionPhase`), barcos, caravanas,
 *   guerra, e o fim de ano de `yearly()` (migração, economia anual, epidemias, diplomacia, florestas, lava,
 *   ruínas e eventos do mundo). Os bichos aquáticos e a vegetação também vivem nele (`actionScale`), porque
 *   foram calibrados assim.
 * - **Ano de calendário**: `yearSpan` segundos, contado em `year`. É o ano que a tela mostra: idade,
 *   nascimentos e mortes das pessoas, a fase do ano (`yearPhase`: clima, cio e hibernação da fauna), as
 *   decisões dos bichos de terra (DECISIONS_PER_YEAR por ano de calendário) e o fogo natural do verão.
 *
 * Na calibração e nos testes os dois coincidem (`yearSpan` = `YEAR_SECONDS`). No jogo, `yearSpan` = 12 s
 * (`REAL_YEAR_SECONDS`, src/client/surface/tools.ts): o ano dura mais na tela sem desacelerar ações e
 * eventos, então cabem dois anos de ação em cada ano exibido. As compensações dessa diferença ficam aqui:
 * `eraPace` (as eras andam 1,5x mais depressa por segundo, para a era por ano exibido não cair à metade),
 * `closesCalendarYear` (o balanço do ano fecha uma vez por ano exibido, não a cada ano de ação) e
 * `actionScale` (aquáticos e vegetação no ano de ação).
 */

import type { Ecosystem } from '../../ecosystem';
import * as constantsModule from '../constants';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { YEAR_SECONDS } = constantsModule;

export const clockPart = {
  /** Fase (0 a 1) do ano de ação em curso: estação da colheita, do consumo e da espera das caravanas. */
  actionPhase(this: Ecosystem): number {
    return this.yearClock / YEAR_SECONDS;
  },

  /**
   * Fator que leva segundos de simulação ao ano de ação (`YEAR_SECONDS / yearSpan`): 1 na calibração,
   * 0,5 no jogo. Aquáticos e vegetação andam `dt * actionScale()`, no tempo em que foram calibrados.
   */
  actionScale(this: Ecosystem): number {
    return YEAR_SECONDS / this.yearSpan;
  },

  /** Ritmo das eras por segundo: 1,5x quando o ano exibido é mais longo que o de ação (a era por ano exibido não cai à metade). */
  eraPace(this: Ecosystem): number {
    return this.yearSpan > YEAR_SECONDS ? 1.5 : 1;
  },

  /**
   * O balanço anual de um lugar (livro-caixa, nascimentos e mortes, histórico) fecha neste fim de ano de
   * ação? Com os relógios iguais, sempre; no jogo, só quando o ano exibido virou desde o último fechamento
   * (`lastYear`), para o painel mostrar um ano de calendário por linha.
   */
  closesCalendarYear(this: Ecosystem, lastYear: number): boolean {
    return this.yearSpan <= YEAR_SECONDS || Math.floor(this.year) > lastYear;
  },

  /** Avança o relógio de ação `dt` segundos; devolve se um ano de ação fechou (hora do `yearly()`). */
  tickActionYear(this: Ecosystem, dt: number): boolean {
    this.yearClock += dt;
    if (this.yearClock < YEAR_SECONDS) return false;
    this.yearClock = 0;
    return true;
  },
};
export type ClockPart = typeof clockPart;
