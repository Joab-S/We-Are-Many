/**
 * Observador: as palavras. Tudo o que aparece na tela e no debug sobre crenças, lentes e hábitos é montado aqui,
 * na hora de mostrar, a partir do conteúdo (o verbo, a tag, o efeito). A simulação não guarda nome nenhum e não
 * pode importar este módulo (src/sim/observador/fronteira.test.ts confere pelos imports).
 */
import { NEC, type Crenca, type Habito, type Lente, type Nec, type Origem } from '../generativa/tipos';

export const NOME_DA_NEC: Record<Nec, string> = {
  fome: 'a fome',
  sede: 'a sede',
  sono: 'o sono',
  cansaco: 'o cansaço',
  frio: 'o frio',
  calor: 'o calor',
  dor: 'a dor',
  medo: 'o medo',
  solidao: 'a solidão',
  tedio: 'o tédio',
  apego: 'o apego',
  respeito: 'a falta de respeito',
  sentido: 'a falta de sentido',
};

const TAG: Record<string, string> = {
  comivel: 'o que dá para comer',
  agua: 'água',
  chao: 'o chão',
  perigoso: 'bicho bravo',
  gente: 'gente',
  parceiro: 'um par',
  filho: 'o filho',
  bebe: 'um bebê',
  crianca: 'uma criança',
  parente: 'um parente',
  desconhecido: 'o desconhecido',
  estranho: 'um estranho',
  amigo: 'um amigo',
  desafeto: 'um desafeto',
  carregaComida: 'quem carrega comida',
  armado: 'quem tem lasca na mão',
  forte: 'alguém mais forte',
  fraco: 'alguém mais fraco',
  ferido: 'um ferido',
  comFome: 'quem tem fome',
  seguido: 'quem é seguido por muitos',
  dormindo: 'quem dorme',
  madeira: 'árvore',
  galho: 'galho',
  sombra: 'sombra',
  pedra: 'pedra',
  lasca: 'lasca',
  semente: 'semente',
  tronco: 'tronco',
  carne: 'carne',
  peixe: 'peixe',
  alto: 'um lugar alto',
  monte: 'um monte de coisas',
  guardado: 'comida guardada',
  abrigo: 'abrigo',
  fogo: 'fogo',
  quente: 'calor de fogo',
  luz: 'luz',
  broto: 'broto',
  planta: 'planta que alguém pôs',
  meu: 'o que é meu',
  deOutro: 'o que é de outro',
  naMao: 'o que tenho na mão',
  animal: 'bicho',
  fugidio: 'bicho que foge',
  morto: 'bicho morto',
  lembrado: 'um lugar de que lembro',
  bom: 'um lugar onde vivi bem',
  noite: 'a noite',
  sozinho: 'estar sozinho',
};

export const nomeDaTag = (t: string): string => TAG[t] ?? t;

/** A preposição que cada verbo pede antes da coisa ("andar até", "falar com", "fugir de"). */
const PREP: Record<string, string> = {
  andar: 'até',
  falar: 'com',
  acasalar: 'com',
  fugir: 'de',
  cuidar: 'de',
  bater: 'em',
  dormir: 'em',
  descansar: 'em',
  pedir: 'a',
  mostrar: 'a',
  olhar: 'para',
};

/** Junta a preposição com o artigo da coisa: "em" + "o chão" = "no chão", "de" + "um bebê" = "de um bebê". */
function contrai(prep: string, coisa: string): string {
  const m = /^(o|a|um|uma) (.*)$/.exec(coisa);
  if (!m) return `${prep} ${coisa}`;
  const [, art, resto] = m;
  const juntos: Record<string, Record<string, string>> = {
    em: { o: 'no', a: 'na', um: 'num', uma: 'numa' },
    de: { o: 'do', a: 'da', um: 'de um', uma: 'de uma' },
    a: { o: 'ao', a: 'à', um: 'a um', uma: 'a uma' },
  };
  return `${juntos[prep]?.[art] ?? `${prep} ${art}`} ${resto}`;
}

/** "comer o que dá para comer", "andar até água", "dormir no chão", "largar semente". */
export function nomeDoAto(chave: string): string {
  const [v, t] = chave.split('|');
  if (!t) return v;
  if (v === 'cavar') return 'cavar o chão';
  if (v === 'abrigar') return `abrigar-se ${contrai('em', nomeDaTag(t))}`;
  const prep = PREP[v];
  return prep ? `${v} ${contrai(prep, nomeDaTag(t))}` : `${v} ${nomeDaTag(t)}`;
}

/** O efeito por extenso: "alivia a fome e o medo", "aumenta a dor". Só o que pesa. */
export function nomeDoEfeito(e: readonly number[], piso = 0.04): string {
  const bom: string[] = [];
  const ruim: string[] = [];
  const ordem = NEC.map((n, k) => ({ n, x: e[k] })).sort((a, b) => Math.abs(b.x) - Math.abs(a.x));
  for (const { n, x } of ordem) {
    if (x <= -piso && bom.length < 3) bom.push(NOME_DA_NEC[n]);
    else if (x >= piso && ruim.length < 2) ruim.push(NOME_DA_NEC[n]);
  }
  const junta = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}` : l[0]);
  const partes: string[] = [];
  if (bom.length) partes.push(`alivia ${junta(bom)}`);
  if (ruim.length) partes.push(`aumenta ${junta(ruim)}`);
  return partes.join(', mas ') || 'não muda nada';
}

export function nomeDaOrigem(o: Origem, quem: (uid: number) => string = (u) => `#${u}`): string {
  switch (o.tipo) {
    case 'instinto':
      return 'de nascença';
    case 'vivido':
      return o.de ? `vivido (antes, de ${quem(o.de)})` : 'vivido';
    case 'visto':
      return `visto em ${quem(o.de)}`;
    case 'ouvido':
      return `ouvido de ${quem(o.de)}`;
    case 'herdado':
      return `herdado de ${quem(o.de)}`;
  }
}

export function nomeDaCrenca(chave: string, c: Crenca): string {
  return `${nomeDoAto(chave)}: ${nomeDoEfeito(c.e)}`;
}

/** "com gente por perto, dormir alivia mais o medo". */
export function nomeDaLente(l: Lente): string {
  const melhor = l.d.reduce((s, x) => s - x, 0) >= 0;
  const ordem = NEC.map((n, k) => ({ n, x: l.d[k] })).sort((a, b) => Math.abs(b.x) - Math.abs(a.x))[0];
  const oque = ordem && Math.abs(ordem.x) > 0.01 ? (ordem.x < 0 ? `alivia mais ${NOME_DA_NEC[ordem.n]}` : `pesa mais em ${NOME_DA_NEC[ordem.n].replace(/^a |^o /, '')}`) : melhor ? 'vale mais' : 'vale menos';
  return `com ${nomeDaTag(l.c)} por perto, ${l.v} ${oque}`;
}

/** "pegar pedra → bater pedra → cortar árvore". */
export function nomeDoHabito(h: Habito): string {
  return h.passos.map(nomeDoAto).join(' → ');
}
