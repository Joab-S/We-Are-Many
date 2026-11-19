import { describe, expect, it } from 'vitest';
import { seedWorld } from '../calibrate';
import { YEAR_SECONDS, type Ecosystem } from '../ecosystem';
import { worldFingerprint } from '../fingerprint';
import { EVENT_QUEUE_LIMIT, eventVillages, type EngineEvent } from './events';
import source from './events.ts?raw';

/** Mundo pequeno (raio 0,2 da Terra) com 6 aldeias semeadas; a fila começa vazia. */
function small(seed = 5): Ecosystem {
  const { eco } = seedWorld(seed, 0.2);
  eco.drainEvents();
  return eco;
}

const run = (eco: Ecosystem, years: number, each?: () => void) => {
  for (let y = 0; y < years; y++) {
    for (let t = 0; t < YEAR_SECONDS; t += 0.25) {
      eco.step(0.25);
      each?.();
    }
  }
};

describe('fila de eventos do motor (src/sim/api/events.ts)', () => {
  it('uma fundação gera `found` com o id, a origem e o jeito', () => {
    const eco = small();
    expect(eco.events).toEqual([]);
    const s = eco.species.findIndex((sp) => sp.kind === 'sapient');
    const mother = eco.villages.find((v) => !v.abandoned)!;
    const v = eco.foundVillage(s, Math.floor(mother.x) + 30, Math.floor(mother.y), 3, mother, 'colônia');
    const found = eco.drainEvents().filter((e) => e.kind === 'found');
    expect(found).toEqual([{ kind: 'found', year: eco.year, village: v.id, from: mother.id, how: 'colônia', x: v.x, y: v.y }]);
    // Sem origem: o bando que funda sozinho.
    const w = eco.foundVillage(s, Math.floor(mother.x) - 30, Math.floor(mother.y), 3);
    expect(eco.drainEvents()).toContainEqual({ kind: 'found', year: eco.year, village: w.id, from: -1, how: 'bando', x: w.x, y: w.y });
  });

  it('drainEvents entrega na ordem (FIFO) e esvazia a fila', () => {
    const eco = small();
    const a: EngineEvent = { kind: 'extinction', year: 1, species: 0 };
    const b: EngineEvent = { kind: 'tierUp', year: 2, village: 3, tier: 1 };
    eco.emit(a);
    eco.emit(b);
    expect(eco.drainEvents()).toEqual([a, b]);
    expect(eco.events.length).toBe(0);
    expect(eco.drainEvents()).toEqual([]);
  });

  it('sem ninguém drenando, a fila para no limite e o mais antigo sai', () => {
    const eco = small();
    for (let k = 0; k < EVENT_QUEUE_LIMIT + 10; k++) eco.emit({ kind: 'extinction', year: k, species: 0 });
    expect(eco.events.length).toBe(EVENT_QUEUE_LIMIT);
    expect(eco.events[0].year).toBe(10);
    expect(eco.events[eco.events.length - 1].year).toBe(EVENT_QUEUE_LIMIT + 9);
  });

  it('emitir não muda o mundo nem os sorteios: com a fila desligada, a mesma impressão digital', () => {
    const a = small(11);
    const b = small(11);
    // `b` não guarda nada (emit vira nada); `a` guarda e é drenado a cada passo, como no jogo.
    (b as unknown as { emit: () => void }).emit = () => {};
    run(a, 12, () => a.drainEvents());
    run(b, 12);
    expect(b.events).toEqual([]);
    expect(worldFingerprint(a)).toBe(worldFingerprint(b));
  }, 60000);

  it('os eventos de um mundo rodando são dados puros, com ano e ids de assentamentos que existem', () => {
    const eco = small(5);
    const got: EngineEvent[] = [];
    run(eco, 30, () => got.push(...eco.drainEvents()));
    const kinds = new Set(got.map((e) => e.kind));
    expect(kinds.has('tech')).toBe(true);
    expect(kinds.has('migrate') || kinds.has('exodus')).toBe(true);
    for (const e of got) {
      expect(JSON.parse(JSON.stringify(e))).toEqual(e);
      expect(Number.isFinite(e.year)).toBe(true);
      expect(e.year).toBeLessThanOrEqual(eco.year);
      for (const id of eventVillages(e)) expect(eco.villages[id], `${e.kind} ${id}`).toBeDefined();
    }
    // Em ordem de ano (FIFO).
    for (let k = 1; k < got.length; k++) expect(got[k].year).toBeGreaterThanOrEqual(got[k - 1].year);
  }, 60000);

  it('a crônica guarda os ids dos assentamentos da linha (o lugar e os citados pelo nome)', () => {
    const eco = small();
    const [v, o] = eco.villages.filter((q) => !q.abandoned);
    eco.note(`${v.name} mandou presentes a ${o.name}`, 'povo', v);
    expect(eco.chronicle[0].villages).toEqual([v.id, o.id]);
    eco.note('Um raio caiu no mato', 'natureza', { x: 1, y: 1 });
    expect(eco.chronicle[0].villages).toEqual([]);
    // Repetição com a mesma chave junta os lugares.
    eco.note(`Feira em ${v.name}`, 'economia', v, { key: 'feira' });
    eco.note(`Feira em ${o.name}`, 'economia', o, { key: 'feira' });
    expect(eco.chronicle[0].villages).toEqual([v.id, o.id]);
  });

  it('não importa nada do cliente nem do three.js', () => {
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    for (const p of imports) {
      expect(p).not.toMatch(/client/);
      expect(p).not.toMatch(/^three/);
    }
  });
});
