/**
 * Estrutura de referência dos assentamentos (REQUISITOS-VIDA.md, seção 19.3,
 * RF-VIDA-200 e 201): o que um assentamento do seu nível "deveria ter" na
 * era em que está. Só entra o que já dá para fazer na era, para a planta
 * nunca ficar presa a algo impossível. Funções puras; o Ecosystem monta o
 * contexto.
 */

export interface PlanContext {
  tier: number;
  /** Progresso tecnológico (era + fração). */
  tech: number;
  population: number;
  /** Quantas pessoas as casas abrigam. */
  housing: number;
  homes: number;
  fields: number;
  food: number;
  /** Tem porto; e se tem costa para um. */
  port: boolean;
  coastal: boolean;
  /** Construções especiais que já existem. */
  built: ReadonlySet<string>;
  /** Construções especiais que o assentamento já pode erguer neste nível e era. */
  buildable: readonly string[];
}

export interface PlanItem {
  id: string;
  /** Nome curto para o painel ("celeiro", "casas para todos"). */
  label: string;
  ok: boolean;
}

/** Nome de cada construção na lista do que falta. */
const LABELS: Record<string, string> = {
  granary: 'celeiro',
  smithy: 'ferraria',
  market: 'mercado',
  windmill: 'moinho',
  temple: 'templo',
  barracks: 'quartel',
  factory: 'fábrica',
  statue: 'estátua',
  aqueduct: 'aqueduto',
};

/** Itens da estrutura de referência do nível atual. */
export function planItems(c: PlanContext): PlanItem[] {
  const items: PlanItem[] = [
    { id: 'housing', label: 'casas para todos', ok: c.housing >= c.population },
    { id: 'food', label: 'comida garantida', ok: c.fields > 0 || c.port || c.food >= 5 },
  ];
  // Roças para as casas, quando o povo já planta (fim da Idade da Pedra).
  if (c.tier >= 1 && c.tech >= 0.12) items.push({ id: 'fields', label: 'roças para as casas', ok: c.fields >= Math.ceil(c.homes / 4) });
  if (c.tier >= 1 && c.coastal && c.tech >= 0.5) items.push({ id: 'port', label: 'porto', ok: c.port });
  for (const b of c.buildable) {
    // Monumentos e a grande obra são orgulho, não estrutura; a estátua só entra na metrópole.
    if (b === 'wonder' || (b === 'statue' && c.tier < 3)) continue;
    // A vila só precisa do básico; o resto entra na cidade.
    if (c.tier === 1 && !['granary', 'market', 'temple', 'smithy'].includes(b)) continue;
    if (c.tier === 0) continue;
    items.push({ id: b, label: LABELS[b] ?? b, ok: c.built.has(b) });
  }
  return items;
}

/** Completude de 0 a 1 (RF-VIDA-201). */
export function completeness(items: readonly PlanItem[]): number {
  return items.length ? items.filter((i) => i.ok).length / items.length : 1;
}

/** "falta celeiro e poço" para o painel; vazio quando está completa. */
export function missingText(items: readonly PlanItem[]): string {
  const miss = items.filter((i) => !i.ok).map((i) => i.label);
  if (!miss.length) return '';
  return miss.length === 1 ? miss[0] : `${miss.slice(0, -1).join(', ')} e ${miss[miss.length - 1]}`;
}
