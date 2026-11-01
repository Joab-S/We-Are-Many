import * as THREE from 'three';
import { bvToTemperature, temperatureToRgb } from '../../core/astro';
import { formatDistance } from '../../core/flight';
import { AU_PER_PC } from '../../core/units';
import {
  etaSeconds,
  formatEta,
  POI_INTEREST,
  rankSuggestions,
  starInterest,
  type Candidate,
  type NavTarget,
  type Suggestion,
} from '../../nav/guide';
import { PLANET_KIND_LABEL } from '../../nav/planets';
import { findPoi, POI_LABEL, poiArrive, poisNear, TUTORIAL_POI, type Poi } from '../../nav/poi';
import {
  describeSystem,
  generateSystem,
  LIFE_LABEL,
  lifeTierOf,
  SOL_ID,
  starInfo,
  starVisualRadius,
  summarize,
  systemViewRadius,
  type CometData,
  type StarInfo,
  type StarRef,
} from '../../nav/systemGen';
import type { GameState } from '../state';
import type { Body, PlanetData } from './bodies';
import type { GuideHud, NavEntry, TargetView } from './GuideHud';
import type { MineSource, ProbeControl } from './ProbeControl';
import type { CatalogStar, StarField } from './starField';
import type { LocalSystem, SystemManager } from './SystemManager';

/** Alcance da varredura de longo alcance (V). */
const SCAN_RANGE_PC = 4;
const SCAN_COOLDOWN_MS = 5000;
/** Pontos de interesse desenhados em 3D até esta distância. */
const POI_DRAW_PC = 1;
/** Pontos de interesse listados no GUIA até esta distância. */
const POI_LIST_PC = 6;
/** Dentro deste raio o GUIA detecta pontos de interesse sozinho, sem varredura. */
const POI_PASSIVE_PC = 0.15;
/** Nebulosas brilham: são vistas de longe. */
const NEBULA_SEEN_PC = 3;
/** Sem alvo e sem novidade por este tempo, o GUIA oferece uma sugestão. */
const IDLE_HINT_MS = 45000;
/** O GUIA atualiza listas, sugestões e pontos de interesse 4 vezes por segundo. */
const REFRESH_MS = 250;
const HOME_STAR: StarRef = { id: SOL_ID, absmag: 4.85, ci: 0.656 };

export type NearbyStar = CatalogStar & { distAu: number };

const KIND_COLOR: Record<PlanetData['kind'], string> = { rocky: '#7fd18b', gas: '#e3c08a', ice: '#8fd8ff' };

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
const toTuple = (v: THREE.Vector3): [number, number, number] => [v.x, v.y, v.z];

function starCss(ci: number): string {
  const [r, g, b] = temperatureToRgb(bvToTemperature(ci));
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}

/** Fonte de extração com o alcance das sondas e a distância medida na última consulta. */
interface SourceSlot {
  src: MineSource;
  reach: number;
  d: number;
}

/**
 * O lado lógico do GUIA no espaço: alvo e piloto automático (ligar,
 * desligar, chegada), sugestões e listas do painel, varredura, marcadores,
 * descoberta e visita de pontos de interesse, diário de bordo e as
 * estrelas próximas. A interface (radar, cartão, painel) é o GuideHud; o
 * voo até o alvo é o ShipController.
 */
export class NavDirector {
  /** Estrela mais próxima fora do sistema atual. */
  nearestStar: NearbyStar | null = null;
  /** As 40 estrelas mais próximas (fora do sistema atual), da mais perto para a mais longe. */
  nearbyStars: NearbyStar[] = [];
  entries: NavEntry[] = [];
  suggestions: Suggestion[] = [];
  /** Alvo resolvido neste quadro (posição ao vivo e onde parar), ou null sem alvo. */
  view: TargetView | null = null;
  private suggestionIndex = -1;
  /** Distância ao corpo mais próximo, atualizada no HUD; serve à estimativa de chegada. */
  private departDistance = Infinity;
  private lastNews = performance.now();
  private lastRefresh = 0;
  private scanReadyAt = 0;
  /** Fontes de extração em cache, refeitas só quando os corpos mudam. */
  private sources: SourceSlot[] = [];
  private sourceById = new Map<string, MineSource>();
  private sourcesVersion = -1;
  // Objetos reaproveitados: a vista do alvo de cada quadro, uma para consultas e o corpo mais próximo.
  private readonly frameView: TargetView = { target: null!, pos: new THREE.Vector3(), dist: 0, arrive: 0, viaSystem: false, info: '', depart: 0 };
  private readonly probeView: TargetView = { target: null!, pos: new THREE.Vector3(), dist: 0, arrive: 0, viaSystem: false, info: '', depart: 0 };
  private readonly surface = { dist: Infinity, name: '—' };

