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

  private lattice(x: number, y: number, z: number): number {
    const P = this.perm;
    return this.values[P[P[P[x & 255] + (y & 255)] + (z & 255)]];
  }

  /** Ruído em [-1, 1]. */
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
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const c000 = this.lattice(xi, yi, zi);
    const c100 = this.lattice(xi + 1, yi, zi);
    const c010 = this.lattice(xi, yi + 1, zi);
    const c110 = this.lattice(xi + 1, yi + 1, zi);
    const c001 = this.lattice(xi, yi, zi + 1);
    const c101 = this.lattice(xi + 1, yi, zi + 1);
    const c011 = this.lattice(xi, yi + 1, zi + 1);
    const c111 = this.lattice(xi + 1, yi + 1, zi + 1);
    return lerp(
      lerp(lerp(c000, c100, sx), lerp(c010, c110, sx), sy),
      lerp(lerp(c001, c101, sx), lerp(c011, c111, sx), sy),
      sz,
    );
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
