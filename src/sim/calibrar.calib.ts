/**
 * `npm run calibrar` (RF-VIDA-308): roda várias sementes sem tela e escreve
 * docs/CALIBRACAO.md com média, mediana e faixa de 10% a 90% de cada
 * indicador, comparando com as faixas-alvo. Variáveis: SEMENTES, ANOS, RAIO e YEAR_SPAN
 * (segundos do ano de calendário: o padrão é o ano de ação, 6 s; 12 mede o ano do jogo, ver eco/core/clock.ts).
 */
import { it } from 'vitest';
import { CALIBRATION_SEEDS, CALIBRATION_YEARS } from './balance';
import { YEAR_SECONDS } from './ecosystem';
import { reportRows, runWorld, TARGETS, type Indicators } from './calibrate';

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

it('calibração', async () => {
  const seeds = Number(env.SEMENTES ?? CALIBRATION_SEEDS);
  const years = Number(env.ANOS ?? CALIBRATION_YEARS);
  const radius = Number(env.RAIO ?? 0.4);
  const yearSpan = Number(env.YEAR_SPAN ?? YEAR_SECONDS);
  const runs: Indicators[] = [];
  for (let k = 0; k < seeds; k++) runs.push(runWorld(1000 + k * 37, years, radius, yearSpan).indicators);
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2)).replace('.', ',');
  const rows = reportRows(runs, TARGETS);
  const text = `# Calibração da vida

> Gerado por \`npm run calibrar\` (RF-VIDA-308). ${seeds} sementes, ${years} anos, Terra com raio ${fmt(radius)} (1 é a Terra do jogo, 1024×512), 6 aldeias semeadas${yearSpan !== YEAR_SECONDS ? `, ano de calendário de ${fmt(yearSpan)} s (o de ação tem ${YEAR_SECONDS} s)` : ''}.
> As faixas-alvo estão no [REQUISITOS-VIDA.md, seção 19.15](REQUISITOS-VIDA.md#1915-base-de-simulação-estocástica). Indicadores ainda sem faixa aparecem só com os números.

| Indicador | Média | Mediana | 10% a 90% | Faixa-alvo | Situação |
|---|---|---|---|---|---|
${rows.join('\n')}
`;
  // Sem tipos do Node no projeto: o módulo é carregado pelo nome.
  const fsName = 'node:fs';
  const fs = (await import(/* @vite-ignore */ fsName)) as { writeFileSync: (path: string, text: string) => void };
  fs.writeFileSync('docs/CALIBRACAO.md', text);
  console.log(text);
});
