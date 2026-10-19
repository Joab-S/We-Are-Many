/**
 * Pixel art da superfície, em texto, no estilo 16 bits: contorno escuro,
 * 3 a 4 tons por material e luz vinda de cima à esquerda.
 * `M` é a cor da instância (espécie, aldeia ou reino) e `m` a mesma cor
 * escurecida; o renderizador troca essas duas pela cor de cada um.
 */

export const COLORS: Record<string, string> = {
  K: '#241a14', // contorno
  S: '#f0c896', // pele
  s: '#c8946a', // pele sombreada
  B: '#4a3020', // calça
  M: '#ff00ff', // cor da instância
  m: '#800080', // cor da instância escurecida
  E: '#101010', // olho
  // Palha
  Y: '#ecd07a',
  y: '#cba24e',
  u: '#8f6c2c',
  // Barro
  A: '#c99a6a',
  a: '#97693f',
  // Madeira
  P: '#c48c58',
  p: '#8e5f36',
  q: '#5e3c20',
  // Telhado de telha
  Q: '#ec8460',
  R: '#c4503a',
  r: '#8a3226',
  // Reboco branco
  W: '#f1e8d4',
  w: '#c9bea6',
  // Pedra
  G: '#bcbcc4',
  g: '#8a8a96',
  n: '#5c5c68',
  // Ardósia
  N: '#8ea2c6',
  L: '#5f72a0',
  l: '#3e4c72',
  // Tijolo
  X: '#c0663f',
  x: '#8a4430',
  // Vidro
  O: '#b4e4f6',
  o: '#5f9fc0',
  // Porta
  D: '#5a3620',
  d: '#2e1a0e',
  // Fogo
  F: '#ffe066',
  f: '#ff8a26',
  h: '#c43c16',
  // Água
  V: '#5aa0e6',
  v: '#2f6cb4',
  // Animais
  T: '#e8dcc0', // barriga clara
  // Árvores
  '1': '#1c3619',
  j: '#2c5a28',
  J: '#3f8a36',
  k: '#64b448',
  i: '#a6dc6c',
  t: '#5a3418',
  U: '#85502a',
  // Pinheiro
  b: '#173f2a',
  c: '#2a6640',
  C: '#4a9a5c',
  // Acácia
  e: '#4e6a26',
  H: '#7a9a3a',
  I: '#a8c456',
  // Cacto
  Z: '#2a6a2c',
  z: '#3f9a3e',
  // Sombra no chão: escurece o terreno em vez de pintar.
  '~': 'shadow',
};

