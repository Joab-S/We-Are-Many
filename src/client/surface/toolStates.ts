import type { EngineCommand } from '../../sim/api/commands';
import type { BrushHistory } from './history';
import type { Selection } from './selection';
import type { Tool, ToolContext } from './tools';
import type { Viewport } from './Viewport';

/** O que os estados das ferramentas usam do resto da tela. */
export interface ToolStateHost {
  readonly view: Viewport;
  readonly ctx: ToolContext;
  readonly history: BrushHistory;
  readonly sel: Selection;
  /** Pincel (tiles), temperatura alvo (K) e se Aquecer e Resfriar param nela. */
  readonly brush: { readonly brush: number; readonly target: number; readonly limitOn: boolean };
  enqueue(cmd: EngineCommand): void;
  /** Animação da ferramenta agindo neste quadro. */
  emitFx(tool: Tool, dt: number): void;
  /** Mostra (ou esconde, com null) o retângulo da seleção de grupo. */
  showBox(box: { x0: number; y0: number; x1: number; y1: number } | null): void;
  /** A ferramenta na mão mudou (barra e dica). */
  toolChanged(): void;
}

/**
 * Um estado da mão do jogador (padrão State): recebe os eventos do mouse e
 * o quadro, e troca de estado pela máquina, com `enter` e `exit`.
 */
export interface ToolState {
  readonly name: 'idle' | 'brush' | 'click' | 'pickSecond' | 'boxSelect' | 'drag';
  /** Ferramenta na mão neste estado (null na mão vazia). */
  readonly tool: Tool | null;
  enter?(): void;
  exit?(): void;
  down?(e: PointerEvent): void;
  move?(e: PointerEvent): void;
  up?(e: PointerEvent): void;
  frame?(dt: number): void;
  /** Esc com a pilha de janelas vazia; devolve falso se o estado não tem o que desfazer. */
  escape?(): boolean;
}

/**
 * Máquina de estados das ferramentas da superfície: Idle (mão vazia),
 * Brush (pincel contínuo), Click (um clique por vez), PickSecond (ferramenta
 * de dois cliques esperando o segundo reino), BoxSelect (Shift + arrastar) e
 * Drag (arrastar o mapa, de onde volta ao estado anterior).
 */
export class ToolMachine {
  private state: ToolState;

  constructor(readonly host: ToolStateHost) {
    this.state = new Idle(this);
    this.state.enter?.();
  }

  get current(): ToolState {
    return this.state;
  }

  get tool(): Tool | null {
    return this.state.tool;
  }

  /** O botão está apertado com um pincel (o brilho da animação não apaga). */
  get painting(): boolean {
    return this.state instanceof Brush && this.state.stroking;
  }

  /** Seleção de grupo em andamento (sem contorno de quem seria escolhido). */
  get boxing(): boolean {
    return this.state instanceof BoxSelect;
  }

  change(next: ToolState): void {
    if (next === this.state) return;
    const before = this.state.tool;
    this.state.exit?.();
    this.state = next;
    next.enter?.();
    if (next.tool !== before) this.host.toolChanged();
  }

  /** Põe uma ferramenta na mão (ou guarda, com null). */
  setTool(t: Tool | null): void {
    this.change(stateFor(this, t));
  }

  down(e: PointerEvent): void {
    this.state.down?.(e);
  }

  move(e: PointerEvent): void {
    this.state.move?.(e);
  }

  up(e: PointerEvent): void {
    this.state.up?.(e);
  }

  frame(dt: number): void {
    this.state.frame?.(dt);
  }

  /** Esc chegou à ferramenta: volta um passo (segundo clique, ferramenta na mão); falso na mão vazia. */
  escape(): boolean {
    if (this.state.escape?.()) return true;
    if (!this.state.tool) return false;
    this.setTool(null);
    return true;
  }
}

function stateFor(m: ToolMachine, t: Tool | null): ToolState {
  if (!t) return new Idle(m);
  return t.mode === 'brush' ? new Brush(m, t) : new Click(m, t);
}

/** Botão direito ou do meio arrasta o mapa em qualquer estado. */
function dragOnOtherButton(m: ToolMachine, back: ToolState, e: PointerEvent): boolean {
  if (e.button === 0) return false;
  m.change(new Drag(m, back, e, false));
  return true;
}

/** Mão vazia: arrasta o mapa, um clique curto fixa a ficha, Shift + arrastar escolhe um grupo. */
class Idle implements ToolState {
  readonly name = 'idle';
  readonly tool = null;

  constructor(private readonly m: ToolMachine) {}

  down(e: PointerEvent): void {
    if (e.button === 0 && e.shiftKey) this.m.change(new BoxSelect(this.m, this, e));
    else this.m.change(new Drag(this.m, this, e, e.button === 0));
  }
}

/** Pincel: enquanto o botão está apertado, um comando por quadro; cada traço entra no desfazer. */
class Brush implements ToolState {
  readonly name = 'brush';
  stroking = false;

