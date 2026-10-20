/** Funções astrofísicas aproximadas usadas na renderização. */

/** Temperatura efetiva (K) a partir do índice de cor B-V (fórmula de Ballesteros). */
export function bvToTemperature(bv: number): number {
  const b = Math.min(Math.max(bv, -0.4), 2.0);
  return 4600 * (1 / (0.92 * b + 1.7) + 1 / (0.92 * b + 0.62));
}

/** Cor RGB (0..1) de um corpo negro aproximado, para dar cor às estrelas. */
export function temperatureToRgb(kelvin: number): [number, number, number] {
  const t = Math.min(Math.max(kelvin, 1000), 40000) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const clamp = (v: number) => Math.min(Math.max(v, 0), 255) / 255;
  return [clamp(r), clamp(g), clamp(b)];
}

/** Raio da estrela em raios solares, a partir da magnitude absoluta e da cor. */
export function stellarRadius(absmag: number, bv: number): number {
  const luminosity = Math.pow(10, -0.4 * (absmag - 4.83));
  const t = bvToTemperature(bv) / 5772;
  return Math.sqrt(luminosity) / (t * t);
}
