import { describe, expect, it } from 'vitest';
import { snapshotEcosystem } from '../../save/snapshot';
import { runWorld, seedWorld } from '../calibrate';
import baseline from '../calibrate.baseline.json';
import { ERAS, YEAR_SECONDS } from '../ecosystem';
import { worldFingerprint } from '../fingerprint';
import { DEBUG_SERIES_LIMIT } from './debug';
import { createEngine, ecosystemOf, type Engine } from './engine';

const SEED = 9;
const DT = 0.25;

/** Um motor sobre o mundo das calibrações (Terra pequena, 6 aldeias semeadas). */
function engineFor(seed = SEED): Engine {
  const { eco, map } = seedWorld(seed, 0.3);
  return createEngine(map, { seed, eco });
}

/** Roda `years` anos de ação pela fachada, chamando `each` no fim de cada um. */
function run(engine: Engine, years: number, each?: (y: number) => void): void {
  for (let y = 0; y < years; y++) {
    for (let t = 0; t < YEAR_SECONDS; t += DT) engine.step(DT);
    each?.(y);
  }
}

/** Tudo o que a vista de depuração lê, de todos os lugares. */
function readAll(engine: Engine): void {
  const d = engine.debug;
  d.world();
  for (const v of engine.view.villages) d.place(v.id);
  d.decisions();
  d.profile();
  d.fingerprint();
}

describe('vista de depuração do motor (engine.debug)', () => {
  it('desligada: começa assim, sem decisões nem série, e sem medição do passo', () => {
    const engine = engineFor();
    run(engine, 3);
    const d = engine.debug;
    expect(d.recording).toBe(false);
    expect(d.decisions()).toEqual([]);
    expect(d.world().series).toEqual([]);
    expect(d.profile()).toBeNull();
    // Os indicadores de agora e as metas não dependem da gravação.
    const w = d.world();
    expect(w.seed).toBe(SEED);
    expect(w.since).toBe(0);
    expect(w.now.values.settlements).toBeGreaterThan(0);
    expect(w.targets.length).toBeGreaterThan(10);
    // Fora do save e da impressão digital: o gancho não é enumerável e fica null.
    expect(ecosystemOf(engine).probe).toBeNull();
  });

  it('ligada: decisões com fatores, indicadores e metas, lugar coerente e o passo por parte', () => {
    const engine = engineFor();
    const d = engine.debug;
    const eco = ecosystemOf(engine);
    const before = eco.villages.length;
    d.setRecording(true);
    expect(d.recording).toBe(true);
    const years = 25;
    run(engine, years);

    // Decisões: das mais novas para as mais velhas, com as opções avaliadas, os fatores e o porquê do diário.
    const all = d.decisions();
    expect(all.length).toBeGreaterThan(5);
    for (let k = 1; k < all.length; k++) expect(all[k].year).toBeLessThanOrEqual(all[k - 1].year);
    const dec = all[0];
    expect(dec.picked.factors.length).toBeGreaterThan(0);
    for (let k = 1; k < dec.picked.factors.length; k++) expect(dec.picked.factors[k].value).toBeGreaterThanOrEqual(dec.picked.factors[k - 1].value);
    expect(dec.why.length).toBeGreaterThan(5);
    expect(dec.adults).toBeGreaterThan(0);
    expect(eco.villages[dec.village]).toBeDefined();
    // As de ficar também entram, com o nome do lugar no rótulo.
    const stay = all.find((x) => x.picked.label.startsWith('ficar'));
    expect(stay?.picked.label).toBe(`ficar em ${eco.villages[stay!.village].name}`);
    for (const x of all) for (const o of [x.picked, ...x.others]) expect(o.label).toMatch(/^(ficar em |ir para |fundar )/);
    // Filtros.
    const here = d.decisions({ village: dec.village });
    expect(here.length).toBeGreaterThan(0);
    expect(here.every((x) => x.village === dec.village)).toBe(true);
    expect(d.decisions({ family: dec.family }).every((x) => x.family === dec.family)).toBe(true);
    expect(d.decisions({ limit: 2 })).toHaveLength(2);

    // Mundo: indicadores de agora, metas da calibração longa e uma amostra por ano.
    const w = d.world();
    const live = eco.villages.filter((v) => !v.abandoned);
    expect(w.now.values.settlements).toBe(live.length);
    expect(w.now.values.people).toBe(live.reduce((n, v) => n + v.population, 0));
    expect(w.now.values.founded).toBe(eco.villages.length - before);
    expect(w.now.values).not.toHaveProperty('wars');
    expect(w.now.values.peopleTrend).toBeGreaterThan(0);
    const median = w.targets.find((t) => t.key === 'medianPop');
    expect(median?.max).toBe(Infinity);
    expect(w.targets.every((t) => t.key in w.now.values || ['taskShare', 'idleShare', 'onStreet'].includes(t.key))).toBe(true);
    // Uma amostra a cada virada do ano inteiro (o ano somado passo a passo pode parar um fio antes do inteiro).
    expect(w.series.length).toBe(Math.floor(eco.year));
    expect(Math.abs(w.series.length - years)).toBeLessThanOrEqual(1);
    expect(w.series.length).toBeLessThanOrEqual(DEBUG_SERIES_LIMIT);
    for (let k = 1; k < w.series.length; k++) expect(w.series[k].year).toBeGreaterThan(w.series[k - 1].year);

    // Lugar: o maior vivo, campo a campo.
    const big = live.reduce((p, q) => (q.population > p.population ? q : p));
    const p = d.place(big.id)!;
    expect(p.name).toBe(big.name);
    expect(p.population).toBe(big.population);
    expect(p.age).toBeCloseTo(eco.year - p.founded, 6);
    expect(p.pressure.total).toBeCloseTo(p.pressure.social + p.pressure.land, 12);
    expect(p.pressure.fission).toBeGreaterThan(p.pressure.scout);
    expect(ERAS).toContain(p.era.name);
    expect(p.era.tech).toBe(big.tech);
    expect(p.needs.map((n) => n.name)).toContain('comida');
    expect(p.needs.every((n) => n.value >= 0 && n.value <= 1)).toBe(true);
    expect(p.area.find((a) => a.name === 'roça')).toBeDefined();
    expect(p.catchment).toBeGreaterThan(0);
    expect(p.rates.map((r) => r.name)).toContain('colonos');
    expect(p.site === null || Number.isFinite(p.site)).toBe(true);
    if (p.lack) expect(['comida', 'lenha', 'coleta']).toContain(p.lack.what);
    expect(d.place(9999)).toBeNull();

    // Passo: todos os passos medidos, as partes do mais caro para o mais barato, somando o total.
    const prof = d.profile()!;
    expect(prof.steps).toBe(years * (YEAR_SECONDS / DT));
    expect(prof.parts.map((x) => x.name)).toContain('criaturas (andar e decidir)');
    for (let k = 1; k < prof.parts.length; k++) expect(prof.parts[k].value).toBeLessThanOrEqual(prof.parts[k - 1].value);
    expect(prof.parts.reduce((n, x) => n + x.value, 0)).toBeCloseTo(prof.msPerStep, 6);

    // Desligar para a medição; o que foi gravado continua para ler.
    d.setRecording(false);
    expect(d.profile()).toBeNull();
    expect(eco.probe).toBeNull();
    expect(d.decisions().length).toBe(all.length);
  });

  it('o mundo é o mesmo com a gravação ligada e as leituras a cada ano, e sem nada', () => {
    const years = 20;
    const quiet = engineFor();
    run(quiet, years);
    const loud = engineFor();
    loud.debug.setRecording(true);
    readAll(loud);
    run(loud, years, () => readAll(loud));
    expect(loud.debug.decisions().length).toBeGreaterThan(0);
    const a = ecosystemOf(quiet);
    const b = ecosystemOf(loud);
    expect(worldFingerprint(b)).toBe(worldFingerprint(a));
    // O retrato do save inteiro (todos os campos, caches salvos e geradores de sorteio), e nada da depuração nele.
    const sa = snapshotEcosystem(a, SEED);
    const sb = snapshotEcosystem(b, SEED);
    expect(Object.keys(sb.fields)).not.toContain('probe');
    expect(sb).toEqual(sa);
  });

  it('segue o mundo novo no restore e volta a contar as taxas dali', () => {
    const engine = engineFor();
    const d = engine.debug;
    d.setRecording(true);
    run(engine, 4);
    const snap = engine.snapshot();
    const at = ecosystemOf(engine).year;
    run(engine, 3);
    expect(d.world().series.length).toBe(Math.floor(ecosystemOf(engine).year));
    expect(d.decisions().length).toBeGreaterThan(0);
    engine.restore(snap);
    const eco = ecosystemOf(engine);
    const w = d.world();
    expect(w.since).toBe(eco.year);
    expect(w.year).toBe(eco.year);
    expect(w.series).toEqual([]);
    expect(d.decisions()).toEqual([]);
    expect(w.now.values.founded).toBe(0);
    // A gravação continua ligada e o gancho passa para o mundo novo.
    expect(d.recording).toBe(true);
    expect(eco.probe).not.toBeNull();
    run(engine, 2);
    expect(d.world().series.length).toBe(Math.floor(eco.year) - Math.floor(at));
  });
});

