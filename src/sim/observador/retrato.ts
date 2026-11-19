/**
 * Observador: o retrato do coletivo, sem rótulo. Agrupa as pessoas pela proximidade (refeito do zero a cada
 * leitura, nunca guardado no mundo) e mede cada agrupamento com números contínuos: quantos são, quanto se movem,
 * há quanto tempo dormem no mesmo lugar, quantos seguem a mesma pessoa, quanto dão e apanham, o que há construído
 * em volta e quais formas de pensar são mais comuns. Não existe aqui (nem em lugar nenhum) a palavra para o que o
 * agrupamento "é": quem olha tira as próprias conclusões.
 *
 * Só lê o mundo. A memória de que precisa (onde cada um estava na leitura anterior, as primeiras vezes) fica aqui,
 * fora do Ecosystem.
 */
import type { Ecosystem } from '../ecosystem';
import { wrapDx } from '../settlement';
import type { Coisa, PessoaGen } from '../generativa/tipos';
import { nomeDaLente, nomeDoAto, nomeDoHabito } from './nomes';

export interface Agrupamento {
  membros: number[];
  x: number;
  y: number;
  quantos: number;
  criancas: number;
  /** Tiles por ano que cada um andou, em média, desde a leitura anterior (NaN na primeira). */
  movimento: number;
  /** Noites seguidas no mesmo lugar, em média. */
  noites: number;
  /** Fração do agrupamento que segue a pessoa mais seguida, e quem é ela (0 = ninguém segue ninguém). */
  seguem: number;
  seguido: number;
  /** Vezes que alguém dali deu algo a alguém, e bateu em alguém (desde sempre, somadas). */
  deu: number;
  bateu: number;
  /** O que há construído a até 8 tiles do centro. */
  abrigos: number;
  fogos: number;
  guardado: number;
  plantas: number;
  /** As formas de pensar mais comuns (o texto sai do conteúdo da lente) e quantos as têm. */
  lentes: { texto: string; quantos: number }[];
  habitos: { texto: string; quantos: number }[];
  /** Crenças aprendidas (fora o instinto) por pessoa. */
  saber: number;
  texto: string;
}

interface Memoria {
  onde: Map<number, { x: number; y: number; ano: number }>;
  primeiras: Primeira[];
  vistas: Set<string>;
}
const MEM = new WeakMap<Ecosystem, Memoria>();
function mem(eco: Ecosystem): Memoria {
  let m = MEM.get(eco);
  if (!m) MEM.set(eco, (m = { onde: new Map(), primeiras: [], vistas: new Set() }));
  return m;
}

const abrigo = (c: Coisa) => Math.min(1, ((c.m.galho ?? 0) + 2 * (c.m.pedra ?? 0) + 3 * (c.m.tronco ?? 0)) / 10);

/** As pessoas do modelo generativo vivas agora: índice, uid e o que sabem. */
export function pessoasGen(eco: Ecosystem): { i: number; uid: number; p: PessoaGen }[] {
  const out: { i: number; uid: number; p: PessoaGen }[] = [];
  if (!eco.gen) return out;
  for (let i = 0; i < eco.count; i++) {
    if (!eco.alive[i] || eco.village[i] >= 0 || eco.species[eco.kind[i]].kind !== 'sapient') continue;
    const p = eco.gen.pessoas.get(eco.uid[i]);
    if (p) out.push({ i, uid: eco.uid[i], p });
  }
  return out;
}

