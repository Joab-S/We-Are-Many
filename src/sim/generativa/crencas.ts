/**
 * A memória da pessoa: crenças (verbo × tag → o que espera), lentes (o que muda com o contexto), hábitos
 * (sequências que renderam) e a regra de aprender. Tudo aqui é conta pura sobre `PessoaGen`: não conhece o mundo,
 * então serve igual perto e longe da tela.
 *
 * A regra de aprender é uma só. Depois de agir, a pessoa compara o que sentia antes e depois e corrige o que
 * esperava (regra delta, repartida pelas tags do alvo). O mesmo erro, separado por "havia tal tag por perto ou
 * não", é o que faz nascer uma lente. Dois atos seguidos que rendem viram um hábito. Ver, ouvir e herdar usam a
 * mesma correção, mais fraca.
 */
import { GEN, N, NI, chave, zeros, type AtoLembrado, type Crenca, type Origem, type PessoaGen, type Verbo } from './tipos';

const lim = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

/** O instinto: o pouco com que todo mundo nasce. O resto é vivido, visto, ouvido ou herdado. */
const INSTINTO: [Verbo, string, Partial<Record<keyof typeof NI, number>>][] = [
  ['comer', 'comivel', { fome: -0.45 }],
  ['beber', 'agua', { sede: -0.9 }],
  ['dormir', 'chao', { sono: -0.5 }],
  ['descansar', 'chao', { cansaco: -0.35 }],
  ['fugir', 'perigoso', { medo: -0.5 }],
  ['seguir', 'gente', { solidao: -0.15 }],
  ['acasalar', 'parceiro', { apego: -0.6 }],
  ['cuidar', 'filho', { apego: -0.5 }],
  ['carregar', 'bebe', { apego: -0.2 }],
  ['pedir', 'parente', { fome: -0.25 }],
  // A inibição de ferir os seus também é de nascença: não é uma proibição, é um custo que pesa na conta.
  ['bater', 'filho', { apego: 0.7 }],
  ['bater', 'parente', { apego: 0.35 }],
];

export function instinto(ano: number): Record<string, Crenca> {
  const out: Record<string, Crenca> = {};
  for (const [v, tag, ef] of INSTINTO) {
    const e = zeros();
    for (const [n, x] of Object.entries(ef)) e[NI[n as keyof typeof NI]] = x as number;
    out[chave(v, tag)] = { e, c: 0.9, o: { tipo: 'instinto', de: 0, em: ano }, n: 0 };
  }
  return out;
}

export function novaPessoa(ano: number): PessoaGen {
  return {
    nec: zeros(),
    crencas: instinto(ano),
    lentes: [],
    contextos: {},
    habitos: [],
    pares: {},
    lugares: [],
    atos: [],
    antes: null,
    mao: null,
    gravida: 0,
    par: 0,
    colo: 0,
    noColo: 0,
    ferida: 0,
    desejo: 0,
    filhos: [],
    dorme: false,
    pedido: null,
    seguidores: 0,
    segue: 0,
    linha: [],
    conta: { deu: 0, recebeu: 0, bateu: 0, apanhou: 0 },
    dormiuEm: null,
  };
}

/** O quanto um efeito vale agora: a soma, por necessidade, de urgência × alívio (efeito negativo alivia). */
export function valor(u: readonly number[], e: readonly number[]): number {
  let s = 0;
  for (let n = 0; n < N; n++) s -= u[n] * e[n];
  return s;
}

/** As tags que contam de um alvo, da mais forte para a mais fraca (no máximo quatro). */
export function principais(tags: Record<string, number>, max = 4): [string, number][] {
  return Object.entries(tags)
    .filter(([, w]) => w >= 0.1)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, max);
}

export interface Previsao {
  /** O que as crenças esperam, por necessidade. */
  e: number[];
  /** O que as lentes acrescentam com o contexto de agora. */
  lente: number[];
  /** Confiança (0 a 1): a da crença mais firme entre as tags do alvo. */
  c: number;
  /** A tag que mais pesa na previsão (para nomear a opção). */
  tag: string;
}

