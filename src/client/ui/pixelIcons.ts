/**
 * Ícones de pixel art (12 x 12) das janelas do HUD. Cada ícone é uma grade de letras da paleta abaixo; vira
 * um SVG de retângulos (sem suavização) e uma classe CSS `.pxi-nome`, escrita uma única vez numa folha de
 * estilo. No HTML basta `<i class="pxi pxi-heart"></i>`, e `pixelize()` troca os emojis de um texto pelos
 * ícones equivalentes (o que não tem ícone continua como emoji).
 */

/** Letra → cor. O ponto é transparente. */
export const PALETTE: Record<string, string> = {
  k: '#14150f', // contorno
  w: '#f4f2e8',
  g: '#bcc0b2',
  G: '#80857a',
  d: '#4d5148',
  r: '#e8503c',
  R: '#a3281c',
  o: '#ee9a2a',
  O: '#b8661a',
  y: '#f8da4a',
  Y: '#c8962a',
  n: '#b9774a',
  N: '#6b4126',
  l: '#62c24c',
  L: '#2c7a30',
  b: '#58a0f0',
  B: '#2c5cae',
  c: '#56dcec',
  C: '#2a96a8',
  p: '#c26ad8',
  P: '#7c3e9a',
  s: '#f2cba0',
  S: '#c48f68',
  m: '#ff92ac',
};

/** Lado da grade dos ícones. */
export const ICON_SIZE = 12;

