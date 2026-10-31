import { describe, expect, it } from 'vitest';
import { generateSurface } from '../../procgen/surface';
import { earthParams } from '../../sim/calibrate';
import { viewCommand, type EngineCommand } from '../../sim/api/commands';
import { createEngine, ecosystemOf } from '../../sim/api/engine';
import type { EngineEvent } from '../../sim/api/events';
import { nativeSpecies } from '../../sim/species';
import { MAX_STEPS_PER_FRAME, SIM_STEP, SimDriver, SPEEDS, type SimTarget } from './SimDriver';

type Ev = { kind: 'found'; village: number } | { kind: 'warStart'; a: number };

/** Mundo de mentira: uma criatura que anda 1 tile por segundo de jogo para leste; a cada 4 passos, um evento. */
function world(n = 1): SimTarget<Ev> & { steps: number[]; x: Float32Array; y: Float32Array; uid: Uint32Array; count: number; year: number; queue: Ev[] } {
  const w = {
    steps: [] as number[],
    count: n,
    x: new Float32Array(8),
    y: new Float32Array(8),
    uid: new Uint32Array(8).map((_, i) => i + 1),
    year: 0,
    queue: [] as Ev[],
    get view() {
      return this;
    },
    step(h: number) {
      this.steps.push(h);
      this.year += h / 12;
      for (let i = 0; i < this.count; i++) this.x[i] += h;
      if (this.steps.length % 4 === 0) this.queue.push({ kind: 'found', village: this.steps.length });
    },
    drainEvents() {
      return this.queue.splice(0);
    },
  };
  return w;
}

