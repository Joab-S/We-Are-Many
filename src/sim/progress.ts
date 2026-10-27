/**
 * Desenvolvimento orgânico, técnicas e descobertas individuais
 * (REQUISITOS-VIDA.md, seção 19.10, RF-VIDA-270 a 275). Funções puras: o
 * Ecosystem monta o contexto e guarda o resultado no assentamento.
 *
 * Não há trava artificial de anos nem fila rígida de eras: o povo usa o que
 * descobre e acumula, respeitando a sequência física dos materiais (pedra
 * lascada → cerâmica e fornos → cobre e bronze → fundição de ferro → aço e
 * vapor). Indivíduos curiosos que trabalham no ofício descobrem uma técnica
 * experimentando e depois a ensinam à aldeia.
 */

import type { Role } from './roles';
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

/** Referência de pontos por etapa de desenvolvimento (mostrada no painel). */
export const ERA_POINTS = [120, 220, 340, 480];
/** Pilares que precisam ter um mínimo de pontos, e esse mínimo (parte dos pontos da era). */
export const ERA_PILLARS_MIN = 3;
export const PILLAR_FLOOR = 0.08;

/** Os pontos já bastam para a referência da etapa? */
export function pointsMet(pts: Points, era: number): boolean {
  if (era >= ERA_POINTS.length) return true;
  const need = ERA_POINTS[era];
  const total = pts.reduce((s, p) => s + p, 0);
  return total >= need && pts.filter((p) => p >= need * PILLAR_FLOOR).length >= ERA_PILLARS_MIN;
}

/** Velocidade do aprendizado e da experimentação pelo desenvolvimento (0,8 a 1,4). */
export function devSpeed(levels: Points): number {
  const mean = levels.reduce((s, l) => s + l, 0) / levels.length;
  return 0.8 + 0.6 * mean;
}

/** O que falta nos pontos de referência, para o painel. */
export function pointsText(pts: Points, era: number): string | null {
  if (era >= ERA_POINTS.length || pointsMet(pts, era)) return null;
  const need = ERA_POINTS[era];
  const total = Math.floor(pts.reduce((s, p) => s + p, 0));
  if (total < need) return `${total} de ${need} pontos de desenvolvimento`;
  const low = PILLARS.filter((_, i) => pts[i] < need * PILLAR_FLOOR).map((p) => PILLAR_NAMES[p]);
  return `desenvolver ${low.slice(0, ERA_PILLARS_MIN).join(', ')} (mínimo em ${ERA_PILLARS_MIN} pilares)`;
}

// Técnicas e descobertas individuais ----------------------------------------

/** O que o assentamento faz e tem agora, para a técnica vir da prática real (RF-VIDA-271). */
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
  /** Tem herbívoros selvagens por perto para domesticar. */
  herbivores?: boolean;
  /** Tem ferramentas primitivas ou metálicas no estoque. */
  tools?: boolean;
  /** Tem minério de cobre, estanho ou ouro conhecido ou no estoque. */
  softOre?: boolean;
  /** Tem minério de ferro conhecido ou no estoque. */
  ironOre?: boolean;
  /** Já trabalhou cobre ou bronze na ferraria. */
  forgedBronze?: boolean;
  /** Já trabalhou ferro na ferraria. */
  forgedIron?: boolean;
  /** Tem pedra extraída ou pedreira ativa. */
  stoneWorked?: boolean;
}

export interface Tech {
  id: string;
  name: string;
  /** Progresso de referência (mantido por compatibilidade; 0 permite aprender assim que os pré-requisitos lógicos forem atendidos). */
  from: number;
  /** Técnicas anteriores obrigatórias na sequência lógica. */
  needs: string[];
  /** Profissões que experimentam e podem descobrir esta técnica trabalhando. */
  roles: Role[];
  /** Condição material e prática para alguém conseguir experimentar e descobrir. */
  use: (c: UseContext) => boolean;
  /** O que ela libera, em uma frase (painel e crônica). */
  gives: string;
}