/** As crenças da pessoa arrumadas por verbo (refeito a cada pensamento: é barato e evita montar a chave a cada consulta). */
export type PorVerbo = Map<string, Map<string, Crenca>>;
export function porVerbo(p: PessoaGen): PorVerbo {
  const out: PorVerbo = new Map();
  for (const k in p.crencas) {
    const at = k.indexOf('|');
    const v = k.slice(0, at);
    let m = out.get(v);
    if (!m) out.set(v, (m = new Map()));
    m.set(k.slice(at + 1), p.crencas[k]);
  }
  return out;
}

const SEM_CRENCA = new Map<string, Crenca>();

/**
 * O que a pessoa espera de fazer `v` num alvo com estas tags, com estas tags por perto. `ts` são as tags que contam
 * já ordenadas (`principais`) e `idx` o índice por verbo, quando quem chama já os tem.
 */
export function prever(p: PessoaGen, v: Verbo, tags: Record<string, number>, ctx: Record<string, number>, ts?: [string, number][], idx?: PorVerbo): Previsao {
  const e = zeros();
  const lente = zeros();
  let c = 0;
  let tag = '';
  let peso = -1;
  const lista = ts ?? principais(tags);
  const meu = idx ? idx.get(v) ?? SEM_CRENCA : null;
  for (const [t, w] of lista) {
    const cr = meu ? meu.get(t) : p.crencas[chave(v, t)];
    if (!cr) {
      if (peso < 0 && !tag) tag = t;
      continue;
    }
    let forca = 0;
    for (let n = 0; n < N; n++) {
      e[n] += cr.e[n] * w;
      forca += Math.abs(cr.e[n]);
    }
    if (cr.c > c) c = cr.c;
    if (forca * w > peso) {
      peso = forca * w;
      tag = t;
    }
  }
  for (const l of p.lentes) {
    if (l.v !== v) continue;
    const w = ctx[l.c] ?? 0;
    if (w <= 0) continue;
    for (let n = 0; n < N; n++) lente[n] += l.d[n] * l.f * Math.min(1, w);
  }
  return { e, lente, c, tag };
}

/** O que a pessoa espera ter depois de `v` num alvo com estas tags (`mao:<tag>`, `ver:<tag>`), de 0 a 1; null se não espera nada. */
export function esperaTer(p: PessoaGen, v: Verbo, tags: Record<string, number>, ts?: [string, number][], idx?: PorVerbo): Record<string, number> | null {
  let out: Record<string, number> | null = null;
  const meu = idx ? idx.get(v) : null;
  if (idx && !meu) return null;
  for (const [t, w] of ts ?? principais(tags)) {
    const g = (meu ? meu.get(t) : p.crencas[chave(v, t)])?.g;
    if (!g) continue;
    for (const k in g) {
      out ??= {};
      out[k] = Math.max(out[k] ?? 0, g[k] * Math.min(1, w * 1.5));
    }
  }
  return out;
}

/**
 * Corrige as crenças de `v` sobre as tags do alvo pelo que aconteceu: `real` é a mudança nas necessidades e
 * `esperado` o que se previa. Devolve o tamanho da surpresa (a soma dos erros).
 */
