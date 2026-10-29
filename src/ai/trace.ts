/**
 * Rastro das decisões (IA local das pessoas): o diário curto de cada pessoa, com o ano, o tipo da
 * decisão e o porquê em português simples. Serve ao painel de quem o jogador acompanha e aos testes
 * do laboratório. Guarda só as últimas DIARY_SIZE linhas de cada um.
 */

export type ThoughtKind = 'ofício' | 'mudança' | 'família' | 'amizade' | 'briga' | 'poder' | 'saber';

export interface Thought {
  year: number;
  kind: ThoughtKind;
  text: string;
}

export const DIARY_SIZE = 10;

/** O que sai primeiro do diário cheio: amizades e brigas somem antes de ofício, casamento e poder. */
const MINOR: ThoughtKind[] = ['amizade', 'briga'];

/**
 * Anota uma decisão no diário de `uid`. A mesma frase repetida em seguida não entra de novo (brigas seguidas
 * com a mesma pessoa viram uma linha só). Quando enche, sai a amizade ou briga mais antiga; sem nenhuma, a mais antiga.
 */
export function remember(diary: Map<number, Thought[]>, uid: number, thought: Thought): void {
  let list = diary.get(uid);
  if (!list) diary.set(uid, (list = []));
  const last = list[list.length - 1];
  if (last && last.text === thought.text) {
    last.year = thought.year;
    return;
  }
  list.push(thought);
  if (list.length <= DIARY_SIZE) return;
  const minor = list.findIndex((t) => MINOR.includes(t.kind));
  list.splice(minor >= 0 && minor < list.length - 1 ? minor : 0, 1);
}
