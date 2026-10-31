import { describe, expect, it } from 'vitest';
import * as B from './balance';
import { runWorld } from './calibrate';
import { YEAR_SECONDS } from './ecosystem';
import { fullNeeds } from './needs';
import { caravanCap, cartOf, currencyOf, packAnimal, pickLuxury, price } from './trade';

describe('preço pela escassez (RF-VIDA-231)', () => {
  it('estoque vazio vale mais que cheio, e a falta da necessidade encarece', () => {
    expect(price('wood', 0, 100)).toBeGreaterThan(price('wood', 90, 100) * 3);
    const hungry = { ...fullNeeds(), fuel: 0.2 };
    expect(price('wood', 50, 100, hungry)).toBeGreaterThan(price('wood', 50, 100, fullNeeds()));
  });
  it('luxo vale mais para quem é rico', () => {
    expect(price('wine', 0, 10, fullNeeds(), true)).toBeGreaterThan(price('wine', 0, 10, fullNeeds(), false));
  });
});

describe('luxo, moeda e caravanas', () => {
  const site = { jungle: 0, savanna: 0, forest: 0.2, fertile: 0.2, dry: 0, temp: 285, coast: false };
  it('cada região dá o seu luxo (RF-VIDA-282)', () => {
    expect(pickLuxury({ ...site, jungle: 0.4 })).toBe('spice');
    expect(pickLuxury({ ...site, coast: true, dry: 0.2 })).toBe('salt');
    expect(pickLuxury({ ...site, savanna: 0.3 })).toBe('dye');
    expect(pickLuxury({ ...site, fertile: 0.5 })).toBe('wine');
    expect(pickLuxury({ ...site, temp: 296, forest: 0.6, fertile: 0.2 })).toBe('silk');
    expect(pickLuxury({ ...site, temp: 250 })).toBeNull();
  });
  it('moeda por era (RF-VIDA-291)', () => {
    expect(currencyOf(0, false)).toBe(0);
    expect(currencyOf(1, false)).toBe(1);
    expect(currencyOf(3, false)).toBe(2);
    expect(currencyOf(3, true)).toBe(3);
    expect(currencyOf(4, false)).toBe(4);
  });
  it('limite por assentamento, animal e veículo (RF-VIDA-236 e 223)', () => {
    expect(caravanCap(0, false)).toBe(1);
    expect(caravanCap(2, true)).toBe(3);
    expect(caravanCap(3, false)).toBe(2);
    expect(packAnimal(true, 5)).toBe('camel');
    expect(packAnimal(false, 2)).toBe('horse');
    expect(packAnimal(false, 0)).toBe('donkey');
    expect([0, 1, 2, 3, 4].map(cartOf)).toEqual([0, 1, 1, 2, 2]);
  });
});

describe('caravanas num mundo de 200 anos', () => {
  it('saem, respeitam os limites, levam carga e deixam uso na estrada', () => {
    const { eco } = runWorld(7, 1);
    let most = 0;
    let seen = 0;
    let over = 0;
    let used = 0;
    for (let y = 0; y < 200; y++) {
      for (let t = 0; t < YEAR_SECONDS; t += 0.25) {
        eco.step(0.25);
        // O teto é das caravanas de comércio; colonos, ajuda e visitas (plano novo dos assentamentos) andam por fora dele.
        const moving = eco.caravans.filter((c) => c.kind === 'trade' || c.kind === 'tribute').length + eco.boats.filter((b) => b.purpose === 'trade' && b.sunk < 0).length;
        most = Math.max(most, moving);
        for (const v of eco.villages) if (!v.abandoned && eco.caravansOf(v) > 1 + v.tier + 1 + 1) over++;
      }
      seen += eco.caravans.filter((c) => c.kind === 'trade').length;
      // O uso da estrada decai todo ano: conta o maior número de tiles gastos em qualquer ano, não só o do fim.
      let now = 0;
      for (let i = 0; i < eco.traffic.length; i++) if (eco.traffic[i]) now++;
      used = Math.max(used, now);
    }
    expect(most).toBeLessThanOrEqual(B.CARAVANS_MAX);
    expect(over).toBe(0);
    expect(seen).toBeGreaterThan(0);
    expect(eco.chronicle.some((c) => c.text.includes('Uma caravana de'))).toBe(true);
    expect(used).toBeGreaterThan(0);
  }, 120000);
});
