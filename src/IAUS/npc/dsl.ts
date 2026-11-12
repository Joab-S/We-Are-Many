/**
 * Um jeito curto de escrever comportamentos e pacotes. Cada pacote tem um id (1, 2, 3...) e os comportamentos
 * dele ganham ids na faixa do pacote (pacote 3 → 301, 302...), então acrescentar um comportamento no fim de
 * um pacote não muda o id de nenhum outro. Tudo vai para a biblioteca do IAUS (`BrainLibrary`): um cérebro
 * que tem o pacote recebe na hora qualquer comportamento novo dele.
 */
import { Behavior } from '../behavior';
import { BrainLibrary } from '../brain';
import { BehaviorTypes } from '../behaviorTypes';
import { ConsiderationDef } from '../consideration';
import { ContextType, DurationType, InputParameter } from '../enums';
import { AbilityPackage, BehaviorPackage } from '../packs';
import type { Curva } from './curvas';
import './entradas';
import './tipos';
import type { Wot } from './vocab';

/** Sobre quem o comportamento é pontuado e executado (Context Type do IAUS). */
export type Contexto = 'eu' | 'alvo' | 'alvoEmMim' | 'sozinho' | 'lugar';
const CTX: Record<Contexto, ContextType> = {
  eu: ContextType.Self,
  alvo: ContextType.SingleTarget,
  alvoEmMim: ContextType.SingleTargetOnSelf,
  sozinho: ContextType.StandAlone,
  lugar: ContextType.LocationTarget,
};

export interface Opcoes {
  stat?: string;
  tag?: string;
  /** Valor da entrada `Constant` ou o raio de `EnemyCountNear`. */
  valor?: number;
  behaviorType?: string;
}

/** Uma consideração: nome (aparece no porquê), entrada, curva e o que a entrada precisa. */
export function c(nome: string, entrada: string, curva: Curva, op: Opcoes = {}): ConsiderationDef {
  const values: Partial<Record<InputParameter, number>> = {};
  if (curva.min !== undefined) values[InputParameter.RangeMin] = curva.min;
  if (curva.max !== undefined) values[InputParameter.RangeMax] = curva.max;
  if (op.valor !== undefined) values[InputParameter.Value] = op.valor;
  return { name: nome, input: entrada, curve: curva.curve, params: { values, stat: op.stat, tag: op.tag, behaviorType: op.behaviorType } };
}

/** Momentum padrão das ações contínuas: só troca no meio quem vale bem mais (ver `foco`). */
export const FOCO = 1.6;

export interface ComportamentoDef {
  nome: string;
  descricao: string;
  /** Behavior Type (o botão). */
  tipo: string;
  contexto: Contexto;
  /** Tipos de alvo que entram (só para `alvo` e `alvoEmMim`). */
  alvos?: Wot[];
  /** Instantâneo (padrão) ou contínuo. */
  continuo?: boolean;
  /** Peso: 1 ambiente/ócio, 2 útil/social, 3 trabalho e combate, 5 emergência. */
  peso?: number;
  /**
   * Foco (o momentum do IAUS): quanto a ação contínua em andamento vale a mais enquanto dura, para não ser
   * largada pela metade por qualquer coisa parecida. Padrão `FOCO` (1.6).
   */
  foco?: number;
  params?: Record<string, number | string | boolean>;
  considera: ConsiderationDef[];
}

export interface PacoteDef {
  id: number;
  nome: string;
  descricao: string;
  /** Camada lógica (para a lista e para agrupar no grafo). */
  camada: string;
}

export interface Pacote extends PacoteDef {
  pacote: BehaviorPackage;
  comportamentos: Behavior[];
}

/** Monta um pacote de comportamentos e registra tudo na biblioteca do IAUS. */
export function pacote(def: PacoteDef, lista: ComportamentoDef[]): Pacote {
  if (BrainLibrary.behaviorPackages.has(def.id)) {
    const p = BrainLibrary.behaviorPackages.get(def.id)!;
    return { ...def, pacote: p, comportamentos: [...p.behaviors] };
  }
  const comportamentos = lista.map((b, k) => {
    if (!BehaviorTypes.has(b.tipo)) throw new Error(`Comportamento "${b.nome}": tipo "${b.tipo}" não registrado`);
    const id = def.id * 100 + k + 1;
    const behavior = new Behavior({
      id,
      name: b.nome,
      description: b.descricao,
      behaviorType: b.tipo,
      contextType: CTX[b.contexto],
      duration: b.continuo ? DurationType.Continuous : DurationType.Instant,
      weight: b.peso ?? 1,
      momentum: b.foco ?? FOCO,
      considerations: b.considera,
      params: b.params,
      targetTypes: b.alvos,
    });
    BrainLibrary.behaviors.set(id, behavior);
    return behavior;
  });
  const p = new BehaviorPackage(def.id, def.nome, def.descricao, comportamentos);
  BrainLibrary.behaviorPackages.set(def.id, p);
  return { ...def, pacote: p, comportamentos };
}

/** Monta um pacote de habilidades (o mesmo porquê ligado a "o quês" diferentes) e registra na biblioteca. */
export function pacoteDeHabilidades(id: number, nome: string, descricao: string, pares: { comportamento: Behavior; habilidade: string }[]): AbilityPackage {
  const ja = BrainLibrary.abilityPackages.get(id);
  if (ja) return ja;
  const p = new AbilityPackage(id, nome, descricao, pares.map((x) => ({ behavior: x.comportamento, abilityId: x.habilidade })));
  BrainLibrary.abilityPackages.set(id, p);
  return p;
}
