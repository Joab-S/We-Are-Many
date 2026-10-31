import { Ecosystem } from '../../../sim/ecosystem';
import { VOCATION_ICONS } from '../../../sim/needs';
import { settlementTabHtml, stateIcons, type PeriodSpan, type SettlementTab } from '../settlementWindow';
import { VWIN_HZ } from '../tools';
import { HtmlSlot, HudComponent } from './component';
import type { IconCache } from './icons';

/** Janela do assentamento (RF-VIDA-341): só a aba visível é refeita, no máximo VWIN_HZ vezes por segundo. */
export class SettlementView extends HudComponent {
  /** Assentamento aberto e a aba visível. */
  open: { id: number; tab: SettlementTab } | null = null;
  span: PeriodSpan = 10;
  private readonly body: HtmlSlot;
  private readonly title: HtmlSlot;

  constructor(
    private readonly root: HTMLElement,
    private readonly icons: IconCache,
  ) {
    super(1000 / VWIN_HZ);
    this.body = new HtmlSlot(root.querySelector<HTMLElement>('[data-vwin-body]')!);
    this.title = new HtmlSlot(root.querySelector<HTMLElement>('[data-vwin-title]')!);
  }

  get id(): number | null {
    return this.open?.id ?? null;
  }

  /** Abre (ou fecha, com null) a janela do assentamento. */
  show(eco: Ecosystem, id: number | null): void {
    this.open = id === null ? null : { id, tab: this.open?.id === id ? this.open.tab : 'summary' };
    this.body.reset();
    this.root.querySelector<HTMLElement>('[data-vwin]')!.hidden = !this.open;
    this.tick(eco, performance.now(), true);
  }

  setTab(eco: Ecosystem, tab: SettlementTab): void {
    if (!this.open) return;
    this.open.tab = tab;
    this.body.reset();
    this.tick(eco, performance.now(), true);
  }

  setSpan(eco: Ecosystem, span: PeriodSpan): void {
    if (!this.open) return;
    this.span = span;
    this.body.reset();
    this.tick(eco, performance.now(), true);
  }

  protected update(eco: Ecosystem): void {
    if (!this.open) return;
    const v = eco.villages[this.open.id];
    if (!v) return;
    const tab = this.open.tab;
    const html = settlementTabHtml(eco, v, tab, (e) => Ecosystem.describe(e), this.span);
    this.title.set(`${this.icons.crest(eco.villages[v.kingdom])}<span>${v.vocation ? `${VOCATION_ICONS[v.vocation]} ` : ''}${eco.tierName(v)} ${v.name} ${stateIcons(eco, v)}</span>`);
    this.root.querySelectorAll<HTMLElement>('[data-vtab]').forEach((b) => b.classList.toggle('on', b.dataset.vtab === tab));
    const body = this.body.el;
    const scroll = body.scrollTop;
    if (this.body.set(html)) body.scrollTop = scroll;
  }
}
