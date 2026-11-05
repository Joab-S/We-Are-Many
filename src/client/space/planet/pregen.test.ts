import { describe, expect, it, vi } from 'vitest';
import type { PlanetParams, SurfaceMap } from '../../../procgen/surface';
import { requestPregen, takePregen, type PregenState } from './pregen';

const params = (id: string) => ({ id }) as PlanetParams;
const mapOf = (name: string) => ({ width: 1, name }) as unknown as SurfaceMap;
const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('o mapa adiantado da órbita', () => {
  it('um pedido só por planeta, e o mapa fica no lugar quando chega', async () => {
    const state: PregenState = {};
    const generate = vi.fn(async () => mapOf('a'));
    const slot = requestPregen(state, params('a'), generate);
    expect(requestPregen(state, params('a'), generate)).toBe(slot);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(slot.map).toBeNull();
    await flush();
    expect(slot.map).toEqual(mapOf('a'));
  });

  it('guarda um só: a órbita de outro planeta toma o lugar', async () => {
    const state: PregenState = {};
    const first = requestPregen(state, params('a'), async () => mapOf('a'));
    const second = requestPregen(state, params('b'), async () => mapOf('b'));
    expect(state.pregen).toBe(second);
    await flush();
    expect(state.pregen?.map).toEqual(mapOf('b'));
    expect(first.id).toBe('a');
  });

  it('descer leva o mapa, mesmo a caminho, e libera o lugar; outro planeta não leva nada', async () => {
    const state: PregenState = {};
    let finish!: (map: SurfaceMap) => void;
    requestPregen(state, params('a'), () => new Promise((resolve) => (finish = resolve)));
    expect(takePregen(state, 'b')).toBeNull();
    expect(state.pregen?.id).toBe('a');
    const job = takePregen(state, 'a')!;
    expect(state.pregen).toBeNull();
    expect(takePregen(state, 'a')).toBeNull();
    finish(mapOf('a'));
    await expect(job).resolves.toEqual(mapOf('a'));
  });
});
