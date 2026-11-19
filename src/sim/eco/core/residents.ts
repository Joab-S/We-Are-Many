/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): quem mora em cada assentamento.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 *
 * "Quem mora em v" era uma varredura da população inteira (bichos incluídos) a cada pergunta. Agora é
 * um índice por assentamento (Spatial Partition do Nystrom, com o assentamento no lugar da célula)
 * com Dirty Flag: `setVillage`, `spawn` e `kill` de quem tem casa só marcam o índice como sujo, e a
 * próxima pergunta o refaz de uma vez, por ordenação por contagem. Cada lista sai em ordem crescente de
 * índice, a mesma ordem da varredura antiga, então os sorteios e as escolhas seguem idênticos.
 */

import type { Ecosystem } from '../../ecosystem';

/** O índice: os moradores de `v` são `list[start[v]]` até `list[start[v + 1] - 1]`. */
export class ResidentIndex {
  dirty = true;
  start = new Int32Array(1);
  list = new Int32Array(0);
}

export const residentsPart = {
  /**
   * Moradores vivos de `v` (índices em ordem crescente). A lista vale até a próxima mudança de morada,
   * nascimento ou morte de morador: quem mexe nisso durante o laço confere `alive` e `village` de novo
   * na hora (como a varredura antiga fazia). Refazer o índice nunca estraga uma lista já entregue
   * (os vetores novos são outros).
   */
  residents(this: Ecosystem, v: number): Int32Array {
    const r = this.residentIndex;
    if (r.dirty || r.start.length !== this.villages.length + 1) this.rebuildResidents();
    return r.list.subarray(r.start[v], r.start[v + 1]);
  },

  /** Muda a morada de `i` (-1 é ninguém) e marca o índice de moradores como sujo. */
  setVillage(this: Ecosystem, i: number, v: number): void {
    this.village[i] = v;
    this.residentIndex.dirty = true;
  },

  /** Refaz o índice por contagem (duas passadas pela população), na ordem crescente de índice. */
  rebuildResidents(this: Ecosystem): void {
    const r = this.residentIndex;
    const n = this.villages.length;
    const start = new Int32Array(n + 1);
    const count = this.count;
    const alive = this.alive;
    const village = this.village;
    for (let i = 0; i < count; i++) {
      const v = village[i];
      if (v >= 0 && alive[i]) start[v + 1]++;
    }
    for (let v = 0; v < n; v++) start[v + 1] += start[v];
    const list = new Int32Array(start[n]);
    const fill = start.slice(0, n);
    for (let i = 0; i < count; i++) {
      const v = village[i];
      if (v >= 0 && alive[i]) list[fill[v]++] = i;
    }
    r.start = start;
    r.list = list;
    r.dirty = false;
  },
};
export type ResidentsPart = typeof residentsPart;
