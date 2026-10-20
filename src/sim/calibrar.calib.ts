/**
 * `npm run calibrar` (RF-VIDA-308): roda várias sementes sem tela e escreve
 * docs/CALIBRACAO.md com média, mediana e faixa de 10% a 90% de cada
 * indicador, comparando com as faixas-alvo. Variáveis: SEMENTES, ANOS, RAIO.
 */
import { it } from 'vitest';
import { CALIBRATION_SEEDS, CALIBRATION_YEARS } from './balance';
import { LABELS, runWorld, summary, TARGETS, type Indicators } from './calibrate';

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

it('calibração', async () => {
  const seeds = Number(env.SEMENTES ?? CALIBRATION_SEEDS);
  const years = Number(env.ANOS ?? CALIBRATION_YEARS);
  const radius = Number(env.RAIO ?? 0.4);
  const runs: Indicators[] = [];
  for (let k = 0; k < seeds; k++) runs.push(runWorld(1000 + k * 37, years, radius).indicators);
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2)).replace('.', ',');
  const rows = (Object.keys(runs[0]) as (keyof Indicators)[])
    .filter((k) => k !== 'seed' && k !== 'years')
    .map((key) => {
      const s = summary(runs.map((r) => r[key]));
      const target = TARGETS.find((t) => t.key === key);
      const ok = target ? (s.p10 >= target.min && s.p90 <= target.max ? 'dentro' : '**fora**') : '';
      return `| ${target?.label ?? LABELS[key] ?? key} | ${fmt(s.mean)} | ${fmt(s.median)} | ${fmt(s.p10)} a ${fmt(s.p90)} | ${target ? `${fmt(target.min)} a ${fmt(target.max)}` : ''} | ${ok} |`;
    });
  const text = `# Calibração da vida

> Gerado por \`npm run calibrar\` (RF-VIDA-308). ${seeds} sementes, ${years} anos, Terra com raio ${fmt(radius)} (1 é a Terra do jogo, 1024×512), 6 aldeias semeadas.
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
