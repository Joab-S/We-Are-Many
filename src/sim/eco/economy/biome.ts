/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): o bioma em volta do assentamento e o que ele rende
 * (REQUISITOS-VIDA.md, "Bioma e sociedade"; a tabela é `BIOME_YIELD`, em src/sim/biomeYield.ts).
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { areaYield, biomeYield, seasonWeight, type AreaYield } from '../../biomeYield';
import { temperatureAt } from '../../../procgen/surface';
import { FREEZE_K } from '../../weather';
import type { Village } from '../types';

export const biomePart = {
  /** Média do bioma na área do lugar: a guardada no ano, ou uma amostra nova (lugar recém-fundado ou save antigo). */
  areaOf(this: Ecosystem, v: Village): AreaYield {
    return (v.area ??= this.sampleArea(v));
  },

  /** Amostra a área de trabalho do lugar (o território, `radius`), sem sorteio. */
  sampleArea(this: Ecosystem, v: Village): AreaYield {
    return areaYield(this.map, v.x, v.y, this.radius(v));
  },

  /** Uma vez por ano: refaz a média do bioma (a mata cortada, a roça aberta e o território que cresceu mudam a área). */
  updateArea(this: Ecosystem, v: Village): void {
    v.area = this.sampleArea(v);
  },

  /** Quanto a roça rende pelo bioma da área (1 = a terra comum); com irrigação, os canais abrem o oásis e o arrozal. */
  farmYield(this: Ecosystem, v: Village): number {
    const a = this.areaOf(v);
    return this.knew(v, 'irrigacao') ? a.irrigated : a.farm;
  },

  /**
   * Peso da estação de agora no lugar para um vetor de estações (`SEASON_HARVEST`, `SEASON_FUEL`): a amplitude
   * cresce com a latitude e com o bioma (`AreaYield.amp`). O ano soma o mesmo; muda só a época.
   */
  seasonWeightOf(this: Ecosystem, v: Village, base: readonly number[]): number {
    return seasonWeight(base, this.season(), this.areaOf(v).amp);
  },

  /** Temperatura de agora no centro do lugar (K): a do clima vivo, com a estação; sem ele, a média do tile. */
  tempNowAt(this: Ecosystem, v: Village): number {
    const t = this.tileAt(v.x, Math.floor(v.y));
    if (t < 0) return 288;
    return this.weatherAt(t)?.temp ?? temperatureAt(this.map, t);
  },

  /**
   * Quanto a comida guardada estraga no lugar, sobre o perecimento de base: a média do bioma (o frio e o seco
   * conservam) e, no inverno gelado, o celeiro que congela (`FROZEN_SPOIL`). É o motivo de armazenar no frio.
   */
  spoilOf(this: Ecosystem, v: Village): number {
    const frozen = this.season() === 3 && this.tempNowAt(v) < FREEZE_K ? B.FROZEN_SPOIL : 1;
    return this.areaOf(v).spoil * frozen;
  },

  /** Cultivo típico do lugar (o do bioma que mais aparece na área). */
  cropOf(this: Ecosystem, v: Village): string {
    return biomeYield(this.areaOf(v).main).crop;
  },
};
export type BiomePart = typeof biomePart;
