/** Camadas que o Esc fecha: lista "N aqui", janelas, ajuda, destaque e ficha fixada. */
export type OverlayId = 'crowd' | 'vwin' | 'win' | 'help' | 'highlight' | 'pinned';

/**
 * Pilha de sobreposições da superfície (RF-VIDA-349b, "fecha o que estiver
 * por cima primeiro"): cada camada entra no topo quando abre e sai quando
 * fecha, por qualquer caminho. O Esc fecha a de cima; com a pilha vazia, ele
 * vai para a ferramenta na mão (estado) e, por fim, volta à órbita.
 */
export class OverlayStack {
  private readonly stack: { id: OverlayId; close: () => void }[] = [];

  /** A camada abriu (ou voltou a ficar por cima). */
  open(id: OverlayId, close: () => void): void {
    this.remove(id);
    this.stack.push({ id, close });
  }

  /** A camada fechou por outro caminho (botão, clique). */
  closed(id: OverlayId): void {
    this.remove(id);
  }

  /** Abriu ou fechou, conforme `open`. */
  set(id: OverlayId, open: boolean, close: () => void): void {
    if (open) this.open(id, close);
    else this.closed(id);
  }

  get top(): OverlayId | null {
    return this.stack.length ? this.stack[this.stack.length - 1].id : null;
  }

  get size(): number {
    return this.stack.length;
  }

  has(id: OverlayId): boolean {
    return this.stack.some((o) => o.id === id);
  }

  /** Esc: fecha a camada de cima. Devolve falso se não havia nenhuma. */
  escape(): boolean {
    const top = this.stack.pop();
    if (!top) return false;
    top.close();
    return true;
  }

  private remove(id: OverlayId): void {
    const k = this.stack.findIndex((o) => o.id === id);
    if (k >= 0) this.stack.splice(k, 1);
  }
}