const ART: Record<string, string[]> = {
  heart: ['', '..kkk..kkk..', '.krrrkkrrrk.', 'krrwrrrrrrRk', 'krwrrrrrrrRk', 'krrrrrrrrrRk', '.krrrrrrrRk.', '..krrrrrRk..', '...krrrRk...', '....krRk....', '.....kk.....'],
  bolt: ['', '.......kk...', '......kyyk..', '.....kyyk...', '....kyyk....', '...kyyyyyk..', '..kkkkyyk...', '......kyk...', '.....kyk....', '....kyk.....', '....kk......'],
  hourglass: ['', '.kkkkkkkkkk.', '.kwwwwwwwwk.', '..kyyyyyyk..', '...kyyyyk...', '....kyyk....', '....kyyk....', '...kYyyYk...', '..kYYyyYYk..', '.kYYYYYYYYk.', '.kkkkkkkkkk.'],
  rest: ['', '..kkkkkkk...', '..kbbbbbk...', '..kkkkbbk...', '.....kbk....', '....kbk.....', '...kbk......', '..kbbkkkk...', '..kbbbbbk...', '..kkkkkkk...'],
  chat: ['', '.kkkkkkkkkk.', 'kwwwwwwwwwwk', 'kwkwwkwwkwwk', 'kwwwwwwwwwwk', 'kwwwwwwwwwwk', '.kkkkwwkkkk.', '....kwk.....', '.....k......'],
  candle: ['.....oo.....', '....oyyo....', '....oyyo....', '.....kk.....', '....kwwk....', '....kwwk....', '....kwgk....', '....kwgk....', '...kwwwgk...', '...kkkkkk...'],
  target: ['....kkkk....', '..kkrrrrkk..', '.krrrrrrrrk.', '.krrwwwwrrk.', 'krrwwrrwwrrk', 'krrwrrrrwrrk', 'krrwrrrrwrrk', 'krrwwrrwwrrk', '.krrwwwwrrk.', '.krrrrrrrrk.', '..kkrrrrkk..', '....kkkk....'],
  cake: ['.....oo.....', '.....kk.....', '.kkkkkkkkkk.', '.kwwwwwwwwk.', '.kmmmmmmmmk.', '.kwmwmwmwmk.', '.kmmmmmmmmk.', '.kRRRRRRRRk.', '.kkkkkkkkkk.'],
  person: ['...kkkkkk...', '..kssssssk..', '..kskssksk..', '..kssssssk..', '...kkSSkk...', '..kbbbbbbk..', '.kbbbbbbbbk.', '.kbbbbbbbbk.', '.kbbkkkkbbk.', '..kbk..kbk..', '..kkk..kkk..'],
  elder: ['...kkkkkk...', '..kwwwwwwk..', '..kskssksk..', '..kssssssk..', '...kkwwkk...', '..knnnnnnk..', '.knnnnnnnnk.', '.knnnnnnnnk.', '.knnkkkknnk.', '..knk..knk..', '..kkk..kkk..'],
  child: ['', '', '', '....kkkk....', '...kssssk...', '...kskksk...', '...kssssk...', '....kkkk....', '...kllllk...', '...kllllk...', '...kk..kk...'],
  group: ['....kkkk....', '...kssssk...', '...kssssk...', '.kk.kkkk.kk.', 'ksskkbbkkssk', 'ksskbbbbkssk', '.kkkbbbbkkk.', '..kkbbbbkk..', '...kbkkbk...', '...kkk.kkk..'],
  smile: ['..kkkkkkkk..', '.kyyyyyyyyk.', 'kyyyyyyyyyyk', 'kyykyyyykyyk', 'kyykyyyykyyk', 'kyyyyyyyyyyk', 'kykyyyyyykyk', 'kyykkkkkkyyk', '.kyyyyyyyyk.', '..kkkkkkkk..'],
  angry: ['..kkkkkkkk..', '.krrrrrrrrk.', 'krkkrrrrkkrk', 'krrkwrrwkrrk', 'krrrrrrrrrrk', 'krrrkkkkrrrk', 'krrkrrrrkrrk', '.krrrrrrrrk.', '..kkkkkkkk..'],
  dna: ['..bb....rr..', '...bb..rr...', '....bbrr....', '....kwwk....', '....rrbb....', '...rr..bb...', '..rr....bb..', '...rr..bb...', '....rrbb....', '....kwwk....', '....bbrr....', '...bb..rr...'],
  paw: ['', '.kk......kk.', 'knnk....knnk', '.kk..kk..kk.', '....knnk....', '...kknnkk...', '..knnnnnnk..', '..knnnnnnk..', '..knnkknnk..', '...kk..kk...'],
  warn: ['.....kk.....', '....kyyk....', '...kyyyyk...', '..kyykkyyk..', '.kyyykkyyyk.', '.kyyyyyyyyk.', 'kyyyykkyyyyk', 'kyyyykkyyyyk', 'kkkkkkkkkkkk'],
  bug: ['...k....k...', '..kLk..kLk..', '..kLLLLLLk..', '.kLllllllLk.', 'kLlkllllklLk', '.kLllllllLk.', '..kLLLLLLk..', '..kLk..kLk..', '...k....k...'],
  scroll: ['.kkkkkkkkkk.', 'kYyyyyyyyyYk', '.kkkkkkkkkk.', '..kwwwwwwk..', '..kwGGGGwk..', '..kwwwwwwk..', '..kwGGGGwk..', '..kwwwwwwk..', '.kkkkkkkkkk.', 'kYyyyyyyyyYk', '.kkkkkkkkkk.'],
  house: ['', '.....kk.....', '....kRRk....', '...kRRRRk...', '..kRRRRRRk..', '.kRRRRRRRRk.', 'kkkkkkkkkkkk', '.kyyyyyyyyk.', '.kyyyNNyyyk.', '.kyyyNNyyyk.', '.kkkkkkkkkk.'],
  tent: ['', '.....kk.....', '....koOk....', '...kooOOk...', '..kooooOOk..', '.kooookkOOk.', 'kooookNNkOOk', 'kooookNNkOOk', 'kkkkkkkkkkkk'],
  hammer: ['', '..kkkkkkkk..', '.kggggggGGk.', '.kwggggGGGk.', '..kkkkkkkk..', '....kNNk....', '....kNnk....', '....kNnk....', '....kNnk....', '....kNnk....', '....kkkk....'],
  star: ['.....kk.....', '....kyyk....', '....kyyk....', 'kkkkkyykkkkk', 'kyyyyyyyyyyk', '.kyyyyyyyyk.', '..kyyyyyyk..', '..kyyyyyyk..', '.kyyykkyyyk.', '.kyyk..kyyk.', '..kk....kk..'],
  bag: ['', '....kkkk....', '...knnnnk...', '..knnnnnnk..', '.knnnnnnnnk.', '.knNNNNNNnk.', '.knNnnnnNnk.', '.knNNNNNNnk.', '.knnnnnnnnk.', '.kkkkkkkkkk.'],
  meat: ['', '....kkkk....', '..kkRRRRkk..', '.kRRrrrrRRk.', '.kRrrrrrrRk.', '.kRRrrrrRRk.', '..kkRRRRkk..', '....kwwk....', '...kwwwwk...', '...kk..kk...'],
  leaf: ['........kkk.', '......kkllk.', '....kkllllk.', '...kllllLLk.', '..kllllLLk..', '..kllllLk...', '.kllLLLk....', '.kLLLkk.....', 'kNkkk.......', 'kk..........'],
  pin: ['...kkkkkk...', '..krrrrrrk..', '..krwrrrrk..', '..krrrrrRk..', '...kRRRRk...', '....kkkk....', '.....kGk....', '.....kGk....', '.....kGk....', '.....k......'],
  compass: ['...kkkkkk...', '..kggggggk..', '.kgwwrrwwgk.', '.kgwwrrwwgk.', 'kgwwwrrwwwgk', 'kgwwwbbwwwgk', '.kgwwbbwwgk.', '.kgwwwwwwgk.', '..kggggggk..', '...kkkkkk...'],
  skull: ['..kkkkkkkk..', '.kwwwwwwwwk.', 'kwwwwwwwwwwk', 'kwwkkwwkkwwk', 'kwwkkwwkkwwk', 'kwwwwkkwwwwk', '.kwwwwwwwwk.', '..kwkwkwwk..', '..kkkkkkkk..'],
  coin: ['', '..kkkkkkkk..', '.kyyyyyyyyk.', 'kyyYYYYYYyyk', 'kyYyyyyyyYyk', 'kyYyyYYyyYyk', 'kyYyyYYyyYyk', 'kyYyyyyyyYyk', 'kyyYYYYYYyyk', '.kyyyyyyyyk.', '..kkkkkkkk..'],
  sparkle: ['.....kk.....', '....kyyk....', '....kyyk....', 'kkkkkyykkkkk', 'kyyyyyyyyyyk', 'kyyywwwyyyyk', 'kkkkkyykkkkk', '....kyyk....', '....kyyk....', '.....kk.....'],
  sword: ['.........kkk', '........kwwk', '.......kwwk.', '......kwwk..', '.....kwwk...', '....kwwk....', '..kkkwwk....', '..kYYYYk....', '.kNkkkk.....', 'kNk.........', 'kk..........'],
  shield: ['kkkkkkkkkkkk', 'kbbbbbBBBBBk', 'kbwwbbBBBBBk', 'kbwbbbBBBBBk', 'kbbbbbBBBBBk', '.kbbbbBBBBk.', '..kbbbBBBk..', '...kbbBBk...', '....kbBk....', '.....kk.....'],
  crown: ['', 'k....kk....k', 'kk..kyyk..kk', 'kyk.kyyk.kyk', 'kyykkyykkyyk', 'kyyyyyyyyyyk', 'kyyyyyyyyyyk', 'kYYYYYYYYYYk', 'kkkkkkkkkkkk'],
  x: ['rrr......rrr', 'rrrr....rrrr', '.rrrr..rrrr.', '..rrrrrrrr..', '...rrrrrr...', '....rrrr....', '....rrrr....', '...rrrrrr...', '..rrrrrrrr..', '.rrrr..rrrr.', 'rrrr....rrrr', 'rrr......rrr'],
  magnifier: ['...kkkk.....', '..kwwwwk....', '.kwccccwk...', '.kwccccwk...', '.kwccccwk...', '..kwwwwk....', '...kkkkkNk..', '........kNk.', '.........kNk', '..........kk'],
  eye: ['', '', '...kkkkkk...', '.kkwwwwwwkk.', 'kwwwbbbbwwwk', 'kwwbbkkbbwwk', 'kwwwbbbbwwwk', '.kkwwwwwwkk.', '...kkkkkk...'],
};

