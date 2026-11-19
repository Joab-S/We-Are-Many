import { describe, expect, it } from 'vitest';
import { SimpleWorld } from '../aiEntity';
import { Brain, BrainLibrary } from '../brain';
import { BehaviorTypes } from '../behaviorTypes';
import { SelectionMode } from '../enums';
import { brainGraph, sphereLayout } from '../graph';
import { AiEntity } from '../aiEntity';
import { CEREBRO, PACOTES, ajustarPacotes, catalogo, cerebroDe, criarCerebro } from './pacotes/index';
import { Pessoa } from './pessoa';
import { OFICIO_IDS, S, TAG, WOT, inv, precisa } from './vocab';

const world = () => new SimpleWorld();

function pessoa(w: SimpleWorld, id: number, tracos: Record<string, number> = {}, x = 0): Pessoa {
  const p = new Pessoa({ id, name: `P${id}`, position: { x, y: 0 }, tracos });
  w.add(p);
  return p;
}

describe('catálogo de comportamentos', () => {
  const lista = catalogo();

  it('cada comportamento tem id único, descrição, tipo registrado e pelo menos uma consideração', () => {
    const ids = new Set<number>();
    for (const { comportamento: b } of lista) {
      expect(ids.has(b.id), `id repetido ${b.id} (${b.name})`).toBe(false);
      ids.add(b.id);
      expect(b.description.length, b.name).toBeGreaterThan(10);
      expect(BehaviorTypes.has(b.behaviorType), `${b.name}: ${b.behaviorType}`).toBe(true);
      expect(b.considerations.length, b.name).toBeGreaterThan(0);
    }
    expect(lista.length).toBeGreaterThan(100);
  });

  it('os pacotes cobrem as sete camadas e estão na biblioteca do IAUS', () => {
    expect(new Set(PACOTES.map((p) => p.camada))).toEqual(new Set(['Corpo', 'Mente', 'Vínculos', 'Lugar', 'Sustento', 'Troca', 'Sociedade']));
    for (const p of PACOTES) expect(BrainLibrary.behaviorPackages.get(p.id)).toBe(p.pacote);
  });
});

describe('cérebros de nascença e troca de pacotes em grupo', () => {
  it('andarilho vira morador, morador eleito vira líder, e o ofício traz o pacote de habilidade', () => {
    const w = world();
    const p = pessoa(w, 1);
    p.tagSelf(TAG.adulto);
    const brain = criarCerebro(p, w);
    expect(cerebroDe(p)).toBe(CEREBRO.andarilho);
    const tem = (nome: string) => brain.behaviorPacks.some((x) => x.name === nome);
    expect(tem('Ofício')).toBe(false);

    p.tagSelf(TAG.morador);
    expect(ajustarPacotes(brain)).toBe(true);
    expect(tem('Ofício') && tem('Cidadania')).toBe(true);
    expect(tem('Governo')).toBe(false);

    p.tagSelf(TAG.lider);
    ajustarPacotes(brain);
    expect(tem('Governo')).toBe(true);

    p.setStat('oficio', OFICIO_IDS.indexOf('ferreiro'));
    ajustarPacotes(brain);
    expect(brain.abilityPacks.length).toBe(1);
    expect(ajustarPacotes(brain)).toBe(false);
  });
});

describe('Tagging System', () => {
  it('marcar um alvo marca o alvo e, com o param `eu`, a si mesmo; desmarcar tira as duas', () => {
    const w = world();
    const p = pessoa(w, 1, { courage: 1 });
    p.tagSelf(TAG.adulto);
    p.setStat(S.fome, 0.9);
    const presa = w.add(new AiEntity({ id: 2, name: 'veado', type: WOT.animal, position: { x: 2, y: 0 } }));
    const brain = new Brain(p, w, { selection: { mode: SelectionMode.Best } });
    const escolher = BrainLibrary.behaviors.get([...BrainLibrary.behaviors.values()].find((b) => b.name === 'Escolher uma presa')!.id)!;
    const desistir = [...BrainLibrary.behaviors.values()].find((b) => b.name === 'Desistir da presa')!;
    const pack = PACOTES.find((x) => x.nome === 'Sobrevivência')!.pacote;
    brain.addBehaviorPack(pack);
    const d = brain.decide([presa]);
    expect(d?.context.behavior).toBe(escolher);
    brain.commit(d!);
    expect(presa.tags.has(`${TAG.alvoDeCaca}:1`)).toBe(true);
    expect(p.tags.has(TAG.cacando)).toBe(true);
    // Já caçando, não escolhe outra presa.
    const outra = w.add(new AiEntity({ id: 3, name: 'javali', type: WOT.animal, position: { x: 3, y: 0 } }));
    brain.decide([outra]);
    expect(brain.decisions.find((x) => x.context.behavior === escolher)?.score ?? 0).toBe(0);
    // Desistir tira a marca do alvo e a de si.
    presa.position = { x: 40, y: 0 };
    const ctx = brain.decide([presa]);
    const des = brain.decisions.find((x) => x.context.behavior === desistir)!;
    expect(des.score).toBeGreaterThan(0);
    brain.commit(des);
    expect(presa.tags.has(`${TAG.alvoDeCaca}:1`)).toBe(false);
    expect(p.tags.has(TAG.cacando)).toBe(false);
    expect(ctx).not.toBeNull();
  });

  it('perceber uma tag em outro é uma crença, que se esquece', () => {
    const w = world();
    const a = pessoa(w, 1);
    const b = pessoa(w, 2);
    a.perceive(b, 'Lenhador', 10);
    expect(a.seesTag(b, 'Lenhador', 0)).toBe(true);
    expect(b.tags.has('Lenhador')).toBe(false);
    a.beliefs.purge(11);
    expect(a.seesTag(b, 'Lenhador', 11)).toBe(false);
  });
});

