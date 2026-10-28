import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/rng';
import { socialYear, type Resident, type SocialEvent } from '../decisions/social';
import { BOND, bondWith, countKind, partnerOf, type Bond } from '../relations';
import { randomTraits, TRAIT, TRAIT_COUNT } from '../traits';

/**
 * Laboratório da IA local, passo 2: duas pessoas, depois um grupo. Gente que combina vira amiga e casa;
 * gente que não combina e é agressiva vira rival e briga; num grupo, cada um tem alguns amigos.
 */

function world(n: number, setup: (t: Int8Array) => void = () => {}) {
  const traits = new Int8Array(n * TRAIT_COUNT);
  setup(traits);
  const bonds = new Map<number, Bond[]>();
  const people: Resident[] = Array.from({ length: n }, (_, i) => ({ i, uid: i + 1, adult: true }));
  return { traits, bonds, people };
}

function years(w: ReturnType<typeof world>, n: number, seed = 1): SocialEvent[] {
  const rnd = mulberry32(seed);
  const all: SocialEvent[] = [];
  for (let y = 0; y < n; y++) all.push(...socialYear(w.traits, w.bonds, w.people, rnd));
  return all;
}

const set = (t: Int8Array, i: number, v: Partial<Record<keyof typeof TRAIT, number>>) => {
  for (const [k, x] of Object.entries(v)) t[i * TRAIT_COUNT + TRAIT[k as keyof typeof TRAIT]] = x;
};

describe('IA local: um casal, depois um grupo', () => {
  it('duas pessoas gentis e parecidas ficam amigas e casam em poucos anos', () => {
    const w = world(2, (t) => {
      set(t, 0, { kindness: 7, sociability: 6, familism: 6, faith: 4 });
      set(t, 1, { kindness: 6, sociability: 5, familism: 7, faith: 5 });
    });
    const ev = years(w, 15);
    expect(ev.some((e) => e.text === 'amigos')).toBe(true);
    expect(partnerOf(w.bonds, 1)).toBe(2);
    expect(partnerOf(w.bonds, 2)).toBe(1);
  });

  it('duas pessoas agressivas e cruéis viram rivais e brigam', () => {
    const w = world(2, (t) => {
      set(t, 0, { aggression: 9, kindness: -7, sociability: 5, faith: 8 });
      set(t, 1, { aggression: 8, kindness: -8, sociability: -6, faith: -8 });
    });
    const ev = years(w, 15);
    expect(bondWith(w.bonds, 1, 2)?.kind).toBe(BOND.rival);
    expect(ev.some((e) => e.text === 'brigaram')).toBe(true);
    expect(partnerOf(w.bonds, 1)).toBe(0);
  });

  it('num grupo de 40 pessoas sorteadas, cada um tem uns poucos amigos, há casais e poucos rivais', () => {
    const rnd = mulberry32(4);
    const w = world(40, (t) => {
      for (let i = 0; i < 40; i++) randomTraits(t, i, rnd);
    });
    years(w, 30, 2);
    let friends = 0;
    let rivals = 0;
    let married = 0;
    for (const p of w.people) {
      friends += countKind(w.bonds, p.uid, BOND.friend);
      rivals += countKind(w.bonds, p.uid, BOND.rival);
      if (partnerOf(w.bonds, p.uid)) married++;
    }
    expect(friends / 40).toBeGreaterThan(1);
    expect(friends / 40).toBeLessThan(8);
    expect(rivals / 40).toBeLessThan(friends / 40);
    expect(rivals).toBeGreaterThan(0);
    expect(married / 40).toBeGreaterThan(0.3);
    // Ninguém passa do limite de laços.
    for (const p of w.people) expect((w.bonds.get(p.uid) ?? []).length).toBeLessThanOrEqual(12);
  });

  it('o sociável conhece mais gente que o solitário', () => {
    const w = world(30, (t) => {
      set(t, 0, { sociability: 10 });
      set(t, 1, { sociability: -10 });
    });
    years(w, 5, 3);
    expect((w.bonds.get(1) ?? []).length).toBeGreaterThan((w.bonds.get(2) ?? []).length);
  });
});
