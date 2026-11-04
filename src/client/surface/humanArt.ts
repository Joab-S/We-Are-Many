/**
 * Humanos em pixel art de 16x18, montados em camadas de texto: corpo, roupa,
 * cabelo ou chapéu e ferramenta. Cada profissão tem versão de homem e de
 * mulher e os quadros das animações (parado, andando, trabalhando, dano e
 * morte), que saem do sprite base deslocando tronco, pés e ferramenta.
 *
 * As cores de cada pessoa ficam para o renderizador: a pele (`S`, `s`) e o
 * cabelo (`H`, `h`) são cores marcadoras trocadas pela cor da instância, e a
 * faixa da cintura (`L`) e a farda de soldados e guardas levam a cor do reino.
 */

const W = 16;
const H = 18;
/** Largura do quadro deitado (o corpo deitado é mais largo que alto). */
const LYING_W = 20;

type Grid = string[];

function O(rows: Record<number, string>): Grid {
  const g: Grid = Array.from({ length: H }, () => '.'.repeat(W));
  for (const [r, s] of Object.entries(rows)) g[Number(r)] = s;
  return g;
}

function shift(g: Grid, dy: number): Grid {
  const out: Grid = Array.from({ length: H }, () => '.'.repeat(W));
  g.forEach((row, y) => {
    if (y + dy >= 0 && y + dy < H) out[y + dy] = row;
  });
  return out;
}

