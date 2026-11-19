import { describe, expect, it } from 'vitest';
import { generateSurface } from '../../../procgen/surface';
import { earthParams } from '../../../sim/calibrate';
import { createEngine, ecosystemOf } from '../../../sim/api/engine';
import type { EngineEvent } from '../../../sim/api/events';
import { nativeSpecies } from '../../../sim/species';
import { EventBus } from '../EventBus';
import { bindNotices, noticeText } from './notices';

describe('avisos dos acontecimentos (consumidor da fila de eventos)', () => {
  const params = earthParams(0.2);
  const engine = createEngine(generateSurface(params), { seed: 7, species: nativeSpecies(params) });
  const view = engine.view;
  const [a, b] = view.villages;

  it('fundação, colônia, guerra e era viram uma linha; o resto fica na crônica', () => {
    expect(noticeText({ kind: 'found', year: 1, village: a.id, from: -1, how: 'bando', x: 0, y: 0 }, view)).toBe(`Nasceu ${a.name}`);
    // Colônia: o aviso é o da colônia, não o da fundação do mesmo instante.
    expect(noticeText({ kind: 'found', year: 1, village: b.id, from: a.id, how: 'colônia', x: 0, y: 0 }, view)).toBeNull();
    expect(noticeText({ kind: 'colony', year: 1, phase: 'depart', from: a.id, to: b.id, people: 9, by: 'land' }, view)).toBe(`Colonos de ${a.name} fundaram ${b.name}`);
    expect(noticeText({ kind: 'warStart', year: 1, a: a.id, b: b.id, target: b.id, motive: 'loot', naval: false }, view)).toContain(`${a.name} contra ${b.name}`);
    expect(noticeText({ kind: 'era', year: 1, village: a.id, era: 1, first: true }, view)).toContain('Idade do Bronze');
    expect(noticeText({ kind: 'era', year: 1, village: a.id, era: 1, first: false }, view)).toBeNull();
    expect(noticeText({ kind: 'tech', year: 1, village: a.id, tech: 'fogo', first: true, lost: false }, view)).toBeNull();
  });

  it('fissão, cerco e guerra por terra de quem está cercado', () => {
    expect(noticeText({ kind: 'fission', year: 1, from: a.id, to: b.id, people: 23, population: 140, pressure: 0.8 }, view)).toBe(`${a.name} cresceu demais e se dividiu: 23 pessoas fundaram ${b.name}`);
    expect(noticeText({ kind: 'circumscribed', year: 1, village: a.id, pressure: 0.9, years: 3 }, view)).toBe(`${a.name} está cercado, sem terra para onde crescer`);
    const war = { kind: 'warStart', year: 1, a: a.kingdom, b: b.kingdom, target: b.id, motive: 'land', naval: false } as const;
    // Sem cerco, a guerra por território tem o aviso de sempre.
    expect(noticeText(war, view)).toBe(`Guerra: ${view.villages[a.kingdom].name} contra ${view.villages[b.kingdom].name} (território)`);
    const live = ecosystemOf(engine).villages[a.id];
    const was = live.circumscribed;
    live.circumscribed = 2;
    try {
      expect(noticeText(war, view)).toBe(`Guerra por terra: ${view.villages[a.kingdom].name}, sem para onde crescer, ataca ${view.villages[b.kingdom].name}`);
      // Outro motivo não muda por causa do cerco.
      expect(noticeText({ ...war, motive: 'loot' }, view)).toContain('(saque)');
    } finally {
      live.circumscribed = was;
    }
  });

  it('pelo despachante, só os tipos assinados chegam ao balão, no fim da entrega', () => {
    const bus = new EventBus<EngineEvent>();
    const said: string[] = [];
    let flush = () => {};
    const offs = bindNotices(bus, () => view, (t) => said.push(t), (fn) => (flush = fn));
    bus.emit({ kind: 'found', year: 1, village: a.id, from: -1, how: 'bando', x: 0, y: 0 });
    bus.emit({ kind: 'migrate', year: 1, family: 3, from: a.id, to: b.id, people: 4, cause: 'move' });
    expect(said).toEqual([]);
    flush();
    expect(said).toEqual([`Nasceu ${a.name}`]);
    for (const off of offs) off();
    bus.emit({ kind: 'found', year: 1, village: a.id, from: -1, how: 'bando', x: 0, y: 0 });
    flush();
    expect(said.length).toBe(1);
  });

  it('a fissão toma o lugar do aviso da colônia do mesmo instante', () => {
    const bus = new EventBus<EngineEvent>();
    const said: string[] = [];
    let flush = () => {};
    bindNotices(bus, () => view, (t) => said.push(t), (fn) => (flush = fn));
    bus.emit({ kind: 'found', year: 1, village: b.id, from: a.id, how: 'colônia', x: 0, y: 0 });
    bus.emit({ kind: 'colony', year: 1, phase: 'depart', from: a.id, to: b.id, people: 23, by: 'land' });
    bus.emit({ kind: 'fission', year: 1, from: a.id, to: b.id, people: 23, population: 140, pressure: 0.8 });
    bus.emit({ kind: 'era', year: 1, village: a.id, era: 1, first: true });
    flush();
    expect(said).toEqual([`${a.name} cresceu demais e se dividiu: 23 pessoas fundaram ${b.name}`, `${a.name} chegou primeiro à Idade do Bronze`]);
    // Colônia sem fissão: fica o aviso dela.
    bus.emit({ kind: 'colony', year: 2, phase: 'depart', from: b.id, to: a.id, people: 9, by: 'land' });
    flush();
    expect(said[2]).toBe(`Colonos de ${b.name} fundaram ${a.name}`);
  });
});
