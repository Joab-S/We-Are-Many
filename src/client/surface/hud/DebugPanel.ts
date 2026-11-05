import { GENERATOR_VERSION } from '../../../procgen/surface';
import type { EngineCommand } from '../../../sim/api/commands';
import type { Engine } from '../../../sim/api/engine';
import type { EngineEvent, EngineEventKind } from '../../../sim/api/events';
import type { WorldEvent } from '../../../sim/events';
import {
  caseJson,
  debugCase,
  debugShellHtml,
  DEBUG_EVENT_LIMIT,
  DEBUG_FRAME_LIMIT,
  eventEntry,
  eventsHtml,
  familyTabHtml,
  livePlaces,
  perfHtml,
  personInfo,
  placeTabHtml,
  Ring,
  summaryText,
  timeHtml,
  tuneHtml,
  worldHtml,
  yearText,
  type DebugTab,
  type EventEntry,
  type FrameSample,
  type SurfaceStats,
} from '../debugPanel';
import { SURFACE_KEYS } from '../keys';
import { LOG_LIMIT, type SimDriver } from '../SimDriver';
import { HtmlSlot, HudComponent } from './component';

/** Intervalo de atualização do painel aberto (ms). */
const DEBUG_PANEL_MS = 500;
/** Quadro mais longo que isso (aba no fundo, depurador parado) não entra na conta do FPS. */
const FRAME_GAP_MS = 1000;

/** O que o painel precisa da superfície: o motor pela fachada, o relógio e a seleção do mapa. */
export interface DebugHost {
  readonly engine: Engine;
  readonly driver: SimDriver<EngineCommand, EngineEvent>;
  /** O log vem do começo do mundo (a semente e o log o refazem), ou o mundo é de um save antigo. */
  readonly fresh: boolean;
  /** Lugar selecionado no mapa (janela do assentamento, pessoa ou lugar fixado na ficha), ou -1. */
  place(): number;
  /** Pessoa fixada na ficha (índice na vista), ou -1. */
  creature(): number;
  /** Seleciona o lugar (abre a janela dele) e leva a câmera até ele. */
  selectPlace(id: number): void;
  goTo(x: number, row: number): void;
  /** Onde cai um evento provocado: o lugar selecionado ou o meio da tela. */
  spot(): { x: number; y: number };
  /** Avança `n` passos (`SimDriver.stepBy`), avisa a tela e devolve quantos deu. */
  advance(n: number): number;
  /** As medidas de `surface.stats`. */
  stats(): SurfaceStats;
  /** O painel abriu ou fechou (pilha do Esc, lugar da ficha). */
  toggled(open: boolean): void;
}

/**
 * Painel de depuração da superfície (`?debug`, F3), o componente: guarda os últimos eventos do motor num anel
 * (desde que a superfície abre, aberto ou não), as medidas de cada quadro, as escolhas do jogador no painel
 * (aba, filtros, lista, família) e, aberto, refaz só a aba visível a cada DEBUG_PANEL_MS, escrevendo no DOM só
 * quando o HTML mudou (HtmlSlot). O HTML vem das funções puras de `debugPanel.ts`; o motor, só pela fachada
 * (`engine.view`, `engine.debug`) e pelos eventos do despachante.
 */
export class DebugPanel extends HudComponent {
  open = false;
  private tab: DebugTab = 'world';
  private readonly el: HTMLElement;
  private readonly body: HtmlSlot;
  private readonly sum: HtmlSlot;
  private readonly events = new Ring<EventEntry>(DEBUG_EVENT_LIMIT);
  private readonly frames = new Ring<FrameSample>(DEBUG_FRAME_LIMIT);
  private lastFrame = NaN;
  // Escolhas do jogador no painel.
  private readonly kinds = new Set<EngineEventKind>();
  private onlyPlace = false;
  /** Lugar selecionado quando o jogador pediu a lista dos lugares (a lista vale até a seleção mudar). */
  private listFor: number | null = null;
  /** Família escolhida pelo clique numa decisão, sem pessoa fixada. */
  private focus: { family: number; village: number } | null = null;
  /** O último Avançar e o último caso copiado. */
  private lastAdvance: { steps: number; ms: number } | null = null;
  private copied = '';
  /** O texto da busca da aba Ajustes. */
  private filter = '';
  /** A impressão digital mostrada na aba Tempo, com o passo e o tamanho do log de quando foi tirada. */
  private hash: { tick: number; log: number; value: string } | null = null;

