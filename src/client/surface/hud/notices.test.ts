import { describe, expect, it } from 'vitest';
import { generateSurface } from '../../../procgen/surface';
import { earthParams } from '../../../sim/calibrate';
import { createEngine } from '../../../sim/api/engine';
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

  it('pelo despachante, só os tipos assinados chegam ao balão', () => {
    const bus = new EventBus<EngineEvent>();
    const said: string[] = [];
    const offs = bindNotices(bus, () => view, (t) => said.push(t));
    bus.emit({ kind: 'found', year: 1, village: a.id, from: -1, how: 'bando', x: 0, y: 0 });
    bus.emit({ kind: 'migrate', year: 1, family: 3, from: a.id, to: b.id, people: 4, cause: 'move' });
    expect(said).toEqual([`Nasceu ${a.name}`]);
    for (const off of offs) off();
    bus.emit({ kind: 'found', year: 1, village: a.id, from: -1, how: 'bando', x: 0, y: 0 });
    expect(said.length).toBe(1);
  });
});