export const TECHS: Tech[] = [
  {
    id: 'ceramica',
    name: 'Cerâmica',
    from: 0,
    needs: [],
    roles: ['gatherer', 'builder', 'potter'],
    use: (c) => c.wet || c.farming || (c.tools ?? false),
    gives: 'fornos e olaria: barro vira tijolo, telha e vasos para guardar grão',
  },
  {
    id: 'domesticacao',
    name: 'Domesticação',
    from: 0,
    needs: [],
    roles: ['hunter', 'gatherer', 'shepherd'],
    use: (c) => c.herbivores ?? true,
    gives: 'rebanhos e cercados de pasto',
  },
  {
    id: 'tecelagem',
    name: 'Tecelagem',
    from: 0,
    needs: [],
    roles: ['gatherer', 'shepherd', 'weaver'],
    use: (c) => c.herd === 'sheep' || c.herd === 'goat' || c.farming,
    gives: 'tear: lã e fibras viram roupa',
  },
  {
    id: 'fundicao',
    name: 'Fundição de cobre e bronze',
    from: 0,
    needs: ['ceramica'],
    roles: ['miner', 'builder', 'blacksmith'],
    use: (c) => (c.tools ?? true) && (c.softOre ?? c.smithy),
    gives: 'forja de cobre, estanho e bronze na ferraria',
  },
  {
    id: 'roda',
    name: 'Roda',
    from: 0,
    needs: [],
    roles: ['builder', 'woodcutter', 'merchant'],
    use: (c) => c.tier >= 1 || (c.tools ?? false),
    gives: 'carroças levam mais carga',
  },
  {
    id: 'arado',
    name: 'Arado',
    from: 0,
    needs: ['domesticacao'],
    roles: ['farmer', 'shepherd'],
    use: (c) => c.farming && (c.herd === 'cattle' || c.herd === 'horse'),
    gives: 'boi e cavalo dobram a área de cada agricultor',
  },
  {
    id: 'montaria',
    name: 'Montaria',
    from: 0,
    needs: ['domesticacao'],
    roles: ['shepherd', 'horsekeeper', 'hunter'],
    use: (c) => c.herd === 'horse' || c.herd === 'camel',
    gives: 'haras e caravanas mais rápidas',
  },
  {
    id: 'irrigacao',
    name: 'Irrigação',
    from: 0,
    needs: ['ceramica'],
    roles: ['farmer', 'builder'],
    use: (c) => c.wet && c.farming,
    gives: 'canais e poços: colheitas maiores',
  },
  {
    id: 'moinho',
    name: 'Moinho',
    from: 0,
    needs: ['roda'],
    roles: ['farmer', 'builder', 'miller'],
    use: (c) => c.farming && (c.tier >= 1 || (c.stoneWorked ?? false)),
    gives: 'moinho: o grão vira pão',
  },
  {
    id: 'siderurgia',
    name: 'Fundição de ferro',
    from: 0,
    needs: ['fundicao'],
    roles: ['blacksmith', 'miner'],
    use: (c) => c.smithy && (c.forgedBronze ?? true) && (c.ironOre ?? true),
    gives: 'forja de alta temperatura para trabalhar ferro',
  },
  {
    id: 'escrita',
    name: 'Escrita',
    from: 0,
    needs: ['ceramica'],
    roles: ['merchant', 'priest', 'leader', 'king'],
    use: (c) => c.market || c.temple || c.tier >= 1,
    gives: 'registros: o conhecimento se preserva e avança mais depressa',
  },
  {
    id: 'moeda',
    name: 'Moeda',
    from: 0,
    needs: ['escrita', 'fundicao'],
    roles: ['merchant', 'blacksmith', 'king'],
    use: (c) => c.market,
    gives: 'a capital cunha moeda própria',
  },
  {
    id: 'cavalaria',
    name: 'Cavalaria',
    from: 0,
    needs: ['montaria', 'fundicao'],
    roles: ['soldier', 'horsekeeper', 'blacksmith'],
    use: (c) => c.smithy,
    gives: 'soldados montados',
  },
  {
    id: 'moinhoagua',
    name: 'Moinho d\'água',
    from: 0,
    needs: ['moinho'],
    roles: ['miller', 'builder'],
    use: (c) => c.mill && c.wet,
    gives: 'o moinho rende mais pão',
  },
  {
    id: 'aco',
    name: 'Aço e alvenaria pesada',
    from: 0,
    needs: ['siderurgia'],
    roles: ['blacksmith', 'miner', 'builder'],
    use: (c) => c.smithy && (c.forgedIron ?? true) && (c.coal || (c.stoneWorked ?? false)),
    gives: 'ligas de aço (ferro + carvão) e construções de pedra',
  },
  {
    id: 'imprensa',
    name: 'Imprensa',
    from: 0,
    needs: ['escrita', 'siderurgia'],
    roles: ['merchant', 'priest', 'blacksmith'],
    use: (c) => c.market && c.tier >= 2,
    gives: 'o conhecimento passa mais depressa aos parceiros',
  },
  {
    id: 'vapor',
    name: 'Vapor',
    from: 0,
    needs: ['aco', 'moinho'],
    roles: ['blacksmith', 'miner', 'miller'],
    use: (c) => c.coal && c.smithy,
    gives: 'máquinas a vapor, fábrica e navios a vapor',
  },
];

