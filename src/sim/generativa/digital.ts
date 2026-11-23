/**
 * Impressão digital do mundo generativo: a do mundo (src/sim/fingerprint.ts) mais tudo o que as pessoas sabem e as
 * coisas que puseram no mundo. Serve aos testes de determinismo e ao teste de que observar não muda nada.
 */
import type { Ecosystem } from '../ecosystem';
import { worldFingerprint } from '../fingerprint';

/** JSON estável: Map vira lista de pares, na ordem em que está (a ordem de inserção faz parte do estado). */
function texto(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (x instanceof Map ? { __map: [...x.entries()] } : typeof x === 'number' && !Number.isFinite(x) ? String(x) : x));
}

export function impressaoGen(eco: Ecosystem): string {
  const s = texto(eco.gen);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${worldFingerprint(eco)}-${(h >>> 0).toString(16).padStart(8, '0')}`;
}
