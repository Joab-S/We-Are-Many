/**
 * Sonda do mundo generativo: roda sementes e mostra o que apareceu sem ter sido escrito (quem sobrevive, o que
 * aprendeu, o que construiu). Não é teste de aceite: nenhum resultado com nome é esperado aqui.
 *
 *   npx vitest run --config vitest.calib.config.ts src/sim/generativa/sonda.calib.ts
 *   SEEDS=1,2,3 ANOS=120 GENTE=40 ...
 */
import { it } from 'vitest';
import { earthParams, seedPlanet } from '../calibrate';
import { NEC } from './tipos';
import { pessoasGen, primeirasVezes, retrato, resumoDoMundo } from '../observador/retrato';

declare const process: { env: Record<string, string | undefined> };

const seeds = (process.env.SEEDS ?? '42,7,3').split(',').map(Number);
const anos = Number(process.env.ANOS ?? 80);
const quantos = Number(process.env.GENTE ?? 40);

it('sonda do mundo generativo', () => {
  for (const seed of seeds) {
    const { eco, placed } = seedPlanet(earthParams(0.4), seed, undefined, { espalhados: quantos });
    const t0 = performance.now();
    const linhas: string[] = [];
    const causas: Record<string, number> = {};
    const vistos = new Set<number>();
    for (let y = 1; y <= anos; y++) {
      for (let t = 0; t < eco.yearSpan; t += 0.25) eco.step(0.25);
      primeirasVezes(eco);
      if (y === 100 || y === 30) {
        const gs = pessoasGen(eco);
        let fem = 0, masc = 0, comPar = 0, desejo = 0, energia = 0, sos = 0, parentes = 0;
        for (const { i, uid, p } of gs) {
          const sp = eco.species[eco.kind[i]];
          if (eco.age[i] < sp.maturity || eco.age[i] >= sp.maxAge * 0.75) continue;
          if (uid % 2 === 0) fem++; else masc++;
          desejo += p.desejo; energia += eco.energy[i];
          let par = false, gente = false, kin = false;
          for (const o of gs) {
            if (o.i === i || Math.hypot(eco.x[o.i] - eco.x[i], eco.y[o.i] - eco.y[i]) > 8) continue;
            gente = true;
            const t = eco.genTagsDaPessoa(i, o.i);
            if (t.parceiro) par = true;
            if (t.parente) kin = true;
          }
          if (par) comPar++;
          if (!gente) sos++;
          if (kin && !par) parentes++;
        }
        const n = Math.max(1, fem + masc);
        linhas.push(`  [ano ${y}] férteis: ${fem} mulheres, ${masc} homens; ${comPar} com par à vista, ${sos} sem ninguém à vista, ${parentes} só com parente à vista; desejo médio ${(desejo / n).toFixed(2)}, energia ${(energia / n).toFixed(2)}; concepções ${eco.gen!.conta.concepcoes}`);
      }
      for (const d of eco.deaths) {
        if (vistos.has(d.uid) || eco.species[d.kind ?? 0]?.kind !== 'sapient') continue;
        vistos.add(d.uid);
        const k = `${d.cause}${d.age < 15 ? ' (pequeno)' : ''}`;
        causas[k] = (causas[k] ?? 0) + 1;
      }
      if (y % Math.max(1, Math.floor(anos / 8)) === 0) linhas.push(`  ano ${String(y).padStart(3)}: ${resumoDoMundo(eco)}`);
    }
    const ms = (performance.now() - t0) / (anos * (eco.yearSpan / 0.25));
    console.log(`\n=== semente ${seed}: ${placed} pessoas no começo, ${anos} anos, ${ms.toFixed(2)} ms/passo ===\n${linhas.join('\n')}`);
    console.log(`  mortes: ${JSON.stringify(causas)}`);
    if (eco.villages.length) console.log(`  ATENÇÃO: ${eco.villages.length} assentamentos surgiram por regra: ${eco.chronicle.filter((c) => /fund|chega|colon/i.test(c.text)).slice(-4).map((c) => `[${c.year.toFixed(0)}] ${c.text}`).join(' | ')}`);
    // O que as pessoas andam fazendo (as últimas decisões de cada uma) e o que sentem, em média.
    const atos: Record<string, number> = {};
    const nec = new Array<number>(NEC.length).fill(0);
    const gente = pessoasGen(eco);
    for (const { p } of gente) {
      for (const r of p.linha) atos[`${r.chave.split('|')[0]}${r.fim === 'falhou' ? '✗' : ''}`] = (atos[`${r.chave.split('|')[0]}${r.fim === 'falhou' ? '✗' : ''}`] ?? 0) + 1;
      p.nec.forEach((x, k) => (nec[k] += x / gente.length));
    }
    console.log(`  atos: ${Object.entries(atos).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`);
    console.log(`  sentem: ${NEC.map((n, k) => `${n} ${nec[k].toFixed(2)}`).join(', ')}`);
    for (const g of retrato(eco).slice(0, 4)) console.log('  ' + g.texto);
    for (const f of primeirasVezes(eco).slice(0, 14)) console.log(`  primeira vez (visto no ano ${f.ano.toFixed(0)}): ${f.oque}`);
  }
}, 600_000);
