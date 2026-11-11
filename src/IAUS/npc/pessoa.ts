/**
 * A pessoa para a IA: um `AiEntity` com traços, laços e um corpo.
 *
 * O cérebro (o `Brain` do IAUS) só pensa: pontua as decisões e escolhe. Quem age é o **corpo**, a porta para o
 * mundo onde a pessoa vive (o jogo, o laboratório da sociedade, um teste). Cada Behavior Type chama
 * `corpo.agir(nome, ctx, dt)`; o mundo faz a coisa (andar, cortar a árvore, pagar o lenhador) e responde se
 * terminou, se continua ou se não deu. Assim os mesmos comportamentos servem a qualquer mundo.
 */
import { AiEntity, type AiEntityInit } from '../aiEntity';
import type { ContextInfo } from '../context';
import { WOT } from './vocab';

export type Resultado = 'feito' | 'continua' | 'falhou';

/** O que o mundo faz quando a pessoa decide (a "mão" do cérebro). */
export interface Corpo {
  /**
   * Executa um passo da ação `acao` (o nome do Behavior Type ou `habilidade:<id>`) no contexto da decisão.
   * Chamado na escolha (`dt` = 0) e, para as contínuas, a cada passo do mundo até devolver `feito` ou `falhou`.
   */
  agir(acao: string, ctx: ContextInfo, dt: number): Resultado;
}

/** Um corpo que não faz nada (para pensar sem agir: decisões anuais, o "e se" da ficha). */
export const CORPO_PARADO: Corpo = { agir: () => 'feito' };

export interface PessoaInit extends Omit<AiEntityInit, 'type'> {
  tracos?: Record<string, number>;
  corpo?: Corpo;
}

export class Pessoa extends AiEntity {
  /** Laços com outras pessoas, pelo id: de −100 (inimigo) a 100 (inseparável). */
  readonly lacos = new Map<number, number>();
  corpo: Corpo;

  constructor(init: PessoaInit) {
    super({ ...init, type: WOT.pessoa });
    this.corpo = init.corpo ?? CORPO_PARADO;
    for (const [k, v] of Object.entries(init.tracos ?? {})) this.setStat(`tr.${k}`, v);
  }

  /** Traço de −1 a 1. */
  traco(nome: string): number {
    return this.stat(`tr.${nome}`);
  }
  laco(id: number): number {
    return this.lacos.get(id) ?? 0;
  }
  ajustarLaco(id: number, delta: number): number {
    const v = Math.max(-100, Math.min(100, this.laco(id) + delta));
    this.lacos.set(id, v);
    return v;
  }
}

export const ehPessoa = (e: AiEntity | null | undefined): e is Pessoa => !!e && e instanceof Pessoa;

/** Compatibilidade de jeito entre duas pessoas, de −1 a 1 (traços parecidos se dão bem; a gentileza ajuda). */
export function compatibilidade(a: Pessoa, b: Pessoa): number {
  const nomes = ['sociability', 'kindness', 'curiosity', 'faith', 'familism', 'aggression', 'ambition', 'patience'];
  let s = 0;
  for (const n of nomes) s += 1 - Math.abs(a.traco(n) - b.traco(n));
  const base = s / nomes.length; // 0 a 1
  const gentis = (a.traco('kindness') + b.traco('kindness')) / 4;
  const brigoes = (Math.max(0, a.traco('aggression')) + Math.max(0, b.traco('aggression'))) / 4;
  return Math.max(-1, Math.min(1, (base - 0.5) * 2 + gentis - brigoes));
}

/** Quanto os traços combinam com um perfil (`{ strength: 0.5, ... }`), de −1 a 1. */
export function jeitoPara(p: AiEntity, perfil: Partial<Record<string, number>>): number {
  let s = 0;
  let w = 0;
  for (const [t, k] of Object.entries(perfil)) {
    if (k === undefined) continue;
    s += p.stat(`tr.${t}`) * k;
    w += Math.abs(k);
  }
  return w ? s / w : 0;
}

/** Um lugar (assentamento) como alvo: além dos stats, quem mora nele (para contar amigos e parentes lá). */
export class Lugar extends AiEntity {
  readonly moradores = new Set<number>();
  constructor(init: Omit<AiEntityInit, 'type'>) {
    super({ ...init, type: WOT.assentamento });
  }
}

export const ehLugar = (e: AiEntity | null | undefined): e is Lugar => !!e && e instanceof Lugar;
