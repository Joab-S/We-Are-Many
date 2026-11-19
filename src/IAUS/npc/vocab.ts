/**
 * Vocabulário das pessoas: os nomes que os comportamentos, as entradas e os mundos combinam entre si.
 *
 * Tudo o que a IA sabe do mundo chega por aqui, em três formas (o contrato com qualquer mundo, o jogo ou o
 * laboratório):
 * - **Stats** (`S`): números na `Pessoa` e nos alvos (`AiEntity.stats`). Necessidades de 0 (satisfeita) a 1
 *   (urgente), traços de −1 a 1, estoques em unidades, e a necessidade coletiva que a pessoa percebe no lugar.
 * - **Tags** (`TAG`): fatos booleanos de uma entidade ("eu sou ferreiro", "este cervo é alvo de caça"); e as
 *   mesmas tags como crenças sobre os outros ("acho que Ana é padeira"), no Tagging System.
 * - **Tipos de objeto** (`WOT`): o que cada alvo é, para filtrar quem entra em cada comportamento.
 */

/** O que cada alvo é (World Object Type). */
export const WOT = {
  pessoa: 'pessoa',
  animal: 'animal',
  arvore: 'arvore',
  rocha: 'rocha',
  arbusto: 'arbusto',
  pesqueiro: 'pesqueiro',
  agua: 'agua',
  roca: 'roca',
  casa: 'casa',
  oficina: 'oficina',
  obra: 'obra',
  sitio: 'sitio',
  assentamento: 'assentamento',
  /** Uma opção abstrata de ofício (o "alvo" da escolha de profissão). */
  oficio: 'oficio',
  /** Uma tarefa do quadro do lugar. */
  tarefa: 'tarefa',
  /** Uma oferta de negócio ou encomenda entre duas pessoas. */
  oferta: 'oferta',
  /** Uma opção de obra pública (o "alvo" da escolha do líder). */
  obraPublica: 'obraPublica',
  /** Uma faixa de imposto (o "alvo" da escolha do líder). */
  imposto: 'imposto',
  /** Um evento no lugar (festa, enterro, caravana). */
  evento: 'evento',
  // Lugares de uma aldeia (o jogo, src/sim/eco/people/mente.ts).
  /** O celeiro ou armazém, onde se come e se entrega a carga. */
  celeiro: 'celeiro',
  /** A praça: encontro, festa, abrigo no alarme. */
  praca: 'praca',
  templo: 'templo',
  /** O posto de trabalho do ofício (a roça do agricultor, a mina, o porto, a oficina). */
  posto: 'posto',
  /** Uma pilha de carga no pátio, à espera de quem a leve ao celeiro. */
  carga: 'carga',
  /** O portão (ou a borda da praça) onde a milícia se junta. */
  portao: 'portao',
} as const;
export type Wot = (typeof WOT)[keyof typeof WOT];

/** Bens que as pessoas guardam, trocam e encomendam. */
export const BENS = ['comida', 'madeira', 'pedra', 'ferramentas', 'pao', 'tabuas', 'couro', 'tecido', 'ceramica', 'cerveja'] as const;
export type Bem = (typeof BENS)[number];

/**
 * Ofícios: cada um diz o bem que rende, onde se trabalha (o tipo do alvo) e a oficina que a pessoa abre na
 * casa quando se especializa ("vão modificando as residências para cada profissão"). `primario` são os
 * ofícios de quem tira do mato; os outros transformam um bem em outro.
 */
export interface OficioInfo {
  nome: string;
  /** Nome da tag de identidade ("Lenhador"). */
  tag: string;
  rende: Bem;
  /** Onde se trabalha: um recurso do mato ou a própria oficina. */
  onde: Wot;
  /** O que a oficina consome (ofícios de transformação). */
  consome?: Bem;
  /** Oficina que a pessoa abre na casa (vazio: trabalha no mato). */
  oficina?: string;
  primario: boolean;
  /** Traços que combinam com o ofício (peso de −1 a 1). */
  jeito: Partial<Record<string, number>>;
}

const oficios = <T extends Record<string, OficioInfo>>(x: T): { [K in keyof T]: OficioInfo } => x;

