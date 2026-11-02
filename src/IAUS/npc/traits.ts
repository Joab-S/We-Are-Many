/**
 * Traços de personalidade (IA local das pessoas, docs da proposta): 16 traços de −10 a +10 por pessoa,
 * guardados num Int8Array (TRAIT_COUNT por pessoa). A maioria fica perto de 0; só os marcantes
 * aparecem no painel. Filhos herdam a média dos pais com um pouco da cultura e um sorteio.
 */

export const TRAITS = [
  'courage',
  'ambition',
  'diligence',
  'sociability',
  'kindness',
  'curiosity',
  'attachment',
  'greed',
  'patience',
  'faith',
  'loyalty',
  'familism',
  'aggression',
  'charisma',
  'dexterity',
  'strength',
] as const;
export type Trait = (typeof TRAITS)[number];
export const TRAIT_COUNT = TRAITS.length;
export const TRAIT = Object.fromEntries(TRAITS.map((t, k) => [t, k])) as Record<Trait, number>;

/** Nome do traço e de cada ponta, para o painel. */
export const TRAIT_INFO: Record<Trait, { name: string; high: string; low: string; icon: string }> = {
  courage: { name: 'Coragem', high: 'corajoso', low: 'medroso', icon: '🦁' },
  ambition: { name: 'Ambição', high: 'ambicioso', low: 'contente', icon: '👑' },
  diligence: { name: 'Diligência', high: 'trabalhador', low: 'preguiçoso', icon: '🔨' },
  sociability: { name: 'Sociabilidade', high: 'sociável', low: 'solitário', icon: '🗣️' },
  kindness: { name: 'Gentileza', high: 'gentil', low: 'cruel', icon: '🤝' },
  curiosity: { name: 'Curiosidade', high: 'curioso', low: 'tradicional', icon: '💡' },
  attachment: { name: 'Apego', high: 'caseiro', low: 'nômade', icon: '🏠' },
  greed: { name: 'Ganância', high: 'ganancioso', low: 'generoso', icon: '💰' },
  patience: { name: 'Paciência', high: 'paciente', low: 'impulsivo', icon: '⏳' },
  faith: { name: 'Fé', high: 'devoto', low: 'cético', icon: '🙏' },
  loyalty: { name: 'Lealdade', high: 'leal', low: 'rebelde', icon: '🛡️' },
  familism: { name: 'Família', high: 'familiar', low: 'independente', icon: '👪' },
  aggression: { name: 'Agressividade', high: 'agressivo', low: 'pacífico', icon: '⚔️' },
  charisma: { name: 'Carisma', high: 'carismático', low: 'apagado', icon: '✨' },
  dexterity: { name: 'Habilidade', high: 'habilidoso', low: 'desajeitado', icon: '🧵' },
  strength: { name: 'Força', high: 'forte', low: 'fraco', icon: '💪' },
};

/** Viés da cultura do povo em alguns traços (o valor da cultura: guerra, comércio, fé ou conhecimento). */
export const CULTURE_BIAS: Record<string, Partial<Record<Trait, number>>> = {
  guerra: { courage: 2, aggression: 2, loyalty: 1 },
  comércio: { greed: 2, sociability: 1, ambition: 1 },
  fé: { faith: 3, loyalty: 1, patience: 1 },
  conhecimento: { curiosity: 3, patience: 1 },
};

const clamp = (n: number) => Math.max(-10, Math.min(10, Math.round(n)));
/**
 * Espalhamento dos traços: desvio de 4 pontos, então cada pessoa tem uns 3 traços marcantes (|v| ≥ 5) de 16
 * e uns 5% dos traços são extremos (|v| ≥ 8). Nos filhos, HERITAGE da média dos pais mais um sorteio
 * que repõe a variedade (sem ele o povo ficaria igual em poucas gerações).
 */
const SPREAD = 12;
const HERITAGE = 0.7;
const CHILD_SPREAD = 10;

/** Sorteio em sino de −1 a 1 (soma de três uniformes, desvio de 1/3). */
const bell = (rnd: () => number) => (rnd() + rnd() + rnd() - 1.5) / 1.5;

/** Traços de quem chega sem pais conhecidos: sorteio em sino com o viés da cultura. */
export function randomTraits(out: Int8Array, at: number, rnd: () => number, culture?: string): void {
  const bias = (culture && CULTURE_BIAS[culture]) || {};
  for (let k = 0; k < TRAIT_COUNT; k++) out[at * TRAIT_COUNT + k] = clamp(bell(rnd) * SPREAD + (bias[TRAITS[k]] ?? 0));
}

/**
 * Traços de um filho: a média dos pais (o outro pai pode faltar), puxada um pouco para o meio,
 * mais um sorteio e um pouco da cultura. Os filhos lembram os pais sem ser cópia.
 */
export function inheritTraits(out: Int8Array, child: number, a: number, b: number, rnd: () => number, culture?: string): void {
  const bias = (culture && CULTURE_BIAS[culture]) || {};
  for (let k = 0; k < TRAIT_COUNT; k++) {
    const pa = out[a * TRAIT_COUNT + k];
    const pb = b >= 0 ? out[b * TRAIT_COUNT + k] : pa;
    out[child * TRAIT_COUNT + k] = clamp(((pa + pb) / 2) * HERITAGE + bell(rnd) * CHILD_SPREAD + (bias[TRAITS[k]] ?? 0) * 0.5);
  }
}

/** Valor de um traço de −1 a 1. */
export function trait(traits: Int8Array, i: number, t: Trait): number {
  return traits[i * TRAIT_COUNT + TRAIT[t]] / 10;
}

/** Os traços mais marcantes (|valor| ≥ 5), do mais forte para o mais fraco. */
export function notable(traits: Int8Array, i: number, max = 4): { trait: Trait; value: number; label: string; icon: string }[] {
  const out: { trait: Trait; value: number; label: string; icon: string }[] = [];
  for (let k = 0; k < TRAIT_COUNT; k++) {
    const value = traits[i * TRAIT_COUNT + k];
    if (Math.abs(value) < 5) continue;
    const t = TRAITS[k];
    const info = TRAIT_INFO[t];
    out.push({ trait: t, value, label: `${Math.abs(value) >= 8 ? 'muito ' : ''}${value > 0 ? info.high : info.low}`, icon: info.icon });
  }
  return out.sort((p, q) => Math.abs(q.value) - Math.abs(p.value)).slice(0, max);
}

/**
 * Compatibilidade de duas pessoas, de −1 (brigam) a 1 (se dão muito bem): parecidos na sociabilidade,
 * na fé e no apego combinam; gentileza ajuda sempre; agressividade de um com a crueldade do outro atrapalha.
 */
export function compatibility(traits: Int8Array, a: number, b: number): number {
  const v = (i: number, t: Trait) => traits[i * TRAIT_COUNT + TRAIT[t]] / 10;
  const like = (t: Trait) => 1 - Math.abs(v(a, t) - v(b, t));
  const similar = (like('sociability') + like('faith') + like('attachment') + like('curiosity')) / 4;
  const warmth = (v(a, 'kindness') + v(b, 'kindness')) / 2;
  const friction = (Math.max(0, v(a, 'aggression')) + Math.max(0, v(b, 'aggression'))) / 2;
  return Math.max(-1, Math.min(1, (similar - 0.5) * 1.2 + warmth * 0.5 - friction * 0.6));
}
