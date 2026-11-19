/**
 * Animais em pixel art escrita como texto (docs/ARTE-ANIMAIS.md), no padrão do lobo: de lado, virados para a direita,
 * sem contorno, dorso escuro e barriga clara, patas finas (as do fundo mais escuras), na mesma escala da pessoa.
 *
 * Só o desenho parado é escrito à mão; os quadros (parado, andando, comendo, dano e morte) saem dele, então um bicho
 * novo feito no molde de um parente já nasce animado. Letras: `D` dorso, `A` base, `a` sombra e patas do fundo,
 * `B` barriga e garganta, `K` cascos, patas e detalhes escuros, `E` olho; as outras são da espécie.
 */

type Grid = string[];
interface Art {
  pal: Record<string, string>;
  rows: Grid;
}

/** Os 37 bichos da Terra, por família (o molde de cada uma está em docs/ARTE-ANIMAIS.md). */
export const ANIMAL_ART: Record<string, Art> = {
  // Lobo
  wolf: {
    pal: { A: '#a8a8ac', B: '#cfcfd2', D: '#7e7a7e', E: '#1a1412', K: '#4e4a4e', N: '#141214', a: '#8e8e94' },
    rows: [
      '...................K....',
      '..................AK....',
      '.................AAAA...',
      '.................AAAEA..',
      '................DAAAAAAN',
      '...............DAAAAB...',
      '.......DDDDDDDDDAAAB....',
      '.....DDDDADDADDAAAAB....',
      '...DDAAAAAAAAAAAAAAB....',
      '..DDDAAAAAAAAAAAAAA.....',
      '.DDDAAAAAAAAAAAAAAa.....',
      'DDDAB.AAAAAaaaaaAAa.....',
      'DDAB..AAAAa....aaA......',
      'DAB...AAa.......aA......',
      'BB....A.a.......a.A.....',
      '......A.a.......a.A.....',
      '......A.a.......a.A.....',
      '......A.a.......a.A.....',
    ],
  },
  // Raposa
  fox: {
    pal: { A: '#e0662a', B: '#f4eee4', D: '#b8481a', E: '#1a1412', K: '#2e1e16', N: '#140e0c', a: '#c4561f' },
    rows: [
      '...............K.K...',
      '...............AAA...',
      '..............AAAEA..',
      '.............DAAAABBN',
      '............DAAAAB...',
      '......DDDDDDAAAB.....',
      '....DDDAAAAAAAAB.....',
      '.DDDDAAAAAAAAAA......',
      'DDDAAAAAAAAAAAa......',
      'DDAB..AAaaaaaAa......',
      'BBB...K.K....K.K.....',
      '......K.K....K.K.....',
    ],
  },
  // Hiena
  hyena: {
    pal: { A: '#c4a878', B: '#e4d6b8', D: '#5e4a34', E: '#1a1412', K: '#2a2018', S: '#6a5638', a: '#a88c60' },
    rows: [
      '..............K.K...',
      '..............AAA...',
      '...........DDAAAEA..',
      '.........DDDAAAAAAAK',
      '.......DDDAAAAAAB...',
      '.....DDAAAASAAAB....',
      '...DDAASAAAAASAA....',
      '..DAAAAAAASAAAAA....',
      '.DSAAASAAAAAAAAa....',
      'D.AAAAAAaaaaaAAa....',
      '..AAa.a.....a.A.....',
      '..A..a......a.A.....',
      '..A..a......a.A.....',
      '..K..K......K.K.....',
    ],
  },
  // Onça
  jaguar: {
    pal: { A: '#dca04a', B: '#f2e4c4', D: '#b87e30', E: '#1a1412', K: '#2a1c10', S: '#3a2818', a: '#c08a38' },
    rows: [
      '................K.K...',
      '...............AAAA...',
      '..............AAAAEA..',
      '..........DDDDAAAAABBK',
      '....DDDDDDDSDDDAAAB...',
      '..DDAASAAAAAASAAAB....',
      '.DAAAAAASAASAAAAAA....',
      'D.AASAAAAAAAAASAAa....',
      'D..aBBBBBBBBBBBaa.....',
      '...A.a.......a.A......',
      '...A.a.......a.A......',
      '...K.K.......K.K......',
    ],
  },
  // Leão
  lion: {
    pal: { A: '#d6aa5e', B: '#f0dcb0', D: '#b88a44', E: '#1a1412', K: '#4a3018', M: '#9a5622', N: '#2a1a10', a: '#bf944c' },
    rows: [
      '..................MMM..',
      '................MMMMMM.',
      '...............MMMAAAA.',
      '...............MMAAAEA.',
      '..............MMMAAAAAN',
      '..............MMMAAAB..',
      '........DDDDDDMMMMBB...',
      '......DDDDDDDDMMMMM....',
      '....DDAAAAAAAAMMMMA....',
      '...DAAAAAAAAAAAMMAA....',
      '..D.AAAAAAAAAAAAAAa....',
      '.D..AAAAAAaaaaaAAa.....',
      '.D..AAAAa.....aaA......',
      'MM..AAa.......a.A......',
      'MM..A.a.......a.A......',
      '....A.a.......a.A......',
      '....A.a.......a.A......',
      '....K.K.......K.K......',
    ],
  },
  // Cervo
  deer: {
    pal: { A: '#8e5c36', B: '#f0ead8', D: '#6e4426', E: '#1a1412', N: '#3a2416', T: '#e8d8bc', a: '#76492a', t: '#c8b494' },
    rows: [
      '...........T.T.T...',
      '............TTT.T..',
      '.............TtT...',
      '..............t....',
      '.............AAA...',
      '.............AAEA..',
      '.............AAAAAN',
      '.............AAA...',
      '............DAAB...',
      '............DAAB...',
      '.B.........DAAAB...',
      'BADDDDDDDDDDAAAB...',
      '.AAAAAAAAAAAAAA....',
      '.AAAAAAAAAAAAAa....',
      '.AAAAaBBBBBBAAa....',
      '.Aa.a......a.A.....',
      '.A..a......a.A.....',
      '.A..a......a.A.....',
      '.A..a......a.A.....',
      '.N..N......N.N.....',
    ],
  },
  // Rena
  reindeer: {
    pal: { A: '#86705a', B: '#efe9de', D: '#5e4a3a', E: '#1a1412', N: '#2a201a', T: '#e2d4b2', a: '#6e5a48', t: '#c4b28c' },
    rows: [
      '.........T..T.T.T..',
      '..........T.TTT.T..',
      '..........TT.T.TT..',
      '...........TTTTT...',
      '.............tt....',
      '.............AAA...',
      '.............AAEA..',
      '.............AAAAAN',
      '............BBAA...',
      '............BBBB...',
      '.B.........DBBBB...',
      'BADDDDDDDDDDAABB...',
      '.AAAAAAAAAAAAAA....',
      '.AAAAAAAAAAAAAa....',
      '.AAAAaBBBBBBAAa....',
      '.Aa.a......a.A.....',
      '.A..a......a.A.....',
      '.A..a......a.A.....',
      '.N..N......N.N.....',
    ],
  },
  // Íbex
  ibex: {
    pal: { A: '#a8875e', B: '#ece2cc', D: '#7a6040', E: '#1a1412', H: '#6e5a42', K: '#2e241c', a: '#8e7250', h: '#56462f' },
    rows: [
      '.........HHHH....',
      '........H....H...',
      '........H.....H..',
      '.........h...AAK.',
      '.............AEA.',
      '............AAAAK',
      '...........DAAB..',
      '.D.........DAAB..',
      'DADDDDDDDDDAAAB..',
      '.AAAAAAAAAAAAA...',
      '.AAAAAAAAAAAAa...',
      '.AAAaBBBBBBAa....',
      '.A.a......a.A....',
      '.A.a......a.A....',
      '.A.a......a.A....',
      '.K.K......K.K....',
    ],
  },
  // Cabra
  goat: {
    pal: { A: '#e2d6be', B: '#b8aa90', D: '#c4b69a', E: '#1a1412', H: '#8a7a62', K: '#3a3028', a: '#cabea4' },
    rows: [
      '..........HH....',
      '.........H..AK..',
      '............AEA.',
      '............AAAK',
      '...........DAAB.',
      'D..........DAA.B',
      'DDDDDDDDDDDAAA..',
      '.AAAAAAAAAAAA...',
      '.AAAAAAAAAAAa...',
      '.AAAaaaaaaAAa...',
      '.A.a.....a.A....',
      '.A.a.....a.A....',
      '.A.a.....a.A....',
      '.K.K.....K.K....',
    ],
  },
  // Lhama
  llama: {
    pal: { A: '#efe2c6', D: '#d8c8a4', E: '#1a1412', K: '#6a5a48', a: '#d0c0a0' },
    rows: [
      '.........K.K..',
      '.........AAA..',
      '.........AAEA.',
      '.........AAAAK',
      '.........DAA..',
      '.........DAA..',
      '.........DAA..',
      '.........DAA..',
      '.........DAA..',
      'D........DAA..',
      'DDDDDDDDDDAA..',
      'AAAAAAAAAAAA..',
      'AAAAAAAAAAAa..',
      '.AAAaaaaaaAa..',
      '.A.a.....a.A..',
      '.A.a.....a.A..',
      '.A.a.....a.A..',
      '.A.a.....a.A..',
      '.A.a.....a.A..',
      '.A.a.....a.A..',
      '.K.K.....K.K..',
    ],
  },
  // Camelo
  camel: {
    pal: { A: '#d2a86a', B: '#ecd8b0', D: '#b88c50', E: '#1a1412', K: '#3a2c1e', a: '#b89058' },
    rows: [
      '..................K...',
      '.................AAAA.',
      '.................AAEAA',
      '.................AAAAK',
      '........DDD.....DAAB..',
      '......DDAAADD...DAB...',
      '.....DAAAAAAAD.DAAB...',
      '....DAAAAAAAAADAAB....',
      '..DDAAAAAAAAAAAAAB....',
      '.DAAAAAAAAAAAAAAA.....',
      'D.AAAAAAAAAAAAAAa.....',
      'D.aAAAAaaaaaaAAa......',
      '..A.a........a.A......',
      '..A.a........a.A......',
      '..A.a........a.A......',
      '..A.a........a.A......',
      '..A.a........a.A......',
      '..A.a........a.A......',
      '..K.K........K.K......',
    ],
  },
  // Cavalo
  horse: {
    pal: { A: '#a8693a', D: '#8a522c', E: '#1a1412', K: '#3a2418', M: '#3a2418', N: '#2a1c14', S: '#f2eadc', a: '#8a5430', m: '#2a180e', n: '#2a1c14' },
    rows: [
      '.................K....',
      '................MAA...',
      '...............MAAAE..',
      '..............MMAAAAA.',
      '..............MAAAAAAn',
      '.............MAAA..aa.',
      '............MAAA......',
      '...........MAAAA......',
      '..M......DMAAAAA......',
      '.MMDDDDDDDAAAAAA......',
      '.MAAAAAAAAAAAAAA......',
      'MmAAAAAAAAAAAAAa......',
      'Mm.AAAAAAAAAAAAa......',
      'm..AAAaaaaaaAAa.......',
      'm..Aa.a.....a.A.......',
      '...A..a.....a.A.......',
      '...A..a.....a.A.......',
      '...A..a.....a.A.......',
      '...S..S.....S.S.......',
      '...N..N.....N.N.......',
    ],
  },
  // Burro
  donkey: {
    pal: { A: '#8e8478', B: '#dcd4c8', D: '#6e665e', E: '#1a1412', K: '#2a2622', M: '#3e3834', N: '#2a2622', a: '#787066' },
    rows: [
      '..............AA.A.',
      '..............AaAa.',
      '..............AAAa.',
      '.............MAAAA.',
      '.............MAAEA.',
      '............MAAAABB',
      '...........MAAA.BBN',
      '..........MAAA.....',
      '.K.......DMAAA.....',
      'KADDDDDDDDAAAA.....',
      '.AAAAAAAAAAAAA.....',
      '.AAAAAAAAAAAAa.....',
      '.AAAaBBBBBBAAa.....',
      '.A.a......a.A......',
      '.A.a......a.A......',
      '.A.a......a.A......',
      '.K.K......K.K......',
    ],
  },
  // Zebra
  zebra: {
    pal: { A: '#f4f2ec', E: '#1a1412', K: '#2a2628', N: '#2a2628', S: '#2a2628', a: '#d6d2ca', n: '#2a2628' },
    rows: [
      '.................K....',
      '................SAS...',
      '...............SAASE..',
      '..............SAASAAS.',
      '..............AAASAASn',
      '.............ASAA..aa.',
      '............ASAA......',
      '...........AASAA......',
      '..A......AAAASAA......',
      '.ASSAASAASAASAAS......',
      '.SASAASAASAASAAS......',
      'SAASAASAASAASAAa......',
      'AS.AASAASAASAASa......',
      'S..AASaaaaaaAAa.......',
      'A..AS.S.....S.S.......',
      '...A..a.....a.A.......',
      '...A..S.....S.A.......',
      '...A..a.....a.A.......',
      '...A..A.....A.A.......',
      '...N..N.....N.N.......',
    ],
  },
  // Vaca
  cow: {
    pal: { A: '#f2eee6', D: '#e2dccf', E: '#1a1412', K: '#3a3430', P: '#eaa6a0', a: '#d4cdc0', h: '#e8dcc0', n: '#8a5050', p: '#c47c78' },
    rows: [
      '...................h.h..',
      '..................KAAAK.',
      '....DDD......DD...AKAEA.',
      '...DAKKDDDDDDAAD..AKAAA.',
      '..DAKKKKAAAAAAAADAAAAAPP',
      'a.AAKKKKAAAAAKKKAAAAAPPn',
      'a.AAAKKAAAAAKKKKKAAAa...',
      'a.AAAAAAAAAAAKKKAAAa....',
      'K.aAAAAAAAAAAAAAAAa.....',
      '...aAAAAAAAAAAAAAa......',
      '...A.aaaaPPpaaaA.a......',
      '...A.a.........a.A......',
      '...A.a.........a.A......',
      '...K.K.........K.K......',
    ],
  },
  // Bisão
  bison: {
    pal: { A: '#7a5232', D: '#5e3c22', E: '#1a1412', K: '#1e140e', M: '#4a2e1a', a: '#64422a', h: '#e6dab8', m: '#3a2414' },
    rows: [
      '...........MMMMM.......',
      '.........MMMMMMMMM.....',
      '......MMMMMMMMMMMMM.h..',
      '..DDDDMMMMMMMMMMMMMMh..',
      '.DAAAAMMMMMMMMMMMMMMMh.',
      'DAAAAAAMMMMMMMMMMMMEMM.',
      'AAAAAAAMMMMMMMMMMMMMMMK',
      'AAAAAAAAMMMMMMMMMMMMMm.',
      'aAAAAAAAAMMMMMMMMMmmm..',
      '.aAAAAaaaaMMMMMMm.m....',
      '.aAA.a.....mmMMM.......',
      '..A..a......m.M........',
      '..A..a......m.M........',
      '..K..K......K.K........',
    ],
  },
  // Ovelha
  sheep: {
    pal: { A: '#ece6d8', E: '#1a1412', K: '#46403a', W: '#fffcf4', a: '#cdc5b4', k: '#2a2420', n: '#1e1816' },
    rows: [
      '....WW..WW.......',
      '..WWWAWWWAWW.....',
      '.WWAAaAAAaAAAKKk.',
      'WWAaAAAaAAAaKKKEK',
      'WAAAAaAAAaAAaKKKK',
      'AaAAAAAaAAAAakKKn',
      'aAAaAAAAAaAaa.k..',
      'aaAAAaAAAAAaa....',
      '.aaaaaaaaaaa.....',
      '..k.K....k.K.....',
      '..k.K....k.K.....',
      '..n.n....n.n.....',
    ],
  },
  // Urso
  bear: {
    pal: { A: '#7e5232', B: '#b08860', D: '#5e3c22', E: '#1a1412', K: '#3a2414', N: '#1a1210', a: '#6a4428' },
    rows: [
      '..........DDDD.........',
      '.....DDDDDDDDDDD.......',
      '...DDDAAAAAAAAADD.K.K..',
      '..DDAAAAAAAAAAAAADAAAA.',
      '.DDAAAAAAAAAAAAAAAAAEA.',
      '.DAAAAAAAAAAAAAAAAAABBB',
      'DAAAAAAAAAAAAAAAAAAABBN',
      'AAAAAAAAAAAAAAAAAAA....',
      'AAAAAAAAAAAAAAAAAa.....',
      'aAAAAAaaaaaaaaAAAa.....',
      '.aAAa.aa.....aaAA......',
      '.aAA..aa.....aaAA......',
      '.aAA..aa.....aaAA......',
      '.KKK..KK.....KKKK......',
    ],
  },
  // Javali
  boar: {
    pal: { A: '#6e5646', B: '#f2ead8', D: '#3a2a20', E: '#1a1412', K: '#2a1e18', P: '#b08070', a: '#5a4436' },
    rows: [
      '......D.D.D.D........',
      '....DDDDDDDDDDD.K....',
      '..DDDAAAAAAAAAADAA...',
      '.DDAAAAAAAAAAAAAAEA..',
      '.DAAAAAAAAAAAAAAAAAPP',
      'DAAAAAAAAAAAAAAAAAAPP',
      '.AAAAAAAAAAAAAAAAAB..',
      '.aAAAAAAAAAAAAAAAB...',
      '..aaAAaaaaaaaAAa.....',
      '...A.a.....a.A.......',
      '...A.a.....a.A.......',
      '...K.K.....K.K.......',
    ],
  },
  // Elefante
  elephant: {
    pal: { A: '#a2a2a8', D: '#86868e', E: '#1a1412', W: '#f4f0e6', a: '#86868e', e: '#76767e', s: '#d8d4ca' },
    rows: [
      '................DDDD....',
      '.....DDDDDDDDDDAAAAAD...',
      '...DDAAAAAAAAAeeeAAAAA..',
      '..DAAAAAAAAAAeeeeeAAEA..',
      '.DAAAAAAAAAAAeeeeeAAAAA.',
      '.AAAAAAAAAAAAeeeeeAAAAA.',
      'AAAAAAAAAAAAAeeeeeAAWAA.',
      'AAAAAAAAAAAAAAeeeaAW.AA.',
      'aAAAAAAAAAAAAAAeeaA...AA',
      '.AAAAAAAAAAAAAAAaa....AA',
      '.aAAAaaaaaaaaaAAa.....Aa',
      '..AA.aa......aaAA.....aa',
      '..AA.aa......aaAA....aa.',
      '..AA.aa......aaAA.......',
      '..ss.ss......ssss.......',
    ],
  },
  // Mamute
  mammoth: {
    pal: { A: '#7a4e2e', D: '#5e3a20', E: '#1a1412', M: '#5a361c', W: '#f2eadc', a: '#64401f', s: '#3a2414' },
    rows: [
      '..............DDDD......',
      '...........DDDAAAAD.....',
      '.....DDDDDDAAAAAAAAA....',
      '...DDAAAAAAAAAAAAAAEA...',
      '..DAAAAAAAAAAAAAAAAAAA..',
      '.DAAAAAAAAAAAAAAAAAaAAA.',
      '.AAAAAAAAAAAAAAAAAa.AAW.',
      'DAAAAAAAAAAAAAAAAAa.AA.W',
      'aAAAAAAAAAAAAAAAAa..AA.W',
      '.AMAMAMAMAMAMAMAa...Aa.W',
      '.aMaMaMaMaMaMaMAa...aaWW',
      '..AA.aa......aaAA..a.WW.',
      '..AA.aa......aaAA.......',
      '..ss.ss......ssss.......',
    ],
  },
  // Coelho
  rabbit: {
    pal: { A: '#b8a088', B: '#f2ece0', D: '#8e7860', E: '#1a1412', K: '#3a2a22', P: '#e8a8a8', a: '#9c866e' },
    rows: [
      '.......Da...',
      '.......DPa..',
      '.......DPa..',
      '........DAa.',
      '.......DAAAA',
      '......DAAAEA',
      '..DDDDAAAAAK',
      '.DAAAAAAAAB.',
      'BAAAAAAAABB.',
      'BaAAAAaAaB..',
      '.aaa.aa.BB..',
    ],
  },
  // Macaco
  monkey: {
    pal: { A: '#7a5232', D: '#5e3e24', E: '#1a1412', F: '#e0b890', K: '#2a1c14', a: '#684428' },
    rows: [
      '.....DDDD..',
      '....DAAFFF.',
      '....DAFEFF.',
      '....DAFFFFK',
      '.....AAFF..',
      '...DDAAAA..',
      '..DAAAAAAF.',
      '..AAAAAAa..',
      'D.AAAAAa...',
      'D.aAAAAa...',
      '.D.A..A....',
      '..DA..a....',
      '...A..a....',
      '...K..K....',
    ],
  },
  // Galinha
  chicken: {
    pal: { A: '#ebe5d6', E: '#1a1412', H: '#fdfaf2', R: '#de4a34', Y: '#eeaa32', a: '#c9c0ad', r: '#a8301f', y: '#c07e1a' },
    rows: [
      '......R.R.',
      '.....RRRR.',
      '.....HAAA.',
      '.....HAEAY',
      '.....AAAAy',
      'H....HAAr.',
      'AH...HAAr.',
      'AAHHHAAAa.',
      'aAAAAAaAa.',
      '.aAAAaaaa.',
      '..aaaaaa..',
      '....Y.Y...',
      '...YY.YY..',
    ],
  },
  // Abutre
  vulture: {
    pal: { A: '#4a3a34', B: '#f0e8dc', E: '#1a1412', P: '#e0a8a0', Y: '#d8b060', a: '#2e2420' },
    rows: [
      '.........PP..',
      '........PPEP.',
      '........PPPYY',
      '.......BBBP..',
      '..AAAAABBBB..',
      '.AAAAAAAAAA..',
      'AAAAAAAAAAA..',
      'aAaAAAAAAAa..',
      '.a.aaaaaAa...',
      '.....a.a.....',
      '.....Y.Y.....',
    ],
  },
  // Pinguim
  penguin: {
    pal: { A: '#2c3038', B: '#f2eee6', E: '#1a1412', Y: '#f0a030', a: '#1a1c22', b: '#c8c4bc' },
    rows: [
      '..AAA..',
      '.AAAEA.',
      '.AABBYY',
      'AABBB..',
      'AABBBa.',
      'aABBBa.',
      '.ABBba.',
      '.aBbba.',
      '..Y.Y..',
    ],
  },
  // Crocodilo
  crocodile: {
    pal: { A: '#5e7c3e', B: '#c8c088', D: '#46602e', E: '#1a1412', W: '#f2eee2', a: '#4c6632' },
    rows: [
      '............D.D.D.D.E...',
      '.......D.D.DDDDDDDDAAA..',
      '...DDDDDDDDDAAAAAAAAAAAA',
      'DDDAAAAAAAAAAAAAAAAWAWAA',
      '..aaaaBBBBBBBBBBaaaaaaa.',
      '.......Aa....Aa.........',
    ],
  },
  // Tartaruga
  turtle: {
    pal: { A: '#b0a868', E: '#1a1412', G: '#a8c070', H: '#7a9a48', a: '#807848', h: '#506c2e' },
    rows: [
      '..HHHHH.....',
      '.HGHHGHH....',
      'HGHHGHHhh.AA',
      'hhhhhhhhhAAE',
      '.Aa...Aa..a.',
    ],
  },
  // Cobra
  snake: {
    pal: { A: '#7aa840', E: '#1a1412', R: '#d03030', a: '#4c7428' },
    rows: [
      '..........AAA..',
      '..........AAEA.',
      '.AAAA....AAaaAR',
      'AAaaAA..AAa....',
      'Aa..aAAAAa.....',
      '.....aaaa......',
    ],
  },
  // Sapo
  frog: {
    pal: { A: '#6aa040', B: '#d8d890', E: '#1a1412', N: '#2a3a1a', a: '#46762a' },
    rows: [
      '......AE..',
      '.....AAAA.',
      '..AAAAAAAN',
      '.AAAAAAABB',
      'AAaAAAaaB.',
      'aa.aa.aa..',
    ],
  },
  // Besouro
  beetle: {
    pal: { A: '#4a7a58', H: '#9ac8a8', N: '#201a18', a: '#2c4c38' },
    rows: [
      '..AAAA...',
      '.AHHAAAN.',
      'AHAAAAaNN',
      'AAAAAAaa.',
      '.aaaaaa..',
      '.N.N.N...',
    ],
  },
  // Caranguejo
  crab: {
    pal: { A: '#dc6a3c', B: '#f0a070', E: '#1a1412', a: '#a04628' },
    rows: [
      'A.........A',
      'AA..E.E..aA',
      '.AAAAAAAAa.',
      '..AABAAAa..',
      '..aaaaaaa..',
      '.a.a...a.a.',
    ],
  },
  // Baleia
  whale: {
    pal: { A: '#4a6a8a', B: '#c8d4dc', D: '#34506c', E: '#1a1412', a: '#3c5874', b: '#a8b6c0' },
    rows: [
      '................D.......',
      '............DDDDDDDDD...',
      '.........DDDDAAAAAAAAAD.',
      'A.....DDDAAAAAAAAAAAAAAD',
      'AA..DDAAAAAAAAAAAAAAEAAA',
      '.AAAAAAAAAAAAAAAAAAAAAAa',
      'AA..aaBBBBBBBBBBBBBBBBa.',
      'A......aaBBbBbBbBbBba...',
      '...........aa...........',
    ],
  },
  // Piranha
  piranha: {
    pal: { A: '#8a96a0', E: '#1a1412', R: '#d84a38', W: '#f2eee2', a: '#5e6a74' },
    rows: [
      '....AAA...',
      'A..AAAAAA.',
      'AAAAAAAAEA',
      'AAAARRRRAW',
      'A..aRRRRW.',
      '....aaa...',
    ],
  },
  // Tartaruga marinha
  seaTurtle: {
    pal: { A: '#c8b880', E: '#1a1412', G: '#8ab890', H: '#5a8a6a', a: '#988850', h: '#3a6248' },
    rows: [
      '.....AA.......',
      '...HHHHHH.....',
      '..HGHHGHHHh.AA',
      'AHHHHGHHHhhAAE',
      '..hhhhhhhhh.AA',
      '...aa...aa....',
    ],
  },
  // Lula
  squid: {
    pal: { A: '#d88a9a', E: '#1a1412', a: '#a85e6e' },
    rows: [
      '..A.A.........AA..',
      '.A.A.A.......AAAA.',
      'AAAAAAAAAAAAAAAAAA',
      'A.A.AAAAAAAEAAAAa.',
      '.A.A.aaaaaaaaaaa..',
      '..A.A........aa...',
    ],
  },
  // Carcaça
  carcass: {
    pal: { R: '#8a3a2e', W: '#ece4d4', w: '#b8ae9a' },
    rows: [
      '..W.W.W.W....',
      '.WRWRWRWRW.WW',
      'WWWWWWWWWWWWW',
      '.w.w.w.w.wWW.',
    ],
  },
};