const BODY = O({ 3: '......SSSS......', 4: '.....SSSSSS.....', 5: '.....SSSSSS.....', 6: '.....SESSES.....', 7: '.....SSSSSs.....', 8: '......SSSs......', 9: '.....SSSSSS.....', 10: '....SSSSSSSS....', 11: '....SSSSSSSS....', 12: '....SSSSSSSs....', 13: '....S.SSSS.s....', 14: '......S..s......', 15: '......S..s......', 16: '......D..D......' });
const CHILD = O({ 7: '......SSSS......', 8: '.....SSSSSS.....', 9: '.....SESSES.....', 10: '.....SSSSSs.....', 11: '......SSSs......', 12: '.....SSSSSS.....', 13: '....SSSSSSSs....', 14: '....S.SSSS.s....', 15: '......S..s......', 16: '......D..D......' });
const APRON = O({ 10: '......BBBb......', 11: '......BBBb......', 12: '......BBBb......', 13: '......BBBb......', 14: '......b..b......' });
const AXE = O({ 7: '............w...', 8: '............wMM.', 9: '............wMm.', 10: '............wm..', 11: '............w...', 12: '............w...', 13: '............w...', 14: '............w...' });
const BALD = O({ 4: '....h......h....', 5: '....h......h....' });
const BAND = O({ 0: '........R.......', 1: '........R.......', 2: '......HHRH......', 3: '.....HHHHHHh....', 4: '....GGGGGGGg....', 5: '....H......h....', 6: '....H......h....', 7: '....H......h....', 8: '....h......h....' });
const BANDANA = O({ 2: '......RRRr......', 3: '.....RRRRRr.....', 4: '....rRRRRRrr....', 5: '....H......h....' });
const BASKET = O({ 12: '..........RQR...', 13: '..........WWWw..', 14: '..........WwWw..', 15: '..........wwww..' });
const BEARD = O({ 7: '.....H....h.....', 8: '......HHHh......' });
const BERET = O({ 2: '......RRRr......', 3: '....RRRRRRRr....', 4: '....HHHHHHHh....', 5: '....H......h....' });
const BOW = O({ 6: '............w...', 7: '............vw..', 8: '............v.w.', 9: '............v.w.', 10: '............v.w.', 11: '............v.w.', 12: '............v.w.', 13: '............v.w.', 14: '............v.w.', 15: '............vw..', 16: '............w...' });
const BREAD = O({ 12: '...........NNn..', 13: '..........NNNnn.', 14: '...........nn...' });
const BRUSH = O({ 12: '...........W....', 13: '...........ww...', 14: '...........xxx..' });
const BUCKET = O({ 2: '......TTTt......', 3: '.....TTTTTt.....', 4: '....tttttttt....', 5: '....H......h....' });
const BUN = O({ 1: '.......HH.......', 2: '......HHHh......', 3: '.....HHHHHHh....', 4: '....HHHHHHHh....', 5: '....H......h....' });
const CANE = O({ 10: '...........ww...', 11: '............w...', 12: '............w...', 13: '............w...', 14: '............w...', 15: '............w...', 16: '............w...' });
const CAP = O({ 2: '......XXXx......', 3: '.....XXXXXx.....', 4: '....xXXXXXxx....', 5: '....H......h....' });
const CAPE = O({ 9: '....BBAAAAbb....', 10: '...BB......bb...', 11: '...B........b...', 12: '...B........b...', 13: '...B........b...', 14: '...bb......bb...' });
const CAPKNIT = O({ 2: '......AAAa......', 3: '.....AAAAAa.....', 4: '....aAAAAAaa....', 5: '....H......h....' });
const CHILDLONG = O({ 6: '......HHHH......', 7: '.....HHHHHHh....', 8: '....HHHHHHHh....', 9: '....H......h....', 10: '....H......h....', 11: '....h......h....' });
const CHILD_TUNIC = O({ 12: '.....AAAAAa.....', 13: '....aAAAAAaa....', 14: '......PPPp......', 15: '......P..p......' });
const COLLAR = O({ 9: '.....BBBBBb.....' });
const CROOK = O({ 1: '.............w..', 2: '............w.w.', 3: '..............w.', 4: '............w...', 5: '............w...', 6: '............w...', 7: '............w...', 8: '............w...', 9: '............w...', 10: '............w...', 11: '............w...', 12: '............w...', 13: '............w...', 14: '............w...', 15: '............w...', 16: '............w...' });
const CROWN = O({ 1: '.....G.GG.G.....', 2: '.....GGRGGg.....', 3: '.....HHHHHHh....', 4: '....HHHHHHHh....', 5: '....H......h....' });
const FISH = O({ 12: '..F.............', 13: '.FFf............', 14: '..f.............' });
const FORK = O({ 1: '...........MMM..', 2: '...........MMm..', 3: '............w...', 4: '............w...', 5: '............w...', 6: '............w...', 7: '............w...', 8: '............w...', 9: '............w...', 10: '............w...', 11: '............w...', 12: '............w...', 13: '............w...', 14: '............w...', 15: '............w...', 16: '............w...' });
const FRINGE = O({ 5: '......HHHh......' });
const FUR = O({ 9: '....XXXXXXXX....', 10: '....XKXXXKXx....', 13: '.....XKXXKx.....', 14: '.....AAAAAa.....', 15: '.....XXXXXx.....' });
const HALBERD = O({ 0: '............M...', 1: '............M...', 2: '............wMM.', 3: '............wMm.', 4: '............wm..', 5: '............w...', 6: '............w...', 7: '............w...', 8: '............w...', 9: '............w...', 10: '............w...', 11: '............w...', 12: '............w...', 13: '............w...', 14: '............w...', 15: '............w...', 16: '............w...' });
const HAMMER = O({ 9: '...........mMM..', 10: '............wm..', 11: '............w...', 12: '............w...', 13: '............w...', 14: '............w...' });
const HELM = O({ 2: '......MMMm......', 3: '.....MMMMMm.....', 4: '....MMMMMMmm....', 5: '....m..M...m....' });
const HERBS = O({ 9: '...........JjJ..', 10: '............Jj..', 11: '............Jw..', 12: '............w...' });
const HIDE = O({ 10: '.UUu............', 11: 'UUUUu...........', 12: '.UUUu...........', 13: 'UUuuu...........', 14: '.u..u...........' });
const HOOD = O({ 2: '......AAAa......', 3: '.....AAAAAa.....', 4: '....AAAAAAaa....', 5: '....AA....aa....', 6: '....A......a....', 7: '....A......a....', 8: '....AA....aa....' });
const LEATHER = O({ 2: '......ZZZz......', 3: '.....ZZZZZz.....', 4: '....zZZZZZzz....', 5: '....H......h....' });
const LONG = O({ 2: '......HHHH......', 3: '.....HHHHHHh....', 4: '....HHHHHHHh....', 5: '....HH.....h....', 6: '....H......h....', 7: '....H......h....', 8: '....HH....hh....', 9: '....h......h....' });
const LOOSE = O({ 9: '.....AAAAAa.....', 10: '....AAAAAAaa....', 11: '....AAAAAAaa....', 12: '....aLLLLLLa....', 13: '......PPPp......', 14: '......P..p......', 15: '......P..p......' });
const MAIL = O({ 9: '.....MMMMMm.....', 10: '....MBBBBBbm....', 11: '....MBBBBBbm....', 12: '....mLLGLLLm....', 13: '......BBBb......' });
const MINER = O({ 2: '......YYYy......', 3: '.....YGYYYy.....', 4: '....yYYYYYyy....', 5: '....H......h....' });
const OAR = O({ 1: '............WW..', 2: '............Ww..', 3: '............Ww..', 4: '............w...', 5: '............w...', 6: '............w...', 7: '............w...', 8: '............w...', 9: '............w...', 10: '............w...', 11: '............w...', 12: '............w...', 13: '............w...', 14: '............w...', 15: '............w...', 16: '............w...' });
const PACK_UNDER = O({ 7: '....xXXXXXXx....', 8: '...WWWWWWWWWw...', 9: '...W........w...', 10: '...W........w...', 11: '...W........w...', 12: '...w........w...', 13: '...wwwwwwwwww...' });
const PICK = O({ 8: '...........MMM..', 9: '..........m.w.m.', 10: '............w...', 11: '............w...', 12: '............w...', 13: '............w...', 14: '............w...' });
const PLAID = O({ 10: '....aAaAaAaa....', 11: '....AaAaAaAa....' });
const POT = O({ 11: '..........OOo...', 12: '.........OOOOo..', 13: '.........OOOoo..', 14: '..........ooo...' });
const POUCH = O({ 13: '..WG............', 14: '.WWWw...........', 15: '..ww............' });
const QUILL = O({ 10: '..X.............', 11: '..x.............', 12: '..w.............' });
const QUIVER = O({ 7: '....R...........', 8: '...Rw...........', 9: '...w............' });
const ROBE = O({ 9: '.....AAAAAa.....', 10: '....AAAAAAaa....', 11: '....AAAAAAaa....', 12: '....aLLLLLLa....', 13: '.....AAAAAa.....', 14: '.....AAAAAa.....', 15: '.....AAAAaa.....' });
const ROD = O({ 3: '...............w', 4: '..............w.', 5: '..............wx', 6: '.............w.x', 7: '.............w.x', 8: '............w..x', 9: '............w..x', 10: '............w..x', 11: '............w..F', 12: '............w..f' });
const ROPE = O({ 11: '..Yy............', 12: '.Y..y...........', 13: '.Y..y...........', 14: '..yy............' });
const SACK = O({ 6: '..XXx...........', 7: '.XXXXx..........', 8: '.XXXXx..........', 9: '..xxx...........' });
const SATCHEL = O({ 9: '.....L..........', 10: '......L.........', 11: '.......L........', 12: '........L.......', 13: '........WWw.....', 14: '........Www.....' });
const SCARF = O({ 2: '......BBBb......', 3: '.....BBBBBb.....', 4: '....BBBBBBbb....', 5: '....b......b....' });
const SCEPTER = O({ 2: '............R...', 3: '...........GgG..', 4: '............G...', 5: '............G...', 6: '............G...', 7: '............G...', 8: '............G...', 9: '............G...', 10: '............G...', 11: '............G...', 12: '............G...', 13: '............G...' });
const SCRAPER = O({ 12: '............M...', 13: '............w...' });
const SCROLL = O({ 9: '............Xx..', 10: '............Xx..', 11: '............Xx..', 12: '............xx..' });
const SHIELD = O({ 9: '..Rr............', 10: '.RRRr...........', 11: '.RGRr...........', 12: '.RRRr...........', 13: '..rr............' });
const SHORT = O({ 2: '......HHHH......', 3: '.....HHHHHHh....', 4: '....HHHHHHHh....', 5: '....H......h....' });
const SMITH = O({ 8: '............mm..', 9: '...........MMMm.', 10: '............w...', 11: '............w...', 12: '............w...', 13: '............w...', 14: '............w...' });
const SPEAR = O({ 0: '............M...', 1: '...........MMm..', 2: '............m...', 3: '............w...', 4: '............w...', 5: '............w...', 6: '............w...', 7: '............w...', 8: '............w...', 9: '............w...', 10: '............w...', 11: '............w...', 12: '............w...', 13: '............w...', 14: '............w...', 15: '............w...', 16: '............w...' });
const STAFF = O({ 0: '............G...', 1: '............G...', 2: '...........GgG..', 3: '............w...', 4: '............w...', 5: '............w...', 6: '............w...', 7: '............w...', 8: '............w...', 9: '............w...', 10: '............w...', 11: '............w...', 12: '............w...', 13: '............w...', 14: '............w...', 15: '............w...', 16: '............w...' });
const STICK = O({ 4: '............W...', 5: '............w...', 6: '............w...', 7: '............w...', 8: '............w...', 9: '............w...', 10: '............w...', 11: '............w...', 12: '............w...', 13: '............w...', 14: '............w...', 15: '............w...', 16: '............w...' });
const STRAP = O({ 9: '.....L..........', 10: '......L.........', 11: '.......L........' });
const STRAPS = O({ 9: '.....L....L.....', 10: '.....L....L.....', 11: '.....L....L.....' });
const STRAW = O({ 2: '......YYYy......', 3: '.....YYYYYy.....', 4: '...YYYYYYYYYy...', 5: '....H......h....' });
const STRIPES = O({ 10: '....XAXAXAXa....', 11: '....AXAXAXAx....' });
const SWORD = O({ 10: '............w...', 11: '...........gGg..', 12: '............M...', 13: '............M...', 14: '............M...', 15: '............M...', 16: '............M...' });
const TRAVEL = O({ 2: '......ZZZz......', 3: '.....ZZZZZz.....', 4: '..ZZZZZZZZZZz...', 5: '....H......h....' });
const TRIM = O({ 10: '.......G........', 11: '.......G........', 13: '.......G........', 14: '.......G........', 15: '.....GGGGGg.....' });
const TUNIC = O({ 9: '.....AAAAAa.....', 10: '....AAAAAAaa....', 11: '....AAAAAAaa....', 12: '....aLLLLLLa....', 13: '......PPPp......', 14: '......P..p......', 15: '......P..p......' });
const VEST = O({ 9: '.....B.BB.b.....', 10: '.....B.BB.b.....', 11: '.....BBBBbb.....' });
const WAPRON = O({ 10: '......XXXx......', 11: '......XXXx......', 12: '......XXXx......', 13: '......XXXx......', 14: '......x..x......' });
const WOOL = O({ 9: '....BBBBBBBb....', 10: '....BXXXXXXb....', 11: '....bXXXXXXb....' });
const YARN = O({ 11: '...x............', 12: '..pP............', 13: '.pPPp...........', 14: '..pp............' });
const SHORT_CHILD = shift(SHORT, 4);

