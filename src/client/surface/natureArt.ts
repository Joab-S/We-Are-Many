import { Biome } from '../../procgen/biomes';
import { Decor, tileHash, type SurfaceMap } from '../../procgen/surface';

/**
 * Natureza no padrão dos bichos e das pessoas (docs/ARTE-NATUREZA.md): sem
 * contorno, 4 a 5 tons, luz de cima à esquerda, na escala da pessoa (um
 * pixel do desenho vale um pixel da pessoa de 18 linhas, 1/12 de tile).
 * Árvores têm de 2 a 3 tiles de altura e cobrem o que passa atrás delas.
 *
 * Tons das copas: `O` sombra mais funda, `D` sombra, `A` base, `L` luz,
 * `H` brilho. Casca: `T` clara, `t` base, `U` escura. Pedras: `h` brilho,
 * `R` topo, `G` frente, `g` sombra, `n` junta. No veio, `1`, `2` e `3` são
 * as marcas da cor do minério (resolvidas pela cor, como as da espécie).
 */
interface Art {
  pal: Record<string, string>;
  rows: string[];
}

export const NATURE_ART: Record<string, Art> = {
  // Carvalho
  oak: {
    pal: { A: '#2f7a45', D: '#265a3a', H: '#6cb85e', L: '#43984f', O: '#1d3b2c', T: '#8a6040', U: '#4a2c1a', t: '#6a4428' },
    rows: [
      '...........LHH...........',
      '........LHHLLLLD.........',
      '........LLLLLLAL.........',
      '......HHLLLLADALDD.......',
      '......LLALAAAAAADL.HH....',
      '......LLAAAAAAALLLLLLLD..',
      '.....HHHLAAAADHHLLLLLLLD.',
      '.L.LLLLLLDDAAHLLLLLAADLDA',
      '..LLLLLLLLDADHLLLAAAAADDD',
      'LHLLLAAAAADDDHLLAAAAAAADA',
      'HLLAAAAAHHLLDHLAAAAAAADDD',
      '.LAAAAHLLLLLLDLDAAAADDDDD',
      'ALAAALHLLLLLLLDAHLLHDDDD.',
      '.DAALLLLLLAAALHHHLLLLDDO.',
      '.D.DLLLLAAAAAHLLLLLLLDD..',
      '...OLLLAAAAAAHLLLDAAAD...',
      '....HLAAAAAAAHLAAAADAAD..',
      '....LLAAAAADDHLAAAAADDD..',
      '....DLAAAADDDLLAAAADDDD..',
      '.....DDAADDDDDDDADDDDDO..',
      '......DDDDDDOOD.DDDDOO...',
      '........O.OOOU..OOOO.....',
      '...........TtU...........',
      '...........TUU...........',
      '...........TtU...........',
      '...........TtU...........',
      '...........TtU...........',
      '...........TtU...........',
      '...........TtU...........',
      '...........TtU...........',
      '..........tTtUU..........',
    ],
  },
  // Árvore copada
  oak2: {
    pal: { A: '#2f7a45', D: '#265a3a', H: '#6cb85e', L: '#43984f', O: '#1d3b2c', T: '#8a6040', U: '#4a2c1a', t: '#6a4428' },
    rows: [
      '........H.H..........',
      '......HLHLLL.D.......',
      '......LLLLLLLLD......',
      '.....LLLLLADALD......',
      '....HLLLAAAAAADD.....',
      '.....LLAAADAAADA.....',
      '..HLHHHAAAAALLHLHL...',
      '.HLHLLLLDAHLLLLLLL.D.',
      'LHLLLLLLDDLLLLLALLL..',
      '.LLLAAAAHHHHLLAAAAAAD',
      'LLAAAAHLHLLLLDAAAAAD.',
      'LLAAALHLLLLLLLDAADDDD',
      'HLAAHLLLLLAAAADDADDDO',
      '.DAAHALLAAAAAADDDDD..',
      '..DDHLLAAAAAAADDDDOO.',
      '...OHLAAAAAADDADOO...',
      '....HLAAAAADDDDD.....',
      '....DLAAAADDDDDO.....',
      '.....DDAADDDDDO......',
      '......DODDDDD........',
      '........OOtO.........',
      '.........Ut..........',
      '.........Ut..........',
      '.........Ut..........',
      '.........Tt..........',
      '.........Tt..........',
      '.........Tt..........',
      '.........Tt..........',
      '.........TU..........',
      '........tTtU.........',
    ],
  },
  // Bétula
  birch: {
    pal: { A: '#2c7448', D: '#22573f', H: '#62b066', L: '#3f9354', O: '#1c3d33', T: '#ecebe2', U: '#3a3634', t: '#c9c6bc' },
    rows: [
      '.....LHLLH......',
      '.....LLLLALD....',
      '...HHLLLLLLDD...',
      '...HLLAAAAADDO..',
      '...LLAAAAAADD...',
      '...DLAAADDDD....',
      '..HHHHHDDDDO....',
      '.AHLLLLLLHHHLA..',
      '.HLLALLLHLLLLLD.',
      'HLLAAALLLLLLLLDA',
      '.AADAAHLLAAAAADA',
      'DLADADHAAAAAADDA',
      '.DDDLLHLHDADDDDO',
      '..DLHLLLLLDDDAO.',
      '..HHLLLLLLDDOO..',
      '..HLLAAAAAL.....',
      '...LAAAALLLL.D..',
      '..DLAAALLLLLLDD.',
      '...DDDDLLLLAADD.',
      '....DOOLLAAAADD.',
      '.......DDADDDDO.',
      '........DODDOO..',
      '........Tt.O....',
      '........Tt......',
      '........TU......',
      '........Tt......',
      '........TU......',
      '........Tt......',
      '........TU......',
      '........Tt......',
      '........Tt......',
      '.......tTtU.....',
    ],
  },
  // Árvore no outono
  autumn: {
    pal: { A: '#b8602a', D: '#8a3e1c', H: '#f0b452', L: '#d88a36', O: '#5a2a18', T: '#8a6040', U: '#4a2c1a', t: '#6a4428' },
    rows: [
      '........LLLHH.........',
      '.......HLHLLL.D.O.....',
      '......HLLLLLLLAD......',
      '......HLLLLAAALDD.....',
      '....D.LALAAAAAADA.....',
      '.....LLLAAAAAADD......',
      '...HLHHHAAAAAHHHHLL...',
      '..H.HLLLLDALLHLLLLL.A.',
      'D.LLLLLLLDDLLLLLLLLL..',
      '.LLLLAAAAHHHHLLAADAAD.',
      '.LLAAAAHHHALLLDAAAAADD',
      '.HLAAALALALLLLLDADDDDD',
      '.LLAALLLLLLAAALDDDDDDO',
      'DDDADHALLAAAAAADDDDDD.',
      '..DDDHLAAAADADADDDDOO.',
      '....OLLDAAAAAADDDOO...',
      '.....LLAAAAADDDD......',
      '.....DLAAAADDDDDO.....',
      '......DDAADDDDDD......',
      '.......DODDDD.........',
      '........OOOOO.........',
      '..........Tt..........',
      '..........Tt..........',
      '..........Tt..........',
      '..........Tt..........',
      '..........TU..........',
      '..........Tt..........',
      '..........Tt..........',
      '..........TU..........',
      '.........tTUU.........',
    ],
  },
  // Árvore da selva
  jungle: {
    pal: { A: '#226646', D: '#1a4a35', H: '#4fa362', L: '#2f8352', O: '#123128', T: '#8a6040', U: '#4a2c1a', t: '#6a4428' },
    rows: [
      '..........LHLHHLL............',
      '..........HHLLLLLDD..........',
      '........HHLLLLLLAL...........',
      '........HHLLLAAAAADD..L......',
      '....HH..LLLAAAAAAADD.AH.L....',
      '...LHLLLLDADAAAADDAH.HLLA.D..',
      '..HLLLLLLDDAAAADDDAHLLLLLLD..',
      '.HLLLAAAADDAAADDDDHLALAAAADDO',
      '.HLAAAAAHHHHDADDDLHHLAAAAADD.',
      '.LLAAALHHLLLLDOLALLLALDAADDD.',
      'D.LAAHHLLLLLLDHLLLLLLLDDDDDD.',
      '.DDAAHLLLAAAADLLLLADAADDDDDO.',
      '..DDDLLAAAAAADLLAAAAAAADAO...',
      '.....HAAAAAADDHLAAAAADDD.....',
      '.....HLAAAADDDHLAADADDDD.....',
      '......DAADDDDDDDAAADDDAOO....',
      '......DDDDDDOOtDDDDDD.O......',
      '.........OD..TtU.OOO.........',
      '.............TtU.............',
      '.............TUU.............',
      '.............TtU.............',
      '.............TtU.............',
      '.............TtU.............',
      '.............TtU.............',
      '.............TtU.............',
      '.............TtU.............',
      '.............TtU.............',
      '.............TtU.............',
      '.............TtU.............',
      '.............UtU.............',
      '.............UtU.............',
      '.............TtU.............',
      '.............TtU.............',
      '.............UtU.............',
      '.............TtU.............',
      '............tTtUU............',
    ],
  },
  // Acácia
  acacia: {
    pal: { A: '#748034', D: '#56602a', H: '#b4b858', L: '#929c42', O: '#3a4220', T: '#8a6040', U: '#4a2c1a', t: '#6a4428' },
    rows: [
      '.........H...............',
      '.DA...L.HH.HD.H.LL.......',
      '..LH.DLAHLLLD.HHLLL.DO...',
      '.LLLLLHALLLLDLLLLLLDD....',
      'HHLLLLLLLAAADLLLAAALLLAD.',
      '.LLAAALLAAADDHAAAALHLLDD.',
      'HLAAADDLAADDDDLDADHLLLDD.',
      'DLAADDD.DDDDO.DDDDHLAADD.',
      '..DDDDO.O.OO....OO.DDDDOO',
      '...OO.t........t.....O...',
      '.......t......t..........',
      '........t.Tt.t...........',
      '.........tTtt............',
      '..........Ut.............',
      '..........Tt.............',
      '..........Tt.............',
      '..........Ut.............',
      '..........Tt.............',
      '..........Tt.............',
      '..........Tt.............',
      '..........Tt.............',
      '..........Tt.............',
      '..........Tt.............',
      '..........Tt.............',
      '..........Tt.............',
      '.........tTtU............',
    ],
  },
  // Pinheiro
  pine: {
    pal: { A: '#235640', D: '#1a3f34', H: '#4a8a58', L: '#2f6e4a', O: '#122a26', T: '#8a6040', U: '#4a2c1a', t: '#6a4428' },
    rows: [
      '........HD.........',
      '........HD.........',
      '........LD.........',
      '.......LADD........',
      '.......LADO........',
      '.......HADO........',
      '......HAADDO.......',
      '......LAADDO.......',
      '......DDOOOOO......',
      '......LOOOOO.......',
      '......LAADDO.......',
      '.....HAAADDOO......',
      '.....LLAADDOO......',
      '....HAAAADDDOD.....',
      '....LLAALDDDOO.....',
      '...DDDDOOOOOOO.....',
      '.....LDOOOOOO......',
      '....HAAAADDADD.....',
      '....LLLAADAADO.....',
      '...HLLAAADDDODO....',
      '...LLAAALDDDDOD....',
      '..LLLAAAADDADOOO...',
      '.DDDDDDOOOOOOOOOO..',
      '....HDOOOOOOOO.....',
      '...LLLAAADDDDOO....',
      '..HLAAALADDDDDDO...',
      '..LALAAAADDDDOOO...',
      '.HLLLAAAADADDDOOO..',
      '.HLLLLAAADDDADDOO..',
      'LALAAAAAADADDDOODD.',
      'DDDDDDOOOOOOOOOOOOO',
      '........Tt.........',
      '........Tt.........',
      '........Ut.........',
      '........Tt.........',
      '........Tt.........',
    ],
  },
  // Pinheiro baixo
  pine2: {
    pal: { A: '#235640', D: '#1a3f34', H: '#4a8a58', L: '#2f6e4a', O: '#122a26', T: '#8a6040', t: '#6a4428' },
    rows: [
      '.......LA........',
      '.......HD........',
      '......HADO.......',
      '......HAAD.......',
      '......HADO.......',
      '.....HALDDO......',
      '.....LAADDD......',
      '....DDDOOOO......',
      '.....HOOOOO......',
      '....LAAADDDO.....',
      '....HLLADDOO.....',
      '...HLALADDDDD....',
      '...HLAAADDDOO....',
      '..DLLALADDDDOO...',
      '...DDDOOOOOOOO...',
      '....LOOOOOOO.....',
      '...HALLADDDOO....',
      '..HALAAADADDOD...',
      '..LLLAAAADDODD...',
      '.LALAAAADDDDDOO..',
      '.HLLLAAADDDDOOD..',
      'LLLLAAAADDDDOOOD.',
      'DDDDDOOOOOOOOOOOO',
      '.......Tt........',
      '.......Tt........',
      '.......Tt........',
      '.......Tt........',
    ],
  },
  // Pinheiro com neve
  snowpine: {
    pal: { A: '#235640', D: '#1a3f34', H: '#e8eef2', L: '#2f6e4a', O: '#122a26', T: '#8a6040', U: '#4a2c1a', t: '#6a4428' },
    rows: [
      '........HD.........',
      '........HA.........',
      '........LD.........',
      '.......HADD........',
      '.......LLDO........',
      '.......LADD........',
      '......HAADAO.......',
      '......LAADAO.......',
      '......DDOOOOO......',
      '......HHHHOO.......',
      '......LAADDO.......',
      '.....HLAADDOD......',
      '.....HLAADDOD......',
      '....HLAAADDDDD.....',
      '....HLAAADDAOO.....',
      '...HDDDOOOOOOO.....',
      '.....HHHHHOOO......',
      '....HLLAADDDOO.....',
      '....LAAAADDADD.....',
      '...HLAAAAAADODD....',
      '...HLAAAADDDDOD....',
      '..HLLALAADDDADOO...',
      '.HHDDDDOOOOOOOOOO..',
      '....HHHHHHOOOO.....',
      '...HLLAAAADDOOO....',
      '..HHLAAAADDADOOD...',
      '..LALALAADDDDDOD...',
      '.HLLLAAAADDDDODDO..',
      '.HLLAAAALDDADDOOD..',
      'HAALAAAAAADDDDOODO.',
      'DDDDDDOOOOOOOOOOOOO',
      '........Tt.........',
      '........Tt.........',
      '........Ut.........',
      '........Tt.........',
      '........Tt.........',
    ],
  },
  // Palmeira
  palm: {
    pal: { A: '#226646', D: '#1a4a35', H: '#4fa362', L: '#2f8352', O: '#123128', T: '#b08a58', U: '#5a4024', t: '#8a6a40' },
    rows: [
      '.........LH.AA.........',
      '...HHHHH.DH.AA.AAAAA...',
      '...LLLLLHHHHAAAAAAAA...',
      '.LLDDDDDLLLHAAAOOOOOAA.',
      '.DD...HHDDDLOOOAA...OO.',
      '....HHLLDDUUUOOAAAA....',
      '...HLLDD.LTUOA.OOAAA...',
      '..HLDD..HDTt.OA..OOAA..',
      '..LD....LDTU.OA....OA..',
      '.LD....LD..Tt.OA....OA.',
      'LD.....D...Tt..O.....OA',
      'D......D...TU..O......O',
      '...........Tt..........',
      '...........Tt..........',
      '...........TU..........',
      '...........Tt..........',
      '............Tt.........',
      '............TU.........',
      '............Tt.........',
      '............Tt.........',
      '............TU.........',
      '............Tt.........',
      '............Tt.........',
      '............TU.........',
      '............Tt.........',
      '............Tt.........',
      '............TU.........',
      '............Tt.........',
    ],
  },
  // Árvore seca
  deadtree: {
    pal: { T: '#9a8268', U: '#4a3c30', t: '#6e5a46' },
    rows: [
      '.....t......',
      '.....t......',
      '......t.....',
      '......t....t',
      '......t....t',
      't....t..t.t.',
      '.t...tt..t..',
      '.t.t.Tt.t...',
      '..t..TUt....',
      '...t.Ut.....',
      '....tTt.....',
      '.....Tt.....',
      '.....Tt..t..',
      '.....Tt.t...',
      '.....Ttt....',
      '.....Tt.....',
      '.....TU.....',
      '.....Tt.....',
      '.....TU.....',
      '.....Tt.....',
      '.....Tt.....',
      '.....Tt.....',
      '.....Tt.....',
      '....tTtU....',
    ],
  },
  // Cacto
  cactus: {
    pal: { A: '#3d8a58', D: '#2a6a4c', H: '#a8d88a', L: '#5aa86a' },
    rows: [
      '...AA...',
      '...LHD..',
      '...LAD..',
      '...LAD..',
      '...LHD..',
      'A..LAD..',
      'LH.LAD..',
      'LD.LHD..',
      'LD.LADA.',
      'LH.LADLH',
      'LD.LHDLD',
      'AAALADLD',
      'DDDLADLH',
      '...LHDAA',
      '...LADDD',
      '...LAD..',
      '...LHD..',
      '...LAD..',
      '...LAD..',
      '...LHD..',
    ],
  },
  // Cacto pequeno
  cactus2: {
    pal: { A: '#3d8a58', D: '#2a6a4c', H: '#a8d88a', L: '#5aa86a' },
    rows: [
      'AA...',
      'LHD..',
      'LAD..',
      'LADA.',
      'LHDLH',
      'LADLD',
      'LADLD',
      'LHDAA',
      'LADDD',
      'LAD..',
      'LHD..',
      'LAD..',
    ],
  },
  // Muda
  sapling: {
    pal: { D: '#265a3a', H: '#6cb85e', L: '#43984f', O: '#1d3b2c', t: '#6a4428' },
    rows: [
      '.L.H..',
      '.LLLDD',
      'LLLLDD',
      'DDDDDO',
      '.DD...',
      '..t...',
      '..t...',
      '..t...',
      '..t...',
      '..t...',
      '..t...',
    ],
  },
  // Toco
  stump: {
    pal: { T: '#c8a070', U: '#4e3020', t: '#7a5030' },
    rows: [
      '..TTTTT..',
      '.TtTTtTt.',
      '.ttTTTtU.',
      '.tttttUU.',
      'ttttttUUU',
    ],
  },
  // Arbusto
  bush: {
    pal: { A: '#2f7d47', D: '#245b3a', H: '#78c468', L: '#45a055', O: '#1a3a2a' },
    rows: [
      '......L..D.....',
      '....L.LLHL.....',
      '....LHLLLLL....',
      '..A.LLLAHLH.L..',
      '.HLLALLLLLLLLL.',
      '.LLLAAHHLLAAAAA',
      'HLLAAALAAAAAADD',
      'HAAAAALAAAAADDD',
      '.AAAAADDAAADDD.',
      '.DADDDODADDDDO.',
      '..OODOO.OOOOO..',
    ],
  },
  // Arbusto alto
  bush2: {
    pal: { A: '#2f7d47', D: '#245b3a', H: '#78c468', L: '#45a055', O: '#1a3a2a' },
    rows: [
      '.....LL..L.....',
      '....HLLLLLL....',
      '...LLLLAAAAD...',
      '...LLAAAAADA...',
      '....AHHAAADD...',
      '.HLHALLLLLLLH..',
      '.LLLLAAHLLLLAL.',
      'HLLAAAHLLLAADDD',
      '.LAAAAHLLAAAAD.',
      'DAAAAALAAAAADDD',
      '.ADAADDADAADDDO',
      '.DDDDDODADDDD..',
      '...O.OO.OOODO..',
      '...............',
    ],
  },
  // Moita
  bush3: {
    pal: { A: '#2f7d47', D: '#245b3a', H: '#78c468', L: '#45a055', O: '#1a3a2a' },
    rows: [
      '...HH......',
      '.LLLLL..LH.',
      'LHLAHHLLLLD',
      'HADALLAAAAD',
      'HAAAHAAAADD',
      '.AAADAADDDO',
      '.DODODOOOO.',
    ],
  },
  // Arbusto de frutinhas
  berry: {
    pal: { A: '#2f7d47', D: '#245b3a', F: '#d8344a', H: '#78c468', L: '#45a055', O: '#1a3a2a', f: '#8a1c30' },
    rows: [
      '.....L.H.......',
      '....LLALLLL....',
      '..FHHLLALFHFH..',
      '.LfLFLLLLfFAL..',
      '.HFLfAFHLLfDAAD',
      'HLLAAAfLLDAAADD',
      'HAAAAALAAAAADDD',
      'DAAAADDAFAADDDO',
      '.DADDDODfDDDDO.',
      '.DOOOOO.DOOOO..',
    ],
  },
  // Arbusto florido
  flower: {
    pal: { A: '#5f961e', D: '#447018', F: '#f4ec80', H: '#aedb48', L: '#7fb82a', O: '#2e5212', f: '#d8a848' },
    rows: [
      '....HLLALH......',
      '...LLLFLLLFD....',
      '..LLHLLAAAfHL.D.',
      '.HHLLLLFFLFLLFD.',
      'LLLAAAAffLAAAf..',
      'LLAAAFDLLAAAAAD.',
      'LAFAAfDLAAAAADD.',
      '.AAADDDLADADDDDO',
      'ADADDDODAADDDOO.',
    ],
  },
  // Arbusto seco
  dry: {
    pal: { A: '#748034', D: '#56602a', H: '#b4b858', L: '#929c42', O: '#3a4220' },
    rows: [
      '....HLLH.....',
      '...HLLLLHH...',
      '.LLHLLLLLALH.',
      'HHLLALLLLAALD',
      'LLAAALLAAAAAD',
      'LAAAAHDAAADDD',
      'DAAAADADADDAO',
      '.DODDODODAOO.',
    ],
  },
  // Capim 1
  grass0: {
    pal: { A: '#2f7d47', D: '#245b3a', L: '#45a055' },
    rows: [
      '..A.L..',
      '.DA.LA.',
      'DDAAAL.',
    ],
  },
  // Capim 2
  grass1: {
    pal: { A: '#2f7d47', D: '#245b3a', L: '#45a055' },
    rows: [
      'L....',
      'AL.L.',
      'DAADA',
    ],
  },
  // Capim 3
  grass2: {
    pal: { A: '#2f7d47', D: '#245b3a', L: '#45a055' },
    rows: [
      '.L..A.',
      'DAL.AD',
      'DDADDA',
    ],
  },
  // Pedra
  rock: {
    pal: { G: '#a2a2b6', R: '#c4c4d4', g: '#80809a', h: '#e4e4ee', n: '#5e5e78' },
    rows: [
      '..hhhhhG.....',
      '.hRRRRRnhhhh.',
      '.RGGGGGhRRRRG',
      'RGGGGGGRGGGGg',
      '.RGGGGGRGGGGg',
      '.gGGGGGnGGGGg',
      '..gnnnnngnnn.',
    ],
  },
  // Pedras empilhadas
  rock2: {
    pal: { G: '#a2a2b6', R: '#c4c4d4', g: '#80809a', h: '#e4e4ee', n: '#5e5e78' },
    rows: [
      '......h......',
      '....hhRhG....',
      '...hGGGGgg...',
      '...RGGGGgg...',
      '...RGGGGgg...',
      'hhhnGGGGgn...',
      'RGGhnngnnhhG.',
      'RGGGhhnhhGGgg',
      'RGGGGGRGGGGgg',
      'GGGGGGnGGGGgg',
      'ggnnnnngngnn.',
      '.........n...',
    ],
  },
  // Rochedo
  rock3: {
    pal: { G: '#a2a2b6', R: '#c4c4d4', g: '#80809a', h: '#e4e4ee', n: '#5e5e78' },
    rows: [
      '.............hhhhhG.',
      '.......hhhhhRRRRRRG.',
      '......hRRRRRnRGGGGg.',
      '......RRRRRRnGGGGGgg',
      '.....hGGGGGGGRGGGGg.',
      '.hhhhRGGGGGGGGGGGGg.',
      'hRRRRRGGGGGGGnnnnnn.',
      'RGGGGRGGGGGGGgghhRGG',
      'RGGGGRGGGGGGGggGGGgg',
      'RGGGGnGGGGGGGgnGGGgg',
      'GGGGGGGGGGGGGgRGGGgg',
      'gGGGGGnggggggnGGGGgg',
      '.ggnnnngnnnnnnnnnnn.',
      '....................',
    ],
  },
  // Seixos
  pebbles: {
    pal: { G: '#a2a2b6', R: '#c4c4d4', g: '#80809a', h: '#e4e4ee', n: '#5e5e78' },
    rows: [
      '.hhRhhhhG',
      'RGGGRGGGg',
      '.gnnggnnn',
    ],
  },
  // Veio de cobre
  ore: {
    pal: { "1": '#800080', "2": '#ff00ff', "3": '#ff80ff', G: '#a2a2b6', R: '#c4c4d4', g: '#80809a', h: '#e4e4ee', n: '#5e5e78' },
    rows: [
      '....hhhhhG....',
      '....R12GG3....',
      '.hhnGGGG32n...',
      'hRRhGGG12gh12.',
      'RGGGnnnnnnRRGG',
      'RG12hhhhhhGGgg',
      'RG12GGRGGGGGgg',
      'GGGGGGRG3GGGgg',
      'ggggggn12GGGgn',
      '.gnnnnngnnnnn.',
    ],
  },};

