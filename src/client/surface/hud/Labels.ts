import type { Ecosystem } from '../../../sim/ecosystem';
import { VOCATION_ICONS } from '../../../sim/needs';
import { stateIcons } from '../settlementWindow';
import type { Viewport } from '../Viewport';

/** O que o rótulo mostra agora; cada campo só vai para o DOM quando muda. */
interface Label {
  el: HTMLDivElement;
  hidden: boolean;
  text: string;
  title: string;
  color: string;
  transform: string;
  open: boolean;
}

/**
 * Nomes dos assentamentos sobre o mapa (como no WorldBox), visíveis com
 * zoom; clicar abre a janela (RF-VIDA-340). Refeitos a cada desenho, mas o
 * DOM só é tocado no que mudou (texto, dica, cor, posição, aberto).
 */
export class Labels {
  private readonly labels = new Map<number, Label>();

  constructor(private readonly container: HTMLElement) {}

  update(eco: Ecosystem, view: Viewport, show: boolean, openId: number | null): void {
    const w = view.width;
    const h = view.height;
    for (const v of eco.villages) {
      let l = this.labels.get(v.id);
      if (!show || v.abandoned) {
        if (l) this.hide(l);
        continue;
      }
      const sx = view.screenX(v.x);
      const sy = view.glY(v.y - 2.5);
      if (sx < -100 || sx > w + 100 || sy < -40 || sy > h + 40) {
        if (l) this.hide(l);
        continue;
      }
      if (!l) {
        const el = document.createElement('div');
        el.className = 'wb-village';
        el.dataset.vid = String(v.id);
        this.container.appendChild(el);
        l = { el, hidden: false, text: '', title: '', color: '', transform: '', open: false };
        this.labels.set(v.id, l);
      }
      if (l.hidden) {
        l.hidden = false;
        l.el.hidden = false;
      }
      // Ícone simples da vocação antes do nome e os ícones de estado depois (RF-VIDA-224 e 349).
      const icon = v.vocation ? `${VOCATION_ICONS[v.vocation]} ` : '';
      const marks = stateIcons(eco, v);
      const capital = v.kingdom === v.id;
      const size = capital ? eco.kingdomSize(v) : 0;
      const text = (capital && size > 1 ? `♛ ${icon}${eco.polityName(v)} · ${eco.kingdomPopulation(v)}` : `${icon}${eco.tierName(v)} ${v.name} · ${v.population}`) + (marks ? ` ${marks}` : '');
      const open = openId === v.id;
      if (l.open !== open) {
        l.open = open;
        l.el.classList.toggle('open', open);
      }
      if (l.text !== text) l.el.textContent = l.text = text;
      const color = `rgb(${v.color.join(',')})`;
      if (l.color !== color) l.el.style.borderLeftColor = l.color = color;
      const title = `${capital && size === 1 ? `Povo ${v.culture.name}` : `${eco.polityName(v)} · povo ${v.culture.name}`} · clique para abrir a janela`;
      if (l.title !== title) l.el.title = l.title = title;
      const transform = `translate(${sx}px, ${h - sy}px) translate(-50%, -100%)`;
      if (l.transform !== transform) l.el.style.transform = l.transform = transform;
    }
  }

  private hide(l: Label): void {
    if (l.hidden) return;
    l.hidden = true;
    l.el.hidden = true;
  }
}
