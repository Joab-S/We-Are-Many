/**
 * Motor de utilidade (IA local das pessoas): cada decisão é uma lista de opções; cada opção tem
 * considerações que leem um número do contexto e o passam por uma curva de 0 a 1. A nota é o
 * produto das considerações (com a correção do "Infinite Axis Utility System" para opções com
 * muitas considerações), vezes o peso. A escolha sorteia entre as opções perto da melhor, com o
 * gerador do mundo, então tudo continua reproduzível. Cada escolha devolve o porquê.
 */

/** Curva de resposta: recebe de 0 a 1 (ou qualquer número, que é cortado) e devolve de 0 a 1. */
export type Curve = (x: number) => number;

const cut = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const curves = {
  /** Reta de `lo` (em x = 0) a `hi` (em x = 1). */
  linear: (lo = 0, hi = 1): Curve => (x) => cut(lo + (hi - lo) * cut(x)),
  /** Sobe devagar e acelera (exp > 1) ou sobe rápido e satura (exp < 1). */
  power: (exp: number, lo = 0, hi = 1): Curve => (x) => cut(lo + (hi - lo) * cut(x) ** exp),
  /** Em S, centrada em `mid`, com inclinação `k`. */
  logistic: (mid = 0.5, k = 10): Curve => (x) => 1 / (1 + Math.exp(-k * (x - mid))),
  /** Traço de −1 a 1 vira um multiplicador: 1 − força no extremo de baixo, 1 + força no de cima (cortado em 0..1 pela nota final). */
  trait: (strength = 0.5): Curve => (x) => Math.max(0, 1 + strength * x) / (1 + strength),
  /** 1 se x ≥ limiar, senão `below`. */
  step: (threshold: number, below = 0): Curve => (x) => (x >= threshold ? 1 : below),
};

export interface Consideration<C> {
  /** Nome curto que aparece no porquê (por exemplo "fome", "corajoso"). */
  name: string;
  input: (ctx: C) => number;
  curve: Curve;
}

export interface Option<C, A> {
  action: A;
  /** Nome da opção no porquê. */
  label: string;
  weight?: number;
  /** Opção só entra se disponível (por exemplo, pescar só com porto). */
  available?: (ctx: C) => boolean;
  considerations: Consideration<C>[];
}

export interface Scored<A> {
  action: A;
  label: string;
  score: number;
  /** Considerações em ordem de quanto pesaram (as mais baixas puxam mais a nota para baixo). */
  factors: { name: string; value: number }[];
}

export interface Choice<A> {
  pick: Scored<A>;
  /** As outras opções avaliadas, da melhor para a pior. */
  others: Scored<A>[];
}

/** Nota de uma opção: produto das considerações com a correção pelo número delas, vezes o peso. */
export function score<C, A>(opt: Option<C, A>, ctx: C): Scored<A> {
  let s = 1;
  const factors: { name: string; value: number }[] = [];
  const n = opt.considerations.length;
  const mod = n > 0 ? 1 - 1 / n : 0;
  for (const c of opt.considerations) {
    let v = cut(c.curve(c.input(ctx)));
    // Correção do IAUS: sem ela, opções com muitas considerações perdem só por ter mais fatores.
    v = v + (1 - v) * mod * v;
    factors.push({ name: c.name, value: v });
    s *= v;
    if (s === 0) break;
  }
  factors.sort((p, q) => p.value - q.value);
  return { action: opt.action, label: opt.label, score: s * (opt.weight ?? 1), factors };
}

/**
 * Escolhe uma opção: sorteio ponderado entre as que têm nota de pelo menos `band` da melhor
 * (pessoa paciente → band alto, decide quase sempre a melhor; impulsiva → band baixo, mais variada).
 */
export function choose<C, A>(options: Option<C, A>[], ctx: C, rnd: () => number, band = 0.7): Choice<A> | null {
  const scored: Scored<A>[] = [];
  for (const o of options) if (!o.available || o.available(ctx)) scored.push(score(o, ctx));
  if (!scored.length) return null;
  scored.sort((p, q) => q.score - p.score);
  const best = scored[0].score;
  if (best <= 0) return { pick: scored[0], others: scored.slice(1) };
  const pool = scored.filter((s) => s.score >= best * band);
  let total = 0;
  for (const s of pool) total += s.score;
  let r = rnd() * total;
  let pick = pool[0];
  for (const s of pool) {
    r -= s.score;
    if (r <= 0) {
      pick = s;
      break;
    }
  }
  return { pick, others: scored.filter((s) => s !== pick) };
}

/** Texto curto do porquê: "caçar (0,62): fome 0,9 · corajoso 0,8; depois coletar (0,41)". */
export function explain<A>(c: Choice<A>): string {
  const f = (n: number) => n.toFixed(2).replace('.', ',');
  const why = c.pick.factors
    .slice()
    .sort((p, q) => q.value - p.value)
    .slice(0, 3)
    .map((x) => `${x.name} ${f(x.value)}`)
    .join(' · ');
  const next = c.others.slice(0, 2).map((o) => `${o.label} (${f(o.score)})`).join(', ');
  return `${c.pick.label} (${f(c.pick.score)}): ${why}${next ? `; depois ${next}` : ''}`;
}
