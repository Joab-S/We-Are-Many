/**
 * Diagnóstico da rodada longa (calibração conjunta, agente 4B): roda uma semente como `longa.calib.ts` e
 * escreve, além dos indicadores de sempre:
 * - uma linha do tempo a cada PASSO anos (povo, lugares, era, atendimento de comida, modos de vida, fundações
 *   por causa, êxodos e fissões) e o que falta para a próxima era no lugar mais adiantado;
 * - quantas vezes a nota mínima deixou um grupo sem sítio e a melhor nota que ele viu;
 * - o rastro ano a ano dos QUEDAS lugares (3) que mais encolheram depois do pico (comida, lenha, ofícios,
 *   nascimentos, mortes, quem chegou e saiu, anos de falta e árvores ao alcance);
 * - onde morre gente de fome: tamanho do lugar, modo de vida, bioma, estação, idade do lugar e quem o fundou.
 *
 * Não muda nada no motor: só embrulha métodos do protótipo para contar, e devolve tudo no fim. Para ablação,
 * B_<CONSTANTE>=<json> troca uma constante de balance.ts e ABL=a,b desliga partes da onda 3 (sedentario,
 * semnomade, semperece, biomaneutro, semestacao, migraantes), só nesta rodada.
 *
 * `npx vitest run --config vitest.calib.config.ts src/sim/diagnostico.calib.ts`, com as variáveis ANOS (300),
 * PRIMEIRA (índice da semente, como na longa), RAIO, PASSO (50), QUEDAS e SAIDA (arquivo do relatório).
 */
import { it, vi } from 'vitest';
import { LONG_TARGETS, reportRows, runWorld, type Indicators } from './calibrate';
import { Ecosystem, type Village } from './ecosystem';
import * as B from './balance';
import { BIOME_NAMES } from '../procgen/biomes';
import { ROLE } from './roles';

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

// Ablação de constantes: B_<NOME>=<json> troca a constante de balance.ts só nesta rodada.
vi.mock('./balance', async (load) => {
  const real = (await load()) as Record<string, unknown>;
  const vars = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
  const out = { ...real };
  for (const [k, val] of Object.entries(vars)) if (k.startsWith('B_') && val !== undefined && k.slice(2) in real) out[k.slice(2)] = JSON.parse(val);
  return out;
});

/** Contagem por chave, para as tabelas de mortes. */
class Tally {
  readonly n = new Map<string, number>();
  add(k: string, by = 1): void {
    this.n.set(k, (this.n.get(k) ?? 0) + by);
  }
  rows(total: number): string[] {
    return [...this.n.entries()].sort((p, q) => q[1] - p[1]).map(([k, n]) => `| ${k} | ${n} | ${((100 * n) / Math.max(1, total)).toFixed(1).replace('.', ',')}% |`);
  }
}

const bucket = (n: number, edges: number[], unit = '') => {
  for (let k = 0; k < edges.length; k++) if (n < edges[k]) return `${k ? edges[k - 1] : 0} a ${edges[k] - 1}${unit}`;
  return `${edges[edges.length - 1]} ou mais${unit}`;
};
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2)).replace('.', ',');