// Paleta ---------------------------------------------------------------------

/** Cores marcadoras: o renderizador troca pela cor de cada pessoa ou do reino. */
export const MARK = {
  tint: '#ff00ff',
  tintDark: '#800080',
  skin: '#00ffff',
  skinShade: '#00cccc',
  hair: '#ffff00',
  hairShade: '#999900',
} as const;

const BASE: Record<string, string> = {
  S: MARK.skin, s: MARK.skinShade, H: MARK.hair, h: MARK.hairShade, L: MARK.tint,
  E: '#1b1420', D: '#3a2a22', M: '#d0d4dc', m: '#8a909e',
  W: '#a8763e', w: '#6b4423', G: '#f0c848', g: '#b08a24', R: '#c03a30', r: '#7a2420',
  X: '#ece6d6', x: '#b4ac9a', K: '#2a2430', Y: '#e6c25a', y: '#b8963a',
  O: '#c0703c', o: '#8a4a28', F: '#8aa8c0', f: '#5a7890', Q: '#7a2a6a',
  P: '#6b4a2e', p: '#4e3420', B: '#7a4a2a', b: '#5a3420', v: '#9a9078',
  T: '#7a8a4a', t: '#58663a', U: '#d0a46c', u: '#a07848', J: '#6ab84a', j: '#3e8032',
  Z: '#7a5a3a', z: '#56402a', N: '#e0a450', n: '#a8702a',
  // Silhuetas do dano (vermelho) e da morte (preto).
  '#': '#e03028', '&': '#18141c',
};

