import { mulberry32 } from '../core/rng';
import { CoarseField, type PerlinNoise3 } from './noise';

/**
 * Etapas 1 e 2 do gerador: placas tectônicas (Voronoi com pesos e bordas
 * tortas) e a elevação que nasce da interação entre elas. Tudo é calculado em
 * coordenadas do mapa completo, ponto a ponto, então qualquer resolução (o
 * mapa da superfície ou a textura menor do 3D) mostra as mesmas placas.
 */

export enum Boundary {
  None,
  /** Duas placas continentais se chocando: cordilheira alta. */
  Convergent,
  /** Uma placa oceânica afunda sob outra: fossa e arco vulcânico. */
  Subduction,
  /** Placas se afastando: dorsal oceânica ou rift continental. */
  Divergent,
  /** Placas deslizando de lado: pouco relevo, muita tensão. */
  Transform,
}

export const BOUNDARY_NAMES: Record<Boundary, string> = {
  [Boundary.None]: 'interior de placa',
  [Boundary.Convergent]: 'limite convergente',
  [Boundary.Subduction]: 'zona de subducção',
  [Boundary.Divergent]: 'limite divergente',
  [Boundary.Transform]: 'falha transformante',
};

export interface Plate {
  /** Semente do Voronoi, em pixels do mapa completo. */
  x: number;
  y: number;
  /** Peso do diagrama de potência: placas de tamanhos diferentes. */
  weight: number;
  /** Direção e velocidade (até 1). */
  vx: number;
  vy: number;
  /** Continental (crosta grossa e alta) ou oceânica (fina e baixa). */
  continental: boolean;
  /** Na colisão de duas oceânicas, a mais densa afunda. */
  density: number;
}

/** Saída das etapas 1 e 2, por tile. */
export interface TectonicField {
  plates: Plate[];
  plate: Uint8Array;
  boundary: Uint8Array;
  /** Tensão sísmica (0..255): onde os terremotos nascem e com que força. */
  stress: Uint8Array;
  /** Altitude bruta (antes do nível do mar). */
  raw: Float32Array;
}

/** Número de placas pelo tamanho do planeta: a Terra fica com 14. */
export function plateCount(fullWidth: number): number {
  return Math.max(7, Math.min(24, Math.round(6 + fullWidth / 128)));
}

const wrapDx = (dx: number, w: number) => (dx > w / 2 ? dx - w : dx < -w / 2 ? dx + w : dx);

/**
 * Sorteia as placas: sementes espalhadas (distância mínima entre elas),
 * pesos para variar o tamanho, um vetor de movimento e o tipo. As
 * continentais são escolhidas até cobrir mais ou menos a fração de terra.
 */
export function makePlates(seed: number, width: number, height: number, water: number): Plate[] {
  const rnd = mulberry32(seed);
  const count = plateCount(width);
  const spacing = Math.sqrt((width * height) / count);
  const plates: Plate[] = [];
  for (let tries = 0; plates.length < count && tries < count * 200; tries++) {
    const x = rnd() * width;
    const y = height * (0.04 + rnd() * 0.92);
    const minD = spacing * (tries < count * 100 ? 0.62 : 0.3);
    if (plates.some((p) => Math.hypot(wrapDx(x - p.x, width), y - p.y) < minD)) continue;
    const a = rnd() * Math.PI * 2;
    const speed = 0.35 + rnd() * 0.65;
    plates.push({ x, y, weight: (rnd() * 0.55) ** 2 * spacing * spacing, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, continental: false, density: rnd() });
  }

  // Área de cada placa numa grade grossa (sem o desvio das bordas: só para escolher os tipos).
  const area = new Float64Array(plates.length);
  const gw = 128;
  const gh = 64;
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const px = ((gx + 0.5) / gw) * width;
      const py = ((gy + 0.5) / gh) * height;
      let best = 0;
      let bd = Infinity;
      for (let k = 0; k < plates.length; k++) {
        const p = plates[k];
        const dx = wrapDx(px - p.x, width);
        const dy = py - p.y;
        const d = dx * dx + dy * dy - p.weight;
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
      area[best] += 1 / (gw * gh);
    }
  }
  // Ordem aleatória; pula a placa que estouraria muito a fração de terra.
  const land = Math.max(0, 1 - water);
  const order = plates.map((_, k) => k);
  for (let k = order.length - 1; k > 0; k--) {
    const j = Math.floor(rnd() * (k + 1));
    [order[k], order[j]] = [order[j], order[k]];
  }
  let sum = 0;
  for (const k of order) {
    if (sum >= land * 0.95) break;
    if (sum + area[k] > land * 1.25 && sum > land * 0.5) continue;
    plates[k].continental = true;
    sum += area[k];
  }
  return plates;
}

