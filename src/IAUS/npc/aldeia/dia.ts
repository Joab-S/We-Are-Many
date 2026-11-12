/**
 * O que a pessoa da aldeia está fazendo agora, num número: a tela anima o gesto (`GESTURE_OF`), a ficha escreve
 * o nome e as contas do dia (tempo trabalhando, parado) leem daqui. Quem escolhe é o cérebro (pacotes.ts); isto
 * só nomeia o resultado.
 */
/** Atividades. De 1 a 15, trabalho; de 16 em diante, necessidades, convívio e eventos. */
export const DAY = {
  none: 0,
  /** Trabalho do ofício no posto (roça, mata, mina, oficina, porto, templo, mercado). */
  work: 1,
  /** Colher a roça na safra (todos ajudam na colheita coletiva). */
  harvest: 2,
  /** Levar ao celeiro o que ficou no pátio (produção só por entrega). */
  haul: 3,
  /** Bater na obra (mutirão quando o lugar chama). */
  build: 4,
  /** Buscar água no poço ou no rio. */
  water: 5,
  /** Apagar incêndio com baldes. */
  bucket: 6,
  /** Pegar a lança no alarme (milícia). */
  militia: 7,
  eat: 16,
  rest: 17,
  social: 18,
  pray: 19,
  /** Correr para dentro da muralha ou da praça num ataque (quem não luta). */
  shelter: 20,
  /** Festa da colheita, feira ou casamento de líderes na praça. */
  festival: 21,
  /** Enterro de alguém do lugar. */
  funeral: 22,
  /** Ver a caravana que chegou à praça. */
  curious: 23,
} as const;
export type DayKind = (typeof DAY)[keyof typeof DAY];

export const DAY_NAMES: Record<number, string> = {
  [DAY.none]: 'sem tarefa',
  [DAY.work]: 'trabalhar no ofício',
  [DAY.harvest]: 'colher a roça',
  [DAY.haul]: 'levar a carga ao celeiro',
  [DAY.build]: 'ajudar na obra',
  [DAY.water]: 'buscar água',
  [DAY.bucket]: 'apagar o fogo com baldes',
  [DAY.militia]: 'pegar a lança no alarme',
  [DAY.eat]: 'comer',
  [DAY.rest]: 'descansar em casa',
  [DAY.social]: 'conversar na praça',
  [DAY.pray]: 'rezar no templo',
  [DAY.shelter]: 'se abrigar',
  [DAY.festival]: 'ir à festa',
  [DAY.funeral]: 'ir ao enterro',
  [DAY.curious]: 'ver a caravana',
};