export function aprender(p: PessoaGen, v: Verbo, tags: Record<string, number>, esperado: readonly number[], real: readonly number[], passo: number, o: Origem, ganhos: readonly string[] = []): number {
  const ts = principais(tags);
  let den = 0;
  for (const [, w] of ts) den += w * w;
  if (den <= 0) return 0;
  let surpresa = 0;
  for (let n = 0; n < N; n++) surpresa += Math.abs(real[n] - esperado[n]);
  for (const [t, w] of ts) {
    const k = chave(v, t);
    let cr = p.crencas[k];
    if (!cr) cr = p.crencas[k] = { e: zeros(), c: 0, o, n: 0 };
    for (let n = 0; n < N; n++) cr.e[n] = lim(cr.e[n] + (passo * (real[n] - esperado[n]) * w) / den, -1.5, 1.5);
    cr.c += (1 - cr.c) * 0.3 * Math.min(1, passo / GEN.aprende);
    cr.n++;
    // Quem só tinha ouvido ou herdado e agora viveu passa a saber por conta própria (a data de quando soube fica).
    if (o.tipo === 'vivido' && cr.o.tipo !== 'instinto' && cr.o.tipo !== 'vivido') cr.o = { tipo: 'vivido', de: cr.o.de, em: cr.o.em };
    if (o.tipo === 'vivido') {
      // O que veio depois (na mão, à vista) também é crença: é por ela que a pessoa encadeia dois ou três passos.
      const g = (cr.g ??= {});
      for (const x of Object.keys(g)) if (!ganhos.includes(x)) g[x] *= 0.8;
      for (const x of ganhos) g[x] = (g[x] ?? 0) + 0.45 * (1 - (g[x] ?? 0));
      for (const x of Object.keys(g)) if (g[x] < 0.05) delete g[x];
    }
  }
  return surpresa;
}

/**
 * A conta das lentes: a surpresa de `v` (o real menos o que as crenças previam), separada por "esta tag estava
 * por perto" ou não. Quando os dois lados têm amostras e diferem, nasce (ou se ajusta) a lente; quando a diferença
 * some, a lente some junto. O mecanismo não conhece nenhuma lente pelo nome.
 */
export function contextualizar(p: PessoaGen, v: Verbo, ctx: Record<string, number>, residuo: readonly number[], ano: number): void {
  const presentes = principais(ctx, 6).map(([t]) => t);
  const pre = `${v}|`;
  let r2 = 0;
  for (let i = 0; i < N; i++) r2 += residuo[i] * residuo[i];
  const mexe = (k: string, com: boolean) => {
    let s = p.contextos[k];
    if (!s) s = p.contextos[k] = { nCom: 0, nSem: 0, com: zeros(), sem: zeros(), qCom: 0, qSem: 0 };
    const m = com ? s.com : s.sem;
    const n = com ? s.nCom : s.nSem;
    const a = n < 5 ? 1 / (n + 1) : 0.2;
    for (let i = 0; i < N; i++) m[i] += (residuo[i] - m[i]) * a;
    if (com) {
      s.qCom += (r2 - s.qCom) * a;
      s.nCom = Math.min(99, n + 1);
    } else {
      s.qSem += (r2 - s.qSem) * a;
      s.nSem = Math.min(99, n + 1);
    }
  };
  for (const t of presentes) mexe(pre + t, true);
  for (const k of Object.keys(p.contextos)) if (k.startsWith(pre) && !presentes.includes(k.slice(pre.length))) mexe(k, false);
  // Teto da tabela: saem as contas com menos amostras.
  const ks = Object.keys(p.contextos);
  if (ks.length > 48) {
    ks.sort((a, b) => p.contextos[a].nCom + p.contextos[a].nSem - (p.contextos[b].nCom + p.contextos[b].nSem) || (a < b ? -1 : 1));
    for (const k of ks.slice(0, ks.length - 48)) delete p.contextos[k];
  }
  for (const k of Object.keys(p.contextos)) {
    if (!k.startsWith(pre)) continue;
    const s = p.contextos[k];
    const c = k.slice(pre.length);
    const at = p.lentes.findIndex((l) => l.v === v && l.c === c);
    if (s.nCom < GEN.lenteMin || s.nSem < GEN.lenteMin) continue;
    let mag = 0;
    let d2 = 0;
    let mc = 0;
    let ms = 0;
    const d = zeros();
    for (let i = 0; i < N; i++) {
      d[i] = s.com[i] - s.sem[i];
      mag += Math.abs(d[i]);
      d2 += d[i] * d[i];
      mc += s.com[i] * s.com[i];
      ms += s.sem[i] * s.sem[i];
    }
    // A diferença tem de ser maior que o ruído das duas contas (senão é coincidência de poucas amostras).
    const ruido = Math.sqrt(Math.max(0, s.qCom - mc) / s.nCom + Math.max(0, s.qSem - ms) / s.nSem);
    const firme = Math.sqrt(d2) >= 2 * ruido;
    if (at < 0) {
      if (mag >= GEN.lenteNasce && firme) p.lentes.push({ v, c, d, f: Math.min(1, mag / 0.4), o: { tipo: 'vivido', de: 0, em: ano } });
    } else if (mag < GEN.lenteSome || (!firme && mag < GEN.lenteNasce)) p.lentes.splice(at, 1);
    else {
      // Quem tinha ouvido ou herdado a lente e agora tem a própria conta passa a tê-la por vivência.
      const l = p.lentes[at];
      l.d = d;
      l.f = Math.min(1, mag / 0.4);
      if (l.o.tipo !== 'vivido') l.o = { tipo: 'vivido', de: l.o.de, em: l.o.em };
    }
  }
  if (p.lentes.length > 16) {
    p.lentes.sort((a, b) => b.f - a.f || (a.c < b.c ? -1 : 1));
    p.lentes.length = 16;
  }
}

