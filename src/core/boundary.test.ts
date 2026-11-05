import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Catraca da separação do motor (docs/SEPARACAO-MOTOR.md): quanto o código de produção do cliente ainda lê o mundo
 * direto, sem passar pela fachada (`engine.view`, `engine.debug`, eventos). Os números só podem cair.
 *
 * O teste falha nos dois sentidos, de propósito: se um número sobe, leia pela fachada; se cai, atualize-o aqui, ou
 * a folga deixada permitiria subir de novo sem ninguém notar.
 */

interface Fs {
  readFileSync(path: URL, enc: 'utf8'): string;
  readdirSync(path: URL, opts: { recursive: true }): string[];
}

/** Pasta src/client (este arquivo fica em src/core). */
const CLIENT = new URL('../client/', import.meta.url);

/** Importa o tipo ou a classe `Ecosystem` (`restoreEcosystem`, por exemplo, não conta). */
const IMPORTS_ECOSYSTEM = /\bimport\s+(?:type\s+)?\{[^}]*\bEcosystem\b[^}]*\}\s*from\b/;

describe('catraca das leituras diretas do mundo no cliente', () => {
  let sources: string[] = [];

  beforeAll(async () => {
    // Sem tipos do Node no projeto: o módulo é carregado pelo nome (como em purity.test.ts).
    const fsName = 'node:fs';
    const fs = (await import(/* @vite-ignore */ fsName)) as Fs;
    sources = fs
      .readdirSync(CLIENT, { recursive: true })
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => fs.readFileSync(new URL(f.replace(/\\/g, '/'), CLIENT), 'utf8'));
  });

  it.each<[string, number, () => number]>([
    ['chamadas a ecosystemOf(', 1, () => sources.reduce((n, src) => n + (src.match(/\becosystemOf\(/g)?.length ?? 0), 0)],
    ['arquivos que importam Ecosystem', 20, () => sources.filter((src) => IMPORTS_ECOSYSTEM.test(src)).length],
    ['linhas com eco.', 326, () => sources.reduce((n, src) => n + src.split('\n').filter((line) => /\beco\./.test(line)).length, 0)],
  ])('%s: %i', (name, limit, count) => {
    const now = count();
    const hint = now > limit ? `subiu de ${limit} para ${now}: leia pela fachada do motor` : `caiu de ${limit} para ${now}: atualize o número neste teste`;
    expect(now, `${name} ${hint}`).toBe(limit);
  });
});