const g = (t: number) => Math.exp(-t * t);

/** Lado dos blocos da pré-filtragem do Voronoi, em pixels do mapa completo. */
const CELL = 16;

/**
 * Para cada bloco de CELL x CELL, as placas que podem ser a mais próxima ou a
 * segunda mais próxima de algum ponto dele, já contando o desvio máximo das
 * bordas (`reach`). Com limites inferior e superior da distância de potência,
 * fica de fora toda placa cujo melhor caso perde do segundo pior caso. Assim
 * cada tile testa 2 a 5 placas em vez de todas.
 */
function candidateGrid(plates: Plate[], W: number, H: number, reach: number) {
  const cols = Math.ceil(W / CELL);
  const rows = Math.ceil(H / CELL);
  const start = new Int32Array(cols * rows + 1);
  const list: number[] = [];
  const r = (CELL * Math.SQRT2) / 2 + reach;
  const lo = new Float64Array(plates.length);
  const hi = new Float64Array(plates.length);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const mx = (cx + 0.5) * CELL;
      const my = (cy + 0.5) * CELL;
      let best = Infinity;
      let second = Infinity;
      for (let k = 0; k < plates.length; k++) {
        const p = plates[k];
        const dist = Math.hypot(wrapDx(mx - p.x, W), my - p.y);
        lo[k] = Math.max(0, dist - r) ** 2 - p.weight;
        hi[k] = (dist + r) ** 2 - p.weight;
        if (hi[k] < best) {
          second = best;
          best = hi[k];
        } else if (hi[k] < second) second = hi[k];
      }
      start[cy * cols + cx] = list.length;
      for (let k = 0; k < plates.length; k++) if (lo[k] <= second) list.push(k);
    }
  }
  start[cols * rows] = list.length;
  return { cols, rows, start, list: Uint8Array.from(list) };
}

export interface TectonicInput {
  plates: Plate[];
  /** Tamanho do mapa completo e da grade gerada (passo = pixels do completo por tile). */
  fullWidth: number;
  fullHeight: number;
  width: number;
  height: number;
  step: number;
  /** Coordenadas no cilindro (para o ruído encaixar na borda), por coluna. */
  cosA: Float32Array;
  sinA: Float32Array;
  /** Escala do ruído: pixels do mapa completo por unidade. */
  featureScale: number;
  terrain: PerlinNoise3;
  warp: PerlinNoise3;
}

/**
 * Voronoi das placas e elevação (etapas 1 e 2). Para cada tile acha as duas
 * sementes mais próximas (diagrama de potência, após um desvio de ruído que
 * entorta as bordas); a distância até a borda sai direto da fórmula do
 * bissetor, sem varrer vizinhos. A velocidade relativa projetada na normal da
 * borda diz se as placas se chocam, se afastam ou deslizam.
 */
