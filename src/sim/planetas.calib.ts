/**
 * `npm run calibrar:planetas`: roda poucos anos em planetas tipo (frio, seco, oceano quente), cada um com um povo
 * alienígena semeado, e reescreve a seção "Outros planetas" de docs/CALIBRACAO-LONGA.md, com as metas escaladas pela
 * terra habitável. Não é meta a bater: é para achar o que quebra. Variáveis: SEMENTES, ANOS.
 */
import { it } from 'vitest';
import { habitableTiles, reportRows, runWorld, scaledTargets, EARTH_HABITABLE_TILES, type Indicators } from './calibrate';
import { YEAR_SECONDS, type Ecosystem } from './ecosystem';
import { generateSurface } from '../procgen/surface';
import { OTHER_PLANETS, TYPE_PLANETS, WHAT_BREAKS } from './planetas';
import { nativeSpecies } from './species';

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

const PARTS = ['farm', 'irrigated', 'graze', 'fish', 'wood', 'forage'] as const;
const KEYS: (keyof Indicators)[] = ['people', 'peopleTrend', 'settlements', 'founded', 'exodus', 'medianPop', 'biggest', 'metropoles', 'realms', 'hunger', 'cityShare'];

/** Quanto cada parte da área rende, na média dos lugares vivos no fim da rodada. */
function partsOf(eco: Ecosystem): Record<(typeof PARTS)[number], number> {
  const out = { farm: 0, irrigated: 0, graze: 0, fish: 0, wood: 0, forage: 0 };
  const live = eco.villages.filter((v) => !v.abandoned && v.area);
  for (const v of live) for (const p of PARTS) out[p] += (v.area![p] ?? 0) / live.length;
  return out;
}

it('calibração nos planetas tipo', async () => {
  const seeds = Number(env.SEMENTES ?? 2);
  const years = Number(env.ANOS ?? 200);
  const fmt = (n: number, d = 2) => (Number.isInteger(n) ? String(n) : n.toFixed(d)).replace('.', ',');
  const sections: string[] = [];
  for (const { params, tests } of TYPE_PLANETS) {
    const map = generateSurface(params);
    const species = () => nativeSpecies(params, 0, 'sapient');
    const runs: Indicators[] = [];
    const parts: ReturnType<typeof partsOf>[] = [];
    let ever = 0;
    for (let k = 0; k < seeds; k++) {
      const { eco, indicators } = runWorld(1000 + k * 37, years, params.radiusEarth, YEAR_SECONDS, params, species());
      runs.push(indicators);
      parts.push(partsOf(eco));
      ever += eco.villages.length / seeds;
    }
    const hab = habitableTiles(map);
    const mean = (p: (typeof PARTS)[number]) => parts.reduce((s, r) => s + r[p], 0) / parts.length;
    sections.push(`### ${params.name} (${tests})

${params.temperatureK} K, ${fmt(params.water * 100, 0)}% de água, raio ${fmt(params.radiusEarth)}, ${map.width}×${map.height}. Terra habitável: ${hab} tiles, ${fmt((hab / EARTH_HABITABLE_TILES) * 100, 1)}% da Terra do jogo.

| Indicador | Média | Mediana | 10% a 90% | Meta | Situação |
|---|---|---|---|---|---|
${reportRows(runs, scaledTargets(map), KEYS).join('\n')}

Lugares que chegaram a existir, por rodada: ${fmt(ever)}. Rendimento médio por lugar vivo no fim: ${PARTS.map((p) => `${p} ${fmt(mean(p))}`).join(', ')}.
`);
  }
  const text = `${OTHER_PLANETS}

> Gerado por \`npm run calibrar:planetas\`. ${seeds} sementes, ${years} anos de ação, um povo alienígena semeado. As metas de contagem são as da Terra, escaladas pela terra habitável; não são metas a bater, a tabela é para achar o que quebra.

${sections.join('\n')}
### O que quebra

${WHAT_BREAKS.map((line) => `- ${line}`).join('\n')}
`;
  const fsName = 'node:fs';
  const fs = (await import(/* @vite-ignore */ fsName)) as { existsSync: (path: string) => boolean; readFileSync: (path: string, enc: string) => string; writeFileSync: (path: string, text: string) => void };
  const path = env.SAIDA ?? 'docs/CALIBRACAO-LONGA.md';
  const before = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
  const at = before.indexOf(OTHER_PLANETS);
  fs.writeFileSync(path, `${at >= 0 ? before.slice(0, at) : `${before}\n`}${text}`);
  console.log(text);
});