describe('SimDriver: passo fixo, teto e interpolação', () => {
  it('usa o mesmo passo da calibração em todas as velocidades', () => {
    expect(SIM_STEP).toBe(0.25);
    for (let s = 1; s < SPEEDS.length; s++) {
      const w = world();
      const d = new SimDriver(w, () => {});
      d.setSpeed(s);
      for (let f = 0; f < 16; f++) d.update(0.125);
      expect(new Set(w.steps)).toEqual(new Set([SIM_STEP]));
      // 2 s reais na velocidade s viram 2·s s de jogo, em passos de 0,25.
      expect(w.steps.length).toBe((2 * SPEEDS[s]) / SIM_STEP);
    }
  });

  it('não anda na pausa', () => {
    const w = world();
    const d = new SimDriver(w, () => {});
    d.setSpeed(0);
    expect(d.paused).toBe(true);
    for (let f = 0; f < 60; f++) d.update(1 / 60);
    expect(w.steps).toEqual([]);
  });

  it('tem teto de passos por quadro e descarta o resto em vez de aumentar o passo', () => {
    const w = world();
    const d = new SimDriver(w, () => {});
    d.setSpeed(3);
    // Um quadro de 1 s a 5x pede 20 passos.
    expect(d.update(1)).toBe(MAX_STEPS_PER_FRAME);
    expect(w.steps).toEqual(Array(MAX_STEPS_PER_FRAME).fill(SIM_STEP));
    expect(d.stats.dropped).toBeGreaterThan(0);
    expect(d.alpha).toBeLessThan(1);
    // O quadro seguinte, normal, volta ao ritmo.
    expect(d.update(1 / 60)).toBeLessThanOrEqual(1);
  });

  it('alpha é a fração do próximo passo e interpola entre o passo anterior e o atual', () => {
    const w = world();
    const d = new SimDriver(w, () => {}, { wrapWidth: 100 });
    d.setSpeed(1);
    d.update(0.25); // um passo: x vai de 0 a 0,25
    expect(w.x[0]).toBeCloseTo(0.25);
    expect(d.alpha).toBeCloseTo(0);
    expect(d.x(0)).toBeCloseTo(0);
    d.update(0.125); // meio caminho do próximo
    expect(d.alpha).toBeCloseTo(0.5);
    expect(d.x(0)).toBeCloseTo(0.125);
    expect(d.y(0)).toBeCloseTo(0);
  });

  it('não interpola quando o slot passou a outro indivíduo (uid mudou)', () => {
    const w = world();
    const d = new SimDriver(w, () => {});
    d.update(0.25);
    d.update(0.1);
    w.uid[0] = 99;
    w.x[0] = 50;
    expect(d.x(0)).toBe(50);
  });

  it('não interpola depois de passos dados por fora (ano mudou sem o relógio)', () => {
    const w = world();
    const d = new SimDriver(w, () => {});
    d.update(0.25);
    d.update(0.1);
    w.step(0.25);
    expect(d.x(0)).toBeCloseTo(w.x[0]);
  });

  it('interpola pelo lado curto na volta do mapa e não desliza em saltos', () => {
    const w = world();
    const d = new SimDriver(w, () => {}, { wrapWidth: 100 });
    w.x[0] = 99.9;
    d.update(0.25); // 99,9 -> 100,15, que o mundo guarda como 0,15
    w.x[0] = 0.15;
    d.update(0.125);
    expect(d.x(0)).toBeCloseTo(0.025, 2);
    // Salto grande (embarcou, mudou de lugar): fica onde está.
    w.y[0] = 40;
    expect(d.y(0)).toBe(40);
  });

  it('aplica os comandos na fronteira do passo e guarda o passo no log', () => {
    const w = world();
    const applied: { cmd: string; stepsBefore: number }[] = [];
    const d = new SimDriver<string, Ev>(w, (cmd) => applied.push({ cmd, stepsBefore: w.steps.length }));
    d.setSpeed(1);
    d.enqueue('a');
    // Quadro sem passo: o comando entra no fim do quadro.
    d.update(0.1);
    expect(applied).toEqual([{ cmd: 'a', stepsBefore: 0 }]);
    d.enqueue('b');
    // Quadro com passo: entra antes do passo.
    d.update(0.2);
    expect(applied[1]).toEqual({ cmd: 'b', stepsBefore: 0 });
    expect(w.steps.length).toBe(1);
    d.enqueue('c');
    d.setSpeed(0);
    d.update(0.1);
    expect(applied[2]).toEqual({ cmd: 'c', stepsBefore: 1 });
    expect(d.log.map((e) => [e.tick, e.cmd])).toEqual([
      [0, 'a'],
      [0, 'b'],
      [1, 'c'],
    ]);
  });

  it('drena os eventos depois dos passos do quadro e entrega pelo despachante (on por tipo, onAny)', () => {
    const w = world();
    const d = new SimDriver<string, Ev>(w, (cmd) => w.queue.push({ kind: 'warStart', a: Number(cmd) }));
    const found: number[] = [];
    const all: string[] = [];
    const off = d.bus.on('found', (e) => found.push(e.village));
    d.bus.onAny((e) => all.push(e.kind));
    d.setSpeed(1);
    // 8 passos (dois quadros de 1 s com teto 3 e o resto em quadros pequenos): eventos nos passos 4 e 8.
    for (let f = 0; f < 8; f++) d.update(0.25);
    expect(w.steps.length).toBe(8);
    expect(found).toEqual([4, 8]);
    expect(w.queue).toEqual([]);
    // Evento gerado por um comando num quadro sem passo também sai no mesmo quadro.
    d.setSpeed(0);
    d.enqueue('7');
    d.update(0.1);
    expect(all).toEqual(['found', 'found', 'warStart']);
    expect(d.stats.events).toBe(1);
    expect(d.stats.totalEvents).toBe(3);
    // Quem desliga não recebe mais.
    off();
    d.setSpeed(1);
    for (let f = 0; f < 4; f++) d.update(0.25);
    expect(found).toEqual([4, 8]);
    expect(all.length).toBe(4);
  });

  it('o log tem limite', () => {
    const d = new SimDriver<number, Ev>(world(), () => {}, { logLimit: 5 });
    for (let k = 0; k < 12; k++) d.enqueue(k);
    d.update(0);
    expect(d.log.map((e) => e.cmd)).toEqual([7, 8, 9, 10, 11]);
  });
});

describe('SimDriver sobre a fachada do motor', () => {
  it('dá os passos, aplica comandos e vistas na fronteira, guarda no log e entrega os eventos do motor', () => {
    const params = earthParams(0.2);
    const engine = createEngine(generateSurface(params), { seed: 7, species: nativeSpecies(params) });
    const eco = ecosystemOf(engine);
    const d = new SimDriver<EngineCommand, EngineEvent>(engine, (cmd) => engine.apply(cmd), { wrapWidth: engine.view.map.width });
    const founded: number[] = [];
    d.bus.on('found', (e) => founded.push(e.village));
    const v = engine.view.villages[0];
    d.enqueue(viewCommand(v.x, v.y, 30, v.id));
    d.setSpeed(1);
    d.update(SIM_STEP);
    // A vista entrou antes do primeiro passo e foi para o log com o passo 0.
    expect(eco.focus).not.toBeNull();
    expect(eco.pinned).toBe(v.id);
    expect(d.log[0]).toEqual({ tick: 0, cmd: viewCommand(v.x, v.y, 30, v.id) });
    // Um evento do motor (aqui, uma fundação no meio do quadro) sai no fim do quadro, pelo despachante.
    const s = eco.species.findIndex((sp) => sp.kind === 'sapient');
    const nv = eco.foundVillage(s, Math.floor(v.x) + 25, Math.floor(v.y), 2);
    d.update(SIM_STEP);
    expect(founded).toContain(nv.id);
    expect(engine.drainEvents()).toEqual([]);
    expect(d.tick).toBe(2);
  });
});
