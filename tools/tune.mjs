// Ajuste automático das constantes de equilíbrio (docs/AJUSTE-AUTOMATICO.md).
//
//   node tools/tune.mjs <plano.json>            otimiza (CMA-ES) ou mede a sensibilidade, conforme o plano
//   node tools/tune.mjs aplicar <pasta-de-saida> escreve em balance.ts e tuning.ts os valores escolhidos
//
// Cada avaliação é um processo do vitest (vitest.tune.config.ts + src/sim/tune.calib.ts) que roda o mundo da
// calibração longa numa semente com as constantes trocadas e devolve a distância às metas. As avaliações rodam
// em paralelo, todos os candidatos de uma geração usam as mesmas sementes (números aleatórios comuns: a
// comparação entre eles não sofre com a variação de semente para semente), e tudo vai para um cache na pasta de
// saída, então uma rodada interrompida continua de onde parou.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { CMAES } from './tune/cmaes.mjs';
import { formatNumber, readConstant, TUNE_FILES, whereIs, writeConstant } from './tune/constants.mjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const VITEST = join(ROOT, 'node_modules/vitest/vitest.mjs');

// ---- Plano --------------------------------------------------------------------------------------------------

function loadPlan(path) {
  const p = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(p.parametros) || !p.parametros.length) throw new Error('plano: faltam "parametros"');
  const sources = Object.fromEntries(TUNE_FILES.map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]));
  const home = whereIs(p.parametros.map((q) => q.nome), ROOT);
  // Fase seguinte de um ajuste: parte dos valores escolhidos por outra rodada (a pasta de saída dela ou o melhor.json).
  let from = {};
  if (p.partirDe) {
    const at = resolve(dirname(path), p.partirDe);
    from = JSON.parse(readFileSync(at.endsWith('.json') ? at : join(at, 'melhor.json'), 'utf8')).valores;
  }
  const params = p.parametros.map((q) => {
    const now = readConstant(sources[home[q.nome]], q.nome);
    if (!(q.max > q.min)) throw new Error(`plano: ${q.nome} precisa de min < max`);
    if (q.log && q.min <= 0) throw new Error(`plano: ${q.nome} com escala log precisa de min > 0`);
    return { name: q.nome, min: q.min, max: q.max, log: !!q.log, int: !!q.inteiro, now, start: q.inicio ?? from[q.nome] ?? now, file: home[q.nome] };
  });
  const name = path.replace(/^.*\//, '').replace(/\.json$/, '');
  return {
    name,
    mode: p.modo ?? 'cmaes',
    params,
    years: p.anos ?? 300,
    radius: p.raio ?? 1,
    seeds: p.sementes ?? [0, 1, 2, 3, 4, 5],
    perEval: p.porAvaliacao ?? 3,
    parallel: p.paralelo ?? availableParallelism(),
    generations: p.geracoes ?? 10,
    lambda: p.populacao,
    sigma: p.sigma ?? 0.25,
    seed: p.semente ?? 1,
    // Metas: as da lista, mais as da calibração longa quando `metasDaLonga` (o padrão quando não há lista).
    goals: (p.metas ?? []).map((m) => ({ key: m.chave, min: m.min, max: m.max, weight: m.peso, scale: m.escala })),
    longGoals: p.metasDaLonga ?? !p.metas,
    validate: p.validar ?? { anos: 1000, sementes: [0, 1, 2, 3, 4, 5] },
    out: resolve(ROOT, p.saida ?? join('tools/tune/saida', name)),
  };
}

// ---- Escala: o otimizador trabalha em [0, 1] por parâmetro (log quando pedido) -------------------------------

const toUnit = (q, v) => (q.log ? Math.log(v / q.min) / Math.log(q.max / q.min) : (v - q.min) / (q.max - q.min));
function fromUnit(q, u) {
  const c = Math.min(1, Math.max(0, u));
  const v = q.log ? q.min * (q.max / q.min) ** c : q.min + c * (q.max - q.min);
  return q.int ? Math.round(v) : Number(formatNumber(v));
}
const valuesOf = (plan, u) => Object.fromEntries(plan.params.map((q, i) => [q.name, fromUnit(q, u[i])]));
/** Quanto o candidato saiu da caixa [0, 1] (o otimizador avalia o candidato reparado e paga por ter saído). */
const outside = (u) => u.reduce((s, x) => s + (x < 0 ? x * x : x > 1 ? (x - 1) ** 2 : 0), 0);

// ---- Avaliações: processos do vitest em paralelo, com cache --------------------------------------------------

