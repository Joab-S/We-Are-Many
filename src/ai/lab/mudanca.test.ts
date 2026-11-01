import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/rng';
import { chooseMove, foundValue, moveWhy, settling, stayValue, type MoveAction, type MoveContext } from '../decisions/move';
import { TRAIT, TRAIT_COUNT } from '../traits';
import { MOVE_W } from '../tuning';

/**
 * Laboratório da IA local: quando a família sai (ficar, migrar ou fundar). Lugares de mentira, sem mundo:
 * só a escolha, para ver se ela segue a fome, a pressão, os laços, o apego e a histerese.
 */

/** Uma família de dois adultos com os traços dados (o resto em 0). */
function family(set: Partial<Record<keyof typeof TRAIT, number>> = {}): Int8Array {
  const t = new Int8Array(TRAIT_COUNT * 2);
  for (const [k, v] of Object.entries(set)) {
    t[TRAIT[k as keyof typeof TRAIT]] = v;
    t[TRAIT_COUNT + TRAIT[k as keyof typeof TRAIT]] = v;
  }
  return t;
}

function ctx(extra: Partial<MoveContext> = {}, traits = family()): MoveContext {
  return {
    traits,
    adults: [0, 1],
    here: { value: 2.5, pressure: 0.3, friends: 2, lack: 0 },
    places: [],
    sites: [],
    yearsHere: Infinity,
    ...extra,
  };
}

/** Quantas vezes cada tipo de escolha sai em `n` sorteios. */
function tally(c: MoveContext, n = 2000, seed = 3): Record<string, number> {
  const rnd = mulberry32(seed);
  const out: Record<string, number> = { stay: 0, migrate: 0, found: 0 };
  for (let k = 0; k < n; k++) out[chooseMove(c, rnd)!.pick.action.kind]++;
  for (const k of Object.keys(out)) out[k] /= n;
  return out;
}

const place = (id: number, value: number, extra: Partial<{ pressure: number; friends: number; affinity: number }> = {}) => ({ id, value, pressure: 0.3, friends: 0, affinity: 0, ...extra });

describe('quando sair: ficar, migrar ou fundar', () => {
  it('sem motivo, a família fica: um lugar só um pouco melhor não basta', () => {
    const t = tally(ctx({ places: [place(1, 2.7)] }));
    expect(t.stay).toBeGreaterThan(0.9);
  });

  it('com fome em casa e um lugar bem melhor ao alcance, quase todas migram', () => {
    const t = tally(ctx({ here: { value: 0.8, pressure: 0.3, friends: 2, lack: 0.8 }, places: [place(1, 2.8)] }));
    expect(t.migrate).toBeGreaterThan(0.85);
  });

  it('fundar só acende com a pressão de casa (fissão por pressão, não por fome)', () => {
    const sites = [{ index: 0, value: 5 }];
    const calm = tally(ctx({ sites }));
    expect(calm.found).toBe(0);
    // Com fome e sem pressão, o sítio continua apagado: a fome manda migrar, não fundar.
    const hungry = tally(ctx({ here: { value: 0.8, pressure: 0.3, friends: 2, lack: 0.9 }, sites }));
    expect(hungry.found).toBeLessThan(0.05);
    const full = tally(ctx({ here: { value: 2.5, pressure: 2.2, friends: 2, lack: 0 }, sites }));
    expect(full.found).toBeGreaterThan(0.3);
  });

  it('mais pressão, mais famílias querem fundar', () => {
    const sites = [{ index: 0, value: 4 }];
    let last = -1;
    for (const p of [0.5, 1, 1.5, 2.5]) {
      const t = tally(ctx({ here: { value: 2.5, pressure: p, friends: 2, lack: 0 }, sites }));
      expect(t.found).toBeGreaterThanOrEqual(last);
      last = t.found;
    }
    expect(last).toBeGreaterThan(0.3);
  });

  it('histerese: quem acabou de chegar reluta em sair de novo', () => {
    const options = { here: { value: 1.6, pressure: 0.3, friends: 1, lack: 0.3 }, places: [place(1, 2.4)] };
    const old = tally(ctx({ ...options, yearsHere: Infinity }));
    const fresh = tally(ctx({ ...options, yearsHere: 1 }));
    expect(fresh.stay).toBeGreaterThan(old.stay + 0.2);
    expect(settling(0)).toBe(MOVE_W.settle);
    expect(settling(MOVE_W.settleYears)).toBe(0);
    // No êxodo (anos de falta) ficar não tem o bônus do costume nem da histerese.
    expect(stayValue(ctx({ exodus: true, yearsHere: 0 }))).toBe(2.5);
  });

  it('o caseiro fica mais e o nômade sai mais (traço apego)', () => {
    const options = { here: { value: 1.8, pressure: 0.3, friends: 1, lack: 0.2 }, places: [place(1, 2.4)] };
    const home = tally(ctx(options, family({ attachment: 9 })));
    const free = tally(ctx(options, family({ attachment: -9 })));
    expect(home.stay).toBeGreaterThan(free.stay + 0.1);
  });

  it('com dois lugares iguais, a família vai para onde tem amigos e parentes', () => {
    const rnd = mulberry32(5);
    const c = ctx({ here: { value: 0.8, pressure: 0.3, friends: 0, lack: 0.8 }, places: [place(1, 2.6), place(2, 2.6, { friends: 4, affinity: 60 })] });
    let toFriends = 0;
    let moved = 0;
    for (let k = 0; k < 2000; k++) {
      const a = chooseMove(c, rnd)!.pick.action;
      if (a.kind !== 'migrate') continue;
      moved++;
      if (a.to === 2) toFriends++;
    }
    expect(toFriends / moved).toBeGreaterThan(0.6);
  });

  it('um lugar lotado atrai menos que um com folga e a mesma nota', () => {
    const rnd = mulberry32(9);
    const c = ctx({ here: { value: 0.8, pressure: 0.3, friends: 0, lack: 0.8 }, places: [place(1, 2.6, { pressure: 2.5 }), place(2, 2.6, { pressure: 0.3 })] });
    let calm = 0;
    let moved = 0;
    for (let k = 0; k < 2000; k++) {
      const a = chooseMove(c, rnd)!.pick.action;
      if (a.kind !== 'migrate') continue;
      moved++;
      if (a.to === 2) calm++;
    }
    expect(calm / moved).toBeGreaterThan(0.7);
  });

  it('o sítio melhor vale mais, e o porquê diz o que pesou', () => {
    expect(foundValue(5)).toBeGreaterThan(foundValue(1));
    const c = chooseMove(ctx({ here: { value: 2.5, pressure: 2.5, friends: 2, lack: 0 }, sites: [{ index: 0, value: 5 }] }), mulberry32(1))!;
    const name = (a: MoveAction) => (a.kind === 'stay' ? 'ficar' : a.kind === 'found' ? 'fundar' : 'migrar');
    expect(moveWhy(c, name)).toMatch(/^(ficar|fundar) \(\d,\d\d\): .+; depois (ficar|fundar)/);
  });

  it('é determinística com a mesma semente', () => {
    const c = ctx({ here: { value: 1.6, pressure: 1.2, friends: 1, lack: 0.3 }, places: [place(1, 2.2)], sites: [{ index: 0, value: 4 }] });
    expect(tally(c, 300, 11)).toEqual(tally(c, 300, 11));
  });
});
