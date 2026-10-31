import { describe, expect, it } from 'vitest';
import { MAX_STEPS_PER_FRAME, SIM_STEP, SimDriver, SPEEDS, type SimTarget } from './SimDriver';

/** Mundo de mentira: uma criatura que anda 1 tile por segundo de jogo para leste. */
function world(n = 1): SimTarget & { steps: number[]; x: Float32Array; y: Float32Array; uid: Uint32Array; count: number; year: number } {
  const w = {
    steps: [] as number[],
    count: n,
    x: new Float32Array(8),
    y: new Float32Array(8),
    uid: new Uint32Array(8).map((_, i) => i + 1),
    year: 0,
    step(h: number) {
      this.steps.push(h);
      this.year += h / 12;
      for (let i = 0; i < this.count; i++) this.x[i] += h;
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
    const d = new SimDriver<string>(w, (cmd) => applied.push({ cmd, stepsBefore: w.steps.length }));
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

  it('o log tem limite', () => {
    const d = new SimDriver<number>(world(), () => {}, { logLimit: 5 });
    for (let k = 0; k < 12; k++) d.enqueue(k);
    d.update(0);
    expect(d.log.map((e) => e.cmd)).toEqual([7, 8, 9, 10, 11]);
  });
});