describe('impressão digital pela vista de depuração', () => {
  it('é a do mundo, igual em dois mundos iguais, muda com o tempo e não mexe em nada', () => {
    const a = engineFor();
    const b = engineFor();
    expect(a.debug.fingerprint()).toBe(worldFingerprint(ecosystemOf(a)));
    const start = a.debug.fingerprint();
    expect(a.debug.fingerprint()).toBe(start);
    run(a, 3);
    run(b, 3);
    expect(a.debug.fingerprint()).not.toBe(start);
    expect(a.debug.fingerprint()).toBe(b.debug.fingerprint());
    // Outra semente, outro mundo.
    const c = engineFor(SEED + 1);
    run(c, 3);
    expect(c.debug.fingerprint()).not.toBe(a.debug.fingerprint());
  });

  it('depois do restore, é a do mundo novo', () => {
    const a = engineFor();
    run(a, 2);
    const snap = a.snapshot();
    const hash = a.debug.fingerprint();
    run(a, 2);
    a.restore(snap);
    expect(a.debug.fingerprint()).toBe(hash);
  });
});

describe('indicadores da calibração', () => {
  // As contas que dependem só do estado saíram de `runWorld` para `indicatorsOf` (a vista de depuração usa as
  // mesmas): os números de uma rodada curta têm de ser os gravados antes da extração, na mesma ordem.
  for (const r of baseline.runs) {
    it(`semente ${r.seed}, ${r.years} anos (ano de ${r.yearSpan} s): iguais aos de antes`, () => {
      const { indicators } = runWorld(r.seed, r.years, r.radius, r.yearSpan);
      expect(Object.keys(indicators)).toEqual(Object.keys(r.indicators));
      expect(indicators).toEqual(r.indicators);
    });
  }
});
