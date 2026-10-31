/**
 * Plano novo dos assentamentos (REQUISITOS-VIDA.md, seção 20, RF-AS): regras puras de onde nascem
 * os lugares, de que degrau eles são, da política que nasce da lealdade e da afinidade entre lugares.
 * Nada aqui sorteia nem mexe no mapa; o Ecosystem lê o mundo, chama estas funções e aplica o resultado.
 */

import * as B from './balance';
import type { BuildingKind } from './ecosystem';

// ---- Nascimento (fase 1) ----

/** Por que um grupo sai para fundar um lugar novo (RF-AS-03). */
export type ColonyMotive = 'terra' | 'jazida' | 'porto' | 'espaço' | 'fuga' | 'cisma';

export const MOTIVE_TEXT: Record<ColonyMotive, string> = {
  terra: 'terra boa para plantar',
  jazida: 'a jazida que acharam',
  porto: 'um porto no mar',
  espaço: 'espaço para crescer',
  fuga: 'fugir do perigo',
  cisma: 'viver do seu jeito',
};

/** O que os batedores olham num sítio, cada fator de 0 a 1 (RF-AS-04). */
export interface SiteLook {
  water: number;
  fertile: number;
  forest: number;
  rock: number;
  flat: number;
  coast: number;
  ruin: number;
  defense: number;
  route: number;
  /** Quanto o sítio atende o motivo da colônia (jazida perto, costa, terra boa). */
  motive: number;
  /** Distância (tiles) até a origem. */
  dist: number;
  // Onda 3 (onde assentar): os campos abaixo são opcionais, e ausentes não mudam a nota.
  /** Jazidas conhecidas pelo reino e úteis na era, ao alcance da pedreira (0 a 1, com decaimento). */
  ore?: number;
  /** Era de quem funda: a técnica muda o peso da pedra e do minério. */
  era?: number;
  /** Parte da captação que já é de lugares vivos (0 a 1). */
  overlap?: number;
  /** Gente que já explora a captação: os moradores de cada vizinho na parte da área dele que cai nela (IFD). */
  crowd?: number;
  /** Distância (tiles) até a capital do reino de quem funda. */
  capital?: number;
  /** Clima no centro: 1 no meio da faixa de temperatura da espécie, 0 na borda. */
  climate?: number;
}

/**
 * Nota de um sítio: soma ponderada do que ele tem, menos o desvio da distância ideal (RF-AS-04).
 * O que a captação dá (comida, mata, pedra, minério) é dividido com quem já a explora (distribuição livre
 * ideal: o valor cai com a densidade); a sobreposição com outros lugares e a distância da capital descontam.
 */
export function siteValue(s: SiteLook): number {
  const era = s.era === undefined ? -1 : Math.max(0, Math.min(B.SITE_ERA_ROCK.length - 1, Math.floor(s.era)));
  const rockW = era < 0 ? 1 : B.SITE_ERA_ROCK[era];
  const oreW = era < 0 ? 1 : B.SITE_ERA_ORE[era];
  const share = 1 / (1 + (s.crowd ?? 0) / B.SITE_CATCH_POP);
  return (
    B.SITE_W_WATER * s.water +
    share * (B.SITE_W_FERTILE * s.fertile + B.SITE_W_FOREST * s.forest + B.SITE_W_ROCK * rockW * s.rock + B.SITE_W_ORE * oreW * (s.ore ?? 0)) +
    B.SITE_W_FLAT * s.flat +
    B.SITE_W_COAST * s.coast +
    B.SITE_W_RUIN * s.ruin +
    B.SITE_W_DEFENSE * s.defense +
    B.SITE_W_ROUTE * s.route +
    B.SITE_W_MOTIVE * s.motive +
    B.SITE_W_CLIMATE * (s.climate ?? 0) -
    B.SITE_W_OVERLAP * (s.overlap ?? 0) -
    B.SITE_CAPITAL_COST * Math.max(0, (s.capital ?? 0) - B.SITE_CAPITAL_FREE) -
    B.SITE_DIST_COST * Math.abs(s.dist - B.SITE_IDEAL_DIST)
  );
}

/** Peso de uma célula da captação a `d` tiles do centro do sítio (decaimento). */
export function siteDecay(d: number): number {
  return 1 / (1 + d / B.SITE_DECAY);
}

/** Área da interseção de dois discos de raios `r1` e `r2` com centros a `d` (a lente). */
export function lensArea(r1: number, r2: number, d: number): number {
  if (r1 <= 0 || r2 <= 0 || d >= r1 + r2) return 0;
  const small = Math.min(r1, r2);
  if (d <= Math.abs(r1 - r2)) return Math.PI * small * small;
  const a1 = r1 * r1 * Math.acos(Math.max(-1, Math.min(1, (d * d + r1 * r1 - r2 * r2) / (2 * d * r1))));
  const a2 = r2 * r2 * Math.acos(Math.max(-1, Math.min(1, (d * d + r2 * r2 - r1 * r1) / (2 * d * r2))));
  const k = 0.5 * Math.sqrt(Math.max(0, (-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2)));
  return a1 + a2 - k;
}

/**
 * Água doce de um sítio, de 0 (nenhuma: ninguém funda) a 1. `lake` é a distância (tiles) até o lago mais
 * perto (Infinity sem lago ao alcance; o mar não conta), `moisture` a umidade do solo no centro e `well` se
 * o povo cava poço (Idade do Ferro). Sem rios no mapa, o solo encharcado faz as vezes de nascente e córrego.
 */