/** Os agrupamentos de agora, do maior para o menor. `raio` é a distância que liga duas pessoas. */
export function retrato(eco: Ecosystem, raio = 7): Agrupamento[] {
  const gente = pessoasGen(eco);
  const n = gente.length;
  const w = eco.map.width;
  const pai = gente.map((_, k) => k);
  const acha = (k: number): number => (pai[k] === k ? k : (pai[k] = acha(pai[k])));
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const dy = eco.y[gente[a].i] - eco.y[gente[b].i];
      if (Math.abs(dy) > raio) continue;
      const dx = wrapDx(eco.x[gente[a].i] - eco.x[gente[b].i], w);
      if (dx * dx + dy * dy <= raio * raio) pai[acha(a)] = acha(b);
    }
  }
  const grupos = new Map<number, number[]>();
  for (let k = 0; k < n; k++) {
    const r = acha(k);
    let g = grupos.get(r);
    if (!g) grupos.set(r, (g = []));
    g.push(k);
  }
  const m = mem(eco);
  const out: Agrupamento[] = [];
  for (const ks of grupos.values()) {
    const x0 = eco.x[gente[ks[0]].i];
    let sx = 0;
    let sy = 0;
    let criancas = 0;
    let mov = 0;
    let movN = 0;
    let noites = 0;
    let deu = 0;
    let bateu = 0;
    let saber = 0;
    const segue = new Map<number, number>();
    const lentes = new Map<string, number>();
    const habitos = new Map<string, number>();
    for (const k of ks) {
      const { i, uid, p } = gente[k];
      sx += wrapDx(eco.x[i] - x0, w);
      sy += eco.y[i];
      if (eco.age[i] < eco.species[eco.kind[i]].maturity) criancas++;
      const antes = m.onde.get(uid);
      if (antes && eco.year > antes.ano) {
        mov += Math.hypot(wrapDx(eco.x[i] - antes.x, w), eco.y[i] - antes.y) / (eco.year - antes.ano);
        movN++;
      }
      noites += p.dormiuEm?.noites ?? 0;
      deu += p.conta.deu;
      bateu += p.conta.bateu;
      if (p.segue) segue.set(p.segue, (segue.get(p.segue) ?? 0) + 1);
      for (const l of p.lentes) if (l.f >= 0.2) lentes.set(nomeDaLente(l), (lentes.get(nomeDaLente(l)) ?? 0) + 1);
      for (const h of p.habitos) habitos.set(nomeDoHabito(h), (habitos.get(nomeDoHabito(h)) ?? 0) + 1);
      for (const c of Object.values(p.crencas)) if (c.o.tipo !== 'instinto' && c.c >= 0.3) saber++;
    }
    const q = ks.length;
    const cx = (((x0 + sx / q) % w) + w) % w;
    const cy = sy / q;
    let abrigos = 0;
    let fogos = 0;
    let guardado = 0;
    let plantas = 0;
    for (const c of eco.gen!.coisas) {
      if (Math.hypot(wrapDx(c.x - cx, w), c.y - cy) > 8) continue;
      if (abrigo(c) >= 0.5) abrigos++;
      if (c.fogo > 0) fogos++;
      guardado += (c.m.comida ?? 0) + (c.m.carne ?? 0);
      if (c.planta >= 1 || c.broto > 0) plantas++;
    }
    let seguido = 0;
    let seguem = 0;
    for (const [uid, k] of segue) if (k > seguem) {
      seguem = k;
      seguido = uid;
    }
    const topo = (mp: Map<string, number>) => [...mp].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3).map(([texto, quantos]) => ({ texto, quantos }));
    const g: Agrupamento = { membros: ks.map((k) => gente[k].uid), x: cx, y: cy, quantos: q, criancas, movimento: movN ? mov / movN : NaN, noites: noites / q, seguem: q > 1 ? seguem / q : 0, seguido, deu, bateu, abrigos, fogos, guardado, plantas, lentes: topo(lentes), habitos: topo(habitos), saber: saber / q, texto: '' };
    const f = (x: number, d = 1) => (Number.isNaN(x) ? '?' : x.toFixed(d).replace('.', ','));
    g.texto = `${q} juntos (${criancas} pequenos) em ${Math.round(cx)},${Math.round(cy)}: andam ${f(g.movimento)} tiles/ano, ${f(g.noites)} noites no mesmo lugar, ${Math.round(g.seguem * 100)}% seguem o mesmo, deram ${deu}x, bateram ${bateu}x; em volta: ${abrigos} abrigos, ${fogos} fogos, ${f(guardado)} de comida guardada, ${plantas} plantas; sabem ${f(g.saber)} coisas cada${g.lentes.length ? `; ${g.lentes.map((l) => `"${l.texto}" (${l.quantos})`).join(', ')}` : ''}${g.habitos.length ? `; hábitos: ${g.habitos.map((h) => `${h.texto} (${h.quantos})`).join(', ')}` : ''}`;
    out.push(g);
  }
  // A leitura de agora vira o "antes" da próxima (memória do observador, não do mundo).
  m.onde.clear();
  for (const { i, uid } of gente) m.onde.set(uid, { x: eco.x[i], y: eco.y[i], ano: eco.year });
  return out.sort((a, b) => b.quantos - a.quantos || a.membros[0] - b.membros[0]);
}

