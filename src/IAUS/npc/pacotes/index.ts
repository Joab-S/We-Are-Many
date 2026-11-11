/**
 * Todos os pacotes de comportamento, organizados em camadas, e os cérebros (Brain Seeds) que nascem com eles.
 *
 * | Camada | Pacotes |
 * |---|---|
 * | Corpo | Sobrevivência (1), Descanso (2), Movimento (3) |
 * | Mente | Tédio e entretenimento (4), Percepção e marcação (5) |
 * | Vínculos | Vida social (6), Família (7), Infância (17) |
 * | Lugar | Moradia (8), Ficar, mudar ou fundar (9) |
 * | Sustento | Fazer eu mesmo (10), Ofício (11), O que o lugar pede (12), pacotes de habilidade dos ofícios (100+) |
 * | Troca | Comércio e contratação (13) |
 * | Sociedade | Cidadania (14), Governo (15), Defesa (16) |
 *
 * O cérebro troca de pacotes em grupo quando a vida muda (`ajustarPacotes`): a criança que cresce perde a
 * Infância e ganha o Ofício e a Cidadania; quem é eleito ganha o Governo e o perde ao sair; quem passa a praticar
 * um ofício ganha o pacote de habilidade dele.
 */
import type { AiEntity, World } from '../../aiEntity';
import { Brain, BrainLibrary, type BrainOptions } from '../../brain';
import type { Behavior } from '../../behavior';
import type { AbilityPackage, BehaviorPackage } from '../../packs';
import { meuOficio } from '../entradas';
import type { Pacote } from '../dsl';
import { TAG } from '../vocab';
import { DESCANSO, MOVIMENTO, SOBREVIVENCIA } from './corpo';
import { OCIO, PERCEPCAO } from './mente';
import { FAMILIA, INFANCIA, SOCIAL } from './vinculos';
import { MORADIA, MUDANCA } from './lugar';
import { HABILIDADES, MATO, OFICIO, QUADRO, TRABALHAR_NO_OFICIO } from './sustento';
import { COMERCIO } from './troca';
import { CIDADANIA, DEFESA, GOVERNO } from './sociedade';
import { PACOTES_DO_MUNDO } from '../mundo/index';

export { DESCANSO, MOVIMENTO, SOBREVIVENCIA, OCIO, PERCEPCAO, FAMILIA, INFANCIA, SOCIAL, MORADIA, MUDANCA, HABILIDADES, MATO, OFICIO, QUADRO, TRABALHAR_NO_OFICIO, COMERCIO, CIDADANIA, DEFESA, GOVERNO };

/** Os pacotes na ordem das camadas. */
export const PACOTES: Pacote[] = [SOBREVIVENCIA, DESCANSO, MOVIMENTO, OCIO, PERCEPCAO, SOCIAL, FAMILIA, INFANCIA, MORADIA, MUDANCA, MATO, OFICIO, QUADRO, COMERCIO, CIDADANIA, GOVERNO, DEFESA];

export const CAMADAS = ['Corpo', 'Mente', 'Vínculos', 'Lugar', 'Sustento', 'Troca', 'Sociedade'] as const;

/** Cérebros de nascença (Brain Seeds): os pacotes de cada fase da vida. */
export const CEREBRO = {
  andarilho: 1,
  morador: 2,
  crianca: 3,
  idoso: 4,
  lider: 5,
} as const;
export type CerebroId = (typeof CEREBRO)[keyof typeof CEREBRO];

const ids = (...p: Pacote[]) => p.map((x) => x.id);
const SEEDS: { id: CerebroId; name: string; description: string; packs: number[] }[] = [
  {
    id: CEREBRO.andarilho,
    name: 'Andarilho',
    description: 'Adulto sem lugar: sobreviver, achar onde ficar, conhecer gente.',
    packs: ids(SOBREVIVENCIA, DESCANSO, MOVIMENTO, OCIO, PERCEPCAO, SOCIAL, FAMILIA, MORADIA, MATO, COMERCIO),
  },
  {
    id: CEREBRO.morador,
    name: 'Morador',
    description: 'Adulto que mora num lugar: tudo do andarilho, mais ofício, o que o lugar pede, mudança, cidadania e defesa.',
    packs: ids(SOBREVIVENCIA, DESCANSO, MOVIMENTO, OCIO, PERCEPCAO, SOCIAL, FAMILIA, MORADIA, MUDANCA, MATO, OFICIO, QUADRO, COMERCIO, CIDADANIA, DEFESA),
  },
  { id: CEREBRO.crianca, name: 'Criança', description: 'Brincar, ficar perto dos pais, aprender olhando.', packs: ids(SOBREVIVENCIA, DESCANSO, MOVIMENTO, OCIO, PERCEPCAO, SOCIAL, INFANCIA) },
  {
    id: CEREBRO.idoso,
    name: 'Idoso',
    description: 'Sem o trabalho pesado e a defesa; ensina, conversa, vota.',
    packs: ids(SOBREVIVENCIA, DESCANSO, MOVIMENTO, OCIO, PERCEPCAO, SOCIAL, FAMILIA, MORADIA, MUDANCA, OFICIO, COMERCIO, CIDADANIA),
  },
  {
    id: CEREBRO.lider,
    name: 'Líder',
    description: 'Morador eleito: ganha o pacote do governo.',
    packs: ids(SOBREVIVENCIA, DESCANSO, MOVIMENTO, OCIO, PERCEPCAO, SOCIAL, FAMILIA, MORADIA, MUDANCA, MATO, OFICIO, QUADRO, COMERCIO, CIDADANIA, GOVERNO, DEFESA),
  },
];
for (const s of SEEDS) if (!BrainLibrary.brains.has(s.id)) BrainLibrary.brains.set(s.id, { id: s.id, name: s.name, description: s.description, behaviorPackIds: s.packs, abilityPackIds: [] });