export function waterGrade(lake: number, moisture: number, well: boolean): number {
  let g = 0;
  if (lake <= B.SITE_WATER_RANGE) g = lake <= 3 ? B.SITE_WATER_LAKE_NEAR : B.SITE_WATER_LAKE_NEAR - ((B.SITE_WATER_LAKE_NEAR - B.SITE_WATER_LAKE_FAR) * (lake - 3)) / Math.max(1, B.SITE_WATER_RANGE - 3);
  if (moisture >= B.SITE_SPRING_MOISTURE) {
    const [lo, hi] = B.SITE_WATER_SPRING;
    g = Math.max(g, lo + ((hi - lo) * (moisture - B.SITE_SPRING_MOISTURE)) / Math.max(0.01, 1 - B.SITE_SPRING_MOISTURE));
  }
  if (well && moisture >= B.SITE_WELL_MOISTURE) g = Math.max(g, B.SITE_WATER_WELL);
  return g;
}

/** Menor distância permitida entre um lugar novo e um lugar de nível `tier` (RF-AS-05). */
export function spacingFor(tier: number): number {
  return B.SPACING[Math.max(0, Math.min(B.SPACING.length - 1, tier))];
}

// ---- Degraus (fase 2) ----

export const TIER_NAMES_NEW = ['Aldeia', 'Vila', 'Cidade', 'Metrópole'];

/** Oficinas que contam para a vila (qualquer construção que fabrica algo). */
const WORKSHOPS: BuildingKind[] = ['smithy', 'pottery', 'loom', 'sawmill', 'windmill', 'corral', 'stable', 'market'];
/** Produção de material que a cidade precisa ter. */
const MATERIAL: BuildingKind[] = ['sawmill', 'pottery', 'smithy'];

/** O que o assentamento precisa ter, além da gente, para ficar num degrau. */
export interface TierCheck {
  population: number;
  built: ReadonlySet<BuildingKind>;
  /** Capital de reino ou império. */
  capital: boolean;
  /** Quantos lugares têm este como cidade de referência (RF-AS-44). */
  market: number;
  /** Tem água (poço ou rio) na praça. */
  water: boolean;
}

/** Funções do degrau que ainda faltam (vazio = tem tudo). */
export function missingFunctions(tier: number, c: TierCheck): string[] {
  const out: string[] = [];
  if (tier >= 1) {
    if (!c.built.has('granary')) out.push('celeiro');
    if (!c.water) out.push('poço');
    if (!WORKSHOPS.some((k) => c.built.has(k))) out.push('uma oficina');
  }
  if (tier >= 2) {
    if (!c.built.has('market')) out.push('mercado');
    if (!c.built.has('temple')) out.push('templo');
    if (!MATERIAL.some((k) => c.built.has(k))) out.push('serraria, olaria ou ferraria');
  }
  if (tier >= 3 && !c.capital && c.market < B.METROPOLIS_MARKET) out.push(`ser capital ou mercado de ${B.METROPOLIS_MARKET} lugares`);
  return out;
}

/** Maior degrau que a população e as funções permitem. */
export function tierAllowed(c: TierCheck): number {
  let t = 0;
  while (t + 1 < B.TIER_POPULATION_NEW.length && c.population >= B.TIER_POPULATION_NEW[t + 1] && missingFunctions(t + 1, c).length === 0) t++;
  return t;
}

/** O lugar está abaixo do que o degrau atual pede (pouca gente ou sem as funções). */
export function belowTier(tier: number, c: TierCheck): boolean {
  if (tier <= 0) return false;
  return c.population < B.TIER_POPULATION_NEW[tier] * B.TIER_DOWN_SHARE || missingFunctions(tier, c).length > 0;
}

// ---- Política (fases 1 e 5) ----

/** Degrau político (RF-AS-48). */
export type Polity = 'livre' | 'chefia' | 'reino' | 'império';

export const POLITY_NAMES: Record<Polity, string> = { livre: 'Aldeia livre', chefia: 'Chefia', reino: 'Reino', império: 'Império' };

/**
 * Degrau político de um centro: reino exige uma cidade como capital e pelo menos 3 lugares leais
 * (contando a capital); império é um reino com outro reino vassalo; com seguidores e sem cidade é chefia.
 */
export function polityOf(capitalTier: number, members: number, vassalKingdoms: number): Polity {
  if (capitalTier >= 2 && members >= 3) return vassalKingdoms > 0 ? 'império' : 'reino';
  if (members >= 2) return 'chefia';
  return 'livre';
}

/** O que pesa na lealdade de um lugar a um centro político (RF-AS-49), cada um de 0 a 1 salvo onde dito. */
export interface LoyaltyLook {
  /** Afinidade de −100 a 100 entre o lugar e o centro. */
  affinity: number;
  /** Comércio no último ano entre os dois (0 a 1). */
  trade: number;
  /** Proteção: força do centro em relação ao lugar (0 a 1). */
  protection: number;
  /** Pedidos da capital recusados (impostos, tributo) e pedidos em aberto. */
  burden: number;
  /** Distância em tiles. */
  dist: number;
  /** Mesmo povo. */
  sameCulture: boolean;
  /** Carisma do rei, de −1 a 1. */
  charisma: number;
}

/** Lealdade de 0 a 1. */
export function loyaltyScore(l: LoyaltyLook): number {
  const x =
    0.4 +
    l.affinity / 160 +
    0.15 * l.trade +
    0.2 * l.protection -
    0.12 * l.burden -
    l.dist / 220 +
    (l.sameCulture ? 0.15 : -0.1) +
    0.1 * l.charisma;
  return Math.max(0, Math.min(1, x));
}

/** Chave estável de um par de assentamentos ("a:b", a < b). */
export function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}
