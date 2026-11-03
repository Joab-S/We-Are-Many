import { describe, expect, it } from 'vitest';
import { TRAIT_INFO } from '../../ai/traits';
import { ROLE_ICONS } from '../surface/settlementWindow';
import { thoughtIcon } from '../surface/creatureInfo';
import sheetSource from '../surface/hud/CreatureSheet.ts?raw';
import infoSource from '../surface/creatureInfo.ts?raw';
import { nineSlice } from './pixelArt';
import { ICON_NAMES, ICON_SIZE, PALETTE, bitmapSvg, iconRows, pixelIcon, pixelize } from './pixelIcons';

describe('ícones de pixel art', () => {
  it('toda grade cabe em 12 x 12 e só usa letras da paleta', () => {
    for (const name of ICON_NAMES) {
      const rows = iconRows(name);
      expect(rows.length, name).toBe(ICON_SIZE);
      for (const row of rows) {
        expect(row.length, `${name}: ${row}`).toBe(ICON_SIZE);
        for (const c of row) expect(c === '.' || PALETTE[c], `${name}: letra ${c}`).toBeTruthy();
      }
    }
  });

  it('troca emojis por ícones, com ou sem seletor de variação, e deixa as marcas HTML em paz', () => {
    expect(pixelize('⚡ Energia')).toBe(`${pixelIcon('bolt')} Energia`);
    expect(pixelize('❤️')).toBe(pixelIcon('heart'));
    expect(pixelize('<span title="⚡ não troca">🏠 Casa</span>')).toBe(`<span title="⚡ não troca">${pixelIcon('house')} Casa</span>`);
    expect(pixelize('🐙 sem ícone')).toBe('🐙 sem ícone');
  });

  it('nenhum emoji sobra nas fontes da ficha: tudo vira ícone de pixel art', () => {
    const left = (html: string) => [...pixelize(html).replace(/<[^>]*>/g, '')].filter((c) => /\p{Extended_Pictographic}|[▶✓✗›•]/u.test(c));
    // Ofícios, traços de personalidade e pensamentos (as listas que a ficha lê).
    expect(left(Object.values(ROLE_ICONS).join(' '))).toEqual([]);
    expect(left(Object.values(TRAIT_INFO).map((t) => t.icon).join(' '))).toEqual([]);
    const kinds = ['ofício', 'mudança', 'família', 'amizade', 'briga', 'poder', 'saber'] as const;
    expect(left(kinds.map((kind) => thoughtIcon({ kind, year: 0, text: '' })).join(' '))).toEqual([]);
    // Os textos escritos direto nos arquivos da ficha (estados, linha do tempo, rótulos).
    for (const [file, text] of [['CreatureSheet.ts', sheetSource], ['creatureInfo.ts', infoSource]]) {
      const src = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(left(src), file).toEqual([]);
    }
  });

  it('o SVG junta as faixas da mesma cor e ignora o ponto', () => {
    const svg = bitmapSvg(['rr.', '.rr'], { r: '#f00' }, 3, 2);
    expect(svg.match(/<rect/g)).toHaveLength(2);
    expect(svg).toContain("width='2'");
  });
});

describe('molduras de nove fatias', () => {
  const spec = { k: 3, notch: 1, face: '#333', rings: [{ all: '#000' }, { tl: '#aaa', br: '#222' }] };

  it('têm lado 2k+1, cantos cortados e luz em cima e à esquerda', () => {
    const { rows, palette, size } = nineSlice(spec);
    expect(size).toBe(7);
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.length === 7)).toBe(true);
    for (const [x, y] of [[0, 0], [6, 0], [0, 6], [6, 6]]) expect(rows[y][x]).toBe('.');
    expect(palette[rows[1][3]]).toBe('#aaa');
    expect(palette[rows[5][3]]).toBe('#222');
    expect(palette[rows[3][1]]).toBe('#aaa');
    expect(palette[rows[3][5]]).toBe('#222');
  });

  it('o contorno acompanha o corte do canto', () => {
    const { rows, palette } = nineSlice({ ...spec, notch: 2 });
    expect(rows[0][0]).toBe('.');
    expect(rows[0][1]).toBe('.');
    expect(palette[rows[0][2]]).toBe('#000');
    expect(palette[rows[1][1]]).toBe('#000');
  });
});
