import { describe, expect, it } from 'vitest';
import { earthParams, seedPlanet } from '../calibrate';
import type { Ecosystem } from '../ecosystem';
import { restoreEcosystem, snapshotEcosystem } from '../../save/snapshot';
import { conhecimentos, difusao, mapaDoColetivo, pessoasGen, primeirasVezes, resumoDoMundo, retrato } from '../observador/retrato';
import { isLand, isWater } from '../eco/tiles';
import { NI } from './tipos';
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

  it('nada do mundo de vilas roda nele: sem fundação, colônia, reino, guerra, caravana nem barco, perto ou longe da tela', () => {
    const eco = mundo(13);
    const tipos = new Set<string>();
    // Metade do tempo com a câmera em cima de alguém (o detalhe de perto), metade sem ninguém olhando.
    const alguem = pessoasGen(eco)[0];
    eco.focus = { x: eco.x[alguem.i], y: eco.y[alguem.i], r: 30 };
    anos(eco, 8, () => {
      for (const e of eco.drainEvents()) tipos.add(e.kind);
    });
    const perto = pessoasGen(eco).filter(({ i }) => eco.genMenteDe(i)?.detalhe === 1).length;
    expect(perto).toBeGreaterThan(0);
    eco.focus = null;
    anos(eco, 12, () => {
      for (const e of eco.drainEvents()) tipos.add(e.kind);
    });
    for (const k of ['found', 'colony', 'farmstead', 'migrate', 'fission', 'merge', 'tierUp', 'polity', 'era', 'tech', 'warStart', 'conquest', 'annex']) expect(tipos, k).not.toContain(k);
    expect(eco.villages).toHaveLength(0);
    expect(eco.wars).toHaveLength(0);
    expect(eco.caravans).toHaveLength(0);
    expect(eco.boats).toHaveLength(0);
    // Longe, o mesmo modelo pensa mais devagar: parte dos atos sai da fila do último pensamento, sem pensar de novo.
    const mentes = pessoasGen(eco).map(({ i }) => eco.genMenteDe(i)!).filter(Boolean);
    expect(mentes.some((m) => m.poupou > 0)).toBe(true);
    expect(mentes.every((m) => m.detalhe === 0)).toBe(true);
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
      mapaDoColetivo(olhado, conhecimentos(olhado)[0]?.chave);
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

describe('a física das estruturas grandes (nenhuma regra: só o que o corpo e as coisas fazem)', () => {
  /** Um mundo, uma pessoa nova num tile de terra com água ao lado, e o tile de água. */
  function naBeira() {
    const eco = mundo(11, 6);
    const w = eco.map.width;
    const s = eco.species.findIndex((sp) => sp.kind === 'sapient');
    for (let t = w; t < w * (eco.map.height - 1); t++) {
      if (!isLand(eco.map, t) || !eco.canStand(s, t) || !isWater(eco.map, t + 1) || !isWater(eco.map, t + 2)) continue;
      const i = eco.spawn(s, (t % w) + 0.9, Math.floor(t / w) + 0.5, -1, 20);
      if (i < 0) continue;
      return { eco, i, terra: t, agua: t + 1 };
    }
    throw new Error('sem beira de água neste mundo');
  }

  it('travessia: quem segura um tronco entra na água e boia; de mãos vazias a água é parede', () => {
    const { eco, i, terra, agua } = naBeira();
    const p = eco.genDe(i);
    expect(eco.genFlutua(i, terra, agua)).toBe(false);
    const andar = () => {
      for (let k = 0; k < 6; k++) {
        eco.think[i] = 9;
        eco.vx[i] = 0.6;
        eco.vy[i] = 0;
        eco.step(0.25);
      }
    };
    andar();
    expect(isWater(eco.map, eco.tileOf(i))).toBe(false);
    p.mao = { que: 'tronco', q: 1 };
    expect(eco.genFlutua(i, terra, agua)).toBe(true);
    eco.x[i] = (terra % eco.map.width) + 0.9;
    andar();
    expect(isWater(eco.map, eco.tileOf(i))).toBe(true);
    // Na água, não dá para largar o tronco nem dá-lo a ninguém (é ele que segura a pessoa).
    const aqui = { id: -1, tipo: 'aqui' as const, x: eco.x[i], y: eco.y[i], dist: 0, tags: { chao: 1 }, t: eco.tileOf(i), j: -1, coisa: 0, k: -1 };
    expect(eco.genCabe(i, p, 'largar', aqui, 'tronco')).toBe(false);
  }, 120_000);

  it('há troncos caídos ao pé de algumas árvores, e cada um só pode ser levado uma vez', () => {
    const { eco, i } = naBeira();
    const p = eco.genDe(i);
    let t = -1;
    for (let k = 0; k < eco.map.width * eco.map.height && t < 0; k++) if (eco.genTroncoCaido(k)) t = k;
    expect(t).toBeGreaterThanOrEqual(0);
    expect(eco.genTagsDoTile(t).tronco).toBe(1);
    const alvo = { id: -(1000 + t), tipo: 'tile' as const, x: 0, y: 0, dist: 0, tags: { tronco: 1 }, t, j: -1, coisa: 0, k: -1 };
    expect(eco.genEfeito(i, p, 'pegar', alvo).ok).toBe(true);
    expect(p.mao).toEqual({ que: 'tronco', q: 1 });
    expect(eco.genTroncoCaido(t)).toBe(false);
    expect(eco.genTagsDoTile(t).tronco).toBeUndefined();
  }, 120_000);

  it('dar a quem mete medo acalma quem deu, e bater em quem se gosta dói em quem bate', () => {
    const { eco, i } = naBeira();
    const s = eco.kind[i];
    const j = eco.spawn(s, eco.x[i] - 0.3, eco.y[i], -1, 25);
    const p = eco.genDe(i);
    const pj = eco.genDe(j);
    const alvo = (tags: Record<string, number>) => ({ id: eco.uid[j], tipo: 'pessoa' as const, x: eco.x[j], y: eco.y[j], dist: 0.3, tags, t: -1, j, coisa: 0, k: -1 });
    p.nec[NI.medo] = 0.8;
    p.mao = { que: 'pedra', q: 1 };
    expect(eco.genEfeito(i, p, 'dar', alvo({ gente: 1, perigoso: 0.6, forte: 0.5 })).ok).toBe(true);
    expect(p.nec[NI.medo]).toBeLessThan(0.6);
    expect(p.conta.deu).toBe(1);
    expect(p.conta.para).toEqual([eco.uid[j]]);
    expect(pj.mao).toEqual({ que: 'pedra', q: 1 });
    // Quem recebeu passou a gostar de quem deu: bater nele agora custa.
    const antes = pj.nec[NI.apego];
    const eu = { id: eco.uid[i], tipo: 'pessoa' as const, x: eco.x[i], y: eco.y[i], dist: 0.3, tags: { gente: 1 }, t: -1, j: i, coisa: 0, k: -1 };
    expect(eco.genEfeito(j, pj, 'bater', eu).ok).toBe(true);
    expect(pj.nec[NI.apego]).toBeGreaterThan(antes);
    expect(pj.conta.bateu).toBe(1);
  }, 120_000);

  it('o retrato ganha as medidas do que é grande, e continua sem rótulo', () => {
    const { eco } = naBeira();
    anos(eco, 4);
    const g = retrato(eco)[0];
    for (const k of ['tomaram', 'travessias', 'armados', 'daoAoMesmo', 'daoParaFora', 'desafetosFora', 'desafetosDentro', 'seguem']) expect(typeof (g as unknown as Record<string, unknown>)[k], k).toBe('number');
    const mapa = mapaDoColetivo(eco);
    expect(mapa.grupos.every((x) => x.quantos >= 2)).toBe(true);
    expect(Array.isArray(mapa.trilhas) && Array.isArray(mapa.segue)).toBe(true);
    expect(mapaDoColetivo(eco, 'comer|comivel').difusao).toEqual([]);
  }, 120_000);
});