  constructor(
    private readonly state: GameState,
    private readonly stars: StarField,
    private readonly systems: SystemManager,
    private readonly guide: GuideHud,
    private readonly probes: ProbeControl,
  ) {}

  private get nav() {
    return this.state.nav;
  }

  private info(s: StarRef): StarInfo {
    return starInfo(s, this.state.names);
  }

  addLog(text: string): void {
    const log = this.nav.log;
    log.push({ time: this.state.time, text });
    if (log.length > 200) log.shift();
  }

  // ------------------------------------------------------------ alvo e piloto

  setTarget(t: NavTarget, note?: string): void {
    this.nav.target = t;
    this.lastNews = performance.now();
    const v = this.resolve(this.probeView);
    const dist = v ? v.dist : 0;
    this.guide.say(`Alvo: ${t.name} · ${formatDistance(Math.max(0, dist))} · ≈ ${formatEta(etaSeconds(dist, v?.arrive ?? t.arrive, this.departDistance))}. ${note ?? (this.nav.autopilot ? '' : 'Aperte J para o piloto automático.')}`);
  }

  engage(t: NavTarget): void {
    const nav = this.nav;
    nav.autopilot = true;
    nav.cruise = false;
    if (nav.target?.id !== t.id) this.setTarget(t, 'Piloto automático ligado.');
    else this.guide.say(`Piloto automático: rumo a ${t.name}. Qualquer comando manual desliga.`);
  }

  clearTarget(): void {
    this.nav.target = null;
    this.nav.autopilot = false;
    this.view = null;
  }

  /** J: liga o piloto automático até o alvo (ou a melhor sugestão), ou desliga. */
  toggleAutopilot(): void {
    const nav = this.nav;
    if (nav.autopilot) {
      nav.autopilot = false;
      this.guide.say('Piloto automático desligado.');
      return;
    }
    const t = nav.target ?? this.suggestions[0]?.target;
    if (t) this.engage(t);
    else this.guide.say('Sem alvo. Escolha um no painel (G), trave na mira (T) ou faça uma varredura (V).', 'warn');
  }

  /** C: cruzeiro mantém a velocidade sem segurar W. */
  toggleCruise(): void {
    const nav = this.nav;
    nav.cruise = !nav.cruise;
    if (nav.cruise) nav.autopilot = false;
    this.guide.say(nav.cruise ? 'Cruzeiro ligado: a nave mantém a velocidade sem segurar W.' : 'Cruzeiro desligado.');
  }

  /** N: a próxima sugestão vira o alvo. */
  nextSuggestion(): void {
    if (!this.suggestions.length) {
      this.guide.say('Sem sugestões por perto. Tente uma varredura (V).', 'warn');
      return;
    }
    this.suggestionIndex = (this.suggestionIndex + 1) % this.suggestions.length;
    const s = this.suggestions[this.suggestionIndex];
    this.setTarget(s.target, `${s.reason}. Aperte J para ir.`);
  }

  /** H: rota para casa. */
  goHome(): void {
    this.setTarget(this.homeTarget(), 'Rota para casa. Aperte J para ir.');
  }

  /** X: limpa o alvo. */
  dropTarget(): void {
    if (!this.nav.target) return;
    this.clearTarget();
    this.guide.say('Alvo removido.');
  }

  /** O piloto assumiu o controle (`manual`) ou o alvo sumiu: o piloto automático desliga. */
  disengage(manual: boolean): void {
    this.nav.autopilot = false;
    if (manual) this.guide.say('Piloto automático desligado: você assumiu o controle.');
  }

  /** Resolve o alvo deste quadro. */
  resolveView(): TargetView | null {
    this.view = this.resolve(this.frameView);
    return this.view;
  }

