/**
 * `npm run calibrar:longa` (evolução dos povos, etapa 0): roda poucas sementes por 1000 anos na
 * Terra do jogo, sem tela, e escreve docs/CALIBRACAO-LONGA.md com a evolução de longo prazo
 * (tamanho dos assentamentos, cidades, reinos e fome), comparando com as metas. Variáveis: SEMENTES, PRIMEIRA (índice da primeira semente), ANOS, RAIO, SAIDA e
 * YEAR_SPAN (segundos do ano de calendário: o padrão é o ano de ação, 6 s; 12 mede o ano do jogo, ver eco/core/clock.ts).
 */
import { it } from 'vitest';
import { LONG_TARGETS, reportRows, runWorld, type Indicators } from './calibrate';
import { YEAR_SECONDS } from './ecosystem';

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

it('calibração longa', async () => {
  const seeds = Number(env.SEMENTES ?? 3);
  const years = Number(env.ANOS ?? 1000);
  const radius = Number(env.RAIO ?? 1);
  const runs: Indicators[] = [];
  const first = Number(env.PRIMEIRA ?? 0);
  const yearSpan = Number(env.YEAR_SPAN ?? YEAR_SECONDS);
  for (let k = first; k < first + seeds; k++) runs.push(runWorld(1000 + k * 37, years, radius, yearSpan).indicators);
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2)).replace('.', ',');
  const keys: (keyof Indicators)[] = ['people', 'peopleTrend', 'settlements', 'founded', 'exodus', 'medianPop', 'biggest', 'cities', 'metropoles', 'cityShare', 'kingdoms', 'bigKingdoms', 'hunger', 'foodNeed', 'era', 'migrants', 'familyMoves', 'supplied', 'warsDeclared', 'retreats'];
  const text = `# Calibração longa: evolução dos povos

> Gerado por \`npm run calibrar:longa\`. ${seeds} sementes, ${years} anos, Terra com raio ${fmt(radius)} (1 é a Terra do jogo, 1024×512), 6 aldeias semeadas.
> Mede se o povo se concentra em cidades com o tempo, em vez de se espalhar em aldeias pequenas. As metas são da etapa 0 do plano de evolução dos povos.

| Indicador | Média | Mediana | 10% a 90% | Meta | Situação |
|---|---|---|---|---|---|
${reportRows(runs, LONG_TARGETS, keys).join('\n')}
`;
  // Sem tipos do Node no projeto: o módulo é carregado pelo nome.
  const fsName = 'node:fs';
  const fs = (await import(/* @vite-ignore */ fsName)) as { writeFileSync: (path: string, text: string) => void };
  fs.writeFileSync(env.SAIDA ?? 'docs/CALIBRACAO-LONGA.md', text);
  console.log(text);
});
