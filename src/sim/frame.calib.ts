/**
 * Mede o que a tela leria do motor por passo, na Terra do jogo, para `docs/SEPARACAO-MOTOR.md`:
 *
 *   npx vitest run --config vitest.calib.config.ts src/sim/frame.calib.ts
 *
 * O orçamento, num mundo menor, é conferido nos testes normais (`src/sim/api/frame.test.ts`).
 */
import { it } from 'vitest';
import { createEngine } from './api/engine';
import { FrameMeter, type Stat } from './api/frame';
import { seedWorld } from './calibrate';
import { YEAR_SECONDS } from './ecosystem';

const YEARS = 100;
const kb = (x: number) => (x / 1024).toFixed(1);
const row = (label: string, s: Stat, f: (x: number) => string) => `| ${label} | ${f(s.mean)} | ${f(s.p95)} | ${f(s.max)} |`;

it(`bytes por passo em ${YEARS} anos, Terra com raio 1`, () => {
  const { eco, map } = seedWorld(1234, 1);
  const engine = createEngine(map, { seed: 1234, eco });
  const meter = new FrameMeter(engine);
  for (let y = 0; y < YEARS; y++) {
    for (let t = 0; t < YEAR_SECONDS; t += 0.25) {
      engine.step(0.25);
      meter.sample();
    }
  }
  const r = meter.report();
  const whole = (x: number) => x.toFixed(0);
  console.log(
    [
      `${r.steps} passos, ${map.width}x${map.height}`,
      '| O que | média | p95 | máximo |',
      '|---|---|---|---|',
      row('Slots de criatura (`count`)', r.count, whole),
      row('Tiles sujos por passo', r.tiles, whole),
      row('Barcos, caravanas e efeitos (KB, JSON)', r.lists, kb),
      row('Todos os lugares vivos (KB, JSON; uma vez por ano)', r.villages, kb),
      row('O maior lugar (KB, JSON)', r.village, kb),
      row('Por passo: criaturas, tiles e listas (KB)', r.bytesPerStep, kb),
    ].join('\n'),
  );
});
