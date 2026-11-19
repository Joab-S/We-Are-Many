import { TileJournal, type RestoreTilesCommand } from '../../sim/api/commands';

/** Traços guardados para desfazer. */
const UNDO_LIMIT = 30;

/**
 * Desfazer (Ctrl+Z) dos pincéis de terreno e clima: cada traço, do apertar
 * ao soltar do botão, tem um retrato dos tiles tocados (`TileJournal`,
 * preenchido pelo motor ao aplicar os comandos `terraform`). Desfazer gera o
 * comando `restoreTiles`, que vai pela mesma fila dos outros comandos.
 * Construções que o traço derrubou não voltam: só o terreno.
 */
export class BrushHistory {
  private current: TileJournal | null = null;
  private readonly done: TileJournal[] = [];

  /** Retrato do traço em andamento (o motor guarda nele os tiles antes de mudá-los). */
  get journal(): TileJournal | null {
    return this.current;
  }

  /** Quantos traços dá para desfazer. */
  get size(): number {
    return this.done.length;
  }

  begin(): void {
    this.end();
    this.current = new TileJournal();
  }

  end(): void {
    const j = this.current;
    this.current = null;
    if (!j || !j.size) return;
    this.done.push(j);
    if (this.done.length > UNDO_LIMIT) this.done.shift();
  }

  /** O comando que desfaz o último traço, ou null se não há o que desfazer. */
  undo(): RestoreTilesCommand | null {
    this.end();
    const j = this.done.pop();
    return j ? j.toCommand() : null;
  }
}
