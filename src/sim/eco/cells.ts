/** Células ecológicas (EcoCells): comida, nicho, contagem e capacidade de suporte por célula. */

import { ECO_CELL, REGROW_YEAR } from '../fauna';

/**
 * Células ecológicas (ECO_CELL×ECO_CELL tiles): comida, nicho de cada espécie,
 * contagem e capacidade de suporte. São contas derivadas do mapa e dos bichos,
 * refeitas aos poucos e nunca salvas (ficam num WeakMap fora do save).
 */
export class EcoCells {
  readonly cols: number;
  readonly rows: number;
  readonly n: number;
  stride = 0;
  /** Tiles de terra, pasto disponível agora (média 0 a 1), insetos (média) e costa rasa (fração). */
  readonly land: Float32Array;
  readonly forage: Float32Array;
  readonly bugs: Float32Array;
  readonly shore: Float32Array;
  /** Ramagem e fruto da mata disponíveis agora (média 0 a 1 na terra) e a soma da parte lenhosa dos tiles. */
  readonly browse: Float32Array;
  readonly wood: Float32Array;
  /** Fração da ramagem já comida e quando (rebrota como o pasto), por célula. */
  readonly bused: Float32Array;
  readonly busedAt: Float32Array;
  /** Do clima vivo, refeitos com a célula: ramagem por tile lenhoso na estação, rebrota do pasto (por ano)
   * e quanto do pasto a neve deixa à vista. */
  readonly bseason: Float32Array;
  readonly regrow: Float32Array;
  readonly cover: Float32Array;
  /** Produção por ano, em tanques de energia: pasto, insetos e comida da costa. */
  readonly fprod: Float32Array;
  readonly bprod: Float32Array;
  readonly iprod: Float32Array;
  readonly wprod: Float32Array;
  /** Ração de todas as presas da célula (para a capacidade dos predadores). */
  readonly prey: Float32Array;
  /** Caçadores por célula (na última recontagem): a presa só procura ameaça onde há algum. */
  readonly hunters: Uint16Array;
  suit = new Float32Array(0);
  K = new Float32Array(0);
  N = new Uint16Array(0);
  /** Lotação da área de vida (N/K em volta), calculada sob demanda e esquecida a cada recontagem (-1 = por calcular). */
  dens = new Float32Array(0);
  /** Soma de K por espécie no planeta. */
  total: number[] = [];
  /** Centro de cada bando (família): x de referência, soma dos desvios em x, soma de y e quantos. */
  readonly herds = new Map<number, [number, number, number, number]>();
  /** Espécie de cada bando (para o território dos predadores). */
  readonly herdKind = new Map<number, number>();
  cursor = 0;
  /** Voltas completas do refresco (o nicho é refeito numa de cada quatro). */
  passes = 0;
  recounts = 0;
  ready = false;

  constructor(width: number, height: number) {
    this.cols = Math.ceil(width / ECO_CELL);
    this.rows = Math.ceil(height / ECO_CELL);
    this.n = this.cols * this.rows;
    this.land = new Float32Array(this.n);
    this.forage = new Float32Array(this.n);
    this.bugs = new Float32Array(this.n);
    this.shore = new Float32Array(this.n);
    this.browse = new Float32Array(this.n);
    this.wood = new Float32Array(this.n);
    this.bused = new Float32Array(this.n);
    this.busedAt = new Float32Array(this.n);
    this.bseason = new Float32Array(this.n).fill(0.5);
    this.regrow = new Float32Array(this.n).fill(REGROW_YEAR);
    this.cover = new Float32Array(this.n).fill(1);
    this.fprod = new Float32Array(this.n);
    this.bprod = new Float32Array(this.n);
    this.iprod = new Float32Array(this.n);
    this.wprod = new Float32Array(this.n);
    this.prey = new Float32Array(this.n);
    this.hunters = new Uint16Array(this.n);
  }

  resize(species: number): void {
    this.stride = species;
    this.suit = new Float32Array(this.n * species);
    this.K = new Float32Array(this.n * species);
    this.N = new Uint16Array(this.n * species);
    this.dens = new Float32Array(this.n * species).fill(-1);
    this.total = new Array(species).fill(0);
    this.ready = false;
  }

  /** Célula de uma posição (com a volta horizontal do mapa). */
  of(x: number, y: number, width: number): number {
    const cx = Math.floor((((x % width) + width) % width) / ECO_CELL);
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / ECO_CELL)));
    return cy * this.cols + cx;
  }
}