/** O mundo generativo numa linha (para a sonda e o topo do painel). */
export function resumoDoMundo(eco: Ecosystem): string {
  const g = eco.gen;
  if (!g) return 'mundo sem o modelo generativo';
  const gente = pessoasGen(eco);
  let criancas = 0;
  let saber = 0;
  let lentes = 0;
  let habitos = 0;
  let gravidas = 0;
  for (const { i, p } of gente) {
    if (eco.age[i] < eco.species[eco.kind[i]].maturity) criancas++;
    for (const c of Object.values(p.crencas)) if (c.o.tipo !== 'instinto' && c.c >= 0.3) saber++;
    lentes += p.lentes.length;
    habitos += p.habitos.length;
    if (p.gravida) gravidas++;
  }
  let abrigos = 0;
  let fogos = 0;
  let guardado = 0;
  let plantas = 0;
  for (const c of g.coisas) {
    if (abrigo(c) >= 0.5) abrigos++;
    if (c.fogo > 0) fogos++;
    guardado += (c.m.comida ?? 0) + (c.m.carne ?? 0);
    if (c.planta >= 1 || c.broto > 0) plantas++;
  }
  const q = Math.max(1, gente.length);
  const f = (x: number) => x.toFixed(1).replace('.', ',');
  return `gente ${gente.length} (${criancas} pequenos, ${gravidas} grávidas), nascidos ${g.conta.nascidos}, mortos ${g.conta.mortos}; montes ${g.coisas.length}, abrigos ${abrigos}, fogos ${fogos}, guardado ${f(guardado)}, plantas ${plantas}; por pessoa: ${f(saber / q)} crenças aprendidas, ${f(lentes / q)} lentes, ${f(habitos / q)} hábitos`;
}

export interface Primeira {
  ano: number;
  /** O fato, descrito pelo que é (não por um nome de estágio). */
  oque: string;
  quem: number;
  x: number;
  y: number;
}

/**
 * As primeiras vezes vistas até agora neste mundo (o primeiro monte que abriga, o primeiro fogo, a primeira planta
 * de semente posta por alguém, a primeira lasca, a primeira lente, o primeiro hábito). O observador nota quando
 * olha; o mundo não sabe que foi a primeira vez.
 */
