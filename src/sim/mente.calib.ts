/**
 * Sonda da mente da aldeia (fora do `npm test`): roda o mundo, põe a câmera na maior aldeia e mostra como as
 * pessoas vivem na tela. Para ver se a IA está boa depois de mexer num pacote de src/IAUS/npc/aldeia ou no corpo
 * (src/sim/eco/people/mente.ts):
 *
 *   npx vitest run --config vitest.calib.config.ts src/sim/mente.calib.ts --silent=false
 *
 * SEED (1234), ANOS antes da câmera (150) e VISTA, os anos com a câmera (30: uns 3 minutos de tela).
 *
 * - `necessidades`: média de cansaço, solidão, fé e fome (0 a 1) e a fração de amostras com alguma acima de 95%.
 * - `parado`, `trabalhando`, `no lugar`: fração das amostras sem ação, com uma ação de trabalho e já no alvo
 *   (o resto é andando até ele).
 * - Por comportamento: quantas vezes começou, terminou, falhou e foi trocado no meio.
 */
import { it } from 'vitest';
import { seedWorld } from './calibrate';
import { YEAR_SECONDS } from './ecosystem';

declare const process: { env: Record<string, string | undefined> };

it('sonda da mente da aldeia', () => {
  const { eco } = seedWorld(Number(process.env.SEED ?? 1234));
  for (let y = 0; y < Number(process.env.ANOS ?? 150); y++) for (let t = 0; t < YEAR_SECONDS; t += 0.25) eco.step(0.25);
  let v = eco.villages[0];
  for (const o of eco.villages) if (!o.abandoned && o.population > v.population) v = o;
  const e = eco as any;
  const pop0 = v.population;
  eco.focus = { x: v.x, y: v.y, r: 24 };
  let n = 0, rest = 0, soc = 0, fai = 0, hun = 0, high = 0, idle = 0, work = 0, there = 0;
  const WORK = new Set(['Trabalhar', 'Colher', 'PegarCarga', 'Entregar', 'Construir', 'CortarLenha', 'Cacar', 'Defender', 'Patrulhar']);
  for (let t = 0; t < YEAR_SECONDS * Number(process.env.VISTA ?? 30); t += 0.25) {
    eco.step(0.25);
    if (Math.round(t * 4) % 2) continue;
    for (const i of eco.residents(v.id)) {
      if (!e.alive[i] || e.village[i] !== v.id || e.role[i] === 255) continue;
      n++;
      const h = Math.max(0, Math.min(1, (0.85 - e.energy[i]) / 0.6));
      rest += e.needRest[i];
      soc += e.needSocial[i];
      fai += e.needFaith[i];
      hun += h;
      if (e.needRest[i] > 0.95 || e.needSocial[i] > 0.95 || h > 0.95) high++;
      const m = e.mindNow(i);
      const d = m?.brain.currentDecision;
      if (!d) idle++;
      else {
        if (WORK.has(d.context.behavior.behaviorType)) work++;
        if (m.at > 0) there++;
      }
    }
  }
  const f = (x: number) => +(x / n).toFixed(2);
  console.log(JSON.stringify({ pessoas: [pop0, v.population], comida: +v.food.toFixed(1), lenha: +v.stock.wood.toFixed(1), atendimento: v.needs }));
  console.log(JSON.stringify({ necessidades: { cansaco: f(rest), solidao: f(soc), fe: f(fai), fome: f(hun), criticas: f(high) }, parado: f(idle), trabalhando: f(work), 'no lugar': f(there) }));
  const t = e.mindTally();
  for (const k of Object.keys(t.started).sort((a, b) => t.started[b] - t.started[a])) {
    console.log(`${k}: começou ${t.started[k]}, terminou ${t.done[k] ?? 0}, falhou ${t.failed[k] ?? 0}, trocou ${t.switched[k] ?? 0}`);
  }
  console.log('Trocas mais comuns:', Object.entries(t.pairs as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, x]) => `${k} (${x})`).join('; '));
});
