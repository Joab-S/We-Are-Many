/**
 * `npm run replay -- <caso.json> [--ate <ano>]` (tools/replay.mjs): refaz sem tela o caso copiado da aba Tempo do painel
 * F3 e imprime a impressão digital. Variáveis: CASO, ATE.
 */
import { it } from 'vitest';
import { replayCase, type ReplayCase } from './api/replay';

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined>; exitCode?: number } }).process;

it('replay', async () => {
  const fsName = 'node:fs';
  const fs = (await import(/* @vite-ignore */ fsName)) as { readFileSync: (path: string, enc: string) => string };
  const c = JSON.parse(fs.readFileSync(env.env.CASO!, 'utf8')) as ReplayCase;
  const r = replayCase(c, { untilYear: env.env.ATE ? Number(env.env.ATE) : undefined });
  const verdict = r.same === null ? `parou antes do passo do caso (${c.tick})` : r.same ? 'igual à do caso' : `DIFERENTE da do caso (${c.fingerprint})`;
  console.log(`Ano ${r.year.toFixed(2)}, passo ${r.tick}, ${r.commands} ${r.commands === 1 ? 'comando' : 'comandos'}. Impressão digital ${r.fingerprint}: ${verdict}.`);
  if (r.same === false) throw new Error('O replay não deu o mesmo mundo.');
});
