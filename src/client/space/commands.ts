import type { Input } from '../input';

/**
 * Comandos do espaço (padrão Command, Game Programming Patterns): cada ação
 * do jogador é um objeto com `execute`, chamado igual pela tecla e pelo
 * botão do HUD. As teclas ficam todas numa tabela só (DEFAULT_KEYS), então
 * trocar teclas no futuro é trocar a tabela (ou uma cópia salva), sem
 * procurar `input.hit('KeyX')` pelo código.
 */

/** Ações de um aperto (executam uma vez por pressionamento ou clique). */
export type SpaceAction =
  | 'jumpEarth'
  | 'jumpAlpha'
  | 'jumpSirius'
  | 'panel'
  | 'cruise'
  | 'autopilot'
  | 'suggest'
  | 'probe'
  | 'probeRings'
  | 'lock'
  | 'scan'
  | 'bookmark'
  | 'home'
  | 'clearTarget'
  | 'observe'
  | 'probesPanel'
  | 'devPanel';

/** Ações de voo, seguradas (lidas a cada quadro pelo ShipController). */
export type FlightAction = 'thrust' | 'brake' | 'left' | 'right' | 'up' | 'down' | 'rollLeft' | 'rollRight' | 'turbo';

export type Action = SpaceAction | FlightAction;

/** Teclas padrão, pelo `KeyboardEvent.code`. As mesmas do README. */
export const DEFAULT_KEYS: Readonly<Record<Action, readonly string[]>> = {
  thrust: ['KeyW'],
  brake: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  up: ['Space'],
  down: ['ShiftLeft', 'ShiftRight'],
  rollLeft: ['KeyQ'],
  rollRight: ['KeyE'],
  // Tab no lugar de Ctrl: Ctrl+W fecha a aba do navegador e não pode ser bloqueado.
  turbo: ['Tab'],
  jumpEarth: ['Digit1'],
  jumpAlpha: ['Digit2'],
  jumpSirius: ['Digit3'],
  panel: ['KeyG'],
  cruise: ['KeyC'],
  autopilot: ['KeyJ'],
  suggest: ['KeyN'],
  probe: ['KeyM'],
  probeRings: ['KeyR'],
  lock: ['KeyT'],
  scan: ['KeyV'],
  bookmark: ['KeyB'],
  home: ['KeyH'],
  clearTarget: ['KeyX'],
  observe: ['KeyF'],
  // Só botões do HUD, sem tecla.
  probesPanel: [],
  devPanel: [],
};

/** Manobras: apertar uma delas desliga o piloto automático (o turbo, não). */
export const MANEUVERS: readonly FlightAction[] = ['thrust', 'brake', 'left', 'right', 'up', 'down', 'rollLeft', 'rollRight'];

const KEY_NAMES: Record<string, string> = { Space: 'Espaço', ShiftLeft: 'Shift', ShiftRight: 'Shift', Tab: 'Tab', Escape: 'Esc', Enter: 'Enter' };

/** Nome curto de uma tecla para a interface ("KeyJ" vira "J", "Digit1" vira "1"). */
export function keyName(code: string): string {
  return KEY_NAMES[code] ?? code.replace(/^(Key|Digit)/, '');
}

/** Ligações de teclas: qual tecla dispara cada ação. */
export class KeyBindings {
  private readonly keys = new Map<Action, readonly string[]>();

  constructor(table: Readonly<Record<Action, readonly string[]>> = DEFAULT_KEYS) {
    for (const a of Object.keys(table) as Action[]) this.keys.set(a, table[a]);
  }

  codes(action: Action): readonly string[] {
    return this.keys.get(action) ?? [];
  }

  /** Troca as teclas de uma ação (para a futura tela de controles). */
  rebind(action: Action, codes: readonly string[]): void {
    this.keys.set(action, codes);
  }

  /** Tecla principal da ação, para botões e dicas; vazio se não tiver tecla. */
  label(action: Action): string {
    const c = this.codes(action);
    return c.length ? keyName(c[0]) : '';
  }

  /** A ação está segurada agora. */
  down(input: Input, action: Action): boolean {
    for (const c of this.codes(action)) if (input.down(c)) return true;
    return false;
  }

  /** A ação foi apertada neste quadro (uma vez por pressionamento). */
  hit(input: Input, action: Action): boolean {
    for (const c of this.codes(action)) if (input.hit(c)) return true;
    return false;
  }

  anyHit(input: Input, actions: readonly Action[]): boolean {
    for (const a of actions) if (this.hit(input, a)) return true;
    return false;
  }
}

/** Comando: o que uma tecla ou um botão faz. */
export interface Command {
  /** Nome para a interface (barra de comandos, dicas). */
  readonly label?: string;
  /** Ícone de ui/icons.ts para o botão. */
  readonly icon?: string;
  execute(): void;
}

/** Mapa ação → comando, na ordem em que as teclas são lidas a cada quadro. */
export class CommandMap {
  private readonly order: SpaceAction[] = [];
  private readonly map = new Map<SpaceAction, Command>();

  constructor(table: Partial<Record<SpaceAction, Command>>) {
    for (const a of Object.keys(table) as SpaceAction[]) {
      this.order.push(a);
      this.map.set(a, table[a]!);
    }
  }

  get(action: SpaceAction): Command | undefined {
    return this.map.get(action);
  }

  /** Executa o comando (botões do HUD chamam direto, sem simular tecla). */
  run(action: string): boolean {
    const cmd = this.map.get(action as SpaceAction);
    if (!cmd) return false;
    cmd.execute();
    return true;
  }

  /**
   * Executa, na ordem da tabela, os comandos cujas teclas foram apertadas
   * neste quadro. Para se `stop` ficar verdadeiro (o modo foi trocado).
   */
  dispatch(input: Input, keys: KeyBindings, stop: () => boolean): void {
    for (const a of this.order) {
      if (!keys.hit(input, a)) continue;
      this.map.get(a)!.execute();
      if (stop()) return;
    }
  }
}
