/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): o bioma em volta do assentamento e o que ele rende
 * (REQUISITOS-VIDA.md, "Bioma e sociedade"; a tabela é `BIOME_YIELD`, em src/sim/biomeYield.ts).
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { areaYield, biomeYield, densityOf, lifewayFor, lifewayReach, seasonWeight, type AreaYield, type Lifeway } from '../../biomeYield';
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

  /** A roça que a terra da área dá (1 = a terra comum); com irrigação, os canais abrem o oásis e o arrozal. */
  landFarm(this: Ecosystem, v: Village): number {
    const a = this.areaOf(v);
    return this.knew(v, 'irrigacao') ? a.irrigated : a.farm;
  },

  /** Quanto a roça rende no lugar: a terra da área (`landFarm`) e, no modo intensivo, o adubo, a rotação e os canteiros. */
  farmYield(this: Ecosystem, v: Village): number {
    return this.landFarm(v) * (this.lifewayOf(v) === 'intensivo' ? B.INTENSIVE_YIELD : 1);
  },

  // Modo de vida --------------------------------------------------------------------------------

  /** Modo de vida do lugar (getter simples: a nota do sítio e a captação leem daqui). */
  lifewayOf(this: Ecosystem, v: Village): Lifeway {
    return v.lifeway ?? 'sedentario';
  },

  /** Alcance relativo da captação do lugar pelo modo de vida (1 sedentário; o nômade anda mais, o intensivo trabalha perto). */
  catchmentOf(this: Ecosystem, v: Village): number {
    return lifewayReach(this.lifewayOf(v));
  },

  /**
   * Braços a mais em cada roça (Boserup): o intensivo trabalha cada roça com 1 + INTENSIVE_HANDS vezes a gente
   * (`fieldHands`), sem desenhar menos roças no mapa.
   */
  intensity(this: Ecosystem, v: Village): number {
    return this.lifewayOf(v) === 'intensivo' ? 1 + B.INTENSIVE_HANDS : 1;
  },

  /** O lugar planta? O nômade não: vive da coleta, da caça e do rebanho, e muda o acampamento. */
  plants(this: Ecosystem, v: Village): boolean {
    return this.lifewayOf(v) !== 'nomade';
  },

  /**
   * Uma vez por ano, depois da área: o modo de vida pelo bioma (a roça que a área dá), pela técnica e pela
   * densidade. A mudança vai para a crônica.
   */
  updateLifeway(this: Ecosystem, v: Village): void {
    const was = this.lifewayOf(v);
    const now = lifewayFor({ farm: this.landFarm(v), density: densityOf(v.population, this.radius(v)), techs: this.knows(v), now: was });
    v.lifeway = now;
    if (now === was) return;
    const text =
      now === 'nomade'
        ? `${v.name} largou as roças e passou a viver da coleta, da caça e do pasto, mudando o acampamento`
        : now === 'intensivo'
          ? `${v.name} intensificou a lavoura: mais braços em cada roça`
          : was === 'nomade'
            ? `${v.name} se fixou na terra e abriu roças`
            : `${v.name} voltou a lavrar a terra como antes`;
    this.note(text, 'economia', v, { key: `lifeway-${v.id}` });
  },

  /**
   * Coleta esgotada (só para o nômade), de 0 a 1: a vegetação da área abaixo de `NOMAD_FORAGE` do que ela
   * aguenta. Entra na falta do lugar (`scarcity`), e as famílias mudam o acampamento pelo caminho de sempre
   * (migração, êxodo e última leva).
   */
  forageLack(this: Ecosystem, v: Village): number {
    if (this.lifewayOf(v) !== 'nomade') return 0;
    return Math.max(0, B.NOMAD_FORAGE - this.areaOf(v).forage) / B.NOMAD_FORAGE;
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
