import * as THREE from 'three';
import { formatDistance } from '../../core/flight';
import { icon } from '../ui/icons';
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
  private cueEl: HTMLElement | null = null;
  private cardHtml = '';
  private center: THREE.Vector3 | null = null;
  private heading = 0;
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
      <div class="sp-radar">
        <div class="sp-radar-tab">Radar orbital</div>
        <div class="guide-radar"><canvas></canvas></div>
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
    el.innerHTML = `<i>i</i>${esc(text)}`;
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
    const chev = icon('play', 'chev');
    let html: string;
    if (!view) {
      html = top
        ? `<div class="gc-head">${icon('scan')}<span>Sinal detectado</span>${chev}</div>
          <div class="gc-body"><span class="gc-ring">${icon('target')}</span><div><b class="tname">${esc(top.target.name)}</b><small>≈ ${formatEta(top.eta)}</small></div></div>
          <button class="gc-btn" data-key="KeyN" title="${esc(top.reason)}">${icon('target')}Rastrear<kbd>N</kbd></button>`
        : `<div class="gc-head">${icon('scan')}<span>Sem sinais</span>${chev}</div>
          <div class="gc-body"><small>Faça uma varredura para achar destinos.</small></div>
          <button class="gc-btn" data-key="KeyV">${icon('scan')}Varredura<kbd>V</kbd></button>`;
    } else {
      const auto = mode === 'auto';
      html = `<div class="gc-head">${icon('target')}<span>Alvo${auto ? ' · piloto automático' : mode === 'cruise' ? ' · cruzeiro' : ''}</span>${chev}</div>
        <div class="gc-body"><span class="gc-ring">${icon('target')}</span><div><b class="tname">${esc(view.target.name)}</b><small>${formatDistance(Math.max(0, view.dist))} · ≈ ${formatEta(this.etaFor(view))}</small></div></div>
        <div class="nav-cue" data-cue></div>
        <button class="gc-btn${auto ? ' on' : ''}" data-key="KeyJ">${icon('auto')}${auto ? 'Desligar piloto' : 'Piloto automático'}<kbd>J</kbd></button>`;
    }
    this.card.hidden = false;
    if (html === this.cardHtml) return;
    this.cardHtml = html;
    this.card.innerHTML = html;
    this.cueEl = this.card.querySelector('[data-cue]');
    this.cueHtml = '';
  }

  /** Centro do radar orbital: a estrela do sistema em que a nave está, ou nada no espaço profundo. */
  setRadarCenter(center: THREE.Vector3 | null, heading: number): void {
    this.center = center;
    this.heading = heading;
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
    const css = this.radar.clientWidth || 240;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(css * dpr);
    if (this.radar.width !== px) this.radar.width = this.radar.height = px;
    const g = this.radarCtx;
    const c = px / 2;
    const R = px / 2 - 14 * dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, px, px);
    // Mostrador: fundo, anel de graus e marca do norte.
    g.fillStyle = 'rgba(6, 14, 30, 0.88)';
    g.beginPath();
    g.arc(c, c, R + 10 * dpr, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(80, 170, 255, 0.55)';
    g.lineWidth = 1.2 * dpr;
    g.beginPath();
    g.arc(c, c, R + 10 * dpr, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(150, 190, 235, 0.55)';
    g.lineWidth = dpr;
    for (let a = 0; a < 360; a += 10) {
      const t = (a * Math.PI) / 180 - Math.PI / 2;
      const len = (a % 90 === 0 ? 8 : a % 30 === 0 ? 5 : 2.5) * dpr;
      g.beginPath();
      g.moveTo(c + Math.cos(t) * (R + 9 * dpr), c + Math.sin(t) * (R + 9 * dpr));
      g.lineTo(c + Math.cos(t) * (R + 9 * dpr - len), c + Math.sin(t) * (R + 9 * dpr - len));
      g.stroke();
    }
    // Onda da varredura.
    if (this.pulseStart >= 0) {
      const t = (now - this.pulseStart) / 1400;
      if (t > 1) this.pulseStart = -1;
      else {
        g.strokeStyle = `rgba(128, 255, 200, ${0.7 * (1 - t)})`;
        g.lineWidth = 2 * dpr;
        g.beginPath();
        g.arc(c, c, R * t, 0, Math.PI * 2);
        g.stroke();
      }
    }

    // Vista de cima, norte (+y da eclíptica) para cima. Dentro de um sistema, a estrela fica no centro;
    // no espaço profundo, a nave fica no centro e as distâncias seguem a escala logarítmica do GUIA.
    const center = this.center;
    const bodies = center ? this.entries.filter((e) => e.group === 'system') : [];
    let span = 1e-9;
    if (center) {
      for (const e of bodies) span = Math.max(span, Math.hypot(e.pos.x - center.x, e.pos.y - center.y));
      span = Math.max(span, Math.hypot(ship.x - center.x, ship.y - center.y)) * 1.08;
    }
    const origin = center ?? ship;
    const project = (pos: THREE.Vector3): [number, number, number] => {
      const dx = pos.x - origin.x;
      const dy = pos.y - origin.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-12) return [c, c, 0];
      const r = center ? Math.sqrt(Math.min(1, d / span)) * R : radarRadius(this.tmp.copy(pos).sub(ship).length()) * R;
      return [c + (dx / d) * r, c - (dy / d) * r, r];
    };
    if (center) {
      g.strokeStyle = 'rgba(80, 170, 255, 0.22)';
      g.lineWidth = dpr;
      for (const e of bodies) {
        const [, , r] = project(e.pos);
        g.beginPath();
        g.arc(c, c, r, 0, Math.PI * 2);
        g.stroke();
      }
      // A estrela.
      const glow = g.createRadialGradient(c, c, 0, c, c, 9 * dpr);
      glow.addColorStop(0, '#fff3c4');
      glow.addColorStop(0.35, '#ffc94a');
      glow.addColorStop(1, 'rgba(255, 180, 60, 0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(c, c, 9 * dpr, 0, Math.PI * 2);
      g.fill();
      for (const e of bodies) {
        const [x, y] = project(e.pos);
        g.fillStyle = e.color;
        g.beginPath();
        g.arc(x, y, 3 * dpr, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      g.strokeStyle = 'rgba(80, 170, 255, 0.22)';
      g.lineWidth = dpr;
      g.font = `${10 * dpr}px Inter, "Segoe UI", system-ui, sans-serif`;
      g.fillStyle = 'rgba(150, 190, 235, 0.7)';
      for (const [au, label] of RADAR_RINGS) {
        const r = radarRadius(au) * R;
        g.beginPath();
        g.arc(c, c, r, 0, Math.PI * 2);
        g.stroke();
        g.fillText(label, c + 3 * dpr, c - r + 11 * dpr);
      }
      for (const e of this.entries) {
        const [x, y] = project(e.pos);
        g.fillStyle = e.color;
        g.beginPath();
        g.arc(x, y, (e.group === 'star' ? 2 : 2.6) * dpr, 0, Math.PI * 2);
        g.fill();
      }
    }
    const [sx, sy] = project(ship);
    // Alvo: anel âmbar e linha tracejada desde a nave; fora da escala, fica na borda.
    if (view) {
      let [tx, ty] = project(view.pos);
      const dr = Math.hypot(tx - c, ty - c);
      if (dr > R) {
        tx = c + ((tx - c) / dr) * R;
        ty = c + ((ty - c) / dr) * R;
      }
      g.strokeStyle = 'rgba(242, 180, 63, 0.85)';
      g.lineWidth = 1.4 * dpr;
      g.setLineDash([4 * dpr, 4 * dpr]);
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(tx, ty);
      g.stroke();
      g.setLineDash([]);
      g.lineWidth = 1.8 * dpr;
      g.beginPath();
      g.arc(tx, ty, 6 * dpr, 0, Math.PI * 2);
      g.stroke();
    }
    // A nave: anel ciano e seta no rumo da proa.
    g.strokeStyle = '#38c8ff';
    g.lineWidth = 1.8 * dpr;
    g.beginPath();
    g.arc(sx, sy, 7 * dpr, 0, Math.PI * 2);
    g.stroke();
    const h = (this.heading * Math.PI) / 180;
    g.fillStyle = '#e8f6ff';
    g.save();
    g.translate(sx, sy);
    g.rotate(h);
    g.beginPath();
    g.moveTo(0, -5 * dpr);
    g.lineTo(-3.5 * dpr, 3.5 * dpr);
    g.lineTo(3.5 * dpr, 3.5 * dpr);
    g.closePath();
    g.fill();
    g.restore();
    this.inv.copy(shipQuat).invert();
    this.updateCue(ship, view);
  }

  /** Instrução de rumo: quanto virar e subir ou descer para ficar de frente para o alvo. */
  private updateCue(ship: THREE.Vector3, view: TargetView | null): void {
    let html: string;
    if (!view) return;
    {
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
    if (html !== this.cueHtml && this.cueEl) {
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