export const ART = {
  human: [
    '..KKK..',
    '..KSK..',
    '..SSs..',
    'SMMMMmS',
    'S.MMm.S',
    '..MMm..',
    '..B.B..',
    '..B.B..',
    '..S.S..',
  ],
  alien: [
    '..MMM..',
    '.MEMEM.',
    '..MMm..',
    'mMMMMmm',
    'm.MMm.m',
    '..mmm..',
    '..m.m..',
    '..m.m..',
  ],
  herbivore: [
    'K.K.....',
    '.KK.....',
    '.MEMMMM.',
    '..MMMMMm',
    '..TTTTm.',
    '..m...m.',
    '..m...m.',
  ],
  predator: [
    'M.M.....',
    'MMMMMM..',
    'EMMMMMMm',
    '.MMMMMmm',
    '.TTTTmm.',
    '.m...m..',
    '.m...m..',
  ],
  fish: ['.MMM.M', 'MEMMmM', '.mmm.m'],
  dot: ['M'],

  // Casas, uma por era (16x16).
  hut: [
    '................',
    '.......KK.......',
    '......KYuK......',
    '.....KYYyuK.....',
    '....KYYYyyuK....',
    '...KYYYyyyyuK...',
    '..KYYYyyyyyyuK..',
    '.KYYYyyyyyyyyuK.',
    'KuuuuuuuuuuuuuuK',
    '.KKKKKKKKKKKKKK.',
    '..KAAAAKKAAAaK..',
    '..KAAAKddKAAaK..',
    '..KAAAKddKAAaK..',
    '..KaaaKddKaaaK..',
    '..KKKKKKKKKKKK..',
    '................',
  ],
  cottage: [
    '................',
    '....KKKKKKKK....',
    '...KYYYYyyyuK...',
    '..KYYYYyyyyyuK..',
    '.KYYYYyyyyyyyuK.',
    'KYYYYyyyyyyyyyuK',
    'KuuuuuuuuuuuuuuK',
    '.KPPPPPPPPPPPpK.',
    '.KPKKKKPPPPPPpK.',
    '.KPKOoKPPKKKKpK.',
    '.KPKooKPPKDdKpK.',
    '.KPKKKKPPKDdKpK.',
    '.KpppppppKDdKpK.',
    '.KqqqqqqqKDdKqK.',
    '.KKKKKKKKKKKKKK.',
    '................',
  ],
  house: [
    '...........KK...',
    '....KKKKKKKGgK..',
    '...KQQQRRRRKKK..',
    '..KQQRRRRRRRrrK.',
    '.KQRRRRRRRRRRrrK',
    'KRRRRRRRRRRRRrrK',
    'KrrrrrrrrrrrrrrK',
    '.KWqWWWqWWWqWwK.',
    '.KWqKKKqWWWqWwK.',
    '.KWqKOKqWKKKqwK.',
    '.KqqKoKqqKDKqqK.',
    '.KWqKKKqWKDKqwK.',
    '.KWqWWWqWKdKqwK.',
    '.KqqqqqqqKdKqqK.',
    '.KKKKKKKKKKKKKK.',
    '................',
  ],
  stoneHouse: [
    '.....KKKKKK.....',
    '....KNNNLLLK....',
    '...KNNNLLLLlK...',
    '..KNNNLLLLLLlK..',
    '.KNNLLLLLLLLllK.',
    'KNLLLLLLLLLLLllK',
    'KllllllllllllllK',
    '.KGGgGGGgGGGgnK.',
    '.KGKKKgGGKKKgnK.',
    '.KgKOKGGgKOKGnK.',
    '.KGKoKgGGKoKgnK.',
    '.KGGgGKKKGGgGnK.',
    '.KgGGKDDdKGGgnK.',
    '.KGGgKDDdKgGGnK.',
    '.KKKKKKKKKKKKKK.',
    '................',
  ],
  townhouse: [
    '..KK......KK....',
    '..KnK.KKKKnK....',
    '..KKKLLLLLKKK...',
    '.KNNLLLLLLLLlK..',
    'KNLLLLLLLLLLllK.',
    'KllllllllllllllK',
    'KXXXxXXXxXXXxXxK',
    'KXKKKXXKKKXKKKxK',
    'KXKOKxXKOKXKOKxK',
    'KXKoKXXKoKXKoKxK',
    'KxxxxxxxxxxxxxxK',
    'KXKKKXKKKKXKKKxK',
    'KXKOKXKDDKXKOKxK',
    'KXKoKXKDdKXKoKxK',
    'KKKKKKKKKKKKKKKK',
    '................',
  ],

  // Centro do assentamento.
  bonfire: [
    '....K...',
    '...KFK..',
    '..KFfFK.',
    '.KFffhFK',
    '.KfhhhfK',
    'KqKqKqKq',
    '.KKKKKK.',
  ],
  well: [
    '...KKKKKK...',
    '...KqqqqK...',
    '...K.KK.K...',
    '...K.KK.K...',
    '.KKKKKKKKKK.',
    'KGGgGGgGGgnK',
    'KGVVVVVVvvnK',
    'KgGGgGGgGGnK',
    'KGGgGGgGGgnK',
    '.KKKKKKKKKK.',
  ],
  keep: [
    '........KMMMM...',
    '........KMMMm...',
    '........KMm.....',
    '...KKK.KKK.KKK..',
    '...KGK.KGK.KgK..',
    '...KGKKKGKKKgK..',
    '...KGGGgGGGGnK..',
    '...KGKKKGgGGnK..',
    '...KGKOKgGGgnK..',
    '...KgKoKGGGGnK..',
    '...KGGGGGgGGnK..',
    '...KGgGKKKGgnK..',
    '...KGGKDDdKGnK..',
    '...KgGKDDdKgnK..',
    '...KKKKKKKKKKK..',
    '................',
  ],
} satisfies Record<string, string[]>;