export const OFICIOS = oficios({
  coletor: { nome: 'Coletor', tag: 'Coletor', rende: 'comida', onde: 'arbusto', primario: true, jeito: { curiosity: 0.2, sociability: 0.2, patience: 0.1 } },
  cacador: { nome: 'Caçador', tag: 'Caçador', rende: 'comida', onde: 'animal', primario: true, jeito: { courage: 0.5, strength: 0.4, patience: -0.2, aggression: 0.2 } },
  pescador: { nome: 'Pescador', tag: 'Pescador', rende: 'comida', onde: 'pesqueiro', primario: true, jeito: { patience: 0.5, courage: 0.2 } },
  agricultor: { nome: 'Agricultor', tag: 'Agricultor', rende: 'comida', onde: 'roca', primario: true, jeito: { patience: 0.5, diligence: 0.3, attachment: 0.3 } },
  lenhador: { nome: 'Lenhador', tag: 'Lenhador', rende: 'madeira', onde: 'arvore', primario: true, jeito: { strength: 0.5, diligence: 0.3 } },
  pedreiro: { nome: 'Pedreiro', tag: 'Pedreiro', rende: 'pedra', onde: 'rocha', oficina: 'pedreira', primario: true, jeito: { strength: 0.5, courage: 0.2, diligence: 0.2 } },
  construtor: { nome: 'Construtor', tag: 'Construtor', rende: 'madeira', onde: 'obra', primario: false, jeito: { strength: 0.3, dexterity: 0.4, diligence: 0.3 } },
  pastor: { nome: 'Pastor', tag: 'Pastor', rende: 'couro', onde: 'oficina', oficina: 'curral', primario: false, jeito: { patience: 0.4, kindness: 0.3 } },
  padeiro: { nome: 'Padeiro', tag: 'Padeiro', rende: 'pao', consome: 'comida', onde: 'oficina', oficina: 'padaria', primario: false, jeito: { diligence: 0.4, patience: 0.3 } },
  taberneiro: { nome: 'Taberneiro', tag: 'Taberneiro', rende: 'cerveja', consome: 'comida', onde: 'oficina', oficina: 'taberna', primario: false, jeito: { sociability: 0.5, charisma: 0.3, greed: 0.2 } },
  marceneiro: { nome: 'Marceneiro', tag: 'Marceneiro', rende: 'tabuas', consome: 'madeira', onde: 'oficina', oficina: 'marcenaria', primario: false, jeito: { dexterity: 0.5, patience: 0.3 } },
  ferreiro: { nome: 'Ferreiro', tag: 'Ferreiro', rende: 'ferramentas', consome: 'pedra', onde: 'oficina', oficina: 'ferraria', primario: false, jeito: { dexterity: 0.5, strength: 0.3, patience: 0.2 } },
  tecelao: { nome: 'Tecelão', tag: 'Tecelão', rende: 'tecido', consome: 'couro', onde: 'oficina', oficina: 'tear', primario: false, jeito: { dexterity: 0.5, patience: 0.3 } },
  oleiro: { nome: 'Oleiro', tag: 'Oleiro', rende: 'ceramica', consome: 'pedra', onde: 'oficina', oficina: 'olaria', primario: false, jeito: { dexterity: 0.5, curiosity: 0.1 } },
  comerciante: { nome: 'Comerciante', tag: 'Comerciante', rende: 'comida', onde: 'oficina', oficina: 'venda', primario: false, jeito: { charisma: 0.4, greed: 0.4, sociability: 0.3, attachment: -0.3 } },
  sacerdote: { nome: 'Sacerdote', tag: 'Sacerdote', rende: 'comida', onde: 'oficina', oficina: 'templo', primario: false, jeito: { faith: 0.7, kindness: 0.2, charisma: 0.2 } },
});
export type Oficio = keyof typeof OFICIOS;
export const OFICIO_IDS = Object.keys(OFICIOS) as Oficio[];
export const oficioInfo = (o: Oficio): OficioInfo => OFICIOS[o];

/** Obras públicas que só o líder manda fazer (pagas pelo tesouro do lugar). */
export const OBRAS_PUBLICAS = ['estrada', 'praca', 'prefeitura', 'poco', 'celeiro', 'mercado', 'templo', 'muralha', 'quartel'] as const;
export type ObraPublica = (typeof OBRAS_PUBLICAS)[number];

/** Faixas de imposto que o líder pode escolher (parte da renda de cada morador que vai ao tesouro). */
export const IMPOSTOS = { nenhum: 0, baixo: 0.05, medio: 0.12, alto: 0.25 } as const;
export type Imposto = keyof typeof IMPOSTOS;

/**
 * Tags: o que uma entidade é ou o que fizeram dela. As de ofício são `oficioInfo(o).tag`. As que dependem de
 * quem marcou levam o id depois de ":" (ex.: `AlvoDeCaca:12`, a presa que a pessoa 12 escolheu).
 */
