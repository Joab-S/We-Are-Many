/**
 * O chão do laboratório da sociedade: um mapa pequeno com água, mata, pedra, campo e terra boa, gerado de uma
 * semente. É só o bastante para as pessoas terem onde achar água, comida e material.
 */
import { SeededRng } from '../../IAUS/math';

export const CHAO = { agua: 0, campo: 1, mata: 2, pedra: 3, fertil: 4 } as const;
export type Chao = (typeof CHAO)[keyof typeof CHAO];

export interface Terreno {
  w: number;
  h: number;
  chao: Uint8Array;
  /** Clima de 0 (ruim) a 1 (bom), por tile. */
  clima: Float32Array;
}

/** Ruído de valor suave (interpolado), de 0 a 1. */
function ruido(w: number, h: number, escala: number, rng: SeededRng): Float32Array {
  const gw = Math.ceil(w / escala) + 2;
  const gh = Math.ceil(h / escala) + 2;
  const g = new Float32Array(gw * gh);
  for (let k = 0; k < g.length; k++) g[k] = rng.next();
  const out = new Float32Array(w * h);
  const s = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fx = x / escala;
      const fy = y / escala;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = s(fx - x0);
      const ty = s(fy - y0);
      const a = g[y0 * gw + x0];
      const b = g[y0 * gw + x0 + 1];
      const c = g[(y0 + 1) * gw + x0];
      const d = g[(y0 + 1) * gw + x0 + 1];
      out[y * w + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  }
  return out;
}

/** Gera o terreno: um lago ou rio, manchas de mata e de pedra, campo e terra boa perto da água. */
export function gerarTerreno(w: number, h: number, semente: number): Terreno {
  const rng = new SeededRng(semente ^ 0x5bd1e995);
  const altura = ruido(w, h, 14, rng);
  const mata = ruido(w, h, 7, rng);
  const pedra = ruido(w, h, 9, rng);
  const chao = new Uint8Array(w * h);
  const clima = new Float32Array(w * h);
  // Um rio que corta o mapa de cima a baixo, serpenteando.
  const rioX = w * (0.3 + rng.next() * 0.4);
  const fase = rng.next() * Math.PI * 2;
  for (let y = 0; y < h; y++) {
    const cx = rioX + Math.sin(y / 9 + fase) * 6;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const rio = Math.abs(x - cx) < 1.6;
      const lago = altura[i] < 0.18;
      clima[i] = 0.55 + 0.4 * (1 - Math.abs(y / h - 0.5) * 2) - (altura[i] > 0.85 ? 0.3 : 0);
      if (rio || lago) chao[i] = CHAO.agua;
      else if (pedra[i] > 0.74) chao[i] = CHAO.pedra;
      else if (mata[i] > 0.58) chao[i] = CHAO.mata;
      else chao[i] = CHAO.campo;
    }
  }
  // Terra boa: campo a até 4 tiles da água.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (chao[i] !== CHAO.campo) continue;
      let perto = false;
      for (let dy = -4; dy <= 4 && !perto; dy++) {
        for (let dx = -4; dx <= 4 && !perto; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && chao[yy * w + xx] === CHAO.agua) perto = true;
        }
      }
      if (perto && mata[i] < 0.5) chao[i] = CHAO.fertil;
    }
  }
  return { w, h, chao, clima };
}

export const ehAgua = (t: Terreno, x: number, y: number): boolean => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  return xi < 0 || yi < 0 || xi >= t.w || yi >= t.h || t.chao[yi * t.w + xi] === CHAO.agua;
};