export function primeirasVezes(eco: Ecosystem): Primeira[] {
  const g = eco.gen;
  const m = mem(eco);
  if (!g) return m.primeiras;
  const nota = (k: string, oque: string, quem: number, x: number, y: number) => {
    if (m.vistas.has(k)) return;
    m.vistas.add(k);
    m.primeiras.push({ ano: eco.year, oque, quem, x, y });
  };
  for (const c of g.coisas) {
    if (abrigo(c) >= 0.5) nota('abrigo', 'um monte de galhos e pedras que cobre alguém', c.de, c.x, c.y);
    if (c.fogo > 0) nota('fogo', 'um fogo aceso', c.de, c.x, c.y);
    if ((c.m.comida ?? 0) + (c.m.carne ?? 0) >= 3) nota('guardado', 'comida juntada num lugar', c.de, c.x, c.y);
    if (c.planta >= 1) nota('planta', 'planta nascida de semente deixada na terra', c.de, c.x, c.y);
    if ((c.m.tronco ?? 0) >= 1) nota('tronco', 'uma árvore derrubada com lasca', c.de, c.x, c.y);
  }
  for (const { i, uid, p } of pessoasGen(eco)) {
    if (p.mao?.que === 'lasca') nota('lasca', 'uma lasca de pedra na mão', uid, eco.x[i], eco.y[i]);
    for (const l of p.lentes) nota(`lente:${l.v}|${l.c}`, `alguém passou a ver que ${nomeDaLente(l)}`, uid, eco.x[i], eco.y[i]);
    for (const h of p.habitos) nota(`habito:${h.passos.join('>')}`, `virou costume: ${nomeDoHabito(h)}`, uid, eco.x[i], eco.y[i]);
    if (p.conta.deu > 0) nota('dar', 'alguém deu algo a alguém', uid, eco.x[i], eco.y[i]);
    if (p.conta.bateu > 0) nota('bater', 'alguém bateu em alguém', uid, eco.x[i], eco.y[i]);
    if (p.seguidores >= 3) nota('seguido', 'três ou mais seguindo a mesma pessoa', uid, eco.x[i], eco.y[i]);
  }
  return m.primeiras;
}

export interface Difusao {
  chave: string;
  nome: string;
  /** Quem tem, do primeiro que soube ao último. */
  quem: { uid: number; em: number; origem: string; de: number; x: number; y: number; primeiro: boolean }[];
}

/** Quem tem uma crença (`verbo|tag`) ou uma lente (`lente:verbo|tag`), e quando cada um passou a ter. */
export function difusao(eco: Ecosystem, chave: string): Difusao {
  const lente = chave.startsWith('lente:');
  const k = lente ? chave.slice(6) : chave;
  const quem: Difusao['quem'] = [];
  let nome = nomeDoAto(k);
  for (const { i, uid, p } of pessoasGen(eco)) {
    if (lente) {
      const l = p.lentes.find((x) => `${x.v}|${x.c}` === k);
      if (!l) continue;
      nome = nomeDaLente(l);
      quem.push({ uid, em: l.o.em, origem: l.o.tipo, de: l.o.de, x: eco.x[i], y: eco.y[i], primeiro: false });
    } else {
      const c = p.crencas[k];
      if (!c || c.o.tipo === 'instinto' || c.c < 0.3) continue;
      quem.push({ uid, em: c.o.em, origem: c.o.tipo, de: c.o.de, x: eco.x[i], y: eco.y[i], primeiro: false });
    }
  }
  quem.sort((a, b) => a.em - b.em || a.uid - b.uid);
  if (quem.length) quem[0].primeiro = true;
  return { chave, nome, quem };
}

/** O que dá para escolher na difusão: as crenças aprendidas e as lentes que alguém tem, das mais espalhadas para as menos. */
export function conhecimentos(eco: Ecosystem): { chave: string; nome: string; quantos: number }[] {
  const conta = new Map<string, { nome: string; n: number }>();
  for (const { p } of pessoasGen(eco)) {
    for (const [k, c] of Object.entries(p.crencas)) {
      if (c.o.tipo === 'instinto' || c.c < 0.3) continue;
      const x = conta.get(k) ?? { nome: nomeDoAto(k), n: 0 };
      x.n++;
      conta.set(k, x);
    }
    for (const l of p.lentes) {
      const k = `lente:${l.v}|${l.c}`;
      const x = conta.get(k) ?? { nome: nomeDaLente(l), n: 0 };
      x.n++;
      conta.set(k, x);
    }
  }
  return [...conta].map(([chave, x]) => ({ chave, nome: x.nome, quantos: x.n })).sort((a, b) => b.quantos - a.quantos || (a.chave < b.chave ? -1 : 1));
}
