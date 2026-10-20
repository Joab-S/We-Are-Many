import { ROLES, type Role } from '../../sim/roles';

/**
 * Pixel art da superfície, em texto, no estilo 16 bits: contorno escuro,
 * 3 a 4 tons por material e luz vinda de cima à esquerda.
 * `M` é a cor da instância (espécie, aldeia ou reino), `m` a mesma cor
 * escurecida e `+` clareada; `$` e `%` são a pele da espécie. O
 * renderizador troca essas cores pelas de cada um.
 */

export const COLORS: Record<string, string> = {
  K: '#241a14', // contorno
  S: '#f0c896', // pele
  s: '#c8946a', // pele sombreada
  B: '#4a3020', // calça
  M: '#ff00ff', // cor da instância
  m: '#800080', // cor da instância escurecida
  '+': '#ff80ff', // cor da instância clareada
  $: '#00ffff', // pele da espécie
  '%': '#008080', // pele da espécie escurecida
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
  // Barbatana e dorso de um predador marinho saindo da água.
  shark: ['...K....', '..KMK...', '.KMMmK..', 'KmMMMmmK'],
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
    '...K+++MMMMKKK..',
    '..K++MMMMMMMmmK.',
    '.K+MMMMMMMMMMmmK',
    'KMMMMMMMMMMMMmmK',
    'KmmmmmmmmmmmmmmK',
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
    '....K+++MMMK....',
    '...K+++MMMMmK...',
    '..K+++MMMMMMmK..',
    '.K++MMMMMMMMmmK.',
    'K+MMMMMMMMMMMmmK',
    'KmmmmmmmmmmmmmmK',
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
    '..KKKMMMMMKKK...',
    '.K++MMMMMMMMmK..',
    'K+MMMMMMMMMMmmK.',
    'KmmmmmmmmmmmmmmK',
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

  // Fábrica de tijolos com chaminé fumegando (Era Industrial).
  factory: [
    '..........GG....',
    '.........GggG...',
    '..........gG....',
    '..........KK....',
    '.........KxXK...',
    '.........KxXK...',
    '.KK..KK..KxXK...',
    'KMMKKMMKKKxXKKK.',
    'KMmMKMmMKMmXMmK.',
    'KXXXXXXXXXXXXXK.',
    'KXOoXXOoXXOoXXK.',
    'KXooXXooXXooXXK.',
    'KxxxxxxxxxxxxxK.',
    'KXXXXDDXXXXXXXK.',
    'KxxxxDdxxxxxxxK.',
    'KKKKKKKKKKKKKKK.',
  ],

  // Porto: galpão de barcos e píer de madeira.
  port: [
    '....KKKKKK......',
    '...KMMMMMMK.....',
    '..KMMMMMMMmK....',
    '.KMMMMMMMMmmK...',
    '..KPPPPPPPpK....',
    '..KPpDDPPPpK....',
    '..KPpDdPPPpK....',
    'KKKKKKKKKKKKKKKK',
    'KPpPpPpPpPpPpPpK',
    'KKKKKKKKKKKKKKKK',
    '.Kq...Kq...Kq...',
    '.Kq...Kq...Kq...',
  ],

  // Embarcações, uma por era (de lado, proa para a direita).
  canoe: [
    '....KK......',
    '....SS...q..',
    '...MMMm.q...',
    'PKKKKKKKqKKP',
    'KPPPPPPPPPPK',
    '.KppppppppK.',
    '..KKKKKKKK..',
  ],
  rowboat: [
    '...KK.....KK....',
    '...SS.....SS....',
    '..MMMm...MMMm...',
    'KKKKKKKKKKKKKKKK',
    'KPPPPPPPPPPPPPPK',
    '.KMMMMMMMMMMMMK.',
    '..KppppppppppK..',
    '...KKKKKKKKKK...',
  ],
  sailboat: [
    '.......K........',
    '.......KMM......',
    '.......KW.......',
    '.......KWW......',
    '.......KWWW.....',
    '.......KWWWW....',
    '.......KWWWWW...',
    '.......KWWWWWw..',
    '.......KWWWWWww.',
    '.......KKKKKKKK.',
    'KK.....K.......K',
    'KPPPPPPPPPPPPPPK',
    '.KMMMMMMMMMMMMK.',
    '..KppppppppppK..',
    '...KKKKKKKKKK...',
  ],
  caravel: [
    '.....K.........K......',
    '.....KMM.......KMM....',
    '...KKKKKKK...KKKKKKK..',
    '...KWWWWWK...KWWWWWK..',
    '...KWWMWWK...KWWMWWK..',
    '...KWMMMWK...KWMMMWK..',
    '...KWWMWWK...KWWMWWK..',
    '...KWWWWwK...KWWWWwK..',
    '...KKKKKKK...KKKKKKK..',
    '.....K.........K......',
    'KKK..K.........K...KKK',
    'KPPKKKKKKKKKKKKKKKKPPK',
    'KPPPPPPPPPPPPPPPPPPPPK',
    '.KpOpppOpppOpppOpppK..',
    '..KMMMMMMMMMMMMMMMMK..',
    '...KqqqqqqqqqqqqqqK...',
    '....KKKKKKKKKKKKKK....',
  ],
  steamship: [
    '.............GG.......',
    '............GggG......',
    '.............gG.......',
    '............KMMK......',
    '............KMmK......',
    '............KKKK......',
    '.....KKKKKKKKKKKKKK...',
    '.....KWOWOWOWOWOWWK...',
    '.....KWWWWWWWWWWWWK...',
    'KKKKKKKKKKKKKKKKKKKKKK',
    'KnnnnnnnnnnnnnnnnnnnnK',
    '.KhhhhhhhhhhhhhhhhhhK.',
    '..KnnnnnnnnnnnnnnnnK..',
    '...KKKKKKKKKKKKKKKK...',
  ],
  // Destroços de um naufrágio.
  wreck: ['..K......K..', '.KpK..KKpK..', 'KPPpKKPPpPK.', '.KKK..KKKK..'],

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

  // Construções especiais.
  smithy: [
    '..........KK....',
    '..........KnK...',
    '...KKKKKKKKnK...',
    '..K+++MMMMMKKK..',
    '.K+++MMMMMMMmmK.',
    'K++MMMMMMMMMMmmK',
    'KmmmmmmmmmmmmmmK',
    '.KGGgGGGgGGGgnK.',
    '.KGKKKKKKKgGGnK.',
    '.KgKfFFhfKGGgnK.',
    '.KGKhffhhKgKKnK.',
    '.KGKKKKKKKGKnnK.',
    '.KgGGgGGgGGKKnK.',
    '.KGGgGGgGGgGgnK.',
    '.KKKKKKKKKKKKKK.',
    '................',
  ],
  granary: [
    '.....KKKKKK.....',
    '....K+MMMMmK....',
    '...K++MMMMmmK...',
    '..K++MMMMMMmmK..',
    '.K+MMMMMMMMMMmK.',
    'KMMMMMMMMMMMMMmK',
    'KKKKKKKKKKKKKKKK',
    '.KPPpPPKKPPpPPK.',
    '.KPPpPKqqKPpPPK.',
    '.KPPpKqPPqKpPPK.',
    '.KPPpKPqqPKpPPK.',
    '.KPPpKqPPqKpPPK.',
    '.KppqKPqqPKqppK.',
    '.KqqqKqPPqKqqqK.',
    '.KKKKKKKKKKKKKK.',
    '................',
  ],
  temple: [
    '.......KK.......',
    '.......KFK......',
    '......K+MK......',
    '.....K+MMmK.....',
    '....K+MMMMmK....',
    '....KWWWWWwK....',
    '....KWKOKWwK....',
    '..KKKWKoKWwKKK..',
    '.K+MKWWWWWwKMmK.',
    'K+MMKWWWWWwKMmmK',
    'KWWWKWKDDKwKWWwK',
    'KWOWKWKDdKwKWOwK',
    'KWoWKWKDdKwKWowK',
    'KWWWKWKDdKwKWWwK',
    'KKKKKKKKKKKKKKKK',
    '................',
  ],
  barracks: [
    '..KMMMK.........',
    '..KMMm..........',
    '..K.............',
    'KKKKKKKKKKKKKKKK',
    'KGgKGgKGgKGgKGgK',
    'KGGGGgGGGGgGGGnK',
    'KGKKKgGGGGgKKKnK',
    'KGKOKGgGGgGKOKnK',
    'KgKoKGGGGGGKoKnK',
    'KGGGGGKKKKGGGGnK',
    'KGgGGKMMMMKGgGnK',
    'KGGgGKMddmKGGgnK',
    'KgGGGKMddmKgGGnK',
    'KGGgGKMddmKGGgnK',
    'KKKKKKKKKKKKKKKK',
    '................',
  ],
  market: [
    '................',
    '................',
    '................',
    '..KKKKKKKKKKKK..',
    '.KM+M+M+M+M+MMK.',
    'KMWMWMWMWMWMWMmK',
    'KmmmmmmmmmmmmmmK',
    '.Kq..........qK.',
    '.Kq..RhFfYy..qK.',
    '.KqKKKKKKKKKKqK.',
    '.KqPPPpPPPPpPqK.',
    '.KqPPPpPPPPpPqK.',
    '.KqpppqpppppqqK.',
    '.KKKKKKKKKKKKKK.',
    '................',
    '................',
  ],
  windmill: [
    '..KW.......WK...',
    '...KW.....WK....',
    '....KWKKKWK.....',
    '.....KqMqmK.....',
    '....K++KMmmK....',
    '....KKqKqKKK....',
    '....KWPPPWpK....',
    '...KWPPKKPWK....',
    '..KWKPKOoKpWK...',
    '.KW.KPKooKpKWK..',
    '....KPPKKPpK....',
    '...KPPPPPPPpK...',
    '...KPPKKKPPpK...',
    '...KPPKDdKPpK...',
    '...KppKDdKppK...',
    '...KKKKKKKKKK...',
  ],
  castle: [
    '........KKKKKKKK........',
    '.......K++MMMMMmK.......',
    '..KK..K++MMMMMMMmK..KK..',
    '.K+MK.KKKKKKKKKKKK.K+MK.',
    'K++MmK.KGGGGGGGgK.K++MmK',
    'KMMMmK.KGKOKKOKgK.KMMMmK',
    'KKKKKK.KGKoKKoKgK.KKKKKK',
    'KGGGgKKKGGGGGGGgKKKGGGgK',
    'KGOGgKGgKGgKKGgKGgKGOGgK',
    'KGoGgKGGGGGGGGGGGnKGoGgK',
    'KGGGgKGGgGGgGGgGGnKGGGgK',
    'KGGGgKgGGGKKKKGGgnKGGGgK',
    'KgGGgKGGGKMMMmKGGnKgGGgK',
    'KGGGgKGgGKMddmKGgnKGGGgK',
    'KGGGgKGGGKMddmKGGnKGGGgK',
    'KKKKKKKKKKKKKKKKKKKKKKKK',
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
  // Plantação
  [
    'Y.Y.Y.Y.Y.Y.Y.Y.',
    'yYyYyYyYyYyYyYyY',
    'uyuyuyuyuyuyuyuy',
    '~~~~~~~~~~~~~~~~',
    'Y.Y.Y.Y.Y.Y.Y.Y.',
    'yYyYyYyYyYyYyYyY',
    'uyuyuyuyuyuyuyuy',
    '~~~~~~~~~~~~~~~~',
    'Y.Y.Y.Y.Y.Y.Y.Y.',
    'yYyYyYyYyYyYyYyY',
    'uyuyuyuyuyuyuyuy',
    '~~~~~~~~~~~~~~~~',
    'Y.Y.Y.Y.Y.Y.Y.Y.',
    'yYyYyYyYyYyYyYyY',
    'uyuyuyuyuyuyuyuy',
    '~~~~~~~~~~~~~~~~',
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

// Profissões ---------------------------------------------------------------

export { ROLE_NAMES, ROLES, type Role } from '../../sim/roles';

/** Corpo base (7x9); `H` é o cabelo ou o que vai na cabeça. */
const BODIES: Record<'human' | 'alien', string[]> = {
  human: ['..HHH..', '..HSH..', '..SSs..', 'SMMMMmS', 'S.MMm.S', '..MMm..', '..B.B..', '..B.B..', '..D.D..'],
  alien: ['..HHH..', '.$E$E$.', '..$$%..', '$MMMMm$', '$.MMm.$', '..MMm..', '..%.%..', '..%.%..', '..%.%..'],
};

interface RoleLook {
  /** O que vai na cabeça: cabelo, chapéu, capacete, coroa. */
  head: string;
  /** Peito de armadura no lugar da roupa nas laterais. */
  armor?: boolean;
  /** Avental de couro. */
  apron?: boolean;
  /** Pixels extras (ferramenta, arma, capa) numa grade de 11x11, corpo em (2, 2). */
  extra: [number, number, string][];
}

const vline = (x: number, y0: number, y1: number, c: string): [number, number, string][] =>
  Array.from({ length: y1 - y0 + 1 }, (_, k) => [x, y0 + k, c]);

const LOOKS: Record<Role, RoleLook> = {
  gatherer: { head: 'K', extra: [[9, 6, 'R'], [10, 6, 'h'], [9, 7, 'u'], [10, 7, 'u'], [9, 8, 'y'], [10, 8, 'y']] },
  hunter: { head: 'K', extra: [[1, 3, 'p'], [0, 4, 'p'], [0, 5, 'p'], [0, 6, 'p'], [0, 7, 'p'], [1, 8, 'p'], ...vline(1, 4, 7, 'w')] },
  farmer: { head: 'Y', extra: [[3, 3, 'y'], [7, 3, 'y'], [8, 0, 'g'], [10, 0, 'g'], [8, 1, 'g'], [9, 1, 'g'], [10, 1, 'g'], ...vline(9, 2, 10, 'q')] },
  woodcutter: { head: 'u', extra: [...vline(9, 4, 9, 'q'), [10, 3, 'G'], [10, 4, 'g'], [10, 5, 'g'], [9, 3, 'q']] },
  builder: { head: 'u', extra: [...vline(9, 5, 9, 'q'), [8, 4, 'g'], [9, 4, 'n'], [10, 4, 'g']] },
  miner: { head: 'Y', extra: [[5, 2, 'F'], ...vline(9, 3, 9, 'q'), [7, 2, 'g'], [8, 2, 'g'], [9, 2, 'n'], [10, 2, 'g'], [10, 3, 'g']] },
  blacksmith: { head: 'K', apron: true, extra: [...vline(9, 4, 8, 'q'), [8, 3, 'n'], [9, 3, 'n'], [10, 3, 'n']] },
  fisher: { head: 'Y', extra: [[3, 3, 'y'], [7, 3, 'y'], [8, 4, 'q'], [9, 3, 'q'], [9, 2, 'q'], [10, 1, 'q'], [10, 0, 'q'], [1, 7, 'V'], [1, 8, 'v'], [0, 8, 'V']] },
  soldier: { head: 'g', armor: true, extra: [[4, 1, 'n'], [5, 1, 'n'], [6, 1, 'n'], ...vline(9, 0, 4, 'G'), [8, 5, 'u'], [10, 5, 'u'], [9, 6, 'q'], [0, 5, 'p'], [1, 5, 'p'], [0, 6, 'p'], [1, 6, 'G'], [0, 7, 'p'], [1, 7, 'p'], [0, 8, 'p'], [1, 8, 'p']] },
  guard: { head: 'g', armor: true, extra: [[4, 1, 'n'], [5, 1, 'n'], [6, 1, 'n'], [9, 0, 'G'], [9, 1, 'G'], ...vline(9, 2, 10, 'q')] },
  leader: { head: 'K', extra: [[9, 1, 'F'], [9, 2, 'f'], ...vline(9, 3, 10, 'q'), [4, 7, 'F'], [5, 7, 'F']] },
  king: { head: 'F', extra: [[4, 1, 'F'], [6, 1, 'F'], [5, 1, 'R'], ...vline(1, 5, 9, 'R'), ...vline(9, 5, 9, 'r'), [4, 7, 'F'], [5, 7, 'F'], [6, 7, 'F']] },
};

/** Idosos: cabelo grisalho e bengala. */
const ELDER: RoleLook = { head: 'G', extra: [...vline(9, 6, 10, 'q'), [8, 6, 'q']] };

/** Crianças: corpo menor (7x6), sem ferramenta. */
const CHILDREN: Record<'human' | 'alien', string[]> = {
  human: ['..KKK..', '..KSK..', '.SMMmS.', '..MMm..', '..B.B..', '..D.D..'],
  alien: ['..$$$..', '.$E$E$.', '.$MMm$.', '..MMm..', '..%.%..', '..%.%..'],
};

function composeRole(body: 'human' | 'alien', role: Role | 'elder'): string[] {
  const look = role === 'elder' ? ELDER : LOOKS[role];
  const grid = Array.from({ length: 11 }, () => Array<string>(11).fill('.'));
  BODIES[body].forEach((row, y) => {
    [...row].forEach((ch, x) => {
      let c = ch;
      if (c === 'H') c = body === 'alien' && look.head === 'K' ? '$' : look.head;
      if (look.armor && y >= 3 && y <= 5 && (x === 1 || x === 2)) c = c === '.' ? c : 'G';
      if (look.armor && y >= 3 && y <= 5 && (x === 4 || x === 5) && c !== '.') c = 'g';
      if (look.apron && y >= 4 && y <= 6 && x >= 2 && x <= 4 && c !== '.') c = 'p';
      if (c !== '.') grid[y + 2][x + 2] = c;
    });
  });
  for (const [x, y, c] of look.extra) grid[y][x] = c;
  return grid.map((r) => r.join(''));
}

// Variações de construção -----------------------------------------------------

const flip = (rows: string[]) => rows.map((r) => [...r].reverse().join(''));
const swap = (rows: string[], map: Record<string, string>) => rows.map((r) => [...r].map((c) => map[c] ?? c).join(''));

/** Variações das casas: espelhada e com outro material de parede. */
const WALLS: Record<string, Record<string, string>> = {
  hut: { A: 'P', a: 'p' },
  cottage: { P: 'A', p: 'a', q: 'a' },
  house: { W: 'P', w: 'p' },
  stoneHouse: { G: 'Y', g: 'y', n: 'u' },
  townhouse: { X: 'G', x: 'g' },
};

export const HOUSE_VARIANTS = 4;

/** Todos os sprites: a arte base, as profissões e as variações das casas. */
export const SPRITES: Record<string, string[]> = { ...ART };
for (const body of ['human', 'alien'] as const) {
  for (const role of ROLES) SPRITES[`${body}:${role}`] = composeRole(body, role);
  SPRITES[`${body}:elder`] = composeRole(body, 'elder');
  SPRITES[`${body}:child`] = CHILDREN[body];
}
/** Barcos e o tubarão também viram para a esquerda (`nome:l`). */
for (const name of ['canoe', 'rowboat', 'sailboat', 'caravel', 'steamship', 'shark'] as const) SPRITES[`${name}:l`] = flip(ART[name]);
for (const [name, walls] of Object.entries(WALLS)) {
  const base = ART[name as keyof typeof ART];
  SPRITES[`${name}:1`] = flip(base);
  SPRITES[`${name}:2`] = swap(base, walls);
  SPRITES[`${name}:3`] = flip(swap(base, walls));
}

export type SpriteName = string;
