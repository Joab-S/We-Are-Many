import { CoarseField, type PerlinNoise3 } from './noise';

/**
 * Etapa 3 do gerador: temperatura e umidade. A temperatura do jogo continua
 * em Kelvin (latitude, altitude e o ajuste do jogador, em `temperatureAt`);
 * aqui sai só a perturbação das frentes climáticas, um ruído de baixa
 * frequência. A umidade junta ruído, proximidade da água, distância para o
 * interior do continente e a sombra de chuva das cordilheiras, calculada
 * levando o ar úmido pelos ventos dominantes de cada faixa de latitude.
 */

export interface ClimateInput {
  elevation: Float32Array;
  width: number;
  height: number;
  fullWidth: number;
  step: number;
  cosA: Float32Array;
  sinA: Float32Array;
  featureScale: number;
  wet: PerlinNoise3;
}

export interface ClimateField {
  /** Desvio de temperatura das frentes climáticas (K). */
  climate: Float32Array;
  /** Umidade (0..1). */
  moisture: Float32Array;
}

/** Amplitude das frentes climáticas, em K. */
const FRONTS_K = 7;

/**
 * Distância (em pixels do mapa completo) de cada tile até a água mais
 * próxima, por chanfro em duas passadas (O(n)); o mapa dá a volta na
 * horizontal, então as passadas rodam duas vezes para a borda encaixar.
 */
export function waterDistance(elevation: Float32Array, width: number, height: number, step: number): Float32Array {
  const n = width * height;
  const dist = new Float32Array(n);
  const big = 1e9;
  for (let i = 0; i < n; i++) dist[i] = elevation[i] < 0 ? 0 : big;
  const d1 = step;
  const d2 = step * Math.SQRT2;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        let v = dist[i];
        if (v === 0) continue;
        const xl = (x + width - 1) % width;
        const xr = (x + 1) % width;
        v = Math.min(v, dist[y * width + xl] + d1);
        if (y > 0) {
          const r = (y - 1) * width;
          v = Math.min(v, dist[r + x] + d1, dist[r + xl] + d2, dist[r + xr] + d2);
        }
        dist[i] = v;
      }
    }
    for (let y = height - 1; y >= 0; y--) {
      for (let x = width - 1; x >= 0; x--) {
        const i = y * width + x;
        let v = dist[i];
        if (v === 0) continue;
        const xl = (x + width - 1) % width;
        const xr = (x + 1) % width;
        v = Math.min(v, dist[y * width + xr] + d1);
        if (y < height - 1) {
          const r = (y + 1) * width;
          v = Math.min(v, dist[r + x] + d1, dist[r + xl] + d2, dist[r + xr] + d2);
        }
        dist[i] = v;
      }
    }
  }
  return dist;
}

/**
 * Peso do vento de oeste numa linha (0..1): alísios de leste perto do
 * Equador e nos polos, ventos de oeste nas latitudes médias, com uma
 * transição suave entre as faixas para não riscar o mapa.
 */
export function westerlyAt(y: number, height: number): number {
  const lat = Math.abs(y / (height - 1) - 0.5) * 2;
  const s = (a: number, b: number) => Math.min(1, Math.max(0, (lat - a) / (b - a)));
  return s(0.26, 0.4) * (1 - s(0.64, 0.78));
}

/**
 * Leva o ar pelo vento em cada linha: sobre o mar ele se carrega de umidade;
 * sobre a terra perde um pouco a cada passo (o interior seca) e perde muito
 * ao subir uma encosta (chuva orográfica). Depois da crista o ar chega seco:
 * a sombra de chuva. Devolve a chuva relativa de cada tile (0..1).
 */
export function rainfall(elevation: Float32Array, width: number, height: number, fullWidth: number, step: number): Float32Array {
  const rain = new Float32Array(width * height);
  // Comprimento (pixels do mapa completo) em que o ar perde ~63% da umidade sobre terra plana.
  const landLoss = 1 - Math.exp(-step / (fullWidth * 0.2));
  const seaGain = 1 - Math.exp(-step / (fullWidth * 0.015));
  for (let y = 0; y < height; y++) {
    // Na faixa de transição os dois ventos contam; fora dela, só um é calculado.
    const k = westerlyAt(y, height);
    if (k < 1) windRow(elevation, rain, y * width, width, step, landLoss, seaGain, -1, 1 - k);
    if (k > 0) windRow(elevation, rain, y * width, width, step, landLoss, seaGain, 1, k);
  }
  // Cada linha é levada sozinha; um borrão vertical curto (~3 px do mapa completo) junta as vizinhas.
  const passes = Math.max(1, Math.round(3 / step));
  const col = new Float32Array(height);
  for (let x = 0; x < width; x++) {
    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < height; y++) col[y] = rain[y * width + x];
      for (let y = 1; y < height - 1; y++) rain[y * width + x] = (col[y - 1] + 2 * col[y] + col[y + 1]) / 4;
    }
  }
  return rain;
}

