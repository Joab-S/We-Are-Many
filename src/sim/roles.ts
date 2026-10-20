/**
 * Profissões dos indivíduos de espécies inteligentes. Cada uma tem aparência
 * própria (art.ts) e muda um pouco o comportamento: caçadores caçam,
 * soldados e guardas ficam perto do centro, líderes e reis são únicos.
 */
export const ROLES = ['gatherer', 'hunter', 'farmer', 'woodcutter', 'builder', 'miner', 'blacksmith', 'fisher', 'soldier', 'guard', 'leader', 'king'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE = Object.fromEntries(ROLES.map((r, i) => [r, i])) as Record<Role, number>;

/** Marca de quem ainda é criança: ganha uma profissão ao virar adulto. */
export const CHILD = 255;

export const ROLE_NAMES: Record<Role, string> = {
  gatherer: 'Coletor',
  hunter: 'Caçador',
  farmer: 'Agricultor',
  woodcutter: 'Lenhador',
  builder: 'Construtor',
  miner: 'Minerador',
  blacksmith: 'Ferreiro',
  fisher: 'Pescador',
  soldier: 'Soldado',
  guard: 'Guarda',
  leader: 'Líder',
  king: 'Rei',
};

/** Peso de cada profissão comum por era e nível do assentamento; pescadores só onde há porto. */
export function roleWeights(era: number, tier: number, port = false): [Role, number][] {
  const w: [Role, number][] = [
    ['gatherer', era === 0 ? 4 : 1],
    ['hunter', era === 0 ? 3 : 1.5],
    ['woodcutter', 2],
    ['builder', 1.5],
  ];
  if (era >= 1) w.push(['farmer', 4], ['miner', 1], ['blacksmith', 0.8], ['soldier', tier >= 1 ? 2.5 : 1.5]);
  if (era >= 1 && tier >= 1) w.push(['guard', 1]);
  if (port) w.push(['fisher', 2.5]);
  return w;
}

/** Sorteia uma profissão comum. */
export function pickRole(era: number, tier: number, r: number, port = false): number {
  const w = roleWeights(era, tier, port);
  let total = 0;
  for (const [, v] of w) total += v;
  let x = r * total;
  for (const [role, v] of w) {
    x -= v;
    if (x <= 0) return ROLE[role];
  }
  return ROLE[w[w.length - 1][0]];
}
