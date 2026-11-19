import { describe, expect, it } from 'vitest';
import type { EngineView } from '../../sim/api/engine';
import { Trails } from './trails';

/** Vista mínima: só o que as setas leem (os lugares e a largura do mapa). */
function fakeView(width = 200): EngineView {
  const place = (id: number, x: number, y: number) => ({ id, x, y, color: [200, 40, 40] });
  return { map: { width, height: 100 }, villages: [place(0, 20, 50), place(1, 80, 50), place(2, 195, 10), place(3, 5, 10)] } as unknown as EngineView;
}

describe('setas das mudanças de lugar (Object Pool)', () => {
  it('colônia por terra na partida, pelo mar na chegada; sem uma das pontas, nada', () => {
    const view = fakeView();
    const t = new Trails();
    t.colony({ kind: 'colony', year: 1, phase: 'depart', from: 0, to: -1, people: 9, by: 'sea' }, view);
    t.colony({ kind: 'colony', year: 1, phase: 'arrive', from: 0, to: 1, people: 9, by: 'land' }, view);
    expect(t.active).toBe(false);
    t.colony({ kind: 'colony', year: 1, phase: 'depart', from: 0, to: 1, people: 9, by: 'land' }, view);
    t.colony({ kind: 'colony', year: 1, phase: 'arrive', from: 1, to: 0, people: 9, by: 'sea' }, view);
    t.migrate({ kind: 'migrate', year: 1, family: 3, from: 0, to: 1, people: 4, cause: 'move' }, view);
    t.migrate({ kind: 'migrate', year: 1, family: 3, from: 0, to: -1, people: 4, cause: 'refuge' }, view);
    expect(t.pool.count).toBe(3);
  });

  it('o traço anda até o destino e some quando chega', () => {
    const view = fakeView();
    const t = new Trails();
    t.add(view, 0, 1, 1);
    const life = t.pool.life[0];
    expect(life).toBeGreaterThanOrEqual(2.5);
    expect(life).toBeLessThanOrEqual(5);
    let left = life - 0.05;
    while (left > 0) {
      t.step(Math.min(0.1, left));
      left -= 0.1;
    }
    // Quase no fim, quase no destino (x 80).
    expect(Math.abs(t.pool.x[0] - 80)).toBeLessThan(1.5);
    t.step(0.2);
    expect(t.active).toBe(false);
  });

  it('pelo lado curto do mapa, e a piscina não passa do tamanho', () => {
    const view = fakeView();
    const t = new Trails();
    t.add(view, 2, 3, 0);
    // De x 195 para x 5 num mapa de 200: anda 10 tiles para o leste, não 190 para o oeste.
    expect(t.pool.vx[0]).toBeGreaterThan(0);
    expect(t.pool.vx[0] * t.pool.life[0]).toBeCloseTo(10, 5);
    for (let k = 0; k < 500; k++) t.add(view, 0, 1, 0);
    expect(t.pool.count).toBe(t.pool.capacity);
  });
});
