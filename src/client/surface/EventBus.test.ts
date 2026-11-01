import { describe, expect, it } from 'vitest';
import { EventBus } from './EventBus';

type Ev = { kind: 'found'; village: number } | { kind: 'warStart'; a: number } | { kind: 'era'; village: number };

describe('EventBus: despachante dos eventos do motor no cliente', () => {
  it('on entrega só o tipo assinado; onAny entrega todos, depois dos do tipo', () => {
    const bus = new EventBus<Ev>();
    const seen: string[] = [];
    bus.on('found', (e) => seen.push(`found:${e.village}`));
    bus.onAny((e) => seen.push(`any:${e.kind}`));
    bus.on('warStart', (e) => seen.push(`war:${e.a}`));
    bus.emit({ kind: 'found', village: 3 });
    bus.emit({ kind: 'warStart', a: 7 });
    bus.emit({ kind: 'era', village: 1 });
    expect(seen).toEqual(['found:3', 'any:found', 'war:7', 'any:warStart', 'any:era']);
  });

  it('vários ouvintes de todos recebem na ordem em que assinaram', () => {
    const bus = new EventBus<Ev>();
    const seen: string[] = [];
    bus.onAny(() => seen.push('a'));
    bus.onAny(() => seen.push('b'));
    bus.emit({ kind: 'era', village: 0 });
    expect(seen).toEqual(['a', 'b']);
  });

  it('a função devolvida desliga só aquele ouvinte, e desligar duas vezes não faz mal', () => {
    const bus = new EventBus<Ev>();
    const a: string[] = [];
    const b: string[] = [];
    const offA = bus.onAny((e) => a.push(e.kind));
    bus.onAny((e) => b.push(e.kind));
    bus.emit({ kind: 'found', village: 1 });
    offA();
    offA();
    bus.emit({ kind: 'era', village: 1 });
    expect(a).toEqual(['found']);
    expect(b).toEqual(['found', 'era']);
  });

  it('quem desliga (ou assina) durante a entrega não atrapalha a entrega em curso', () => {
    const bus = new EventBus<Ev>();
    const seen: string[] = [];
    const off = bus.onAny(() => {
      seen.push('primeiro');
      off();
      bus.onAny(() => seen.push('novo'));
    });
    bus.onAny(() => seen.push('segundo'));
    bus.emit({ kind: 'era', village: 0 });
    expect(seen).toEqual(['primeiro', 'segundo']);
    bus.emit({ kind: 'era', village: 0 });
    expect(seen).toEqual(['primeiro', 'segundo', 'segundo', 'novo']);
  });

  it('clear desliga todo mundo, os de um tipo e os de todos', () => {
    const bus = new EventBus<Ev>();
    let n = 0;
    bus.on('found', () => n++);
    bus.onAny(() => n++);
    bus.clear();
    bus.emit({ kind: 'found', village: 0 });
    expect(n).toBe(0);
  });
});