describe('cortar lenha eu mesmo ou encomendar ao lenhador', () => {
  function cena(tracos: Record<string, number>, riqueza: number) {
    const w = world();
    const eu = pessoa(w, 1, tracos);
    eu.tagSelf(TAG.adulto);
    eu.tagSelf(TAG.morador);
    eu.setStat('oficio', OFICIO_IDS.indexOf('ferreiro'));
    eu.setStat(precisa('madeira'), 0.9);
    eu.setStat(S.riqueza, riqueza);
    const arvore = w.add(new AiEntity({ id: 2, name: 'árvore', type: WOT.arvore, position: { x: 6, y: 0 }, stats: { [S.quantidade]: 6 } }));
    const lenhador = pessoa(w, 3, {}, 8);
    lenhador.tagSelf('Lenhador');
    lenhador.setStat('preco', 3);
    eu.perceive(lenhador, 'Lenhador');
    eu.lacos.set(3, 30);
    const brain = criarCerebro(eu, w, { debug: true });
    brain.decide([arvore, lenhador]);
    const nota = (nome: string) => Math.max(0, ...brain.decisions.filter((d) => d.context.behavior.name === nome).map((d) => d.score));
    return { cortar: nota('Cortar lenha eu mesmo'), encomendar: nota('Encomendar a quem faz'), eu, lenhador };
  }

  it('o fraco com dinheiro encomenda; o forte sem dinheiro corta', () => {
    const fraco = cena({ strength: -0.8 }, 8);
    expect(fraco.encomendar).toBeGreaterThan(fraco.cortar);
    const forte = cena({ strength: 0.9 }, 0);
    expect(forte.cortar).toBeGreaterThan(forte.encomendar);
  });

  it('o lenhador decide se aceita pela própria necessidade', () => {
    const w = world();
    const lenhador = pessoa(w, 3, { greed: 0.5 });
    lenhador.tagSelf(TAG.adulto);
    lenhador.tagSelf(TAG.morador);
    lenhador.setStat('oficio', OFICIO_IDS.indexOf('lenhador'));
    const oferta = w.add(new AiEntity({ id: 9, name: 'encomenda', type: WOT.oferta, position: { x: 0, y: 0 }, stats: { fornecedor: 3, cliente: 1, proposta: 1, bem: 0, [S.quantidade]: 4 } }));
    const nota = (riqueza: number) => {
      lenhador.setStat(S.riqueza, riqueza);
      const brain = criarCerebro(lenhador, w, { debug: true });
      brain.decide([oferta]);
      return brain.decisions.find((d) => d.context.behavior.name === 'Aceitar a encomenda')!.score;
    };
    expect(nota(0)).toBeGreaterThan(nota(15));
    expect(lenhador.stat(inv('madeira'))).toBe(0);
  });
});

describe('o grafo do cérebro', () => {
  it('liga cérebro, pacotes, comportamentos, considerações e entradas, e a esfera é determinística', () => {
    const w = world();
    const p = pessoa(w, 1);
    p.tagSelf(TAG.adulto);
    p.tagSelf(TAG.morador);
    const brain = criarCerebro(p, w);
    brain.decide([]);
    const g = brainGraph(brain);
    const kinds = new Set(g.nodes.map((n) => n.kind));
    for (const k of ['brain', 'pack', 'behavior', 'consideration', 'input']) expect(kinds.has(k as never), k).toBe(true);
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const e of g.edges) expect(ids.has(e.from) && ids.has(e.to), `${e.from} → ${e.to}`).toBe(true);
    const a = sphereLayout(g, 10);
    const b = sphereLayout(brainGraph(brain), 10);
    expect([...a.entries()]).toEqual([...b.entries()]);
    for (const v of a.values()) expect(Math.hypot(v.x, v.y, v.z)).toBeLessThanOrEqual(10.8001);
  });
});
