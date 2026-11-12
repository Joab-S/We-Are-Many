import { describe, expect, it } from 'vitest';
import { AiEntity, SimpleWorld } from '../../aiEntity';
import { Brain } from '../../brain';
import { SelectionMode } from '../../enums';
import { Pessoa, type Resultado } from '../pessoa';
import { WOT } from '../vocab';
import { CEREBRO_DA_ALDEIA, FOCO_ALDEIA } from './pacotes';

/**
 * A mente da aldeia sem o mundo: uma pessoa com o que sente (stats `eu`), os alvos que percebe (com os stats
 * de cada um) e o cérebro de nascença. Confere que a escolha sai das considerações, não de uma ordem fixa.
 */
type Alvo = { id: number; type: string; x: number; stats?: Record<string, number> };

function mente(sente: Record<string, number>, alvos: Alvo[], seed: number = CEREBRO_DA_ALDEIA.adulto) {
  const w = new SimpleWorld();
  const feitos: string[] = [];
  let resposta: Resultado = 'continua';
  const p = new Pessoa({
    id: 1,
    name: 'P1',
    position: { x: 0, y: 0 },
    corpo: {
      agir: (acao) => {
        feitos.push(acao);
        return resposta;
      },
    },
  });
  const base = { fome: 0, cansaco: 0, solidao: 0, fe: 0, carga: 0, cheio: 0, espacoLenha: 1, semCasa: 0, semComida: 0, alarme: 0, enterro: 0 };
  for (const [k, v] of Object.entries({ ...base, ...sente })) p.setStat(k, v);
  let vistos = alvos.map((a) => new AiEntity({ id: a.id, name: a.type, type: a.type, position: { x: a.x, y: 0 }, stats: a.stats ?? {} }));
  const brain = Brain.fromSeed(seed, p, w, { selection: { mode: SelectionMode.Best }, perceive: () => vistos });
  return {
    p,
    brain,
    escolha: () => brain.decide()?.context.behavior.name ?? null,
    ver: (novos: Alvo[]) => {
      vistos = novos.map((a) => new AiEntity({ id: a.id, name: a.type, type: a.type, position: { x: a.x, y: 0 }, stats: a.stats ?? {} }));
    },
    responder: (r: Resultado) => (resposta = r),
    feitos,
  };
}

const celeiro: Alvo = { id: -1, type: WOT.celeiro, x: 10, stats: { comida: 1 } };
const roca: Alvo = { id: -2, type: WOT.roca, x: 6, stats: { safra: 1, oficio: 1, falta: 0.8 } };
const arvore: Alvo = { id: -3, type: WOT.arvore, x: 6, stats: { falta: 1, cabe: 1 } };

describe('mente da aldeia (IAUS, ações atômicas)', () => {
  it('com fome e comida no celeiro, vai comer; sem fome, trabalha', () => {
    expect(mente({ fome: 0.9 }, [celeiro, roca]).escolha()).toBe('Comer no celeiro');
    expect(mente({ fome: 0 }, [celeiro, roca]).escolha()).toBe('Colher a roça');
  });

  it('sem comida no celeiro, a fome manda procurar no mato', () => {
    expect(mente({ fome: 0.9, semComida: 1 }, [{ ...celeiro, stats: { comida: 0 } }]).escolha()).toBe('Procurar comida no mato');
  });

  it('o lenhador junta mais de uma árvore antes de levar a lenha; com a mão cheia, leva', () => {
    expect(mente({ carga: 1, cheio: 0.33, espacoLenha: 0.67 }, [celeiro, arvore]).escolha()).toBe('Derrubar uma árvore');
    expect(mente({ carga: 1, cheio: 1, espacoLenha: 0 }, [celeiro, arvore]).escolha()).toBe('Levar a carga ao celeiro');
  });

  it('a ação em andamento ganha o momentum e não troca por pouco', () => {
    const m = mente({}, [roca]);
    const d = m.brain.decide()!;
    expect(d.context.behavior.name).toBe('Colher a roça');
    m.brain.commit(d);
    expect(m.feitos).toEqual(['Colher']);
    expect(d.context.behavior.momentum).toBe(FOCO_ALDEIA);
    // Aparece uma árvore um pouco mais atraente que a roça: quem está colhendo continua colhendo.
    m.ver([roca, arvore]);
    const nota = (nome: string) => m.brain.decisions.find((x) => x.context.behavior.name === nome)!;
    expect(m.escolha()).toBe('Colher a roça');
    expect(m.brain.explain(nota('Derrubar uma árvore')).score).toBeGreaterThan(m.brain.explain(nota('Colher a roça')).score / FOCO_ALDEIA);
    // Sem a roça em andamento, a árvore ganharia.
    expect(mente({}, [roca, arvore]).escolha()).toBe('Derrubar uma árvore');
  });

  it('o corpo diz quando a ação acabou, e o cérebro pensa de novo', () => {
    const m = mente({ fome: 0.9 }, [celeiro]);
    m.brain.commit(m.brain.decide()!);
    expect(m.brain.currentDecision?.context.behavior.name).toBe('Comer no celeiro');
    m.responder('feito');
    m.brain.update(0.1);
    expect(m.brain.currentDecision?.context.behavior.name ?? null).not.toBe('Comer no celeiro');
  });

  it('o alarme leva quem tem medo ao abrigo, acima de comer', () => {
    const casa: Alvo = { id: -4, type: WOT.casa, x: 3, stats: { comida: 1 } };
    const praca: Alvo = { id: -5, type: WOT.praca, x: 5, stats: {} };
    expect(mente({ fome: 0.6, alarme: 1, 'tr.courage': -0.8 }, [celeiro, casa, praca]).escolha()).toBe('Correr para o abrigo');
    expect(mente({ fome: 0.6 }, [celeiro, casa, praca]).escolha()).toBe('Comer em casa');
  });

  it('a criança brinca na praça com gente e procura os pais quando sente falta', () => {
    const praca: Alvo = { id: -5, type: WOT.praca, x: 5, stats: { gente: 1 } };
    const pai: Alvo = { id: 7, type: WOT.pessoa, x: 8, stats: { parente: 1, laco: 1, livre: 1 } };
    expect(mente({}, [praca, pai], CEREBRO_DA_ALDEIA.crianca).escolha()).toBe('Brincar na praça');
    expect(mente({ solidao: 1 }, [{ ...praca, stats: { gente: 0 } }, pai], CEREBRO_DA_ALDEIA.crianca).escolha()).toBe('Ficar perto dos pais');
  });
});
