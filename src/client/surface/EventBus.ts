/**
 * Despachante dos eventos do motor do lado do cliente (padrão Observer, Game
 * Programming Patterns). O SimDriver drena a fila do motor depois dos passos
 * de cada quadro e entrega aqui; cada parte do HUD assina só os tipos que lhe
 * interessam (`on`) ou todos (`onAny`). O motor não sabe quem ouve: a fila
 * (Event Queue) desacopla o tempo, este despachante desacopla quem recebe.
 */
export class EventBus<E extends { kind: string }> {
  private readonly byKind = new Map<string, ((e: E) => void)[]>();
  private readonly any: ((e: E) => void)[] = [];

  /** Ouve um tipo de evento; devolve a função que desliga. */
  on<K extends E['kind']>(kind: K, fn: (e: Extract<E, { kind: K }>) => void): () => void {
    const list = this.byKind.get(kind) ?? [];
    const f = fn as (e: E) => void;
    list.push(f);
    this.byKind.set(kind, list);
    return () => {
      const k = list.indexOf(f);
      if (k >= 0) list.splice(k, 1);
    };
  }

  /** Ouve todos os eventos; devolve a função que desliga. */
  onAny(fn: (e: E) => void): () => void {
    this.any.push(fn);
    return () => {
      const k = this.any.indexOf(fn);
      if (k >= 0) this.any.splice(k, 1);
    };
  }

  /** Entrega um evento a quem ouve o tipo dele e a quem ouve todos, na ordem em que assinaram. */
  emit(e: E): void {
    const list = this.byKind.get(e.kind);
    if (list) for (const fn of [...list]) fn(e);
    for (const fn of [...this.any]) fn(e);
  }

  /** Desliga todo mundo (fim do modo). */
  clear(): void {
    this.byKind.clear();
    this.any.length = 0;
  }
}