export function tectonicStage(inp: TectonicInput): TectonicField {
  const { plates, fullWidth: W, width, height, step, cosA, sinA, featureScale, terrain, warp } = inp;
  const n = width * height;
  const plate = new Uint8Array(n);
  const boundary = new Uint8Array(n);
  const stress = new Uint8Array(n);
  const raw = new Float32Array(n);
  const count = plates.length;
  const px = new Float64Array(count);
  const py = new Float64Array(count);
  const pw = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    px[k] = plates[k].x;
    py[k] = plates[k].y;
    pw[k] = plates[k].weight;
  }

  // Largura da zona de influência das bordas e amplitude do desvio, em pixels do mapa completo.
  const w = W * 0.028;
  const warpAmp = W * 0.04;
  // Desvios de baixa frequência (bordas das placas e do relevo) numa grade grossa de ~4 px do mapa completo.
  // O canal 4 guarda as duas oitavas graves do relevo continental (as agudas são por tile).
  const smooth = new CoarseField(width, height, 4 / step, 5, (x, y, out) => {
    const cx = cosA[x];
    const cz = sinA[x];
    const cy = (y * step) / featureScale;
    out[0] = warpAmp * warp.fbm(cx * 1.6 + 3, cy * 1.6, cz * 1.6 + 5, 3);
    out[1] = warpAmp * warp.fbm(cx * 1.6 + 19, cy * 1.6 + 7, cz * 1.6 + 23, 3);
    out[2] = terrain.sample(cx * 0.75 + 11, cy * 0.75, cz * 0.75 + 17) * 0.35;
    out[3] = terrain.sample(cx * 0.75 + 37, cy * 0.75 + 7, cz * 0.75 + 43) * 0.35;
    const wx = cx + 10 + out[2];
    const wz = cz + out[3];
    out[4] = terrain.sample(wx, cy, wz) + 0.5 * terrain.sample(wx * 2, cy * 2, wz * 2);
  });
  const cand = candidateGrid(plates, W, inp.fullHeight, warpAmp * 1.05);
  for (let y = 0; y < height; y++) {
    const fy = y * step;
    const candRow = Math.min(cand.rows - 1, Math.floor(fy / CELL)) * cand.cols;
    const cy = fy / featureScale;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const cx = cosA[x];
      const cz = sinA[x];

      // Etapa 1: Voronoi com bordas tortas.
      let qx = x * step + smooth.get(0, x, y);
      const qy = fy + smooth.get(1, x, y);
      qx = ((qx % W) + W) % W;
      let a = 0;
      let b = 0;
      let da = Infinity;
      let db = Infinity;
      // Só as placas que podem ser uma das duas mais próximas neste bloco (pré-filtradas).
      const cell = candRow + Math.min(cand.cols - 1, Math.floor((x * step) / CELL));
      for (let c = cand.start[cell], end = cand.start[cell + 1]; c < end; c++) {
        const k = cand.list[c];
        let dx = qx - px[k];
        if (dx > W / 2) dx -= W;
        else if (dx < -W / 2) dx += W;
        const dy = qy - py[k];
        const d = dx * dx + dy * dy - pw[k];
        if (d < da) {
          db = da;
          b = a;
          da = d;
          a = k;
        } else if (d < db) {
          db = d;
          b = k;
        }
      }
      plate[i] = a;
      const A = plates[a];
      const B = plates[b];
      // Vetor de A para B e distância até o bissetor (exata no diagrama de potência).
      const abx = wrapDx(px[b] - px[a], W);
      const aby = py[b] - py[a];
      const len = Math.hypot(abx, aby) || 1;
      const d = Math.max(0, (db - da) / (2 * len));
      const nx = abx / len;
      const ny = aby / len;
      const rvx = A.vx - B.vx;
      const rvy = A.vy - B.vy;
      // > 0: as placas se aproximam; < 0: se afastam. O resto é deslizamento.
      const conv = Math.max(-1, Math.min(1, (rvx * nx + rvy * ny) / 1.2));
      const shear = Math.min(1, Math.abs(rvx * ny - rvy * nx) / 1.2);

      // Etapa 2: crosta, relevo interno e interação das bordas.
      const baseA = A.continental ? 0.24 : -0.38;
      const baseB = B.continental ? 0.24 : -0.38;
      // Na borda as duas crostas se encontram na média: a plataforma continental desce aos poucos.
      const base = baseA + (baseB - baseA) * 0.5 * g(d / (w * 1.6));

      const wx = cx + 10 + smooth.get(2, x, y);
      const wz = cz + smooth.get(3, x, y);
      // fBm de 4 oitavas (ganho 0,5): graves da grade grossa + agudas aqui.
      const cont = (smooth.get(4, x, y) + 0.25 * terrain.sample(wx * 4, cy * 4, wz * 4) + 0.125 * terrain.sample(wx * 8, cy * 8, wz * 8)) / 1.875;
      const detail = terrain.sample(wx * 4.5 + 2, cy * 4.5, wz * 4.5 + 8);
      let h = base + detail * 0.08;
      let ridge = -1;
      if (A.continental) {
        // Interior continental: bacias, planaltos e serras velhas e gastas.
        ridge = terrain.ridged(wx * 2.2 + 5, cy * 2.2, wz * 2.2 + 9, 3, 2, 0.5);
        h += cont * 0.5 + ridge * Math.max(0, cont + 0.1) * 0.25;
      } else {
        // Fundo oceânico: liso, para o meio dos oceanos ficar livre de ilhas.
        h += cont * 0.12;
      }

      let type = Boundary.None;
      let s = 0;
      let lift = 0;
      if (d < w * 2.6) {
        if (conv > 0.12) {
          if (A.continental && B.continental) {
            // Colisão continental: cordilheira dos dois lados da borda.
            type = Boundary.Convergent;
            lift = 1.2 * conv * g(d / (w * 1.3));
            s = conv * g(d / (w * 1.6));
          } else if (A.continental) {
            // A oceânica afunda sob esta: arco vulcânico em terra, um pouco para dentro.
            type = Boundary.Subduction;
            lift = 0.9 * conv * g((d - w * 0.8) / (w * 0.75));
            s = conv * g(d / (w * 2.2));
          } else if (B.continental || A.density > B.density) {
            // Este lado afunda: fossa oceânica colada na borda.
            type = Boundary.Subduction;
            lift = -0.55 * conv * g(d / (w * 0.45));
            s = conv * g(d / (w * 2));
          } else {
            // Oceânica sobre oceânica: arco de ilhas, quebrado em arquipélago pelo ruído.
            type = Boundary.Subduction;
            const spot = Math.max(0, Math.min(1, (terrain.sample(wx * 3 + 31, cy * 3, wz * 3 + 13) + 0.12) * 3));
            lift = (0.4 + 0.45 * conv) * g((d - w * 0.6) / (w * 0.5)) * spot;
            s = conv * g(d / (w * 2));
          }
        } else if (conv < -0.12) {
          const div = -conv;
          type = Boundary.Divergent;
          s = 0.35 * div * g(d / w);
          if (!A.continental && !B.continental) {
            // Dorsal oceânica, com ilhas vulcânicas aqui e ali sobre ela.
            const spot = Math.max(0, Math.min(1, (terrain.sample(wx * 3.5 + 71, cy * 3.5, wz * 3.5 + 3) - 0.05) * 3));
            lift = 0.22 * div * g(d / w) + (0.3 + 0.35 * div) * g(d / (w * 0.45)) * spot;
          } else if (A.continental && B.continental) {
            // Rift: o continente racha e o vale afunda (pode virar mar estreito).
            lift = -0.4 * div * g(d / (w * 0.55));
          } else {
            lift = (A.continental ? -0.08 : 0.12) * div * g(d / w);
          }
        } else {
          // Deslizamento: quase nada de relevo, mas a tensão acumula.
          type = Boundary.Transform;
          lift = 0.06 * detail * g(d / (w * 0.6));
          s = Math.max(0.35, shear) * 1.1 * g(d / (w * 1.2));
        }
        if (s < 0.05) type = Boundary.None;
      }
      if (lift > 0 && A.continental) {
        // Cordilheiras novas são serrilhadas.
        if (ridge < 0) ridge = terrain.ridged(wx * 2.2 + 5, cy * 2.2, wz * 2.2 + 9, 3, 2, 0.5);
        lift *= 0.55 + 0.75 * ridge;
      }
      h += lift;
      raw[i] = h;
      boundary[i] = type;
      stress[i] = Math.min(255, Math.round(s * 255));
    }
  }
  return { plates, plate, boundary, stress, raw };
}
