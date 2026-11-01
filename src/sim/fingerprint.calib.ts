/**
 * Rede de segurança para refatorações sem mudança de comportamento: roda três
 * mundos fixos e compara a impressão digital (fingerprint.ts) de cada um com
 * o baseline gravado em fingerprint.baseline.json. Se mudar, a refatoração
 * mudou o comportamento.
 *
 *   npx vitest run --config vitest.calib.config.ts src/sim/fingerprint.calib.ts
 *   UPDATE=1 npx vitest run --config vitest.calib.config.ts src/sim/fingerprint.calib.ts   (regrava)
 *
 * Cenários: (a) Terra com povos inteligentes, sem tela (modo agregado); (b) só
 * a fauna; (c) o cenário (a) com a vista (`focus`) sobre o maior lugar, para
 * rodar as jornadas do modo completo (RF-AS-31).
 */
import { expect, it } from 'vitest';
import { generateSurface } from '../procgen/surface';
import { earthParams, seedWorld } from './calibrate';
import { Ecosystem, YEAR_SECONDS } from './ecosystem';
import { worldFingerprint } from './fingerprint';
import { nativeSpecies } from './species';

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const BASELINE = 'src/sim/fingerprint.baseline.json';
const SEED = 1234;
const YEARS = 200;
/** Anos em que a impressão digital é anotada (o último é o fim). */
const CHECKPOINTS = [50, 100, 150, 200];

type Run = { prints: Record<string, string>; ms: number; summary: Record<string, number> };

/** Roda `years` anos em passos de 0,25 s, anotando a impressão digital nos checkpoints. */
function run(eco: Ecosystem, years: number, eachYear?: (eco: Ecosystem) => void): Run {
  const prints: Record<string, string> = {};
  const t0 = performance.now();
  let hashMs = 0;
  for (let y = 1; y <= years; y++) {
    eachYear?.(eco);
    for (let t = 0; t < YEAR_SECONDS; t += 0.25) eco.step(0.25);
    if (CHECKPOINTS.includes(y)) {
      const h0 = performance.now();
      prints[`y${y}`] = worldFingerprint(eco);
      hashMs += performance.now() - h0;
    }
  }
  const live = eco.villages.filter((v) => !v.abandoned);
  return {
    prints,
    ms: performance.now() - t0 - hashMs,
    summary: {
      creatures: eco.total,
      villages: eco.villages.length,
      live: live.length,
      people: live.reduce((n, v) => n + v.population, 0),
      wars: eco.tally.wars,
      colonies: eco.tally.colonies,
      caravans: eco.caravans.length,
      agreements: eco.agreements.length,
      boats: eco.boats.length,
      chronicle: eco.chronicle.length,
      hashMs: Math.round(hashMs),
    },
  };
}

const scenarios: Record<string, () => Run> = {
  // (a) Terra com povos: aldeias, guerra, comércio e colônias, sem tela.
  terra: () => run(seedWorld(SEED).eco, YEARS),
  // (b) Só a fauna da Terra, sem povos.
  fauna: () => {
    const params = earthParams();
    const eco = new Ecosystem(generateSurface(params), SEED);
    for (const sp of nativeSpecies(params)) if (sp.kind !== 'sapient') eco.addSpecies(sp);
    eco.populate();
    return run(eco, YEARS);
  },
  // (c) O cenário (a) com a vista sobre o maior lugar vivo (revista todo ano): jornadas do modo completo.
  vista: () =>
    run(seedWorld(SEED).eco, YEARS, (eco) => {
      let best = null as (typeof eco.villages)[number] | null;
      for (const v of eco.villages) if (!v.abandoned && (!best || v.population > best.population)) best = v;
      eco.focus = best ? { x: best.x, y: best.y, r: 24 } : null;
    }),
};

it('impressão digital do mundo igual ao baseline', async () => {
  const fsName = 'node:fs';
  const fs = (await import(/* @vite-ignore */ fsName)) as {
    existsSync: (p: string) => boolean;
    readFileSync: (p: string, enc: string) => string;
    writeFileSync: (p: string, text: string) => void;
  };
  const only = env.CENARIOS?.split(',');
  const got: Record<string, Record<string, string>> = {};
  for (const [name, make] of Object.entries(scenarios)) {
    if (only && !only.includes(name)) continue;
    const r = make();
    got[name] = r.prints;
    console.log(`${name}: ${(r.ms / 1000).toFixed(1)} s`, JSON.stringify(r.prints), JSON.stringify(r.summary));
  }
  if (env.UPDATE === '1') {
    fs.writeFileSync(BASELINE, `${JSON.stringify({ seed: SEED, years: YEARS, scenarios: got }, null, 2)}\n`);
    return;
  }
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')) as { scenarios: Record<string, Record<string, string>> };
  for (const name of Object.keys(got)) expect(got[name], name).toEqual(base.scenarios[name]);
});
