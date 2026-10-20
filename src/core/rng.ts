/**
 * Geradores determinísticos. Todo conteúdo procedural usa estas funções,
 * nunca Math.random, para que qualquer máquina (e o servidor do coop) gere
 * exatamente o mesmo universo a partir do mesmo id.
 */

/** Hash FNV-1a de 32 bits. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** PRNG mulberry32: rápido, 32 bits de estado, saída em [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semente estável para um objeto do universo e uma versão do gerador. */
export function seedFor(objectId: string, generatorVersion = 1): number {
  return hashString(`${objectId}#v${generatorVersion}`);
}
