// responseCurve.ts — converte um x normalizado (0..1) em uma utilidade (0..1).
//
// Parâmetros (mesmos nomes do manual):
//   m — inclinação / largura      k — expoente / altura
//   b — deslocamento vertical     c — deslocamento horizontal
//
// O manual só dá explicitamente o padrão y = mx + b. As fórmulas abaixo são
// definições minhas, coerentes com o significado de cada parâmetro no manual
// e com as funções do Cap. 10 do livro. O resultado é sempre limitado a 0..1.

import { CurveType } from './enums';
import { clamp01 } from './math';

export interface ResponseCurveDef {
  type: CurveType;
  m?: number;
  k?: number;
  b?: number;
  c?: number;
}

const EPS = 1e-6;

/** Potência que preserva o sinal (evita NaN com base negativa e expoente fracionário). */
const signedPow = (base: number, exp: number): number =>
  Math.sign(base) * Math.pow(Math.abs(base), exp);

export class ResponseCurve {
  readonly type: CurveType;
  readonly m: number;
  readonly k: number;
  readonly b: number;
  readonly c: number;

  constructor(def: ResponseCurveDef) {
    this.type = def.type;
    // Padrões que dão curvas úteis "de fábrica".
    switch (def.type) {
      case CurveType.Logistic:
        this.m = def.m ?? 10;
        this.k = def.k ?? 1;
        this.b = def.b ?? 0;
        this.c = def.c ?? 0.5;
        break;
      case CurveType.Logit:
        this.m = def.m ?? 5;
        this.k = def.k ?? 1;
        this.b = def.b ?? 0;
        this.c = def.c ?? 0;
        break;
      case CurveType.Normal:
        this.m = def.m ?? 0.2;
        this.k = def.k ?? 1;
        this.b = def.b ?? 0;
        this.c = def.c ?? 0.5;
        break;
      case CurveType.Sine:
        this.m = def.m ?? 1;
        this.k = def.k ?? 1;
        this.b = def.b ?? 0;
        this.c = def.c ?? 0;
        break;
      default: // Linear / Polynomial
        this.m = def.m ?? 1;
        this.k = def.k ?? 1;
        this.b = def.b ?? 0;
        this.c = def.c ?? 0;
    }
  }

  /** x deve estar em 0..1 (a Consideration já normaliza). */
  evaluate(xIn: number): number {
    const x = clamp01(xIn);
    const { m, k, b, c } = this;
    let y: number;
    switch (this.type) {
      case CurveType.Linear:
        // y = m(x − c) + b
        y = m * (x - c) + b;
        break;
      case CurveType.Polynomial:
        // y = m(x − c)^k + b
        y = m * signedPow(x - c, k) + b;
        break;
      case CurveType.Logistic:
        // S suave: y = k / (1 + e^(−m(x − c))) + b
        y = k / (1 + Math.exp(-m * (x - c))) + b;
        break;
      case CurveType.Logit: {
        // Inversa da logística: y = 0.5 + k·ln(p / (1 − p)) / (2m) + b, p = x − c
        const p = Math.min(1 - EPS, Math.max(EPS, x - c));
        y = 0.5 + (k * Math.log(p / (1 - p))) / (2 * m) + b;
        break;
      }
      case CurveType.Normal:
        // "Lombada" gaussiana: y = k·e^(−(x − c)² / (2m²)) + b
        y = k * Math.exp(-((x - c) * (x - c)) / (2 * m * m)) + b;
        break;
      case CurveType.Sine:
        // y = 0.5 + 0.5·k·sin(2π·m·(x − c)) + b
        y = 0.5 + 0.5 * k * Math.sin(2 * Math.PI * m * (x - c)) + b;
        break;
      default:
        y = 0;
    }
    return clamp01(y);
  }

  // ---- Atalhos para as curvas mais usadas ----

  /** 0 → 0, 1 → 1. */
  static linear(): ResponseCurve {
    return new ResponseCurve({ type: CurveType.Linear, m: 1, b: 0 });
  }
  /** 0 → 1, 1 → 0. */
  static inverseLinear(): ResponseCurve {
    return new ResponseCurve({ type: CurveType.Linear, m: -1, b: 1 });
  }
  /** Booleano onde verdadeiro (1) = 1. Pontos [0,0] e [1,1]. */
  static boolTrue(): ResponseCurve {
    return ResponseCurve.linear();
  }
  /** Booleano onde falso (0) = 1. Pontos [0,1] e [1,0]. */
  static boolFalse(): ResponseCurve {
    return ResponseCurve.inverseLinear();
  }
  /** Sobe devagar e acelera no fim (utilidade marginal crescente). */
  static quadratic(k = 2): ResponseCurve {
    return new ResponseCurve({ type: CurveType.Polynomial, m: 1, k });
  }
  /** Cai devagar e despenca no fim: y = 1 − x^k. */
  static inverseQuadratic(k = 2): ResponseCurve {
    return new ResponseCurve({ type: CurveType.Polynomial, m: -1, k, b: 1 });
  }
  /** Limiar suave centrado em c. */
  static logistic(center = 0.5, steepness = 10): ResponseCurve {
    return new ResponseCurve({ type: CurveType.Logistic, m: steepness, c: center });
  }
  /** Limiar suave invertido (alto antes de c, baixo depois). */
  static inverseLogistic(center = 0.5, steepness = 10): ResponseCurve {
    return new ResponseCurve({ type: CurveType.Logistic, m: -steepness, c: center });
  }
}