/** Uma lente que ninguém confirma enfraquece com o tempo (as ouvidas e herdadas não têm conta própria para segurar). */
export function esquecer(p: PessoaGen, anos: number): void {
  for (let k = p.lentes.length - 1; k >= 0; k--) {
    const l = p.lentes[k];
    const s = p.contextos[`${l.v}|${l.c}`];
    if (s && s.nCom >= GEN.lenteMin && s.nSem >= GEN.lenteMin) continue;
    l.f *= Math.exp(-0.05 * anos);
    if (l.f < 0.08) p.lentes.splice(k, 1);
  }
}

/** Lembra de um ato cujo resultado pode chegar depois (mexi nesta coisa, dei a esta pessoa). */
export function lembrarAto(p: PessoaGen, ref: number, v: Verbo, tags: string[], ano: number): void {
  const ja = p.atos.find((a) => a.ref === ref && a.v === v && a.tags.join() === tags.join());
  if (ja) {
    ja.em = ano;
    return;
  }
  p.atos.unshift({ ref, v, tags, em: ano, pago: 0 });
  if (p.atos.length > GEN.atos) p.atos.length = GEN.atos;
}

/** A coisa (ou a pessoa) `ref` rendeu `real` agora: os atos antigos sobre ela levam parte do crédito. */
export function creditar(p: PessoaGen, ref: number, real: readonly number[], ano: number, saltar?: AtoLembrado): number {
  let n = 0;
  for (const a of p.atos) {
    if (a.ref !== ref || a === saltar || !a.tags.length) continue;
    for (const t of a.tags) {
      const k = chave(a.v, t);
      let cr = p.crencas[k];
      if (!cr) cr = p.crencas[k] = { e: zeros(), c: 0, o: { tipo: 'vivido', de: 0, em: ano }, n: 0 };
      // Só o que aliviou conta: o ato antigo não leva a culpa do que o de agora custou.
      for (let i = 0; i < N; i++) if (real[i] < 0) cr.e[i] = lim(cr.e[i] + (GEN.aprende * GEN.depois * real[i]) / a.tags.length, -1.5, 1.5);
      cr.c += (1 - cr.c) * 0.25;
      cr.n++;
    }
    let soma = 0;
    for (let i = 0; i < N; i++) soma += Math.abs(Math.min(0, real[i]));
    a.pago += soma;
    n++;
  }
  return n;
}

/** Os atos que esperaram demais sem render: a aposta se perdeu, e a crença nela encolhe. */
export function vencer(p: PessoaGen, ano: number): void {
  for (let k = p.atos.length - 1; k >= 0; k--) {
    const a = p.atos[k];
    if (ano - a.em < GEN.espera) continue;
    if (a.pago <= 0) for (const t of a.tags) {
      const cr = p.crencas[chave(a.v, t)];
      if (cr && cr.o.tipo !== 'instinto') for (let i = 0; i < N; i++) cr.e[i] *= 0.7;
    }
    p.atos.splice(k, 1);
  }
}

