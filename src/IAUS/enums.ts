// enums.ts — Enumerações centrais do IAUS.
// Equivalem ao "Enums file" exportado pela ferramenta de dados no manual.

/** Como um Behavior é pontuado e sobre quem ele é executado. */
export enum ContextType {
  /** Independe de alvo (ex.: vagar até um ponto aleatório). Pontuado uma vez. */
  StandAlone = 1,
  /** Pontuado uma vez; o efeito recai sobre o próprio agente (ex.: bocejar, curar-se). */
  Self = 2,
  /** Pontuado uma vez POR alvo vizinho; executado nesse alvo. Nunca inclui o próprio agente. */
  SingleTarget = 3,
  /** Mira uma posição. Pontuado no máximo uma vez; o ponto exato é calculado na execução. */
  LocationTarget = 4,
  /** Pontuado por alvo vizinho (como SingleTarget), mas o efeito recai sobre o próprio agente. */
  SingleTargetOnSelf = 5,
}

/** Como o Behavior roda depois de escolhido. */
export enum DurationType {
  /** Roda uma vez e acaba. Entra no histórico assim que executa. */
  Instant = 1,
  /** Continua por vários ciclos de pensamento; recebe bônus de momento enquanto ativo. */
  Continuous = 2,
}

/** Tipos de curva de resposta (Response Curve). */
export enum CurveType {
  Linear = 1,
  Polynomial = 2,
  Logistic = 3,
  Logit = 4,
  Normal = 5,
  Sine = 6,
}

/** Parâmetros opcionais de uma Consideration (mapa esparso, como no manual). */
export enum InputParameter {
  /** Valor bruto que corresponde a x = 0. Padrão: 0. */
  RangeMin = 1,
  /** Valor bruto que corresponde a x = 1 (ex.: 20 m de distância). */
  RangeMax = 2,
  /** Valor constante para o input Constant. */
  Value = 3,
}

/** Como escolher entre as decisões pontuadas (Cap. 16 do livro). */
export enum SelectionMode {
  /** Sempre a de maior score (teoria normativa). */
  Best = 1,
  /** Sorteio ponderado entre as melhores (top N, top % ou dentro de uma fração da melhor). */
  WeightedRandomTop = 2,
  /** Sorteio ponderado entre todas as decisões com score > 0. */
  WeightedRandomAll = 3,
}
