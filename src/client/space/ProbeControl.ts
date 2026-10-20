import * as THREE from 'three';
import {
  describeAmounts,
  freeProbes,
  launch,
  PHASE_LABEL,
  progress,
  remaining,
  RESOURCE_LABEL,
  RESOURCES,
  SOURCE_LABEL,
  stepProbes,
  sum,
  type ProbeState,
  type SourceKind,
} from '../../explore/probes';
import { getGlowTexture } from './bodies';

/** Corpo do qual uma sonda pode extrair, presente na cena agora. */
export interface MineSource {
  id: string;
  name: string;
  kind: SourceKind;
  water: number;
  /** Posição no mundo (UA), ao vivo. */
  pos: THREE.Vector3;
  /** Raio da órbita de trabalho da sonda em volta do corpo (UA). */
  radius: number;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Sondas no modo 3D: envio (M e R), painel com missões e porão, e o ponto
 * luminoso de cada sonda voando até o corpo, trabalhando em órbita e voltando.
 */
export class ProbeControl {
  private readonly panel: HTMLDivElement;
  private readonly sprites = new Map<number, THREE.Sprite>();
  /** Onde a nave estava quando cada sonda partiu (só para o desenho). */
  private readonly launchPos = new Map<number, THREE.Vector3>();
  private nearby: MineSource[] = [];

  constructor(
    parent: HTMLElement,
    private readonly state: ProbeState,
    private readonly scene: THREE.Scene,
    private readonly say: (text: string, tone?: 'info' | 'good' | 'warn') => void,
    private readonly log: (text: string) => void,
  ) {
    this.panel = document.createElement('div');
    this.panel.className = 'hud-panel probe-panel';
    parent.appendChild(this.panel);
  }

  /** Fontes ao alcance das sondas, a mais próxima primeiro. */
  setNearby(list: MineSource[]): void {
    this.nearby = list;
  }

  /** Primeira fonte ao alcance que não sejam anéis (M), ou os anéis (R). */
  pick(rings: boolean): MineSource | null {
    return this.nearby.find((s) => (s.kind === 'ring') === rings) ?? null;
  }

  send(src: MineSource | null, ship: THREE.Vector3): void {
    if (!src) {
      this.say('Nada ao alcance das sondas. Entre em órbita de um planeta rochoso ou aproxime-se de um cometa, anel ou destroço.', 'warn');
      return;
    }
    const left = this.state.surveyed[src.id] ? remaining(this.state.surveyed[src.id], this.state.mined[src.id]) : null;
    if (left && sum(left) < 1) {
      this.say(`${src.name} já foi esgotado pelas sondas.`, 'warn');
      return;
    }
    const m = launch(this.state, src.id, src.name, src.kind, src.water);
    if (!m) {
      this.say('Todas as sondas estão em missão. Espere uma voltar.', 'warn');
      return;
    }
    this.launchPos.set(m.id, ship.clone());
    this.say(`Sonda ${m.id} lançada para ${src.name} (${SOURCE_LABEL[src.kind]}).`);
  }