/** Pele e cabelo de quem aparece em ícone (sem cor por pessoa). */
const ICON_COLORS: Record<string, string> = { S: '#f4c8a0', s: '#d49c76', H: '#7a4a26', h: '#52301a' };

// Profissões -------------------------------------------------------------------

/** Gesto do trabalho, pela ferramenta: golpe de cima, estocada, puxar ou nenhum (só balança). */
type Gesture = 'swing' | 'thrust' | 'pull' | 'none';

interface Look {
  clothes: Grid[];
  tools?: Grid[];
  head?: Grid;
  beard?: boolean;
  hm?: Grid | null;
  hf?: Grid | null;
  colors: Record<string, string>;
  under?: Grid[];
  fringe?: boolean;
  child?: boolean;
  gesture?: Gesture;
}

const ARMY = { A: MARK.tint, a: MARK.tintDark, L: '#4a3020' };

/**
 * Aparência de cada profissão. As chaves do jogo vêm de `sim/roles.ts`;
 * `free` é quem ainda não tem profissão e as últimas são profissões novas
 * (só a arte por enquanto) e as idades.
 */
export const LOOKS: Record<string, Look> = {
  free: { clothes: [LOOSE], colors: { A: '#bdb194', a: '#93886e', P: '#7a6a52', p: '#5a4e3c' } },
  gatherer: { clothes: [TUNIC, VEST], tools: [BASKET], colors: { A: '#8a9a4a', a: '#647234', B: '#7a5a34', b: '#5a4024' } },
  hunter: { clothes: [TUNIC, VEST], tools: [QUIVER, BOW], gesture: 'pull', colors: { A: '#3e7a3a', a: '#2a5628', B: '#7a4e2a', b: '#56361c', P: '#b8a038', p: '#8a7624' } },
  farmer: { clothes: [TUNIC], tools: [FORK], head: STRAW, gesture: 'thrust', colors: { A: '#d2bc84', a: '#a88e58', P: '#5a6a8a', p: '#40506a' } },
  woodcutter: { clothes: [TUNIC, PLAID], tools: [AXE], beard: true, gesture: 'swing', colors: { A: '#b03a2c', a: '#7c2620', P: '#4a4a5a', p: '#34343e' } },
  builder: { clothes: [TUNIC, APRON], tools: [HAMMER], head: BANDANA, gesture: 'swing', colors: { A: '#6a7e8e', a: '#4c5e6c', B: '#a88a5a', b: '#7a6440' } },
  miner: { clothes: [TUNIC, STRAP], tools: [PICK], head: MINER, beard: true, gesture: 'swing', colors: { A: '#6a5644', a: '#4a3c30', P: '#3e3a36', p: '#2c2a26' } },
  blacksmith: { clothes: [TUNIC, APRON], tools: [SMITH], hm: BALD, hf: BUN, beard: true, gesture: 'swing', colors: { A: '#4a4652', a: '#34303a', B: '#7a4a2a', b: '#56321c' } },
  fisher: { clothes: [TUNIC], tools: [FISH, ROD], head: BUCKET, gesture: 'pull', colors: { A: '#3a6e9e', a: '#2a5078', P: '#c4b48a', p: '#9a8a64' } },
  shepherd: { clothes: [ROBE, WOOL], tools: [CROOK], colors: { A: '#8a6a44', a: '#644c30', B: '#7a5a3a', b: '#5a4028' } },
  horsekeeper: { clothes: [TUNIC, VEST], tools: [ROPE, BRUSH], head: LEATHER, colors: { A: '#c8b48a', a: '#9e8a62', B: '#6a3e22', b: '#4a2a16', P: '#5a4a3a', p: '#3e3228' } },
  weaver: { clothes: [ROBE, COLLAR], tools: [YARN], head: SCARF, colors: { A: '#8a4a96', a: '#64346e', B: '#d8b860', b: '#a88a3a' } },
  potter: { clothes: [TUNIC, APRON], tools: [POT], hf: BUN, colors: { A: '#c8a070', a: '#9a7650', B: '#7a6a5a', b: '#5a4c40' } },
  miller: { clothes: [TUNIC], tools: [SACK], head: CAP, beard: true, colors: { A: '#ddd6c4', a: '#b0a890', P: '#7a6a54', p: '#5a4c3a' } },
  // O `merchant` do jogo é quem fica no mercado; o comerciante que viaja é `trader`.
  merchant: { clothes: [ROBE, TRIM], tools: [POUCH], head: BERET, colors: { A: '#2e7a5a', a: '#1e5640' } },
  priest: { clothes: [ROBE, TRIM], tools: [STAFF], head: HOOD, beard: true, fringe: true, colors: { A: '#e8e2d2', a: '#b8b09c' } },
  soldier: { clothes: [TUNIC], tools: [SHIELD, SPEAR], head: HELM, gesture: 'thrust', colors: { ...ARMY, P: '#5a4a3a', p: '#3e3228' } },
  guard: { clothes: [TUNIC, MAIL], tools: [HALBERD], head: HELM, gesture: 'thrust', colors: { ...ARMY, A: '#4a4a52', a: '#34343a', B: MARK.tint, b: MARK.tintDark, P: '#4a4a52', p: '#34343a' } },
  leader: { clothes: [TUNIC, CAPE], tools: [SWORD], head: BAND, hm: null, hf: null, colors: { A: '#3a5a3a', a: '#28402a', B: '#7a2a3a', b: '#561c28', P: '#5a4a3a', p: '#3e3228' } },
  king: { clothes: [ROBE, FUR], tools: [SCEPTER], head: CROWN, beard: true, colors: { A: '#a82a3a', a: '#761c28' } },
  // Profissões novas (só a arte por enquanto).
  tanner: { clothes: [TUNIC, APRON], tools: [HIDE, SCRAPER], beard: true, colors: { A: '#9a8a6a', a: '#76684e', B: '#5a3a22', b: '#3e2816' } },
  healer: { clothes: [ROBE, SATCHEL], tools: [HERBS], colors: { A: '#3a8a7a', a: '#286458' } },
  trader: { clothes: [TUNIC, STRAPS], tools: [STICK], head: TRAVEL, beard: true, under: [PACK_UNDER], colors: { A: '#5a7aa0', a: '#40587a', P: '#6a5a44', p: '#4a3e2e' } },
  baker: { clothes: [TUNIC, WAPRON], tools: [BREAD], head: CAP, colors: { A: '#c88a5a', a: '#9a643a', P: '#6a5a4a', p: '#4a3e32' } },
  scribe: { clothes: [ROBE], tools: [SCROLL, QUILL], head: CAPKNIT, colors: { A: '#4a5a8a', a: '#344068' } },
  sailor: { clothes: [TUNIC, STRIPES], tools: [OAR], gesture: 'thrust', colors: { A: '#2a4a7a', a: '#1c3458', P: '#c4b48a', p: '#9a8a64' } },
  elder: { clothes: [ROBE], tools: [CANE], hm: BALD, hf: BUN, beard: true, colors: { A: '#7a6a52', a: '#5a4c3a' } },
  child: { clothes: [CHILD_TUNIC], hm: SHORT_CHILD, hf: CHILDLONG, child: true, colors: { A: '#c8783a', a: '#9a5a28', P: '#6a5a4a', p: '#4a3e32' } },
};

