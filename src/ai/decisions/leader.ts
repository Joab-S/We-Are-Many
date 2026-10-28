/**
 * Quem lidera (IA local, "Líderes e reis"): quando o lugar fica sem líder, o povo escolhe entre os adultos
 * pelo carisma, pela ambição (quem quer se candidata), pela idade e pelos amigos; num reino, o herdeiro do
 * rei morto (filho ou cônjuge) leva vantagem grande. O temperamento do líder pesa nas decisões de guerra.
 */
import { LEADER } from '../tuning';
import { TRAIT, TRAIT_COUNT, TRAIT_INFO, type Trait } from '../traits';
import { choose, curves, type Choice, type Option } from '../utility';

export interface Candidate {
  i: number;
  /** Na idade boa para liderar (adulto e ainda não idoso). */
  prime: boolean;
  /** Amigos no lugar. */
  friends: number;
  /** Filho ou cônjuge do líder anterior. */
  heir: boolean;
}

export interface LeaderContext {
  traits: Int8Array;
  /** Reino com rei: o herdeiro conta muito mais. */
  crown: boolean;
}

const t = (traits: Int8Array, i: number, k: Trait) => traits[i * TRAIT_COUNT + TRAIT[k]] / 10;

function option(c: Candidate): Option<LeaderContext, number> {
  return {
    action: c.i,
    label: String(c.i),
    considerations: [
      { name: 'carisma', input: (x) => t(x.traits, c.i, 'charisma'), curve: curves.trait(LEADER.charisma) },
      { name: 'ambição', input: (x) => t(x.traits, c.i, 'ambition'), curve: curves.trait(LEADER.ambition) },
      { name: 'idade', input: () => (c.prime ? 1 : 0), curve: curves.linear(LEADER.oldAge, 1) },
      { name: 'amigos', input: () => c.friends / LEADER.friendsFull, curve: curves.linear(LEADER.noFriends, 1) },
      { name: 'herdeiro', input: (x) => (c.heir ? 1 : x.crown ? 0 : 0.5), curve: curves.linear(LEADER.commoner, 1) },
    ],
  };
}

/** Escolhe o líder entre os candidatos; o povo quase sempre fica com um dos melhores. */
export function chooseLeader(ctx: LeaderContext, cands: Candidate[], rnd: () => number): Choice<number> | null {
  return choose(cands.map(option), ctx, rnd, LEADER.band);
}

/** Porquê da escolha, para o diário e a crônica: "carismático e com muitos amigos". */
export function leaderReason(traits: Int8Array, c: Candidate, crown: boolean): string {
  if (c.heir && crown) return 'herdou a coroa';
  const parts: string[] = [];
  if (t(traits, c.i, 'charisma') >= 0.4) parts.push(TRAIT_INFO.charisma.high);
  if (t(traits, c.i, 'ambition') >= 0.4) parts.push(TRAIT_INFO.ambition.high);
  if (c.friends >= LEADER.friendsFull) parts.push('com muitos amigos');
  if (c.heir) parts.push('da família do líder');
  if (!parts.length) parts.push('o povo confiou');
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}` : parts[0];
}

/** Temperamento do líder para a guerra, de −1 (pacífico) a 1 (belicoso): agressividade e ambição contra gentileza e paciência. */
export function rulerTemper(traits: Int8Array, i: number): number {
  const v = LEADER.aggression * t(traits, i, 'aggression') + LEADER.ambitionWar * t(traits, i, 'ambition') - LEADER.kindness * t(traits, i, 'kindness') - LEADER.patience * t(traits, i, 'patience');
  return Math.max(-1, Math.min(1, v));
}
