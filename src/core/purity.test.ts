import { describe, expect, it } from 'vitest';

/**
 * Motor puro (preparação para separar back-end e front-end): core, nav,
 * explore e o manifesto/busca do universo não podem depender de three.js,
 * do DOM nem de nada em src/client, nem diretamente nem pelo que importam.
 * O carregamento por rede e o cache no IndexedDB (universe/loader.ts e
 * universe/chunkCache.ts) são adaptadores de plataforma e ficam de fora.
 */

// Sem tipos do Node no projeto: o Vite entrega o texto dos arquivos.
const RAW = import.meta.glob<string>(['../**/*.ts', '!../**/*.test.ts', '!../**/*.calib.ts'], { query: '?raw', import: 'default', eager: true });
/** Texto de cada arquivo, pelo caminho relativo a src/ (ex.: "nav/guide.ts"); os desta pasta vêm como "./x.ts". */
const SOURCES = new Map(Object.entries(RAW).map(([k, v]) => [k.startsWith('./') ? `core/${k.slice(2)}` : k.replace(/^\.\.\//, ''), v]));

const ROOT_DIRS = ['core/', 'nav/', 'explore/'];
const ROOT_FILES = ['universe/manifest.ts', 'universe/starIndex.ts'];
const IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
/** Uso de APIs do navegador (não confunde com nomes de parâmetros como `window`). */
const BROWSER = /\b(?:document|window|navigator|localStorage|sessionStorage|indexedDB)\s*\.|\bfetch\s*\(|\brequestAnimationFrame\b|\bHTML\w*Element\b|\bimport\.meta\.env\b/;

/** Junta um caminho relativo ao diretório do arquivo, como o path.posix. */
function resolveFrom(file: string, spec: string): string {
  const parts = file.split('/').slice(0, -1);
  for (const p of spec.split('/')) {
    if (p === '..') parts.pop();
    else if (p !== '.') parts.push(p);
  }
  const out = parts.join('/');
  return out.endsWith('.ts') ? out : `${out}.ts`;
}

/** Arquivos alcançados a partir das raízes, com o que cada um importa. */
function closure(): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const stack = [...SOURCES.keys()].filter((f) => ROOT_FILES.includes(f) || ROOT_DIRS.some((d) => f.startsWith(d) && !f.slice(d.length).includes('/')));
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    const src = SOURCES.get(file);
    if (src === undefined) throw new Error(`arquivo não encontrado: ${file}`);
    const specs = [...src.matchAll(IMPORT)].map((m) => m[1]);
    seen.set(file, specs);
    for (const s of specs) if (s.startsWith('.')) stack.push(resolveFrom(file, s));
  }
  return seen;
}

describe('motor puro sem three.js, DOM ou cliente', () => {
  const files = closure();

  it('alcança os módulos esperados', () => {
    expect(files.has('nav/systemGen.ts')).toBe(true);
    expect(files.has('universe/manifest.ts')).toBe(true);
    expect(files.has('core/shipControl.ts')).toBe(true);
  });

  it('nenhum arquivo importa three.js ou src/client', () => {
    const bad: string[] = [];
    for (const [file, specs] of files) {
      for (const s of specs) {
        const target = s.startsWith('.') ? resolveFrom(file, s) : s;
        if (s === 'three' || s.startsWith('three/') || target.startsWith('client/')) bad.push(`${file} -> ${s}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('nenhum arquivo usa APIs do navegador', () => {
    const bad = [...files.keys()].filter((f) => BROWSER.test(SOURCES.get(f)!));
    expect(bad).toEqual([]);
  });
});
