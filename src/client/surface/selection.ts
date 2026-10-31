import { elderAge, type Ecosystem, type Village } from '../../sim/ecosystem';
import { CHILD } from '../../sim/roles';
import { animalStage, personName } from '../../sim/people';
import { ROLE_NAMES, ROLES } from './art';
import { PICK_LIFT } from './tools';
import type { Viewport } from './Viewport';

/** Ficha fixada: uma criatura (com o `uid`, porque o índice é reaproveitado), um grupo ou um lugar. */
export type Pinned = { creature: number; uid: number } | { group: number[]; set: Set<number> } | { x: number; y: number } | null;
/** Destaque no mapa: uma espécie inteira ou uma profissão de um assentamento (RF-VIDA-337). */
export type Highlight = { species: number } | { village: number; role: number } | null;

/** O que a seleção precisa do resto da tela. */
export interface SelectionHost {
  openSettlement(id: number): void;
  /** A ficha deve ser refeita já. */
  refreshInfo(): void;
  redraw(): void;
  say(text: string): void;
  goTo(x: number, row: number): void;
  /** Uma camada abriu ou fechou (pilha do Esc). */
  layer(id: 'crowd' | 'pinned' | 'highlight', open: boolean): void;
}

/**
 * O que o jogador escolheu no mapa (RF-VIDA-330 a 337): a criatura sob o
 * mouse, a ficha fixada, o grupo do Shift + arrastar, o destaque de espécie
 * ou profissão, a lista "N aqui" e a câmera que segue.
 */
export class Selection {
  pinned: Pinned = null;
  /** A câmera acompanha a criatura fixada (RF-VIDA-333). */
  follow = false;
  /** Criatura que seria escolhida num clique agora, com contorno (RF-VIDA-330). */
  hoverPick = -1;
  /** Último clique numa pilha de criaturas, para passar à próxima (RF-VIDA-331). */
  private cycle: { x: number; y: number; list: number[]; k: number } | null = null;
  /** Lista "N aqui" quando há mais de 3 criaturas sob o clique. */
  crowd: number[] | null = null;
  highlight: Highlight = null;
  private highlightStep = 0;
  /** Nome de quem está fixado, para o aviso da morte. */
  lastName: string | null = null;

  constructor(
    private readonly eco: Ecosystem,
    private readonly view: Viewport,
    private readonly crowdEl: HTMLElement,
    private readonly host: SelectionHost,
  ) {}

  /** A criatura fixada, se ainda é a mesma pessoa e está viva; senão -1. */
  get creature(): number {
    const p = this.pinned;
    return p && 'creature' in p && this.eco.alive[p.creature] && this.eco.uid[p.creature] === p.uid ? p.creature : -1;
  }

  /**
   * Clique da mão vazia (RF-VIDA-330, 331 e 340): na praça ou num prédio
   * abre a janela do assentamento; sobre criaturas escolhe a mais perto, e
   * clicar de novo no mesmo ponto passa para a próxima; no vazio do
   * assentamento fixa a ficha do lugar; no resto solta a seleção.
   */
  pin(): void {
    const view = this.view;
    const row = view.toRow(view.hover.y);
    const tile = view.tileIndex(view.hover.x, view.hover.y);
    const anchor = tile >= 0 ? this.anchorAt(tile) : null;
    if (anchor) {
      this.host.openSettlement(anchor.id);
      return;
    }
    const list = this.eco.pickAll(view.hover.x, row + PICK_LIFT, view.pickRadius());
    this.showCrowd(null);
    if (list.length) {
      const m = view.mouse;
      const c = this.cycle;
      const same = !!c && !!m && Math.hypot(m.x - c.x, m.y - c.y) < 6 && list.length === c.list.length && list.every((i) => c.list.includes(i));
      const k = same ? (c!.k + 1) % list.length : 0;
      this.cycle = m ? { x: m.x, y: m.y, list, k } : null;
      this.select(same ? this.cycle!.list[k] : list[0], false);
      if (!same && list.length > 3) this.showCrowd(list);
      return;
    }
    this.cycle = null;
    this.follow = false;
    this.setPinned(this.eco.villageAt(view.hover.x, row) ? { x: view.hover.x, y: view.hover.y } : null);
    this.host.refreshInfo();
  }

  private setPinned(p: Pinned): void {
    this.pinned = p;
    this.host.layer('pinned', !!p);
  }

  /** Solta a ficha fixada. */
  unpin(): void {
    this.setPinned(null);
    this.follow = false;
    this.host.refreshInfo();
    this.host.redraw();
  }

  /** Assentamento cuja praça ou prédio está neste tile (RF-VIDA-340). */
  anchorAt(i: number): Village | null {
    const eco = this.eco;
    const w = eco.map.width;
    const x = i % w;
    const y = Math.floor(i / w);
    if (eco.road[i] === 3) return eco.settlementAt(x + 0.5, y + 0.5);
    if (!eco.built[i]) return null;
    for (const v of eco.villages) {
      if (v.abandoned) continue;
      for (const h of v.houses) {
        const size = h.kind === 'port' ? 0 : 1;
        if (y >= h.y && y <= h.y + size && (x - h.x + w) % w <= size) return h.kind === 'house' ? null : v;
      }
    }
    return null;
  }

  /** Escolhe uma criatura e fixa a ficha dela. */
  select(i: number, closeCrowd = true): void {
    const eco = this.eco;
    if (i < 0 || !eco.alive[i]) return;
    if (closeCrowd) this.showCrowd(null);
    const p = this.pinned;
    if (!(p && 'creature' in p && p.uid === eco.uid[i])) this.follow = false;
    this.setPinned({ creature: i, uid: eco.uid[i] });
    this.host.redraw();
    this.host.refreshInfo();
  }