/** Patas grossas, a de perto encostada na do fundo: as colunas de cada pata, de trás para a frente. */
const LEGS: Record<string, [number, number][]> = {
  bear: [[1, 3], [6, 7], [13, 14], [15, 16]],
  elephant: [[2, 3], [5, 6], [13, 14], [15, 16]],
  mammoth: [[2, 3], [5, 6], [13, 14], [15, 16]],
};
/** Nadam mexendo a cauda. */
const SWIM = new Set(['whale', 'piranha', 'squid', 'seaTurtle']);
/** Rasteja ondulando. */
const CRAWL = new Set(['snake']);
/** O que sobra de um bicho morto: não anda, não toma dano e não morre. */
const STILL = new Set(['carcass']);

type Run = [number, number];

function runs(row: string): Run[] {
  const out: Run[] = [];
  let x = 0;
  while (x < row.length) {
    if (row[x] === '.') {
      x++;
      continue;
    }
    const s = x;
    while (x < row.length && row[x] !== '.') x++;
    out.push([s, x - 1]);
  }
  return out;
}

/** Primeira linha das patas: de baixo para cima, enquanto a linha só tem trechos curtos (patas) e mais de um. */
function legTop(rows: Grid): number {
  let y = rows.length - 1;
  while (y > 0) {
    const r = runs(rows[y]);
    if (r.length < 2 || Math.max(...r.map(([s, e]) => e - s + 1)) > 4) break;
    y--;
  }
  return y + 1;
}

