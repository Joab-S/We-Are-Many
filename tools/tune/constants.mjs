// Constantes de ajuste no código-fonte (ajuste automático, docs/AJUSTE-AUTOMATICO.md): ler o valor atual e
// trocar por outro, sem tocar no motor. Serve ao otimizador (tools/tune.mjs, para saber de onde partir e para
// aplicar o resultado) e ao vitest.tune.config.ts (que troca os valores na hora de carregar o módulo).
//
// Nomes aceitos, em src/sim/balance.ts e src/ai/tuning.ts:
//   NOME          número solto:           export const SITE_MIN_VALUE = 4.2;
//   NOME.campo    campo de um objeto:     export const MOVE_W = { ..., stay: 0.35, ... };
//   NOME[i]       item de um vetor:       export const SEASON_HARVEST = [0.2, 0.8, 2.6, 0.4];
import { readFileSync } from 'node:fs';

export const TUNE_FILES = ['src/sim/balance.ts', 'src/ai/tuning.ts'];

const NUMBER = /^-?(?:\d[\d_]*(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?/i;
/** O que pode vir logo depois de um item de objeto ou vetor que é só um número (e não uma conta). */
const AFTER = /^[ \t]*(?:,|\]|\}|\/\/|\/\*|\r?\n)/;

/** Pula comentário e texto entre aspas a partir de `i`; devolve o índice depois deles (ou `i`, se não há nenhum). */
function skip(src, i) {
  if (src.startsWith('//', i)) {
    const end = src.indexOf('\n', i);
    return end < 0 ? src.length : end;
  }
  if (src.startsWith('/*', i)) {
    const end = src.indexOf('*/', i + 2);
    return end < 0 ? src.length : end + 2;
  }
  const q = src[i];
  if (q === "'" || q === '"' || q === '`') {
    let k = i + 1;
    while (k < src.length && src[k] !== q) k += src[k] === '\\' ? 2 : 1;
    return k + 1;
  }
  return i;
}

/** O literal numérico em `at` (depois de espaços): onde começa e onde termina. */
function numberAt(src, at) {
  let i = at;
  while (/\s/.test(src[i])) i++;
  const m = NUMBER.exec(src.slice(i, i + 40));
  return m ? { start: i, end: i + m[0].length } : null;
}

/** Onde está, no texto, o número de `name` (ver o topo do arquivo); null se não há. */
export function locate(src, name) {
  const m = /^([A-Z_][A-Z0-9_]*)(?:\.([A-Za-z_]\w*)|\[(\d+)\])?$/.exec(name);
  if (!m) return null;
  const [, base, field, index] = m;
  const decl = new RegExp(`^export const ${base}\\b[^=\\n]*=\\s*`, 'm').exec(src);
  if (!decl) return null;
  const at = decl.index + decl[0].length;
  if (field === undefined && index === undefined) {
    const n = numberAt(src, at);
    if (!n) return null;
    // Só um número solto: `= 4.2;`, não `= PLANT_RATE / CUT_RATE;`.
    let k = n.end;
    while (src[k] === ' ') k++;
    return src[k] === ';' || src[k] === '\n' ? n : null;
  }
  const open = field !== undefined ? '{' : '[';
  if (src[at] !== open) return null;
  // Varre o literal no primeiro nível, pulando comentários, textos e literais de dentro.
  let depth = 0;
  let item = 0;
  let expectItem = true;
  for (let i = at; i < src.length; ) {
    const j = skip(src, i);
    if (j !== i) {
      i = j;
      continue;
    }
    const c = src[i];
    if (c === '{' || c === '[' || c === '(') {
      depth++;
      i++;
      continue;
    }
    if (c === '}' || c === ']' || c === ')') {
      depth--;
      if (depth === 0) return null;
      i++;
      continue;
    }
    if (depth === 1) {
      if (index !== undefined) {
        if (c === ',') {
          item++;
          expectItem = true;
        } else if (expectItem && !/\s/.test(c)) {
          expectItem = false;
          if (item === Number(index)) {
            const n = numberAt(src, i);
            return n && AFTER.test(src.slice(n.end, n.end + 20)) ? n : null;
          }
        }
      } else {
        const key = new RegExp(`^${field}\\s*:`).exec(src.slice(i, i + field.length + 8));
        if (key && /[\s{,]/.test(src[i - 1])) {
          const n = numberAt(src, i + key[0].length);
          return n && AFTER.test(src.slice(n.end, n.end + 20)) ? n : null;
        }
      }
    }
    i++;
  }
  return null;
}

/** Valor atual de `name` no texto, ou null. */
export function readConstant(src, name) {
  const at = locate(src, name);
  return at ? Number(src.slice(at.start, at.end).replace(/_/g, '')) : null;
}

/** O texto com `name` valendo `value` (erro se o nome não é um número que dá para trocar). */
export function writeConstant(src, name, value) {
  const at = locate(src, name);
  if (!at) throw new Error(`ajuste: ${name} não é uma constante numérica que dá para trocar`);
  return src.slice(0, at.start) + formatNumber(value) + src.slice(at.end);
}

/** Número curto e exato o bastante para o código: inteiro sem casas, o resto com 4 algarismos significativos. */
export function formatNumber(v) {
  if (!Number.isFinite(v)) throw new Error(`ajuste: valor inválido ${v}`);
  if (Number.isInteger(v)) return String(v);
  return String(Number(v.toPrecision(4)));
}

/** Em qual dos TUNE_FILES (a partir de `root`) mora cada nome; erro para o nome que não está em nenhum. */
export function whereIs(names, root = '.') {
  const texts = TUNE_FILES.map((f) => [f, readFileSync(`${root}/${f}`, 'utf8')]);
  const out = {};
  for (const name of names) {
    const hit = texts.find(([, src]) => locate(src, name));
    if (!hit) throw new Error(`ajuste: ${name} não é uma constante numérica de ${TUNE_FILES.join(' nem de ')}`);
    out[name] = hit[0];
  }
  return out;
}