export const TECH_BY_ID: Record<string, Tech> = Object.fromEntries(TECHS.map((t) => [t.id, t]));

/**
 * Curiosidade inata de uma pessoa (de 0,4 a 1,8), determinística pelo `uid`:
 * alguns indivíduos têm mais facilidade para observar, experimentar e aprender
 * trabalhando, sem gastar sorteios do RNG.
 */
export function curiosityOf(uid: number): number {
  const h = ((Math.imul(uid ^ 0x9e3779b9, 2654435761) >>> 0) % 1000) / 1000;
  // ~15% das pessoas são mentes brilhantes (1,4 a 1,8); a maioria fica entre 0,5 e 1,1.
  return h > 0.85 ? 1.4 + (h - 0.85) * 2.6 : 0.4 + h * 0.82;
}

/**
 * Taxa base anual de um trabalhador descobrir uma técnica experimentando no
 * ofício, e taxa com que o descobridor transmite a técnica para a aldeia.
 * Cadenciado para que a evolução leve gerações e dependa de quem trabalha.
 */
export const TECH_DISCOVER_RATE = 0.032;
export const TECH_TEACH_VILLAGE_RATE = 0.45;
export const TECH_USE_RATE = 0.18;
export const TECH_NEIGHBOR_RATE = 0.35;
/** Chance de uma técnica passar quando uma caravana chega (×3 na feira). */
export const TECH_TRADE_CHANCE = 0.12;
/** Chance anual de esquecer uma técnica num colapso (RF-VIDA-275). */
export const DECAY_RATE = 0.01;

/**
 * Técnicas que o assentamento ainda pode descobrir ou aprender: exige apenas
 * que os pré-requisitos lógicos (`needs`) já sejam conhecidos (o parâmetro
 * `tech` é mantido por compatibilidade).
 */
export function learnable(known: ReadonlySet<string>, tech = 0): Tech[] {
  return TECHS.filter((t) => !known.has(t.id) && tech >= t.from && t.needs.every((n) => known.has(n)));
}

/** Técnicas que ninguém no assentamento depende: as únicas que se podem esquecer. */
export function forgettable(known: ReadonlySet<string>): Tech[] {
  return TECHS.filter((t) => known.has(t.id) && !TECHS.some((o) => known.has(o.id) && o.needs.includes(t.id)));
}

/**
 * Calcula o progresso tecnológico orgânico (`v.tech`, de 0 a 4,99) a partir do
 * que o assentamento realmente domina, construiu e forjou:
 * - 0..0.99 (Idade da Pedra): coleta, caça, pedra lascada, primeiras técnicas.
 * - 1..1.99 (Idade do Bronze): cerâmica/fornos + fundição de cobre/bronze ou agricultura e pastoreio consolidados.
 * - 2..2.99 (Idade do Ferro): fundição de ferro, ou vila estruturada com escrita/moinho/irrigação.
 * - 3..3.99 (Era Medieval): aço e alvenaria pesada, moeda, cavalaria ou cidade com metalurgia de ferro.
 * - 4..4.99 (Era Industrial): domínio do vapor e do carvão com aço.
 */