  constructor(
    private readonly m: ToolMachine,
    readonly tool: Tool,
  ) {}

  down(e: PointerEvent): void {
    if (dragOnOtherButton(this.m, this, e)) return;
    this.stroking = true;
    if (this.tool.terraform) this.m.host.history.begin();
  }

  up(): void {
    this.endStroke();
  }

  exit(): void {
    this.endStroke();
  }

  private endStroke(): void {
    if (!this.stroking) return;
    this.stroking = false;
    if (this.tool.terraform) this.m.host.history.end();
  }

  frame(dt: number): void {
    const host = this.m.host;
    const view = host.view;
    if (!this.stroking || !view.hovering) return;
    const x = view.hover.x;
    const y = view.hover.y;
    const tool = this.tool;
    if (tool.terraform) {
      const b = host.brush;
      host.enqueue({ kind: 'terraform', tool: tool.terraform, x, y: view.toRow(y), r: b.brush, power: dt * 30, target: b.target, limit: b.limitOn });
    } else tool.act?.(host.ctx, x, y);
    host.emitFx(tool, dt);
  }
}

/** Um clique por vez: a ação vai no quadro seguinte ao clique, no ponto sob o mouse. */
class Click implements ToolState {
  readonly name: 'click' | 'pickSecond' = 'click';
  protected pending = false;

  constructor(
    protected readonly m: ToolMachine,
    readonly tool: Tool,
  ) {}

  down(e: PointerEvent): void {
    if (dragOnOtherButton(this.m, this, e)) return;
    this.pending = true;
  }

  frame(): void {
    const view = this.m.host.view;
    if (!this.pending) return;
    this.pending = false;
    if (!view.hovering) return;
    this.act(view.hover.x, view.hover.y);
  }

  protected act(x: number, y: number): void {
    this.tool.act?.(this.m.host.ctx, x, y);
  }
}

/** Ferramenta de dois cliques (Provocar, Amenizar, Declarar guerra): o primeiro reino já escolhido, espera o outro. */
export class PickSecond extends Click {
  override readonly name = 'pickSecond';

  constructor(
    m: ToolMachine,
    tool: Tool,
    readonly first: number,
  ) {
    super(m, tool);
  }

  protected override act(x: number, y: number): void {
    // Depois do segundo clique (certo ou não), a ferramenta volta ao primeiro clique.
    this.m.change(new Click(this.m, this.tool));
    this.tool.second?.(this.m.host.ctx, this.first, x, y);
  }

  escape(): boolean {
    this.m.change(new Click(this.m, this.tool));
    return true;
  }
}

/** Shift + arrastar com a mão vazia: retângulo na tela; ao soltar, o grupo dentro dele (RF-VIDA-336). */
class BoxSelect implements ToolState {
  readonly name = 'boxSelect';
  readonly tool = null;
  private readonly box: { x0: number; y0: number; x1: number; y1: number };

  constructor(
    private readonly m: ToolMachine,
    private readonly back: ToolState,
    e: PointerEvent,
  ) {
    this.box = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
  }

  move(e: PointerEvent): void {
    this.box.x1 = e.clientX;
    this.box.y1 = e.clientY;
    this.m.host.showBox(this.box);
  }

  up(): void {
    this.m.host.sel.selectBox(this.box);
    this.m.change(this.back);
  }

  exit(): void {
    this.m.host.showBox(null);
  }
}

/** Arrastar o mapa (mão vazia, ou botão direito com qualquer ferramenta); volta ao estado de antes ao soltar. */
class Drag implements ToolState {
  readonly name = 'drag';
  private last: { x: number; y: number };
  /** Onde começou (mão vazia, botão esquerdo): um clique curto fixa a ficha. */
  private readonly press: { x: number; y: number } | null;

  constructor(
    private readonly m: ToolMachine,
    private readonly back: ToolState,
    e: PointerEvent,
    press: boolean,
  ) {
    this.last = { x: e.clientX, y: e.clientY };
    this.press = press ? { x: e.clientX, y: e.clientY } : null;
  }

  get tool(): Tool | null {
    return this.back.tool;
  }

  move(e: PointerEvent): void {
    const host = this.m.host;
    const view = host.view;
    // Arrastar o mapa solta a câmera que seguia alguém.
    if (host.sel.follow && Math.hypot(e.clientX - this.last.x, e.clientY - this.last.y) > 2) host.sel.follow = false;
    view.center.x -= (e.clientX - this.last.x) / view.zoom;
    view.center.y += (e.clientY - this.last.y) / view.zoom;
    this.last = { x: e.clientX, y: e.clientY };
  }

  up(e: PointerEvent): void {
    // Clique curto da mão vazia: fixa (ou solta) a ficha do que está embaixo.
    const p = this.press;
    this.m.change(this.back);
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5) this.m.host.sel.pin();
  }
}
