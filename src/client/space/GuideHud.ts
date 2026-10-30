import * as THREE from 'three';
import { formatDistance } from '../../core/flight';
import { etaSeconds, formatEta, radarRadius, type LogEntry, type NavTarget, type Suggestion } from '../../nav/guide';

/**
 * Interface do GUIA no modo 3D: radar, marcadores na tela, cartão do alvo,
 * mensagens e o painel de navegação (G). Tudo em DOM e Canvas 2D, então
 * funciona igual com ou sem placa de vídeo.
 */

export type EntryGroup = 'system' | 'star' | 'poi' | 'mark';

export interface NavEntry {
  key: string;
  group: EntryGroup;
  target: NavTarget;
  name: string;
  /** Posição no mundo (UA), atualizada ao vivo para corpos que orbitam. */
  pos: THREE.Vector3;
  dist: number;
  arrive: number;
  /** Cor CSS do ponto no radar. */
  color: string;
  /** Tipo e informações curtas para a lista. */
  detail: string;
  /** Mostrar um marcador na tela, mesmo sem ser o alvo. */
  marker?: boolean;
}

export interface TargetView {
  target: NavTarget;
  pos: THREE.Vector3;
  dist: number;
  arrive: number;
  /** Rota em duas etapas: indo primeiro ao sistema do alvo. */
  viaSystem: boolean;
  info: string;
  /** Distância ao corpo de onde a nave está saindo, para a estimativa de chegada. */
  depart: number;
}

export interface GuideHandlers {
  select(target: NavTarget): void;
  engage(target: NavTarget): void;
  search(text: string): NavEntry[];
  bookmarkRemove(id: string): void;
}

const GROUP_TITLES: Record<EntryGroup, string> = {
  system: 'Neste sistema',
  star: 'Estrelas próximas',
  poi: 'Pontos de interesse',
  mark: 'Marcadores',
};

const FILTERS: [EntryGroup, string][] = [
  ['system', 'Corpos'],
  ['star', 'Estrelas'],
  ['poi', 'Pontos'],
  ['mark', 'Marcas'],
];

const RADAR_RINGS: [number, string][] = [
  [1, '1 UA'],
  [100, '100 UA'],
  [63241, '1 al'],
  [632410, '10 al'],
];