function legsOf(rows: Grid, name: string): { top: number; legs: Run[] } {
  const top = legTop(rows);
  if (LEGS[name]) return { top, legs: LEGS[name] };
  return { top, legs: top >= rows.length ? [] : runs(rows[rows.length - 1]) };
}

/** Move os pixels que passam no teste por (dx, dy), por cima dos outros. */
function shift(rows: Grid, test: (x: number, y: number) => boolean, dx: number, dy: number): Grid {
  const h = rows.length;
  const w = rows[0].length;
  const out = rows.map((r) => [...r]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rows[y][x] !== '.' && test(x, y)) out[y][x] = '.';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rows[y][x] === '.' || !test(x, y)) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) out[ny][nx] = rows[y][x];
    }
  }
  return out.map((r) => r.join(''));
}

/** O corpo desce 1 pixel (respira ou pisa); as patas ficam. */
const bob = (rows: Grid, top: number) => shift(rows, (_, y) => y < top, 0, 1);

/** Um passo: as patas de `fwd` vão à frente com o pé no ar, as de `back` ficam para trás. */
function step(rows: Grid, top: number, fwd: Run[], back: Run[]): Grid {
  const mid = top + Math.floor((rows.length - top) / 2);
  const inLeg = (legs: Run[], x: number) => legs.some(([s, e]) => x >= s && x <= e);
  const a = shift(rows, (x, y) => y >= mid && inLeg(fwd, x), 1, -1);
  return shift(a, (x, y) => y >= mid && inLeg(back, x), -1, 0);
}

