/**
 * Profissões dos indivíduos de espécies inteligentes. Cada uma tem aparência
 * própria (art.ts) e muda um pouco o comportamento: caçadores caçam,
 * soldados e guardas ficam perto do centro, líderes e reis são únicos.
 */
export const ROLES = ['gatherer', 'hunter', 'farmer', 'woodcutter', 'builder', 'miner', 'blacksmith', 'soldier', 'guard', 'leader', 'king'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE = Object.fromEntries(ROLES.map((r, i) => [r, i])) as Record<Role, number>;

export const ROLE_NAMES: Record<Role, string> = {
  gatherer: 'Coletor',
  hunter: 'Caçador',
  farmer: 'Agricultor',
  woodcutter: 'Lenhador',
  builder: 'Construtor',
  miner: 'Minerador',
  blacksmith: 'Ferreiro',
  soldier: 'Soldado',
  guard: 'Guarda',
  leader: 'Líder',
  king: 'Rei',
};

/** Peso de cada profissão comum por era e nível do assentamento. */
export function roleWeights(era: number, tier: number): [Role, number][] {
  const w: [Role, number][] = [
    ['gatherer', era === 0 ? 4 : 1],
    ['hunter', era === 0 ? 3 : 1.5],
    ['woodcutter', 2],
    ['builder', 1.5],
  ];
  if (era >= 1) w.push(['farmer', 4], ['miner', 1], ['blacksmith', 0.8], ['soldier', tier >= 1 ? 2.5 : 1.5]);
  if (era >= 1 && tier >= 1) w.push(['guard', 1]);
  return w;
}

/** Sorteia uma profissão comum. */
export function pickRole(era: number, tier: number, r: number): number {
  const w = roleWeights(era, tier);
  let total = 0;
  for (const [, v] of w) total += v;
  let x = r * total;
  for (const [role, v] of w) {
    x -= v;
    if (x <= 0) return ROLE[role];
  }
  return ROLE[w[w.length - 1][0]];
}
