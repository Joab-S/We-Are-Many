import type { Ecosystem } from './ecosystem';

/**
 * Impressão digital do mundo: um hash FNV-1a de 32 bits (em hex) do estado
 * que importa da simulação. Duas rodadas com a mesma semente têm de dar o
 * mesmo valor; uma refatoração sem mudança de comportamento também
 * (fingerprint.calib.ts compara com o baseline gravado).
 *
 * Cobre o ano, a contagem de criaturas, todos os arrays tipados da instância
 * (os por criatura até `count`, os do mapa inteiros), o terreno vivo, o
 * essencial de cada assentamento e o tamanho das listas de guerras, barcos,
 * caravanas, carcaças e crônica. Barato: só lê, sem alocar além do texto.
 */
export function worldFingerprint(eco: Ecosystem): string {
  const h = new Fnv();
  h.num(eco.year);
  h.num(eco.count);
  h.num(eco.capacity);
  const map = eco.map;
  const tiles = map.width * map.height;
  const fields = eco as unknown as Record<string, unknown>;
  // Arrays tipados da instância, em ordem fixa de chave: os por criatura (múltiplos da capacidade) até `count`.
  for (const key of Object.keys(fields).sort()) {
    const v = fields[key];
    if (!ArrayBuffer.isView(v) || v instanceof DataView) continue;
    const arr = v as unknown as { length: number; BYTES_PER_ELEMENT: number; buffer: ArrayBufferLike; byteOffset: number };
    const stride = eco.capacity > 0 && arr.length !== tiles && arr.length % eco.capacity === 0 ? arr.length / eco.capacity : 0;
    const n = stride > 0 && stride <= 16 ? eco.count * stride : arr.length;
    h.str(key);
    h.bytes(new Uint8Array(arr.buffer, arr.byteOffset, n * arr.BYTES_PER_ELEMENT));
  }
  // Terreno vivo.
  for (const a of [map.vegetation, map.biome, map.elevation]) h.bytes(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  // Populações e contas do mundo.
  for (const p of eco.population) h.num(p);
  for (const [k, n] of Object.entries(eco.tally)) {
    h.str(k);
    h.num(n);
  }
  // O essencial de cada assentamento.
  for (const v of eco.villages) {
    h.num(v.id);
    h.num(v.x);
    h.num(v.y);
    h.num(v.population);
    h.num(v.tier);
    h.num(v.kingdom);
    h.num(v.tech);
    h.num(v.food);
    h.num(v.stock.wood);
    h.str((v.techs ?? []).join(','));
    h.num(v.houses.length);
    h.num(v.abandoned ? 1 : 0);
  }
  h.num(eco.wars.length);
  h.num(eco.boats.length);
  h.num(eco.caravans.length);
  h.num(eco.carcasses.length);
  h.num(eco.chronicle.length);
  h.str(eco.chronicle[0]?.text ?? '');
  return h.hex();
}

/** FNV-1a de 32 bits, alimentado por bytes. */
class Fnv {
  private h = 0x811c9dc5;
  private readonly f64 = new Float64Array(1);
  private readonly f64b = new Uint8Array(this.f64.buffer);

  bytes(b: Uint8Array): void {
    let h = this.h;
    for (let i = 0; i < b.length; i++) {
      h ^= b[i];
      h = Math.imul(h, 0x01000193);
    }
    this.h = h >>> 0;
  }

  num(n: number): void {
    this.f64[0] = n;
    this.bytes(this.f64b);
  }

  str(s: string): void {
    let h = this.h;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h ^= c & 0xff;
      h = Math.imul(h, 0x01000193);
      h ^= c >>> 8;
      h = Math.imul(h, 0x01000193);
    }
    this.h = h >>> 0;
    this.num(s.length);
  }

  hex(): string {
    return (this.h >>> 0).toString(16).padStart(8, '0');
  }
}
