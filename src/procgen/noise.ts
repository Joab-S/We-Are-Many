import { mulberry32 } from '../core/rng';

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