/** De perto (zoom em pixels por tile), a natureza vira sprite e cobre quem passa atrás; de longe fica pintada no chão. */
export const NATURE_NEAR_Z = 8;
/** Pixels do desenho por tile (a pessoa tem 18 linhas em 1,5 tile). */
export const NATURE_PX_PER_TILE = 12;
/** Sprites prontos: `nat:nome` e, nas árvores, `nat:nome:g` (meio transparente, em xadrez). */
export const NATURE_SPRITES: Record<string, string[]> = {};
export const NATURE_PALETTES: Record<string, Record<string, string>> = {};
/** Desenhos altos o bastante para esconder uma pessoa (ganham a versão meio transparente). */
export const TALL = new Set<string>();

for (const [name, art] of Object.entries(NATURE_ART)) {
  NATURE_SPRITES[`nat:${name}`] = art.rows;
  NATURE_PALETTES[`nat:${name}`] = art.pal;
  if (art.rows.length >= 18) {
    TALL.add(`nat:${name}`);
    NATURE_SPRITES[`nat:${name}:g`] = art.rows.map((r, y) => [...r].map((c, x) => ((x + y) % 2 ? '.' : c)).join(''));
    NATURE_PALETTES[`nat:${name}:g`] = art.pal;
  }
}

/** Segundo sorteio do tile (o primeiro decide se há enfeite), para a variedade. */
function pick(i: number): number {
  return tileHash(i * 7 + 3);
}

