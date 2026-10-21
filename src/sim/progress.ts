/**
 * Eras por desenvolvimento e técnicas (REQUISITOS-VIDA.md, seção 19.10,
 * RF-VIDA-270 a 275). Funções puras: o Ecosystem monta o contexto e guarda o
 * resultado no assentamento.
 *
 * A era passa a pedir marcos de metal (ERA_NEEDS, como antes) e pontos de
 * desenvolvimento em seis pilares; as técnicas são uma árvore pequena em que
 * cada uma libera algo visível (prédio, rebanho, carroça).
 */

import type { Vocation } from './needs';

export const PILLARS = ['sustento', 'tecnica', 'construcao', 'comercio', 'cultura', 'organizacao'] as const;
export type Pillar = (typeof PILLARS)[number];

export const PILLAR_NAMES: Record<Pillar, string> = {
  sustento: 'Sustento',
  tecnica: 'Técnica',
  construcao: 'Construção',
  comercio: 'Comércio',
  cultura: 'Cultura',
  organizacao: 'Organização',
};

/** O pilar que cada vocação especializa: rende o dobro de pontos nele (RF-VIDA-273). */
export const VOCATION_PILLAR: Record<Vocation, Pillar> = {
  agricola: 'sustento',
  gado: 'sustento',
  ovelhas: 'sustento',
  pesqueira: 'sustento',
  cavalos: 'organizacao',
  mercantil: 'comercio',
  mineira: 'tecnica',
  madeireira: 'construcao',
};

/** Pontos de cada pilar, na ordem de PILLARS. */
export type Points = [number, number, number, number, number, number];

export const emptyPoints = (): Points => [0, 0, 0, 0, 0, 0];