  constructor(
    root: HTMLElement,
    private readonly host: DebugHost,
    signal: AbortSignal,
  ) {
    super(DEBUG_PANEL_MS);
    const el = (this.el = document.createElement('div'));
    el.className = 'wb-debugp';
    el.hidden = true;
    el.innerHTML = debugShellHtml();
    root.appendChild(el);
    this.body = new HtmlSlot(el.querySelector<HTMLElement>('[data-dbody]')!);
    this.sum = new HtmlSlot(el.querySelector<HTMLElement>('[data-dsum]')!);
    // pointerdown, como no painel e nas janelas: o corpo é reescrito enquanto o tempo anda.
    el.addEventListener('pointerdown', (e) => this.onClick(e.target as HTMLElement), { signal });
    // O F3 do navegador procura na página: com o painel, a tecla é dele.
    window.addEventListener('keydown', (e) => SURFACE_KEYS.debug.includes(e.code) && e.preventDefault(), { signal });
    // Na caixa do caso, as teclas são do texto (Ctrl+C não abre a crônica); Esc e F3 seguem para o jogo.
    // Nos campos da aba Ajustes, as teclas já não vão para o jogo (`Input`). Enter e Esc saem do campo, e a constante muda
    // quando ele confirma.
    el.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement && (e.code === 'Enter' || e.code === 'Escape')) e.target.blur();
    }, { signal });
    el.addEventListener('change', (e) => this.onChange(e.target as HTMLElement), { signal });
    el.addEventListener('input', (e) => {
      const box = e.target as HTMLInputElement;
      if (box.dataset.dfilter === undefined) return;
      this.filter = box.value.trim().toLowerCase();
      this.filterConstants();
    }, { signal });
    el.querySelector('textarea')!.addEventListener('keydown', (e) => e.code !== 'Escape' && !SURFACE_KEYS.debug.includes(e.code) && e.stopPropagation(), { signal });
    // O anel ouve todos os eventos desde já: o texto e os lugares saem na chegada.
    host.driver.bus.onAny((e) => this.events.push(eventEntry(e, host.engine.view, this.events.total + 1)));
    // Com `?debug`, a série dos indicadores e as decisões juntam dados desde que a superfície abre, antes do painel.
    host.engine.debug.setRecording(true);
    // No passo exato de cada ano, e não no quadro em que o painel se refaz: assim, mundos iguais mostram o mesmo valor
    // no mesmo passo em qualquer velocidade. Custa dezenas de ms na Terra, então só com a aba Tempo aberta.
    host.driver.afterStep = (tick) => {
      if (this.open && this.tab === 'time' && tick % this.stepsPerYear() === 0) this.takeHash();
    };
  }

  /** Abre ou fecha (F3, o botão, o Esc). */
  toggle(open = !this.open): void {
    if (open === this.open) return;
    this.open = open;
    this.el.hidden = !open;
    if (!open) this.hideCase();
    this.host.toggled(open);
    if (open) this.refresh();
  }

  /** Um quadro (depois dos passos): guarda o tempo dele e as medidas do relógio para os gráficos. */
  frame(now: number): void {
    const s = this.host.driver.stats;
    const gap = Number.isNaN(this.lastFrame) ? 0 : now - this.lastFrame;
    this.lastFrame = now;
    this.frames.push({ frameMs: gap > FRAME_GAP_MS ? 0 : gap, steps: s.steps, stepMs: s.stepMs, dropped: s.dropped, events: s.events });
  }

  /** Refaz no próximo quadro, mesmo que o HTML pareça igual (clique no painel). */
  private refresh(): void {
    this.body.reset();
    this.invalidate();
  }

  protected update(): void {
    if (!this.open) return;
    const { engine, driver } = this.host;
    this.sum.set(summaryText(engine.seed, engine.view.year, driver.tick));
    this.el.querySelectorAll<HTMLElement>('[data-dtab]').forEach((b) => b.classList.toggle('on', b.dataset.dtab === this.tab));
    const body = this.body.el;
    const scroll = body.scrollTop;
    // Com o foco num campo da aba Ajustes, o HTML novo apagaria o que está sendo digitado: espera sair dele.
    if (this.tab === 'tune' && this.el.contains(document.activeElement) && document.activeElement instanceof HTMLInputElement) return;
    if (this.body.set(this.html())) {
      body.scrollTop = scroll;
      if (this.tab === 'tune') this.filterConstants();
    }
  }

  /** Mostra só as constantes que batem com a busca, sem refazer o HTML (a caixa não perde o foco). */
  private filterConstants(): void {
    const box = this.el.querySelector<HTMLInputElement>('[data-dfilter]');
    if (box && box.value !== this.filter && document.activeElement !== box) box.value = this.filter;
    this.el.querySelectorAll<HTMLElement>('[data-dname]').forEach((row) => {
      row.hidden = !row.dataset.dname!.includes(this.filter);
    });
  }

  /** Um campo de constante confirmado: vira comando, como toda ação sobre o mundo. */
  private onChange(t: HTMLElement): void {
    if (!(t instanceof HTMLInputElement) || !t.dataset.dtune) return;
    const value = Number(t.value);
    if (t.value !== '' && Number.isFinite(value)) this.host.driver.enqueue({ kind: 'tune', name: t.dataset.dtune, value });
    this.refresh();
  }

  /** A aba visível. */
  private html(): string {
    const { engine, driver } = this.host;
    const view = engine.view;
    const debug = engine.debug;
    switch (this.tab) {
      case 'world':
        // world() varre o mapa (alguns ms na Terra): só com esta aba aberta, no máximo a cada DEBUG_PANEL_MS.
        return worldHtml(debug.world(), { seed: engine.seed, year: view.year }, debug.recording);
      case 'place': {
        const sel = this.host.place();
        if (this.listFor !== null && this.listFor !== sel) this.listFor = null;
        const id = this.listFor === null ? sel : -1;
        return placeTabHtml(id, id >= 0 ? debug.place(id) : null, id >= 0 ? debug.decisions({ village: id, limit: 15 }) : [], livePlaces(view), view, debug.recording);
      }
      case 'family': {
        const person = personInfo(view, this.host.creature());
        if (person) this.focus = null;
        const family = person?.family ?? this.focus?.family;
        const decisions = debug.decisions(family !== undefined ? { family, limit: 12 } : { limit: 25 });
        return familyTabHtml({ person, focus: this.focus, decisions, view, recording: debug.recording });
      }
      case 'events':
        return eventsHtml(this.events.newest(), { kinds: this.kinds, onlyPlace: this.onlyPlace }, this.host.place(), view, this.events.total);
      case 'perf':
        return perfHtml(this.frames.toArray(), this.host.stats(), debug.profile(), debug.recording);
      case 'tune':
        return tuneHtml(debug.constants());
      case 'time':
        // Rodando, vale a do último ano. Parado, o mundo só muda por um Avançar ou por um comando: refaz nesses casos.
        if (!this.hash || (driver.paused && (this.hash.tick !== driver.tick || this.hash.log !== driver.log.length))) this.takeHash();
        return timeHtml({
          speed: driver.speed,
          seed: engine.seed,
          year: view.year,
          tick: driver.tick,
          log: driver.log.length,
          logLimit: driver.opts.logLimit ?? LOG_LIMIT,
          pending: driver.pending,
          stepsPerYear: this.stepsPerYear(),
          fresh: this.host.fresh,
          last: this.lastAdvance,
          hash: this.hash,
          copied: this.copied,
          caughtUp: view.caughtUpYears,
          skipped: view.skippedYears,
        });
    }
  }

  private takeHash(): void {
    const { engine, driver } = this.host;
    this.hash = { tick: driver.tick, log: driver.log.length, value: engine.debug.fingerprint() };
  }

  private stepsPerYear(): number {
    return Math.max(1, Math.round(this.host.engine.view.yearSpan / this.host.driver.h));
  }

  /** Cliques no painel, pelo `data-d*` do alvo. */
  private onClick(t: HTMLElement): void {
    if (t.closest<HTMLButtonElement>('button')?.disabled) return;
    const host = this.host;
    const at = (sel: string) => t.closest<HTMLElement>(sel);
    if (at('[data-dclose]')) return this.toggle(false);
    if (at('[data-dcase-close]')) return this.hideCase();
    const tab = at('[data-dtab]');
    if (tab) this.tab = tab.dataset.dtab as DebugTab;
    // Lugar (da lista, de uma decisão ou de um evento): seleciona e leva a câmera; a decisão escolhe a família.
    const place = at('[data-dplace]');
    if (place) {
      const id = Number(place.dataset.dplace);
      const family = Number(place.dataset.dfam ?? -1);
      if (family >= 0 && this.tab === 'family' && host.creature() < 0) this.focus = { family, village: id };
      this.listFor = null;
      host.selectPlace(id);
    }
    const go = at('[data-dgo]');
    if (go) {
      const [x, y] = go.dataset.dgo!.split(',').map(Number);
      host.goTo(x, y);
    }
    const kind = at('[data-dkind]');
    if (kind) {
      const k = kind.dataset.dkind as EngineEventKind | '';
      if (!k) this.kinds.clear();
      else if (!this.kinds.delete(k)) this.kinds.add(k);
    }
    if (at('[data-donly]')) this.onlyPlace = !this.onlyPlace;
    if (at('[data-dlist]')) this.listFor = host.place();
    if (at('[data-dall]')) this.focus = null;
    const speed = at('[data-dspeed]');
    if (speed) host.driver.setSpeed(Number(speed.dataset.dspeed));
    const step = at('[data-dstep]');
    if (step) {
      const steps = host.advance(Number(step.dataset.dstep));
      this.lastAdvance = { steps, ms: host.driver.stats.stepMs };
    }
    if (at('[data-drec]')) host.engine.debug.setRecording(!host.engine.debug.recording);
    if (at('[data-dcopy]')) void this.copyCase();
    const ev = at('[data-devent]');
    if (ev) host.driver.enqueue({ kind: 'event', event: ev.dataset.devent as WorldEvent, ...host.spot() });
    if (at('[data-dsurprise]')) host.driver.enqueue({ kind: 'surprise' });
    // Clicar num campo da aba Ajustes não pode refazer o HTML: ele some debaixo do cursor.
    if (t instanceof HTMLInputElement) return;
    this.refresh();
  }

  /** Copiar caso: o JSON vai para a área de transferência; se o navegador não deixar, fica selecionado na caixa. */
  private async copyCase(): Promise<void> {
    const { engine, driver } = this.host;
    const view = engine.view;
    const c = debugCase({
      seed: engine.seed,
      year: view.year,
      tick: driver.tick,
      step: driver.h,
      yearSpan: view.yearSpan,
      planet: view.map.params,
      attempt: view.map.life?.attempt ?? 0,
      notes: view.map.life?.notes ?? [],
      generator: GENERATOR_VERSION,
      fresh: this.host.fresh,
      fingerprint: engine.debug.fingerprint(),
      log: driver.log,
      logLimit: driver.opts.logLimit ?? LOG_LIMIT,
    });
    const json = caseJson(c);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('sem área de transferência');
      await navigator.clipboard.writeText(json);
      this.copied = `Caso copiado: semente ${c.seed}, ${yearText(c.year)}, passo ${c.tick}, ${c.log.length} comandos, impressão ${c.fingerprint}`;
      this.hideCase();
    } catch {
      this.copied = '';
      this.showCase(json);
    }
    this.refresh();
  }

  private showCase(json: string): void {
    const box = this.el.querySelector<HTMLElement>('[data-dcase]')!;
    const text = box.querySelector('textarea')!;
    box.hidden = false;
    text.value = json;
    text.focus();
    text.select();
  }

  private hideCase(): void {
    const box = this.el.querySelector<HTMLElement>('[data-dcase]')!;
    if (box.hidden) return;
    box.hidden = true;
    box.querySelector('textarea')!.blur();
  }
}
