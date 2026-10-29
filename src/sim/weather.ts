/**
 * Clima vivo (Plano 2): o tempo de cada célula de 16×16 tiles. O mar evapora para o ar, o vento
 * leva a umidade célula a célula, chove na subida da serra (e não do outro lado) e no calor da
 * estação; abaixo de 0 °C a chuva vira neve, que acumula e derrete na primavera; a água da chuva e
 * do degelo fica no solo e seca com o calor. Cada passo refaz só uma fatia das células, e o mundo
 * inteiro WEATHER_PASSES vezes por ano: o custo por ano não muda com a velocidade do jogo.
 */
import type { SurfaceMap } from '../procgen/surface';
import { temperatureAt } from '../procgen/surface';
import { windAt } from './climate';
import { ECO_CELL } from './fauna';

/** Voltas completas pela grade por ano (uma por mês de jogo). */
export const WEATHER_PASSES = 12;
/** Abaixo disto (K) a chuva cai como neve e a neve não derrete. */
export const FREEZE_K = 273;

export class Weather {
  readonly cols: number;
  readonly rows: number;
  readonly n: number;
  /** Umidade do ar (0 a 1), chuva da última volta (0 a 1, para o visual), neve no chão e água no solo (0 a 1). */
  readonly humid: Float32Array;
  readonly rain: Float32Array;
  readonly snow: Float32Array;
  readonly soil: Float32Array;
  /** Retrato fixo da célula (refeito de vez em quando, porque o terreno muda): temperatura média (K),
   * altitude média da terra, fração de água e de terra. */
  readonly temp: Float32Array;
  readonly elev: Float32Array;
  readonly water: Float32Array;
  readonly land: Float32Array;
  /** Umidade de fundo do lugar (a média do mapa): o clima vivo oscila em volta dela. */
  readonly base: Float32Array;
  /** Ano da última atualização de cada célula. */
  readonly at: Float32Array;
  cursor = 0;
  ready = false;

  constructor(width: number, height: number) {
    this.cols = Math.ceil(width / ECO_CELL);
    this.rows = Math.ceil(height / ECO_CELL);
    this.n = this.cols * this.rows;
    this.humid = new Float32Array(this.n);
    this.rain = new Float32Array(this.n);
    this.snow = new Float32Array(this.n);
    this.soil = new Float32Array(this.n);
    this.temp = new Float32Array(this.n);
    this.elev = new Float32Array(this.n);
    this.water = new Float32Array(this.n);
    this.land = new Float32Array(this.n);
    this.base = new Float32Array(this.n);
    this.at = new Float32Array(this.n);
  }

