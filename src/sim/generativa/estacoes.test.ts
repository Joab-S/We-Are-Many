import { describe, expect, it } from 'vitest';
import { earthParams, seedPlanet } from '../calibrate';
import { pessoasGen } from '../observador/retrato';
import { GEN } from './tipos';

/**
 * A física que pede cooperação e planejamento sem dizer para cooperar nem planejar: as estações no relógio da pessoa
 * (o mato some no inverno onde a estação é forte) e o corpo do bicho (o grande quase não cai de um golpe só, e
 * revida). Nenhum teste aqui espera um resultado com nome; só que a física seja a que diz ser.
 */
const mundo = () => seedPlanet(earthParams(0.25), 11, undefined, { espalhados: 12 }).eco;

describe('estações no relógio da pessoa', () => {
  it('o inverno é forte longe do equador, fraco no trópico, e o sul tem o inverno na metade oposta do ciclo', () => {
    const eco = mundo();
    const w = eco.map.width;
    const h = eco.map.height;
    const norte = Math.floor(h * 0.12) * w + 10;
    const sul = Math.floor(h * 0.88) * w + 10;
    const equador = Math.floor(h / 2) * w + 10;
    eco.year = 0;
    expect(eco.genInverno(norte)).toBeLessThan(0.01);
    expect(eco.genInverno(sul)).toBeGreaterThan(0.5);
    // Meio ciclo depois (o ano do mundo é outro relógio: a estação dura muitos anos dele).
    eco.year = GEN.estacao / 2 / eco.yearSpan;
    expect(GEN.estacao).toBeGreaterThan(10 * eco.yearSpan);
    expect(eco.genInverno(norte)).toBeGreaterThan(0.5);
    expect(eco.genInverno(sul)).toBeLessThan(0.01);
    expect(eco.genInverno(equador)).toBeLessThan(eco.genInverno(norte) * 0.5);
  });

  it('no inverno o mato dá menos e o tile esfria; a comida guardada estraga mais devagar', () => {
    const eco = mundo();
    const w = eco.map.width;
    const h = eco.map.height;
    // Um tile com mato no norte, longe do equador.
    let t = -1;
    for (let y = Math.floor(h * 0.1); y < Math.floor(h * 0.2) && t < 0; y++) for (let x = 0; x < w && t < 0; x++) if (eco.map.vegetation[y * w + x] > 0.5 && eco.genComivel(y * w + x) > 0.3) t = y * w + x;
    expect(t).toBeGreaterThanOrEqual(0);
    eco.year = 0;
    const verao = eco.genComivel(t);
    const quente = eco.genTemperatura(t, 0);
    eco.year = GEN.estacao / 2 / eco.yearSpan;
    expect(eco.genComivel(t)).toBeLessThan(verao * 0.8);
    expect(eco.genTemperatura(t, 0)).toBeLessThan(quente - 5);

    // A mesma comida no mesmo monte, um segundo no verão e um no inverno.
    const perde = (ano: number) => {
      eco.year = ano;
      const c = eco.genMonte(t, 0);
      c.m.comida = 3;
      eco.genFisica(1);
      const sobra = c.m.comida ?? 0;
      c.m = {};
      return 3 - sobra;
    };
    expect(perde(GEN.estacao / 2 / eco.yearSpan)).toBeLessThan(perde(0) * 0.6);
  });
});

describe('o corpo do bicho na caça', () => {
  it('o bicho grande quase não cai de um golpe só; com outros batendo junto, cai', () => {
    const eco = mundo();
    const gente = pessoasGen(eco);
    expect(gente.length).toBeGreaterThanOrEqual(4);
    const caçador = gente[0].i;
    const kind = (sprite: string) => eco.species.findIndex((s) => s.sprite === sprite);
    const bisao = kind('bison');
    const coelho = kind('rabbit');
    expect(bisao).toBeGreaterThanOrEqual(0);
    expect(coelho).toBeGreaterThanOrEqual(0);
    const x = eco.x[caçador];
    const y = eco.y[caçador];
    // Os outros longe, para o primeiro golpe ser de um só.
    for (const { i } of gente.slice(1)) eco.x[i] = (x + 60) % eco.map.width;
    eco.buildGrid();
    const b = eco.spawn(bisao, x + 1, y, -1, 5);
    const c = eco.spawn(coelho, x + 1, y, -1, 1);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(c).toBeGreaterThanOrEqual(0);
    const so = eco.genGolpe(caçador, b, false);
    expect(so.juntos).toBe(0);
    expect(so.chance).toBeLessThan(0.08);
    expect(eco.genGolpe(caçador, c, false).chance).toBeGreaterThan(0.9);

    // Três outros chegam e batem no mesmo bisão.
    for (const { i } of gente.slice(1, 4)) {
      eco.x[i] = x + 1.5;
      eco.y[i] = y + 0.5;
      const m = eco.genMente(i) as unknown as { ato: unknown };
      m.ato = { op: { v: 'bater', a: { id: eco.uid[b] } } };
    }
    eco.buildGrid();
    const juntos = eco.genGolpe(caçador, b, false);
    expect(juntos.juntos).toBe(3);
    expect(juntos.chance).toBeGreaterThan(so.chance * 3);
    // O tamanho se vê.
    expect(eco.genTagsDoBicho(b).grande).toBeGreaterThan(0.5);
    expect(eco.genTagsDoBicho(c).grande).toBeUndefined();
  });
});
