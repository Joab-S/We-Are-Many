/**
 * Observador: a pessoa por dentro. Para qualquer decisão, responde "por que ela fez isso e de onde veio essa ideia":
 * as opções geradas agora (verbo + coisa) com a conta de cada uma, as necessidades, as crenças com a origem, as
 * lentes, os hábitos e a linha do tempo do esperado contra o real. Só lê o mundo, e devolve dado puro (serve à
 * ficha, ao painel e ao JSON exportado).
 */
import type { Ecosystem } from '../ecosystem';
import { NEC, type PessoaGen } from '../generativa/tipos';
import { NOME_DA_NEC, nomeDaCrenca, nomeDaLente, nomeDaOrigem, nomeDaTag, nomeDoAto, nomeDoEfeito, nomeDoHabito } from './nomes';
import { pessoasGen } from './retrato';

export interface OpcaoDebug {
  /** "comer o que dá para comer", montado do verbo e da tag. */
  nome: string;
  alvo: string;
  dist: number;
  x: number;
  y: number;
  /** A nota do IAUS (0 quando ficou fora do corte ou foi cortada cedo). */
  nota: number;
  /** As considerações do IAUS, uma barra cada (benefício, confiança, custo, risco, variar, jeito). */
  fatores: { nome: string; valor: number }[];
  beneficio: number;
  /** O benefício aberto por necessidade (urgência × alívio esperado), a parte das lentes e a do que vem adiante. */
  porNec: { nome: string; valor: number }[];
  lente: number;
  adiante: number;
  /** O que ela espera conseguir em seguida ("comer o que dá para comer"), quando encadeia. */
  cadeia: string;
  confianca: number;
  custo: number;
  risco: number;
  habito: boolean;
  cortada: boolean;
  escolhida: boolean;
}

export interface MenteDebug {
  uid: number;
  x: number;
  y: number;
  idade: number;
  /** O que faz agora, ou '' quando está parada. */
  agora: string;
  necessidades: { nome: string; valor: number; urgencia: number }[];
  corpo: { mao: string; gravida: boolean; colo: number; ferida: number; desejo: number; seguidores: number; segue: number; filhos: number };
  opcoes: OpcaoDebug[];
  crencas: { chave: string; nome: string; efeito: string; e: number[]; confianca: number; origem: string; tipo: string; de: number; em: number; vezes: number; depois: string[] }[];
  lentes: { chave: string; texto: string; forca: number; origem: string; em: number; de: number }[];
  habitos: { texto: string; vezes: number; efeito: string; origem: string; em: number }[];
  linha: { ano: number; nome: string; esperado: number; real: number; fim: string; surpresa: boolean }[];
  lugares: { x: number; y: number; bem: number; tags: string[]; de: number }[];
  /** O que percebe agora (para desenhar no mundo): onde, a que distância e as tags. */
  percebe: { tipo: string; x: number; y: number; dist: number; tags: string[] }[];
  vista: number;
  /** O alvo de agora e a necessidade que o ato mais atende (para a linha colorida no mundo). */
  alvo: { x: number; y: number; nec: string } | null;
}

const origem = (eco: Ecosystem) => (uid: number) => {
  const j = eco.indexOfUid(uid);
  return j >= 0 && eco.alive[j] ? `#${uid}` : `#${uid} (já morreu)`;
};

/** A mente da pessoa `i` para o debug, ou null se ela não pensa pelo modelo generativo. */
/**
 * Só o que a pessoa do modelo generativo faz agora, em palavras (a ficha e a prévia do mouse, a cada quadro, sem a
 * conta inteira de `menteDebug`). Null se ela não pensa pelo modelo generativo; '' se está parada, pensando.
 */
export function agoraDe(eco: Ecosystem, i: number): string | null {
  if (!eco.gen || !eco.alive[i] || !eco.gen.pessoas.has(eco.uid[i])) return null;
  const ato = eco.genMenteDe(i)?.ato;
  return ato ? (ato.op.habito ? nomeDoHabito(ato.op.habito) : nomeDoAto(ato.op.chave)) : '';
}