it('diagnóstico da longa', async () => {
  const years = Number(env.ANOS ?? 300);
  const radius = Number(env.RAIO ?? 1);
  const first = Number(env.PRIMEIRA ?? 0);
  const every = Number(env.PASSO ?? 50);
  const seed = 1000 + first * 37;
  const proto = Ecosystem.prototype as unknown as Record<string, (...a: any[]) => any>;
  // Os métodos de agora (só os valores, sem disparar os getters), para voltar no fim.
  const saved: Record<string, (...a: any[]) => any> = {};
  for (const k of Object.getOwnPropertyNames(Ecosystem.prototype)) {
    const d = Object.getOwnPropertyDescriptor(Ecosystem.prototype, k);
    if (k !== 'constructor' && typeof d?.value === 'function') saved[k] = d.value;
  }

  // Ablação de partes do motor (ABL=a,b), só nesta rodada.
  const abl = new Set((env.ABL ?? '').split(',').filter(Boolean));
  if (abl.has('sedentario'))
    proto.updateLifeway = function (this: Ecosystem, v: Village) {
      v.lifeway = 'sedentario';
    };
  if (abl.has('semnomade'))
    proto.updateLifeway = function (this: Ecosystem, v: Village) {
      saved.updateLifeway.call(this, v);
      if (v.lifeway === 'nomade') v.lifeway = 'sedentario';
    };
  if (abl.has('semperece')) proto.spoilOf = () => 1;
  if (abl.has('biomaneutro'))
    proto.sampleArea = function (this: Ecosystem, v: Village) {
      return { ...saved.sampleArea.call(this, v), farm: 1, irrigated: 1, graze: 1, fish: 1, spoil: 1, wood: 1, amp: 1 };
    };
  if (abl.has('semestacao'))
    proto.seasonWeightOf = function (this: Ecosystem, _v: Village, base: readonly number[]) {
      return base[this.season()];
    };
  if (abl.has('migraantes')) {
    let ran = false;
    proto.economyYear = function (this: Ecosystem) {
      saved.migrate.call(this);
      ran = true;
      saved.economyYear.call(this);
    };
    proto.migrate = function (this: Ecosystem) {
      if (ran) ran = false;
      else saved.migrate.call(this);
    };
  }

  // Mortes de fome, pelo lugar onde morreram.
  const bySize = new Tally();
  const byWay = new Tally();
  const byBiome = new Tally();
  const bySeason = new Tally();
  const byAge = new Tally();
  const byFounder = new Tally();
  const byFed = new Tally();
  let starved = 0;
  const kill = proto.kill;
  proto.kill = function (this: Ecosystem, i: number, quiet?: boolean, cause?: string) {
    if (cause === 'fome' && this.alive[i] && this.village[i] >= 0) {
      const v = this.villages[this.village[i]];
      starved++;
      bySize.add(bucket(v.population, [10, 20, 40, 80, 160], ' moradores'));
      byWay.add(v.lifeway ?? 'sedentario');
      byBiome.add(BIOME_NAMES[v.area?.main as keyof typeof BIOME_NAMES] ?? String(v.area?.main));
      bySeason.add(['primavera', 'verão', 'outono', 'inverno'][this.season()] ?? '?');
      byAge.add(bucket(this.year - (v.foundedAt ?? 0), [10, 25, 50, 100], ' anos'));
      byFounder.add(v.foundedBy ?? 'semeada');
      byFed.add(bucket(Math.round((v.fedShare ?? 1) * 100), [20, 40, 60, 80], '% comendo bem'));
    }
    return kill.call(this, i, quiet, cause);
  };

  // Sítios: chamadas com nota mínima, as que voltaram vazias e a melhor nota vista nelas.
  let picks = 0;
  let empty = 0;
  const bestSeen: number[] = [];
  const choose = proto.chooseSite;
  const score = proto.siteScore;
  proto.chooseSite = function (this: Ecosystem, ...a: unknown[]) {
    const opts = (a[5] ?? {}) as { min?: number };
    if (opts.min === undefined) return choose.apply(this, a);
    let best = -Infinity;
    proto.siteScore = function (this: Ecosystem, ...b: unknown[]) {
      const s = score.apply(this, b) as number;
      if (s > best) best = s;
      return s;
    };
    try {
      const out = choose.apply(this, a) as unknown[];
      picks++;
      if (!out.length) empty++;
      if (best > -Infinity) bestSeen.push(best);
      return out;
    } finally {
      proto.siteScore = score;
    }
  };

  // Linha do tempo: a cada `every` anos, no fim do ano.
  const timeline: string[] = [];
  const eraNotes: string[] = [];
  const trace = new Map<number, string[]>();
  const peak = new Map<number, number>();
  let lastStarved = 0;
  let lastYear = 0;
  const yearly = proto.yearly;
  proto.yearly = function (this: Ecosystem) {
    yearly.call(this);
    const y = Math.floor(this.year);
    // Rastro anual de cada lugar, para achar as quedas (lugar que cresce e desaba).
    for (const v of this.villages) {
      if (v.abandoned || v.population <= 0) continue;
      const vit = v.vital;
      const roles = this.roleCount.get(v.id);
      const list = trace.get(v.id) ?? [];
      list.push(
        `| ${y} | ${v.population} | ${fmt(v.fedShare ?? 1)} | ${Math.round(v.food)} | ${Math.round(v.stock.wood)}/${Math.round(v.stock.stone)} | ${v.fields} | ${roles?.[ROLE.farmer] ?? 0}/${roles?.[ROLE.gatherer] ?? 0}/${roles?.[ROLE.hunter] ?? 0}/${roles?.[ROLE.fisher] ?? 0} | ${v.herd?.head ?? 0} | ${(v.lifeway ?? 's').slice(0, 3)} | ${fmt(this.harvest(v))} | ${fmt(v.tech)} | ${vit?.births ?? 0} | ${vit?.deaths.fome ?? 0}/${vit?.deaths.velhice ?? 0}/${(vit?.deaths.guerra ?? 0) + (vit?.deaths.doença ?? 0) + (vit?.deaths.frio ?? 0)} | ${vit?.arrived ?? 0}/${vit?.left ?? 0} | ${v.want ?? 0} | ${fmt(v.needs?.fuel ?? 1)} | ${roles?.[ROLE.woodcutter] ?? 0}/${roles?.[ROLE.builder] ?? 0} | ${v.trees ?? '-'} |`,
      );
      trace.set(v.id, list);
      peak.set(v.id, Math.max(peak.get(v.id) ?? 0, v.population));
    }
    if (y - lastYear < every) return;
    const live = this.villages.filter((v: Village) => !v.abandoned && v.population > 0);
    const people = live.reduce((n, v) => n + v.population, 0);
    const ways = { nomade: 0, sedentario: 0, intensivo: 0 } as Record<string, number>;
    for (const v of live) ways[v.lifeway ?? 'sedentario']++;
    const fed = live.reduce((n, v) => n + (v.fedShare ?? 1) * v.population, 0) / Math.max(1, people);
    const era = live.reduce((n, v) => n + v.tech * v.population, 0) / Math.max(1, people);
    const top = Math.max(0, ...live.map((v) => v.population));
    const t = this.tally;
    const hunger = ((starved - lastStarved) / Math.max(1, y - lastYear)) * (100 / Math.max(1, people));
    timeline.push(
      `| ${y} | ${people} | ${live.length} | ${this.villages.length} | ${top} | ${fmt(era)} | ${fmt(Math.max(0, ...live.map((v) => v.tech)))} | ${fmt(fed)} | ${fmt(hunger)} | ${ways.nomade}/${ways.sedentario}/${ways.intensivo} | ${t.foundFamine}/${t.foundPressure}/${t.foundLand}/${t.foundResource}/${t.soloFounds} | ${t.exodus} | ${t.fissions} |`,
    );
    const lead = live.reduce<Village | null>((b, v) => (!b || v.tech > b.tech ? v : b), null);
    if (lead) eraNotes.push(`- ${y}: ${lead.name} (era ${fmt(lead.tech)}, ${lead.population} moradores, ${lead.techs?.length ?? 0} técnicas): ${this.eraNeed(lead) ?? 'nada'}`);
    lastStarved = starved;
    lastYear = y;
  };

  let indicators: Indicators;
  let eco: Ecosystem;
  try {
    ({ indicators, eco } = runWorld(seed, years, radius));
  } finally {
    for (const [k, f] of Object.entries(saved)) proto[k] = f;
  }
  bestSeen.sort((p, q) => p - q);
  const q = (f: number) => (bestSeen.length ? fmt(bestSeen[Math.min(bestSeen.length - 1, Math.floor(f * bestSeen.length))]) : '-');
  const table = (title: string, t: Tally) => `### ${title}\n\n| | Mortes | Parte |\n|---|---|---|\n${t.rows(starved).join('\n')}\n`;
  // As maiores quedas: o pico de cada lugar contra o povo 30 anos depois do pico.
  const drops = [...trace.entries()]
    .map(([id, rows]) => {
      const pops = rows.map((r) => Number(r.split('|')[2]));
      const at = pops.indexOf(peak.get(id) ?? 0);
      const after = Math.min(...pops.slice(at, at + 30));
      return { id, at, drop: (peak.get(id) ?? 0) - after, rows };
    })
    .sort((p, q) => q.drop - p.drop)
    .slice(0, Number(env.QUEDAS ?? 3));
  const head = '| Ano | Povo | Comendo bem | Comida | Lenha/pedra | Roças | Agric./colet./caç./pesc. | Rebanho | Modo | Colheita | Era | Nasc. | Fome/velhice/outras | Chegou/saiu | Anos de falta | Lenha atendida | Lenhad./constr. | Árvores ao alcance |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|';
  const falls = drops.map((d) => `### ${eco.villages[d.id].name} (pico ${peak.get(d.id)}, queda de ${d.drop})\n\n${head}\n${d.rows.slice(Math.max(0, d.at - 15), d.at + 30).join('\n')}\n`);
  const changed = Object.keys(env)
    .filter((k) => k.startsWith('B_'))
    .map((k) => `${k.slice(2)} = ${JSON.stringify((B as Record<string, unknown>)[k.slice(2)])}`);
  const keys: (keyof Indicators)[] = ['people', 'peopleTrend', 'settlements', 'founded', 'exodus', 'medianPop', 'biggest', 'metropoles', 'cityShare', 'hunger', 'foodNeed', 'era', 'familyMoves', 'famineFounds', 'landFounds', 'fissions', 'circumscribed'];
  const text = `# Diagnóstico da longa: semente ${first}, ${years} anos${abl.size ? ` (ablação: ${[...abl].join(', ')})` : ''}${changed.length ? ` (constantes: ${changed.join(', ')})` : ''}

| Indicador | Valor | Mediana | 10% a 90% | Meta | Situação |
|---|---|---|---|---|---|
${reportRows([indicators], LONG_TARGETS, keys.filter((k) => indicators[k] !== undefined)).join('\n')}

## Linha do tempo

Era média pesada pelo povo; fundações por fome, pressão, terra, recurso e família sozinha (acumuladas). Êxodos no fim: ${eco.tally.exodus}, ${eco.tally.exodusFuel} por falta de lenha.

| Ano | Povo | Vivos | Lugares já fundados | Maior | Era média | Maior era | Comendo bem | Fome no trecho (por 100/ano) | Nômade/sedentário/intensivo | Fundações | Êxodos | Fissões |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
${timeline.join('\n')}

## O que falta para a próxima era, no lugar mais adiantado

${eraNotes.join('\n')}

## Sítios com nota mínima

${picks} escolhas, ${empty} sem sítio nenhum (${fmt((100 * empty) / Math.max(1, picks))}%). Melhor nota vista em cada escolha: 10% ${q(0.1)}, mediana ${q(0.5)}, 90% ${q(0.9)}.

## As maiores quedas

${falls.join('\n')}
## Mortes de fome (${starved})

${table('Tamanho do lugar', bySize)}
${table('Modo de vida', byWay)}
${table('Bioma principal da área', byBiome)}
${table('Estação', bySeason)}
${table('Idade do lugar', byAge)}
${table('Quem fundou', byFounder)}
${table('Parte do lugar comendo bem', byFed)}`;
  const fsName = 'node:fs';
  const fs = (await import(/* @vite-ignore */ fsName)) as { writeFileSync: (path: string, text: string) => void };
  fs.writeFileSync(env.SAIDA ?? `diagnostico-${first}.md`, text);
  console.log(text);
});
