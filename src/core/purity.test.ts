import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Teste de fronteira (preparação para separar back-end e front-end): o motor
 * puro não pode depender de three.js, do DOM nem de nada em src/client, nem
 * diretamente nem pelo que importam. As camadas estão em docs/ARQUITETURA.md:
 *
 *  - motor puro: core, nav, explore, procgen, sim (com sim/api, a fronteira
 *    de comandos, eventos e a fachada), ai, o manifesto e a busca do universo
 *    e o retrato do save (save/snapshot.ts);
 *  - plataforma (adaptadores do navegador, de fora daqui): o carregamento por
 *    rede e o cache no IndexedDB do universo, o armazenamento do save no
 *    IndexedDB, o Worker que gera a superfície e a cola do save com o estado
 *    do cliente (save/game.ts e save/manager.ts, que usam o GameState);
 *  - cliente: src/client.
 */

interface Fs {
  readFileSync(path: URL, enc: 'utf8'): string;
  readdirSync(path: URL, opts: { recursive: true }): string[];
}

/** Pasta src/ (este arquivo fica em src/core). */
const SRC = new URL('../', import.meta.url);
/** Pastas do motor puro, com as subpastas (sim/eco/**, sim/api...). */
const ROOT_DIRS = ['core', 'nav', 'explore', 'procgen', 'sim', 'ai'];
const ROOT_FILES = ['universe/manifest.ts', 'universe/starIndex.ts', 'save/snapshot.ts'];
/** Adaptadores de plataforma: usam o navegador por definição e o motor nunca os alcança. */
const PLATFORM = ['universe/loader.ts', 'universe/chunkCache.ts', 'save/store.ts', 'procgen/surface.worker.ts', 'save/game.ts', 'save/manager.ts'];
/** Fora do motor: testes e calibração (rodam no Node, com node:fs). */
const NOT_ENGINE = /\.(test|calib)\.ts$/;
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
      for (const f of fs.readdirSync(new URL(`${d}/`, SRC), { recursive: true })) {
        const file = `${d}/${f.replace(/\\/g, '/')}`;
        if (file.endsWith('.ts') && !NOT_ENGINE.test(file) && !PLATFORM.includes(file)) stack.push(file);
      }
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
    // O motor da superfície e a fronteira dele com o cliente.
    for (const f of ['sim/ecosystem.ts', 'sim/eco/war/war.ts', 'sim/api/commands.ts', 'sim/api/events.ts', 'save/snapshot.ts', 'ai/utility.ts', 'procgen/surface.ts']) {
      expect(files.has(f), f).toBe(true);
    }
  });

  it('o motor não alcança os adaptadores de plataforma', () => {
    expect([...files.keys()].filter((f) => PLATFORM.includes(f))).toEqual([]);
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
