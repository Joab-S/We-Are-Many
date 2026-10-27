/**
 * Profissões dos indivíduos de espécies inteligentes. Cada uma tem aparência
 * própria (art.ts) e muda um pouco o comportamento: caçadores caçam,
 * soldados e guardas ficam perto do centro, líderes e reis são únicos.
 */
export const ROLES = [
  'gatherer',
  'hunter',
  'farmer',
  'woodcutter',
  'builder',
  'miner',
  'blacksmith',
  'fisher',
  // Profissões da economia local (RF-VIDA-213); ficam antes dos soldados, que andam perto do centro.
  'shepherd',
  'horsekeeper',
  'weaver',
  'potter',
  'miller',
  'merchant',
  'priest',
  'soldier',
  'guard',
  'leader',
  'king',
] as const;
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
  shepherd: 'Pastor',
  horsekeeper: 'Tratador de cavalos',
  weaver: 'Tecelão',
  potter: 'Oleiro',
  miller: 'Moleiro',
  merchant: 'Comerciante',
  priest: 'Sacerdote',
  soldier: 'Soldado',
  guard: 'Guarda',
  leader: 'Líder',
  king: 'Rei',
};

/** O que o assentamento tem e que libera profissões. */
export interface RoleContext {
  port?: boolean;
  smithy?: boolean;
  /** Tem roças plantadas ou vocação agrícola (puxa agricultores desde a Idade da Pedra). */
  fields?: boolean;
  /** Valor da cultura: povos guerreiros têm mais soldados. */
  warlike?: boolean;
  /** Rebanho, haras, tear, olaria, moinho, mercado e templo liberam as profissões da economia. */
  herd?: boolean;
  stable?: boolean;
  loom?: boolean;
  pottery?: boolean;
  windmill?: boolean;
  market?: boolean;
  temple?: boolean;
  /** Profissão puxada pela vocação do assentamento (RF-VIDA-221). */
  vocation?: Role;
}

/**
 * Peso de cada profissão comum por era e nível do assentamento. Mineradores
 * (que exploram e abrem minas) e agricultores (quando há roças) existem desde
 * a Pedra; ferreiros só com ferraria; pescadores só com porto.
 */
export function roleWeights(era: number, tier: number, ctx: RoleContext = {}): [Role, number][] {
  const w: [Role, number][] = [
    ['gatherer', era === 0 ? 3.5 : 1],
    ['hunter', era === 0 ? 2.5 : 1.5],
    ['woodcutter', 2],
    ['builder', 1.5],
    ['miner', era === 0 ? 1.2 : 1.5],
  ];
  const soldiers = (tier >= 1 ? 2.5 : 1.5) * (ctx.warlike ? 1.6 : 1);
  if (era >= 1) w.push(['farmer', 4], ['soldier', soldiers]);
  else {
    if (ctx.fields || ctx.vocation === 'farmer') w.push(['farmer', 2.5]);
    w.push(['soldier', 0.6 * (ctx.warlike ? 1.6 : 1)]);
  }
  if (ctx.smithy) w.push(['blacksmith', 1]);
  if (era >= 1 && tier >= 1) w.push(['guard', 1]);
  if (ctx.port) w.push(['fisher', 2.5]);
  if (ctx.herd) w.push(['shepherd', 1.5]);
  if (ctx.stable) w.push(['horsekeeper', 0.8]);
  if (ctx.loom) w.push(['weaver', 0.8]);
  if (ctx.pottery) w.push(['potter', 0.8]);
  if (ctx.windmill) w.push(['miller', 0.6]);
  if (ctx.market) w.push(['merchant', 0.8]);
  if (ctx.temple) w.push(['priest', 0.4]);
  if (ctx.vocation) {
    const k = w.findIndex(([r]) => r === ctx.vocation);
    if (k >= 0) w[k] = [w[k][0], w[k][1] * 1.6];
  }
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