/** Impressão do código da simulação: um cache feito com outro código não vale. */
function codeHash() {
  const h = createHash('sha1');
  for (const dir of ['src/sim', 'src/ai', 'src/procgen', 'src/core']) {
    for (const f of readdirSync(join(ROOT, dir), { recursive: true }).map(String).sort()) {
      if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue;
      h.update(f).update(readFileSync(join(ROOT, dir, f)));
    }
  }
  return h.digest('hex').slice(0, 12);
}

class Evaluator {
  constructor(plan) {
    this.plan = plan;
    this.code = codeHash();
    this.cacheFile = join(plan.out, 'avaliacoes.jsonl');
    this.cache = new Map();
    if (existsSync(this.cacheFile)) {
      for (const line of readFileSync(this.cacheFile, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        const { key, result } = JSON.parse(line);
        this.cache.set(key, result);
      }
    }
    this.running = 0;
    this.queue = [];
    this.done = 0;
    this.spent = 0;
  }

  key(values, seed, years) {
    const sorted = Object.keys(values).sort().map((k) => [k, values[k]]);
    return createHash('sha1').update(JSON.stringify([this.code, sorted, seed, years, this.plan.radius, this.plan.goals, this.plan.longGoals])).digest('hex');
  }

  /** Uma avaliação (valores, semente, anos): do cache ou de um processo novo. */
  run(values, seed, years) {
    const key = this.key(values, seed, years);
    const hit = this.cache.get(key);
    if (hit) return Promise.resolve(hit);
    return new Promise((ok) => {
      this.queue.push({ values, seed, years, key, ok });
      this.pump();
    });
  }

  pump() {
    while (this.running < this.plan.parallel && this.queue.length) {
      const job = this.queue.shift();
      this.running++;
      const file = join(tmpdir(), `ajuste-${process.pid}-${job.key.slice(0, 16)}.json`);
      const env = { ...process.env, TUNE: JSON.stringify(job.values), SEMENTE: String(job.seed), ANOS: String(job.years), RAIO: String(this.plan.radius), SAIDA: file };
      env.METAS = JSON.stringify(this.plan.goals);
      env.METAS_LONGA = this.plan.longGoals ? '1' : '0';
      const child = spawn(process.execPath, [VITEST, 'run', '--config', 'vitest.tune.config.ts'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      child.stderr.on('data', (d) => (err = (err + d).slice(-4000)));
      child.on('close', (status) => {
        this.running--;
        let result;
        try {
          result = JSON.parse(readFileSync(file, 'utf8'));
          // Confere que o módulo viu os valores pedidos (um nome trocado errado não pode passar calado).
          for (const [n, v] of Object.entries(job.values)) if (result.applied[n] !== v) throw new Error(`${n}: pedido ${v}, o módulo viu ${result.applied[n]}`);
          this.cache.set(job.key, result);
          appendFileSync(this.cacheFile, JSON.stringify({ key: job.key, result }) + '\n');
        } catch (e) {
          console.error(`avaliação falhou (semente ${job.seed}, saída ${status}): ${e.message}\n${err}`);
          result = { loss: 1e6, parts: {}, indicators: {}, failed: true, seconds: 0 };
        }
        this.done++;
        this.spent += result.seconds ?? 0;
        job.ok(result);
        this.pump();
      });
    }
  }

  /** Média da distância nas sementes (e os resultados de cada uma). */
  async score(values, seeds, years) {
    const runs = await Promise.all(seeds.map((s) => this.run(values, s, years)));
    return { loss: runs.reduce((s, r) => s + r.loss, 0) / runs.length, runs };
  }
}

// ---- Relatório ----------------------------------------------------------------------------------------------

const fmt = (n) => (n === undefined || n === null || Number.isNaN(n) ? '' : Number.isInteger(n) ? String(n) : Number(n).toFixed(Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : 3)).replace('.', ',');

function meanParts(runs) {
  const out = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.parts ?? {})) out[k] = (out[k] ?? 0) + v / runs.length;
  return out;
}

function meanIndicators(runs, keys) {
  return Object.fromEntries(keys.map((k) => [k, runs.reduce((s, r) => s + Number(r.indicators?.[k] ?? NaN), 0) / runs.length]));
}

// ---- Modos --------------------------------------------------------------------------------------------------

/** Sensibilidade (um de cada vez): cada parâmetro no mínimo e no máximo, o resto como está, nas mesmas sementes. */
async function sensitivity(plan, ev) {
  const base = Object.fromEntries(plan.params.map((q) => [q.name, q.start]));
  const seeds = plan.seeds.slice(0, plan.perEval);
  const jobs = [['(como está)', base]];
  for (const q of plan.params) for (const v of [q.min, q.max]) jobs.push([`${q.name} = ${fmt(v)}`, { ...base, [q.name]: q.int ? Math.round(v) : v }]);
  const scored = await Promise.all(jobs.map(async ([label, values]) => ({ label, values, ...(await ev.score(values, seeds, plan.years)) })));
  const ref = scored[0];
  const keys = Object.keys(meanParts(ref.runs));
  const rows = plan.params.map((q, i) => {
    const lo = scored[1 + 2 * i];
    const hi = scored[2 + 2 * i];
    return { q, lo, hi, effect: Math.max(Math.abs(lo.loss - ref.loss), Math.abs(hi.loss - ref.loss)) };
  });
  rows.sort((a, b) => b.effect - a.effect);
  const top = (r) => {
    const a = meanParts(r.runs);
    const b = meanParts(ref.runs);
    return keys.map((k) => [k, (a[k] ?? 0) - (b[k] ?? 0)]).filter(([, d]) => Math.abs(d) > 0.01).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 3).map(([k, d]) => `${k} ${d > 0 ? '+' : ''}${fmt(d)}`).join(', ');
  };
  const lines = [
    `# Sensibilidade: ${plan.name}`,
    '',
    `${plan.years} anos, sementes ${seeds.join(', ')}, ${ev.done} avaliações. Distância às metas com tudo como está: **${fmt(ref.loss)}** (menor é melhor).`,
    '',
    '| Parâmetro | Agora | No mínimo | No máximo | Efeito | O que mais muda (no máximo) |',
    '|---|---|---|---|---|---|',
    ...rows.map((r) => `| \`${r.q.name}\` | ${fmt(r.q.start)} | ${fmt(r.q.min)} → ${fmt(r.lo.loss)} | ${fmt(r.q.max)} → ${fmt(r.hi.loss)} | ${fmt(r.effect)} | ${top(r.hi)} |`),
    '',
    'Efeito: a maior mudança da distância entre os dois extremos e o valor de agora. Os parâmetros do topo são os que valem entrar no CMA-ES.',
  ];
  writeFileSync(join(plan.out, 'sensibilidade.md'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}

/** CMA-ES nas constantes, com validação dos finalistas no fim. */
async function optimize(plan, ev) {
  const n = plan.params.length;
  const start = plan.params.map((q) => Math.min(1, Math.max(0, toUnit(q, q.start))));
  const es = new CMAES({ mean: start, sigma: plan.sigma, seed: plan.seed, lambda: plan.lambda });
  const history = [];
  let best = null;
  const t0 = Date.now();
  for (let g = 0; g < plan.generations; g++) {
    // Sementes da geração: as mesmas para todos (comparação justa), girando no conjunto de uma geração para outra
    // (para não decorar um punhado de mundos).
    const seeds = Array.from({ length: plan.perEval }, (_, j) => plan.seeds[(g * plan.perEval + j) % plan.seeds.length]);
    const xs = es.ask();
    const center = es.mean.slice();
    const all = [...xs, center];
    const scored = await Promise.all(all.map((u) => ev.score(valuesOf(plan, u), seeds, plan.years)));
    const fs = scored.slice(0, xs.length).map((s, k) => s.loss + 100 * outside(xs[k]));
    es.tell(xs, fs);
    const k = fs.indexOf(Math.min(...fs));
    const row = { g: g + 1, seeds, sigma: es.sigma, best: scored[k].loss, bestValues: valuesOf(plan, xs[k]), center: scored[xs.length].loss, centerValues: valuesOf(plan, center) };
    history.push(row);
    for (const cand of [
      { loss: row.best, values: row.bestValues },
      { loss: row.center, values: row.centerValues },
    ]) {
      if (!best || cand.loss < best.loss) best = { ...cand, g: g + 1 };
    }
    const mins = ((Date.now() - t0) / 60000).toFixed(1);
    console.log(`geração ${g + 1}/${plan.generations}: melhor ${fmt(row.best)} · centro ${fmt(row.center)} · σ ${fmt(es.sigma)} · ${ev.done} avaliações · ${mins} min`);
    writeReport(plan, ev, history, best, null);
  }
  // Validação: a nota da geração é de poucas sementes e o melhor dela tende a ter tido sorte (a maldição do
  // vencedor). Os finalistas rodam de novo em mais sementes, no horizonte de validação, e o melhor ali fica.
  const finalists = [
    { label: 'como está', values: Object.fromEntries(plan.params.map((q) => [q.name, q.now])) },
    { label: 'centro final do CMA-ES', values: valuesOf(plan, es.mean) },
    { label: `melhor visto (geração ${best.g})`, values: best.values },
  ];
  const seen = new Set();
  const unique = finalists.filter((f) => {
    const k = JSON.stringify(f.values);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  console.log(`validação: ${unique.length} finalistas, ${plan.validate.anos} anos, sementes ${plan.validate.sementes.join(', ')}`);
  const validated = await Promise.all(unique.map(async (f) => ({ ...f, ...(await ev.score(f.values, plan.validate.sementes, plan.validate.anos)) })));
  validated.sort((a, b) => a.loss - b.loss);
  writeFileSync(join(plan.out, 'melhor.json'), JSON.stringify({ plano: plan.name, distancia: validated[0].loss, valores: validated[0].values, escolhido: validated[0].label }, null, 2) + '\n');
  writeReport(plan, ev, history, best, validated);
  console.log(`escolhido: ${validated[0].label}, distância ${fmt(validated[0].loss)} (como está: ${fmt(validated.find((v) => v.label === 'como está')?.loss)})`);
  console.log(`relatório em ${join(plan.out, 'relatorio.md')}; para aplicar: node tools/tune.mjs aplicar ${plan.out}`);
}

function writeReport(plan, ev, history, best, validated) {
  const names = plan.params.map((q) => q.name);
  const lines = [
    `# Ajuste automático: ${plan.name}`,
    '',
    `CMA-ES em ${names.length} parâmetros, ${plan.years} anos por mundo, ${plan.perEval} ${plan.perEval === 1 ? "semente" : "sementes"} por geração (as mesmas para todos os candidatos), ${ev.done} avaliações, ${fmt(ev.spent / 60)} min de simulação.`,
    '',
    '## Gerações',
    '',
    '| Geração | Sementes | σ | Melhor candidato | Centro |',
    '|---|---|---|---|---|',
    ...history.map((h) => `| ${h.g} | ${h.seeds.join(', ')} | ${fmt(h.sigma)} | ${fmt(h.best)} | ${fmt(h.center)} |`),
    '',
  ];
  if (best) {
    lines.push('## Valores', '', `| Parâmetro | Como está | Faixa | Melhor visto (geração ${best.g}) |${validated ? ' Escolhido |' : ''}`, `|---|---|---|---|${validated ? '---|' : ''}`);
    for (const q of plan.params) lines.push(`| \`${q.name}\` | ${fmt(q.now)} | ${fmt(q.min)} a ${fmt(q.max)} | ${fmt(best.values[q.name])} |${validated ? ` ${fmt(validated[0].values[q.name])} |` : ''}`);
    lines.push('');
  }
  if (validated) {
    const keys = [...new Set(validated.flatMap((v) => Object.keys(meanParts(v.runs))))];
    const shown = [...new Set([...keys, 'people', 'peopleTrend', 'settlements', 'founded', 'medianPop', 'biggest', 'hunger', 'era'])];
    lines.push(
      '## Validação',
      '',
      `${plan.validate.anos} anos, sementes ${plan.validate.sementes.join(', ')}. Média dos indicadores e a distância total (menor é melhor).`,
      '',
      `| Indicador | ${validated.map((v) => v.label).join(' | ')} |`,
      `|---|${validated.map(() => '---|').join('')}`,
      `| **Distância** | ${validated.map((v) => `**${fmt(v.loss)}**`).join(' | ')} |`,
      ...shown.map((k) => `| ${k} | ${validated.map((v) => fmt(meanIndicators(v.runs, [k])[k])).join(' | ')} |`),
      '',
    );
  }
  writeFileSync(join(plan.out, 'relatorio.md'), lines.join('\n'));
}

function apply(dir) {
  const { valores } = JSON.parse(readFileSync(join(resolve(dir), 'melhor.json'), 'utf8'));
  const home = whereIs(Object.keys(valores), ROOT);
  for (const f of TUNE_FILES) {
    let src = readFileSync(join(ROOT, f), 'utf8');
    const mine = Object.keys(valores).filter((n) => home[n] === f);
    if (!mine.length) continue;
    for (const n of mine) {
      console.log(`${f}: ${n} ${readConstant(src, n)} → ${valores[n]}`);
      src = writeConstant(src, n, valores[n]);
    }
    writeFileSync(join(ROOT, f), src);
  }
}

// ---- Entrada ------------------------------------------------------------------------------------------------

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'aplicar') apply(arg);
else if (cmd) {
  const plan = loadPlan(resolve(cmd));
  mkdirSync(plan.out, { recursive: true });
  const ev = new Evaluator(plan);
  console.log(`${plan.name}: ${plan.mode}, ${plan.params.length} parâmetros, ${plan.years} anos, ${plan.parallel} em paralelo, saída em ${plan.out}`);
  if (plan.mode === 'sensibilidade') await sensitivity(plan, ev);
  else await optimize(plan, ev);
} else {
  console.log('uso: node tools/tune.mjs <plano.json> | node tools/tune.mjs aplicar <pasta-de-saida>');
  process.exit(1);
}
