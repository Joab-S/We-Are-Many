import { icon as svgIcon } from '../ui/icons';
import { seedFor } from '../../core/rng';
import { temperatureAt, type PlanetParams, type SurfaceMap } from '../../procgen/surface';
import type { GeoView } from '../../procgen/debugViews';
import { Ecosystem } from '../../sim/ecosystem';
import { applyCommand, type EngineCommand } from '../../sim/api/commands';
import { earthCatalog, nativeSpecies } from '../../sim/species';
import { Input } from '../input';
import { SoftRenderer, type GameRenderer } from '../renderer';
import type { GameState } from '../state';
import { generateSurfaceAsync } from './generateAsync';
import { SETTLEMENT_TABS, type CompareKey, type PeriodSpan, type SettlementTab } from './settlementWindow';
import { SpriteAtlas, SpriteLayer } from './sprites';
import { SpriteCollector } from './SpriteCollector';
import { MapRaster } from './MapRaster';
import { SimDriver, SPEEDS } from './SimDriver';
import { CreatureGrid } from './spatial';
import { Viewport } from './Viewport';
import { BrushFx } from './fx';
import { WeatherView } from './weatherView';
import { Selection } from './selection';
import { MapOverlay } from './overlay';
import { BrushHistory } from './history';
import { OverlayStack } from './overlays';
import { PickSecond, ToolMachine } from './toolStates';
import { IconCache } from './hud/icons';
import { Toolbar } from './hud/Toolbar';
import { InfoCard } from './hud/InfoCard';
import { SidePanel } from './hud/SidePanel';
import { Windows, type SurfaceSettings } from './hud/Windows';
import { SettlementView } from './hud/SettlementView';
import { Minimap } from './hud/Minimap';
import { Toast } from './hud/Toast';
import { Labels } from './hud/Labels';
import { buildTools, plain, REAL_YEAR_SECONDS, SETTLEMENT_TAB_ICONS, TAB_ICONS, TABS, WINDOW_ICONS, WINDOWS, type FxKind, type Tab, type Tool, type ToolContext, type Win } from './tools';

/** Folga (tiles) do recorte das criaturas pela grade: o desenho interpolado fica a até 3 tiles da posição atual. */
const GRID_SLACK = 4;

/**
 * Visão da superfície no estilo WorldBox (REQUISITOS.md, seção 4.7). Enquanto
 * este modo está ativo, nada do 3D fica carregado.
 *
 * Esta classe só orquestra (padrão Component): a câmera (`Viewport`), o
 * relógio da simulação e a fila de comandos (`SimDriver`), o chão do mapa
 * (`MapRaster`), os sprites (`SpriteCollector`), o canvas das áreas
 * (`MapOverlay`), a seleção, as animações e as partes do HUD. As ferramentas
 * não mexem no mundo: montam comandos (`src/sim/api/commands.ts`) que o
 * motor aplica na fronteira do passo.
 */
export class SurfaceMode {
  /** O mundo (público para `?debug` e as ferramentas de captura). */
  eco!: Ecosystem;
  private map!: SurfaceMap;
  private view!: Viewport;
  private driver!: SimDriver<EngineCommand>;
  private raster!: MapRaster;
  private atlas!: SpriteAtlas;
  private sprites!: SpriteLayer;
  private readonly collector = new SpriteCollector();
  private grid!: CreatureGrid;
  /** Assinatura do mundo quando a grade foi refeita (ano, população e comandos aplicados). */
  private gridKey = '';
  private applied = 0;
  private readonly fx = new BrushFx();
  private weather!: WeatherView;
  private sel!: Selection;
  private overlay!: MapOverlay;
  private readonly history = new BrushHistory();
  private icons!: IconCache;
  private toolbar!: Toolbar;
  private info!: InfoCard;
  private panel!: SidePanel;
  private windows!: Windows;
  private vwin!: SettlementView;
  private minimap!: Minimap;
  private toast!: Toast;
  private labels!: Labels;
  private readonly settings: SurfaceSettings = { showMinor: false, showLabels: true, showTerritory: true, layer: 'kingdoms', geoView: 'none' };
  private readonly input: Input;
  private readonly root: HTMLDivElement;
  private tools: Tool[] = [];
  /** A mão do jogador (padrão State): mão vazia, pincel, clique, segundo clique, seleção de grupo, arraste. */
  private machine!: ToolMachine;
  /** Janelas e seleções abertas, na ordem em que abriram: o Esc fecha a de cima. */
  private readonly overlays = new OverlayStack();
  private folded = false;
  /** Redesenhar no próximo quadro (algo mudou fora da câmera e do mundo). */
  private dirty = true;
  private lastView = '';
  private raf = 0;
  private lastTime = performance.now();
  private ready = false;
  private readonly abort = new AbortController();
  private lastW = 0;
  private lastH = 0;
  private lastDpr = 0;