// Montagem -------------------------------------------------------------------

function blank(w = W): string[][] {
  return Array.from({ length: H }, () => Array<string>(w).fill('.'));
}

function lay(g: string[][], L: Grid | null | undefined, dx = 0, dy = 0): void {
  if (!L) return;
  L.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      const ty = y + dy;
      const tx = x + dx;
      if (c !== '.' && ty >= 0 && ty < H && tx >= 0 && tx < g[0].length) g[ty][tx] = c;
    }
  });
}

/** Corpo, roupa e cabeça, sem ferramenta. */
function figure(look: Look, female: boolean): string[][] {
  const g = blank();
  for (const L of look.under ?? []) lay(g, L);
  lay(g, look.child ? CHILD : BODY);
  for (const L of look.clothes) lay(g, L);
  const hair = female ? (look.hf === undefined ? LONG : look.hf) : look.hm === undefined ? SHORT : look.hm;
  lay(g, hair);
  if (look.beard && !female) lay(g, BEARD);
  lay(g, look.head);
  if (female && look.fringe) lay(g, FRINGE);
  return g;
}

interface Pose {
  /** Tronco desce 1 px (respiração, passo, impacto). */
  bob?: number;
  /** Pé que sobe no passo. */
  step?: 'L' | 'R';
  /** Deslocamento da ferramenta. */
  tdx?: number;
  tdy?: number;
}