  /** Posição atual do alvo e onde parar; planetas de outro sistema passam primeiro pela estrela. */
  private resolve(out: TargetView): TargetView | null {
    const t = this.nav.target;
    if (!t) return null;
    const ship = this.state.shipPos;
    out.target = t;
    out.info = t.info;
    out.depart = this.departDistance;
    out.viaSystem = false;
    if (t.kind === 'planet' || t.kind === 'comet' || t.kind === 'home') {
      const sys = this.systems.system;
      if (sys && sys.starId === t.starId) {
        const b = findBody(sys.planets, t.id) ?? findBody(sys.comets, t.id);
        if (b) {
          out.pos.copy(b.pos);
          out.dist = b.pos.distanceTo(ship);
          out.arrive = b.kind === 'comet' ? Math.max(b.radius * 20, 0.005) : b.radius * 3;
          return out;
        }
      }
      out.viaSystem = true;
    }
    out.pos.set(t.pos[0], t.pos[1], t.pos[2]);
    out.dist = out.pos.distanceTo(ship);
    out.arrive = t.arrive;
    return out;
  }

  /** Chegou ao alvo? Devolve true se o piloto automático estava ligado e a nave deve parar. */
  checkArrival(): boolean {
    const nav = this.nav;
    const v = this.view;
    if (!nav.target || !v || v.viaSystem) return false;
    const dist = v.pos.distanceTo(this.state.shipPos);
    if (dist > v.arrive * 1.15) return false;
    const halt = nav.autopilot;
    if (halt) nav.autopilot = false;
    const t = nav.target;
    this.guide.say(`Chegamos: ${t.name}.${t.kind === 'planet' || t.kind === 'home' ? ' Em órbita.' : ''}`, 'good');
    if (t.kind === 'poi') this.visitPoi(t.id);
    if (t.kind === 'comet' && !nav.visitedBodies.has(t.id)) {
      nav.visitedBodies.add(t.id);
      this.addLog(`Visitamos o ${t.name}.`);
    }
    this.clearTarget();
    return halt;
  }

  homeTarget(): NavTarget {
    const info = this.info(HOME_STAR);
    const sol = generateSystem(info);
    return {
      kind: 'home',
      id: 'sol-3',
      name: 'Terra (casa)',
      pos: [0, 0, 0],
      starId: SOL_ID,
      arrive: systemViewRadius(sol, info),
      info: 'Planeta natal, no Sistema Solar',
    };
  }

  private starTarget(s: CatalogStar): NavTarget {
    const info = this.info(s);
    const sys = generateSystem(info);
    const known = this.nav.scannedStars.has(s.id) ? describeSystem(summarize(sys)) : 'sistema ainda não varrido';
    return { kind: 'star', id: `star:${s.id}`, name: info.name, pos: toTuple(s.pos), starId: s.id, arrive: systemViewRadius(sys, info), info: `Estrela · ${known}` };
  }

  private poiTarget(p: Poi): NavTarget {
    return { kind: 'poi', id: p.id, name: p.name, pos: p.pos, arrive: poiArrive(p), info: `${POI_LABEL[p.kind]} · ${p.description}` };
  }

