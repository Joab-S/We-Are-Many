import { describe, expect, it } from 'vitest';
import { earthParams, seedPlanet } from '../calibrate';
import type { Ecosystem } from '../ecosystem';
import { restoreEcosystem, snapshotEcosystem } from '../../save/snapshot';
import { conhecimentos, difusao, pessoasGen, primeirasVezes, resumoDoMundo, retrato } from '../observador/retrato';
import { exportarMundo, menteDebug } from '../observador/pessoa';
import { impressaoGen } from './digital';

const mundo = (seed: number, gente = 24) => seedPlanet(earthParams(0.25), seed, undefined, { espalhados: gente }).eco;
const anos = (eco: Ecosystem, n: number, aCadaAno?: () => void) => {
  for (let y = 0; y < n; y++) {
    for (let t = 0; t < eco.yearSpan; t += 0.25) eco.step(0.25);
    aCadaAno?.();
  }
};

describe('o mundo generativo', () => {
  it('começa com pessoas espalhadas só com o instinto, sem vila, e nenhuma regra funda uma', () => {
    const eco = mundo(11);
    expect(eco.villages).toHaveLength(0);
    const antes = pessoasGen(eco);
    expect(antes.length).toBeGreaterThan(10);
    for (const { p } of antes) expect(Object.values(p.crencas).every((c) => c.o.tipo === 'instinto')).toBe(true);
    anos(eco, 25);
    expect(eco.villages).toHaveLength(0);
    // Viveram: alguém aprendeu além do instinto, e nasceu gente fora de qualquer vila.
    const depois = pessoasGen(eco);
    expect(depois.length).toBeGreaterThan(0);
    expect(depois.some(({ p }) => Object.values(p.crencas).some((c) => c.o.tipo === 'vivido'))).toBe(true);
    expect(eco.gen!.conta.nascidos).toBeGreaterThan(0);
  }, 120_000);

  it('a mesma semente dá o mesmo mundo', () => {
    const a = mundo(5);
    const b = mundo(5);
    anos(a, 12);
    anos(b, 12);
    expect(impressaoGen(a)).toBe(impressaoGen(b));
    const c = mundo(6);
    anos(c, 12);
    expect(impressaoGen(c)).not.toBe(impressaoGen(a));
  }, 120_000);

  it('ligado ou desligado dá o mesmo mundo: observar (retrato, história, difusão, ficha, exportar) não muda nada', () => {
    const quieto = mundo(9);
    const olhado = mundo(9);
    anos(quieto, 20);
    anos(olhado, 20, () => {
      retrato(olhado);
      resumoDoMundo(olhado);
      primeirasVezes(olhado);
      for (const k of conhecimentos(olhado).slice(0, 5)) difusao(olhado, k.chave);
      for (const { i } of pessoasGen(olhado).slice(0, 6)) menteDebug(olhado, i);
      exportarMundo(olhado);
    });
    expect(impressaoGen(olhado)).toBe(impressaoGen(quieto));
  }, 180_000);

  it('o que as pessoas sabem e as coisas que puseram vão no save e voltam', () => {
    const eco = mundo(11);
    anos(eco, 10);
    const volta = restoreEcosystem(structuredClone(snapshotEcosystem(eco, 11)), eco.map);
    expect(volta.gen!.pessoas.size).toBe(eco.gen!.pessoas.size);
    expect(volta.gen!.coisas).toEqual(eco.gen!.coisas);
    const [uid, p] = [...eco.gen!.pessoas][0];
    expect(volta.gen!.pessoas.get(uid)).toEqual(p);
    // Segue vivendo depois de carregar (os cérebros recomeçam; o que cada um sabe continua).
    anos(volta, 2);
    expect(volta.villages).toHaveLength(0);
  }, 120_000);

  it('o retrato do coletivo mede, não rotula', () => {
    const eco = mundo(11);
    anos(eco, 8);
    const grupos = retrato(eco);
    expect(grupos.reduce((n, g) => n + g.quantos, 0)).toBe(pessoasGen(eco).length);
    for (const g of grupos) {
      expect(g.texto).not.toMatch(/aldeia|vila|reino|tribo|bando|nômade|nomade|cidade|chefe|líder/i);
      expect(Object.keys(g)).not.toContain('tipo');
    }
  }, 120_000);
});
