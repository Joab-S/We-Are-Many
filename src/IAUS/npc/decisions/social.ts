/**
 * Vida social de um ano (IA local): encontros, amizade, rivalidade, namoro e casamento, e brigas.
 * Funções puras sobre os traços e os laços; o Ecosystem só diz quem mora junto e anota o que aconteceu.
 */
import { BOND, bondWith, partnerOf, touch, type Bond } from '../relations';
import { compatibility, TRAIT, TRAIT_COUNT, type Trait } from '../traits';
import { SOCIAL } from '../tuning';

export interface SocialEvent {
  kind: 'amizade' | 'briga' | 'família';
  a: number;
  b: number;
  text: 'amigos' | 'rivais' | 'casaram' | 'brigaram';
}

export interface Resident {
  /** Índice no array de traços. */
  i: number;
  uid: number;
  /** Pode casar (adulto, não idoso). */
  adult: boolean;
}

const t = (traits: Int8Array, i: number, k: Trait) => traits[i * TRAIT_COUNT + TRAIT[k]] / 10;

/**
 * Um ano de vida social num lugar: cada um encontra alguns vizinhos (mais se for sociável); o laço
 * sobe com a compatibilidade e a gentileza, desce com a agressividade; amizade e rivalidade aparecem
 * nos extremos; amigos muito próximos e sem par casam; rivais agressivos brigam.
 */
export function socialYear(traits: Int8Array, bonds: Map<number, Bond[]>, people: Resident[], rnd: () => number): SocialEvent[] {
  const events: SocialEvent[] = [];
  const n = people.length;
  if (n < 2) return events;
  const byUid = new Map(people.map((p) => [p.uid, p]));
  // Os laços esfriam: quem não se vê esquece aos poucos (os de quem mora junto voltam a subir nos encontros).
  for (const p of people) {
    const list = bonds.get(p.uid);
    if (!list) continue;
    for (let k = list.length - 1; k >= 0; k--) {
      const b = list[k];
      if (b.kind === BOND.partner) continue;
      b.value *= SOCIAL.fade;
      if (Math.abs(b.value) < SOCIAL.forget) list.splice(k, 1);
      else if (b.kind === BOND.friend && b.value < SOCIAL.friend * 0.6) b.kind = BOND.acquaintance;
      else if (b.kind === BOND.rival && b.value > SOCIAL.rival * 0.6) b.kind = BOND.acquaintance;
    }
  }
  for (const p of people) {
    const meets = 1 + Math.round(SOCIAL.meets * (1 + t(traits, p.i, 'sociability')));
    for (let m = 0; m < meets; m++) {
      // Encontro: quase sempre com quem já conhece (de dois sorteados, o mais querido: amigos se procuram),
      // às vezes com alguém novo do lugar.
      const known = bonds.get(p.uid);
      let q: Resident | undefined;
      if (known?.length && rnd() < SOCIAL.familiar) {
        const x = known[Math.floor(rnd() * known.length)];
        const y = known[Math.floor(rnd() * known.length)];
        q = byUid.get((x.value >= y.value ? x : y).uid);
      }
      if (!q) q = people[Math.floor(rnd() * n)];
      if (!q || q.uid === p.uid) continue;
      const c = compatibility(traits, p.i, q.i);
      const mood = (i: number) => SOCIAL.kind * t(traits, i, 'kindness') - SOCIAL.mean * Math.max(0, t(traits, i, 'aggression'));
      const delta = SOCIAL.meet * (c + SOCIAL.warmth) + mood(p.i) + mood(q.i) + (rnd() - 0.5) * SOCIAL.noise;
      for (const [a, b] of [
        [p, q],
        [q, p],
      ] as const) {
        const bond = touch(bonds, a.uid, b.uid);
        bond.value = Math.max(-100, Math.min(100, bond.value + delta));
        if (bond.kind === BOND.acquaintance && bond.value >= SOCIAL.friend) {
          bond.kind = BOND.friend;
          if (a === p) events.push({ kind: 'amizade', a: p.uid, b: q.uid, text: 'amigos' });
        } else if (bond.kind === BOND.acquaintance && bond.value <= SOCIAL.rival) {
          bond.kind = BOND.rival;
          if (a === p) events.push({ kind: 'briga', a: p.uid, b: q.uid, text: 'rivais' });
        }
      }
      // Rivais agressivos brigam (o painel e o diário contam; o Ecosystem tira um pouco da energia).
      const ab = bondWith(bonds, p.uid, q.uid);
      if (ab?.kind === BOND.rival && rnd() < SOCIAL.fight * Math.max(0, t(traits, p.i, 'aggression') + t(traits, q.i, 'aggression'))) {
        events.push({ kind: 'briga', a: p.uid, b: q.uid, text: 'brigaram' });
      }
    }
  }
  // Casamento: amigos muito próximos, os dois adultos e sem par. Quem valoriza a família casa antes.
  for (const p of people) {
    if (!p.adult || partnerOf(bonds, p.uid)) continue;
    let best: Bond | null = null;
    for (const b of bonds.get(p.uid) ?? []) if (b.kind === BOND.friend && b.value >= SOCIAL.love && (!best || b.value > best.value)) best = b;
    if (!best) continue;
    const q = byUid.get(best.uid);
    if (!q || !q.adult || partnerOf(bonds, q.uid)) continue;
    const back = bondWith(bonds, q.uid, p.uid);
    if (!back || back.value < SOCIAL.love) continue;
    const will = SOCIAL.marry * (1 + 0.5 * (t(traits, p.i, 'familism') + t(traits, q.i, 'familism')));
    if (rnd() >= will) continue;
    best.kind = BOND.partner;
    back.kind = BOND.partner;
    events.push({ kind: 'família', a: p.uid, b: q.uid, text: 'casaram' });
  }
  return events;
}