const BROADLEAF = ['oak', 'oak', 'oak2', 'oak2', 'birch'];
const BUSHES = ['bush', 'bush', 'bush2', 'bush3', 'berry', 'flower'];
const TUFTS = ['grass0', 'grass1', 'grass2'];

/**
 * Desenho de natureza do tile `i` (`nat:nome`), ou '' se não há. `kind` é o
 * enfeite do tile (o mesmo do mapa pintado) e `season` a estação (0 primavera
 * a 3 inverno): no outono parte das árvores de folha larga fica laranja, e no
 * inverno os pinheiros ganham neve. Sem enfeite, o capim, os arbustos e os
 * seixos aparecem por sorteio, só para enfeitar (a simulação não os vê).
 */
export function natureAt(map: SurfaceMap, i: number, kind: number, season: number): string {
  const h = pick(i);
  const biome = map.biome[i] as Biome;
  switch (kind) {
    case Decor.Tree:
      if (biome === Biome.Swamp) return h < 0.25 ? 'nat:deadtree' : 'nat:oak2';
      if (season === 2 && h < 0.6) return 'nat:autumn';
      return `nat:${BROADLEAF[Math.floor(h * BROADLEAF.length)]}`;
    case Decor.JungleTree:
      return biome !== Biome.Mangrove && h < 0.22 ? 'nat:palm' : 'nat:jungle';
    case Decor.Pine:
      if (season === 3 || biome === Biome.Tundra) return h < 0.5 ? 'nat:snowpine' : 'nat:pine2';
      return h < 0.6 ? 'nat:pine' : 'nat:pine2';
    case Decor.Acacia:
      return h < 0.15 ? 'nat:deadtree' : 'nat:acacia';
    case Decor.Cactus:
      return h < 0.6 ? 'nat:cactus' : 'nat:cactus2';
    case Decor.Boulder:
      return h < 0.15 ? 'nat:rock3' : h < 0.55 ? 'nat:rock2' : 'nat:rock';
    case Decor.Stump:
      return 'nat:stump';
    case Decor.Sapling:
      return 'nat:sapling';
    case Decor.None:
      break;
    default:
      return '';
  }
  if (map.bare?.[i] || map.elevation[i] < 0) return '';
  const veg = map.vegetation[i];
  switch (biome) {
    case Biome.Grass:
    case Biome.Forest:
    case Biome.Jungle:
    case Biome.Swamp:
      if (veg < 0.25) return '';
      if (h < 0.035) return `nat:${BUSHES[Math.floor((h / 0.035) * BUSHES.length)]}`;
      return h < 0.12 ? `nat:${TUFTS[Math.floor(((h - 0.035) / 0.085) * TUFTS.length)]}` : '';
    case Biome.Savanna:
      return h < 0.03 ? 'nat:dry' : h < 0.1 ? `nat:${TUFTS[Math.floor(((h - 0.03) / 0.07) * TUFTS.length)]}` : '';
    case Biome.Desert:
    case Biome.Rock:
    case Biome.Mountain:
    case Biome.Tundra:
    case Biome.Cliff:
      return h < 0.03 ? 'nat:pebbles' : '';
    default:
      return '';
  }
}