function frame(look: Look, female: boolean, pose: Pose = {}, tools = true): Grid {
  const { bob = 0, step, tdx = 0, tdy = 0 } = pose;
  const fig = figure(look, female);
  const split = look.child ? 13 : 12;
  const g = blank();
  for (let y = split + 1; y < H; y++) g[y] = fig[y].slice();
  for (let y = split; y >= 0; y--) {
    if (y + bob >= H) continue;
    for (let x = 0; x < W; x++) if (fig[y][x] !== '.') g[y + bob][x] = fig[y][x];
  }
  if (step) {
    const lx = step === 'L' ? 6 : 9;
    if (g[16][lx] === 'D') {
      g[16][lx] = '.';
      g[15][lx] = 'D';
    }
    // A mão do outro lado some atrás do corpo (o braço balança).
    const hx = step === 'L' ? 11 : 4;
    const hy = split + 1 + bob;
    if (hy < H && (g[hy][hx] === 'S' || g[hy][hx] === 's')) g[hy][hx] = '.';
  }
  if (tools) for (const L of look.tools ?? []) lay(g, L, tdx, tdy + bob);
  return g.map((r) => r.join(''));
}

/** Silhueta numa cor só (`#` vermelho do dano, `&` preto da morte). */
function silhouette(rows: Grid, ch: string): Grid {
  return rows.map((r) => r.replace(/[^.]/g, ch));
}

