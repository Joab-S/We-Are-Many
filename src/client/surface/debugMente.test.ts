import { describe, expect, it } from 'vitest';
import { createEngine } from '../../sim/api/engine';
import { earthParams } from '../../sim/calibrate';
import { nativeSpecies } from '../../sim/species';
import { generateSurface } from '../../procgen/surface';
import { collectiveTabHtml, fichaGenerativaHtml, mindTabHtml } from './debugMente';
import { humanidadeHtml, painelGen, relogioGen } from './humanidade';

/** Um mundo generativo pequeno, pela fachada do motor (como o cliente o vê), com a câmera em cima de alguém. */
function mundo() {
  const params = earthParams(0.25);
  const engine = createEngine(generateSurface(params), { seed: 21, species: nativeSpecies(params), generativa: 16 });
  const view = engine.view;
  const quem = () => {
    for (let i = 0; i < view.count; i++) if (view.alive[i] && engine.debug.mente(i)) return i;
    return -1;
  };
  const i = quem();
  engine.apply({ kind: 'view', focus: { x: view.x[i], y: view.y[i], r: 24 }, pinned: -1 });
  for (let t = 0; t < 6 * 6; t += 0.25) engine.step(0.25);
  return { engine, i: view.alive[i] ? i : quem() };
}

describe('debug da mente generativa', () => {
  const { engine, i } = mundo();
  const m = engine.debug.mente(i)!;

  it('a aba Mente responde por que a pessoa fez o que fez e de onde veio a ideia', () => {
    expect(m).not.toBeNull();
    expect(m.necessidades).toHaveLength(13);
    expect(m.crencas.some((c) => c.tipo === 'instinto')).toBe(true);
    expect(m.opcoes.length).toBeGreaterThan(0);
    // As que foram ao IAUS têm uma barra por consideração; as cortadas, nenhuma.
    const pontuadas = m.opcoes.filter((o) => !o.cortada);
    expect(pontuadas.length).toBeGreaterThan(0);
    for (const o of pontuadas) expect(o.fatores.map((f) => f.nome)).toEqual(expect.arrayContaining(['benefício', 'confiança', 'custo', 'risco']));
    const html = mindTabHtml(m, null, true);
    for (const parte of ['Por quê: as opções geradas agora', 'Considerações do IAUS', 'Necessidades', 'Linha do tempo', 'Crenças', 'de nascença', 'Exportar esta pessoa']) expect(html).toContain(parte);
    expect(mindTabHtml(null, null, false)).toContain('Mundo novo');
  });

  it('a ficha da pessoa mostra o que ela faz agora sem falar em assentamento', () => {
    const html = fichaGenerativaHtml(m);
    expect(html).toContain('além do instinto');
    expect(html).not.toMatch(/assentamento|profissão|ofício/);
  });

  it('a aba Coletivo mede e não usa nenhuma palavra de categoria', () => {
    const c = engine.debug.coletivo()!;
    expect(c.grupos.length).toBeGreaterThan(0);
    const chave = c.sabem[0]?.chave ?? 'comer|comivel';
    const html = collectiveTabHtml(c, engine.debug.difusao(chave));
    expect(html).toContain('Agrupamentos de agora');
    expect(html).toContain('Primeiras vezes vistas');
    expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(/\b(aldeia|vila|reino|tribo|bando|nômades?|cidade|chefe|líder|império)\b/i);
  });

  it('o jogador vê a humanidade (relógio, painel e janela) medida, sem nome de categoria', () => {
    const n = engine.debug.mundoGen()!;
    const c = engine.debug.coletivo()!;
    expect(n.gente).toBeGreaterThan(0);
    expect(relogioGen(n)).toMatch(/no norte$/);
    const html = [painelGen(n), humanidadeHtml(c, n)].join(' ');
    expect(html).toContain('Agrupamentos de agora');
    expect(html).toContain(`${n.gente}`);
    expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(/\b(aldeia|vila|reino|tribo|bando|nômades?|cidade|chefe|líder|império|assentamentos?)\b/i);
    // Num mundo de vilas, nada disso existe.
    const vilas = createEngine(generateSurface(earthParams(0.25)), { seed: 21, species: nativeSpecies(earthParams(0.25)) });
    expect(vilas.debug.mundoGen()).toBeNull();
  });

  it('a ficha dá à pessoa os laços pelo que viveu e os parentes pelo índice de agora', () => {
    for (const l of m.lacos) expect(engine.view.uid[l.i]).toBe(l.uid);
    for (const f of m.filhos) expect(engine.view.uid[f.i]).toBe(f.uid);
    if (m.seguida) expect(engine.view.uid[m.seguida.i]).toBe(m.seguida.uid);
  });

  it('o estado exportado é dado puro (sobrevive ao JSON)', () => {
    const dado = engine.debug.exportarMentes([m.uid]) as { pessoas: unknown[] };
    expect(JSON.parse(JSON.stringify(dado))).toEqual(dado);
    expect(dado.pessoas).toHaveLength(1);
  });
});
