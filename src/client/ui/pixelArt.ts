import { bitmapSvg, iconCss, svgUrl } from './pixelIcons';

/**
 * Molduras de pixel art das janelas (estilo pedra escura com chanfros): cada moldura é uma grade pequena de
 * anéis (contorno, brilho, sombra, miolo) usada como `border-image` de nove fatias, o que mantém o canto e a
 * borda nítidos em qualquer tamanho sem imagem de arquivo e sem custo por quadro. `installPixelArt()` escreve
 * as variáveis `--ns-*` e as classes dos ícones numa folha de estilo, uma única vez.
 */

/** Pedra e metal das janelas (as cores das referências). */
export const STONE = {
  black: '#14150f',
  face: '#484e44',
  faceDark: '#3c4035',
  well: '#2e3128',
  trough: '#1a1b15',
  light: '#7a8174',
  light2: '#5d6457',
  shade: '#2a2c24',
  shade2: '#3a3e33',
  red: '#e14e3a',
  redLight: '#ff9a78',
  redDark: '#a8281a',
} as const;

interface Ring {
  /** Cor única do anel (contorno, miolo). */
  all?: string;
  /** Lado de cima e da esquerda (luz). */
  tl?: string;
  /** Lado de baixo e da direita (sombra). */
  br?: string;
}

interface SliceSpec {
  /** Canto em pixels da arte; a grade tem 2k+1 de lado e o miolo de 1 pixel estica. */
  k: number;
  /** Anéis de fora para dentro; os que faltarem até k ficam com `face`. */
  rings: Ring[];
  face: string;
  /** Pixels cortados em cada canto, em degraus (`x + y < notch`). */
  notch?: number;
}

/** Grade de nove fatias: anéis com luz em cima e à esquerda, cantos cortados em degraus e contorno seguindo o corte. */
export function nineSlice(spec: SliceSpec): { rows: string[]; palette: Record<string, string>; size: number } {
  const { k, rings, face, notch = 0 } = spec;
  const n = 2 * k + 1;
  const palette: Record<string, string> = {};
  const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const key = (color: string): string => {
    const found = Object.keys(palette).find((l) => palette[l] === color);
    if (found) return found;
    const l = letters[Object.keys(palette).length];
    palette[l] = color;
    return l;
  };
  const cut = (x: number, y: number): boolean => x + y < notch || n - 1 - x + y < notch || x + n - 1 - y < notch || n - 1 - x + n - 1 - y < notch;
  const rows: string[] = [];
  for (let y = 0; y < n; y++) {
    let row = '';
    for (let x = 0; x < n; x++) {
      if (cut(x, y)) {
        row += '.';
        continue;
      }
      const d = Math.min(x, y, n - 1 - x, n - 1 - y);
      // O contorno acompanha o corte: quem encosta num pixel cortado vira o anel de fora.
      const edge = notch > 0 && (cut(x - 1, y) || cut(x + 1, y) || cut(x, y - 1) || cut(x, y + 1));
      const ring = edge ? rings[0] : rings[d];
      if (!ring) {
        row += key(face);
        continue;
      }
      const top = y === d;
      const left = x === d;
      const bottom = y === n - 1 - d;
      const right = x === n - 1 - d;
      const light = (top || left) && !(bottom || right);
      const dark = (bottom || right) && !(top || left);
      const color = ring.all ?? (light ? ring.tl : dark ? ring.br : (ring.br ?? ring.tl)) ?? face;
      row += key(color);
    }
    rows.push(row);
  }
  return { rows, palette, size: n };
}

/** Molduras do conjunto, por nome (a variável CSS é `--ns-nome`). */
const SLICES: Record<string, SliceSpec> = {
  // Janela: contorno, brilho de pedra, sombra e o filete fundo que separa o miolo.
  frame: {
    k: 7,
    notch: 3,
    face: STONE.face,
    rings: [{ all: STONE.black }, { tl: STONE.light, br: STONE.shade }, { tl: STONE.light2, br: STONE.shade2 }, { all: STONE.face }, { all: STONE.face }, { all: STONE.face }, { tl: '#2f3229', br: '#5b6155' }],
  },
  // Moldura pequena (aba do fechar, balão de prévia).
  frameS: {
    k: 5,
    notch: 2,
    face: STONE.face,
    rings: [{ all: STONE.black }, { tl: STONE.light, br: STONE.shade }, { tl: STONE.light2, br: STONE.shade2 }, { all: STONE.face }, { tl: '#2f3229', br: '#5b6155' }],
  },
  // Miolo da ficha: fundo cinza-esverdeado com a borda de cima e da esquerda escura.
  body: {
    k: 3,
    notch: 1,
    face: STONE.faceDark,
    rings: [{ all: '#1b1c16' }, { tl: '#272a21', br: '#5f665a' }, { all: STONE.faceDark }],
  },
  // Caixa funda (retrato, espaços de ícones, barras).
  well: {
    k: 3,
    notch: 1,
    face: STONE.well,
    rings: [{ all: '#17180f' }, { tl: '#23251d', br: '#51574b' }, { all: STONE.well }],
  },
  // Quadradinho de atributo.
  tile: {
    k: 3,
    notch: 1,
    face: '#363a2f',
    rings: [{ all: '#1d1f18' }, { tl: '#4d5246', br: STONE.shade }, { all: '#363a2f' }],
  },
  // Placa do título: preto por dentro, filete cinza claro por fora.
  plaque: {
    k: 4,
    notch: 2,
    face: '#0b0b08',
    rings: [{ all: STONE.black }, { tl: '#a0a696', br: '#5b6155' }, { all: '#0b0b08' }, { all: '#0b0b08' }],
  },
  tab: {
    k: 3,
    notch: 1,
    face: '#444a3f',
    rings: [{ all: STONE.black }, { tl: '#6a7164', br: '#2f3229' }, { all: '#444a3f' }],
  },
  tabOn: {
    k: 3,
    notch: 1,
    face: STONE.red,
    rings: [{ all: STONE.black }, { tl: STONE.redLight, br: STONE.redDark }, { all: STONE.red }],
  },
  trough: {
    k: 2,
    notch: 1,
    face: STONE.trough,
    rings: [{ all: STONE.black }, { tl: '#0a0a08', br: '#4d5246' }],
  },
};

/** Cada pixel da arte vale tantos pixels de CSS. */
export const SCALE = 2;

/** Meandro grego bem fraco que corre pela moldura (azulejo de 8 x 6). */
const FRET = ['DDDDDD..', 'D....D..', 'D.DD.DDD', 'D.D....D', 'D.DDDD.D', 'D.......'];

let installed = false;

/** Escreve as molduras e os ícones na página (uma vez). */
export function installPixelArt(doc: Document = document): void {
  if (installed || doc.getElementById('px-art')) return;
  installed = true;
  const vars = Object.entries(SLICES)
    .map(([name, spec]) => {
      const s = nineSlice(spec);
      return `--ns-${name}:${svgUrl(bitmapSvg(s.rows, s.palette, s.size, s.size))};`;
    })
    .join('');
  const fret = svgUrl(bitmapSvg(FRET, { D: '#40463b' }, 8, 6));
  const style = doc.createElement('style');
  style.id = 'px-art';
  style.textContent = `:root{${vars}--ns-fret:${fret};}\n${iconCss()}`;
  doc.head.appendChild(style);
}