/** Entradas do cálculo dos pilares: tudo vem do estado do assentamento. */
export interface PillarContext {
  /** Atendimento médio das necessidades, de 0 a 1. */
  welfare: number;
  /** Comida estocada ÷ teto. */
  foodFill: number;
  farming: boolean;
  herd: boolean;
  mines: boolean;
  smithy: boolean;
  techs: number;
  completeness: number;
  port: boolean;
  market: boolean;
  agreements: number;
  fair: boolean;
  temple: boolean;
  monument: boolean;
  luxuryJoy: boolean;
  leader: boolean;
  tier: number;
  stability: number;
  linked: boolean;
  kingdom: boolean;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Nível de cada pilar agora, de 0 a 1 (RF-VIDA-270, quadro da 19.10). */
export function pillarLevels(c: PillarContext): Points {
  return [
    clamp01(0.45 * c.welfare + 0.2 * c.foodFill + 0.2 * (c.farming ? 1 : 0) + 0.15 * (c.herd ? 1 : 0)),
    clamp01(0.35 * (c.mines ? 1 : 0) + 0.3 * (c.smithy ? 1 : 0) + 0.35 * clamp01(c.techs / TECHS.length / 0.6)),
    clamp01(c.completeness),
    clamp01(0.25 * (c.port ? 1 : 0) + 0.3 * (c.market ? 1 : 0) + 0.3 * Math.min(1, c.agreements) + 0.15 * (c.fair ? 1 : 0)),
    clamp01(0.4 * (c.temple ? 1 : 0) + 0.3 * (c.monument ? 1 : 0) + 0.15 * (c.luxuryJoy ? 1 : 0) + 0.15 * (c.leader ? 1 : 0)),
    clamp01(0.35 * (c.tier / 3) + 0.35 * c.stability + 0.15 * (c.linked ? 1 : 0) + 0.15 * (c.kingdom ? 1 : 0)),
  ];
}

/** Pontos por ano de um pilar no nível 1; a vocação dobra o do pilar dela (RF-VIDA-273). */
export const POINTS_PER_YEAR = 1;

/** Pontos que cada pilar rende em `years` anos, com o dobro no pilar da vocação. */
export function pointsFor(levels: Points, years: number, vocation?: Vocation): Points {
  const special = vocation ? PILLARS.indexOf(VOCATION_PILLAR[vocation]) : -1;
  return levels.map((l, i) => l * POINTS_PER_YEAR * years * (i === special ? 2 : 1)) as Points;
}

/** Pontos de desenvolvimento para sair de cada era (RF-VIDA-270, calibrados na Etapa H). */
export const ERA_POINTS = [330, 480, 640, 800];
/** Pilares que precisam ter um mínimo de pontos, e esse mínimo (parte dos pontos da era). */
export const ERA_PILLARS_MIN = 3;
export const PILLAR_FLOOR = 0.08;

/** Os pontos já bastam para sair da era? */
export function pointsMet(pts: Points, era: number): boolean {
  if (era >= ERA_POINTS.length) return true;
  const need = ERA_POINTS[era];
  const total = pts.reduce((s, p) => s + p, 0);
  return total >= need && pts.filter((p) => p >= need * PILLAR_FLOOR).length >= ERA_PILLARS_MIN;
}

/** Velocidade do conhecimento pelo desenvolvimento: quem se desenvolve bem chega antes, quem estagna demora mais. */
export function devSpeed(levels: Points): number {
  const mean = levels.reduce((s, l) => s + l, 0) / levels.length;
  return 0.8 + 0.4 * mean;
}

/** O que falta nos pontos, para o painel ("pontos 120/330; falta Cultura"). */
export function pointsText(pts: Points, era: number): string | null {
  if (era >= ERA_POINTS.length || pointsMet(pts, era)) return null;
  const need = ERA_POINTS[era];
  const total = Math.floor(pts.reduce((s, p) => s + p, 0));
  if (total < need) return `${total} de ${need} pontos de desenvolvimento`;
  const low = PILLARS.filter((_, i) => pts[i] < need * PILLAR_FLOOR).map((p) => PILLAR_NAMES[p]);
  return `desenvolver ${low.slice(0, ERA_PILLARS_MIN).join(', ')} (mínimo em ${ERA_PILLARS_MIN} pilares)`;
}

// Técnicas ------------------------------------------------------------------

/** O que o assentamento faz agora, para a técnica "vir do uso" (RF-VIDA-271). */
export interface UseContext {
  tech: number;
  tier: number;
  wet: boolean;
  herd?: 'sheep' | 'cattle' | 'goat' | 'horse' | 'camel';
  farming: boolean;
  smithy: boolean;
  market: boolean;
  temple: boolean;
  mill: boolean;
  coal: boolean;
}

export interface Tech {
  id: string;
  name: string;
  /** Progresso mínimo (era + fração) para a técnica poder ser aprendida. */
  from: number;
  /** Técnicas que precisam vir antes. */
  needs: string[];
  /** O que o uso do povo ensina; sem isso só se aprende com vizinhos, parceiros ou o jogador. */
  use: (c: UseContext) => boolean;
  /** O que ela libera, em uma frase (painel e crônica). */
  gives: string;
}

export const TECHS: Tech[] = [
  { id: 'ceramica', name: 'Cerâmica', from: 0.3, needs: [], use: (c) => c.wet, gives: 'olaria: barro vira tijolo e telha' },
  { id: 'domesticacao', name: 'Domesticação', from: 0.6, needs: [], use: () => true, gives: 'rebanhos e cercados de pasto' },
  { id: 'tecelagem', name: 'Tecelagem', from: 0.4, needs: [], use: (c) => c.herd === 'sheep' || c.herd === 'goat', gives: 'tear: lã vira roupa' },
  { id: 'roda', name: 'Roda', from: 1, needs: [], use: (c) => c.tier >= 1, gives: 'carroças levam mais carga' },
  { id: 'arado', name: 'Arado', from: 1, needs: ['domesticacao'], use: (c) => c.farming && (c.herd === 'cattle' || c.herd === 'horse'), gives: 'boi e cavalo dobram a área de cada agricultor' },
  { id: 'montaria', name: 'Montaria', from: 1, needs: ['domesticacao'], use: (c) => c.herd === 'horse' || c.herd === 'camel', gives: 'haras e caravanas mais rápidas' },
  { id: 'irrigacao', name: 'Irrigação', from: 1.2, needs: [], use: (c) => c.wet && c.farming, gives: 'colheitas maiores' },
  { id: 'moinho', name: 'Moinho', from: 1, needs: [], use: (c) => c.farming && c.tier >= 1, gives: 'moinho: o grão vira pão' },
  { id: 'escrita', name: 'Escrita', from: 1.3, needs: [], use: (c) => c.market || c.temple, gives: 'o conhecimento avança mais depressa' },
  { id: 'moeda', name: 'Moeda', from: 2, needs: ['escrita'], use: (c) => c.market, gives: 'a capital cunha moeda própria' },
  { id: 'cavalaria', name: 'Cavalaria', from: 2, needs: ['montaria'], use: (c) => c.smithy, gives: 'soldados montados' },
  { id: 'moinhoagua', name: 'Moinho d\'água', from: 2, needs: ['moinho'], use: (c) => c.mill && c.wet, gives: 'o moinho rende mais pão' },
  { id: 'imprensa', name: 'Imprensa', from: 3, needs: ['escrita'], use: (c) => c.market && c.tier >= 2, gives: 'o conhecimento passa mais depressa aos parceiros' },
  { id: 'vapor', name: 'Vapor', from: 3.5, needs: ['escrita'], use: (c) => c.coal && c.smithy, gives: 'fábrica' },
];

export const TECH_BY_ID: Record<string, Tech> = Object.fromEntries(TECHS.map((t) => [t.id, t]));

/** Chance anual de aprender uma técnica que o uso ensina; vizinhos do mesmo reino ou parceiros ensinam mais depressa (RF-VIDA-74). */
export const TECH_USE_RATE = 0.5;
export const TECH_NEIGHBOR_RATE = 1.2;
/** Chance de uma técnica passar quando uma caravana chega (×3 na feira). */
export const TECH_TRADE_CHANCE = 0.15;
/** Chance anual de esquecer uma técnica num colapso (RF-VIDA-275). */
export const DECAY_RATE = 0.01;

/** Técnicas que o assentamento ainda pode aprender (já na era, com o pré-requisito). */
export function learnable(known: ReadonlySet<string>, tech: number): Tech[] {
  return TECHS.filter((t) => !known.has(t.id) && tech >= t.from && t.needs.every((n) => known.has(n)));
}

/** Técnicas que ninguém no assentamento depende: as únicas que se podem esquecer. */
export function forgettable(known: ReadonlySet<string>): Tech[] {
  return TECHS.filter((t) => known.has(t.id) && !TECHS.some((o) => known.has(o.id) && o.needs.includes(t.id)));
}

/** Recursos conhecidos que ainda não se usam por falta de técnica ou de era (RF-VIDA-272). */
export function latentResources(c: { wet: boolean; ores: string[]; era: number; techs: ReadonlySet<string>; herbivores: boolean }): string[] {
  const out: string[] = [];
  if (c.wet && !c.techs.has('ceramica')) out.push('barro (falta a cerâmica)');
  if (c.herbivores && !c.techs.has('domesticacao')) out.push('animais da região (falta a domesticação)');
  if (c.ores.includes('iron') && c.era < 1) out.push('ferro (falta a fundição, Idade do Ferro)');
  if (c.ores.includes('coal') && c.era < 3) out.push('carvão (só na Era Medieval)');
  return out;
}
