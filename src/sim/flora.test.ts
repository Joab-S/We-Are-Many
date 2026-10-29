import { describe, expect, it } from 'vitest';
import { Biome } from '../procgen/biomes';
import { browseOf, floraOf, fruitSeason } from './flora';
import { windAt } from './climate';

describe('flora: frutos, ramagem e plantas com nome', () => {
  it('a mata temperada dá fruto no verão e no outono; a tropical, o ano todo', () => {
    expect(fruitSeason(285, 0.1)).toBe(0);
    expect(fruitSeason(285, 0.4)).toBe(1);
    expect(fruitSeason(285, 0.95)).toBe(0);
    for (const phase of [0.05, 0.4, 0.9]) expect(fruitSeason(298, phase)).toBe(1);
    expect(fruitSeason(260, 0.4)).toBe(0);
  });

  it('a ramagem vem da parte lenhosa: campo aberto quase não tem, mata fechada tem muita', () => {
    expect(browseOf(0.2, 290, 0.4)).toBe(0);
    expect(browseOf(0.9, 290, 0.4)).toBeGreaterThan(0.9);
    // Fora da estação sobram folhas e brotos.
    expect(browseOf(0.9, 285, 0.05)).toBeGreaterThan(0.4);
    expect(browseOf(0.9, 285, 0.05)).toBeLessThan(browseOf(0.9, 285, 0.4));
  });

  it('cada tile tem a planta dominante pelo bioma e pela densidade', () => {
    expect(floraOf(Biome.Savanna, 0.6, 300, 0.4)?.name).toBe('Acácias');
    expect(floraOf(Biome.Taiga, 0.7, 270, 0.4)?.name).toBe('Pinheiros');
    expect(floraOf(Biome.Grass, 0.1, 290, 0.4)?.name).toBe('Capim');
    expect(floraOf(Biome.Jungle, 0.8, 300, 0.1)).toEqual({ name: 'Árvores frutíferas', fruiting: true });
    expect(floraOf(Biome.Forest, 0.8, 285, 0.05)?.fruiting).toBe(false);
    expect(floraOf(Biome.Desert, 0.02, 310, 0.4)).toBeNull();
  });

  it('o vento sopra de leste no equador e de oeste nas latitudes médias', () => {
    expect(windAt(256, 512).x).toBeLessThan(0);
    expect(windAt(130, 512).x).toBeGreaterThan(0);
    expect(windAt(10, 512).x).toBeLessThan(0);
  });
});
