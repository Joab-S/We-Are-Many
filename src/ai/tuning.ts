/**
 * Pesos da IA local num lugar só: é aqui que se ajusta o comportamento das pessoas.
 * Cada perfil diz quanto cada traço (−1 a 1) puxa para uma escolha.
 */
import type { Role } from '../sim/roles';
import type { Trait } from './traits';

/** Quanto cada traço combina com cada ofício (soma ponderada; positivo = combina). */
export const ROLE_FIT: Partial<Record<Role, Partial<Record<Trait, number>>>> = {
  gatherer: { curiosity: 0.2, sociability: 0.2, patience: 0.1 },
  hunter: { courage: 0.5, strength: 0.4, patience: -0.2, aggression: 0.2 },
  farmer: { patience: 0.5, diligence: 0.3, attachment: 0.3 },
  woodcutter: { strength: 0.5, diligence: 0.3 },
  builder: { strength: 0.3, dexterity: 0.4, diligence: 0.3 },
  miner: { strength: 0.5, courage: 0.2, curiosity: 0.2 },
  blacksmith: { dexterity: 0.5, strength: 0.3, patience: 0.2 },
  fisher: { patience: 0.5, courage: 0.2, sociability: -0.1 },
  shepherd: { patience: 0.4, kindness: 0.3, sociability: -0.2 },
  horsekeeper: { kindness: 0.3, courage: 0.3, patience: 0.2 },
  weaver: { dexterity: 0.5, patience: 0.3 },
  potter: { dexterity: 0.5, patience: 0.2, curiosity: 0.1 },
  miller: { diligence: 0.4, patience: 0.3 },
  merchant: { charisma: 0.4, greed: 0.4, sociability: 0.3, attachment: -0.3 },
  priest: { faith: 0.7, kindness: 0.2, charisma: 0.2 },
};

/** Escolha de ofício: peso da falta no lugar, do jeito (traços e aptidão), da tradição da família e do apego ao ofício atual. */
export const PROFESSION = {
  /** Nota mínima da falta (um ofício sem falta nenhuma ainda pode ser escolhido por gosto). */
  demandFloor: 0.25,
  /** Falta = (1 − atendimento) × needScale: com 60% atendido a falta já é total. */
  needScale: 2.5,
  /** Nota mínima do quão comum o ofício é na era (o peso do sorteio antigo, dividido pelo maior). */
  commonFloor: 0.2,
  /** Parte dos adultos num ofício a partir da qual ele parece cheio. */
  crowdShare: 0.35,
  /** Quanto o traço pesa na nota (0 = nada, 1 = do dobro à metade). */
  fitStrength: 0.8,
  /** Bônus de seguir o ofício do pai ou da mãe (cresce com o traço família, cai com a curiosidade). */
  tradition: 0.35,
  /** Bônus de ficar no ofício atual (cresce com a paciência): trocar custa. */
  stay: 0.6,
  /** Bônus do ofício da vocação do lugar. */
  vocation: 0.25,
  /** Na falta, quanto pesa o traço combinar mais com o ofício novo, e a abertura (curiosidade − paciência), ao lado do jeito (0 a 1). */
  switchFit: 0.6,
  switchOpen: 0.2,
  /** Quem trocou de ofício há menos de settleYears anos perde até `settle` da vontade de trocar de novo. */
  settleYears: 12,
  settle: 1.2,
};

/** Vida social de um ano (src/ai/decisions/social.ts). Valores dos laços de −100 a 100. */
export const SOCIAL = {
  /** Encontros por ano além do primeiro, vezes (1 + sociabilidade): de 1 a 5. */
  meets: 2,
  /** Parte dos encontros com quem já conhece (o resto é gente nova do lugar). */
  familiar: 0.7,
  /** Quanto um encontro muda o laço, vezes a compatibilidade (+ warmth: conviver aproxima um pouco). */
  meet: 14,
  warmth: 0.25,
  /** Gentileza aproxima e agressividade afasta, em pontos por encontro. */
  kind: 3,
  mean: 5,
  /** Acaso de cada encontro (um dia ruim, uma ajuda inesperada). */
  noise: 12,
  /** Laço a partir do qual vira amizade ou rivalidade. */
  friend: 40,
  rival: -35,
  /** Amizade que vira namoro (os dois lados) e a chance por ano de casar, vezes 1 + família. */
  love: 70,
  marry: 0.35,
  /** Chance de briga por encontro entre rivais, vezes a soma da agressividade dos dois. */
  fight: 0.25,
  /** Quanto o laço guarda por ano sem se ver, e abaixo de quanto some. */
  fade: 0.92,
  forget: 4,
  /** Energia que cada um perde numa briga. */
  fightCost: 0.15,
  /** Natalidade de quem é casado e de quem não é (com uns 50% de casados a média fica perto de 1). */
  coupleBirth: 1.6,
  singleBirth: 0.4,
};

/** Escolha do líder e temperamento do rei (src/ai/decisions/leader.ts). */
export const LEADER = {
  /** Força do carisma e da ambição na nota (0 = nada, 1 = do nada ao dobro). */
  charisma: 0.9,
  ambition: 0.6,
  /** Nota de quem já é idoso (ou jovem demais). */
  oldAge: 0.35,
  /** Amigos para a nota cheia, e a nota de quem não tem nenhum. */
  friendsFull: 4,
  noFriends: 0.5,
  /** Nota de quem não é herdeiro num reino (perto de 0: a coroa passa na família, se houver alguém). */
  commoner: 0.15,
  /** Faixa da escolha: candidatos com pelo menos isso da melhor nota entram no sorteio. */
  band: 0.8,
  /** Peso de cada traço no temperamento do líder para a guerra. */
  aggression: 0.5,
  ambitionWar: 0.25,
  kindness: 0.3,
  patience: 0.15,
  /** Quanto o temperamento do rei soma à agressividade do reino (−1 a 1). */
  temper: 0.5,
};

/** Jornadas (src/ai/decisions/day.ts, plano novo dos assentamentos RF-AS-22 e 25). */
export const DAY_W = {
  /** Peso de uma tarefa urgente (colheita, fogo, alarme) e de uma necessidade pessoal. */
  urgent: 1.6,
  need: 1.4,
  /** Nota mínima da prioridade (tarefa de prioridade 0 ainda vale um pouco). */
  prioFloor: 0.25,
  /** Nota do ofício quando a tarefa é de outro: na urgência todo mundo ajuda, fora dela quase ninguém. */
  helpUrgent: 0.7,
  helpOther: 0.08,
  /** Distância (tiles) em que "perto" chega ao piso. */
  far: 40,
  /** Abaixo disso não vale sair: a pessoa fica pela praça (conta como parada). */
  floor: 0.03,
};
