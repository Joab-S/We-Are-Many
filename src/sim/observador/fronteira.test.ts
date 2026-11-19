import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Mão única: tudo o que descreve, resume ou dá nome ao que as pessoas fazem (src/sim/observador) só lê o mundo. A
 * simulação não pode importar esse módulo, senão um nome vira trilho. Só a fachada (src/sim/api), o cliente, os
 * testes e as sondas podem.
 */
type Fs = { readdirSync(dir: URL, o: { recursive: true }): string[]; readFileSync(file: URL, enc: 'utf8'): string };
const SRC = new URL('../../', import.meta.url);
const SIMULACAO = ['sim', 'IAUS', 'core', 'procgen', 'nav', 'explore'];
const PODE = (rel: string) => rel.startsWith('sim/observador/') || rel.startsWith('sim/api/') || /\.(test|calib)\.ts$/.test(rel);
/** Qualquer import, export ou import() cujo caminho passa pelo observador (com ou sem `from`). */
const IMPORTA = /(?:\bimport|\bexport)\s*(?:\(\s*)?(?:[^'";()]*?\sfrom\s+)?['"][^'"]*observador[^'"]*['"]/;
const fontes = new Map<string, string>();

beforeAll(async () => {
  // Sem tipos do Node no projeto: o módulo é carregado pelo nome (lido do disco a cada execução).
  const fsName = 'node:fs';
  const fs = (await import(/* @vite-ignore */ fsName)) as Fs;
  for (const pasta of SIMULACAO) {
    for (const f of fs.readdirSync(new URL(`${pasta}/`, SRC), { recursive: true })) {
      const rel = `${pasta}/${f.replace(/\\/g, '/')}`;
      if (rel.endsWith('.ts')) fontes.set(rel, fs.readFileSync(new URL(rel, SRC), 'utf8'));
    }
  }
});

describe('o nome não manda', () => {
  it('a simulação não importa o observador', () => {
    const culpados: string[] = [];
    expect(fontes.size).toBeGreaterThan(100);
    for (const [rel, src] of fontes) {
      if (PODE(rel)) continue;
      if (IMPORTA.test(src)) culpados.push(rel);
    }
    expect(culpados).toEqual([]);
  });

  it('o estado do modelo generativo não guarda categoria, estágio nem grupo', () => {
    const tipos = fontes.get('sim/generativa/tipos.ts')!;
    // Os campos de estado (o que vai no save) não têm nome de categoria social.
    const campos = [...tipos.matchAll(/^\s+([a-zA-Z]+)\??:/gm)].map((m) => m[1].toLowerCase());
    for (const proibido of ['tipo', 'estagio', 'era', 'bando', 'grupo', 'aldeia', 'vila', 'reino', 'tribo', 'povo', 'lider', 'chefe', 'papel', 'oficio', 'cargo']) {
      // `tipo` existe só dentro de Origem (de onde veio uma crença), nunca numa pessoa, coisa ou mundo.
      if (proibido === 'tipo') expect(tipos.match(/^\s+tipo:/gm)).toHaveLength(1);
      else expect(campos).not.toContain(proibido);
    }
  });
});
