/**
 * Pessoas e bichos como indivíduos (REQUISITOS-VIDA.md, 19.17): nome próprio
 * e de família no estilo do povo, fase da vida dos animais, causas de morte
 * e o registro do ano de cada assentamento (nascimentos, mortes, chegadas).
 *
 * Os nomes saem de um hash do número da pessoa, sem tocar nos sorteios da
 * simulação: o mesmo mundo dá os mesmos nomes, e a calibração não muda.
 */

const SOUNDS = ['ka', 'lo', 'mi', 'ru', 'ze', 'ta', 'vo', 'ni', 'sha', 'qua', 'dre', 'xi', 'po', 'lu', 'en', 'or', 'ba', 'tek', 'il', 'ma', 'so', 'ga', 'yu', 'fe', 'ar', 'no', 'th', 'ki', 'da', 'ur'];
const ENDINGS = ['', '', 'n', 'r', 'k', 's', 'l', 'm'];

/** Hash inteiro de 32 bits (mulberry32 de um passo). */
function hash(a: number): number {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (t ^ (t >>> 14)) >>> 0;
}

/** Os 10 sons preferidos de um povo: cada povo soa de um jeito. */
function soundsOf(culture: number): string[] {
  const out: string[] = [];
  for (let k = 0; out.length < 10 && k < 64; k++) {
    const s = SOUNDS[hash(culture * 977 + k) % SOUNDS.length];
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

function word(seed: number, culture: number, parts: number): string {
  const sounds = soundsOf(culture);
  let s = '';
  for (let k = 0; k < parts; k++) s += sounds[hash(seed * 31 + k) % sounds.length];
  s += ENDINGS[hash(seed * 7 + 3) % ENDINGS.length];
  return s[0].toUpperCase() + s.slice(1);
}

/** Nome próprio de uma pessoa (RF-VIDA-334). */
export function personName(uid: number, culture: number): string {
  return word(uid * 2 + 1, culture, 2);
}

/** Sobrenome de família, passado de pais para filhos (RF-VIDA-296). */
export function familyName(family: number, culture: number): string {
  return word(family * 2 + 7919, culture, 2 + (hash(family) % 2));
}

/** Fase da vida de um animal (RF-VIDA-334). */
export function animalStage(age: number, maturity: number, maxAge: number): string {
  if (age < maturity) return 'filhote';
  return age > maxAge * 0.75 ? 'velho' : 'adulto';
}

/** Como alguém deixou o assentamento: morte (com a causa) ou partida. */
export const DEATH_CAUSES = ['velhice', 'fome', 'frio', 'doença', 'guerra', 'predador', 'desastre', 'jogador', 'outra'] as const;
export type DeathCause = (typeof DEATH_CAUSES)[number];
/** `partiu` não é morte: embarcou, foi para a guerra por mar ou virou colono. */
export type Exit = DeathCause | 'partiu';

export const DEATH_TEXT: Record<DeathCause, string> = {
  velhice: 'de velhice',
  fome: 'de fome',
  frio: 'de frio',
  doença: 'de doença',
  guerra: 'em combate',
  predador: 'atacado por um predador',
  desastre: 'num desastre',
  jogador: 'pela sua mão',
  outra: '',
};

/** Movimento de gente num ano (aba Pessoas, RF-VIDA-343). */
export interface Vital {
  births: number;
  deaths: Partial<Record<DeathCause, number>>;
  arrived: number;
  left: number;
}

export function emptyVital(): Vital {
  return { births: 0, deaths: {}, arrived: 0, left: 0 };
}

/** Uma amostra por ano para os gráficos da aba História (RF-VIDA-347). */
export interface Sample {
  year: number;
  population: number;
  /** Soma do estoque guardado (comida e bens). */
  stock: number;
}

/** Anos guardados nos gráficos. */
export const HISTORY_YEARS = 120;
