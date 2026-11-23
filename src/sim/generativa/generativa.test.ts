import { describe, expect, it } from 'vitest';
import { aprender, contar, contextualizar, creditar, encadear, herdar, lembrarAto, novaPessoa, prever, valor, vencer } from './crencas';
import { GEN, N, NI, zeros } from './tipos';

const vivido = { tipo: 'vivido' as const, de: 0, em: 1 };
const efeito = (x: Partial<Record<keyof typeof NI, number>>) => {
  const e = zeros();
  for (const [k, v] of Object.entries(x)) e[NI[k as keyof typeof NI]] = v as number;
  return e;
};

describe('crenças: o que a pessoa espera e como corrige', () => {
  it('nasce só com o instinto: comer, beber, dormir, fugir e ficar perto de gente', () => {
    const p = novaPessoa(0);
    expect(prever(p, 'comer', { comivel: 1 }, {}).e[NI.fome]).toBeLessThan(0);
    expect(prever(p, 'beber', { agua: 1 }, {}).e[NI.sede]).toBeLessThan(0);
    expect(prever(p, 'fugir', { perigoso: 1 }, {}).e[NI.medo]).toBeLessThan(0);
    // Não sabe nada de guardar, plantar, empilhar ou fazer ferramenta.
    for (const k of ['largar|comivel', 'largar|semente', 'empilhar|galho', 'bater|pedra', 'acender|galho']) expect(p.crencas[k]).toBeUndefined();
    expect(Object.values(p.crencas).every((c) => c.o.tipo === 'instinto')).toBe(true);
  });

  it('a crença é por tag: quem comeu fruta de um arbusto espera o mesmo de qualquer coisa com a tag', () => {
    const p = novaPessoa(0);
    const real = efeito({ fome: -0.5 });
    for (let k = 0; k < 6; k++) aprender(p, 'comer', { fruto: 1 }, prever(p, 'comer', { fruto: 1 }, {}).e, real, GEN.aprende, vivido);
    const outra = prever(p, 'comer', { fruto: 0.8, sombra: 0.3 }, {});
    expect(outra.e[NI.fome]).toBeLessThan(-0.25);
    expect(outra.c).toBeGreaterThan(0.5);
    expect(p.crencas['comer|fruto'].o.tipo).toBe('vivido');
  });

  it('o que veio depois vira crença: pegar pedra deixa pedra na mão', () => {
    const p = novaPessoa(0);
    for (let k = 0; k < 3; k++) aprender(p, 'pegar', { pedra: 1 }, zeros(), zeros(), GEN.aprende, vivido, ['mao:pedra']);
    expect(p.crencas['pegar|pedra'].g?.['mao:pedra']).toBeGreaterThan(0.6);
  });

  it('um ato que rende depois leva o crédito: largar semente e comer a planta vira saber plantar', () => {
    const p = novaPessoa(0);
    lembrarAto(p, -7, 'largar', ['semente'], 1);
    expect(p.crencas['largar|semente']).toBeUndefined();
    for (let k = 0; k < 4; k++) creditar(p, -7, efeito({ fome: -0.4 }), 3);
    expect(p.crencas['largar|semente'].e[NI.fome]).toBeLessThan(-0.15);
    // Outra coisa não leva crédito nenhum.
    expect(creditar(p, -8, efeito({ fome: -0.4 }), 3)).toBe(0);
  });

  it('a aposta que não rende vence, e a crença nela encolhe', () => {
    const p = novaPessoa(0);
    p.crencas['largar|galho'] = { e: efeito({ frio: -0.4 }), c: 0.5, o: vivido, n: 3 };
    lembrarAto(p, -3, 'largar', ['galho'], 1);
    vencer(p, 1 + GEN.espera + 1);
    expect(p.atos).toHaveLength(0);
    expect(p.crencas['largar|galho'].e[NI.frio]).toBeCloseTo(-0.28, 5);
  });
});

