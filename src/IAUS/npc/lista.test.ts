import { expect, it } from 'vitest';
import doc from '../../../docs/COMPORTAMENTOS.md?raw';
import { listaDeComportamentos } from './lista';

const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

it('docs/COMPORTAMENTOS.md está em dia com o catálogo', async () => {
  const atual = listaDeComportamentos();
  if (env.GRAVAR) {
    // Sem tipos do Node no projeto: o módulo é carregado pelo nome.
    const fsName = 'node:fs';
    const fs = (await import(/* @vite-ignore */ fsName)) as { writeFileSync(path: URL, data: string): void };
    fs.writeFileSync(new URL('../../../docs/COMPORTAMENTOS.md', import.meta.url), atual);
    return;
  }
  expect(doc, 'a lista mudou: rode com GRAVAR=1 para regravar docs/COMPORTAMENTOS.md').toBe(atual);
});