/**
 * Um ato terminou bem. Se o anterior foi há pouco e este rendeu, o par (ou o trio) conta um ponto; com pontos
 * bastantes vira um hábito, uma opção só com efeito próprio. Devolve o hábito recém-nascido, se nasceu um.
 */
export function encadear(p: PessoaGen, k: string, real: readonly number[], ganho: number, ano: number, novoId: () => number, abriu = true): number {
  // Só conta como sequência quando o ato anterior abriu o caminho para este: não rendeu por si, mas deixou algo na
  // mão ou à vista (pegar a pedra não mata a fome; é o que vem depois que rende). Dois atos que rendem cada um por
  // si, ou um ato que não deixou nada, são só dois atos seguidos.
  const antes = p.antes && ano - p.antes.em < 2 && p.antes.ganho < 0.04 && p.antes.abriu ? p.antes : null;
  let nasceu = 0;
  if (antes && ganho > 0.06) {
    const partes = antes.chave.split('>');
    for (let de = 0; de < partes.length; de++) {
      const passos = [...partes.slice(de), k];
      if (new Set(passos).size !== passos.length) continue;
      const pk = passos.join('>');
      const par = (p.pares[pk] ??= { n: 0, e: zeros() });
      par.n++;
      for (let i = 0; i < N; i++) par.e[i] += (real[i] - par.e[i]) / Math.min(par.n, 4);
      const ja = p.habitos.find((h) => h.passos.join('>') === pk);
      if (ja) {
        ja.n++;
        for (let i = 0; i < N; i++) ja.e[i] += (real[i] - ja.e[i]) * 0.25;
      } else if (par.n >= GEN.habito && p.habitos.length < 12) {
        nasceu = novoId();
        p.habitos.push({ id: nasceu, passos, e: par.e.slice(), n: par.n, o: { tipo: 'vivido', de: 0, em: ano } });
      }
    }
    const ks = Object.keys(p.pares);
    if (ks.length > 30) {
      ks.sort((a, b) => p.pares[a].n - p.pares[b].n || (a < b ? -1 : 1));
      for (const x of ks.slice(0, ks.length - 30)) delete p.pares[x];
    }
  }
  // O que fica para o próximo: os dois últimos atos (um trio é o máximo que se encadeia).
  const cauda = antes ? antes.chave.split('>').slice(-1) : [];
  p.antes = { chave: [...cauda, k].join('>'), em: ano, ganho, abriu };
  return nasceu;
}

/** Um hábito que falhou perde força; fraco demais, some (nada trava). */
export function falharHabito(p: PessoaGen, id: number): void {
  const k = p.habitos.findIndex((h) => h.id === id);
  if (k < 0) return;
  const h = p.habitos[k];
  for (let i = 0; i < N; i++) h.e[i] *= 0.75;
  if (--h.n <= 0) p.habitos.splice(k, 1);
}

/** O filho começa com uma parte do que os pais sabem: as crenças e lentes deles, mais fracas e menos certas. */
export function herdar(filho: PessoaGen, pais: { uid: number; p: PessoaGen }[], ano: number): void {
  for (const { uid, p } of pais) {
    for (const [k, cr] of Object.entries(p.crencas)) {
      if (cr.o.tipo === 'instinto' || cr.c < 0.3) continue;
      const ja = filho.crencas[k];
      if (ja && ja.o.tipo === 'instinto') continue;
      const e = cr.e.map((x) => x * GEN.herda);
      if (ja) for (let i = 0; i < N; i++) ja.e[i] = (ja.e[i] + e[i]) / 2;
      else filho.crencas[k] = { e, c: cr.c * 0.5, g: cr.g ? { ...cr.g } : undefined, o: { tipo: 'herdado', de: uid, em: ano }, n: 0 };
    }
    for (const l of p.lentes) {
      if (l.f < 0.2 || filho.lentes.some((x) => x.v === l.v && x.c === l.c) || filho.lentes.length >= 12) continue;
      filho.lentes.push({ v: l.v, c: l.c, d: l.d.slice(), f: l.f * GEN.herda, o: { tipo: 'herdado', de: uid, em: ano } });
    }
  }
}

