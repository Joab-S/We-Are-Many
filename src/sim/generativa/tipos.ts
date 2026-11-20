/**
 * Mente generativa: os tipos e os números da física. A pessoa não tem lista de comportamentos; tem um corpo (os
 * verbos), olhos (as tags do que percebe), necessidades e memória (as crenças). O que ela pensa em fazer é gerado
 * combinando verbo × coisa percebida (gerador.ts) e julgado pelo IAUS.
 *
 * Tudo o que está em `MundoGen` é dado puro (vai no save por reflexão, como o resto do Ecosystem). A simulação não
 * guarda nenhuma categoria social: não há campo de tipo, estágio ou era de um grupo, nem grupo guardado. Só coisas
 * físicas, pessoas, laços, crenças, lentes (condição e efeito, sem nome) e memórias.
 */

/** Necessidades, de 0 (satisfeita) a 1 (no limite). As sete primeiras são do corpo; as outras, da cabeça. */
export const NEC = ['fome', 'sede', 'sono', 'cansaco', 'frio', 'calor', 'dor', 'medo', 'solidao', 'tedio', 'apego', 'respeito', 'sentido'] as const;
export type Nec = (typeof NEC)[number];
export const N = NEC.length;
export const NI = Object.fromEntries(NEC.map((n, k) => [n, k])) as Record<Nec, number>;

/** O que o corpo sabe fazer. Cada verbo só declara o que precisa e quanto custa (VERBO); o efeito fica no mundo (fisica.ts). */
export const VERBOS = [
  'andar',
  'olhar',
  'pegar',
  'largar',
  'carregar',
  'comer',
  'beber',
  'dormir',
  'descansar',
  'abrigar',
  'cavar',
  'cortar',
  'bater',
  'fugir',
  'seguir',
  'falar',
  'mostrar',
  'dar',
  'pedir',
  'empilhar',
  'acender',
  'cuidar',
  'acasalar',
] as const;
export type Verbo = (typeof VERBOS)[number];
export const VI = Object.fromEntries(VERBOS.map((v, k) => [v, k])) as Record<Verbo, number>;

/** O que se carrega na mão e se junta num monte. */
export const MATERIAIS = ['comida', 'carne', 'galho', 'pedra', 'lasca', 'semente', 'tronco'] as const;
export type Material = (typeof MATERIAIS)[number];

/** A tag que cada material oferece a quem o vê (na mão de alguém, num monte). */
export const TAG_DO_MATERIAL: Record<Material, string> = { comida: 'comivel', carne: 'carne', galho: 'galho', pedra: 'pedra', lasca: 'lasca', semente: 'semente', tronco: 'tronco' };

/** Custo e duração de cada verbo: segundos no alvo, esforço (cansaço por segundo) e o gesto que a tela anima. */
export const VERBO: Record<Verbo, { tempo: number; esforco: number; gesto: string; perto: number }> = {
  andar: { tempo: 0.4, esforco: 0, gesto: 'none', perto: 1.5 },
  olhar: { tempo: 1.5, esforco: 0, gesto: 'none', perto: 1.5 },
  pegar: { tempo: 1, esforco: 0.01, gesto: 'pick', perto: 1.3 },
  largar: { tempo: 0.5, esforco: 0, gesto: 'pick', perto: 1.3 },
  carregar: { tempo: 0.6, esforco: 0.01, gesto: 'carry', perto: 1.3 },
  comer: { tempo: 1.6, esforco: 0, gesto: 'reap', perto: 1.3 },
  beber: { tempo: 1.2, esforco: 0, gesto: 'dig', perto: 1.6 },
  dormir: { tempo: 4, esforco: 0, gesto: 'rest', perto: 1.3 },
  descansar: { tempo: 2.5, esforco: 0, gesto: 'rest', perto: 1.3 },
  abrigar: { tempo: 2.5, esforco: 0, gesto: 'rest', perto: 1.3 },
  cavar: { tempo: 2.5, esforco: 0.03, gesto: 'dig', perto: 1.3 },
  cortar: { tempo: 3, esforco: 0.03, gesto: 'chop', perto: 1.4 },
  bater: { tempo: 1.2, esforco: 0.04, gesto: 'hammer', perto: 1.4 },
  fugir: { tempo: 2, esforco: 0.03, gesto: 'none', perto: 0 },
  seguir: { tempo: 3, esforco: 0, gesto: 'none', perto: 2.2 },
  falar: { tempo: 2, esforco: 0, gesto: 'talk', perto: 1.8 },
  mostrar: { tempo: 1.5, esforco: 0, gesto: 'talk', perto: 1.8 },
  dar: { tempo: 0.8, esforco: 0, gesto: 'pick', perto: 1.6 },
  pedir: { tempo: 0.8, esforco: 0, gesto: 'talk', perto: 1.8 },
  empilhar: { tempo: 1.2, esforco: 0.02, gesto: 'hammer', perto: 1.3 },
  acender: { tempo: 2.5, esforco: 0.02, gesto: 'hammer', perto: 1.3 },
  cuidar: { tempo: 2, esforco: 0.01, gesto: 'talk', perto: 1.5 },
  acasalar: { tempo: 2, esforco: 0.01, gesto: 'cheer', perto: 1.5 },
};

