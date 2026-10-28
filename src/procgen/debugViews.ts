import { Biome, PALETTE, temperatureNorm } from './biomes';
import { Boundary } from './tectonics';
import { mapSizeFor, temperatureAt, type SurfaceMap } from './surface';

/**
 * Visões de depuração do gerador (janela Mundo): cada etapa do pipeline
 * pintada sozinha no lugar do mapa normal. Pintam o mesmo buffer RGBA do
 * mapa, com alfa sem enfeite (15).
 */

export type GeoView = 'none' | 'plates' | 'elevation' | 'temperature' | 'humidity' | 'biomes';

export const GEO_VIEWS: [GeoView, string][] = [
  ['none', 'Normal'],
  ['plates', 'Placas'],
  ['elevation', 'Altitude'],
  ['temperature', 'Temperatura'],
  ['humidity', 'Umidade'],
  ['biomes', 'Biomas'],
];

export const BOUNDARY_COLORS: Record<Boundary, [number, number, number]> = {
  [Boundary.None]: [0, 0, 0],
  [Boundary.Convergent]: [235, 60, 50],
  [Boundary.Subduction]: [250, 150, 40],
  [Boundary.Divergent]: [60, 200, 240],
  [Boundary.Transform]: [245, 230, 70],
};

type Rgb = [number, number, number];

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Rampa de cores por pontos (t em 0..1). */
function ramp(stops: Rgb[], t: number): Rgb {
  const u = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const k = Math.min(stops.length - 2, Math.floor(u));
  return mix(stops[k], stops[k + 1], u - k);
}

const ELEV_SEA: Rgb[] = [
  [8, 20, 70],
  [30, 80, 170],
  [110, 170, 225],
];
const ELEV_LAND: Rgb[] = [
  [70, 140, 60],
  [190, 180, 90],
  [140, 95, 60],
  [245, 245, 245],
];
const TEMP: Rgb[] = [
  [40, 60, 200],
  [120, 200, 240],
  [240, 240, 220],
  [245, 170, 60],
  [200, 30, 30],
];
const HUMID: Rgb[] = [
  [170, 110, 50],
  [220, 210, 120],
  [80, 180, 90],
  [30, 90, 200],
];

/** Cor estável de uma placa. */
export function plateColor(k: number, continental: boolean): Rgb {
  const h = ((k * 0.618034) % 1) * 6;
  const c = continental ? 0.55 : 0.4;
  const v = continental ? 200 : 120;
  const f = h - Math.floor(h);
  const lo = v * (1 - c);
  const up = v * (1 - c * (1 - f));
  const dn = v * (1 - c * f);
  switch (Math.floor(h)) {
    case 0:
      return [v, up, lo];
    case 1:
      return [dn, v, lo];
    case 2:
      return [lo, v, up];
    case 3:
      return [lo, dn, v];
    case 4:
      return [up, lo, v];
    default:
      return [v, lo, dn];
  }
}

/** Cor de um tile numa visão (sem as setas das placas). */
export function geoColor(map: SurfaceMap, view: GeoView, i: number): Rgb {
  const e = map.elevation[i];
  switch (view) {
    case 'elevation':
      return e < 0 ? ramp(ELEV_SEA, 1 + e) : ramp(ELEV_LAND, e);
    case 'temperature':
      return ramp(TEMP, temperatureNorm(temperatureAt(map, i)));
    case 'humidity':
      return e < 0 ? [20, 40, 90] : ramp(HUMID, map.moisture[i]);
    case 'biomes':
      return PALETTE[map.biome[i] as Biome];
    case 'plates': {
      if (!map.plate || !map.plates) return e < 0 ? [30, 40, 70] : [90, 90, 90];
      const k = map.plate[i];
      const { width, height } = map;
      const x = i % width;
      const y = (i - x) / width;
      const right = map.plate[y * width + ((x + 1) % width)];
      const down = y + 1 < height ? map.plate[i + width] : k;
      // Linha da borda pintada pelo tipo do limite.
      if (right !== k || down !== k) {
        const b = (map.boundary?.[i] ?? Boundary.None) as Boundary;
        return b === Boundary.None ? [20, 20, 20] : BOUNDARY_COLORS[b];
      }
      let c = plateColor(k, map.plates[k].continental);
      // Tensão sísmica esquenta a cor; o litoral aparece como uma linha clara.
      const s = (map.stress?.[i] ?? 0) / 255;
      if (s > 0) c = mix(c, [255, 70, 40], s * 0.6);
      if (e >= 0 && x > 0 && map.elevation[i - 1] < 0) c = mix(c, [255, 255, 255], 0.7);
      return c;
    }
    default:
      return [0, 0, 0];
  }
}

/** Pinta um tile de uma visão de depuração. */
export function paintGeoTile(map: SurfaceMap, view: GeoView, out: Uint8Array, i: number): void {
  const c = geoColor(map, view, i);
  const o = i * 4;
  out[o] = c[0];
  out[o + 1] = c[1];
  out[o + 2] = c[2];
  out[o + 3] = 15;
}

/** Pinta a visão inteira; na de placas, desenha também a seta de movimento de cada uma. */
export function paintGeoView(map: SurfaceMap, view: GeoView, out: Uint8Array): void {
  const n = map.width * map.height;
  for (let i = 0; i < n; i++) paintGeoTile(map, view, out, i);
  if (view === 'plates' && map.plates) drawPlateVectors(map, out);
}

function drawPlateVectors(map: SurfaceMap, out: Uint8Array): void {
  const { width, height } = map;
  // As placas estão em pixels do mapa completo; a grade pode ser menor.
  const scale = width / mapSizeFor(map.params.radiusEarth).width;
  const put = (x: number, y: number, c: Rgb) => {
    const yi = Math.round(y);
    if (yi < 0 || yi >= height) return;
    const xi = ((Math.round(x) % width) + width) % width;
    const o = (yi * width + xi) * 4;
    out[o] = c[0];
    out[o + 1] = c[1];
    out[o + 2] = c[2];
    out[o + 3] = 15;
  };
  const line = (x0: number, y0: number, x1: number, y1: number, c: Rgb, thick: number) => {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      for (let oy = -thick; oy <= thick; oy++) for (let ox = -thick; ox <= thick; ox++) put(x + ox, y + oy, c);
    }
  };
  const thick = width >= 768 ? 1 : 0;
  const len = width * 0.06;
  for (const p of map.plates!) {
    const x0 = p.x * scale;
    const y0 = p.y * scale;
    const x1 = x0 + p.vx * len;
    const y1 = y0 + p.vy * len;
    const a = Math.atan2(p.vy, p.vx);
    const head = len * 0.3;
    line(x0, y0, x1, y1, [255, 255, 255], thick);
    line(x1, y1, x1 - Math.cos(a - 0.5) * head, y1 - Math.sin(a - 0.5) * head, [255, 255, 255], thick);
    line(x1, y1, x1 - Math.cos(a + 0.5) * head, y1 - Math.sin(a + 0.5) * head, [255, 255, 255], thick);
    // Semente da placa: quadradinho preto.
    for (let oy = -1 - thick; oy <= 1 + thick; oy++) for (let ox = -1 - thick; ox <= 1 + thick; ox++) put(x0 + ox, y0 + oy, [0, 0, 0]);
  }
}