/** Deslocamento do desenho dentro do tile (em tiles), para a floresta não parecer uma grade. */
export function natureJitter(i: number): [number, number] {
  const a = tileHash(i * 13 + 5);
  const b = tileHash(i * 17 + 11);
  return [(a - 0.5) * 0.4, (b - 0.5) * 0.3];
}

const NAMES = Object.keys(NATURE_ART).map((n) => `nat:${n}`);
const INDEX = new Map(NAMES.map((n, k) => [n, k + 1]));

/**
 * `natureAt` e `natureJitter` guardados por tile: a vista lê milhares de
 * tiles por quadro e o resultado só muda quando muda o enfeite ou a estação.
 */
export class NatureCache {
  private readonly key: Int16Array;
  private readonly sprite: Uint8Array;
  private readonly jitter: Int8Array;

  constructor(private readonly map: SurfaceMap) {
    const n = map.width * map.height;
    this.key = new Int16Array(n).fill(-1);
    this.sprite = new Uint8Array(n);
    this.jitter = new Int8Array(n * 2);
  }

  /** Desenho do tile (`nat:nome`) ou ''; depois de chamar, `jx` e `jy` têm o deslocamento dentro do tile. */
  at(i: number, kind: number, season: number): string {
    const k = kind | (season << 5);
    if (this.key[i] !== k) {
      this.key[i] = k;
      this.sprite[i] = INDEX.get(natureAt(this.map, i, kind, season)) ?? 0;
      const [jx, jy] = natureJitter(i);
      this.jitter[i * 2] = Math.round(jx * 100);
      this.jitter[i * 2 + 1] = Math.round(jy * 100);
    }
    const s = this.sprite[i];
    if (!s) return '';
    this.jx = this.jitter[i * 2] / 100;
    this.jy = this.jitter[i * 2 + 1] / 100;
    return NAMES[s - 1];
  }

  jx = 0;
  jy = 0;
}