export const TAG = {
  // Fase da vida (o cérebro troca de pacotes quando elas mudam).
  crianca: 'Criança',
  adulto: 'Adulto',
  idoso: 'Idoso',
  // Moradia.
  semTeto: 'SemTeto',
  assentado: 'Assentado',
  temCasa: 'TemCasa',
  fundador: 'Fundador',
  morador: 'Morador',
  // Família e laços.
  casado: 'Casado',
  namorando: 'Namorando',
  filho: 'Filho',
  amigo: 'Amigo',
  rival: 'Rival',
  // Trabalho e comércio.
  aprendiz: 'Aprendiz',
  mestre: 'Mestre',
  encomenda: 'Encomenda',
  devedor: 'Devedor',
  /** Marca no credor: `Credor:<id de quem deve>`. */
  credor: 'Credor',
  vendedor: 'Vendedor',
  // Política.
  lider: 'Líder',
  candidato: 'Candidato',
  votou: 'Votou',
  eleitor: 'Eleitor',
  descontente: 'Descontente',
  // Defesa.
  soldado: 'Soldado',
  hostil: 'Hostil',
  perigoso: 'Perigoso',
  // Alvos marcados por alguém.
  alvoDeCaca: 'AlvoDeCaca',
  reservado: 'Reservado',
  // Em si, enquanto a marca no alvo dura (param `eu` de MarcarAlvo).
  cacando: 'Caçando',
  reservando: 'Reservando',
  // Lugares.
  praca: 'Praça',
  taberna: 'Taberna',
  templo: 'Templo',
  mercado: 'Mercado',
  celeiro: 'Celeiro',
  abrigo: 'Abrigo',
} as const;

/** Tag marcada por alguém: `AlvoDeCaca:12`. */
export const tagDe = (tag: string, quem: number): string => `${tag}:${quem}`;

/**
 * Stats que os mundos escrevem na pessoa e nos alvos (o que a pessoa sente e percebe). As de traço são
 * `tr.<traço>` (−1 a 1), as de habilidade `hab.<ofício>` (0 a 1), as de estoque `inv.<bem>` (unidades),
 * e as do lugar `loc.<coisa>`, a necessidade coletiva como a pessoa a percebe.
 */
export const S = {
  // Necessidades (0 satisfeita, 1 urgente).
  fome: 'fome',
  sede: 'sede',
  cansaco: 'cansaco',
  tedio: 'tedio',
  solidao: 'solidao',
  fe: 'fe',
  frio: 'frio',
  medo: 'medo',
  // A pessoa.
  idade: 'idade',
  riqueza: 'riqueza',
  /** Anos no ofício atual (quem acabou de trocar reluta em trocar de novo). */
  anosNoOficio: 'anosNoOficio',
  /** Popularidade no lugar (0 a 1) e aprovação do líder pelo povo (0 a 1). */
  popularidade: 'popularidade',
  aprovacao: 'aprovacao',
  /** Tamanho da família que mora com a pessoa e quantos cabem na casa. */
  familia: 'familia',
  vagasCasa: 'vagasCasa',
  /** Imposto devido e o que já pagou no ano (0 a 1). */
  impostoDevido: 'impostoDevido',
  /** É noite (1) ou dia (0). */
  noite: 'noite',
  // Onde a pessoa está (o sítio debaixo dos pés), de 0 a 1.
  aquiAgua: 'aqui.agua',
  aquiComida: 'aqui.comida',
  aquiMadeira: 'aqui.madeira',
  aquiPedra: 'aqui.pedra',
  aquiClima: 'aqui.clima',
  aquiVizinhos: 'aqui.vizinhos',
  // O lugar onde mora, como a pessoa o percebe (necessidade coletiva), de 0 a 1 salvo dito.
  locPop: 'loc.pop',
  locCasas: 'loc.casas',
  locFaltaComida: 'loc.falta.comida',
  locFaltaMadeira: 'loc.falta.madeira',
  locFaltaPedra: 'loc.falta.pedra',
  locFaltaFerramentas: 'loc.falta.ferramentas',
  locFaltaCasa: 'loc.falta.casa',
  locSemLider: 'loc.semLider',
  locEleicao: 'loc.eleicao',
  locConflitos: 'loc.conflitos',
  locAmeaca: 'loc.ameaca',
  locTesouro: 'loc.tesouro',
  locImposto: 'loc.imposto',
  locBemEstar: 'loc.bemEstar',
  locPressao: 'loc.pressao',
  locChamado: 'loc.chamado',
  locObraAberta: 'loc.obraAberta',
  // Alvos.
  quantidade: 'quantidade',
  valor: 'valor',
  perigo: 'perigo',
  maduro: 'maduro',
  preco: 'preco',
  /** Faltas e vagas de um ofício (alvo `oficio`): falta no lugar e parte dos adultos que já o fazem. */
  falta: 'falta',
  ocupacao: 'ocupacao',
  /** Quão comum o ofício é na era (0 a 1): ninguém vira moleiro sem moinho. */
  comum: 'comum',
  prioridade: 'prioridade',
  vagas: 'vagas',
  urgente: 'urgente',
  amigosNela: 'amigosNela',
  pressao: 'pressao',
  afinidade: 'afinidade',
} as const;

export const tr = (traco: string): string => `tr.${traco}`;
export const hab = (o: Oficio | string): string => `hab.${o}`;
export const inv = (b: Bem | string): string => `inv.${b}`;
export const falta = (o: Oficio | string): string => `loc.falta.oficio.${o}`;
export const precisa = (b: Bem | string): string => `precisa.${b}`;
export const necessidadeObra = (o: ObraPublica | string): string => `loc.precisa.${o}`;
