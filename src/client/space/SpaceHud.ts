import * as THREE from 'three';
import { formatDistance, formatSpeed } from '../../core/flight';
import { AU_PER_PC } from '../../core/units';
import { freeProbes } from '../../explore/probes';
import { PLANET_KIND_LABEL } from '../../nav/planets';
import { LIFE_LABEL, lifeTierOf, SOL_ID, starInfo } from '../../nav/systemGen';
import type { Input } from '../input';
import type { AdaptiveResolution } from '../quality';
import type { GameRenderer } from '../renderer';
import type { GameState } from '../state';
import { icon as svgIcon } from '../ui/icons';
import type { GuideHud } from './GuideHud';
import type { NavDirector } from './NavDirector';
import type { ProbeControl } from './ProbeControl';
import type { ShipController } from './ShipController';
import type { StarField } from './starField';
import type { SystemManager } from './SystemManager';

/** O HUD textual se atualiza 10 vezes por segundo; rótulos e marcadores, a cada quadro. */
const HUD_MS = 100;

/** Fita da bússola: rumo da proa no plano da eclíptica (N é +y), 3 px por grau, repetida para dar a volta. */
const CMP_PX = 3;
const COMPASS_TAPE = (() => {
  const names: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  let html = '';
  for (let d = -180; d <= 540; d += 15) {
    const n = names[((d % 360) + 360) % 360];
    html += `<i class="${n ? 'big' : ''}" style="left:${(d + 180) * CMP_PX}px">${n ? `<b>${n}</b>` : ''}</i>`;
  }
  return html;
})();

/** Barra de comandos embaixo: tecla, ícone e nome. Clicar faz o mesmo que apertar a tecla; o resto fica na busca (G ou Ctrl K). */
const CMDS: [string, string, string][] = [
  ['KeyJ', 'auto', 'Piloto automático'],
  ['KeyC', 'cruise', 'Cruzeiro'],
  ['KeyV', 'scan', 'Varredura'],
  ['KeyM', 'probe', 'Sonda'],
  ['KeyB', 'flag', 'Marcador'],
];

const TARGET_ICON = svgIcon('target');

interface Label {
  el: HTMLDivElement;
  visible: boolean;
  html: string;
}

/** Tudo o que o HUD mostra; ligado depois que GUIA e sondas já existem dentro de `root`. */
export interface HudSources {
  state: GameState;
  ship: ShipController;
  director: NavDirector;
  systems: SystemManager;
  stars: StarField;
  guide: GuideHud;
  probes: ProbeControl;
  renderer: GameRenderer;
  resolution: AdaptiveResolution;
  input: Input;
  camera: THREE.PerspectiveCamera;
}

/**
 * HUD do espaço em DOM: painel da nave, bússola, dados técnicos (DEV),
 * barra de comandos, menu de órbita, rótulos dos corpos e o aviso de
 * clique para pilotar. O texto é atualizado 10 vezes por segundo e só é
 * escrito no DOM quando muda; os rótulos acompanham a tela a cada quadro.
 */
