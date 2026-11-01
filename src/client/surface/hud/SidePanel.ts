import { icon as svgIcon } from '../../ui/icons';
import { Ecosystem, ERAS, WAR_MOTIVES } from '../../../sim/ecosystem';
import { SPEEDS } from '../SimDriver';
import { REAL_YEAR_SECONDS } from '../tools';
import { HtmlSlot, HudComponent } from './component';
import type { SurfaceSettings } from './Windows';

/** Quanto falta para a próxima era no assentamento mais avançado. */
function progressLine(live: { tech: number }[]): string {
  if (!live.length) return '';
  const top = Math.max(...live.map((v) => v.tech));
  const era = Math.floor(top);
  if (era >= ERAS.length - 1) return ' · última era';
  return ` · rumo à ${ERAS[era + 1]}: ${Math.floor((top - era) * 100)}%`;
}

/**
 * Painel lateral e relógio: ano, era, velocidade, população, povos, guerras
 * e acontecimentos importantes (a cada 150 ms), e a linha de terra e
 * vegetação do topo, que varre o mapa só quando ele mudou e no máximo uma
 * vez por segundo (Dirty Flag).
 */
export class SidePanel extends HudComponent {
  private readonly clock: HtmlSlot;
  private readonly panel: HtmlSlot;
  private readonly stats: HTMLElement;
  private landPct = 0;
  private lifePct = 0;
  private statsVersion = -1;
  private statsAt = -Infinity;

  constructor(
    root: HTMLElement,
    private readonly settings: SurfaceSettings,
    private readonly speed: () => number,
    /** Contador de mudanças do mapa (sobe a cada tile repintado). */
    private readonly mapVersion: () => number,
  ) {
    super(150);
    this.clock = new HtmlSlot(root.querySelector<HTMLElement>('[data-clock]')!);
    this.panel = new HtmlSlot(root.querySelector<HTMLElement>('[data-p]')!);
    this.stats = root.querySelector<HTMLElement>('[data-s]')!;
  }

  /** Refaz o painel na próxima vez (destaque novo, opção trocada). */
  refresh(): void {
    this.panel.reset();
    this.invalidate();
  }

  protected update(eco: Ecosystem, now: number): void {
    const live = eco.villages.filter((v) => !v.abandoned);
    const kingdoms = live.filter((v) => v.kingdom === v.id).length;
    const era = live.length ? ERAS[Math.floor(Math.max(...live.map((v) => v.tech)))] : 'Sem civilização';
    const alive = eco.species
      .map((sp, s) => ({ sp, s, n: eco.population[s] }))
      .filter((r) => r.n > 0)
      .sort((a, b) => b.n - a.n);
    const rows = alive
      .slice(0, 7)
      .map(({ sp, s, n }) => `<button class="wb-goto wb-pop" data-species="${s}" title="Destacar no mapa; clique de novo para ir ao próximo"><i style="background:rgb(${sp.color.join(',')})"></i>${sp.name}<b>${n}</b></button>`)
      .join('');
    const more = alive.length > 7 ? `<button class="wb-goto" data-open="species">+ ${alive.length - 7} espécies…</button>` : '';
    const events = eco.chronicle.filter((e) => this.settings.showMinor || e.major).slice(0, 6);
    const speed = this.speed();
    this.clock.set(`
      <div class="wb-clock-text"><b>${era}</b><span>Ano ${Math.floor(eco.year)}${progressLine(live)}</span></div>
      <div class="wb-speed">${SPEEDS.map((v, k) => `<button data-speed="${k}" class="${k === speed ? 'on' : ''}" title="${v === 0 ? 'Pausa (Espaço)' : `Velocidade ${v}x (${k + 1})`}">${v === 0 ? svgIcon('pause') : `${v}x`}</button>`).join('')}</div>`);
    this.panel.set(`
      <div class="wb-section">População</div>
      ${rows || '<div class="wb-empty">Nenhuma espécie. Leve uma pela aba Vida.</div>'}
      ${more}
      <div class="wb-section">Povos</div>
      <div class="wb-pop">Assentamentos<b>${live.length}</b></div>
      ${kingdoms ? `<button class="wb-goto" data-open="kingdoms">Reinos e povos<b>${kingdoms}</b></button>` : ''}
      ${eco.alliances.size ? `<div class="wb-pop">Alianças<b>${eco.alliances.size}</b></div>` : ''}
      ${eco.wars.map((war) => `<button class="wb-goto bad" data-village="${war.target}" title="${WAR_MOTIVES[war.motive]}">⚔ ${eco.villages[war.a].name} × ${eco.villages[war.b].name} · ${WAR_MOTIVES[war.motive]}<b>${war.losses[0] + war.losses[1]}†</b></button>`).join('')}
      ${[...live]
        .sort((a, b) => b.population - a.population)
        .slice(0, 4)
        .map((v) => `<button class="wb-goto" data-village="${v.id}"><i style="background:rgb(${v.color.join(',')})"></i>${eco.tierName(v)} ${v.name}<b>${v.population}</b></button>`)
        .join('')}
      ${events.length ? `<div class="wb-section">Acontecimentos</div>${events.map((e) => `<button class="wb-log"${e.x >= 0 ? ` data-go="${e.x.toFixed(1)},${e.y.toFixed(1)}"` : ''}><span class="wb-yr">${Math.floor(e.year)}</span> ${Ecosystem.describe(e)}</button>`).join('')}<button class="wb-goto" data-open="chronicle">Crônica completa…</button>` : ''}`);
    this.updateStats(eco, now);
    const yrSec = Number((REAL_YEAR_SECONDS / Math.max(1, SPEEDS[speed])).toFixed(1));
    const text = `terra ${this.landPct}% · vegetação ${this.lifePct}% · 1 ano = ${yrSec} s`;
    if (this.stats.textContent !== text) this.stats.textContent = text;
  }

  /** Terra e vegetação pela amostra de 1 em cada 7 tiles, refeita só quando o mapa mudou (e no máximo 1 vez por segundo). */
  private updateStats(eco: Ecosystem, now: number): void {
    const version = this.mapVersion();
    if (version === this.statsVersion || now - this.statsAt < 1000) return;
    this.statsVersion = version;
    this.statsAt = now;
    const map = eco.map;
    let land = 0;
    let life = 0;
    for (let k = 0; k < map.elevation.length; k += 7) {
      if (map.elevation[k] >= 0) land++;
      life += map.vegetation[k];
    }
    const total = map.elevation.length / 7;
    this.landPct = Math.round((land / total) * 100);
    this.lifePct = Math.round((life / total) * 100);
  }
}