  /** Avança as missões e desenha as sondas. */
  frame(dt: number, ship: THREE.Vector3, lookup: (id: string) => MineSource | null, time: number): void {
    for (const e of stepProbes(this.state, dt)) {
      const m = e.mission;
      if (e.kind === 'surveyed') this.say(`Sonda ${m.id} prospectou ${m.sourceName}: ${describeAmounts(m.found!)}. Extraindo.`);
      else if (e.kind === 'depleted') this.say(`Sonda ${m.id}: ${m.sourceName} não tem mais nada para extrair. Voltando.`, 'warn');
      else {
        this.say(`Sonda ${m.id} voltou de ${m.sourceName} com ${describeAmounts(m.cargo)}.`, 'good');
        this.log(`Sonda ${m.id} trouxe ${describeAmounts(m.cargo, 5)} de ${m.sourceName}.`);
      }
    }
    const alive = new Set<number>();
    for (const m of this.state.missions) {
      const src = lookup(m.sourceId);
      if (!src) continue;
      alive.add(m.id);
      let sprite = this.sprites.get(m.id);
      if (!sprite) {
        sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0x8fffb0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
        );
        this.scene.add(sprite);
        this.sprites.set(m.id, sprite);
      }
      const from = this.launchPos.get(m.id) ?? ship;
      const k = Math.min(1, m.elapsed / 6);
      const ease = k * k * (3 - 2 * k);
      const world = new THREE.Vector3();
      if (m.phase === 'travel') world.lerpVectors(from, src.pos, ease);
      else if (m.phase === 'return') world.lerpVectors(src.pos, ship, ease);
      else {
        const a = time * 1.3 + m.id * 2.1;
        world.copy(src.pos).add(new THREE.Vector3(Math.cos(a), Math.sin(a), Math.sin(a * 0.7) * 0.3).multiplyScalar(src.radius));
      }
      sprite.position.subVectors(world, ship);
      sprite.scale.setScalar(Math.max(src.radius * 0.15, world.distanceTo(ship) * 0.006));
    }
    for (const [id, sprite] of this.sprites) {
      if (alive.has(id)) continue;
      this.scene.remove(sprite);
      sprite.material.dispose();
      this.sprites.delete(id);
      if (!this.state.missions.some((m) => m.id === id)) this.launchPos.delete(id);
    }
  }

  /** Painel das sondas (10 vezes por segundo). */
  render(): void {
    const s = this.state;
    const rows = s.missions
      .map((m) => {
        const pct = Math.round(progress(m) * 100);
        return `<div class="probe-row"><span>Sonda ${m.id} · ${esc(m.sourceName)} · ${PHASE_LABEL[m.phase]}</span><span class="probe-bar"><i style="width:${pct}%"></i></span></div>`;
      })
      .join('');
    const cargo = RESOURCES.filter((r) => s.cargo[r] >= 0.5)
      .map((r) => `<span>${RESOURCE_LABEL[r]}</span><b>${Math.round(s.cargo[r]).toLocaleString('pt-BR')} t</b>`)
      .join('');
    const hints: string[] = [];
    const main = this.pick(false);
    const ring = this.pick(true);
    const status = (src: { id: string }) => {
      const total = s.surveyed[src.id];
      if (!total) return 'não prospectado';
      const left = remaining(total, s.mined[src.id]);
      return sum(left) < 1 ? 'esgotado' : `resta ${describeAmounts(left, 2)}`;
    };
    if (main) hints.push(`<div><kbd>M</kbd>Sonda para ${esc(main.name)} <small>(${SOURCE_LABEL[main.kind]}, ${status(main)})</small></div>`);
    if (ring) hints.push(`<div><kbd>R</kbd>Sonda para ${esc(ring.name)} <small>(${status(ring)})</small></div>`);
    this.panel.innerHTML = `
      <div class="hud-title">SONDAS · ${freeProbes(s)}/${s.probes} livres</div>
      ${rows || '<div class="probe-empty">Nenhuma sonda em missão.</div>'}
      ${hints.join('') || '<div class="probe-empty">Aproxime-se de um planeta rochoso, anel, cometa ou destroço para enviar uma sonda.</div>'}
      <div class="probe-sec">Porão</div>
      ${cargo ? `<div class="probe-cargo">${cargo}</div>` : '<div class="probe-empty">Vazio.</div>'}`;
  }

  /** Recursos do corpo para o menu de órbita: o que restou, se já foi prospectado. */
  describeSource(id: string): string | null {
    const total = this.state.surveyed[id];
    if (!total) return null;
    const left = remaining(total, this.state.mined[id]);
    return sum(left) < 1 ? 'esgotado' : describeAmounts(left, 4);
  }

  dispose(): void {
    for (const sprite of this.sprites.values()) {
      this.scene.remove(sprite);
      sprite.material.dispose();
    }
    this.sprites.clear();
    this.panel.remove();
  }
}