/** Corpo deitado de lado, pés à esquerda e cabeça à direita, encostado no chão. */
function lying(rows: Grid): Grid {
  const ys = rows.map((r, y) => (/[^.]/.test(r) ? y : -1)).filter((y) => y >= 0);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  let x0 = W;
  let x1 = 0;
  for (const r of rows) for (let x = 0; x < W; x++) if (r[x] !== '.') { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  const g = blank(LYING_W);
  const left = Math.floor((LYING_W - (y1 - y0 + 1)) / 2);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (rows[y][x] === '.') continue;
      const nx = left + (y1 - y);
      const ny = 16 - (x1 - x);
      if (ny >= 0) g[ny][nx] = '&';
    }
  }
  return g.map((r) => r.join(''));
}

/** Quadros de uma pessoa: nomes de sprite e duração de cada quadro do trabalho (em passos de 90 ms). */
export interface HumanFrames {
  idle: string[];
  walk: string[];
  work: string[];
  /** Duração de cada quadro do trabalho, em passos. */
  workTicks: number[];
  hit: string;
  dead: string;
  fallen: string;
}

/** Todos os quadros dos humanos (`hu:profissão:m|f:quadro`). */
export const HUMAN_SPRITES: Record<string, string[]> = {};
/** Paleta de cada sprite humano (os outros sprites usam a paleta comum). */
export const HUMAN_PALETTES: Record<string, Record<string, string>> = {};
/** Quadros por profissão: [homem, mulher]. */
export const HUMAN_FRAMES: Record<string, [HumanFrames, HumanFrames]> = {};
/** Sprite parado de cada profissão com pele e cabelo fixos, para os ícones da interface. */
export const HUMAN_ICONS: Record<string, string[]> = {};
export const HUMAN_ICON_PALETTES: Record<string, Record<string, string>> = {};