export class SpaceHud {
  readonly root: HTMLDivElement;
  private readonly els: Record<string, HTMLElement> = {};
  /** Último texto escrito em cada elemento, para não tocar no DOM sem mudança. */
  private readonly written = new Map<HTMLElement, string>();
  private readonly labels = new Map<string, Label>();
  private src: HudSources | null = null;
  private lastHud = 0;
  private frames = 0;
  private fps = 0;
  private fpsTime = 0;
  private orbitHtml = '';
  // Rascunho reaproveitado a cada quadro.
  private readonly rel = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly zero = new THREE.Vector3();

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'space-hud';
    this.root.innerHTML = `
      <div class="hud-panel hud-top-left">
        <button class="sp-head" data-a="probes" title="Mostrar ou esconder as sondas">${svgIcon('ship')}<span>We Are Many</span>${svgIcon('play', 'chev')}</button>
        <div class="sp-row">${svgIcon('bolt')}<span>Potência</span><b data-h="throttle"></b></div>
        <div class="sp-row turbo">${svgIcon('cruise')}<span>Turbo</span><span class="turbo-bar"><i data-h="turbo"></i></span></div>
        <div class="sp-row">${svgIcon('probe')}<span>Sondas</span><b data-h="probes"></b></div>
      </div>
      <div class="hud-compass">
        <div class="cmp-view"><div class="cmp-tape" data-h="tape">${COMPASS_TAPE}</div></div>
        <div class="cmp-row">
          <span>${svgIcon('sun')}<b data-h="system"></b></span>
          <span class="on">${svgIcon('planet')}<b data-h="nearest"></b></span>
          <span>${svgIcon('target')}<b data-h="distance"></b></span>
          <span>${svgIcon('play')}<b data-h="speed"></b></span>
        </div>
      </div>
      <div class="hud-panel hud-top-right" data-h="dev" hidden>
        <div><span class="k">FPS</span> <b data-h="fps"></b></div>
        <div><span class="k">Chunks</span> <b data-h="chunks"></b></div>
        <div><span class="k">Estrelas carregadas</span> <b data-h="stars"></b></div>
        <div><span class="k">Memória GPU</span> <b data-h="memory"></b></div>
        <div><span class="k">Resolução</span> <b data-h="resolution"></b></div>
        <div><span class="k">Posição</span> <b data-h="position"></b></div>
      </div>
      <button class="dev-pill" data-a="dev" title="Dados técnicos"><i></i>DEV</button>
      <div class="hud-crosshair"></div>
      <div class="hud-orbit hud-panel" data-h="orbit" hidden></div>
      <div class="hud-help">
        ${CMDS.map(([key, ico, name]) => `<button class="cmd" data-key="${key}" title="${name} (${key.replace('Key', '')})">${svgIcon(ico)}<span>${name}</span><kbd>${key.replace('Key', '')}</kbd></button>`).join('')}
      </div>
      <div class="hud-labels" data-h="labels"></div>
      <div class="hud-lock" data-h="lock">Clique para pilotar</div>`;
    parent.appendChild(this.root);
    // Botões com tecla (barra de comandos, cartões) fazem o mesmo que apertar a tecla.
    this.root.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-key], [data-a]');
      if (!el) return;
      e.stopPropagation();
      if (el.dataset.a === 'probes') this.root.classList.toggle('show-probes');
      else if (el.dataset.a === 'dev') this.els.dev.hidden = !this.els.dev.hidden;
      else {
        const code = el.dataset.key!;
        window.dispatchEvent(new KeyboardEvent('keydown', { code }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code }));
      }
    });
    this.root.querySelectorAll<HTMLElement>('[data-h]').forEach((el) => {
      this.els[el.dataset.h!] = el;
    });
  }

  connect(src: HudSources): void {
    this.src = src;
  }

  /** Escreve o texto só se mudou. */
  private text(el: HTMLElement, value: string): void {
    if (this.written.get(el) === value) return;
    this.written.set(el, value);
    el.textContent = value;
  }

  private style(el: HTMLElement, prop: 'width' | 'transform', value: string): void {
    const key = `${prop}:${value}`;
    if (this.written.get(el) === key) return;
    this.written.set(el, key);
    el.style[prop] = value;
  }

  /** A cada quadro: conta FPS, atualiza o HUD 10 vezes por segundo e reposiciona os rótulos. */
  frame(now: number): void {
    this.frames++;
    if (now - this.fpsTime > 500) {
      this.fps = (this.frames * 1000) / (now - this.fpsTime);
      this.frames = 0;
      this.fpsTime = now;
    }
    if (now - this.lastHud > HUD_MS) {
      this.lastHud = now;
      this.update();
    }
    this.updateLabels();
  }

  private update(): void {
    const s = this.src!;
    const els = this.els;
    const ship = s.state.shipPos;
    const nearest = s.director.nearestSurface();
    const mem = s.renderer.info.memory;
    this.text(els.speed, formatSpeed(s.ship.velocity.length()));
    this.text(els.throttle, `${Math.round(s.ship.throttle * 100)}%`);
    this.style(els.turbo, 'width', `${Math.round(s.ship.turbo.energy * 100)}%`);
    els.turbo.classList.toggle('out', s.ship.turbo.exhausted);
    els.turbo.classList.toggle('on', s.ship.turbo.active);
    this.text(els.nearest, nearest.name);
    this.text(els.distance, Number.isFinite(nearest.dist) ? formatDistance(Math.max(nearest.dist, 0)) : '—');
    const fwd = this.fwd.set(0, 0, -1).applyQuaternion(s.state.shipQuat);
    const heading = ((Math.atan2(fwd.x, fwd.y) * 180) / Math.PI + 360) % 360;
    this.style(els.tape, 'transform', `translateX(${-(heading + 180) * CMP_PX}px)`);
    this.text(els.probes, `${freeProbes(s.state.probes)}/${s.state.probes.probes}`);
    const sys = s.systems.system;
    const star = sys ? sys.star.pos : s.systems.nearSol() ? this.zero : null;
    s.guide.setRadarCenter(star, heading);
    this.text(els.system, sys ? `Sistema ${sys.info.name}` : star ? 'Sistema Sol' : 'Espaço profundo');
    // Mesma conta de Vector3.divideScalar (multiplica pelo inverso), para o texto não mudar.
    const k = 1 / AU_PER_PC;
    this.text(els.position, `${(ship.x * k).toFixed(3)}, ${(ship.y * k).toFixed(3)}, ${(ship.z * k).toFixed(3)} pc`);
    this.text(els.fps, this.fps.toFixed(0));
    this.text(els.chunks, `${s.stars.loadedCount} / ${s.state.manifest.manifest.nodes.length}`);
    this.text(els.stars, s.stars.starCount.toLocaleString('pt-BR'));
    this.text(els.memory, `${mem.geometries} geometrias, ${mem.textures} texturas`);
    this.text(els.resolution, `${Math.round(s.resolution.pixelRatio * 100)}%`);
    els.lock.hidden = s.input.locked || s.guide.panelOpen;
    s.probes.render();
    if (s.systems.orbitBody) this.renderOrbitMenu();
    const nav = s.state.nav;
    s.guide.updateCard(s.director.view, nav.autopilot ? 'auto' : nav.cruise ? 'cruise' : 'manual', s.director.suggestions[0] ?? null);
  }

  /** Menu do planeta em órbita: dados, ações e origem dos dados. */
  renderOrbitMenu(): void {
    const s = this.src!;
    const el = this.els.orbit;
    const b = s.systems.orbitBody;
    if (!b?.planet) {
      el.hidden = true;
      return;
    }
    const p = b.planet;
    const sys = s.systems.system!.data;
    const tier = lifeTierOf(p);
    const inZone = p.kind === 'rocky' && p.aAu >= sys.habitable[0] && p.aAu <= sys.habitable[1];
    const source = sys.starId === SOL_ID
      ? 'Dados reais: NASA/JPL · escala visual comprimida'
      : sys.catalogued
        ? 'Planeta real: NASA Exoplanet Archive · raio e clima estimados'
        : 'Planeta não catalogado: gerado a partir da estrela real';
    const res = (id: string) => {
      const d = s.probes.describeSource(id);
      return `<small>${d ? `Restam: ${d}` : 'Ainda não prospectado'}</small>`;
    };
    el.hidden = false;
    const html = `
      <div class="oc-head"><span class="oc-globe ${p.id === 'sol-3' ? 'earth' : p.kind}"></span><div class="oc-name">${svgIcon('target')}<b>${p.name}</b><em>· em órbita</em></div></div>
      <div class="orbit-data">
        <span>${svgIcon('planet')}Tipo</span><b>${PLANET_KIND_LABEL[p.kind]}</b>
        <span>${svgIcon('orbit')}Raio</span><b>${p.radiusKm.toLocaleString('pt-BR')} km</b>
        <span>${svgIcon('sun')}Distância da estrela</span><b>${p.aAu} UA</b>
        <span>${svgIcon('temp')}Temperatura média</span><b>${p.temperatureK} K</b>
        <span>${svgIcon('leaf')}Zona habitável</span><b>${inZone ? 'Sim' : 'Não'}</b>
        <span>${svgIcon('sprout')}Vida nativa</span><b>${p.id === 'sol-3' ? 'Sim' : tier === 'none' ? 'Nenhum sinal' : LIFE_LABEL[tier].replace('sinais de ', '')}</b>
      </div>
      <div class="orbit-actions">
        ${p.kind === 'rocky' ? `<button class="oc-btn main" data-key="KeyF">${svgIcon('eye')}Observar superfície<kbd>F</kbd></button>` : '<div class="oc-btn off">Sem superfície sólida</div>'}
        ${p.kind === 'rocky' ? `<button class="oc-btn" data-key="KeyM">${svgIcon('probe')}Enviar sonda<kbd>M</kbd>${res(p.id)}</button>` : ''}
        ${p.rings ? `<button class="oc-btn" data-key="KeyR">${svgIcon('orbit')}Sonda aos anéis<kbd>R</kbd>${res(`${p.id}:aneis`)}</button>` : ''}
      </div>
      <div class="source">${source}</div>`;
    // Refeito 10 vezes por segundo: só toca no DOM (e nos botões sob o mouse) quando algo mudou.
    if (html === this.orbitHtml) return;
    this.orbitHtml = html;
    el.innerHTML = html;
  }

  /** Rótulos na tela para a estrela mais próxima e os corpos do sistema. */
  private updateLabels(): void {
    const s = this.src!;
    for (const l of this.labels.values()) l.visible = false;
    const near = s.director.nearestStar;
    if (near) this.label('star', starInfo(near, s.state.names).name, near.pos);
    const sys = s.systems.system;
    if (sys) {
      this.label('sys', sys.star.name, sys.star.pos);
      for (const b of sys.planets) this.label(b.planet!.id, b.name, b.pos);
    }
    for (const l of this.labels.values()) l.el.hidden = !l.visible;
  }

  private label(key: string, name: string, pos: THREE.Vector3): void {
    const s = this.src!;
    const view = s.director.view;
    // O alvo já tem o próprio marcador com nome e distância.
    if (view && view.target.name === name) return;
    const rel = this.rel.copy(pos).sub(s.state.shipPos);
    const dist = rel.length();
    const v = rel.project(s.camera);
    if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return;
    let label = this.labels.get(key);
    if (!label) {
      const el = document.createElement('div');
      el.className = 'hud-label';
      this.els.labels.appendChild(el);
      label = { el, visible: true, html: '' };
      this.labels.set(key, label);
    }
    label.visible = true;
    const html = `<span>${TARGET_ICON}${name}</span><small>${formatDistance(dist)}</small>`;
    if (label.html !== html) {
      label.html = html;
      label.el.innerHTML = html;
    }
    label.el.style.transform = `translate(${((v.x + 1) / 2) * window.innerWidth}px, ${((1 - v.y) / 2) * window.innerHeight}px)`;
  }

  dispose(): void {
    this.root.remove();
  }
}
