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

/** O que o assentamento tem e que libera profissões. */
export interface RoleContext {
  port?: boolean;
  smithy?: boolean;
  /** Valor da cultura: povos guerreiros têm mais soldados. */
  warlike?: boolean;
}

/**
 * Peso de cada profissão comum por era e nível do assentamento. Mineradores
 * (que exploram e abrem minas) existem desde a Pedra; ferreiros só com
 * ferraria; pescadores só com porto.
 */
export function roleWeights(era: number, tier: number, ctx: RoleContext = {}): [Role, number][] {
  const w: [Role, number][] = [
    ['gatherer', era === 0 ? 4 : 1],
    ['hunter', era === 0 ? 3 : 1.5],
    ['woodcutter', 2],
    ['builder', 1.5],
    ['miner', era === 0 ? 1 : 1.5],
  ];
  const soldiers = (tier >= 1 ? 2.5 : 1.5) * (ctx.warlike ? 1.6 : 1);
  if (era >= 1) w.push(['farmer', 4], ['soldier', soldiers]);
  else w.push(['soldier', 0.6 * (ctx.warlike ? 1.6 : 1)]);
  if (ctx.smithy) w.push(['blacksmith', 1]);
  if (era >= 1 && tier >= 1) w.push(['guard', 1]);
  if (ctx.port) w.push(['fisher', 2.5]);
  return w;
}

/** Sorteia uma profissão comum. */
export function pickRole(era: number, tier: number, r: number, ctx: RoleContext = {}): number {
  const w = roleWeights(era, tier, ctx);
  let total = 0;
  for (const [, v] of w) total += v;
  let x = r * total;
  for (const [role, v] of w) {
    x -= v;
    if (x <= 0) return ROLE[role];
  }
  return ROLE[w[w.length - 1][0]];
}