/** Troca de cor de um ícone (letra → letra), para variações como o coração rosa. */
function recolor(rows: string[], map: Record<string, string>): string[] {
  return rows.map((r) => [...r].map((c) => map[c] ?? c).join(''));
}
ART.heartPink = recolor(ART.heart, { r: 'm', R: 'p' });

/** Borda de uma cor em volta do que está preenchido (para ícones feitos só de miolo, como o X). */
function outlined(rows: string[], fill: string, edge: string, shine: string): string[] {
  const at = (x: number, y: number) => rows[y]?.[x] === fill;
  return rows.map((row, y) =>
    [...row].map((c, x) => (c !== fill ? c : !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1) ? ((!at(x + 1, y) || !at(x, y + 1)) ? edge : shine) : fill)).join(''),
  );
}
ART.x = outlined(ART.x, 'r', 'R', 'm');

/** Emoji → ícone. O que não está aqui continua como emoji. */
const EMOJI: Record<string, string> = {
  '🤝': 'smile', '😠': 'angry', '💞': 'heartPink', '🐾': 'paw', '🐎': 'paw', '🐑': 'paw', '🦁': 'paw', '⚠': 'warn',
  '🍖': 'meat', '🍽': 'meat', '🍞': 'meat', '🦠': 'bug', '📜': 'scroll', '🕯': 'candle', '🙏': 'candle',
  '🏠': 'house', '🏚': 'house', '🏛': 'house', '🏗': 'house', '⛏': 'hammer', '🛠': 'hammer', '🔨': 'hammer',
  '⚒': 'hammer', '🪓': 'hammer', '🎣': 'hammer', '👴': 'elder', '🧒': 'child', '👶': 'child', '🍼': 'child',
  '🧑': 'person', '👤': 'person', '⚡': 'bolt', '❤': 'heart', '📍': 'pin', '📌': 'pin', '💤': 'rest',
  '💬': 'chat', '🗣': 'chat', '👪': 'group', '👥': 'group', '🏷': 'group', '⛺': 'tent', '🧬': 'dna', '⭐': 'star',
  '🧺': 'bag', '🎒': 'bag', '🧳': 'bag', '⏳': 'hourglass', '🛡': 'shield', '🧭': 'compass', '☠': 'skull',
  '🎂': 'cake', '🎯': 'target', '🌱': 'leaf', '🌾': 'leaf', '💰': 'coin', '✨': 'sparkle', '💡': 'sparkle',
  '🏹': 'sword', '⚔': 'sword', '💪': 'sword', '👑': 'crown', '♛': 'crown',
};
const EMOJI_RE = new RegExp(`(<[^>]*>)|(${Object.keys(EMOJI).join('|')})\\uFE0F?`, 'gu');

