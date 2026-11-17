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
  const dead0 = eco.deaths.length;
  const year0 = eco.year;
  eco.focus = { x: v.x, y: v.y, r: 24 };
  let n = 0, rest = 0, soc = 0, fai = 0, hun = 0, high = 0, idle = 0, work = 0, there = 0;
  const seen = new Map<string, Map<string, number>>();
  const hours: Map<string, number>[] = [];
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
      if (m && d) {
        const who = `${m.seed}:${e.uid[i]}`;
        const per = seen.get(who) ?? new Map<string, number>();
        per.set(d.context.behavior.name, (per.get(d.context.behavior.name) ?? 0) + 1);
        seen.set(who, per);
        if (m.seed === 11) {
          const hb = Math.floor(e.hourOf() * 8);
          const hm = (hours[hb] ??= new Map<string, number>());
          hm.set(d.context.behavior.name, (hm.get(d.context.behavior.name) ?? 0) + 1);
        }
      }
      if (!d) idle++;
      else {
        if (WORK.has(d.context.behavior.behaviorType)) work++;
        if (m.at > 0) there++;
      }
    }
  }
  const why: Record<string, number> = {};
  for (const d of eco.deaths.slice(dead0)) if (d.village === v.id) why[d.cause] = (why[d.cause] ?? 0) + 1;
  console.log('Mortes no lugar:', JSON.stringify(why));
  for (const c of eco.chronicle) if (c.year >= year0 && c.text.includes(v.name)) console.log('Crônica:', Math.round(c.year), c.text);
  const f = (x: number) => +(x / n).toFixed(2);
  console.log(JSON.stringify({ pessoas: [pop0, v.population], comida: +v.food.toFixed(1), lenha: +v.stock.wood.toFixed(1), atendimento: v.needs }));
  console.log(JSON.stringify({ necessidades: { cansaco: f(rest), solidao: f(soc), fe: f(fai), fome: f(hun), criticas: f(high) }, parado: f(idle), trabalhando: f(work), 'no lugar': f(there) }));
  // Diversidade: por cérebro (11 adulto, 12 criança, 13 idoso), quantas ações diferentes cada pessoa fez e a fração
  // do tempo na mais comum.
  const div: Record<string, { n: number; acoes: number; topo: number; tempo: Record<string, number> }> = {};
  for (const [who, per] of seen) {
    const k = who.split(':')[0];
    const tot = [...per.values()].reduce((a, b) => a + b, 0);
    if (tot < 40) continue;
    const g = (div[k] ??= { n: 0, acoes: 0, topo: 0, tempo: {} });
    g.n++;
    g.acoes += per.size;
    g.topo += Math.max(...per.values()) / tot;
    for (const [b, c] of per) g.tempo[b] = (g.tempo[b] ?? 0) + c / tot;
  }
  for (const [k, g] of Object.entries(div)) {
    const tempo = Object.entries(g.tempo).sort((a, b) => b[1] - a[1]).map(([b, x]) => `${b} ${Math.round((100 * x) / g.n)}%`).join(', ');
    console.log(`Cérebro ${k}: ${g.n} pessoas, ${(g.acoes / g.n).toFixed(1)} ações diferentes cada, ${Math.round((100 * g.topo) / g.n)}% do tempo na mais comum. Tempo: ${tempo}`);
  }
  // O dia do adulto em faixas de 3 horas: as três ações mais comuns em cada uma.
  hours.forEach((hm, k) => {
    const tot = [...hm.values()].reduce((a, b) => a + b, 0);
    const top = [...hm].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([b, c]) => `${b} ${Math.round((100 * c) / tot)}%`).join(', ');
    console.log(`Adulto ${String(k * 3).padStart(2, '0')}h-${String(k * 3 + 3).padStart(2, '0')}h: ${top}`);
  });
  const t = e.mindTally();
  for (const k of Object.keys(t.started).sort((a, b) => t.started[b] - t.started[a])) {
    console.log(`${k}: começou ${t.started[k]}, terminou ${t.done[k] ?? 0}, falhou ${t.failed[k] ?? 0}, trocou ${t.switched[k] ?? 0}`);
  }
  console.log('Trocas mais comuns:', Object.entries(t.pairs as Record<string, number>).sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.TROCAS ?? 8)).map(([k, x]) => `${k} (${x})`).join('; '));
});