  /**
   * A superfície é 2D e não precisa de placa de vídeo: desenha sempre num
   * Canvas 2D próprio (o canvas do 3D fica escondido enquanto isso), igual
   * em qualquer computador.
   */
  private readonly renderer: SoftRenderer;

  constructor(
    private readonly shared: GameRenderer,
    private readonly state: GameState,
    private readonly params: PlanetParams,
    hud: HTMLElement,
    private readonly onExit: () => void,
    /** Câmera e velocidade de um save carregado. */
    private readonly resume?: { center: [number, number]; zoom: number; speed: number },
  ) {
    if (shared instanceof SoftRenderer) {
      this.renderer = shared;
      this.renderer.setPixelRatio(1);
    } else {
      this.renderer = new SoftRenderer();
      this.renderer.setPixelRatio(1);
      shared.domElement.after(this.renderer.domElement);
      shared.domElement.style.display = 'none';
    }
    this.input = new Input(this.renderer.domElement, false);
    this.root = document.createElement('div');
    this.root.className = 'surface-hud';
    this.root.innerHTML = `<div class="wb-loading">Observando a superfície de ${params.name}…</div>`;
    hud.appendChild(this.root);
    window.addEventListener('resize', this.resize, { signal: this.abort.signal });
    // Ctrl+Z (ou Cmd+Z) desfaz o último traço do pincel de terreno ou clima.
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.ready || e.target instanceof HTMLInputElement || !(e.ctrlKey || e.metaKey) || e.code !== 'KeyZ' || e.repeat) return;
        e.preventDefault();
        this.undo();
      },
      { signal: this.abort.signal },
    );
    this.renderer.setClearColor(0x05070d);
    this.renderer.clear();

    const existing = state.surfaces.get(params.id);
    if (existing) this.init(existing);
    else void generateSurfaceAsync(params).then((map) => this.init(map));
  }

  private init(map: SurfaceMap): void {
    if (this.abort.signal.aborted) return;
    const state = this.state;
    this.map = map;
    state.surfaces.set(this.params.id, map);

    // Espécies nativas passam a ser conhecidas (podem ser levadas a outros planetas).
    let eco = state.ecosystems.get(this.params.id);
    if (!eco) {
      eco = new Ecosystem(map, seedFor(`${this.params.id}:life`));
      for (const sp of nativeSpecies(this.params)) {
        eco.addSpecies(sp);
        state.knownSpecies.set(sp.id, sp);
      }
      eco.populate();
      state.ecosystems.set(this.params.id, eco);
    }
    this.eco = eco;
    eco.yearSpan = REAL_YEAR_SECONDS;
    // O banco genético da Terra vem a bordo; variantes que surgem entram no catálogo.
    for (const sp of earthCatalog()) if (!state.knownSpecies.has(sp.id)) state.knownSpecies.set(sp.id, sp);
    for (const sp of eco.species) state.knownSpecies.set(sp.id, sp);
    eco.onSpecies = (sp) => {
      if (state.knownSpecies.has(sp.id)) return;
      state.knownSpecies.set(sp.id, sp);
      this.tools = buildTools(state.knownSpecies.values());
      if (this.ready) this.toolbar.selectTab(this.toolbar.tab);
    };

    this.view = new Viewport(map.width, map.height);
    this.view.zoom = Math.max(1, window.innerHeight / map.height);
    this.driver = new SimDriver<EngineCommand>(eco, (cmd) => this.apply(cmd), { wrapWidth: map.width });
    if (this.resume) {
      this.view.center.x = this.resume.center[0];
      this.view.center.y = this.resume.center[1];
      this.view.setZoom(this.resume.zoom);
      this.driver.setSpeed(this.resume.speed);
    }
    this.raster = new MapRaster(map, eco);
    // Observer: o motor avisa o tile que mudou e a tela só o marca para repintar (o bioma já vem reclassificado).
    eco.onTileChanged = (i) => this.raster.markDirty(i);
    this.atlas = new SpriteAtlas();
    this.sprites = new SpriteLayer(this.atlas, 12000);
    this.grid = new CreatureGrid(map.width, map.height);
    this.weather = new WeatherView(eco);
    this.icons = new IconCache(this.atlas);
    this.tools = buildTools(state.knownSpecies.values());

    this.buildUi();
    this.resize();
    this.ready = true;
    // `?debug` deixa a cena acessível no console (testes e calibragem).
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as { surface: SurfaceMode }).surface = this;
    this.raf = requestAnimationFrame(this.frame);
  }

  // Comandos ------------------------------------------------------------------

  /** Aplica um comando no motor (chamado pelo SimDriver na fronteira do passo). */
  private apply(cmd: EngineCommand): void {
    // O que o jogador muda vai para a tela no mesmo quadro.
    this.raster.urgent = true;
    const res = applyCommand(this.eco, this.map, cmd, { journal: cmd.kind === 'terraform' ? this.history.journal : null });
    this.raster.urgent = false;
    this.applied++;
    this.dirty = true;
    if (cmd.kind === 'surprise' && res.at) this.goTo(res.at.x, res.at.y);
    // Influência em par: anima também no reino de origem quando deu certo.
    if (cmd.kind === 'politics' && res.ok && cmd.a !== cmd.b) {
      const fx = this.tools.find((t) => t.id === cmd.action)?.fx;
      const a = this.eco.villages[cmd.a];
      if (fx && a) this.fx.burst(fx, a.x, this.map.height - a.y);
    }
    if (cmd.kind === 'events') this.windows.refresh(this.eco);
  }

  /** Ctrl+Z: desfaz o último traço do pincel de terreno ou clima. */
  private undo(): void {
    const cmd = this.history.undo();
    if (!cmd) {
      this.toast.say('Nada para desfazer');
      return;
    }
    this.driver.enqueue(cmd);
    this.toast.say('Traço desfeito');
  }

  /** O que as ferramentas usam para agir: elas só leem o mundo e enfileiram comandos. */
  private readonly toolCtx: ToolContext = ((mode: SurfaceMode): ToolContext => ({
    get eco() {
      return mode.eco;
    },
    get brush() {
      return mode.toolbar.brush;
    },
    toRow: (y) => mode.view.toRow(y),
    enqueue: (cmd) => mode.driver.enqueue(cmd),
    burst: (kind: FxKind, x, y) => mode.fx.burst(kind, x, y),
    say: (text) => mode.toast.say(text),
    pickSecond: (tool, first) => mode.machine.change(new PickSecond(mode.machine, tool, first)),
    goTo: (x, row) => mode.goTo(x, row),
  }))(this);

  /** Leva a câmera até um tile (x, linha). */
  goTo(x: number, row: number): void {
    this.view.goTo(x, row);
  }

  // Compatibilidade com `?debug` e tools/capture-settlements.mjs ---------------

  get speed(): number {
    return this.driver.speed;
  }

  set speed(v: number) {
    this.driver.setSpeed(v);
  }

  get zoom(): number {
    return this.view.zoom;
  }

  set zoom(v: number) {
    this.view.setZoom(v);
  }

  /** Pede um redesenho (o nome antigo do campo, usado por ferramentas de captura). */
  set textureChanged(v: boolean) {
    if (v) this.dirty = true;
  }

  // Interface ----------------------------------------------------------------

  private buildUi(): void {
    this.root.innerHTML = `
      <canvas class="wb-terr" data-terr></canvas>
      <div class="wb-labels" data-l></div>
      <div class="wb-top">
        <button class="wb-back wb-ib" data-a="back" title="Voltar à órbita">${svgIcon('left')}</button>
        <div class="wb-title">${this.params.name}</div>
        <div class="wb-stats" data-s></div>
        <div class="wb-clock" data-clock></div>
        <div class="wb-menu">
          ${WINDOWS.map(([id, label]) => `<button class="wb-back wb-ib" data-w="${id}" title="${plain(label)}">${svgIcon(WINDOW_ICONS[id])}</button>`).join('')}
          <button class="wb-back wb-ib" data-a="help" title="Controles (H)">${svgIcon('help')}</button>
        </div>
      </div>
      <div class="wb-info" data-i hidden></div>
      <div class="wb-side" data-side>
        <div class="wb-side-head">
          <canvas class="wb-mini" data-mini width="200" height="100" title="Clique ou arraste para levar a câmera"></canvas>
          <button class="wb-fold" data-fold title="Esconder ou mostrar o painel (P)">${svgIcon('layers')}<span>Painel</span></button>
        </div>
        <div class="wb-side-body" data-p></div>
      </div>
      <div class="wb-cursor" data-cursor hidden></div>
      <div class="wb-window" data-win hidden>
        <div class="wb-win-head"><b data-win-title></b><button class="wb-x" data-close title="Fechar (Esc)">✕</button></div>
        <div class="wb-win-body" data-win-body></div>
      </div>
      <div class="wb-vwin" data-vwin hidden>
        <div class="wb-win-head"><b data-vwin-title></b><button class="wb-x" data-vclose title="Fechar (Esc)">✕</button></div>
        <div class="wb-vtabs" data-vtabs>${SETTLEMENT_TABS.map(([id, label]) => `<button data-vtab="${id}" title="${label}" aria-label="${label}">${svgIcon(SETTLEMENT_TAB_ICONS[id] ?? 'eye')}</button>`).join('')}</div>
        <div class="wb-win-body" data-vwin-body></div>
      </div>
      <div class="wb-crowd" data-crowd hidden></div>
      <div class="wb-boxsel" data-box hidden></div>
      <div class="wb-toast" data-toast hidden></div>
      <div class="wb-dock">
        <div class="wb-tip" data-tip></div>
        <div class="wb-tabs">${TABS.map(([id, label]) => `<button data-tab="${id}" title="${plain(label)}">${svgIcon(TAB_ICONS[id])}</button>`).join('')}</div>
        <div class="wb-bar" data-bar></div>
      </div>
      <div class="wb-help" data-help hidden>
        <div class="wb-win-head"><b>Controles</b><button class="wb-x" data-a="help" title="Fechar (H)">✕</button></div>
        <div class="wb-keys">
          <span><kbd>Esquerdo</kbd> usa a ferramenta; de mão vazia arrasta o mapa e um clique fixa a ficha do que está embaixo. Clicar de novo no mesmo ponto passa para a próxima criatura</span>
          <span>Clique no nome, na praça ou num prédio para abrir a janela do assentamento · <kbd>Shift</kbd> + arrastar escolhe um grupo · <kbd>F</kbd> segue a criatura escolhida</span>
          <span><kbd>Direito</kbd><kbd>WASD</kbd> movem o mapa · <kbd>Roda</kbd> zoom</span>
          <span><kbd>Espaço</kbd> pausa · <kbd>1</kbd>–<kbd>5</kbd> velocidade</span>
          <span><kbd>[</kbd><kbd>]</kbd> tamanho do pincel · <kbd>Ctrl</kbd>+<kbd>Z</kbd> desfaz o último traço de terreno ou clima · <kbd>Esc</kbd> fecha o que abriu por último, guarda a ferramenta ou volta à órbita</span>
          <span><kbd>C</kbd> crônica · <kbd>R</kbd> reinos · <kbd>E</kbd> espécies · <kbd>I</kbd> itens · <kbd>P</kbd> painel · <kbd>T</kbd> territórios · <kbd>H</kbd> esta ajuda</span>
          <span>Cada reino tem uma cor: a área dos assentamentos e a faixa do nome mostram de quem é. Borda cheia é a capital; tracejada, os outros assentamentos do reino.</span>
          <span>No minimapa, clique ou arraste para levar a câmera.</span>
        </div>
      </div>`;
    const root = this.root;
    const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
    const signal = this.abort.signal;
    const eco = this.eco;
    const view = this.view;
    const redraw = () => (this.dirty = true);
    this.toast = new Toast(q('[data-toast]'));
    this.windows = new Windows(root, this.icons, this.settings, this.state.knownSpecies, this.params.id);
    this.vwin = new SettlementView(root, this.icons);
    this.sel = new Selection(eco, view, q('[data-crowd]'), {
      openSettlement: (id) => this.openSettlement(id),
      refreshInfo: () => this.info.refresh(this.eco),
      redraw,
      say: (t) => this.toast.say(t),
      goTo: (x, row) => this.goTo(x, row),
      layer: (id, open) =>
        this.overlays.set(id, open, () => {
          if (id === 'crowd') this.sel.showCrowd(null);
          else if (id === 'pinned') this.sel.unpin();
          else this.sel.setHighlight(null);
        }),
    });
    this.info = new InfoCard(q('[data-i]'), view, this.sel, this.weather, { say: (t) => this.toast.say(t), redraw });
    this.panel = new SidePanel(root, this.settings, () => this.driver.speed, () => this.raster.version);
    this.minimap = new Minimap(q<HTMLCanvasElement>('[data-mini]'), view, () => this.raster.canvas());
    this.labels = new Labels(q('[data-l]'));
    this.overlay = new MapOverlay(q<HTMLCanvasElement>('[data-terr]'), eco, view, this.sel, this.settings, this.weather, this.fx);
    const mode = this;
    this.toolbar = new Toolbar(
      root,
      this.icons,
      view,
      {
        tools: () => mode.tools,
        get tool() {
          return mode.machine.tool;
        },
        setTool: (t) => mode.setTool(t),
      },
      signal,
    );

    this.machine = new ToolMachine({
      view,
      ctx: this.toolCtx,
      history: this.history,
      sel: this.sel,
      brush: this.toolbar,
      enqueue: (cmd) => this.driver.enqueue(cmd),
      emitFx: (tool, dt) => this.emitFx(tool, dt),
      showBox: (b) => this.showBox(b),
      toolChanged: () => this.toolbar.refreshTool(),
    });

    q('[data-a="back"]').addEventListener('click', () => this.onExit(), { signal });
    root.querySelectorAll('[data-a="help"]').forEach((b) => b.addEventListener('click', () => this.toggleHelp(), { signal }));
    q('[data-fold]').addEventListener('click', () => this.fold(), { signal });
    const mini = this.minimap.canvas;
    const jump = (e: PointerEvent) => {
      const [x, row] = this.minimap.pointAt(e, this.map.width, this.map.height);
      view.center.x = x;
      view.center.y = this.map.height - row;
    };
    mini.addEventListener(
      'pointerdown',
      (e) => {
        mini.setPointerCapture(e.pointerId);
        jump(e);
      },
      { signal },
    );
    mini.addEventListener('pointermove', (e) => mini.hasPointerCapture(e.pointerId) && jump(e), { signal });
    root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => this.toolbar.selectTab(b.dataset.tab as Tab), { signal }));
    root.querySelectorAll<HTMLButtonElement>('[data-w]').forEach((b) => b.addEventListener('click', () => this.openWindow(b.dataset.w as Win), { signal }));
    q('[data-close]').addEventListener('click', () => this.openWindow(null), { signal });
    // pointerdown porque o painel e as janelas são redesenhados enquanto a
    // simulação roda e um clique (descer e subir) poderia cair em botões já substituídos.
    const onPanel = (e: Event) => this.onPanel(e.target as HTMLElement);
    for (const sel of ['[data-p]', '[data-win-body]', '[data-clock]', '[data-i]', '[data-vwin]']) q(sel).addEventListener('pointerdown', onPanel, { signal });
    q('[data-vclose]').addEventListener('click', () => this.openSettlement(null), { signal });
    // Rótulo do assentamento: clicar abre a janela dele (RF-VIDA-340).
    q('[data-l]').addEventListener(
      'pointerdown',
      (e) => {
        const label = (e.target as HTMLElement).closest<HTMLElement>('[data-vid]');
        if (label) this.openSettlement(Number(label.dataset.vid));
      },
      { signal },
    );
    q('[data-crowd]').addEventListener(
      'pointerdown',
      (e) => {
        const row = (e.target as HTMLElement).closest<HTMLElement>('[data-pickone]');
        if (row) this.sel.select(Number(row.dataset.pickone));
        this.sel.showCrowd(null);
      },
      { signal },
    );
    this.toolbar.selectTab('terrain');
    this.bindCanvas(signal);
  }

  /** Cliques no painel, nas janelas, no relógio e na ficha (um ouvinte só, pelo `data-*` do alvo). */
  private onPanel(el: HTMLElement): void {
    const eco = this.eco;
    const speed = el.closest<HTMLElement>('[data-speed]');
    if (speed) this.driver.setSpeed(Number(speed.dataset.speed));
    const go = el.closest<HTMLElement>('[data-go]');
    if (go) {
      const [x, y] = go.dataset.go!.split(',').map(Number);
      this.goTo(x, y);
    }
    const village = el.closest<HTMLElement>('[data-village]');
    const v = village && eco.villages.find((it) => it.id === Number(village.dataset.village));
    if (v) {
      this.goTo(v.x, v.y);
      // Da tabela de assentamentos ou das relações, abre também a janela dele.
      if (village.closest('[data-win-body]') && this.windows.win === 'settlements') this.openSettlement(v.id);
      else if (village.closest('[data-vwin-body]')) this.openSettlement(v.id);
    }
    const sort = el.closest<HTMLElement>('[data-sort]');
    if (sort) this.windows.sortBy(eco, sort.dataset.sort as CompareKey);
    const species = el.closest<HTMLElement>('[data-species]');
    if (species) {
      this.sel.highlightNext({ species: Number(species.dataset.species) });
      this.panel.refresh();
    }
    const role = el.closest<HTMLElement>('[data-role]');
    if (role && this.vwin.open) {
      this.sel.highlightNext({ village: this.vwin.open.id, role: Number(role.dataset.role) });
      this.panel.refresh();
    }
    const who = el.closest<HTMLElement>('[data-uid]');
    if (who) {
      const i = eco.findUid(Number(who.dataset.uid));
      if (i >= 0) this.sel.select(i);
    }
    const act = el.closest<HTMLElement>('[data-act]');
    if (act?.dataset.act === 'follow') this.sel.toggleFollow();
    const tab = el.closest<HTMLElement>('[data-vtab]');
    if (tab) this.vwin.setTab(eco, tab.dataset.vtab as SettlementTab);
    const span = el.closest<HTMLElement>('[data-span]');
    if (span) this.vwin.setSpan(eco, Number(span.dataset.span) as PeriodSpan);
    const filter = el.closest<HTMLElement>('[data-filter]');
    if (filter) this.windows.setFilter(eco, filter.dataset.filter!);
    const pick = el.closest<HTMLElement>('[data-pick]');
    if (pick) {
      const t = this.tools.find((it) => it.id === pick.dataset.pick);
      if (t) {
        this.toolbar.selectTab(t.tab);
        this.setTool(t);
        this.openWindow(null);
      }
    }
    const opt = el.closest<HTMLElement>('[data-opt]');
    if (opt) this.setOption(opt.dataset.opt!);
    const open = el.closest<HTMLElement>('[data-open]');
    if (open) this.openWindow(open.dataset.open as Win);
  }

  /** Mouse no mapa: os eventos vão para o estado da mão (ToolMachine). */
  private bindCanvas(signal: AbortSignal): void {
    const canvas = this.renderer.domElement;
    const view = this.view;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    canvas.addEventListener(
      'pointerdown',
      (e) => {
        this.machine.down(e);
        canvas.setPointerCapture(e.pointerId);
      },
      { signal },
    );
    canvas.addEventListener('pointerup', (e) => this.machine.up(e), { signal });
    canvas.addEventListener(
      'pointermove',
      (e) => {
        this.machine.move(e);
        view.mouse = { x: e.clientX, y: e.clientY };
      },
      { signal },
    );
    canvas.addEventListener(
      'pointerleave',
      () => {
        view.mouse = null;
        this.root.querySelector<HTMLElement>('[data-cursor]')!.hidden = true;
      },
      { signal },
    );
  }

  /** Retângulo da seleção de grupo (Shift + arrastar), em pixels de tela; null esconde. */
  private showBox(b: { x0: number; y0: number; x1: number; y1: number } | null): void {
    const el = this.root.querySelector<HTMLElement>('[data-box]')!;
    if (!b) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    Object.assign(el.style, { left: `${Math.min(b.x0, b.x1)}px`, top: `${Math.min(b.y0, b.y1)}px`, width: `${Math.abs(b.x1 - b.x0)}px`, height: `${Math.abs(b.y1 - b.y0)}px` });
  }

  /** Põe uma ferramenta na mão (ou guarda, com null). */
  private setTool(t: Tool | null): void {
    this.machine.setTool(t);
  }

  private toggleHelp(): void {
    const el = this.root.querySelector<HTMLElement>('[data-help]')!;
    el.hidden = !el.hidden;
    this.overlays.set('help', !el.hidden, () => this.toggleHelp());
  }

  /** Esconde o painel lateral (o minimapa fica). */
  private fold(): void {
    this.folded = !this.folded;
    this.root.querySelector('[data-side]')!.classList.toggle('folded', this.folded);
  }

  /** Abre (ou fecha, com null) a janela do assentamento. */
  private openSettlement(id: number | null): void {
    if (id === null && this.sel.highlight && 'village' in this.sel.highlight) this.sel.setHighlight(null);
    this.vwin.show(this.eco, id);
    this.overlays.set('vwin', id !== null, () => this.openSettlement(null));
    this.dirty = true;
  }

  /** Abre a janela de leitura (ou fecha, se já é ela ou com null). */
  private openWindow(win: Win | null): void {
    this.windows.toggle(this.eco, win);
    this.overlays.set('win', this.windows.win !== null, () => this.openWindow(null));
  }

  private setOption(opt: string): void {
    const eco = this.eco;
    const s = this.settings;
    // As opções do mundo são comandos (estado da simulação); as de exibição, só da tela.
    if (opt === 'events') this.driver.enqueue({ kind: 'events', auto: !eco.autoEvents });
    else if (opt.startsWith('rate:')) this.driver.enqueue({ kind: 'events', rate: Number(opt.slice(5)) });
    else if (opt === 'minor') s.showMinor = !s.showMinor;
    else if (opt === 'labels') s.showLabels = !s.showLabels;
    else if (opt === 'territory') s.showTerritory = !s.showTerritory;
    else if (opt.startsWith('layer:')) {
      s.layer = opt.slice(6) as SurfaceSettings['layer'];
      s.showTerritory = true;
    } else if (opt.startsWith('geo:')) {
      s.geoView = opt.slice(4) as GeoView;
      this.raster.setGeoView(s.geoView);
    } else if (opt === 'now') this.driver.enqueue({ kind: 'surprise' });
    this.dirty = true;
    this.panel.refresh();
    this.windows.refresh(eco);
  }

  private readonly resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.lastW = w;
    this.lastH = h;
    this.lastDpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h);
    const terr = this.root.querySelector<HTMLCanvasElement>('[data-terr]');
    if (terr && (terr.width !== w || terr.height !== h)) {
      terr.width = w;
      terr.height = h;
    }
    this.view?.setSize(w, h);
    this.dirty = true;
  };

  // Laço principal -----------------------------------------------------------

  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    if (window.innerWidth !== this.lastW || window.innerHeight !== this.lastH || (window.devicePixelRatio || 1) !== this.lastDpr) this.resize();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    // Relógio do universo (órbitas e sondas, `state.time`): anda no tempo real enquanto a superfície roda e
    // para na pausa dela. A pausa congela o jogo inteiro, não só o planeta; a velocidade (2x, 5x) vale só
    // para a simulação da superfície, porque o ano do planeta já é outra escala (12 s por ano).
    if (!this.driver.paused) this.state.time += dt;
    if (!this.keys(dt)) return;
    const eco = this.eco;
    const view = this.view;
    view.clampCenter();

    // Câmera seguindo a criatura fixada (RF-VIDA-333), pela posição desenhada.
    this.sel.track(this.driver);
    view.updateHover();
    // Quem seria escolhido num clique ganha contorno (RF-VIDA-330).
    this.sel.updatePick(!this.machine.tool && !this.machine.boxing);
    // O estado da mão age no quadro: o pincel enfileira um comando, o clique faz a ação.
    this.machine.frame(dt);
    this.fx.step(dt, this.machine.painting);

    // Bichos longe do que está na tela decidem menos (mesma biologia, menos custo).
    const half = Math.max(view.width, view.height) / (2 * Math.max(0.5, view.zoom)) + 24;
    eco.focus = { x: view.center.x, y: view.toRow(view.center.y), r: half };
    const steps = this.driver.update(dt);
    if (!this.driver.paused) this.weather.step(dt, view);
    this.raster.flush(view);

    // Parado e sem mudanças, não redesenha.
    const sig = `${view.signature()},${this.machine.tool?.id},${this.toolbar.brush}`;
    // Seleção, destaque e janela do assentamento pulsam: redesenha mesmo parado.
    const sel = this.sel;
    const marked = !!sel.pinned || !!sel.highlight || this.vwin.open !== null || sel.hoverPick >= 0;
    if (!this.driver.paused || steps || this.dirty || sig !== this.lastView || eco.effects.length || marked || this.fx.active || this.raster.pending) {
      this.lastView = sig;
      this.dirty = false;
      this.render();
    }
    this.info.tick(eco, now);
    this.toolbar.tick(eco, now);
    this.panel.tick(eco, now);
    this.minimap.tick(eco, now);
    this.windows.tick(eco, now);
    this.vwin.tick(eco, now);
    this.toast.tick(eco, now);
    this.toolbar.updateCursor();
    this.input.endFrame();
  };

  /** Teclado do quadro. Devolve falso se o modo foi encerrado (Esc na mão vazia sem nada aberto). */
  private keys(dt: number): boolean {
    const input = this.input;
    const view = this.view;
    // Esc fecha o que estiver por cima primeiro (RF-VIDA-349b): a última janela ou seleção aberta;
    // sem nenhuma, volta um passo da mão (segundo clique, ferramenta); de mão vazia, volta à órbita.
    if (input.hit('Escape') && !this.overlays.escape() && !this.machine.escape()) {
      this.onExit();
      return false;
    }
    if (input.hit('Space')) this.driver.setSpeed(this.driver.speed ? 0 : 1);
    for (let k = 0; k < SPEEDS.length; k++) if (input.hit(`Digit${k + 1}`)) this.driver.setSpeed(k);
    if (input.hit('KeyH')) this.toggleHelp();
    if (input.hit('KeyT')) {
      this.settings.showTerritory = !this.settings.showTerritory;
      this.dirty = true;
    }
    if (input.hit('KeyP')) this.fold();
    if (input.hit('KeyF')) this.sel.toggleFollow();
    if (input.hit('BracketLeft')) this.toolbar.stepBrush(-2);
    if (input.hit('BracketRight')) this.toolbar.stepBrush(2);
    for (const [code, win] of [
      ['KeyC', 'chronicle'],
      ['KeyR', 'kingdoms'],
      ['KeyE', 'species'],
      ['KeyI', 'items'],
    ] as const) {
      if (input.hit(code)) this.openWindow(win);
    }
    const pan = 300 / view.zoom;
    view.center.x += ((input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0)) * pan * dt;
    view.center.y += ((input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0)) * pan * dt;
    if (input.wheel) view.setZoom(view.zoom * (input.wheel < 0 ? 1.25 : 0.8));
    return true;
  }

  /** Animação da ferramenta agindo: o Ajustar esquenta ou esfria conforme o alvo está acima ou abaixo da temperatura do ponto. */
  private emitFx(tool: Tool, dt: number): void {
    const view = this.view;
    let kind = tool.fx;
    if (tool.id === 'adjust') {
      const i = view.tileIndex(view.hover.x, view.hover.y);
      kind = i >= 0 && this.toolbar.target < temperatureAt(this.map, i) ? 'cool' : 'heat';
    }
    if (kind) this.fx.emit(kind, view.hover.x, view.hover.y, this.toolbar.brush, dt);
  }

  // Desenho ------------------------------------------------------------------

  private render(): void {
    const view = this.view;
    const eco = this.eco;
    // Terremoto: a câmera treme enquanto dura.
    const shake = eco.shake > 0 ? (Math.min(1, eco.shake) * 6) / view.zoom : 0;
    const cx = view.center.x;
    const cy = view.center.y;
    if (shake) {
      view.center.x = cx + (Math.random() - 0.5) * shake;
      view.center.y = cy + (Math.random() - 0.5) * shake;
    }
    const ctx = this.renderer.context;
    const z = view.zoom * this.renderer.getPixelRatio();
    if (!this.raster.draw(ctx, view, z)) this.dirty = true;
    this.collectSprites(z);
    this.sprites.drawSoft(ctx, view.height);
    const tool = this.machine.tool;
    if (tool && !tool.id.startsWith('spawn:') && view.hovering) {
      // Círculo do pincel (soltar uma criatura é num ponto só).
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = Math.max(1, z * 0.15);
      ctx.beginPath();
      ctx.arc(view.viewToScreenX(view.hover.x), view.viewToScreenY(view.hover.y), this.toolbar.brush * z, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.labels.update(eco, view, this.settings.showLabels && view.zoom >= 2.5, this.vwin.id);
    this.overlay.draw(this.vwin.id, this.driver, this.toolbar.brush);
    view.center.x = cx;
    view.center.y = cy;
  }

  /** Sprites da vista, com as criaturas recortadas pela grade (refeita quando o mundo andou ou recebeu comandos). */
  private collectSprites(z: number): void {
    const eco = this.eco;
    const key = `${eco.year},${eco.count},${this.applied}`;
    if (key !== this.gridKey) {
      this.grid.rebuild(eco.count, eco.alive, eco.x, eco.y);
      this.gridKey = key;
    }
    const grid = this.grid;
    this.collector.collect(eco, this.view, this.sprites, z, performance.now(), this.driver, (x0, x1, r0, r1, visit) => {
      const n = grid.query(x0 - GRID_SLACK, x1 + GRID_SLACK, r0 - GRID_SLACK, r1 + GRID_SLACK);
      const ids = grid.indices;
      for (let k = 0; k < n; k++) visit(ids[k]);
    });
  }

  /** Câmera e velocidade, para o save. Antes de o mapa ficar pronto não há nada a guardar. */
  snapshotView(): { mode: 'surface'; params: PlanetParams; center: [number, number]; zoom: number; speed: number } {
    const view = this.view;
    return { mode: 'surface', params: this.params, center: view ? [view.center.x, view.center.y] : [0, 0], zoom: view?.zoom ?? 3, speed: this.driver?.speed ?? 1 };
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.input.dispose();
    if (this.ready) {
      this.eco.onTileChanged = () => {};
      this.sprites.dispose();
      this.atlas.dispose();
    }
    this.root.remove();
    // Devolve a tela ao renderizador do 3D.
    if (this.renderer !== this.shared) {
      this.renderer.domElement.remove();
      this.shared.domElement.style.display = '';
    }
    this.shared.setClearColor(0x000000);
    this.shared.renderLists.dispose();
  }
}