export function menteDebug(eco: Ecosystem, i: number): MenteDebug | null {
  const p: PessoaGen | undefined = eco.gen?.pessoas.get(eco.uid[i]);
  if (!eco.gen || !p || !eco.alive[i]) return null;
  const m = eco.genMenteDe(i);
  const quem = origem(eco);
  const cur = m?.brain.currentDecision ?? null;
  const notas = new Map<string, { nota: number; fatores: { nome: string; valor: number }[] }>();
  if (m) for (const d of m.brain.decisions) {
    const e = m.brain.explain(d);
    notas.set(d.key, { nota: e.score, fatores: e.factors.map((f) => ({ nome: f.name, valor: f.score })) });
  }
  const opcoes: OpcaoDebug[] = (m?.opcoes ?? []).map((o) => {
    const id = o.habito ? 9500 + o.habito.id : o.behavior?.id ?? -1;
    const key = `${id}:${o.a.id}`;
    const n = o.cortada ? undefined : notas.get(key);
    return {
      nome: o.habito ? nomeDoHabito(o.habito) : nomeDoAto(o.chave),
      alvo: o.a.tipo,
      dist: o.a.dist,
      x: o.a.x,
      y: o.a.y,
      nota: n?.nota ?? 0,
      fatores: n?.fatores ?? [],
      beneficio: o.beneficio,
      porNec: NEC.map((nec, k) => ({ nome: NOME_DA_NEC[nec], valor: o.porNec[k] })).filter((x) => Math.abs(x.valor) >= 0.005).sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)),
      lente: o.lente,
      adiante: o.adiante,
      cadeia: o.cadeia ? (o.habito ? o.cadeia.split(' → ').map(nomeDoAto).join(' → ') : o.cadeia.includes(' ') ? o.cadeia : nomeDaTag(o.cadeia)) : '',
      confianca: o.conf,
      custo: o.custo,
      risco: o.risco,
      habito: !!o.habito,
      cortada: o.cortada,
      escolhida: !!cur && cur.key === key,
    };
  });
  opcoes.sort((a, b) => Number(b.escolhida) - Number(a.escolhida) || Number(a.cortada) - Number(b.cortada) || b.nota - a.nota || b.beneficio - a.beneficio);
  const u = m?.u ?? p.nec.map(() => 0);
  let alvo: MenteDebug['alvo'] = null;
  const ato = m?.ato;
  if (ato) {
    let melhor = 0;
    let nec = '';
    ato.op.porNec.forEach((x, k) => {
      if (x > melhor) {
        melhor = x;
        nec = NEC[k];
      }
    });
    alvo = { x: ato.op.a.x, y: ato.op.a.y, nec };
  }
  return {
    uid: eco.uid[i],
    x: eco.x[i],
    y: eco.y[i],
    idade: eco.age[i],
    agora: agoraDe(eco, i) ?? '',
    necessidades: NEC.map((n, k) => ({ nome: NOME_DA_NEC[n], valor: p.nec[k], urgencia: u[k] })),
    corpo: { mao: p.mao ? `${p.mao.que} (${p.mao.q.toFixed(0)})` : '', gravida: p.gravida > 0, colo: p.colo, ferida: p.ferida, desejo: p.desejo, seguidores: p.seguidores, segue: p.segue, filhos: p.filhos.length },
    opcoes,
    crencas: Object.entries(p.crencas)
      .map(([chave, c]) => ({ chave, nome: nomeDaCrenca(chave, c), efeito: nomeDoEfeito(c.e), e: c.e.slice(), confianca: c.c, origem: nomeDaOrigem(c.o, quem), tipo: c.o.tipo, de: c.o.de, em: c.o.em, vezes: c.n, depois: Object.entries(c.g ?? {}).filter(([, w]) => w >= 0.3).map(([k]) => (k.startsWith('mao:') ? `fica com ${nomeDaTag(k.slice(4))} na mão` : `passa a ver ${nomeDaTag(k.slice(4))}`)) }))
      .sort((a, b) => b.confianca - a.confianca || (a.chave < b.chave ? -1 : 1)),
    lentes: p.lentes.map((l) => ({ chave: `lente:${l.v}|${l.c}`, texto: nomeDaLente(l), forca: l.f, origem: nomeDaOrigem(l.o, quem), em: l.o.em, de: l.o.de })).sort((a, b) => b.forca - a.forca),
    habitos: p.habitos.map((h) => ({ texto: nomeDoHabito(h), vezes: h.n, efeito: nomeDoEfeito(h.e), origem: nomeDaOrigem(h.o, quem), em: h.o.em })),
    linha: p.linha.map((r) => ({ ano: r.em, nome: r.chave.includes('>') ? r.chave.split('>').map(nomeDoAto).join(' → ') : nomeDoAto(r.chave), esperado: r.esperado, real: r.real, fim: r.fim, surpresa: r.surpresa })),
    lugares: p.lugares.map((l) => ({ x: l.x, y: l.y, bem: l.bem, tags: Object.keys(l.tags).map(nomeDaTag), de: l.de })),
    percebe: (m?.perceptos ?? []).map((a) => ({ tipo: a.tipo, x: a.x, y: a.y, dist: a.dist, tags: Object.entries(a.tags).filter(([, w]) => w >= 0.1).map(([t]) => nomeDaTag(t)) })),
    vista: (m?.perceptos ?? []).reduce((r, a) => (a.tipo === 'lugar' ? r : Math.max(r, a.dist)), 0),
    alvo,
  };
}

/** O estado inteiro do modelo generativo em JSON (crenças, lentes, hábitos e as últimas decisões de cada um), para analisar fora do jogo. */
export function exportarMundo(eco: Ecosystem, so?: number[]): { ano: number; pessoas: MenteDebug[]; coisas: unknown[]; conta: unknown } {
  const quem = pessoasGen(eco).filter(({ uid }) => !so || so.includes(uid));
  return {
    ano: eco.year,
    pessoas: quem.map(({ i }) => menteDebug(eco, i)).filter((x): x is MenteDebug => !!x),
    coisas: (eco.gen?.coisas ?? []).map((c) => ({ ...c, m: { ...c.m } })),
    conta: eco.gen ? { ...eco.gen.conta } : null,
  };
}