/** De onde veio uma crença, uma lente ou um hábito. */
export type OrigemTipo = 'instinto' | 'vivido' | 'visto' | 'ouvido' | 'herdado';
export interface Origem {
  tipo: OrigemTipo;
  /** De quem (uid): quem foi visto, quem contou, de quem herdou. 0 = ninguém. */
  de: number;
  /** Ano do mundo em que a pessoa passou a ter isto. */
  em: number;
}

/**
 * Uma crença: o que a pessoa espera de fazer `verbo` numa coisa com a `tag`. É por tag e não por objeto, então
 * generaliza. `e` é a mudança esperada em cada necessidade (negativo alivia), `c` a confiança (0 a 1) e `g` o que a
 * pessoa espera ter depois (`mao:<tag>` na mão, `ver:<tag>` à vista), de 0 a 1.
 */
export interface Crenca {
  e: number[];
  c: number;
  g?: Record<string, number>;
  o: Origem;
  /** Quantas vezes foi corrigida pelo que aconteceu. */
  n: number;
}

/**
 * Uma lente: "quando percebo `c` por perto, fazer `v` muda assim". Guarda a condição e o efeito, nunca um nome.
 * `d` é a diferença por necessidade entre fazer com e sem a tag no contexto; `f` é a força (some se deixar de render).
 */
export interface Lente {
  v: Verbo;
  c: string;
  d: number[];
  f: number;
  o: Origem;
}

/** A conta que faz uma lente nascer: a surpresa média de `v` com e sem a tag `c` por perto (médias móveis). */
export interface Contexto {
  nCom: number;
  nSem: number;
  com: number[];
  sem: number[];
  /** Média do quadrado da surpresa de cada lado (para saber se a diferença é maior que o ruído). */
  qCom: number;
  qSem: number;
}

/** Um hábito: uma sequência de verbo|tag que rendeu várias vezes e virou uma opção só, com efeito próprio. */
export interface Habito {
  id: number;
  passos: string[];
  e: number[];
  /** Vezes que rendeu. */
  n: number;
  o: Origem;
}

/** Um lugar lembrado: o que havia lá (tags) e o quanto se viveu bem ali. */
export interface LugarLembrado {
  x: number;
  y: number;
  tags: Record<string, number>;
  /** Bem-estar acumulado ali (sobe com o que rendeu, cai com o que doeu). */
  bem: number;
  em: number;
  /** Quem mostrou ou contou (0 = eu mesmo vi). */
  de: number;
}

/**
 * Um ato cujo resultado ainda pode chegar: mexi numa coisa (ou em alguém) e lembro. Se depois essa coisa me render
 * algo, o ato antigo leva o crédito (é assim que largar comida vira guardar, e largar semente vira plantar).
 */
export interface AtoLembrado {
  /** A coisa (id negativo) ou a pessoa (uid). */
  ref: number;
  v: Verbo;
  tags: string[];
  em: number;
  /** O quanto já rendeu. */
  pago: number;
}

/** Uma decisão na linha do tempo da pessoa: o que esperava e o que aconteceu. */
export interface Registro {
  em: number;
  /** verbo|tag principal (o nome é montado por quem mostra). */
  chave: string;
  esperado: number;
  real: number;
  fim: 'feito' | 'falhou' | 'trocou' | '';
  surpresa: boolean;
}

/** A parte da pessoa que só existe no modelo generativo. */
export interface PessoaGen {
  nec: number[];
  crencas: Record<string, Crenca>;
  lentes: Lente[];
  contextos: Record<string, Contexto>;
  habitos: Habito[];
  /** Pares de atos seguidos que renderam, a caminho de virar hábito: "a|b" → vezes e ganho. */
  pares: Record<string, { n: number; e: number[] }>;
  lugares: LugarLembrado[];
  atos: AtoLembrado[];
  /** O último ato que deu certo (para os pares) e quando. */
  antes: { chave: string; em: number; ganho: number; abriu: boolean } | null;
  mao: { que: Material; q: number } | null;
  /** Ano em que o filho nasce (0 = não está grávida) e o outro pai. */
  gravida: number;
  par: number;
  /** Quem carrega no colo (uid) e quem a carrega. */
  colo: number;
  noColo: number;
  ferida: number;
  /** Vontade de par (0 a 1): sobe sozinha no adulto fértil e zera ao acasalar. */
  desejo: number;
  /** Filhos vivos que ainda não são adultos (uids): um fato do corpo, não um papel. */
  filhos: number[];
  dorme: boolean;
  /** Quem lhe pediu comida e quando. */
  pedido: { de: number; em: number } | null;
  /** Quantos a seguem agora (um fato que os outros veem). */
  seguidores: number;
  /** A quem segue agora (uid), para o fato acima e o debug. */
  segue: number;
  linha: Registro[];
  /** Contas de fatos (quantas vezes deu, recebeu, bateu, apanhou). Só leitura para quem observa: nenhuma decisão as lê. */
  conta: { deu: number; recebeu: number; bateu: number; apanhou: number; tomou: number; travessias: number; para: number[] };
  /** Onde passou a última noite (para medir há quanto tempo dorme no mesmo lugar: só leitura para o observador). */
  dormiuEm: { x: number; y: number; noites: number } | null;
}