/** Qual cérebro de nascença a pessoa deve ter agora, pelas tags. */
export function cerebroDe(p: AiEntity, now = 0): CerebroId {
  if (p.tags.has(TAG.crianca, now)) return CEREBRO.crianca;
  if (p.tags.has(TAG.lider, now)) return CEREBRO.lider;
  if (p.tags.has(TAG.idoso, now)) return CEREBRO.idoso;
  if (p.tags.has(TAG.morador, now)) return CEREBRO.morador;
  return CEREBRO.andarilho;
}

/** Cria o cérebro de uma pessoa com os pacotes da fase dela. */
export function criarCerebro(p: AiEntity, world: World, options?: BrainOptions): Brain {
  const brain = Brain.fromSeed(cerebroDe(p, world.now()), p, world, options);
  ajustarPacotes(brain);
  return brain;
}

/**
 * Troca os pacotes em grupo quando a vida da pessoa muda: fase (criança, adulto, idoso), moradia (andarilho ou
 * morador), liderança e ofício (pacote de habilidade). Devolve true se mudou alguma coisa.
 */
export function ajustarPacotes(brain: Brain): boolean {
  const seed = BrainLibrary.brains.get(cerebroDe(brain.owner, brain.world.now()))!;
  let changed = false;
  const want = new Set(seed.behaviorPackIds);
  for (const p of [...brain.behaviorPacks]) {
    if (!want.has(p.id)) {
      brain.removeBehaviorPack(p.id);
      changed = true;
    }
  }
  for (const id of want) {
    if (!brain.behaviorPacks.some((p) => p.id === id)) {
      brain.addBehaviorPack(BrainLibrary.behaviorPackages.get(id)!);
      changed = true;
    }
  }
  const o = meuOficio(brain.owner);
  const ability = o && !brain.owner.tags.has(TAG.crianca) ? HABILIDADES[o] : null;
  for (const p of [...brain.abilityPacks]) {
    if (p !== ability) {
      brain.removeAbilityPack(p.id);
      changed = true;
    }
  }
  if (ability && !brain.abilityPacks.includes(ability)) {
    brain.addAbilityPack(ability);
    changed = true;
  }
  return changed;
}

/** Um comportamento com o pacote e a camada a que pertence (para a lista e o grafo). */
export interface ItemDoCatalogo {
  camada: string;
  pacote: string;
  pacoteId: number;
  comportamento: Behavior;
  /** Do mundo agregado (o Ecosystem decide uma vez por ano ou por jornada), não da pessoa com corpo. */
  mundo?: boolean;
}

/** Todos os comportamentos, por camada e pacote (os da pessoa com corpo e, no fim, os do mundo agregado). */
export function catalogo(): ItemDoCatalogo[] {
  const out: ItemDoCatalogo[] = [];
  for (const p of PACOTES) for (const b of p.comportamentos) out.push({ camada: p.camada, pacote: p.nome, pacoteId: p.id, comportamento: b });
  out.push({ camada: 'Sustento', pacote: 'Pacotes de habilidade dos ofícios', pacoteId: 100, comportamento: TRABALHAR_NO_OFICIO });
  for (const p of PACOTES_DO_MUNDO) for (const b of p.comportamentos) out.push({ camada: p.camada, pacote: p.nome, pacoteId: p.id, comportamento: b, mundo: true });
  return out;
}

/** O pacote do IAUS de cada id (para quem monta cérebros à mão). */
export const pacoteDoIAUS = (id: number): BehaviorPackage | undefined => BrainLibrary.behaviorPackages.get(id);
export const habilidadesDoIAUS = (id: number): AbilityPackage | undefined => BrainLibrary.abilityPackages.get(id);