  /** Lista pequena "N aqui" para escolher numa pilha de criaturas (RF-VIDA-331). */
  showCrowd(list: number[] | null): void {
    this.crowd = list;
    const el = this.crowdEl;
    const m = this.view.mouse;
    if (!list || !m) {
      el.hidden = true;
      this.crowd = null;
      this.host.layer('crowd', false);
      return;
    }
    const rows = list
      .slice(0, 12)
      .map((i) => `<button data-pickone="${i}">${this.shortName(i)}</button>`)
      .join('');
    el.innerHTML = `<b>${list.length} aqui</b>${rows}${list.length > 12 ? `<span>e mais ${list.length - 12}</span>` : ''}`;
    el.style.transform = `translate(${m.x + 16}px, ${m.y - 8}px)`;
    el.hidden = false;
    this.host.layer('crowd', true);
  }

  /** "Enka, caçador" ou "Lobo, adulto": o nome curto da lista e dos avisos. */
  shortName(i: number): string {
    const eco = this.eco;
    const sp = eco.species[eco.kind[i]];
    if (sp.kind === 'sapient' && eco.village[i] >= 0) return `${personName(eco.uid[i], eco.villages[eco.village[i]].culture.id)}, ${this.lifeStage(i).toLowerCase()}`;
    if (sp.kind === 'sapient') return `${sp.name}, sem assentamento`;
    return `${sp.name}, ${animalStage(eco.age[i], sp.maturity, sp.maxAge)}`;
  }

  /** Profissão, ou a fase da vida de quem não trabalha. */
  lifeStage(i: number): string {
    const eco = this.eco;
    const role = eco.role[i];
    if (role === CHILD) return 'Criança';
    const sp = eco.species[eco.kind[i]];
    const v = eco.villages[eco.village[i]];
    const name = ROLE_NAMES[ROLES[role]];
    return eco.age[i] >= elderAge(sp, Math.floor(v.tech)) ? (role >= ROLES.indexOf('leader') ? `${name} idoso` : 'Idoso') : name;
  }

  /** Shift + arrastar: seleciona as criaturas dentro do retângulo de tela (RF-VIDA-336). */
  selectBox(b: { x0: number; y0: number; x1: number; y1: number }): void {
    if (Math.abs(b.x1 - b.x0) < 4 || Math.abs(b.y1 - b.y0) < 4) return;
    const [ax, ay] = this.view.screenToMap(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1));
    const [bx, by] = this.view.screenToMap(Math.max(b.x0, b.x1), Math.max(b.y0, b.y1));
    const list = this.eco.pickRect(ax, ay, bx, by);
    this.follow = false;
    const group = list.map((i) => this.eco.uid[i]);
    this.setPinned(list.length ? { group, set: new Set(group) } : null);
    this.host.redraw();
    this.host.refreshInfo();
  }

  /** Liga ou desliga a câmera que segue a criatura fixada (botão Seguir e tecla F). */
  toggleFollow(): void {
    if (!this.pinned || !('creature' in this.pinned)) return;
    this.follow = !this.follow;
    this.host.refreshInfo();
  }

  /**
   * Destaca uma espécie ou uma profissão no mapa; cada clique seguido leva a
   * câmera ao próximo indivíduo (RF-VIDA-337).
   */
  highlightNext(h: NonNullable<Highlight>): void {
    const same = JSON.stringify(h) === JSON.stringify(this.highlight);
    this.setHighlight(h);
    const list = this.highlighted();
    if (!list.length) {
      this.host.say('Ninguém assim no mapa agora');
      return;
    }
    this.highlightStep = same ? (this.highlightStep + 1) % list.length : 0;
    const i = list[this.highlightStep];
    this.host.goTo(this.eco.x[i], this.eco.y[i]);
    this.host.say(`${this.highlightStep + 1} de ${list.length} · clique de novo para o próximo · Esc tira o destaque`);
    this.host.redraw();
  }

  setHighlight(h: Highlight): void {
    this.highlight = h;
    this.host.layer('highlight', !!h);
    this.host.redraw();
  }

  /** Índices destacados agora. */
  highlighted(): number[] {
    const h = this.highlight;
    if (!h) return [];
    const eco = this.eco;
    const out: number[] = [];
    for (let i = 0; i < eco.count; i++) {
      if (!eco.alive[i]) continue;
      if ('species' in h ? eco.kind[i] === h.species : eco.village[i] === h.village && eco.role[i] === h.role) out.push(i);
    }
    return out;
  }

  /**
   * Uma vez por quadro, antes do mouse: a câmera que segue (pela posição
   * desenhada, `at`) e o lugar da pessoa aberta na ficha, que mantém o modo
   * completo da simulação (RF-AS-30 e 31).
   */
  track(at: { x(i: number): number; y(i: number): number }): void {
    const view = this.view;
    const eco = this.eco;
    const i = this.creature;
    if (this.follow && i >= 0) {
      view.center.x = at.x(i);
      view.center.y = view.mapHeight - at.y(i);
    }
    const p = this.pinned;
    eco.pinned = p && 'creature' in p && eco.alive[p.creature] ? eco.village[p.creature] : -1;
  }

  /** Quem seria escolhido num clique agora ganha contorno (RF-VIDA-330); só com a mão vazia. */
  updatePick(handEmpty: boolean): void {
    const view = this.view;
    this.hoverPick = handEmpty && view.hovering ? this.eco.pick(view.hover.x, view.toRow(view.hover.y) + PICK_LIFT, view.pickRadius()) : -1;
  }
}
