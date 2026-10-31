import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Motor puro (preparação para separar back-end e front-end): core, nav,
 * explore e o manifesto/busca do universo não podem depender de three.js,
 * do DOM nem de nada em src/client, nem diretamente nem pelo que importam.
 * O carregamento por rede e o cache no IndexedDB (universe/loader.ts e
 * universe/chunkCache.ts) são adaptadores de plataforma e ficam de fora.
 */

interface Fs {
  readFileSync(path: URL, enc: 'utf8'): string;
  readdirSync(path: URL): string[];
}

/** Pasta src/ (este arquivo fica em src/core). */
const SRC = new URL('../', import.meta.url);
const ROOT_DIRS = ['core', 'nav', 'explore'];
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

describe('motor puro sem three.js, DOM ou cliente', () => {
  /** Arquivos alcançados a partir das raízes (caminho relativo a src/), com o texto e o que importam. */
  const files = new Map<string, { src: string; specs: string[] }>();

  beforeAll(async () => {
    // Sem tipos do Node no projeto: o módulo é carregado pelo nome (lido do disco a cada execução).
    const fsName = 'node:fs';
    const fs = (await import(/* @vite-ignore */ fsName)) as Fs;
    const stack = [...ROOT_FILES];
    for (const d of ROOT_DIRS) {
      for (const f of fs.readdirSync(new URL(`${d}/`, SRC))) if (f.endsWith('.ts') && !f.endsWith('.test.ts')) stack.push(`${d}/${f}`);
    }
    while (stack.length) {
      const file = stack.pop()!;
      if (files.has(file)) continue;
      const src = fs.readFileSync(new URL(file, SRC), 'utf8');
      const specs = [...src.matchAll(IMPORT)].map((m) => m[1]);
      files.set(file, { src, specs });
      for (const s of specs) if (s.startsWith('.')) stack.push(resolveFrom(file, s));
    }
  });

  it('alcança os módulos esperados', () => {
    expect(files.has('nav/systemGen.ts')).toBe(true);
    expect(files.has('universe/starIndex.ts')).toBe(true);
    expect(files.has('core/shipControl.ts')).toBe(true);
    expect(files.has('core/lru.ts')).toBe(true);
  });

  it('nenhum arquivo importa three.js ou src/client', () => {
    const bad: string[] = [];
    for (const [file, { specs }] of files) {
      for (const s of specs) {
        const target = s.startsWith('.') ? resolveFrom(file, s) : s;
        if (s === 'three' || s.startsWith('three/') || target.startsWith('client/')) bad.push(`${file} -> ${s}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('nenhum arquivo usa APIs do navegador', () => {
    const bad = [...files].filter(([, f]) => BROWSER.test(f.src)).map(([name]) => name);
    expect(bad).toEqual([]);
  });
});
