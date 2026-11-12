/**
 * O mundo agregado (o Ecosystem) decide uma vez por ano, ao fim de uma tarefa ou quando um lugar fica sem
 * líder: não há corpo nem ciclo de pensamento em tempo real. Para isso, cada decisão é um pacote de
 * comportamentos escrito na mesma linguagem dos outros (`pacote`, `c`, `curva`), e o `Decisor` pontua esse
 * pacote no `Brain` do IAUS:
 *
 * - quem decide é uma entidade cujos stats o Ecosystem preenche (`eu`: necessidades, traços, notas do lugar);
 * - cada opção que tem alvo (um ofício, um candidato, um lugar, uma tarefa do quadro) vira uma entidade com
 *   os stats daquela opção (`alvo`), e o comportamento é pontuado uma vez por alvo (Context Type SingleTarget);
 * - as opções sem alvo (ficar, comer, descansar) usam o próprio dono (Self).
 *
 * As entradas são só as genéricas `E.eu` e `E.alvo` (um stat), então o pacote não sabe nada do Ecosystem: o
 * adaptador de cada decisão (ofício, líder, mudança) calcula os stats. Quem pontua e sorteia é o
 * `Brain` (compensação pelo número de considerations e WeightedRandomTop dentro da faixa de cada pessoa), com
 * o gerador da simulação, então a mesma semente continua dando a mesma história.
 */
import { AiEntity, type World } from '../../aiEntity';
import { Brain, type SelectionConfig } from '../../brain';
import { SelectionMode } from '../../enums';
import { ContextInfo, Decision } from '../../context';
import type { Pacote } from '../dsl';

export interface Factor {
  name: string;
  value: number;
}

export interface Scored<A> {
  action: A;
  label: string;
  score: number;
  /** Considerations em ordem de quanto pesaram (as mais baixas puxam mais a nota para baixo). */
  factors: Factor[];
}

export interface Choice<A> {
  pick: Scored<A>;
  /** As outras opções avaliadas, da melhor para a pior. */
  others: Scored<A>[];
}

/** Uma opção do momento: qual comportamento do pacote (pela posição), o que acontece se ganhar e os stats do alvo. */
export interface Opcao<A> {
  comportamento: number;
  acao: A;
  rotulo: string;
  /** Stats do alvo (só para comportamentos com alvo). */
  alvo?: Record<string, number>;
}

/** O mundo do IAUS para as decisões agregadas: sem vizinhos nem relógio (o tempo é o da simulação). */
const MUNDO: World = { now: () => 0, entities: () => [], getEntity: () => undefined };

let proximo = 1_000_000_000;

function preencher(e: AiEntity, stats: Record<string, number>): void {
  e.stats.clear();
  for (const k in stats) e.stats.set(k, stats[k]);
}

/** Um pacote pronto para decidir: os comportamentos são os do pacote; cada chamada só troca os stats, as opções e o sorteio. */
export class Decisor {
  private readonly eu: AiEntity;
  private readonly brain: Brain;
  private readonly selecao: SelectionConfig = { mode: SelectionMode.WeightedRandomTop, withinFractionOfBest: 0.7 };
  /** Alvos reaproveitados entre chamadas, pela posição da opção. */
  private readonly alvos: AiEntity[] = [];
  private rnd: () => number = () => 0;

  constructor(readonly pacote: Pacote) {
    this.eu = new AiEntity({ id: proximo++, name: pacote.nome, type: 'pessoa' });
    this.brain = new Brain(this.eu, MUNDO, {
      selection: this.selecao,
      // Qualquer nota acima de zero entra no sorteio (sem o piso de 0,0001 do IAUS).
      minScore: Number.MIN_VALUE,
      useCompensation: true,
      // Guarda a nota de cada consideration: é o porquê que vai para o diário e para a ficha.
      debug: true,
      rng: { next: () => this.rnd() },
    });
  }

  /**
   * Pontua as opções e escolhe uma: sorteio ponderado entre as que têm nota de pelo menos `faixa` da melhor.
   * Sem opção, devolve null; se todas zeram, fica com a primeira (a escolha "do que tinha").
   */
  decidir<A>(eu: Record<string, number>, opcoes: Opcao<A>[], rnd: () => number, faixa: number): Choice<A> | null {
    if (!opcoes.length) return null;
    preencher(this.eu, eu);
    this.rnd = rnd;
    this.selecao.withinFractionOfBest = faixa;
    const comps = this.pacote.comportamentos;
    const decisoes = opcoes.map((o, k) => {
      const b = comps[o.comportamento];
      let alvo: AiEntity = this.eu;
      if (b.isTargeted) {
        const t = (this.alvos[k] ??= new AiEntity({ id: proximo++, name: `${this.pacote.nome}:${k}`, type: b.targetTypes?.[0] ?? 'opção' }));
        preencher(t, o.alvo ?? {});
        alvo = t;
      }
      return new Decision(new ContextInfo(this.brain, b, this.eu, alvo));
    });
    this.brain.decisions = decisoes;
    const escolhida = this.brain.selectDecision();
    const notas = decisoes.map((d, k) => {
      const o = opcoes[k];
      const factors = d.breakdown.map((x) => ({ name: x.name, value: x.score })).sort((p, q) => p.value - q.value);
      return { d, s: { action: o.acao, label: o.rotulo, score: d.score, factors } as Scored<A> };
    });
    const ordem = notas.slice().sort((p, q) => q.s.score - p.s.score);
    const pick = (escolhida ? notas.find((x) => x.d === escolhida) : undefined) ?? ordem[0];
    this.brain.decisions = [];
    return { pick: pick.s, others: ordem.filter((x) => x !== pick).map((x) => x.s) };
  }
}

const fmt = (n: number) => n.toFixed(2).replace('.', ',');

/** As três considerations que mais ajudaram, em texto: "fome 0,90 · corajoso 0,80". */
export function topFactors(factors: Factor[]): string {
  return factors
    .slice()
    .sort((p, q) => q.value - p.value)
    .slice(0, 3)
    .map((x) => `${x.name} ${fmt(x.value)}`)
    .join(' · ');
}

/** Texto curto do porquê: "caçar (0,62): fome 0,9 · corajoso 0,8; depois coletar (0,41)". */
export function explain<A>(c: Choice<A>, name: (s: Scored<A>) => string = (s) => s.label): string {
  const next = c.others.slice(0, 2).map((o) => `${name(o)} (${fmt(o.score)})`).join(', ');
  return `${name(c.pick)} (${fmt(c.pick.score)}): ${topFactors(c.pick.factors)}${next ? `; depois ${next}` : ''}`;
}
