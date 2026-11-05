import * as tuning from '../IAUS/npc/tuning';
import * as balance from './balance';

/**
 * As constantes de equilíbrio que o motor lê, num objeto só e mutável: o comando `tune` (painel F3, aba Ajustes) muda um
 * valor com o mundo rodando, sem recarregar nada. `import * as B from './balance'` não serve para isso, porque o módulo é
 * imutável. Quem lê `B.NOME` na hora de usar vê o valor novo.
 *
 * Três limites: um valor copiado ao carregar o módulo não acompanha (`NOT_LIVE`, os laços quentes que guardam cópia local),
 * uma constante feita de outra (`A = B * 2`, em balance.ts) não muda quando a de base muda, e o ajuste vale para o motor
 * deste processo, que tem um mundo por vez: quem cria ou restaura um mundo chama `applyTuned`.
 */

/** Ler daqui custa o mesmo que ler o módulo: medido no código empacotado, a diferença fica dentro do ruído (TODO, 4.4). */
export const B: typeof balance = { ...balance };

/** Nomes que o motor copia ao carregar (laços quentes): não mudam ao vivo, e o painel não os oferece. */
export const NOT_LIVE: ReadonlySet<string> = new Set([
  'MAX_CLIMB',
  'SITE_CENTER_GREEN',
  'SITE_SEA_SIZE',
  'SITE_WOOD_FULL',
  'SITE_ROCK_FULL',
  'SITE_FISH_FOOD',
  'SITE_DIRTY_PER_STEP',
  'SITE_CATCH_POP',
  'STREET_GAP',
]);

type Slot = { owner: Record<string | number, unknown>; key: string | number };

const NAME = /^([A-Z_][A-Z0-9_]*)(?:\.([A-Za-z_]\w*)|\[(\d+)\])?$/;

/** Onde mora o número de `NOME`, `NOME.campo` ou `NOME[i]` (os nomes de tools/tune/constants.mjs); null se não é um número. */
function locate(name: string): Slot | null {
  const m = NAME.exec(name);
  if (!m) return null;
  const [, base, field, index] = m;
  if (NOT_LIVE.has(base)) return null;
  const inBalance = base in B;
  if (!inBalance && !(base in tuning)) return null;
  const root = (inBalance ? B : tuning) as unknown as Record<string, unknown>;
  let slot: Slot;
  if (field !== undefined || index !== undefined) {
    const owner = root[base];
    if (typeof owner !== 'object' || owner === null) return null;
    slot = { owner: owner as Slot['owner'], key: field ?? Number(index) };
  } else {
    // O módulo tuning.ts é imutável, e nele só há objetos: número solto só em balance.
    if (!inBalance) return null;
    slot = { owner: root, key: base };
  }
  return typeof slot.owner[slot.key] === 'number' ? slot : null;
}

/** O valor de fábrica de cada constante já mudada neste processo. */
const factory = new Map<string, number>();

export function readConstant(name: string): number | undefined {
  const s = locate(name);
  return s ? (s.owner[s.key] as number) : undefined;
}

/** Muda uma constante. Falso, sem mudar nada, se o nome não é um número que o motor lê ao vivo. */
export function setConstant(name: string, value: number): boolean {
  const s = locate(name);
  if (!s || !Number.isFinite(value)) return false;
  if (!factory.has(name)) factory.set(name, s.owner[s.key] as number);
  s.owner[s.key] = value;
  return true;
}

/** Tudo de volta ao valor de fábrica (mundo novo, ou antes de aplicar o ajuste de um mundo). */
export function resetConstants(): void {
  for (const [name, value] of factory) {
    const s = locate(name);
    if (s) s.owner[s.key] = value;
  }
  factory.clear();
}

/** Deixa as constantes como as deste mundo: as de fábrica, mais o ajuste guardado nele. */
export function applyTuned(tuned: Readonly<Record<string, number>> | undefined): void {
  resetConstants();
  for (const [name, value] of Object.entries(tuned ?? {})) setConstant(name, value);
}

export interface LiveConstant {
  name: string;
  value: number;
  /** O de fábrica, quando este foi mudado. */
  factory?: number;
}

/** Todos os números ajustáveis, na ordem de balance.ts e depois tuning.ts: o que a aba Ajustes lista. */
export function liveConstants(): LiveConstant[] {
  const out: LiveConstant[] = [];
  const add = (name: string) => {
    const value = readConstant(name);
    if (value !== undefined) out.push({ name, value, factory: factory.get(name) });
  };
  for (const root of [B, tuning] as unknown as Record<string, unknown>[]) {
    for (const base of Object.keys(root)) {
      const v = root[base];
      if (typeof v === 'number') add(base);
      else if (Array.isArray(v)) v.forEach((_, i) => add(`${base}[${i}]`));
      else if (typeof v === 'object' && v !== null) for (const field of Object.keys(v)) add(`${base}.${field}`);
    }
  }
  return out;
}