const WORK: Record<Gesture, [Pose, number][]> = {
  swing: [[{ tdy: -3 }, 3], [{ tdy: -1 }, 1], [{ bob: 1, tdy: 1 }, 3], [{}, 1]],
  thrust: [[{}, 2], [{ tdy: -2 }, 2], [{ bob: 1, tdy: 1, tdx: 1 }, 3], [{}, 1]],
  pull: [[{}, 2], [{ tdx: 1 }, 3], [{ bob: 1, tdx: -1 }, 2], [{}, 1]],
  none: [[{}, 4], [{ bob: 1 }, 4]],
};

for (const [role, look] of Object.entries(LOOKS)) {
  const palette = { ...BASE, ...look.colors };
  const pair = (['m', 'f'] as const).map((g) => {
    const female = g === 'f';
    const key = (name: string) => `hu:${role}:${g}:${name}`;
    const add = (name: string, rows: Grid) => {
      HUMAN_SPRITES[key(name)] = rows;
      HUMAN_PALETTES[key(name)] = palette;
      return key(name);
    };
    const base = add('base', frame(look, female));
    const bob = add('bob', frame(look, female, { bob: 1 }));
    const stepL = add('stepL', frame(look, female, { bob: 1, step: 'L' }));
    const stepR = add('stepR', frame(look, female, { bob: 1, step: 'R' }));
    const work: string[] = [];
    const workTicks: number[] = [];
    WORK[look.gesture ?? 'none'].forEach(([pose, ticks], k) => {
      const plain = !pose.bob && !pose.tdx && !pose.tdy;
      work.push(plain ? base : pose.bob && !pose.tdx && !pose.tdy ? bob : add(`w${k}`, frame(look, female, pose)));
      workTicks.push(ticks);
    });
    const body = frame(look, female, {}, false);
    const frames: HumanFrames = {
      idle: [base, bob],
      walk: [base, stepL, base, stepR],
      work,
      workTicks,
      hit: add('hit', silhouette(HUMAN_SPRITES[base], '#')),
      dead: add('dead', silhouette(body, '&')),
      fallen: add('fallen', lying(body)),
    };
    return frames;
  });
  HUMAN_FRAMES[role] = [pair[0], pair[1]];
  HUMAN_ICONS[role] = HUMAN_SPRITES[`hu:${role}:m:base`];
  HUMAN_ICON_PALETTES[role] = { ...palette, ...ICON_COLORS };
}

// Pele e cabelo por pessoa --------------------------------------------------------

/** Tons de pele (claro, médio e escuro). */
export const SKIN_TONES: readonly (readonly number[])[] = [
  [244, 200, 160],
  [198, 140, 98],
  [140, 90, 58],
];
const HAIR_COLORS = {
  black: [42, 30, 26],
  darkBrown: [80, 50, 30],
  brown: [122, 74, 38],
  blond: [234, 168, 58],
  red: [184, 74, 34],
  grey: [188, 184, 176],
  white: [238, 234, 226],
} as const;
/** Cabelos possíveis por tom de pele: na pele escura, só os escuros, para não confundir cabelo e rosto. */
const HAIR_BY_TONE: readonly (readonly (readonly number[])[])[] = [
  [HAIR_COLORS.brown, HAIR_COLORS.blond, HAIR_COLORS.red, HAIR_COLORS.black, HAIR_COLORS.darkBrown],
  [HAIR_COLORS.black, HAIR_COLORS.darkBrown, HAIR_COLORS.black],
  [HAIR_COLORS.black],
];
const OLD_HAIR = [HAIR_COLORS.grey, HAIR_COLORS.white];

export interface Person {
  female: boolean;
  skin: readonly number[];
  hair: readonly number[];
}

/** Hash inteiro estável. */
function mix(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Gênero, pele e cabelo de uma pessoa, sempre os mesmos para a mesma semente (o uid). */
export function personOf(seed: number, old = false): Person {
  const h = mix(seed);
  const tone = (h >>> 1) % SKIN_TONES.length;
  const hairs = old ? OLD_HAIR : HAIR_BY_TONE[tone];
  return { female: (h & 1) === 1, skin: SKIN_TONES[tone], hair: hairs[(h >>> 4) % hairs.length] };
}

/** Profissão do jogo (ou idade) para a chave de aparência. */
export function lookKey(role: string): string {
  return LOOKS[role] ? role : 'free';
}
