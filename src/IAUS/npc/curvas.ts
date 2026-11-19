/**
 * Curvas de resposta das pessoas, com nomes do que elas querem dizer. Todas são Response Curves do IAUS
 * (src/IAUS/responseCurve.ts); aqui só ganham nome e uma faixa de entrada quando o valor bruto não vai de 0 a 1.
 */
import { CurveType } from '../enums';
import type { ResponseCurveDef } from '../responseCurve';

export interface Curva {
  curve: ResponseCurveDef;
  /** Valor bruto que vira x = 0 (RangeMin). */
  min?: number;
  /** Valor bruto que vira x = 1 (RangeMax). */
  max?: number;
}

export const curva = {
  /** Reta de `lo` (x = 0) a `hi` (x = 1). */
  sobe: (lo = 0, hi = 1): Curva => ({ curve: { type: CurveType.Linear, m: hi - lo, b: lo } }),
  /** Reta de `hi` (x = 0) a `lo` (x = 1). */
  desce: (hi = 1, lo = 0): Curva => ({ curve: { type: CurveType.Linear, m: lo - hi, b: hi } }),
  /** Em S: quase nada antes de `meio`, quase tudo depois. */
  limiar: (meio = 0.5, k = 10): Curva => ({ curve: { type: CurveType.Logistic, m: k, k: 1, b: 0, c: meio } }),
  /** Em S invertido: quase tudo antes de `meio`, quase nada depois. */
  limiarInv: (meio = 0.5, k = 10): Curva => ({ curve: { type: CurveType.Logistic, m: -k, k: 1, b: 0, c: meio } }),
  /** Sobe devagar e acelera (k > 1), ou sobe rápido e satura (k < 1), de `lo` a 1. */
  acelera: (k = 2, lo = 0): Curva => ({ curve: { type: CurveType.Polynomial, m: 1 - lo, k, b: lo } }),
  /** Cai devagar e despenca no fim, de 1 a `lo`. */
  despenca: (k = 2, lo = 0): Curva => ({ curve: { type: CurveType.Polynomial, m: -(1 - lo), k, b: 1 } }),
  /** Lombada: melhor perto de `centro`, pior longe (largura `w`). */
  lombada: (centro = 0.5, w = 0.2, piso = 0): Curva => ({ curve: { type: CurveType.Normal, m: w, k: 1 - piso, b: piso, c: centro } }),
  /** Booleano: vale 1 com sim, `piso` com não. */
  sim: (piso = 0): Curva => ({ curve: { type: CurveType.Linear, m: 1 - piso, b: piso } }),
  /** Booleano: vale 1 com não, `piso` com sim. */
  nao: (piso = 0): Curva => ({ curve: { type: CurveType.Linear, m: piso - 1, b: 1 } }),
  /**
   * Traço de −1 a 1 vira um fator: `(1 − força)/(1 + força)` na ponta de baixo e 1 na de cima. Com força
   * negativa, o contrário (o traço atrapalha). Com `faixa` > 1, a entrada vai de −faixa a faixa (uma soma de
   * traços) e o fator é `(1 + força × valor)/(1 + força)`, cortado em 0 e 1.
   */
  traco: (forca = 0.5, faixa = 1): Curva => {
    const f = Math.abs(forca);
    const m = (2 * faixa * f) / (1 + f);
    const b = (1 - faixa * f) / (1 + f);
    return forca >= 0 ? { curve: { type: CurveType.Linear, m, b }, min: -faixa, max: faixa } : { curve: { type: CurveType.Linear, m: -m, b: b + m }, min: -faixa, max: faixa };
  },
  /** Distância: perto vale 1, `longe` tiles (ou mais) vale `piso`. */
  perto: (longe = 20, piso = 0.1): Curva => ({ curve: { type: CurveType.Polynomial, m: -(1 - piso), k: 1.5, b: 1 }, min: 0, max: longe }),
  /** Valor bruto de `min` a `max` numa reta de `lo` a `hi`. */
  faixa: (min: number, max: number, lo = 0, hi = 1): Curva => ({ curve: { type: CurveType.Linear, m: hi - lo, b: lo }, min, max }),
  /** Constante (para o peso base de um comportamento sem condição). */
  sempre: (v = 1): Curva => ({ curve: { type: CurveType.Linear, m: 0, b: v } }),
};