/**
 * Conversa: quem fala passa uma crença, uma lente ou um hábito que o outro não tem (ou tem mais fraco), com ruído e
 * pesado pela confiança de quem ouve em quem fala (`fe`, de 0 a 1). Devolve o que passou, para a linha do tempo.
 */
export function contar(de: PessoaGen, deUid: number, para: PessoaGen, fe: number, rnd: () => number, ano: number): string {
  let melhor = '';
  let nota = 0;
  for (const [k, cr] of Object.entries(de.crencas)) {
    if (cr.o.tipo === 'instinto' || cr.c < 0.4) continue;
    const ja = para.crencas[k];
    if (ja && ja.c >= cr.c - 0.1) continue;
    let f = 0;
    for (let i = 0; i < N; i++) f += Math.abs(cr.e[i]);
    const s = f * cr.c;
    if (s > nota || (s === nota && k < melhor)) {
      nota = s;
      melhor = k;
    }
  }
  const peso = GEN.ouvido * (0.4 + 0.6 * fe);
  if (melhor) {
    const cr = de.crencas[melhor];
    let ja = para.crencas[melhor];
    if (!ja) ja = para.crencas[melhor] = { e: zeros(), c: 0, o: { tipo: 'ouvido', de: deUid, em: ano }, n: 0 };
    for (let i = 0; i < N; i++) ja.e[i] += (cr.e[i] * (0.8 + 0.4 * rnd()) - ja.e[i]) * peso;
    ja.c = Math.max(ja.c, cr.c * peso);
    if (cr.g) {
      const g = (ja.g ??= {});
      for (const [x, w] of Object.entries(cr.g)) g[x] = Math.max(g[x] ?? 0, w * peso);
    }
  }
  const lente = de.lentes.find((l) => l.f >= 0.3 && !para.lentes.some((x) => x.v === l.v && x.c === l.c));
  if (lente && para.lentes.length < 14) para.lentes.push({ v: lente.v, c: lente.c, d: lente.d.map((x) => x * (0.8 + 0.4 * rnd())), f: lente.f * peso, o: { tipo: 'ouvido', de: deUid, em: ano } });
  const habito = de.habitos.find((h) => h.n >= GEN.habito && !para.habitos.some((x) => x.passos.join('>') === h.passos.join('>')));
  if (habito && para.habitos.length < 10 && rnd() < peso) para.habitos.push({ id: habito.id, passos: habito.passos.slice(), e: habito.e.map((x) => x * peso), n: 1, o: { tipo: 'ouvido', de: deUid, em: ano } });
  return melhor || (lente ? `${lente.v}|${lente.c}` : '');
}

/** Guarda (ou atualiza) um lugar lembrado; os menos lembrados saem quando enche. */
export function lembrarLugar(p: PessoaGen, x: number, y: number, tags: Record<string, number>, bem: number, ano: number, de = 0): void {
  let l = p.lugares.find((q) => Math.abs(q.x - x) < 5 && Math.abs(q.y - y) < 5);
  if (!l) {
    l = { x, y, tags: {}, bem: 0, em: ano, de };
    p.lugares.push(l);
  }
  for (const [t, w] of Object.entries(tags)) if (w >= 0.2) l.tags[t] = Math.max((l.tags[t] ?? 0) * 0.7, w);
  for (const t of Object.keys(l.tags)) if (!(t in tags)) if ((l.tags[t] *= 0.7) < 0.15) delete l.tags[t];
  l.bem = lim(l.bem * 0.9 + bem, -3, 6);
  l.em = ano;
  if (p.lugares.length > GEN.lugares) {
    p.lugares.sort((a, b) => b.bem - a.bem || b.em - a.em);
    p.lugares.length = GEN.lugares;
  }
}
