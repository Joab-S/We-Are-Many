import { describe, expect, it } from 'vitest';
import type { EngineCommand } from '../../sim/api/commands';
import { BrushHistory } from './history';
import { OverlayStack } from './overlays';
import type { Selection } from './selection';
import { PickSecond, ToolMachine, type ToolStateHost } from './toolStates';
import type { Tool, ToolContext } from './tools';
import { Viewport } from './Viewport';

const ev = (x: number, y: number, button = 0, shiftKey = false) => ({ clientX: x, clientY: y, button, shiftKey }) as PointerEvent;

function setup() {
  const view = new Viewport(200, 100);
  view.setSize(400, 200);
  view.zoom = 2;
  view.mouse = { x: 200, y: 100 };
  view.updateHover();
  const log: string[] = [];
  const queue: EngineCommand[] = [];
  const history = new BrushHistory();
  const sel = {
    follow: false,
    pin: () => log.push('pin'),
    selectBox: (b: { x0: number; x1: number }) => log.push(`box ${b.x0}-${b.x1}`),
  } as unknown as Selection;
  const ctx = { enqueue: (c: EngineCommand) => queue.push(c) } as unknown as ToolContext;
  const host: ToolStateHost = {
    view,
    ctx,
    history,
    sel,
    brush: { brush: 5, target: 288, limitOn: true },
    enqueue: (c) => queue.push(c),
    emitFx: () => log.push('fx'),
    showBox: (b) => log.push(b ? 'show' : 'hide'),
    toolChanged: () => log.push('tool'),
  };
  return { view, log, queue, history, m: new ToolMachine(host) };
}

const raise: Tool = { id: 'raise', tab: 'terrain', label: 'Elevar', icon: '', tip: '', mode: 'brush', terraform: 'raise', fx: 'rise' };
const ore: Tool = { id: 'ore:iron', tab: 'terrain', label: 'Ferro', icon: '', tip: '', mode: 'click', act: (c, x, y) => c.enqueue({ kind: 'ore', x, y, ore: 'iron' }) };

describe('State das ferramentas (ToolMachine)', () => {
  it('mão vazia: arrastar move o mapa e volta; clique curto fixa a ficha', () => {
    const { m, view, log } = setup();
    expect(m.current.name).toBe('idle');
    const x0 = view.center.x;
    m.down(ev(100, 100));
    expect(m.current.name).toBe('drag');
    m.move(ev(120, 100));
    expect(view.center.x).toBeCloseTo(x0 - 10);
    m.up(ev(120, 100));
    expect(m.current.name).toBe('idle');
    expect(log).not.toContain('pin');
    m.down(ev(50, 50));
    m.up(ev(52, 51));
    expect(log).toContain('pin');
  });

  it('Shift + arrastar escolhe um grupo e esconde o retângulo ao sair', () => {
    const { m, log } = setup();
    m.down(ev(10, 10, 0, true));
    expect(m.boxing).toBe(true);
    m.move(ev(80, 60));
    m.up(ev(80, 60));
    expect(log).toEqual(['show', 'box 10-80', 'hide']);
    expect(m.current.name).toBe('idle');
  });

  it('pincel: um comando por quadro enquanto aperta, cada traço vai para o desfazer, botão direito arrasta e volta', () => {
    const { m, queue, history } = setup();
    m.setTool(raise);
    expect(m.current.name).toBe('brush');
    m.frame(0.016);
    expect(queue).toEqual([]);
    m.down(ev(200, 100));
    expect(m.painting).toBe(true);
    expect(history.journal).not.toBeNull();
    m.frame(0.02);
    m.frame(0.02);
    expect(queue.map((c) => c.kind)).toEqual(['terraform', 'terraform']);
    expect(queue[0]).toMatchObject({ tool: 'raise', r: 5, target: 288, limit: true });
    m.up(ev(200, 100));
    expect(m.painting).toBe(false);
    expect(history.journal).toBeNull();
    m.down(ev(200, 100, 2));
    expect(m.current.name).toBe('drag');
    expect(m.tool).toBe(raise);
    m.up(ev(210, 100, 2));
    expect(m.current.name).toBe('brush');
  });

  it('clique: uma ação por clique, no quadro seguinte', () => {
    const { m, queue } = setup();
    m.setTool(ore);
    m.down(ev(200, 100));
    m.frame(0.016);
    m.frame(0.016);
    expect(queue.map((c) => c.kind)).toEqual(['ore']);
  });

  it('dois cliques (PickSecond) e o Esc voltando um passo de cada vez', () => {
    const { m, queue } = setup();
    const pair: Tool = {
      id: 'provoke',
      tab: 'civ',
      label: 'Provocar',
      icon: '',
      tip: '',
      mode: 'click',
      act: (ctx) => ctx.enqueue({ kind: 'surprise' }),
      second: (ctx, first) => ctx.enqueue({ kind: 'politics', action: 'provoke', a: first, b: 7 }),
    };
    m.setTool(pair);
    m.change(new PickSecond(m, pair, 3));
    expect(m.current.name).toBe('pickSecond');
    m.down(ev(200, 100));
    m.frame(0.016);
    expect(queue).toEqual([{ kind: 'politics', action: 'provoke', a: 3, b: 7 }]);
    expect(m.current.name).toBe('click');
    m.change(new PickSecond(m, pair, 3));
    expect(m.escape()).toBe(true);
    expect(m.current.name).toBe('click');
    expect(m.escape()).toBe(true);
    expect(m.current.name).toBe('idle');
    expect(m.escape()).toBe(false);
  });
});

describe('pilha de sobreposições do Esc', () => {
  it('fecha a última que abriu; reabrir leva ao topo; fechar por fora tira da pilha', () => {
    const s = new OverlayStack();
    const closed: string[] = [];
    s.open('win', () => closed.push('win'));
    s.open('pinned', () => closed.push('pinned'));
    s.open('vwin', () => closed.push('vwin'));
    s.open('win', () => closed.push('win'));
    expect(s.top).toBe('win');
    s.closed('pinned');
    expect(s.escape()).toBe(true);
    expect(s.escape()).toBe(true);
    expect(s.escape()).toBe(false);
    expect(closed).toEqual(['win', 'vwin']);
  });
});

describe('desfazer dos pincéis (BrushHistory)', () => {
  it('cada traço com tiles vira um restoreTiles, do mais novo para o mais antigo', () => {
    const h = new BrushHistory();
    const map = { elevation: new Float32Array([1, 2, 3]), moisture: new Float32Array(3), heat: new Float32Array(3), vegetation: new Float32Array(3) } as never;
    h.begin();
    h.journal!.touch(map, 0);
    h.end();
    h.begin();
    h.end(); // traço vazio não conta
    h.begin();
    h.journal!.touch(map, 2);
    h.journal!.touch(map, 2);
    h.end();
    expect(h.size).toBe(2);
    expect(h.undo()).toMatchObject({ kind: 'restoreTiles', tiles: [2], elevation: [3] });
    expect(h.undo()).toMatchObject({ tiles: [0], elevation: [1] });
    expect(h.undo()).toBeNull();
  });
});
