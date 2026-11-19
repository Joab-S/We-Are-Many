import { describe, expect, it } from 'vitest';
import { Biome } from '../../procgen/biomes';
import { Decor, type SurfaceMap } from '../../procgen/surface';
import { NatureCache, natureAt, NATURE_ART, NATURE_PALETTES, NATURE_SPRITES, TALL } from './natureArt';
import { SPRITES } from './art';

/** Mapa mínimo de 1 tile, só com o que `natureAt` lê. */
function tile(biome: Biome, veg = 0.8): SurfaceMap {
  return { width: 1, height: 1, biome: Uint8Array.of(biome), vegetation: Float32Array.of(veg), elevation: Float32Array.of(0.2) } as unknown as SurfaceMap;
}

describe('natureza no padrão novo', () => {
  it('todo desenho tem linhas de largura igual, só cores da paleta e está registrado no atlas', () => {
    for (const [name, rows] of Object.entries(NATURE_SPRITES)) {
      expect(SPRITES[name], name).toBe(rows);
      for (const row of rows) {
        expect(row.length, name).toBe(rows[0].length);
        for (const ch of row) if (ch !== '.') expect(NATURE_PALETTES[name][ch], `${name}: ${ch}`).toBeDefined();
      }
    }
  });

  it('as árvores passam da altura da pessoa e têm a versão meio transparente', () => {
    for (const name of ['oak', 'birch', 'jungle', 'pine', 'palm', 'acacia']) {
      expect(NATURE_ART[name].rows.length, name).toBeGreaterThan(18);
      expect(TALL.has(`nat:${name}`)).toBe(true);
      expect(NATURE_SPRITES[`nat:${name}:g`]).toBeDefined();
    }
    expect(TALL.has('nat:bush')).toBe(false);
  });

  it('cada enfeite do mapa vira um desenho que existe, e a estação muda árvores e pinheiros', () => {
    for (let season = 0; season < 4; season++) {
      for (const kind of [Decor.Tree, Decor.JungleTree, Decor.Pine, Decor.Acacia, Decor.Cactus, Decor.Boulder, Decor.Stump, Decor.Sapling]) {
        const name = natureAt(tile(Biome.Forest), 0, kind, season);
        expect(NATURE_SPRITES[name], `${kind}/${season}`).toBeDefined();
      }
    }
    expect(natureAt(tile(Biome.Taiga), 0, Decor.Pine, 3)).toMatch(/snowpine|pine2/);
    expect(natureAt(tile(Biome.Grass), 0, 8, 0)).toBe('');
  });

  it('o cache dá o mesmo que natureAt e refaz quando o enfeite muda', () => {
    const map = tile(Biome.Forest);
    const cache = new NatureCache(map);
    expect(cache.at(0, Decor.Tree, 1)).toBe(natureAt(map, 0, Decor.Tree, 1));
    expect(cache.at(0, Decor.Stump, 1)).toBe('nat:stump');
  });
});