interface Toast {
  el: HTMLDivElement;
  until: number;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class GuideHud {
  readonly root: HTMLDivElement;
  private readonly radar: HTMLCanvasElement;
  private readonly radarCtx: CanvasRenderingContext2D;
  private readonly card: HTMLDivElement;
  private readonly toasts: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly markers: HTMLDivElement;
  private readonly targetEl: HTMLDivElement;
  private readonly arrowEl: HTMLDivElement;
  private readonly progradeEl: HTMLDivElement;
  private readonly markerPool: HTMLDivElement[] = [];
  private readonly toastList: Toast[] = [];
  private entries: NavEntry[] = [];
  private suggestions: Suggestion[] = [];
  private log: LogEntry[] = [];
  private pulseStart = -1;
  private readonly hidden = new Set<EntryGroup>();
  private cueEl!: HTMLElement;
  private cueHtml = '';
  private panelRows: { el: HTMLElement; target: NavTarget }[] = [];
  private selected = 0;
  private lastPanel = 0;
  private searchText = '';
  private readonly abort = new AbortController();
  private readonly tmp = new THREE.Vector3();
  private readonly inv = new THREE.Quaternion();
  panelOpen = false;

  constructor(parent: HTMLElement, private readonly handlers: GuideHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'guide';
    this.root.innerHTML = `
      <div class="nav-markers"></div>
      <div class="guide-toasts"></div>
      <div class="hud-panel guide-card" hidden></div>
      <div class="nav-panel">
        <div class="nav-head"><span>Navegação</span><span class="nav-kbd"><kbd>Ctrl</kbd><kbd>K</kbd> buscar</span></div>
        <div class="guide-radar"><canvas></canvas></div>
        <div class="nav-cue" data-cue></div>
        <div class="nav-chips">${FILTERS.map(([id, label]) => `<button data-f="${id}" class="on">${label}</button>`).join('')}</div>
      </div>
      <div class="hud-panel guide-panel" hidden>
        <div class="guide-panel-head">
          <div class="hud-title">GUIA · NAVEGAÇÃO</div>
          <input type="text" placeholder="Buscar estrela, planeta, ponto..." spellcheck="false" />
          <button class="guide-close" title="Fechar (G)">✕</button>
        </div>
        <div class="guide-panel-body"></div>
        <div class="guide-panel-foot"><kbd>↑↓</kbd>escolher <kbd>Enter</kbd>ir (piloto automático) · clique seleciona, <b>Ir</b> liga o piloto · <kbd>G</kbd>fecha</div>
      </div>`;
    parent.appendChild(this.root);
    this.markers = this.root.querySelector('.nav-markers')!;
    this.toasts = this.root.querySelector('.guide-toasts')!;
    this.card = this.root.querySelector('.guide-card')!;
    this.radar = this.root.querySelector('.guide-radar canvas')!;
    this.radarCtx = this.radar.getContext('2d')!;
    this.cueEl = this.root.querySelector('[data-cue]')!;
    this.root.querySelectorAll<HTMLButtonElement>('[data-f]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.f as EntryGroup;
        if (this.hidden.has(id)) this.hidden.delete(id);
        else this.hidden.add(id);
        b.classList.toggle('on', !this.hidden.has(id));
      });
    });
    this.panel = this.root.querySelector('.guide-panel')!;

    this.targetEl = document.createElement('div');
    this.targetEl.className = 'nav-target';
    this.arrowEl = document.createElement('div');
    this.arrowEl.className = 'nav-arrow';
    this.progradeEl = document.createElement('div');
    this.progradeEl.className = 'nav-prograde';
    this.markers.append(this.progradeEl, this.targetEl, this.arrowEl);

    const opts = { signal: this.abort.signal };
    const input = this.panel.querySelector('input')!;
    input.addEventListener('input', () => {
      this.searchText = input.value.trim().toLowerCase();
      this.selected = 0;
      this.renderPanel();
    }, opts);
    this.panel.querySelector('.guide-close')!.addEventListener('click', () => this.togglePanel(false), opts);
    this.panel.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-row]');
      if (!el) return;
      const row = this.panelRows[Number(el.dataset.row)];
      if (!row) return;
      const action = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (action === 'del') this.handlers.bookmarkRemove(row.target.id);
      else if (action === 'go') {
        this.handlers.engage(row.target);
        this.togglePanel(false);
      } else this.handlers.select(row.target);
      this.renderPanel();
    }, opts);
    // Ctrl+K abre a busca do GUIA, a mesma lista do G.
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
        e.preventDefault();
        this.togglePanel(true);
      }
    }, opts);
    window.addEventListener('keydown', (e) => {
      if (!this.panelOpen) return;
      if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        e.preventDefault();
        const n = this.panelRows.length;
        if (!n) return;
        this.selected = (this.selected + (e.code === 'ArrowDown' ? 1 : n - 1)) % n;
        this.highlight();
      } else if (e.code === 'Enter') {
        const row = this.panelRows[this.selected];
        if (row) {
          this.handlers.engage(row.target);
          this.togglePanel(false);
        }
      } else if (e.code === 'Escape' && e.target instanceof HTMLInputElement) {
        e.target.blur();
      }
    }, opts);
  }

  /** Mensagem do GUIA no topo da tela. */
  say(text: string, tone: 'info' | 'good' | 'warn' = 'info', seconds = 7): void {
    const el = document.createElement('div');
    el.className = `guide-toast ${tone}`;
    el.innerHTML = `<b>GUIA</b> ${esc(text)}`;
    this.toasts.appendChild(el);
    this.toastList.push({ el, until: performance.now() + seconds * 1000 });
    while (this.toastList.length > 4) this.toastList.shift()!.el.remove();
  }

  pulse(): void {
    this.pulseStart = performance.now();
  }

  togglePanel(open = !this.panelOpen): void {
    this.panelOpen = open;
    this.panel.hidden = !open;
    if (open) {
      if (document.pointerLockElement) document.exitPointerLock();
      this.selected = 0;
      this.renderPanel();
    }
  }

  setData(entries: NavEntry[], suggestions: Suggestion[], log: LogEntry[]): void {
    this.entries = entries;
    this.suggestions = suggestions;
    this.log = log;
    const now = performance.now();
    if (this.panelOpen && now - this.lastPanel > 1000 && !this.panel.matches(':hover')) this.renderPanel();
  }

  /** Painel com sugestões, listas por grupo, busca e diário de bordo. */
  private renderPanel(): void {
    this.lastPanel = performance.now();
    const body = this.panel.querySelector('.guide-panel-body')!;
    const rows: { el: HTMLElement; target: NavTarget }[] = [];
    const parts: string[] = [];
    const row = (t: NavTarget, name: string, detail: string, dist: number, eta: string, color: string, extra = '') => {
      const i = rows.length;
      rows.push({ el: null as unknown as HTMLElement, target: t });
      parts.push(
        `<div class="guide-row" data-row="${i}"><i style="background:${color}"></i><span class="n">${esc(name)}<small>${esc(detail)}</small></span>` +
          `<span class="d">${formatDistance(dist)}<small>${eta}</small></span>${extra}<button data-act="go">Ir</button></div>`,
      );
    };
    const q = this.searchText;
    if (q) {
      parts.push('<div class="guide-sec">Resultados da busca</div>');
      const seen = new Set<string>();
      const all = [...this.entries, ...this.handlers.search(q)];
      for (const e of all) {
        if (seen.has(e.key) || !e.name.toLowerCase().includes(q)) continue;
        seen.add(e.key);
        row(e.target, e.name, e.detail, e.dist, '', e.color);
        if (rows.length > 40) break;
      }
      if (!rows.length) parts.push('<div class="guide-empty">Nada encontrado entre as estrelas carregadas. Aproxime-se da região ou tente outro nome.</div>');
    } else {
      parts.push('<div class="guide-sec">Sugestões do GUIA</div>');
      if (!this.suggestions.length) parts.push('<div class="guide-empty">Nada por perto ainda. Faça uma varredura (V).</div>');
      for (const s of this.suggestions) row(s.target, s.target.name, s.reason, s.distAu, `≈ ${formatEta(s.eta)}`, '#ffd34d');
      for (const g of ['system', 'mark', 'poi', 'star'] as EntryGroup[]) {
        const list = this.entries.filter((e) => e.group === g).slice(0, g === 'star' ? 14 : 20);
        if (!list.length) continue;
        parts.push(`<div class="guide-sec">${GROUP_TITLES[g]}</div>`);
        for (const e of list) row(e.target, e.name, e.detail, e.dist, '', e.color, e.target.kind === 'mark' ? '<button data-act="del" title="Apagar">✕</button>' : '');
      }
      parts.push('<div class="guide-sec">Diário de bordo</div>');
      if (!this.log.length) parts.push('<div class="guide-empty">Nenhuma descoberta ainda.</div>');
      for (const l of this.log.slice(-12).reverse()) {
        parts.push(`<div class="guide-log"><span>${formatClock(l.time)}</span> ${esc(l.text)}</div>`);
      }
    }
    body.innerHTML = parts.join('');
    body.querySelectorAll<HTMLElement>('[data-row]').forEach((el) => (rows[Number(el.dataset.row)].el = el));
    this.panelRows = rows;
    this.selected = Math.min(this.selected, Math.max(0, rows.length - 1));
    this.highlight();
  }

  private highlight(): void {
    this.panelRows.forEach((r, i) => r.el.classList.toggle('sel', i === this.selected));
    this.panelRows[this.selected]?.el.scrollIntoView({ block: 'nearest' });
  }

  /** Cartão do alvo: nome, distância, chegada e modo de pilotagem. */
  updateCard(view: TargetView | null, mode: 'manual' | 'cruise' | 'auto', top: Suggestion | null): void {
    const modeText = mode === 'auto' ? '<b class="auto">PILOTO AUTOMÁTICO</b> · <kbd>J</kbd>desliga' : mode === 'cruise' ? '<b class="cruise">CRUZEIRO</b> · <kbd>C</kbd>desliga' : 'Manual';
    if (!view) {
      this.card.hidden = false;
      this.card.innerHTML = `<div class="hud-title">SEM ALVO</div>
        ${top ? `<div class="sug">Sugestão: <b>${esc(top.target.name)}</b><small>${esc(top.reason)} · ≈ ${formatEta(top.eta)}</small></div><div><kbd>N</kbd>aceitar sugestão · <kbd>G</kbd>painel</div>` : '<div><kbd>V</kbd>varredura · <kbd>G</kbd>painel</div>'}
        <div class="mode">${modeText}</div>`;
      return;
    }
    const eta = formatEta(this.etaFor(view));
    this.card.hidden = false;
    this.card.innerHTML = `<div class="hud-title">ALVO</div>
      <div class="tname">${esc(view.target.name)}</div>
      <div class="tinfo">${esc(view.info)}</div>
      <div><span class="k">Distância</span> <b>${formatDistance(Math.max(0, view.dist))}</b></div>
      <div><span class="k">Chegada</span> <b>≈ ${eta}</b>${mode === 'auto' ? '' : ' <small>(com piloto)</small>'}</div>
      ${view.viaSystem ? '<div class="via">Rota em duas etapas: primeiro o sistema, depois o corpo.</div>' : ''}
      <div class="mode">${modeText}${mode === 'auto' ? '' : ' · <kbd>J</kbd>piloto automático'}</div>`;
  }

  private etaFor(view: TargetView): number {
    return etaSeconds(view.dist, view.arrive, view.depart);
  }

  /** Radar e marcadores, a cada frame. */
  frame(ship: THREE.Vector3, shipQuat: THREE.Quaternion, camera: THREE.PerspectiveCamera, view: TargetView | null, velocity: THREE.Vector3): void {
    const now = performance.now();
    while (this.toastList.length && this.toastList[0].until < now) this.toastList.shift()!.el.remove();
    this.drawRadar(ship, shipQuat, view, now);
    this.drawMarkers(ship, camera, view, velocity);
  }

  private drawRadar(ship: THREE.Vector3, shipQuat: THREE.Quaternion, view: TargetView | null, now: number): void {
    const css = this.radar.clientWidth || 232;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(css * dpr);
    if (this.radar.width !== px) this.radar.width = this.radar.height = px;
    const g = this.radarCtx;
    const R = px / 2 - 6 * dpr;
    const c = px / 2;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, px, px);
    g.fillStyle = 'rgba(8, 14, 22, 0.82)';
    g.beginPath();
    g.arc(c, c, R, 0, Math.PI * 2);
    g.fill();
    // Cone de visão à frente.
    g.fillStyle = 'rgba(79, 216, 232, 0.10)';
    g.beginPath();
    g.moveTo(c, c);
    g.arc(c, c, R, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6);
    g.closePath();
    g.fill();
    // Eixos e régua de graus na borda (0° é a proa).
    g.strokeStyle = 'rgba(79, 216, 232, 0.16)';
    g.lineWidth = dpr;
    g.beginPath();
    g.moveTo(c, c - R);
    g.lineTo(c, c + R);
    g.moveTo(c - R, c);
    g.lineTo(c + R, c);
    g.stroke();
    g.strokeStyle = 'rgba(174, 185, 198, 0.55)';
    for (let a = 0; a < 360; a += 30) {
      const t = (a * Math.PI) / 180 - Math.PI / 2;
      const len = (a % 90 === 0 ? 8 : 4) * dpr;
      g.beginPath();
      g.moveTo(c + Math.cos(t) * R, c + Math.sin(t) * R);
      g.lineTo(c + Math.cos(t) * (R - len), c + Math.sin(t) * (R - len));
      g.stroke();
    }
    g.strokeStyle = 'rgba(79, 216, 232, 0.35)';
    g.font = `${11 * dpr}px "Share Tech Mono", ui-monospace, monospace`;
    g.fillStyle = 'rgba(174, 185, 198, 0.85)';
    for (const [au, label] of RADAR_RINGS) {
      const r = radarRadius(au) * R;
      g.beginPath();
      g.arc(c, c, r, 0, Math.PI * 2);
      g.stroke();
      g.fillText(label, c + 3 * dpr, c - r + 12 * dpr);
    }
    g.beginPath();
    g.arc(c, c, R, 0, Math.PI * 2);
    g.stroke();
    // Onda da varredura.
    if (this.pulseStart >= 0) {
      const t = (now - this.pulseStart) / 1400;
      if (t > 1) this.pulseStart = -1;
      else {
        g.strokeStyle = `rgba(128, 255, 160, ${0.8 * (1 - t)})`;
        g.lineWidth = 2 * dpr;
        g.beginPath();
        g.arc(c, c, R * t, 0, Math.PI * 2);
        g.stroke();
      }
    }

    this.inv.copy(shipQuat).invert();
    const spot = (pos: THREE.Vector3) => {
      const v = this.tmp.copy(pos).sub(ship);
      const d = v.length();
      v.applyQuaternion(this.inv);
      const flat = Math.hypot(v.x, v.z) || 1;
      const r = radarRadius(d) * R;
      const x = c + (v.x / flat) * r;
      const y = c + (v.z / flat) * r;
      // Haste: para cima se o objeto está acima do plano da nave, para baixo se está abaixo.
      const stem = THREE.MathUtils.clamp((v.y / Math.max(d, 1e-12)) * 14, -14, 14) * dpr;
      return { x, y: y - stem, bx: x, by: y, stem };
    };
    const dot = (pos: THREE.Vector3, color: string, size: number, ring: string | null) => {
      const p = spot(pos);
      g.strokeStyle = color;
      g.globalAlpha = 0.55;
      g.lineWidth = dpr;
      g.beginPath();
      g.moveTo(p.bx, p.by);
      g.lineTo(p.x, p.y);
      g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = color;
      g.beginPath();
      g.arc(p.x, p.y, size * dpr, 0, Math.PI * 2);
      g.fill();
      if (ring) {
        g.strokeStyle = ring;
        g.lineWidth = 1.5 * dpr;
        g.beginPath();
        g.arc(p.x, p.y, (size + 3) * dpr, 0, Math.PI * 2);
        g.stroke();
      }
      return p;
    };
    // Rumo ao alvo: linha tracejada da nave até ele.
    if (view) {
      const p = spot(view.pos);
      g.strokeStyle = 'rgba(224, 194, 122, 0.8)';
      g.lineWidth = 1.5 * dpr;
      g.setLineDash([4 * dpr, 4 * dpr]);
      g.beginPath();
      g.moveTo(c, c);
      g.lineTo(p.bx, p.by);
      g.stroke();
      g.setLineDash([]);
    }
    const sug = new Set(this.suggestions.slice(0, 3).map((s) => s.target.id));
    const placed: { x: number; y: number; name: string; rank: number }[] = [];
    for (const e of this.entries) {
      if (this.hidden.has(e.group)) continue;
      const p = dot(e.pos, e.color, e.group === 'star' ? 1.8 : 2.6, sug.has(e.target.id) ? 'rgba(232, 163, 61, 0.9)' : null);
      placed.push({ x: p.x, y: p.y, name: e.target.name, rank: (sug.has(e.target.id) ? 0 : 10) + Math.hypot(p.bx - c, p.by - c) / R });
    }
    if (view) {
      const p = dot(view.pos, '#e0c27a', 3.2, '#e0c27a');
      placed.unshift({ x: p.x, y: p.y, name: view.target.name, rank: -1 });
    }
    // Nomes: o alvo, as sugestões e os mais próximos, sem sobrepor.
    placed.sort((a, b) => a.rank - b.rank);
    const boxes: [number, number, number, number][] = [];
    g.font = `${11 * dpr}px "Share Tech Mono", ui-monospace, monospace`;
    let shown = 0;
    for (const o of placed) {
      if (shown >= 8) break;
      const w = g.measureText(o.name).width;
      const right = o.x + 7 * dpr + w < px - 2 * dpr;
      const x0 = Math.max(2 * dpr, right ? o.x + 7 * dpr : o.x - 7 * dpr - w);
      const y0 = o.y - 6 * dpr;
      if (boxes.some(([bx, by, bw, bh]) => x0 < bx + bw && x0 + w > bx && y0 < by + bh && y0 + 12 * dpr > by)) continue;
      boxes.push([x0, y0, w, 12 * dpr]);
      g.fillStyle = o.rank === -1 ? '#e0c27a' : 'rgba(219, 226, 234, 0.9)';
      g.shadowColor = '#000';
      g.shadowBlur = 3 * dpr;
      g.fillText(o.name, x0, o.y + 4 * dpr);
      g.shadowBlur = 0;
      shown++;
    }
    // A nave no centro, apontando para cima.
    g.fillStyle = '#4fd8e8';
    g.beginPath();
    g.moveTo(c, c - 7 * dpr);
    g.lineTo(c - 5 * dpr, c + 5 * dpr);
    g.lineTo(c + 5 * dpr, c + 5 * dpr);
    g.closePath();
    g.fill();
    this.updateCue(ship, view);
  }

  /** Instrução de rumo: quanto virar e subir ou descer para ficar de frente para o alvo. */
  private updateCue(ship: THREE.Vector3, view: TargetView | null): void {
    let html: string;
    if (!view) html = '<span class="dim">Sem alvo · <kbd>T</kbd> trava o que está na mira</span>';
    else {
      const v = this.tmp.copy(view.pos).sub(ship).applyQuaternion(this.inv);
      const d = v.length() || 1;
      const yaw = Math.round((Math.atan2(v.x, -v.z) * 180) / Math.PI);
      const pitch = Math.round((Math.asin(THREE.MathUtils.clamp(v.y / d, -1, 1)) * 180) / Math.PI);
      if (Math.abs(yaw) <= 3 && Math.abs(pitch) <= 3) html = '<b class="ok">Alvo à frente</b>';
      else if (Math.abs(yaw) > 150) html = `<b>Meia-volta</b>${Math.abs(pitch) <= 3 ? '' : `<b>${pitch > 0 ? 'Subir' : 'Descer'} ${Math.abs(pitch)}°</b>`}`;
      else {
        const side = Math.abs(yaw) <= 3 ? '' : `<b>${yaw > 0 ? 'Direita' : 'Esquerda'} ${Math.abs(yaw)}°</b>`;
        const vert = Math.abs(pitch) <= 3 ? '' : `<b>${pitch > 0 ? 'Subir' : 'Descer'} ${Math.abs(pitch)}°</b>`;
        html = `<span class="dim">Virar</span>${side}${vert}`;
      }
    }
    if (html !== this.cueHtml) {
      this.cueHtml = html;
      this.cueEl.innerHTML = html;
    }
  }

  private drawMarkers(ship: THREE.Vector3, camera: THREE.PerspectiveCamera, view: TargetView | null, velocity: THREE.Vector3): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.inv.copy(camera.quaternion).invert();
    const toScreen = (pos: THREE.Vector3) => {
      const rel = this.tmp.copy(pos).sub(ship);
      const local = rel.clone().applyQuaternion(this.inv);
      const v = rel.project(camera);
      const front = local.z < 0;
      const on = front && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
      return { on, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, lx: local.x, ly: local.y };
    };

    // Marcador de rumo: para onde a nave está de fato indo.
    const speed = velocity.length();
    if (speed > 1e-9) {
      const s = toScreen(this.tmp.copy(velocity).multiplyScalar(1e6 / speed).add(ship).clone());
      this.progradeEl.hidden = !s.on;
      if (s.on) this.progradeEl.style.transform = `translate(${s.x}px, ${s.y}px)`;
    } else this.progradeEl.hidden = true;

    if (view) {
      const s = toScreen(view.pos);
      const label = `${view.target.name} · ${formatDistance(Math.max(0, view.dist))}`;
      if (s.on) {
        this.targetEl.hidden = false;
        this.arrowEl.hidden = true;
        this.targetEl.style.transform = `translate(${s.x}px, ${s.y}px)`;
        if (this.targetEl.dataset.label !== label) {
          this.targetEl.dataset.label = label;
          this.targetEl.innerHTML = `<span>${esc(label)}</span>`;
        }
      } else {
        // Fora da tela: seta na borda, apontando para o lado em que o alvo está.
        this.targetEl.hidden = true;
        this.arrowEl.hidden = false;
        const ang = Math.atan2(-s.ly, s.lx);
        const rx = w / 2 - 50;
        const ry = h / 2 - 50;
        const x = w / 2 + Math.cos(ang) * rx;
        const y = h / 2 + Math.sin(ang) * ry;
        this.arrowEl.style.transform = `translate(${x}px, ${y}px) rotate(${ang}rad)`;
        this.arrowEl.title = label;
      }
    } else {
      this.targetEl.hidden = true;
      this.arrowEl.hidden = true;
    }

    let n = 0;
    const sug = new Set(this.suggestions.slice(0, 3).map((s) => s.target.id));
    for (const e of this.entries) {
      if (!(e.marker || sug.has(e.target.id)) || (view && view.target.id === e.target.id)) continue;
      const s = toScreen(e.pos);
      if (!s.on) continue;
      let el = this.markerPool[n];
      if (!el) {
        el = document.createElement('div');
        el.className = 'nav-mark';
        this.markers.appendChild(el);
        this.markerPool.push(el);
      }
      el.hidden = false;
      el.classList.toggle('sug', sug.has(e.target.id));
      el.style.transform = `translate(${s.x}px, ${s.y}px)`;
      el.style.setProperty('--c', e.color);
      const label = `${e.name} · ${formatDistance(e.dist)}`;
      if (el.dataset.label !== label) {
        el.dataset.label = label;
        el.innerHTML = `<span>${esc(label)}</span>`;
      }
      n++;
    }
    for (let i = n; i < this.markerPool.length; i++) this.markerPool[i].hidden = true;
  }

  dispose(): void {
    this.abort.abort();
    this.root.remove();
  }
}

function formatClock(t: number): string {
  const m = Math.floor(t / 60);
  return `${m.toString().padStart(2, '0')}:${Math.floor(t % 60).toString().padStart(2, '0')}`;
}
