import { bitmapSvg, iconCss, svgUrl } from './pixelIcons';

/**
 * Molduras de pixel art das janelas (estilo pedra escura com chanfros): cada moldura é uma grade pequena de
 * anéis (contorno, brilho, sombra, miolo) usada como `border-image` de nove fatias, o que mantém o canto e a
 * borda nítidos em qualquer tamanho sem imagem de arquivo e sem custo por quadro. `installPixelArt()` escreve
 * as variáveis `--ns-*` e as classes dos ícones numa folha de estilo, uma única vez.
 */

/** Metal escuro, bronze e pergaminho: as mesmas cores do HUD geral (hud.css), em pixel art. */
export const INLAY = {
  ink: '#0d0f12',
  metal: '#2a303a',
  metalDark: '#1b2027',
  bronzeLight: '#d3b06a',
  bronze: '#b08a4a',
  bronzeMid: '#8a6a3a',
  bronzeDark: '#5a431f',
  brown: '#3a2c14',
  paper: '#e9dcbc',
  paperLight: '#f6edd3',
  paperMid: '#e3d3a9',
  paperDark: '#d9c79c',
  paperEdge: '#bfa971',
  gold: '#e0c27a',
  red: '#c8442f',
  redLight: '#ff9a78',
  redDark: '#8e2418',
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

/** Molduras do conjunto, por nome (a variável CSS é `--ns-nome`). Os cortes de canto (`notch`) variam de uma para outra: janela, caixa, medalha, pílula. */
const SLICES: Record<string, SliceSpec> = {
  // Janela: contorno, três anéis de bronze, o metal escuro com meandro e o filete fundo do miolo.
  frame: {
    k: 7,
    notch: 4,
    face: INLAY.metal,
    rings: [{ all: INLAY.ink }, { tl: INLAY.bronzeLight, br: INLAY.bronzeDark }, { tl: INLAY.bronze, br: INLAY.brown }, { all: INLAY.metal }, { all: INLAY.metal }, { all: INLAY.metal }, { tl: INLAY.metalDark, br: INLAY.bronzeMid }],
  },
  // Moldura pequena (balão de prévia).
  frameS: {
    k: 5,
    notch: 3,
    face: INLAY.metal,
    rings: [{ all: INLAY.ink }, { tl: INLAY.bronzeLight, br: INLAY.bronzeDark }, { tl: INLAY.bronze, br: INLAY.brown }, { all: INLAY.metal }, { tl: INLAY.metalDark, br: INLAY.bronzeMid }],
  },
  // Miolo da ficha: pergaminho afundado na moldura (sombra em cima e à esquerda).
  body: {
    k: 4,
    notch: 3,
    face: INLAY.paper,
    rings: [{ all: INLAY.brown }, { tl: INLAY.bronzeMid, br: INLAY.paperLight }, { all: INLAY.paperDark }, { all: INLAY.paper }],
  },
  // Caixa funda escura (retrato, espaços de ícones).
  well: {
    k: 4,
    notch: 3,
    face: INLAY.metalDark,
    rings: [{ all: INLAY.ink }, { tl: INLAY.metal, br: INLAY.bronzeMid }, { all: INLAY.metalDark }, { all: INLAY.metalDark }],
  },
  // Retrato: octógono de cantos bem cortados.
  portrait: {
    k: 5,
    notch: 5,
    face: INLAY.ink,
    rings: [{ all: INLAY.ink }, { tl: INLAY.bronzeLight, br: INLAY.bronzeDark }, { tl: INLAY.bronze, br: INLAY.brown }, { all: INLAY.ink }, { all: INLAY.ink }],
  },
  // Medalha de atributo e cartão: papel claro de cantos em degrau.
  tile: {
    k: 4,
    notch: 3,
    face: INLAY.paperMid,
    rings: [{ all: INLAY.bronzeDark }, { tl: INLAY.paperLight, br: INLAY.paperEdge }, { all: INLAY.paperMid }, { all: INLAY.paperMid }],
  },
  // Pílula: etiquetas e estados (cantos quase redondos).
  pill: {
    k: 4,
    notch: 4,
    face: INLAY.paperLight,
    rings: [{ all: INLAY.bronzeMid }, { tl: '#ffffff', br: INLAY.paperEdge }, { all: INLAY.paperLight }, { all: INLAY.paperLight }],
  },
  // Cartão em destaque (a escolha tomada): ouro por fora.
  gold: {
    k: 4,
    notch: 3,
    face: '#f3e3ae',
    rings: [{ all: INLAY.brown }, { tl: INLAY.gold, br: INLAY.bronze }, { all: '#f3e3ae' }, { all: '#f3e3ae' }],
  },
  // Placa do título: escura, com filete dourado, de cantos cortados fundo.
  plaque: {
    k: 5,
    notch: 4,
    face: INLAY.ink,
    rings: [{ all: INLAY.ink }, { tl: INLAY.gold, br: INLAY.bronzeMid }, { all: INLAY.ink }, { all: INLAY.ink }, { all: INLAY.ink }],
  },
  // Abas: metal com filete de bronze; a escolhida é de ouro.
  tab: {
    k: 3,
    notch: 2,
    face: INLAY.metal,
    rings: [{ all: INLAY.ink }, { tl: INLAY.bronzeMid, br: INLAY.metalDark }, { all: INLAY.metal }],
  },
  tabOn: {
    k: 3,
    notch: 2,
    face: INLAY.bronze,
    rings: [{ all: INLAY.ink }, { tl: '#f6e3a8', br: INLAY.bronzeMid }, { all: INLAY.bronze }],
  },
  // Aba de fechar: cera vermelha.
  closeTab: {
    k: 4,
    notch: 4,
    face: INLAY.red,
    rings: [{ all: INLAY.ink }, { tl: INLAY.redLight, br: INLAY.redDark }, { all: INLAY.red }, { all: INLAY.red }],
  },
  // Botão de seguir: bronze de cantos cortados.
  button: {
    k: 3,
    notch: 3,
    face: INLAY.bronze,
    rings: [{ all: INLAY.ink }, { tl: '#f6e3a8', br: INLAY.bronzeMid }, { all: INLAY.bronze }],
  },
  // Calha das barras: marrom escuro, cápsula.
  trough: {
    k: 3,
    notch: 3,
    face: '#2a2218',
    rings: [{ all: INLAY.ink }, { tl: '#120e08', br: INLAY.bronzeMid }, { all: '#2a2218' }],
  },
};

/** Cada pixel da arte vale tantos pixels de CSS. */
export const SCALE = 2;

/** Meandro grego bem fraco que corre pela moldura (azulejo de 8 x 6). */
const FRET = ['DDDDDD..', 'D....D..', 'D.DD.DDD', 'D.D....D', 'D.DDDD.D', 'D.......'];

/** Fibras do papel: pontos claros e escuros espalhados num azulejo de 16 x 12 (parece papiro, sem repetir de forma óbvia). */
const FIBER = ['.......D........', '..L.........D...', '.....DD.....L...', '................', '......L...D.....', '..D.........L...', '.........DD.....', 'L...D...........', '.....L.....D....', '..D.......L.....', '.......D....L...', '.D..............'];

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
  const fiber = svgUrl(bitmapSvg(FIBER, { D: '#dccda3', L: '#f1e6c8' }, 16, 12));
  const style = doc.createElement('style');
  style.id = 'px-art';
  style.textContent = `:root{${vars}--ns-fret:${fret};--ns-fiber:${fiber};}\n${iconCss()}`;
  doc.head.appendChild(style);
}
