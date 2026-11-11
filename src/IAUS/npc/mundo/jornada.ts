/**
 * Jornada no mundo agregado (plano dos assentamentos, RF-AS-20 a 30): a cada tarefa terminada, a pessoa olha o
 * quadro do assentamento (o que ele precisa agora, com prioridade e vagas) e as próprias necessidades (fome,
 * descanso, convívio e fé) e escolhe a próxima jornada. O ofício pesa muito, mas na urgência qualquer adulto
 * ajuda. É o pacote O que o lugar pede (12) com as necessidades do Corpo e da Mente, na escala de uma jornada.
 */
import { c, pacote } from '../dsl';
import { curva } from '../curvas';
import { E } from '../entradas';
import { TRAIT, TRAIT_COUNT, type Trait } from '../pessoa/traits';
import { WOT } from '../vocab';
import { DAY_W } from './ajustes';
import { Decisor, topFactors, type Choice } from './decisor';

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

/** As considerations de uma tarefa do quadro (o alvo é a tarefa; os stats vêm do adaptador). */
const daTarefa = () => [
  // O diligente pesa a prioridade mais forte; o preguiçoso quase não liga para ela.
  c('prioridade', E.alvo, curva.sobe(DAY_W.prioFloor, 1), { stat: 'prioridade' }),
  c('ofício', E.alvo, curva.sobe(), { stat: 'oficio' }),
  // O preguiçoso pega o que está mais perto.
  c('perto', E.alvo, curva.sobe(0.2, 1), { stat: 'perto' }),
  c('amigos', E.alvo, curva.sobe(0.85, 1), { stat: 'amigos' }),
];

const ACT = { eat: 0, rest: 1, social: 2, pray: 3, task: 4, urgent: 5 } as const;

/** Pacote 34: as necessidades (Self) e as tarefas do quadro (cada tarefa aberta é um alvo). */
export const JORNADA = pacote(
  { id: 34, nome: 'Jornada', camada: 'Sustento', descricao: 'Mundo agregado: ao fim de cada tarefa, a próxima jornada entre as necessidades e o quadro do lugar.' },
  [
    { nome: 'Comer (jornada)', descricao: 'A fome aperta.', tipo: 'Comer', contexto: 'eu', peso: DAY_W.need, considera: [c('fome', E.eu, curva.limiar(0.55, 10), { stat: 'fome' })] },
    {
      nome: 'Descansar em casa (jornada)',
      descricao: 'Cansado; o preguiçoso descansa antes.',
      tipo: 'Dormir',
      contexto: 'eu',
      peso: DAY_W.need,
      considera: [c('cansaço', E.eu, curva.limiar(0.7, 10), { stat: 'cansaco' }), c('disposição', E.eu, curva.traco(0.3), { stat: 'preguica' })],
    },
    {
      nome: 'Conversar na praça (jornada)',
      descricao: 'Sozinho há tempo, e mais se for sociável.',
      tipo: 'Conversar',
      contexto: 'eu',
      peso: DAY_W.need * 0.8,
      considera: [c('solidão', E.eu, curva.limiar(0.7, 10), { stat: 'solidao' }), c('sociável', E.eu, curva.traco(0.6), { stat: 'tr.sociability' })],
    },
    {
      nome: 'Rezar no templo (jornada)',
      descricao: 'Há templo e a fé chama, mais no devoto.',
      tipo: 'Rezar',
      contexto: 'eu',
      peso: DAY_W.need * 0.8,
      considera: [c('fé', E.eu, curva.limiar(0.7, 10), { stat: 'fe' }), c('devoto', E.eu, curva.traco(0.8), { stat: 'tr.faith' })],
    },
    { nome: 'Pegar uma tarefa do quadro (jornada)', descricao: 'Prioridade, ofício, distância e amigos na mesma tarefa.', tipo: 'FazerTarefa', contexto: 'alvo', alvos: [WOT.tarefa], considera: daTarefa() },
    {
      nome: 'Acudir uma tarefa urgente (jornada)',
      descricao: 'Colheita, fogo, muralha ou alarme: qualquer adulto ajuda.',
      tipo: 'FazerTarefa',
      contexto: 'alvo',
      alvos: [WOT.tarefa],
      peso: DAY_W.urgent,
      considera: daTarefa(),
    },
  ],
);

/** Faixa do sorteio da jornada: entram as opções com nota de pelo menos 85% da melhor. */
export const DAY_BAND = 0.85;

let decisor: Decisor | null = null;

/** Escolhe a próxima jornada (RF-AS-22 e 25). Sem tarefa nem necessidade, devolve null (fica pela praça). */
export function chooseDay(ctx: DayContext, rnd: () => number): Choice<DayAction> | null {
  const dil = traitOf(ctx, 'diligence');
  const soc = traitOf(ctx, 'sociability');
  const opcoes = [
    { comportamento: ACT.eat, acao: { kind: DAY.eat } as DayAction, rotulo: DAY_NAMES[DAY.eat] },
    { comportamento: ACT.rest, acao: { kind: DAY.rest } as DayAction, rotulo: DAY_NAMES[DAY.rest] },
    { comportamento: ACT.social, acao: { kind: DAY.social } as DayAction, rotulo: DAY_NAMES[DAY.social] },
  ] as { comportamento: number; acao: DayAction; rotulo: string; alvo?: Record<string, number> }[];
  if (ctx.temple) opcoes.push({ comportamento: ACT.pray, acao: { kind: DAY.pray }, rotulo: DAY_NAMES[DAY.pray] });
  // Ninguém pega uma tarefa cheia (RF-AS-22).
  for (const t of ctx.tasks) {
    if (t.task.taken >= t.task.slots) continue;
    const task = t.task;
    opcoes.push({
      comportamento: task.urgent ? ACT.urgent : ACT.task,
      acao: { kind: task.kind, task },
      rotulo: task.label,
      alvo: {
        prioridade: task.prio ** (1 + 0.5 * dil),
        oficio: task.role < 0 || task.role === ctx.role ? 1 : task.urgent ? DAY_W.helpUrgent : DAY_W.helpOther,
        perto: 1 - t.dist / (DAY_W.far * (1 + 0.4 * dil)),
        amigos: (Math.min(1, ctx.friends(task) / 2) * (soc + 1)) / 2,
      },
    });
  }
  decisor ??= new Decisor(JORNADA);
  const c = decisor.decidir(
    { fome: ctx.hunger, cansaco: ctx.rest, preguica: -dil, solidao: ctx.social, 'tr.sociability': soc, fe: ctx.faith, 'tr.faith': traitOf(ctx, 'faith') },
    opcoes,
    rnd,
    DAY_BAND,
  );
  if (!c || c.pick.score < DAY_W.floor) return null;
  return c;
}

/** O porquê na ficha (RF-AS-30): "escolheu colher a roça 3: prioridade 0,92 · ofício 1". */
export function dayWhy(c: Choice<DayAction>): string {
  return `escolheu ${c.pick.label}: ${topFactors(c.pick.factors)}`;
}
