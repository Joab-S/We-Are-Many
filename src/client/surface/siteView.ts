import { SITE_NONE, SITE_PARTS, type EngineView, type SiteFieldView, type SitePart, type SiteReading } from '../../sim/api/engine';
import { MOTIVE_TEXT } from '../../sim/community';
import { ERAS } from '../../sim/ecosystem';
import { keyLabel } from './keys';
import type { Viewport } from './Viewport';

/**
 * Rampa da camada: sequencial, de um tom só (laranja, longe do azul da água e do verde da mata), clara para a nota
 * baixa e escura para a alta. A nota vai de 0 a SITE_TOP; abaixo de 0 (vizinhos demais) fica no primeiro tom.
 */
export const SITE_RAMP: readonly (readonly [number, number, number])[] = [
  [254, 237, 222],
  [253, 208, 162],
  [253, 174, 107],
  [253, 141, 60],
  [241, 105, 19],
  [217, 72, 1],
  [140, 45, 4],
];
export const SITE_TOP = 5;
/** Opacidade da célula: as de nota baixa deixam ver mais o mapa, as boas cobrem mais. */
const ALPHA_LOW = 0.4;
const ALPHA_HIGH = 0.78;

/** Cor (r, g, b) da nota na rampa, interpolada entre os tons vizinhos. */
export function siteColor(score: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, score / SITE_TOP)) * (SITE_RAMP.length - 1);
  const k = Math.min(SITE_RAMP.length - 2, Math.floor(t));
  const f = t - k;
  const a = SITE_RAMP[k];
  const b = SITE_RAMP[k + 1];
  return [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f)];
}

/** Nomes dos fatores na ficha. */
const PART_NAMES: Record<SitePart, string> = {
  water: 'Água doce',
  fertile: 'Fértil',
  forest: 'Mata',
  rock: 'Pedra',
  ore: 'Minério',
  flat: 'Plano',
  coast: 'Costa',
  defense: 'Defesa',
  climate: 'Clima',
  ruin: 'Ruína',
  route: 'Rota',
  motive: 'Motivo',
  overlap: 'Sobreposição',
  crowd: 'Densidade',
  capital: 'Distância da capital',
  dist: 'Distância da origem',
};
/** Fatores que só aparecem quando pesam (os outros aparecem sempre, mesmo zerados). */
const OPTIONAL: readonly SitePart[] = ['ruin', 'route', 'motive', 'dist'];

const num = (v: number, digits = 2) => v.toFixed(digits).replace('.', ',').replace('-', '−');
const signed = (v: number) => (v >= 0.005 ? `+${num(v)}` : v <= -0.005 ? num(v) : '0');

/** O fator como os batedores o veem: fração em %, gente, tiles ou sim e não. */
function rawText(r: SiteReading, k: SitePart): string {
  const v = (r.look[k] as number | undefined) ?? 0;
  if (k === 'crowd') return `${Math.round(v)} pessoas`;
  if (k === 'capital' || k === 'dist') return `${Math.round(v)} tiles`;
  if (k === 'ruin' || k === 'route') return v > 0 ? 'sim' : 'não';
  return `${Math.round(v * 100)}%`;
}

/**
 * Bloco da ficha do tile com a camada ligada: quem funda, cada fator da nota (o que os batedores veem e quanto
 * soma), a nota final contra a mínima das colônias e, se for o caso, por que ali não dá para fundar.
 */
export function siteCard(r: SiteReading, view: EngineView): string {
  const origin = r.from >= 0 ? view.villages[r.from] : null;
  const who = origin ? `${origin.name}` : 'um bando sem origem';
  const rows = SITE_PARTS.filter((k) => !OPTIONAL.includes(k) || Math.abs(r.parts[k]) >= 0.005)
    .map((k) => {
      const p = r.parts[k];
      const tone = p >= 0.005 ? 'good' : p <= -0.005 ? 'bad' : 'wb-dim';
      return `<span>${PART_NAMES[k]}</span><span class="wb-dim">${rawText(r, k)}</span><span class="${tone}">${signed(p)}</span>`;
    })
    .join('');
  const verdict = r.problem
    ? `<span class="bad">Não dá para fundar: ${r.problem}</span>`
    : r.value < r.min
      ? `<span class="warn">Passa no exame, mas a nota fica abaixo da mínima das colônias</span>`
      : `<span class="good">Dá para fundar aqui</span>`;
  const cell = r.cell <= SITE_NONE ? 'mar' : num(r.cell);
  return `<hr>
    <b>Onde assentar (depuração)</b>
    <span class="wb-dim">Visto de ${who} · ${ERAS[Math.floor(r.tech)] ?? `era ${Math.floor(r.tech) + 1}`} · motivo: ${MOTIVE_TEXT[r.motive]}</span>
    <div class="wb-sitegrid">${rows}</div>
    <span><b>Nota ${num(r.value)}</b> · mínima das colônias ${num(r.min, 1)} · célula ${cell}</span>
    ${verdict}`;
}

