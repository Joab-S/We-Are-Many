/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): o bioma em volta do assentamento e o que ele rende
 * (REQUISITOS-VIDA.md, "Bioma e sociedade"; a tabela é `BIOME_YIELD`, em src/sim/biomeYield.ts).
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import { areaYield, biomeYield, type AreaYield } from '../../biomeYield';
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

  /** Cultivo típico do lugar (o do bioma que mais aparece na área). */
  cropOf(this: Ecosystem, v: Village): string {
    return biomeYield(this.areaOf(v).main).crop;
  },
};
export type BiomePart = typeof biomePart;