  /** Célula de uma posição (com a volta horizontal do mapa). */
  of(x: number, y: number, width: number): number {
    const cx = Math.floor((((x % width) + width) % width) / ECO_CELL);
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / ECO_CELL)));
    return cy * this.cols + cx;
  }

  /** Retrato fixo da célula: amostra 16 tiles (um a cada 4 em cada eixo). */
  survey(map: SurfaceMap, k: number): void {
    const w = map.width;
    const x0 = (k % this.cols) * ECO_CELL;
    const y0 = Math.floor(k / this.cols) * ECO_CELL;
    let land = 0;
    let water = 0;
    let elev = 0;
    let temp = 0;
    let moist = 0;
    let n = 0;
    for (let sy = 2; sy < ECO_CELL; sy += 4) {
      const y = y0 + sy;
      if (y >= map.height) continue;
      for (let sx = 2; sx < ECO_CELL; sx += 4) {
        const t = y * w + ((x0 + sx) % w);
        n++;
        temp += temperatureAt(map, t);
        if (map.elevation[t] < 0) water++;
        else {
          land++;
          elev += map.elevation[t];
          moist += map.moisture[t];
        }
      }
    }
    if (!n) return;
    this.temp[k] = temp / n;
    this.water[k] = water / n;
    this.land[k] = land / n;
    this.elev[k] = land ? elev / land : 0;
    const m = land ? moist / land : 1;
    this.base[k] = m;
    if (!this.ready) {
      // Começa no equilíbrio aproximado do mapa: ar e solo tão úmidos quanto o bioma.
      this.humid[k] = 0.3 + 0.5 * Math.max(m, this.water[k]);
      this.soil[k] = m;
    }
  }

  /** Temperatura da célula agora: a média do lugar mais a estação (mais forte longe do equador). */
  tempNow(k: number, phase: number): number {
    const lat = Math.abs((Math.floor(k / this.cols) + 0.5) / this.rows - 0.5) * 2;
    // Pico do verão no meio da estação (fase 0,375), frio maior no meio do inverno.
    return this.temp[k] + (2 + 12 * lat) * Math.cos(2 * Math.PI * (phase - 0.375));
  }

  /** Começa do zero (planeta novo ou save antigo): retrato de todas as células. */
  init(map: SurfaceMap, year: number): void {
    for (let k = 0; k < this.n; k++) {
      this.survey(map, k);
      this.at[k] = year;
    }
    this.ready = true;
  }

  /**
   * Refaz a fatia de células que cabe em `yr` anos de jogo. `dryness(x, y)` traz a seca regional
   * (0 normal, positivo é ano seco), para o clima vivo andar junto com as secas da crônica.
   */
  step(map: SurfaceMap, year: number, phase: number, yr: number, dryness: (x: number, y: number) => number): void {
    if (!this.ready) this.init(map, year);
    const quota = Math.min(this.n, Math.ceil(this.n * WEATHER_PASSES * yr));
    for (let q = 0; q < quota; q++) {
      const k = this.cursor;
      this.cursor = (this.cursor + 1) % this.n;
      // O terreno muda devagar (vulcões, o jogador): o retrato fixo é refeito numa volta de cada 12.
      if (this.cursor === 0 && Math.floor(year * WEATHER_PASSES) % 12 === 0) this.survey(map, k);
      this.update(k, map, year, phase, dryness);
    }
  }

  private update(k: number, map: SurfaceMap, year: number, phase: number, dryness: (x: number, y: number) => number): void {
    const dt = Math.min(0.25, Math.max(0, year - this.at[k]));
    this.at[k] = year;
    if (dt <= 0) return;
    const cx = k % this.cols;
    const cy = (k - cx) / this.cols;
    const wind = windAt(cy * ECO_CELL + ECO_CELL / 2, map.height);
    // Ar que chega de barlavento: a umidade da célula de onde o vento vem.
    const ux = (cx - Math.sign(wind.x) + this.cols) % this.cols;
    const uy = Math.min(this.rows - 1, Math.max(0, cy - Math.round(wind.y)));
    const up = uy * this.cols + ux;
    const T = this.tempNow(k, phase);
    const warm = Math.max(0, Math.min(1, (T - 263) / 35));
    let h = this.humid[k] * 0.4 + this.humid[up] * 0.6;
    // Evaporação: o mar muito (mais no calor), a terra pela água do solo.
    h += (this.water[k] * 2.5 * warm + this.land[k] * this.soil[k] * 0.6 * warm) * dt;
    const dry = Math.max(-1, Math.min(1.5, dryness(cx * ECO_CELL + 8, cy * ECO_CELL + 8)));
    // Chuva quando o ar passa do ponto de saturação. O ponto baixa subindo a serra (o ar esfria: chuva
    // de encosta, e a sombra de chuva do outro lado) e no calor úmido; frentes passam como ondas lentas.
    const climb = Math.max(0, this.elev[k] - this.elev[up]);
    const front = Math.sin(2 * Math.PI * (year * 9 + cx * 0.11 + cy * 0.07));
    const sat = 0.42 - Math.min(0.25, climb * 6) - 0.25 * (this.base[k] - 0.4) + 0.1 * front + 0.08 * dry;
    const fall = Math.max(0, h - sat) * Math.min(1, 40 * dt);
    h -= fall;
    this.humid[k] = Math.max(0, Math.min(1, h));
    this.rain[k] = Math.min(1, (fall / Math.max(0.001, dt)) / 6);
    let snow = this.snow[k];
    let soil = this.soil[k];
    if (T < FREEZE_K) snow += fall * 1.5;
    else soil += fall * 1.2;
    // Degelo: a neve derrete com o calor e encharca o solo.
    if (T > FREEZE_K && snow > 0) {
      const melt = Math.min(snow, (T - FREEZE_K) * 0.3 * dt);
      snow -= melt;
      soil += melt * 0.8;
    }
    // O solo seca com o calor (e com o ano seco).
    soil -= soil * (0.5 + 1.8 * warm) * (1 + 0.4 * Math.max(0, dry)) * dt;
    // Rios, lençol e a mata seguram o solo perto da umidade de fundo do lugar.
    soil += (this.base[k] * (1 - 0.3 * Math.max(0, dry)) - soil) * 1.5 * dt;
    this.snow[k] = Math.max(0, Math.min(1, snow));
    this.soil[k] = Math.max(0, Math.min(1, soil));
  }

  /** Neve que cobre o chão (0 a 1) num ponto. */
  snowAt(x: number, y: number, width: number): number {
    return this.ready ? this.snow[this.of(x, y, width)] : 0;
  }
}