/** Enfeites por tile (mesma ordem do enum Decor, a partir de 1), 16x16. */
export const DECOR_ART: string[][] = [
  // Árvore
  [
    '.....111111.....',
    '...11kkkiJJ11...',
    '..1kkiikkJJJJ1..',
    '.1kiikkkJJJJjj1.',
    '.1kikkkJJJJJjj1.',
    '1kkkkJJJJJJjjjj1',
    '1kkJJJJJJJJjjjj1',
    '1JJJJJJJjJJjjjj1',
    '.1JJJJJjjjjjjj1.',
    '.1jJJjjjjjjjjj1.',
    '..11jjjjjjjj11..',
    '....111tU1111...',
    '......1tU1......',
    '......1tU1......',
    '....~~1tU1~~....',
    '.....~~~~~~.....',
  ],
  // Árvore da selva
  [
    '..1111...1111...',
    '.1jJJJ1.1JJJj1..',
    '1jJkkJJ1JkkJJj1.',
    '1JkkiJJJkkiJJjj1',
    '1JkiJJJJkiJJjjj1',
    '1jJJJjjJJJJjjjj1',
    '.1jjjjjjJJjjjj1.',
    '.1JJkkJjjjjjjj1.',
    '1JJkiJJJjjjjjjj1',
    '1jJJJJJjjjjjjjj1',
    '.1jjjjjjjjjjj11.',
    '..111jjjjjj11...',
    '.....11tU11.....',
    '......1tU1......',
    '....~~1tU1~~....',
    '.....~~~~~~.....',
  ],
  // Pinheiro
  [
    '.......bb.......',
    '......bCcb......',
    '.....bCCccb.....',
    '....bCCcccbb....',
    '.....bCcccb.....',
    '....bCCcccb.....',
    '...bCCcccccbb...',
    '..bCCccccccccb..',
    '....bCcccccb....',
    '...bCCccccccb...',
    '..bCCcccccccccb.',
    '.bbbbbbbbbbbbbbb',
    '.......tU.......',
    '.......tU.......',
    '.....~~tU~~.....',
    '......~~~~......',
  ],
  // Acácia
  [
    '................',
    '................',
    '..111111111111..',
    '.1IIIIHHHHHHHe1.',
    '1IIIHHHHHHHHHee1',
    '1eeeeeeeeeeeeee1',
    '.1111t1111t1111.',
    '......tU..tU....',
    '.......tUtU.....',
    '........tU......',
    '........tU......',
    '........tU......',
    '........tU......',
    '........tU......',
    '......~~tU~~....',
    '.......~~~~~....',
  ],
  // Cacto
  [
    '................',
    '................',
    '.......KK.......',
    '......KzzK......',
    '......KzZK......',
    '..KK..KzZK......',
    '.KzzK.KzZK..KK..',
    '.KzZK.KzZK.KzzK.',
    '.KzZKKKzZK.KzZK.',
    '.KzzzzzzZKKKzZK.',
    '..KKKKKzZzzzzZK.',
    '......KzZKKKKK..',
    '......KzZK......',
    '......KzZK......',
    '....~~KKKK~~....',
    '.....~~~~~~.....',
  ],
  // Pedra
  [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '.....KKKKK......',
    '...KKGGGggKK....',
    '..KGGGGGgggnK...',
    '..KGGGgggggnK...',
    '.KgGgggggnnnnK..',
    '.KggggggnnnnnK..',
    '..KKnnnnnnnKK~~.',
    '...~KKKKKKK~~~..',
    '....~~~~~~~~....',
  ],
];

/** Canvas com os enfeites lado a lado (16 px cada). Alfa 255 = cor; alfa 100 = sombra. */
export function makeDecorCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = DECOR_ART.length * 16;
  canvas.height = 16;
  const g = canvas.getContext('2d')!;
  DECOR_ART.forEach((art, k) => {
    art.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const c = COLORS[ch];
        if (!c) return;
        g.fillStyle = c === 'shadow' ? 'rgba(0,0,0,0.392)' : c;
        g.fillRect(k * 16 + x, y, 1, 1);
      });
    });
  });
  return canvas;
}

export type SpriteName = keyof typeof ART;
