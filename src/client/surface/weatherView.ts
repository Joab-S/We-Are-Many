import type { Ecosystem } from '../../sim/ecosystem';
import { ParticlePool } from './pool';
import { SNOWFALL_K, WEATHER_FX } from './tools';
import type { Viewport } from './Viewport';

const RAIN = 0;
const SNOW = 1;

/**
 * Clima vivo na tela. O ano passa em segundos, então a chuva do mês (meio
 * segundo) piscaria sem parar. A tela mostra a média: quanto chove e quanta
 * neve fica no chão nos últimos anos de cada célula, e as pancadas vêm de
 * tempestades que andam no relógio real, raras e de alguns segundos. As
 * gotas e flocos ficam numa piscina de tamanho fixo (Object Pool).
 */
export class WeatherView {
  /** Gotas e flocos do clima vivo, só na área visível (coordenadas da vista, y para cima). */
  readonly drops = new ParticlePool(WEATHER_FX);
  private layer: { snow: HTMLCanvasElement; cloud: HTMLCanvasElement; at: number } | null = null;
  private wet: Float32Array | null = null;
  private snow: Float32Array | null = null;
  private clock = 0;

  constructor(private readonly eco: Ecosystem) {}

  /**
   * Chuva e neve caindo: sorteia pontos da tela e solta gotas ou flocos onde a
   * célula está chovendo; no máximo WEATHER_FX partículas, só com o jogo
   * andando. O vento puxa para o lado.
   */
  step(dt: number, view: Viewport): void {
    this.clock += dt;
    const list = this.drops;
    list.step(dt);
    const wx = this.eco.weather;
    if (!wx?.ready) return;
    const z = view.zoom;
    const halfW = view.width / 2 / z;
    const halfH = view.height / 2 / z;
    // Mais tentativas de perto (poucas células na tela), menos de longe.
    const tries = Math.min(40, Math.round((160 * dt * 60) / Math.max(1, (halfW * halfH) / 4000)) + 4);
    const mw = this.eco.map.width;
    for (let n = 0; n < tries && !list.full; n++) {
      const x = view.center.x + (Math.random() * 2 - 1) * halfW;
      const y = view.center.y + (Math.random() * 2 - 1) * halfH;
      const t = view.tileIndex(x, y);
      if (t < 0) continue;
      const now = this.eco.weatherAt(t);
      if (!now) continue;
      const k = wx.of(x, y, mw);
      const shower = this.shower(k);
      if (shower < 0.05 || Math.random() > shower) continue;
      const snow = wx.temp[k] < SNOWFALL_K;
      list.spawn(
        x,
        y + 3,
        now.wind.x * (snow ? 1.5 : 2.5) + (Math.random() - 0.5) * (snow ? 1.2 : 0.4),
        snow ? -2.2 - Math.random() : -14 - Math.random() * 4,
        0,
        snow ? 1.4 + Math.random() : 0.25 + Math.random() * 0.2,
        snow ? SNOW : RAIN,
      );
    }
  }

  /** Véu de neve no chão e céu nublado por célula, e as gotas e flocos por cima (canvas dos territórios). */
  draw(ctx: CanvasRenderingContext2D, view: Viewport): void {
    const wx = this.eco.weather;
    if (!wx?.ready) return;
    const z = view.zoom;
    const w = view.width;
    const h = view.height;
    const map = this.eco.map;
    // Neve no chão e nuvens de chuva: uma imagem de uma célula por pixel, esticada com suavização
    // (as bordas das células somem), refeita duas vezes por segundo.
    const now = performance.now();
    if (!this.layer || now - this.layer.at > 500) this.layer = this.paint(this.layer);
    const { snow, cloud } = this.layer;
    const span = map.width * z;
    const x0 = (0 - view.center.x) * z + w / 2;
    const y0 = h / 2 - (map.height - view.center.y) * z;
    const hh = wx.rows * 16 * z;
    ctx.imageSmoothingEnabled = true;
    for (const off of [-span, 0, span]) {
      const x = x0 + off;
      if (x > w || x + span < 0) continue;
      ctx.drawImage(snow, x, y0, wx.cols * 16 * z, hh);
      ctx.drawImage(cloud, x, y0, wx.cols * 16 * z, hh);
    }
    const list = this.drops;
    if (!list.count) return;
    ctx.lineWidth = Math.max(1, Math.min(2, z * 0.08));
    ctx.strokeStyle = 'rgba(200,218,245,0.7)';
    ctx.beginPath();
    for (let k = 0; k < list.count; k++) {
      if (list.kind[k] === SNOW) continue;
      const sx = view.viewToScreenX(list.x[k]);
      const sy = view.viewToScreenY(list.y[k]);
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - list.vx[k] * z * 0.06, sy + list.vy[k] * z * 0.06);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const size = Math.max(1.5, Math.min(3.5, z * 0.18));
    for (let k = 0; k < list.count; k++) {
      if (list.kind[k] !== SNOW) continue;
      const sx = view.viewToScreenX(list.x[k]) + Math.sin(list.age[k] * 5 + list.x[k]) * z * 0.15;
      const sy = view.viewToScreenY(list.y[k]);
      ctx.fillRect(sx, sy, size, size);
    }
  }