/** Legenda da camada: a rampa, as marcas da nota e o que ela mede. */
export function siteLegend(): string {
  const stops = SITE_RAMP.map((c, k) => `rgb(${c.join(',')}) ${Math.round((k / (SITE_RAMP.length - 1)) * 100)}%`).join(', ');
  const ticks = Array.from({ length: SITE_TOP + 1 }, (_, k) => `<span>${k === SITE_TOP ? `${k}+` : k}</span>`).join('');
  return `<b>Notas dos sítios (${keyLabel('sites')})</b>
    <div class="wb-ramp" style="background:linear-gradient(to right, ${stops})"></div>
    <div class="wb-ticks">${ticks}</div>
    <span class="wb-dim">Células de 16×16 tiles · fundador da Idade da Pedra · já descontados os vizinhos · mar sem cor. A ficha dá a nota do ponto.</span>`;
}

/**
 * Camada de depuração do campo de sítios (onde assentar, RF-AS-04): a nota de cada célula pintada por cima do
 * mapa, no molde do clima (`WeatherView`): uma imagem de uma célula por pixel, esticada sobre o mapa. Dirty Flag:
 * a imagem só é refeita quando a versão do campo muda (`EngineView.siteField`). Lê só a vista do motor.
 */
export class SiteView {
  private image: HTMLCanvasElement | null = null;
  private version = -1;

  constructor(
    private readonly view: () => EngineView,
    private readonly settings: { showSites: boolean },
  ) {}

  get on(): boolean {
    return this.settings.showSites;
  }

  /** As notas por cima do mapa e o contorno da célula sob o mouse (canvas dos territórios). */
  draw(ctx: CanvasRenderingContext2D, view: Viewport): void {
    if (!this.on) return;
    const f = this.view().siteField();
    if (!f) return;
    if (!this.image || f.version !== this.version) {
      this.image = this.paint(f, this.image);
      this.version = f.version;
    }
    const z = view.zoom;
    const mw = view.mapWidth;
    const mh = view.mapHeight;
    const span = mw * z;
    const x0 = (0 - view.center.x) * z + view.width / 2;
    const y0 = view.height / 2 - (mh - view.center.y) * z;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const off of [-span, 0, span]) {
      const x = x0 + off;
      if (x > view.width || x + span < 0) continue;
      // A última coluna de células passa da borda do mapa quando a largura não é múltipla da célula: recorta.
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y0, span, mh * z);
      ctx.clip();
      ctx.drawImage(this.image, x, y0, f.cols * f.cell * z, f.rows * f.cell * z);
      ctx.restore();
    }
    if (view.hovering) {
      const col = ((Math.floor(view.hover.x / f.cell) % f.cols) + f.cols) % f.cols;
      const row = Math.floor(view.toRow(view.hover.y) / f.cell);
      if (row >= 0 && row < f.rows) {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(20,12,4,0.8)';
        ctx.strokeRect(view.screenX(col * f.cell), view.canvasY(row * f.cell), f.cell * z, f.cell * z);
      }
    }
    ctx.restore();
  }

  /** Bloco da ficha do tile (x, linha) com a camada ligada; vazio com ela desligada. */
  info(x: number, row: number): string {
    if (!this.on) return '';
    const view = this.view();
    const r = view.siteAt(x, row);
    return r ? siteCard(r, view) : '<hr><b>Onde assentar (depuração)</b><span class="wb-dim">Ainda não há campo de sítios: o mundo não tem povos.</span>';
  }

  /** Pinta a imagem das notas (uma célula por pixel), reaproveitando o canvas do mesmo tamanho. */
  private paint(f: SiteFieldView, prev: HTMLCanvasElement | null): HTMLCanvasElement {
    const c = prev?.width === f.cols && prev.height === f.rows ? prev : document.createElement('canvas');
    c.width = f.cols;
    c.height = f.rows;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(f.cols, f.rows);
    const d = img.data;
    for (let k = 0; k < f.score.length; k++) {
      const s = f.score[k];
      if (s <= SITE_NONE) continue;
      const [r, g, b] = siteColor(s);
      const t = Math.max(0, Math.min(1, s / SITE_TOP));
      d[k * 4] = r;
      d[k * 4 + 1] = g;
      d[k * 4 + 2] = b;
      d[k * 4 + 3] = Math.round((ALPHA_LOW + (ALPHA_HIGH - ALPHA_LOW) * t) * 255);
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
}