/** A cabeça desce e o pescoço dobra: cada coluna da frente desce um pouco mais que a de trás, até `down`. */
function bend(rows: Grid, top: number, down: number): Grid {
  const w = rows[0].length;
  const hx = Math.floor(w * 0.6);
  const out = rows.map((r) => [...r]);
  for (let x = hx; x < w; x++) {
    const dy = Math.min(down, x - hx + 1);
    for (let y = 0; y < top; y++) out[y][x] = '.';
    for (let y = top - 1; y >= 0; y--) if (rows[y][x] !== '.' && y + dy < rows.length) out[y + dy][x] = rows[y][x];
  }
  return out.map((r) => r.join(''));
}

/** Silhueta numa cor só (`#` vermelho do dano, `&` preto da morte). */
const silhouette = (rows: Grid, ch: string) => rows.map((r) => r.replace(/[^.]/g, ch));

/** Morto: uma elipse preta deitada no chão, do comprimento do corpo. */
function lying(rows: Grid): Grid {
  const h = rows.length;
  const w = rows[0].length;
  let x0 = w;
  let x1 = 0;
  for (const r of rows) for (let x = 0; x < w; x++) if (r[x] !== '.') { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  const span = x1 - x0 + 1;
  const tall = Math.max(2, Math.min(5, Math.floor(span / 4)));
  const cx = (x0 + x1 + 1) / 2;
  const rx = span * 0.42;
  const ry = tall / 2;
  const g = rows.map(() => Array<string>(w).fill('.'));
  for (let k = 0; k < tall; k++) {
    const d = (k + 0.5 - ry) / ry;
    const half = rx * Math.sqrt(Math.max(0, 1 - d * d));
    for (let x = 0; x < w; x++) if (Math.abs(x + 0.5 - cx) <= half) g[h - tall + k][x] = '&';
  }
  return g.map((r) => r.join(''));
}

/** Quadros de um bicho: nomes de sprite. `rows` é a altura do desenho, para a escala da pessoa. */
export interface AnimalFrames {
  idle: string[];
  walk: string[];
  eat: string[];
  hit: string;
  dead: string;
  fallen: string;
  rows: number;
}

/** Todos os quadros dos bichos (`an:bicho:n|x:quadro`, `x` com a cor da espécie alienígena). */
export const ANIMAL_SPRITES: Record<string, Grid> = {};
export const ANIMAL_PALETTES: Record<string, Record<string, string>> = {};
/** Quadros por desenho: [da Terra, alienígena]. */
export const ANIMAL_FRAMES: Record<string, [AnimalFrames, AnimalFrames]> = {};

/** Cores comuns: a do dano, a da morte e as marcas da cor da espécie (resolvidas pela cor no shader). */
const COMMON = { '#': '#e03028', '&': '#18141c', '1': '#ff00ff', '2': '#800080', '3': '#ff80ff' };
/** Nos alienígenas, o corpo leva a cor da espécie: base, dorso e sombra escurecidos, barriga clara. */
const ALIEN: Record<string, string> = { A: '1', D: '2', a: '2', B: '3' };

for (const [name, art] of Object.entries(ANIMAL_ART)) {
  const rows = ['.'.repeat(art.rows[0].length), ...art.rows];
  const { top, legs } = legsOf(rows, name);
  const pose: Record<string, Grid> = { base: rows };
  if (SWIM.has(name)) {
    const tail = Math.floor(rows[0].length * 0.35);
    pose.up = shift(rows, (x) => x < tail, 0, -1);
    pose.down = shift(rows, (x) => x < tail, 0, 1);
  } else if (CRAWL.has(name)) {
    const half = Math.floor(rows[0].length / 2);
    pose.up = shift(rows, (x) => x < half, 0, -1);
    pose.down = shift(rows, (x) => x < half, 0, 1);
  } else if (!STILL.has(name)) {
    pose.bob = bob(rows, top);
    const L = [...legs].sort((p, q) => p[0] - q[0]);
    // Trote: a de trás de perto com a da frente do fundo, e o outro par; aves alternam os dois pés.
    const [p1, p2] = L.length >= 4 ? [[L[1], L[2]], [L[0], L[3]]] : L.length >= 2 ? [[L[0]], [L[L.length - 1]]] : [[], []];
    pose.stepA = step(rows, top, p1, p2);
    pose.stepB = step(rows, top, p2, p1);
    pose.eat1 = bend(rows, top, 1);
    pose.eat2 = bend(rows, top, 2);
  }
  const variants = (['n', 'x'] as const).map((v) => {
    const key = (f: string) => `an:${name}:${v}:${f}`;
    const pal = { ...COMMON, ...art.pal };
    const add = (f: string, g: Grid, recolor = true) => {
      ANIMAL_SPRITES[key(f)] = v === 'x' && recolor ? g.map((r) => [...r].map((c) => ALIEN[c] ?? c).join('')) : g;
      ANIMAL_PALETTES[key(f)] = pal;
      return key(f);
    };
    const names: Record<string, string> = {};
    for (const [f, g] of Object.entries(pose)) names[f] = add(f, g);
    const b = names.base;
    const frames: AnimalFrames = {
      idle: names.bob ? [b, names.bob] : names.up ? [names.up, names.down] : [b, b],
      walk: names.stepA ? [names.stepA, names.bob, names.stepB, names.bob] : names.up ? [names.up, b, names.down, b] : [b, b, b, b],
      eat: names.eat1 ? [names.eat1, names.eat2] : [b, b],
      hit: STILL.has(name) ? b : add('hit', silhouette(rows, '#'), false),
      dead: STILL.has(name) ? b : add('dead', silhouette(rows, '&'), false),
      fallen: STILL.has(name) ? b : add('fallen', lying(rows), false),
      rows: rows.length,
    };
    return frames;
  });
  ANIMAL_FRAMES[name] = [variants[0], variants[1]];
}
