import type { GameState } from '../client/state';
import type { SaveStore } from './store';
import { restoreGame, snapshotGame } from './game';
import type { ViewSnapshot } from './snapshot';

export const SAVE_KEY = 'atual';
/** Save recusado ao carregar (corrompido ou de outra versão): fica guardado em vez de ser sobrescrito pelo autosave. */
export const REJECTED_KEY = 'recusado';

export type LoadResult =
  | { status: 'ok'; state: GameState; view: ViewSnapshot; savedAt: number }
  | { status: 'empty' }
  | { status: 'rejected'; reason: string }
  /** O armazenamento não respondeu: o save pode existir, então o autosave não deve sobrescrevê-lo. */
  | { status: 'unavailable'; reason: string };

export class SaveManager {
  constructor(
    private readonly store: SaveStore,
    private readonly seeds: (planetId: string) => number,
  ) {}

  /** Grava o jogo. O IndexedDB copia o objeto na hora da chamada, então o jogo pode seguir sem esperar. */
  async save(state: GameState, view: ViewSnapshot): Promise<boolean> {
    // Sem trava de "salvando": ao fechar a aba o último save não pode ser descartado porque o anterior ainda está gravando (o IndexedDB mantém a ordem).
    await this.store.put(SAVE_KEY, snapshotGame(state, view, this.seeds));
    return true;
  }

  async load(base: Pick<GameState, 'manifest' | 'names'>): Promise<LoadResult> {
    let raw: unknown;
    try {
      raw = await this.store.get(SAVE_KEY);
    } catch (err) {
      return { status: 'unavailable', reason: String(err) };
    }
    if (raw === undefined) return { status: 'empty' };
    try {
      return { status: 'ok', ...restoreGame(raw, base) };
    } catch (err) {
      // Guarda o save problemático à parte e libera a vaga para um jogo novo.
      await this.store.put(REJECTED_KEY, raw).catch(() => {});
      await this.store.delete(SAVE_KEY).catch(() => {});
      return { status: 'rejected', reason: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Começar um mundo novo: apaga o save atual. */
  async clear(): Promise<void> {
    await this.store.delete(SAVE_KEY);
  }
}