  /** T: trava como alvo o que estiver mais perto da cruz da mira. */
  lockAtCrosshair(): void {
    const ship = this.state.shipPos;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.state.shipQuat);
    const rel = new THREE.Vector3();
    let best: { t: NavTarget; angle: number } | null = null;
    const test = (pos: THREE.Vector3, make: () => NavTarget) => {
      const angle = rel.copy(pos).sub(ship).angleTo(fwd);
      if (angle < 0.09 && (!best || angle < best.angle)) best = { t: make(), angle };
    };
    for (const e of this.entries) test(e.pos, () => e.target);
    for (const s of this.nearbyStars) test(s.pos, () => this.starTarget(s));
    const found = best as { t: NavTarget; angle: number } | null;
    if (found) this.setTarget(found.t);
    else this.guide.say('Nada na mira. Aponte a cruz para uma estrela, planeta ou marcador e aperte T.', 'warn');
  }

  /** B: marcador na posição atual. */
  addBookmark(): void {
    const nav = this.nav;
    const n = nav.bookmarks.length + 1;
    const sys = this.systems.system;
    const where = sys ? ` (${sys.info.name})` : '';
    const mark = { id: `mark:${Date.now()}`, name: `Marcador ${n}${where}`, pos: toTuple(this.state.shipPos) };
    nav.bookmarks.push(mark);
    this.addLog(`${mark.name} criado.`);
    this.guide.say(`${mark.name} salvo aqui. Ele aparece no radar e no painel.`, 'good');
    this.refresh(performance.now());
  }

  removeBookmark(id: string): void {
    this.nav.bookmarks = this.nav.bookmarks.filter((b) => b.id !== id);
    if (this.nav.target?.id === id) this.clearTarget();
    this.refresh(performance.now());
  }

  /** V: varredura de longo alcance, que revela pontos de interesse e o que há nos sistemas próximos. */
  scan(now: number): void {
    if (now < this.scanReadyAt) {
      this.guide.say(`Varredura recarregando: ${Math.ceil((this.scanReadyAt - now) / 1000)} s.`, 'warn', 3);
      return;
    }
    this.scanReadyAt = now + SCAN_COOLDOWN_MS;
    this.guide.pulse();
    const nav = this.nav;
    const ship = this.state.shipPos;
    const range = SCAN_RANGE_PC * AU_PER_PC;
    const stars = this.stars.nearby(ship, 400, undefined, range);
    let systems = 0;
    let habitable = 0;
    const life: string[] = [];
    for (const s of stars) {
      if (nav.scannedStars.has(s.id)) continue;
      nav.scannedStars.add(s.id);
      const info = this.info(s);
      const sum = summarize(generateSystem(info));
      if (sum.planets) systems++;
      if (sum.habitable) habitable++;
      if (sum.life !== 'none') {
        life.push(info.name);
        this.addLog(`Varredura: ${LIFE_LABEL[sum.life]} no sistema ${info.name}.`);
      }
    }
    const fresh = poisNear(ship, range).filter((p) => !nav.discoveredPois.has(p.id));
    for (const p of fresh) {
      nav.discoveredPois.add(p.id);
      this.addLog(`Varredura: ${POI_LABEL[p.kind].toLowerCase()} detectado (${p.name}).`);
    }
    this.lastNews = now;
    const parts = [`${stars.length} estrelas`, `${systems} sistemas novos com planetas`];
    if (habitable) parts.push(`${habitable} com mundos na zona habitável`);
    parts.push(`${fresh.length} pontos de interesse novos`);
    this.guide.say(`Varredura (${SCAN_RANGE_PC} pc): ${parts.join(', ')}.`, fresh.length || systems ? 'good' : 'info', 9);
    if (life.length) this.guide.say(`Sinais de vida em ${life.slice(0, 3).join(', ')}! Veja as sugestões (N).`, 'good', 10);
    this.refresh(now);
  }

  private visitPoi(id: string): void {
    const nav = this.nav;
    if (nav.visitedPois.has(id)) return;
    const p = findPoi(id);
    if (!p) return;
    nav.visitedPois.add(id);
    nav.discoveredPois.add(id);
    this.addLog(`Visitamos ${p.name}: ${p.description}`);
    this.guide.say(`${p.name}: ${p.description}`, 'good', 12);
    this.lastNews = performance.now();
  }

  // ------------------------------------------------------------ eventos do sistema

  /** Entrou num sistema: a estrela mais próxima passa a ser a seguinte, e o GUIA anuncia o sistema. */
  systemEntered(sys: LocalSystem): void {
    this.nearestStar = this.stars.nearest(this.state.shipPos, sys.starId);
    const nav = this.nav;
    const { info, data } = sys;
    const summary = summarize(data);
    const first = !nav.visitedStars.has(info.id);
    nav.visitedStars.add(info.id);
    nav.scannedStars.add(info.id);
    this.lastNews = performance.now();
    const text = describeSystem(summary);
    if (first) {
      this.addLog(`Primeira visita ao sistema ${info.name}: ${text}.`);
      this.guide.say(`Sistema ${info.name}: ${text}.${data.catalogued ? ' Planetas de catálogo real.' : ''}`, 'good', 9);
    } else this.guide.say(`Entrando no sistema ${info.name}: ${text}.`);
  }

  visitorArrived(sys: LocalSystem, c: CometData, entering: boolean): void {
    this.addLog(`Cometa visitante ${entering ? 'passando por' : 'entrou em'} ${sys.info.name}: ${c.name}.`);
    this.guide.say(`${entering ? 'Há um cometa visitante passando agora' : 'Um cometa visitante entrou no sistema'}: ${c.name}. Bom alvo para uma sonda (gelo e voláteis).`, 'good', 9);
  }

  /** A nave entrou na órbita de um planeta (ou saiu, com null): a primeira visita vai para o diário. */
  orbitEntered(orbit: Body | null): void {
    const p = orbit?.planet;
    const nav = this.nav;
    if (!p || nav.visitedBodies.has(p.id)) return;
    nav.visitedBodies.add(p.id);
    const tier = lifeTierOf(p);
    this.addLog(`Órbita de ${p.name} (${PLANET_KIND_LABEL[p.kind].toLowerCase()}${tier !== 'none' ? `, ${LIFE_LABEL[tier]}` : ''}).`);
    this.lastNews = performance.now();
  }

  // ------------------------------------------------------------ listas do GUIA

  /** Chamar a cada quadro: atualiza as listas 4 vezes por segundo. */
  tick(now: number): void {
    if (now - this.lastRefresh <= REFRESH_MS) return;
    this.lastRefresh = now;
    this.refresh(now);
  }

  /** Atualiza pontos de interesse desenhados, a lista do GUIA e as sugestões. */
  refresh(now: number): void {
    const nav = this.nav;
    const ship = this.state.shipPos;
    const sys = this.systems.system;
    this.nearbyStars = this.stars.nearby(ship, 40, sys?.starId);
    this.nearestStar = this.nearbyStars[0] ?? null;
    // Estrelas bem próximas são varridas sozinhas.
    for (const st of this.nearbyStars) if (st.distAu < 0.3 * AU_PER_PC) nav.scannedStars.add(st.id);

    // Pontos de interesse: detecção passiva, visita e objetos 3D por perto.
    const pois = poisNear(ship, POI_LIST_PC * AU_PER_PC);
    const draw: Poi[] = [];
    for (const p of pois) {
      const pc = p.dist / AU_PER_PC;
      if (!nav.discoveredPois.has(p.id) && (pc < POI_PASSIVE_PC || (p.kind === 'nebula' && pc < NEBULA_SEEN_PC))) {
        nav.discoveredPois.add(p.id);
        this.addLog(`Detectado: ${p.name} (${POI_LABEL[p.kind].toLowerCase()}).`);
        this.guide.say(`Detectei ${POI_LABEL[p.kind].toLowerCase()} por perto: ${p.name}. Aperte N para ver as sugestões.`, 'good');
        this.lastNews = now;
      }
      if (p.dist < poiArrive(p) * 1.6) this.visitPoi(p.id);
      if (pc < POI_DRAW_PC && nav.discoveredPois.has(p.id)) draw.push(p);
    }
    this.systems.syncPois(draw);

    // Entradas do radar e do painel.
    const entries: NavEntry[] = [];
    const cands: Candidate[] = [];
    if (sys) {
      const sysArrive = systemViewRadius(sys.data, sys.info);
      for (const b of sys.planets) {
        const p = b.planet!;
        const tier = lifeTierOf(p);
        const inZone = p.kind === 'rocky' && p.aAu >= sys.data.habitable[0] && p.aAu <= sys.data.habitable[1];
        const visited = nav.visitedBodies.has(p.id);
        const detail = `${PLANET_KIND_LABEL[p.kind]}${inZone ? ' · zona habitável' : ''}${tier !== 'none' ? ` · ${LIFE_LABEL[tier]}` : ''}${visited ? ' · visitado' : ''}`;
        const target: NavTarget = { kind: 'planet', id: p.id, name: p.name, pos: toTuple(sys.star.pos), starId: sys.starId, arrive: sysArrive, info: detail };
        const dist = b.pos.distanceTo(ship);
        entries.push({ key: p.id, group: 'system', target, name: p.name, pos: b.pos, dist, arrive: b.radius * 3, color: KIND_COLOR[p.kind], detail });
        const interest = visited ? 0.2
          : tier === 'sapient' ? 6 : tier === 'animals' ? 5 : tier === 'plants' ? 4.2
          : inZone ? 3.5 : p.kind === 'rocky' ? 1.8 : p.rings ? 1.6 : 1.1;
        const reason = tier !== 'none' ? `${LIFE_LABEL[tier][0].toUpperCase()}${LIFE_LABEL[tier].slice(1)}` : inZone ? 'Rochoso na zona habitável' : `${PLANET_KIND_LABEL[p.kind]} ainda não visitado`;
        cands.push({ target, distAu: dist, arriveAu: b.radius * 3, interest, reason: visited ? 'Já visitado' : reason });
      }
      for (const b of sys.comets) {
        const target: NavTarget = { kind: 'comet', id: b.id!, name: b.name, pos: toTuple(sys.star.pos), starId: sys.starId, arrive: sysArrive, info: 'Cometa · gelo e poeira, cauda apontando para longe da estrela' };
        const dist = b.pos.distanceTo(ship);
        entries.push({ key: b.id!, group: 'system', target, name: b.name, pos: b.pos, dist, arrive: 0.005, color: '#aee8ff', detail: 'Cometa' });
        cands.push({ target, distAu: dist, arriveAu: 0.005, interest: nav.visitedBodies.has(b.id!) ? 0.2 : 2, reason: 'Cometa com cauda, perto da estrela' });
      }
    }
    for (const b of nav.bookmarks) {
      const pos = new THREE.Vector3(...b.pos);
      const target: NavTarget = { kind: 'mark', id: b.id, name: b.name, pos: b.pos, arrive: 0.05, info: 'Marcador do jogador' };
      entries.push({ key: b.id, group: 'mark', target, name: b.name, pos, dist: pos.distanceTo(ship), arrive: 0.05, color: '#ffd34d', detail: 'Marcador', marker: true });
    }
    const home = this.homeTarget();
    const homePos = sys?.starId === SOL_ID ? sys.planets[2].pos : new THREE.Vector3();
    entries.push({ key: 'home', group: 'mark', target: home, name: home.name, pos: homePos, dist: homePos.distanceTo(ship), arrive: home.arrive, color: '#6aa8ff', detail: 'Casa' });
    const homePc = ship.length() / AU_PER_PC;
    if (homePc > 1.5) cands.push({ target: home, distAu: ship.length(), arriveAu: home.arrive, interest: Math.min(1.5, 0.3 + homePc * 0.05), reason: 'Voltar para casa' });

    for (const p of pois) {
      if (!nav.discoveredPois.has(p.id)) continue;
      const target = this.poiTarget(p);
      const visited = nav.visitedPois.has(p.id);
      const pos = new THREE.Vector3(...p.pos);
      entries.push({ key: p.id, group: 'poi', target, name: p.name, pos, dist: p.dist, arrive: target.arrive, color: hex(p.color), detail: `${POI_LABEL[p.kind]}${visited ? ' · visitado' : ''}`, marker: true });
      const interest = visited ? 0.2 : p.id === TUTORIAL_POI.id ? 8 : POI_INTEREST[p.kind];
      cands.push({ target, distAu: p.dist, arriveAu: target.arrive, interest, reason: visited ? 'Já visitado' : `${POI_LABEL[p.kind]} ainda não visitado` });
    }
    for (const s of this.nearbyStars.slice(0, 30)) {
      const info = this.info(s);
      const scanned = nav.scannedStars.has(s.id);
      const visited = nav.visitedStars.has(s.id);
      const summary = scanned ? summarize(generateSystem(info)) : null;
      const target = this.starTarget(s);
      const detail = visited ? `Visitado · ${describeSystem(summary!)}` : summary ? describeSystem(summary) : 'Não varrido';
      entries.push({ key: target.id, group: 'star', target, name: info.name, pos: s.pos, dist: s.distAu, arrive: target.arrive, color: starCss(s.ci), detail });
      const si = starInterest(visited, scanned, summary);
      cands.push({ target, distAu: s.distAu, arriveAu: target.arrive, interest: si.interest, reason: si.reason });
    }
    entries.sort((a, b) => a.dist - b.dist);
    this.entries = entries;
    this.departDistance = this.nearestSurface().dist;
    const ranked = rankSuggestions(cands, 5, this.departDistance);
    if (ranked.map((s) => s.target.id).join() !== this.suggestions.map((s) => s.target.id).join()) this.suggestionIndex = -1;
    this.suggestions = ranked;
    this.guide.setData(entries, ranked, nav.log);
    this.probes.setNearby(this.mineSources(true));

    // Sem alvo e sem novidade há um tempo: o GUIA oferece ajuda.
    if (!nav.target && now - this.lastNews > IDLE_HINT_MS && ranked[0]) {
      this.lastNews = now;
      this.guide.say(`Que tal ${ranked[0].target.name}? ${ranked[0].reason}, a ≈ ${formatEta(ranked[0].eta)}. Aperte N e depois J.`, 'info', 10);
    }
  }

  /** Distância até a superfície visível mais próxima, em UA, e o nome do corpo (objeto reaproveitado). */
  nearestSurface(): { readonly dist: number; readonly name: string } {
    const ship = this.state.shipPos;
    const best = this.surface;
    best.dist = Infinity;
    best.name = '—';
    const bodies = this.systems.bodies();
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const d = b.pos.distanceTo(ship) - b.radius;
      if (d < best.dist) {
        best.dist = d;
        best.name = b.name;
      }
    }
    const s = this.nearestStar;
    if (s) {
      const d = s.pos.distanceTo(ship) - starVisualRadius(s);
      if (d < best.dist) {
        best.dist = d;
        best.name = this.info(s).name;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ sondas

  /** Refaz a lista de fontes quando os corpos mudaram (sistema, cometa visitante, pontos de interesse). */
  private ensureSources(): void {
    if (this.sourcesVersion === this.systems.version) return;
    this.sourcesVersion = this.systems.version;
    const list: SourceSlot[] = [];
    const add = (src: MineSource, reach: number) => list.push({ src, reach, d: 0 });
    const sys = this.systems.system;
    for (const b of sys?.planets ?? []) {
      const p = b.planet!;
      if (p.kind === 'rocky') add({ id: p.id, name: p.name, kind: 'rocky', water: p.water, pos: b.pos, radius: b.radius * 1.6 }, b.radius * 6);
      if (p.rings) add({ id: `${p.id}:aneis`, name: `Anéis de ${p.name}`, kind: 'ring', water: 0, pos: b.pos, radius: b.radius * 1.8 }, b.radius * 6);
    }
    for (const b of sys?.comets ?? []) add({ id: b.id!, name: b.name, kind: 'comet', water: 0, pos: b.pos, radius: b.radius * 8 }, 0.03);
    for (const { poi, body } of this.systems.pois()) {
      const kind = poi.kind === 'comet' ? 'comet' : poi.kind === 'rogue' ? 'rogue' : poi.kind === 'derelict' ? 'derelict' : null;
      if (kind) add({ id: poi.id, name: poi.name, kind, water: 0, pos: body.pos, radius: poi.radius * 3 }, poiArrive(poi) * 3);
    }
    this.sources = list;
    this.sourceById = new Map();
    for (const s of list) if (!this.sourceById.has(s.src.id)) this.sourceById.set(s.src.id, s.src);
  }

  /**
   * Corpos de onde as sondas extraem: planetas rochosos, anéis, cometas e
   * alguns pontos de interesse. Com `inRange`, só os que estão ao alcance, do mais perto ao mais longe.
   */
  mineSources(inRange: boolean): MineSource[] {
    this.ensureSources();
    if (!inRange) return this.sources.map((s) => s.src);
    const ship = this.state.shipPos;
    for (const s of this.sources) s.d = s.src.pos.distanceTo(ship);
    return this.sources
      .filter((s) => s.d < s.reach)
      .sort((a, b) => a.d - b.d)
      .map((s) => s.src);
  }

  /** Fonte da missão de uma sonda, pelo id (consultada a cada quadro, sem montar a lista). */
  readonly source = (id: string): MineSource | null => {
    this.ensureSources();
    return this.sourceById.get(id) ?? null;
  };

  /** Estrelas com nome entre as carregadas, para a busca do painel. */
  searchStars(text: string): NavEntry[] {
    const ship = this.state.shipPos;
    const out: NavEntry[] = [];
    for (const s of this.stars.named(this.state.names)) {
      const info = this.info(s);
      if (!info.name.toLowerCase().includes(text)) continue;
      const target = this.starTarget(s);
      out.push({ key: target.id, group: 'star', target, name: info.name, pos: s.pos, dist: s.pos.distanceTo(ship), arrive: target.arrive, color: starCss(s.ci), detail: target.info });
    }
    return out.sort((a, b) => a.dist - b.dist).slice(0, 30);
  }
}

function findBody(list: readonly Body[], id: string): Body | undefined {
  for (const x of list) if ((x.planet?.id ?? x.id) === id) return x;
  return undefined;
}