describe('lentes: a mesma coisa vale diferente conforme o que há por perto', () => {
  it('nasce de comparar o resultado com e sem uma tag no contexto, e some quando a diferença some', () => {
    const p = novaPessoa(0);
    const melhor = efeito({ medo: -0.3 });
    for (let k = 0; k < 6; k++) {
      contextualizar(p, 'dormir', { gente: 1 }, melhor, 2);
      contextualizar(p, 'dormir', {}, zeros(), 2);
    }
    const l = p.lentes.find((x) => x.v === 'dormir' && x.c === 'gente');
    expect(l).toBeDefined();
    expect(l!.d[NI.medo]).toBeLessThan(-0.2);
    // A lente entra na conta só quando a tag está por perto.
    const u = zeros();
    u[NI.medo] = 1;
    const com = prever(p, 'dormir', { chao: 1 }, { gente: 1 });
    const sem = prever(p, 'dormir', { chao: 1 }, {});
    expect(valor(u, com.lente)).toBeGreaterThan(0.1);
    expect(valor(u, sem.lente)).toBe(0);
    // Deixou de render: a diferença some e a lente vai embora (nada trava).
    for (let k = 0; k < 40; k++) {
      contextualizar(p, 'dormir', { gente: 1 }, zeros(), 9);
      contextualizar(p, 'dormir', {}, zeros(), 9);
    }
    expect(p.lentes.find((x) => x.v === 'dormir' && x.c === 'gente')).toBeUndefined();
  });

  it('não nasce de ruído: resultados que variam igual com e sem a tag não fazem lente', () => {
    const p = novaPessoa(0);
    let a = 12345;
    const rnd = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let k = 0; k < 30; k++) contextualizar(p, 'beber', rnd() < 0.5 ? { arvore: 1 } : {}, efeito({ sede: (rnd() - 0.5) * 0.4 }), 2);
    expect(p.lentes).toHaveLength(0);
  });
});

describe('hábitos: a sequência que rende vira uma opção só', () => {
  it('o ato que abre o caminho e o que rende, repetidos, viram um hábito', () => {
    const p = novaPessoa(0);
    let id = 1;
    for (let k = 0; k < GEN.habito; k++) {
      encadear(p, 'pegar|comivel', zeros(), 0, k, () => id++, true);
      encadear(p, 'dar|filho', efeito({ apego: -0.4 }), 0.3, k + 0.1, () => id++, false);
    }
    expect(p.habitos.map((h) => h.passos.join('>'))).toEqual(['pegar|comivel>dar|filho']);
    expect(p.habitos[0].e[NI.apego]).toBeLessThan(-0.2);
  });

  it('dois atos que rendem cada um por si não são um hábito', () => {
    const p = novaPessoa(0);
    let id = 1;
    for (let k = 0; k < 8; k++) {
      encadear(p, 'beber|agua', efeito({ sede: -0.5 }), 0.4, k, () => id++, false);
      encadear(p, 'comer|comivel', efeito({ fome: -0.4 }), 0.3, k + 0.1, () => id++, false);
    }
    expect(p.habitos).toHaveLength(0);
  });
});

describe('o que passa de um para o outro', () => {
  it('o filho herda parte do que os pais sabem, mais fraco e menos certo, e nunca o instinto de novo', () => {
    const mae = novaPessoa(0);
    mae.crencas['largar|semente'] = { e: efeito({ fome: -0.4 }), c: 0.8, o: vivido, n: 5 };
    mae.lentes.push({ v: 'dormir', c: 'abrigo', d: efeito({ frio: -0.3 }), f: 0.8, o: vivido });
    const filho = novaPessoa(10);
    herdar(filho, [{ uid: 7, p: mae }], 10);
    const c = filho.crencas['largar|semente'];
    expect(c.o).toEqual({ tipo: 'herdado', de: 7, em: 10 });
    expect(c.e[NI.fome]).toBeCloseTo(-0.4 * GEN.herda, 5);
    expect(c.c).toBeLessThan(mae.crencas['largar|semente'].c);
    expect(filho.lentes[0].f).toBeCloseTo(0.8 * GEN.herda, 5);
    expect(filho.crencas['comer|comivel'].o.tipo).toBe('instinto');
  });

  it('conversar passa uma crença com ruído, pesada pela confiança em quem fala', () => {
    const sabe = novaPessoa(0);
    sabe.crencas['acender|galho'] = { e: efeito({ frio: -0.5, medo: -0.2 }), c: 0.9, o: vivido, n: 9 };
    const confia = novaPessoa(0);
    const desconfia = novaPessoa(0);
    const rnd = () => 0.5;
    expect(contar(sabe, 3, confia, 1, rnd, 5)).toBe('acender|galho');
    contar(sabe, 3, desconfia, 0, rnd, 5);
    expect(confia.crencas['acender|galho'].o).toEqual({ tipo: 'ouvido', de: 3, em: 5 });
    expect(confia.crencas['acender|galho'].e[NI.frio]).toBeLessThan(desconfia.crencas['acender|galho'].e[NI.frio]);
    expect(confia.crencas['acender|galho'].c).toBeLessThan(0.9);
    expect(confia.crencas['acender|galho'].e).toHaveLength(N);
  });
});
