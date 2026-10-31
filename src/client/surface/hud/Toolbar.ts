import { icon as svgIcon } from '../../ui/icons';
import { temperatureAt } from '../../../procgen/surface';
import type { Ecosystem } from '../../../sim/ecosystem';
import type { Tab, Tool } from '../tools';
import type { Viewport } from '../Viewport';
import { HudComponent } from './component';
import type { IconCache } from './icons';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** O que a barra precisa: a lista de ferramentas e a ferramenta na mão (quem guarda é a máquina de estados). */
export interface ToolbarHost {
  tools(): Tool[];
  readonly tool: Tool | null;
  setTool(t: Tool | null): void;
}

/**
 * Barra de ferramentas: abas, botões de cada ferramenta, pincel, alvo de
 * temperatura e limite, a faixa de dica, o ícone ao lado do cursor e a
 * leitura da temperatura sob o mouse (aba Clima, a cada 150 ms).
 */
export class Toolbar extends HudComponent {
  tab: Tab = 'terrain';
  brush = 6;
  /** Temperatura alvo das ferramentas de clima, em °C, e se Aquecer e Resfriar param nela. */
  targetC = 15;
  limitOn = true;
  private readonly bar: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly cursor: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly icons: IconCache,
    private readonly view: Viewport,
    private readonly host: ToolbarHost,
    private readonly signal: AbortSignal,
  ) {
    super(150);
    this.bar = root.querySelector<HTMLElement>('[data-bar]')!;
    this.tip = root.querySelector<HTMLElement>('[data-tip]')!;
    this.cursor = root.querySelector<HTMLElement>('[data-cursor]')!;
    this.scrollable(this.bar);
  }

  /** Temperatura alvo em K. */
  get target(): number {
    return this.targetC + 273.15;
  }

  /** Muda o tamanho do pincel (teclas [ e ]). */
  stepBrush(step: number): void {
    this.brush = clamp(this.brush + step, 1, 30);
    const input = this.root.querySelector<HTMLInputElement>('[data-b]');
    if (input) input.value = String(this.brush);
  }

  selectTab(tab: Tab): void {
    this.tab = tab;
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const tools = this.host.tools().filter((t) => t.tab === tab);
    if (this.host.tool && this.host.tool.tab !== tab) this.host.setTool(null);
    const bar = this.bar;
    let html = '';
    let group: string | undefined;
    for (const t of tools) {
      if (t.group !== group) {
        group = t.group;
        if (group) html += `<div class="wb-group">${group}</div>`;
      }
      html += `<button class="wb-tool" data-t="${t.id}" data-label="${t.label}" title="${t.tip}" aria-label="${t.label}">${this.icons.toolIcon(t)}</button>`;
    }
    bar.innerHTML = `
      ${html}
      <div class="wb-group"></div>
      <button class="wb-tool" data-t="inspect" data-label="Mão" aria-label="Mão" title="Mão vazia: arraste para mover o mapa e passe o mouse para ver detalhes, sem mexer em nada">${svgIcon('hand')}</button>
      <label class="wb-brush">Pincel <input type="range" min="1" max="30" value="${this.brush}" data-b /></label>
      ${
        tab === 'climate'
          ? `<label class="wb-brush" title="Temperatura que Aquecer, Resfriar e Ajustar buscam">Alvo <input type="range" min="-150" max="450" value="${this.targetC}" data-tc /> <b data-tcv>${this.targetC} °C</b></label>
      <label class="wb-brush" title="Com o limite, Aquecer e Resfriar param no alvo"><input type="checkbox" data-tl ${this.limitOn ? 'checked' : ''} /> Limitar ao alvo</label>
      <span class="wb-brush" data-tnow title="Temperatura sob o mouse e o quanto o pincel consegue mudar ali"></span>`
          : ''
      }`;
    const signal = this.signal;
    bar.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => {
      b.addEventListener(
        'click',
        () => {
          // Clicar de novo na ferramenta da mão a guarda (volta à mão vazia).
          const t = this.host.tools().find((it) => it.id === b.dataset.t) ?? null;
          this.host.setTool(t && t !== this.host.tool ? t : null);
        },
        { signal },
      );
      // Passar o mouse numa casa mostra o nome e a dica no lugar da faixa de dica; ao sair, volta o texto da ferramenta ativa.
      b.addEventListener('mouseenter', () => (this.tip.innerHTML = `<b>${b.dataset.label}</b>${b.title ? ` ${b.title}` : ''}`), { signal });
      b.addEventListener('mouseleave', () => this.refreshTool(), { signal });
    });
    bar.querySelector<HTMLInputElement>('[data-b]')!.addEventListener('input', (e) => (this.brush = Number((e.target as HTMLInputElement).value)), { signal });
    bar.querySelector<HTMLInputElement>('[data-tc]')?.addEventListener(
      'input',
      (e) => {
        this.targetC = Number((e.target as HTMLInputElement).value);
        bar.querySelector('[data-tcv]')!.textContent = `${this.targetC} °C`;
        this.refreshTool();
      },
      { signal },
    );
    bar.querySelector<HTMLInputElement>('[data-tl]')?.addEventListener(
      'change',
      (e) => {
        this.limitOn = (e.target as HTMLInputElement).checked;
        this.refreshTool();
      },
      { signal },
    );
    this.refreshTool();
  }

  /** Marca a ferramenta na mão e escreve a dica dela. */
  refreshTool(): void {
    const tool = this.host.tool;
    this.root.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => b.classList.toggle('on', (tool?.id ?? 'inspect') === b.dataset.t));
    const limited = tool && ['heat', 'cool', 'adjust'].includes(tool.id) ? ` Alvo: ${this.targetC} °C${tool.id !== 'adjust' ? (this.limitOn ? ' (limite ligado)' : ' (sem limite)') : ''}.` : '';
    this.tip.textContent = tool
      ? `${tool.label}: ${tool.tip}${limited} (clique de novo ou Esc para guardar${tool.terraform ? '; Ctrl+Z desfaz o último traço' : ''})`
      : 'Mão vazia: arraste para mover o mapa e passe o mouse para ver detalhes. Escolha uma ferramenta para mexer no mundo.';
  }

  /** Ícone da ferramenta na mão, ao lado do cursor (todo quadro). */
  updateCursor(): void {
    const el = this.cursor;
    const tool = this.host.tool;
    const m = this.view.mouse;
    if (!tool || !m) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.style.transform = `translate(${m.x + 14}px, ${m.y + 14}px)`;
    if (el.dataset.t !== tool.id) {
      el.dataset.t = tool.id;
      el.innerHTML = this.icons.toolIcon(tool);
    }
  }

  /** Leitura da temperatura sob o mouse e do que o pincel alcança ali (teto e piso por tile), na aba Clima. */
  protected update(eco: Ecosystem): void {
    const el = this.root.querySelector<HTMLElement>('[data-tnow]');
    if (!el) return;
    const view = this.view;
    const i = view.tileIndex(view.hover.x, view.hover.y);
    if (i < 0) {
      el.textContent = '';
      return;
    }
    const t = temperatureAt(eco.map, i);
    const base = t - eco.map.heat[i];
    const c = (k: number) => (k - 273.15).toFixed(0);
    const text = `Aqui ${c(t)} °C · alcance do pincel ${c(base - 150)} a ${c(base + 400)} °C`;
    if (el.textContent !== text) el.textContent = text;
  }

  /**
   * Barra de ferramentas rolável para o lado: roda do mouse, arrastar com o
   * mouse ou o dedo e a barra de rolagem. Um arraste não conta como clique.
   */
  private scrollable(bar: HTMLElement): void {
    const signal = this.signal;
    bar.addEventListener(
      'wheel',
      (e) => {
        e.stopPropagation();
        if (bar.scrollWidth <= bar.clientWidth) return;
        e.preventDefault();
        bar.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      },
      { signal, passive: false },
    );
    let drag: { x: number; left: number; id: number } | null = null;
    let moved = false;
    bar.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0 || e.target instanceof HTMLInputElement) return;
        drag = { x: e.clientX, left: bar.scrollLeft, id: e.pointerId };
        moved = false;
      },
      { signal },
    );
    bar.addEventListener(
      'pointermove',
      (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const dx = e.clientX - drag.x;
        if (!moved && Math.abs(dx) > 6) {
          moved = true;
          bar.setPointerCapture(e.pointerId);
        }
        if (moved) bar.scrollLeft = drag.left - dx;
      },
      { signal },
    );
    const end = () => {
      drag = null;
    };
    bar.addEventListener('pointerup', end, { signal });
    bar.addEventListener('pointercancel', end, { signal });
    bar.addEventListener(
      'click',
      (e) => {
        if (!moved) return;
        moved = false;
        e.stopPropagation();
        e.preventDefault();
      },
      { signal, capture: true },
    );
  }
}