/** Uma coisa posta por alguém no mundo: um monte de materiais num tile. O que ela oferece sai do que ela tem. */
export interface Coisa {
  id: number;
  t: number;
  x: number;
  y: number;
  m: Partial<Record<Material, number>>;
  /** Segundos de fogo que restam. */
  fogo: number;
  /** Sementes na terra a caminho de virar planta (0 a 1) e o que já dá para comer. */
  broto: number;
  planta: number;
  de: number;
  em: number;
}

export interface MundoGen {
  versao: 1;
  pessoas: Map<number, PessoaGen>;
  coisas: Coisa[];
  /** Montes por tile (índice de `coisas` muda; isto guarda o id). */
  proxCoisa: number;
  proxHabito: number;
  /** O que foi colhido de cada tile e ainda não rebrotou: tile → [quanto, ano]. */
  colhido: Map<number, [number, number]>;
  /** Troncos caídos que alguém já levou: tile → ano (o tronco não volta a cair sozinho). */
  tirado: Map<number, number>;
  /** Relógio da física das coisas (s). */
  relogio: number;
  /** Contas do mundo (só para a sonda e o painel; nada decide por elas). */
  conta: { nascidos: number; mortos: number; concepcoes: number };
}

/** Os números da física e do aprendizado. */
export const GEN = {
  /** O corpo vive `ritmo` vezes mais devagar que o metabolismo dos bichos: a pessoa come umas vezes por minuto. */
  ritmo: 4,
  /** Um dia (s): metade de luz, metade de escuro. */
  dia: 60,
  /** Intervalo entre pensamentos (s) perto da tela e longe dela, e quantas opções passam ao IAUS. */
  pensar: 1,
  pensarLonge: 2.5,
  K: 8,
  KLonge: 5,
  /** Até onde se vê em campo aberto (tiles); no alto vê mais, no mato fechado e à noite menos. */
  vista: 9,
  /** Segundos para a sede, o sono, a solidão, o tédio, o sentido, o respeito e a vontade de par encherem do zero. */
  sede: 45,
  sono: 75,
  solidao: 90,
  tedio: 70,
  sentido: 300,
  respeito: 220,
  desejo: 15,
  /** O que um bocado do mato dá de energia (vezes o quanto há para comer) e em quantos anos o tile rebrota. */
  bocado: 0.3,
  rebrota: 18,
  /** O que cabe na mão, de cada material. */
  mao: 3,
  /** Materiais que cobrem alguém: com tanto (galho 1, pedra 2, tronco 3) o monte abriga por inteiro. */
  abrigo: 10,
  /** Segundos de fogo por galho e chance de acender por tentativa (mais com lasca e jeito). */
  fogoPorGalho: 25,
  acender: 0.25,
  /** Anos para a semente na terra virar planta, e o que cada semente dá de comida. */
  brotar: 2,
  colheita: 3,
  /** A comida guardada estraga: fração por ano (a carne, o triplo). */
  estraga: 0.06,
  /** Fração das árvores com um tronco caído ao pé, o quanto os galhos de um monte apodrecem por ano e o passo de quem boia agarrado a um tronco. */
  troncoCaido: 0.04,
  galhoApodrece: 0.03,
  nadar: 0.5,
  /** Gravidez (anos), idade em que a criança anda sozinha e come sozinha. */
  gestacao: 0.75,
  anda: 3,
  come: 4,
  /** Energia mínima para conceber e o que a gravidez e o colo custam a mais de metabolismo e de passo. */
  conceber: 0.6,
  custoGravidez: 0.35,
  custoColo: 0.25,
  lento: 0.7,
  /** Aprendizado: passo da correção, o que vale ver e ouvir, e o quanto os filhos herdam. */
  aprende: 0.35,
  visto: 0.3,
  ouvido: 0.4,
  herda: 0.5,
  /** Desconto de cada passo adiante ao encadear e de um resultado que chega depois. */
  adiante: 0.7,
  depois: 0.6,
  /** O quanto o desconhecido vale do melhor que falta aqui (a esperança de achar lá o que não há à vista). */
  esperanca: 0.3,
  /** Anos que um ato fica esperando resultado. */
  espera: 6,
  /** Lentes: amostras de cada lado, diferença para nascer e para sumir. */
  lenteMin: 4,
  lenteNasce: 0.1,
  lenteSome: 0.03,
  /** Vezes que um par de atos precisa render para virar hábito. */
  habito: 3,
  /** Quantos lugares, atos e registros a pessoa guarda. */
  lugares: 8,
  atos: 10,
  linha: 12,
} as const;

export const zeros = (): number[] => new Array<number>(N).fill(0);
export const chave = (v: Verbo, tag: string): string => `${v}|${tag}`;
