import { describe, expect, it } from 'vitest';
import { createProbeState, deposits, freeProbes, launch, PROBES, remaining, stepProbes, sum } from './probes';

const run = (s: ReturnType<typeof createProbeState>, seconds: number) => {
  const events = [];
  for (let t = 0; t < seconds; t += 0.1) events.push(...stepProbes(s, 0.1));
  return events;
};

describe('sondas', () => {
  it('depósitos são determinísticos e coerentes com a fonte', () => {
    expect(deposits('sol-4', 'rocky')).toEqual(deposits('sol-4', 'rocky'));
    const comet = deposits('c1', 'comet');
    expect(comet.gelo).toBeGreaterThan(0);
    expect(comet.metais).toBe(0);
    expect(deposits('x', 'rocky', 1).gelo).toBeGreaterThan(deposits('x', 'rocky', 0).gelo);
  });
  it('uma missão prospecta, extrai até a capacidade e traz a carga para o porão', () => {
    const s = createProbeState(3);
    expect(launch(s, 'sol-4', 'Marte', 'rocky')).not.toBeNull();
    expect(freeProbes(s)).toBe(2);
    const events = run(s, PROBES.travel + PROBES.survey + PROBES.extract + PROBES.ret + 1);
    expect(events.map((e) => e.kind)).toEqual(['surveyed', 'returned']);
    expect(sum(s.cargo)).toBeCloseTo(PROBES.capacity, 3);
    expect(freeProbes(s)).toBe(3);
    expect(s.surveyed['sol-4']).toBeDefined();
  });
  it('os recursos acabam: um destroço pequeno se esgota', () => {
    const s = createProbeState(1);
    const total = sum(deposits('d1', 'derelict'));
    for (let i = 0; i < 4; i++) {
      launch(s, 'd1', 'Destroços', 'derelict');
      run(s, 60);
    }
    expect(sum(s.cargo)).toBeCloseTo(total, 3);
    expect(sum(remaining(deposits('d1', 'derelict'), s.mined.d1))).toBeLessThan(1e-6);
    launch(s, 'd1', 'Destroços', 'derelict');
    expect(run(s, 60).map((e) => e.kind)).toContain('depleted');
  });
  it('sem sondas livres não há lançamento', () => {
    const s = createProbeState(1);
    launch(s, 'a', 'A', 'comet');
    expect(launch(s, 'b', 'B', 'comet')).toBeNull();
  });
});
