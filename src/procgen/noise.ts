import { mulberry32 } from '../core/rng';

/** Produto escalar rápido com os 12 vetores de gradiente de Ken Perlin. */
function grad3(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

/** Ruído de gradiente Perlin 3D com interpolação quíntica, cristas e soma fractal. */
export class PerlinNoise3 {
  private readonly perm: Uint8Array;

  constructor(seed: number) {
    const rnd = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  /** Amostra o ruído Perlin 3D com interpolação quíntica suave (C2 contínua). */
  sample(x: number, y: number, z: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const fx = x - xi;
    const fy = y - yi;
    const fz = z - zi;

    // Curva quíntica de Ken Perlin: 6t^5 - 15t^4 + 10t^3 (sem descontinuidades de 2ª derivada nas bordas)
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const w = fz * fz * fz * (fz * (fz * 6 - 15) + 10);

    const P = this.perm;
    const x0 = xi & 255;
    const x1 = (xi + 1) & 255;
    const y0 = yi & 255;
    const y1 = (yi + 1) & 255;
    const z0 = zi & 255;
    const z1 = (zi + 1) & 255;

    const p0 = P[x0];
    const p1 = P[x1];
    const p00 = P[p0 + y0];
    const p01 = P[p0 + y1];
    const p10 = P[p1 + y0];
    const p11 = P[p1 + y1];

    const g000 = grad3(P[p00 + z0], fx, fy, fz);
    const g100 = grad3(P[p10 + z0], fx - 1, fy, fz);
    const g010 = grad3(P[p01 + z0], fx, fy - 1, fz);
    const g110 = grad3(P[p11 + z0], fx - 1, fy - 1, fz);
    const g001 = grad3(P[p00 + z1], fx, fy, fz - 1);
    const g101 = grad3(P[p10 + z1], fx - 1, fy, fz - 1);
    const g011 = grad3(P[p01 + z1], fx, fy - 1, fz - 1);
    const g111 = grad3(P[p11 + z1], fx - 1, fy - 1, fz - 1);

    const a0 = g000 + u * (g100 - g000);
    const a1 = g010 + u * (g110 - g010);
    const a2 = g001 + u * (g101 - g001);
    const a3 = g011 + u * (g111 - g011);
    const b0 = a0 + v * (a1 - a0);
    const b1 = a2 + v * (a3 - a2);
    return b0 + w * (b1 - b0);
  }

  /** Movimento Browniano Fractal (fBm). */
  fbm(x: number, y: number, z: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.sample(x * freq, y * freq, z * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Ruído em cristas (Ridged Multifractal) para cordilheiras de montanhas afiadas. */
  ridged(x: number, y: number, z: number, octaves = 3, lacunarity = 2, gain = 0.5): number {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    let weight = 1;
    for (let i = 0; i < octaves; i++) {
      let val = 1 - Math.abs(this.sample(x * freq, y * freq, z * freq));
      val = val * val;
      val *= weight;
      weight = Math.min(1, Math.max(0, val * 2));
      sum += val * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}

/** Ruído de valor 3D com semente, interpolação suave e soma fractal (fBm). */
export class ValueNoise3 {
  private readonly perm: Uint8Array;
  private readonly values: Float32Array;

  constructor(seed: number) {
    const rnd = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    this.values = new Float32Array(256);
    for (let i = 0; i < 256; i++) this.values[i] = rnd() * 2 - 1;
  }

  /** Ruído em [-1, 1]. Escrito sem funções auxiliares porque é o laço mais quente da geração. */
  sample(x: number, y: number, z: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const fx = x - xi;
    const fy = y - yi;
    const fz = z - zi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const sz = fz * fz * (3 - 2 * fz);
    const P = this.perm;
    const V = this.values;
    const x0 = xi & 255;
    const x1 = (xi + 1) & 255;
    const y0 = yi & 255;
    const y1 = (yi + 1) & 255;
    const z0 = zi & 255;
    const z1 = (zi + 1) & 255;
    const p0 = P[x0];
    const p1 = P[x1];
    const p00 = P[p0 + y0];
    const p01 = P[p0 + y1];
    const p10 = P[p1 + y0];
    const p11 = P[p1 + y1];
    const c000 = V[P[p00 + z0]];
    const c100 = V[P[p10 + z0]];
    const c010 = V[P[p01 + z0]];
    const c110 = V[P[p11 + z0]];
    const c001 = V[P[p00 + z1]];
    const c101 = V[P[p10 + z1]];
    const c011 = V[P[p01 + z1]];
    const c111 = V[P[p11 + z1]];
    const a0 = c000 + (c100 - c000) * sx;
    const a1 = c010 + (c110 - c010) * sx;
    const a2 = c001 + (c101 - c001) * sx;
    const a3 = c011 + (c111 - c011) * sx;
    const b0 = a0 + (a1 - a0) * sy;
    const b1 = a2 + (a3 - a2) * sy;
    return b0 + (b1 - b0) * sz;
  }

  fbm(x: number, y: number, z: number, octaves = 5, lacunarity = 2, gain = 0.5): number {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.sample(x * freq, y * freq, z * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}

/**
 * Campo suave amostrado numa grade grossa e interpolado (bilinear) por tile:
 * para ruído de baixa frequência (desvios de borda, frentes climáticas) é
 * quase igual ao ruído direto e custa uma fração. A grade dá a volta na
 * horizontal, como o mapa.
 */
export class CoarseField {
  private readonly data: Float32Array;
  private readonly cols: number;
  private readonly rows: number;

  constructor(
    width: number,
    height: number,
    private readonly stride: number,
    private readonly channels: number,
    fn: (x: number, y: number, out: Float32Array) => void,
  ) {
    stride = Math.max(1, Math.floor(stride));
    while (width % stride) stride--;
    this.stride = stride;
    this.cols = width / stride;
    this.rows = Math.ceil((height - 1) / stride) + 1;
    this.data = new Float32Array(this.cols * this.rows * channels);
    const out = new Float32Array(channels);
    for (let gy = 0; gy < this.rows; gy++) {
      for (let gx = 0; gx < this.cols; gx++) {
        fn(gx * stride, gy * stride, out);
        this.data.set(out, (gy * this.cols + gx) * channels);
      }
    }
  }

  /** Valor do canal `k` no tile (x, y), interpolado. */
  get(k: number, x: number, y: number): number {
    const { stride, cols, rows, channels, data } = this;
    const fx = x / stride;
    const fy = y / stride;
    const x0 = Math.floor(fx);
    const y0 = Math.min(rows - 1, Math.floor(fy));
    const tx = fx - x0;
    const ty = fy - y0;
    const c0 = x0 % cols;
    const c1 = (c0 + 1) % cols;
    const r1 = Math.min(rows - 1, y0 + 1);
    const a = data[(y0 * cols + c0) * channels + k];
    const b = data[(y0 * cols + c1) * channels + k];
    const c = data[(r1 * cols + c0) * channels + k];
    const d = data[(r1 * cols + c1) * channels + k];
    const top = a + (b - a) * tx;
    const bot = c + (d - c) * tx;
    return top + (bot - top) * ty;
  }
}
