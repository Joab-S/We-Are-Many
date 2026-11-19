/**
 * O laboratório da sociedade por muitos anos (fora dos testes normais porque demora uns 30 s):
 *
 *   npx vitest run --config vitest.calib.config.ts src/sim/sociedade/sociedade.calib.ts --silent=false
 *
 * SEMENTE e ANOS (variáveis de ambiente) mudam a corrida. Imprime o resumo dos lugares, a crônica do fim e o que
 * mais aparece nos diários, e confere que a história chegou ao governo: eleição, imposto e obra pública.
 */
import { expect, it } from 'vitest';
import { Sociedade } from './mundo';

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

it('a sociedade chega ao governo', () => {
  const s = new Sociedade(Number(env.SEMENTE ?? 7), { pioneiros: 2, chegadas: 1.5 });
  const anos = Number(env.ANOS ?? 40);
  const t0 = Date.now();
  for (let k = 0; k < anos * 60 * 2; k++) s.passo(0.5);
  console.log(`${anos} anos em ${Date.now() - t0} ms`);
  console.log(JSON.stringify(s.resumo(), null, 1));
  console.log(s.cronica.slice(-60).map((e) => `${(e.t / 60).toFixed(1)} ${e.texto}`).join('\n'));
  const cont = new Map<string, number>();
  for (const g of s.gente.values())
    for (const d of g.diario) {
      const k = d.replace(/\[.*?\] /, '').split(/[:,(]/)[0].replace(/\d+/g, '#');
      cont.set(k, (cont.get(k) ?? 0) + 1);
    }
  console.log([...cont.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30));
  console.log(s.mortos.slice(-10));
  const textos = s.cronica.map((e) => e.texto);
  expect(textos.some((t) => /foi eleito líder/.test(t))).toBe(true);
  expect(textos.some((t) => /mudou o imposto/.test(t))).toBe(true);
  expect(textos.some((t) => /terminou a obra pública/.test(t))).toBe(true);
  expect(textos.some((t) => /transformou a casa numa/.test(t))).toBe(true);
});
