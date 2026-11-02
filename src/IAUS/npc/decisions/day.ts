/**
 * Jornada (plano novo dos assentamentos, RF-AS-20 a 30): a camada de curto prazo da IA. A cada
 * tarefa terminada, a pessoa olha o quadro do assentamento (o que ele precisa agora, com prioridade
 * e vagas) e as próprias necessidades (fome, descanso, convívio e fé) e escolhe a próxima jornada.
 * O ofício pesa muito, mas na urgência qualquer adulto ajuda. A escolha devolve o porquê, que a
 * ficha da pessoa mostra com as duas alternativas que perderam.
 *
 * No IAUS: as necessidades (comer, descansar, conversar, rezar) são Behaviors Self; a tarefa do quadro é
 * um Behavior pontuado por tarefa (cada tarefa aberta é um alvo), com um peso maior para as urgentes.
 */
import { DAY_W } from '../tuning';
import { TRAIT, TRAIT_COUNT, type Trait } from '../traits';
import { axes, Mind, topFactors, type Choice, type OptionDef } from '../mind';

/** Tipos de jornada. Os de 1 a 15 vêm do quadro de tarefas; os de 16 em diante, das necessidades e de eventos. */
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

/** Uma tarefa do quadro do assentamento (RF-AS-21). */
export interface BoardTask {
  kind: DayKind;
  /** Tile do lugar da tarefa. */
  tile: number;
  /** Prioridade de 0 a 1, das faltas e da estação. */
  prio: number;
  /** Vagas e quantos já reservaram (RF-AS-22: ninguém pega uma tarefa cheia). */
  slots: number;
  taken: number;
  /** Ofício que faz a tarefa por costume (−1: qualquer adulto). */
  role: number;
  /** Urgente: qualquer adulto ajuda, com o ofício pesando pouco (colheita, incêndio, muralha, alarme). */
  urgent?: boolean;
  /** Texto curto da tarefa na ficha ("colher a roça 3", "levar 12 de lenha ao celeiro"). */
  label: string;
}

/** O que a pessoa sabe na hora de escolher a próxima jornada. */
export interface DayContext {
  traits: Int8Array;
  i: number;
  role: number;
  /** Necessidades de 0 (satisfeita) a 1 (urgente). */
  hunger: number;
  rest: number;
  social: number;
  faith: number;
  /** Tarefas abertas do quadro, com a distância até elas (tiles). */
  tasks: { task: BoardTask; dist: number }[];
  /** Amigos que já reservaram cada tarefa (o sociável gosta de trabalhar junto). */
  friends: (task: BoardTask) => number;
  temple: boolean;
}

/** Uma jornada escolhida: a tarefa do quadro (ou nenhuma) e o tipo. */
export interface DayAction {
  kind: DayKind;
  task?: BoardTask;
}

const traitOf = (c: DayContext, t: Trait) => c.traits[c.i * TRAIT_COUNT + TRAIT[t]] / 10;

/** O dado de cada opção: a tarefa do quadro e a distância até ela (nada, nas necessidades). */
type DayData = { task: BoardTask; dist: number } | null;
const job = (d: DayData) => d as { task: BoardTask; dist: number };

const taskConsiderations = [
  // O diligente pesa a prioridade mais forte; o preguiçoso quase não liga para ela.
  { name: 'prioridade', input: (c: DayContext, d: DayData) => job(d).task.prio ** (1 + 0.5 * traitOf(c, 'diligence')), axis: axes.linear(DAY_W.prioFloor, 1) },
  {
    name: 'ofício',
    input: (c: DayContext, d: DayData) => {
      const t = job(d).task;
      return t.role < 0 || t.role === c.role ? 1 : t.urgent ? DAY_W.helpUrgent : DAY_W.helpOther;
    },
    axis: axes.linear(0, 1),
  },
  // O preguiçoso pega o que está mais perto.
  { name: 'perto', input: (c: DayContext, d: DayData) => 1 - job(d).dist / (DAY_W.far * (1 + 0.4 * traitOf(c, 'diligence'))), axis: axes.linear(0.2, 1) },
  { name: 'amigos', input: (c: DayContext, d: DayData) => (Math.min(1, c.friends(job(d).task) / 2) * (traitOf(c, 'sociability') + 1)) / 2, axis: axes.linear(0.85, 1) },
];

const ACT = { eat: 0, rest: 1, social: 2, pray: 3, task: 4, urgent: 5 } as const;

/** A escolha da jornada no IAUS. */
const MIND = new Mind<DayContext, DayData>('jornada', [
  { name: 'comer', weight: DAY_W.need, considerations: [{ name: 'fome', input: (c) => c.hunger, axis: axes.logistic(0.55, 10) }] },
  {
    name: 'descansar',
    weight: DAY_W.need,
    considerations: [
      { name: 'cansaço', input: (c) => c.rest, axis: axes.logistic(0.7, 10) },
      { name: 'disposição', input: (c) => -traitOf(c, 'diligence'), axis: axes.trait(0.3) },
    ],
  },
  {
    name: 'conversar',
    weight: DAY_W.need * 0.8,
    considerations: [
      { name: 'solidão', input: (c) => c.social, axis: axes.logistic(0.7, 10) },
      { name: 'sociável', input: (c) => traitOf(c, 'sociability'), axis: axes.trait(0.6) },
    ],
  },
  {
    name: 'rezar',
    weight: DAY_W.need * 0.8,
    considerations: [
      { name: 'fé', input: (c) => c.faith, axis: axes.logistic(0.7, 10) },
      { name: 'devoto', input: (c) => traitOf(c, 'faith'), axis: axes.trait(0.8) },
    ],
  },
  { name: 'tarefa', targeted: true, considerations: taskConsiderations },
  { name: 'tarefa urgente', targeted: true, weight: DAY_W.urgent, considerations: taskConsiderations },
]);

/** Faixa do sorteio da jornada: entram as opções com nota de pelo menos 85% da melhor. */
export const DAY_BAND = 0.85;

/** Escolhe a próxima jornada (RF-AS-22 e 25). Sem tarefa nem necessidade, devolve null (fica pela praça). */
export function chooseDay(ctx: DayContext, rnd: () => number): Choice<DayAction> | null {
  const options: OptionDef<DayAction, DayData>[] = [
    { act: ACT.eat, action: { kind: DAY.eat }, label: DAY_NAMES[DAY.eat], data: null },
    { act: ACT.rest, action: { kind: DAY.rest }, label: DAY_NAMES[DAY.rest], data: null },
    { act: ACT.social, action: { kind: DAY.social }, label: DAY_NAMES[DAY.social], data: null },
  ];
  if (ctx.temple) options.push({ act: ACT.pray, action: { kind: DAY.pray }, label: DAY_NAMES[DAY.pray], data: null });
  // Ninguém pega uma tarefa cheia (RF-AS-22).
  for (const t of ctx.tasks) {
    if (t.task.taken >= t.task.slots) continue;
    options.push({ act: t.task.urgent ? ACT.urgent : ACT.task, action: { kind: t.task.kind, task: t.task }, label: t.task.label, data: t });
  }
  const c = MIND.decide(ctx, options, rnd, DAY_BAND);
  if (!c || c.pick.score < DAY_W.floor) return null;
  return c;
}

/** O porquê na ficha (RF-AS-30): "escolheu colher a roça 3: prioridade 0,92 · ofício 1". */
export function dayWhy(c: Choice<DayAction>): string {
  return `escolheu ${c.pick.label}: ${topFactors(c.pick.factors)}`;
}