export function organicTech(c: {
  techs: ReadonlySet<string>;
  tier: number;
  fields: number;
  herd: boolean;
  port: boolean;
  smithy: boolean;
  market: boolean;
  madeBronze: number;
  madeIron: number;
  madeSteel: number;
  madeStone: number;
  madeCoal: number;
  tools: number;
}): number {
  const k = c.techs;
  const count = k.size;

  // Etapa 4: Industrial (exige a técnica do vapor e ter trabalhado ferro/aço ou carvão).
  if (k.has('vapor') && (c.madeSteel >= 1 || c.madeCoal >= 5 || c.madeIron >= 4)) {
    const frac = Math.min(0.99, (c.madeSteel * 0.05 + c.madeCoal * 0.01 + count * 0.03));
    return 4 + frac;
  }

  // Etapa 3: Medieval (aço/alvenaria, ou fundição de ferro consolidada com moeda/cavalaria/imprensa/cidade).
  if (
    k.has('aco') ||
    (k.has('siderurgia') && c.madeIron >= 3 && (k.has('moeda') || k.has('cavalaria') || k.has('imprensa') || (c.tier >= 2 && c.madeStone >= 20)))
  ) {
    const sub =
      (k.has('aco') ? 0.35 : 0) +
      (k.has('imprensa') ? 0.2 : 0) +
      (k.has('moeda') ? 0.15 : 0) +
      Math.min(0.29, (c.madeIron + c.madeSteel * 2) / 40 + c.madeStone / 200);
    return 3 + Math.min(0.99, sub);
  }

  // Etapa 2: Ferro (siderurgia aprendida, ou peças de ferro forjadas, ou vila madura com fundição + moinho/escrita).
  if (
    k.has('siderurgia') ||
    c.madeIron >= 1 ||
    (k.has('fundicao') && c.madeBronze >= 2 && (k.has('escrita') || k.has('moinho') || k.has('cavalaria') || c.tier >= 2))
  ) {
    const sub =
      (k.has('siderurgia') ? 0.3 : 0) +
      (c.madeIron >= 1 ? Math.min(0.35, c.madeIron / 10) : 0) +
      (k.has('escrita') ? 0.15 : 0) +
      (k.has('moinho') ? 0.1 : 0) +
      (k.has('cavalaria') ? 0.1 : 0);
    return 2 + Math.min(0.99, sub);
  }

  // Etapa 1: Bronze (fundição aprendida, ou peças de cobre/bronze feitas, ou cerâmica + domesticação/tecelagem com lavoura/rebanho).
  if (
    k.has('fundicao') ||
    c.madeBronze >= 1 ||
    (k.has('ceramica') && (k.has('domesticacao') || k.has('tecelagem') || k.has('roda')) && (c.fields > 0 || c.herd || c.tier >= 1))
  ) {
    const sub =
      (k.has('fundicao') ? 0.3 : 0) +
      Math.min(0.3, c.madeBronze / 6) +
      (c.smithy ? 0.15 : 0) +
      Math.min(0.24, count * 0.05);
    return 1 + Math.min(0.99, sub);
  }

  // Etapa 0: Pedra (sobe de 0 a 0,95 conforme faz ferramentas de pedra, planta, abre porto e descobre as primeiras técnicas).
  const stoneProgress =
    (c.tools > 0 ? 0.15 : 0) +
    (c.fields > 0 ? 0.2 : 0) +
    (c.port ? 0.15 : 0) +
    (c.herd ? 0.15 : 0) +
    Math.min(0.3, count * 0.15);
  return Math.min(0.95, stoneProgress);
}

/** O que falta na sequência lógica para o assentamento dar o próximo salto material (para o painel). */
export function nextStepText(c: {
  techs: ReadonlySet<string>;
  era: number;
  tools: number;
  wet: boolean;
  smithy: boolean;
  softOre: boolean;
  ironOre: boolean;
  coal: boolean;
  pendingTech?: string;
  discovererName?: string;
}): string | null {
  if (c.pendingTech && c.discovererName) {
    const t = TECH_BY_ID[c.pendingTech];
    if (t) return `${c.discovererName} descobriu ${t.name} e está ensinando a aldeia`;
  }
  const k = c.techs;
  if (c.tools < 1) return 'fazer ferramentas iniciais de pedra e madeira';
  if (!k.has('ceramica')) return c.wet ? 'experimentar barro e fogo (Cerâmica)' : 'buscar água ou comércio para aprender Cerâmica';
  if (!k.has('fundicao')) return c.softOre ? 'experimentar fornos com minério (Fundição de cobre/bronze)' : 'encontrar cobre ou estanho para experimentar a Fundição';
  if (!c.smithy) return 'juntar madeira e pedra para erguer uma Ferraria';
  if (!k.has('siderurgia')) return c.ironOre ? 'forjar bronze e experimentar a Fundição de ferro na ferraria' : 'encontrar uma jazida de ferro';
  if (!k.has('aco')) return 'trabalhar ferro e pedra para dominar o Aço e alvenaria';
  if (!k.has('vapor')) return c.coal ? 'experimentar máquinas a vapor com carvão e aço' : 'encontrar carvão mineral para o Vapor';
  return null;
}

/** Recursos conhecidos que ainda não se usam por falta de técnica ou ferramenta anterior (RF-VIDA-272). */
export function latentResources(c: { wet: boolean; ores: string[]; era: number; techs: ReadonlySet<string>; herbivores: boolean; tools?: boolean }): string[] {
  const out: string[] = [];
  if (c.wet && !c.techs.has('ceramica')) out.push('barro (falta descobrir a cerâmica)');
  if (c.herbivores && !c.techs.has('domesticacao')) out.push('animais da região (falta a domesticação)');
  if ((c.ores.includes('copper') || c.ores.includes('tin') || c.ores.includes('gold')) && !c.techs.has('fundicao')) {
    out.push('cobre/estanho (falta cerâmica e fundição)');
  }
  if (c.ores.includes('iron') && !c.techs.has('siderurgia')) {
    out.push('ferro (exige antes dominar a fundição de cobre/bronze e a siderurgia)');
  }
  if (c.ores.includes('coal') && !c.techs.has('aco')) {
    out.push('carvão (exige dominar a fundição de ferro e o aço)');
  }
  return out;
}