/** Leva o ar por uma linha com o vento para um lado (`dir` +1 para leste) e soma a chuva com peso `weight`. */
function windRow(elevation: Float32Array, rain: Float32Array, row: number, width: number, step: number, landLoss: number, seaGain: number, dir: number, weight: number): void {
  // Começa num tile de mar (se houver) para o ar já chegar carregado.
  let start = 0;
  while (start < width && elevation[row + start] >= 0) start++;
  let carry = start < width ? 1 : 0.5;
  if (start >= width) start = 0;
  let prev = Math.max(0, elevation[row + start]);
  let x = start;
  // Uma volta inteira mais um pedaço: o trecho logo depois do começo é refeito com o ar já ajustado.
  const extra = Math.ceil(width * 0.25);
  const tmp = rowBuffer(width);
  for (let k = 0; k <= width + extra; k++) {
    const i = row + x;
    const e = elevation[i];
    let r: number;
    if (e < 0) {
      carry += (1 - carry) * seaGain;
      prev = 0;
      r = carry;
    } else {
      const rise = Math.max(0, e - prev);
      prev = e;
      // Subida da encosta: o ar esfria e chove; a perda é proporcional ao quanto sobe.
      const oro = carry * (1 - Math.exp(-rise * 7));
      carry -= oro;
      carry -= carry * landLoss;
      // Chuva no tile: a umidade do ar que passa mais o reforço da encosta a barlavento.
      r = Math.min(1, carry + Math.min(0.6, (oro / step) * 12));
    }
    // Na segunda passada pelo mesmo tile, o valor novo substitui o da primeira.
    tmp[x] = r;
    x += dir;
    if (x < 0) x += width;
    else if (x >= width) x -= width;
  }
  for (let k = 0; k < width; k++) rain[row + k] += tmp[k] * weight;
}

let scratch = new Float32Array(0);
/** Buffer de uma linha, reaproveitado entre as linhas. */
function rowBuffer(width: number): Float32Array {
  if (scratch.length < width) scratch = new Float32Array(width);
  return scratch;
}

export function climateStage(inp: ClimateInput): ClimateField {
  const { elevation, width, height, fullWidth, step, cosA, sinA, featureScale, wet } = inp;
  const n = width * height;
  const climate = new Float32Array(n);
  const moisture = new Float32Array(n);
  const dist = waterDistance(elevation, width, height, step);
  const rain = rainfall(elevation, width, height, fullWidth, step);
  const coastScale = fullWidth * 0.018;
  const interiorScale = fullWidth * 0.12;
  const raw = new Float32Array(n);
  let landCount = 0;
  // Os dois ruídos são suaves: grade grossa de ~4 px do mapa completo, interpolada.
  const smooth = new CoarseField(width, height, 4 / step, 2, (x, y, out) => {
    const cx = cosA[x];
    const cz = sinA[x];
    const cy = (y * step) / featureScale;
    // Frentes climáticas: ondas largas de ar quente e frio.
    out[0] = FRONTS_K * wet.fbm(cx * 0.6 + 41, cy * 0.6, cz * 0.6 + 29, 2);
    out[1] = 0.5 + 0.6 * wet.fbm(cx * 1.3 + 3, cy * 1.3, cz * 1.3 + 7, 3);
  });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      climate[i] = smooth.get(0, x, y);
      if (elevation[i] < 0) {
        moisture[i] = 1;
        continue;
      }
      const noise = smooth.get(1, x, y);
      const coast = Math.exp(-dist[i] / coastScale);
      const inland = Math.min(1, dist[i] / interiorScale);
      raw[i] = 0.38 * rain[i] + 0.5 * noise + 0.12 * coast - 0.1 * inland * inland;
      landCount++;
    }
  }
  // Equalização na terra: a umidade cobre a faixa toda, então todos os biomas da matriz aparecem.
  // A posição de cada tile vem de uma busca binária nos valores ordenados (sort nativo de array tipado).
  const sorted = new Float32Array(landCount);
  let k = 0;
  for (let i = 0; i < n; i++) if (elevation[i] >= 0) sorted[k++] = raw[i];
  sorted.sort();
  const last = Math.max(1, landCount - 1);
  for (let i = 0; i < n; i++) {
    if (elevation[i] < 0) continue;
    const v = Math.fround(raw[i]);
    let lo = 0;
    let hi = landCount;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    moisture[i] = 0.04 + 0.92 * Math.min(1, lo / last);
  }
  return { climate, moisture };
}