/** Nomes dos ícones que existem. */
export const ICON_NAMES = Object.keys(ART);

/** Ícone em HTML. */
export function pixelIcon(name: string, title = ''): string {
  return `<i class="pxi pxi-${name}"${title ? ` title="${title}"` : ''}></i>`;
}

/** Troca os emojis do texto (fora das marcas HTML) pelos ícones de pixel art. */
export function pixelize(html: string): string {
  return html.replace(EMOJI_RE, (_m, tag: string | undefined, emoji: string) => (tag ? tag : pixelIcon(EMOJI[emoji])));
}

/** Uma grade de letras como SVG sem suavização (faixas horizontais da mesma cor viram um retângulo só). */
export function bitmapSvg(rows: readonly string[], palette: Record<string, string>, w: number, h: number): string {
  let rects = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < w; ) {
      const c = row[x];
      let run = 1;
      while (x + run < w && row[x + run] === c) run++;
      if (c && c !== '.' && palette[c]) rects += `<rect x='${x}' y='${y}' width='${run}' height='1' fill='${palette[c]}'/>`;
      x += run;
    }
  });
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}' shape-rendering='crispEdges'>${rects}</svg>`;
}

/** `url("data:...")` de um SVG, pronto para o CSS. */
export function svgUrl(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Grade do ícone com as linhas completadas até 12 x 12. */
export function iconRows(name: string): string[] {
  const rows = ART[name].map((r) => r.padEnd(ICON_SIZE, '.'));
  while (rows.length < ICON_SIZE) rows.push('.'.repeat(ICON_SIZE));
  return rows;
}

/** CSS das classes `.pxi-nome` (uma regra por ícone, escrita uma vez). */
export function iconCss(): string {
  return ICON_NAMES.map((n) => `.pxi-${n}{background-image:${svgUrl(bitmapSvg(iconRows(n), PALETTE, ICON_SIZE, ICON_SIZE))}}`).join('\n');
}
