/**
 * Relações entre pessoas (IA local, inspirada no The Sims): cada pessoa guarda até MAX_BONDS laços com
 * outras, pelo `uid`, com um valor de −100 (inimigos) a 100 (inseparáveis) e um tipo. Os laços nascem de
 * encontros no dia a dia do lugar, crescem ou azedam pela compatibilidade dos traços e esfriam com o tempo.
 */

export const BOND = { acquaintance: 0, friend: 1, partner: 2, rival: 3 } as const;
export type BondKind = (typeof BOND)[keyof typeof BOND];
export const BOND_NAMES = ['conhecido', 'amigo', 'cônjuge', 'rival'] as const;

export interface Bond {
  uid: number;
  value: number;
  kind: BondKind;
}

export const MAX_BONDS = 12;

export function bondWith(bonds: Map<number, Bond[]>, a: number, b: number): Bond | undefined {
  const list = bonds.get(a);
  if (!list) return undefined;
  for (const x of list) if (x.uid === b) return x;
  return undefined;
}

/** Laço de `a` com `b`, criado como conhecido se ainda não existe (o mais fraco sai quando enche). */
export function touch(bonds: Map<number, Bond[]>, a: number, b: number): Bond {
  let list = bonds.get(a);
  if (!list) bonds.set(a, (list = []));
  for (const x of list) if (x.uid === b) return x;
  const bond: Bond = { uid: b, value: 0, kind: BOND.acquaintance };
  if (list.length >= MAX_BONDS) {
    // Sai o laço mais fraco que não seja cônjuge.
    let weak = -1;
    for (let k = 0; k < list.length; k++) {
      if (list[k].kind === BOND.partner) continue;
      if (weak < 0 || Math.abs(list[k].value) < Math.abs(list[weak].value)) weak = k;
    }
    if (weak < 0) return bond;
    list[weak] = bond;
  } else list.push(bond);
  return bond;
}

export function partnerOf(bonds: Map<number, Bond[]>, a: number): number {
  const list = bonds.get(a);
  if (list) for (const x of list) if (x.kind === BOND.partner) return x.uid;
  return 0;
}

export function countKind(bonds: Map<number, Bond[]>, a: number, kind: BondKind): number {
  let n = 0;
  for (const x of bonds.get(a) ?? []) if (x.kind === kind) n++;
  return n;
}

/** Desfaz o laço dos dois lados (morte ou partida para longe). */
export function forget(bonds: Map<number, Bond[]>, a: number, b: number): void {
  const la = bonds.get(a);
  if (la) {
    const k = la.findIndex((x) => x.uid === b);
    if (k >= 0) la.splice(k, 1);
  }
}