  /**
   * Pancada de chuva ou neve visível agora na célula (0 a 1). Tempestades lentas cruzam o mapa no
   * relógio real (uma pancada dura uns 20 s, e o mesmo lugar recebe uma a cada dois ou três minutos);
   * chovem só onde o lugar costuma chover, na medida da chuva média.
   */
  shower(k: number): number {
    const wx = this.eco.weather;
    const wet = this.wet;
    if (!wx || !wet || wet.length !== wx.n) return 0;
    const cx = k % wx.cols;
    const cy = (k - cx) / wx.cols;
    const c = this.clock;
    const storm = 0.6 * Math.sin(2 * Math.PI * (c / 170 + cx * 0.09 + cy * 0.05)) + 0.4 * Math.sin(2 * Math.PI * (c / 61 - cx * 0.04 + cy * 0.13));
    const gate = Math.max(0, Math.min(1, (storm - 0.6) / 0.25));
    return gate * Math.min(1, wet[k] * 3);
  }

  /** O tempo agora no tile (clima vivo): temperatura da estação, chuva ou neve, neve no chão, solo e vento. */
  info(i: number): string {
    const eco = this.eco;
    const now = eco.weatherAt(i);
    if (!now) return '';
    const wx = eco.weather!;
    const w = eco.map.width;
    const k = wx.of(i % w, Math.floor(i / w), w);
    const shower = this.shower(k);
    const sky = shower >= 0.25 ? (wx.temp[k] < SNOWFALL_K ? '🌨️ nevando' : '🌧️ chovendo') : shower > 0 ? '☁️ nublado' : '☀️ firme';
    const wind = Math.abs(now.wind.x) >= Math.abs(now.wind.y) ? (now.wind.x > 0 ? 'oeste' : 'leste') : now.wind.y > 0 ? 'norte' : 'sul';
    const snowNow = this.snow?.[k] ?? now.snow;
    const ground = snowNow >= 0.05 ? ` · neve no chão ${(snowNow * 100).toFixed(0)}%` : '';
    return `<span>Agora ${(now.temp - 273.15).toFixed(0)} °C · ${sky}${ground} · solo ${(now.soil * 100).toFixed(0)}% de água · vento de ${wind}</span>`;
  }

  /** Médias lentas da chuva e da neve no chão (constante de uns 5 s, cerca de um ano de jogo). */
  private smooth(): void {
    const wx = this.eco.weather!;
    if (!this.wet || this.wet.length !== wx.n) {
      this.wet = Float32Array.from(wx.rain);
      this.snow = Float32Array.from(wx.snow);
      return;
    }
    const wet = this.wet;
    const snow = this.snow!;
    for (let k = 0; k < wx.n; k++) {
      wet[k] += (wx.rain[k] - wet[k]) * 0.1;
      snow[k] += (wx.snow[k] - snow[k]) * 0.1;
    }
  }

  /** Pinta as imagens de neve e nuvem (uma célula do clima por pixel). */
  private paint(prev: { snow: HTMLCanvasElement; cloud: HTMLCanvasElement; at: number } | null): { snow: HTMLCanvasElement; cloud: HTMLCanvasElement; at: number } {
    const wx = this.eco.weather!;
    this.smooth();
    const avgSnow = this.snow!;
    const make = () => {
      const c = document.createElement('canvas');
      c.width = wx.cols;
      c.height = wx.rows;
      return c;
    };
    const snow = prev?.snow.width === wx.cols ? prev.snow : make();
    const cloud = prev?.cloud.width === wx.cols ? prev.cloud : make();
    const sctx = snow.getContext('2d')!;
    const cctx = cloud.getContext('2d')!;
    const si = sctx.createImageData(wx.cols, wx.rows);
    const ci = cctx.createImageData(wx.cols, wx.rows);
    for (let k = 0; k < wx.n; k++) {
      const o = k * 4;
      si.data[o] = 240;
      si.data[o + 1] = 246;
      si.data[o + 2] = 255;
      si.data[o + 3] = Math.round(Math.min(0.62, avgSnow[k] * wx.land[k] * 0.7) * 255);
      ci.data[o] = 38;
      ci.data[o + 1] = 48;
      ci.data[o + 2] = 66;
      ci.data[o + 3] = Math.round(Math.min(0.25, this.shower(k) * 0.3) * 255);
    }
    sctx.putImageData(si, 0, 0);
    cctx.putImageData(ci, 0, 0);
    return { snow, cloud, at: performance.now() };
  }
}
