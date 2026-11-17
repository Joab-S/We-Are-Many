/**
 * A rotina da aldeia: cem comportamentos pequenos, fora do trabalho e das necessidades do corpo (pacotes.ts). São o
 * que dá cara de gente à aldeia na tela: sentar na porta de casa no fim da tarde, fofocar com um vizinho, ralhar
 * com o filho, acender uma vela no templo, talhar madeira, brincar de esconde-esconde.
 *
 * Todos usam o corpo simples da aldeia (`simpleAct` em src/sim/eco/people/mente.ts), descrito pelos params: ir ao
 * alvo (uma pessoa, um lugar, ou um ponto da aldeia com `anda`), ficar `fica` segundos com um `gesto` e então mudar o
 * que a pessoa sente (`social`, `fe`, `descanso`, `come`) e o que a outra sente (`outro`, `aliviar`, `alimenta`) e o
 * laço entre as duas (`laco`). Nenhum produz bens: a economia continua no trabalho.
 *
 * O peso fica entre 1,2 e 2,8, abaixo do trabalho (3): de dia o trabalho ganha e a rotina aparece nas brechas; no fim
 * da tarde e no começo da noite, com o turno acabado (`folga`), é a vez dela. Cada um cansa de si mesmo (`variar`
 * pelo nome), então a mesma pessoa não repete a mesma coisa a tarde toda.
 *
 * Stats novos que a pessoa vê nos outros (alvo `pessoa`): `amigo`, `rival`, `parceiro`, `filho`, `familia`,
 * `crianca`, `idoso`, `adulto`, `fraco`, `sozinho`, `cansado` e `colega` (mesmo ofício).
 */
import type { ConsiderationDef } from '../../consideration';
import { c, pacote, type ComportamentoDef, type Contexto } from '../dsl';
import { curva } from '../curvas';
import { E } from '../entradas';
import { WOT, type Wot } from '../vocab';

/** Momentum das ações da aldeia: a ação em andamento vale 50% a mais (o pensamento é a cada segundo). */
export const FOCO_ALDEIA = 1.5;

type Gesto = 'none' | 'dig' | 'reap' | 'chop' | 'hammer' | 'row' | 'pray' | 'pick' | 'carry' | 'talk' | 'rest' | 'cheer';
type Dia = 'social' | 'rest' | 'pray' | 'eat' | 'water' | 'curious' | 'festival';

interface Rotina {
  nome: string;
  descricao: string;
  tipo: string;
  /** Sem alvo, a própria pessoa (`eu`). */
  alvo?: Wot;
  peso: number;
  considera: ConsiderationDef[];
  fica: number;
  gesto?: Gesto;
  dia?: Dia;
  /** Anda até um prédio sorteado da aldeia antes (ações sem alvo). */
  anda?: boolean;
  social?: number;
  fe?: number;
  descanso?: number;
  come?: number;
  outro?: number;
  aliviar?: number;
  alimenta?: number;
  laco?: number;
}

function r(x: Rotina): ComportamentoDef {
  const params: Record<string, number | string | boolean> = { fica: x.fica, gesto: x.gesto ?? 'none', dia: x.dia ?? 'social' };
  for (const k of ['social', 'fe', 'descanso', 'come', 'outro', 'aliviar', 'alimenta', 'laco'] as const) if (x[k]) params[k] = x[k]!;
  if (x.anda) params.anda = 1;
  const contexto: Contexto = x.alvo ? 'alvo' : 'eu';
  return {
    nome: x.nome,
    descricao: x.descricao,
    tipo: x.tipo,
    contexto,
    alvos: x.alvo ? [x.alvo] : undefined,
    continuo: true,
    foco: FOCO_ALDEIA,
    peso: x.peso,
    params,
    considera: [...x.considera, c('variar', E.eu, curva.desce(1, 0.15), { stat: `rotina.n:${x.nome}` })],
  };
}

// Considerações de sempre.
/** Fora do turno de trabalho (o fim da tarde e a noite); de dia vale `piso`. */
const folga = (piso = 0.25) => c('folga', E.eu, curva.desce(1, piso), { stat: 'dia' });
/** De dia (o turno), para o que se faz com sol; de noite vale `piso`. */
const deDia = (piso = 0.15) => c('de dia', E.eu, curva.sim(piso), { stat: 'dia' });
/** O fim da tarde, a hora de conviver. */
const entardecer = (piso = 0.3) => c('fim de tarde', E.eu, curva.sobe(piso, 1), { stat: 'tarde' });
/** Acordado: quase nada disso acontece de madrugada. */
const acordado = () => c('acordado', E.eu, curva.desce(1, 0.05), { stat: 'noite' });
/** À noite (para o que é de noite). */
const aNoite = (piso = 0.1) => c('à noite', E.eu, curva.sobe(piso, 1), { stat: 'noite' });
/** Com fome ou exausto não se distrai. */
const bem = () => [c('alimentado', E.eu, curva.desce(1, 0.1), { stat: 'fome' }), c('descansado', E.eu, curva.desce(1, 0.2), { stat: 'cansaco' })];
const maos = () => c('mãos livres', E.eu, curva.nao(0), { stat: 'carga' });
const traco = (nome: string, t: string, forca: number) => c(nome, E.eu, curva.traco(forca), { stat: `tr.${t}` });
const perto = (longe = 24, piso = 0.25) => c('perto', E.DistanceToTarget, curva.perto(longe, piso));
const doAlvo = (nome: string, stat: string, piso = 0) => c(nome, E.alvo, curva.sim(piso), { stat });
const livre = (piso = 0.2) => doAlvo('livre', 'livre', piso);
const laco = () => c('laço', E.alvo, curva.sobe(0, 1), { stat: 'laco' });
const gostaDele = () => c('laço', E.alvo, curva.limiar(0.55, 10), { stat: 'laco' });
const naoGosta = () => c('não gosta', E.alvo, curva.limiarInv(0.4, 10), { stat: 'laco' });
const solidao = (meio = 0.4) => c('vontade de conversar', E.eu, curva.limiar(meio, 8), { stat: 'conversa' });
const fe = (meio = 0.4) => c('fé', E.eu, curva.limiar(meio, 8), { stat: 'fe' });
const cansaco = (meio = 0.35) => c('cansaço', E.eu, curva.limiar(meio, 8), { stat: 'cansaco' });
const fome = (meio = 0.3) => c('fome', E.eu, curva.limiar(meio, 8), { stat: 'fome' });
const gente = () => doAlvo('gente', 'gente', 0.3);

const P = WOT.pessoa;

/** Pacote 39: o ócio e o descanso no meio do dia e no fim da tarde. */
export const OCIO_DA_ALDEIA = pacote({ id: 39, nome: 'Ócio na aldeia', camada: 'Mente', descricao: 'Sentar, olhar o movimento, andar à toa, cochilar, cuidar das próprias coisas.' }, [
  r({ nome: 'Sentar na porta de casa', descricao: 'No fim da tarde, senta na porta de casa e vê a rua.', tipo: 'FicarParado', alvo: WOT.casa, peso: 2, fica: 4, gesto: 'rest', dia: 'rest', descanso: 0.1, social: 0.05, considera: [folga(), entardecer(), traco('caseiro', 'familism', 0.5), perto(40)] }),
  r({ nome: 'Cochilar à sombra', descricao: 'Um pouco cansado no meio do dia, o preguiçoso tira um cochilo onde está.', tipo: 'FicarParado', peso: 1.8, fica: 3, gesto: 'rest', dia: 'rest', descanso: 0.25, considera: [cansaco(0.3), deDia(0.2), traco('preguiça', 'diligence', -0.7), maos()] }),
  r({ nome: 'Recuperar o fôlego', descricao: 'Cansado no meio de uma tarefa, para um instante e respira.', tipo: 'FicarParado', peso: 1.6, fica: 1.5, gesto: 'rest', dia: 'rest', descanso: 0.12, considera: [cansaco(0.4), deDia(0.3), traco('paciente', 'patience', 0.3)] }),
  r({ nome: 'Olhar o movimento na praça', descricao: 'Vai à praça só para ver quem passa.', tipo: 'Passear', alvo: WOT.praca, peso: 1.8, fica: 3, gesto: 'none', dia: 'curious', social: 0.12, considera: [folga(0.3), acordado(), gente(), traco('curioso', 'curiosity', 0.5), ...bem(), maos(), perto(40)] }),
  r({ nome: 'Andar à toa pela aldeia', descricao: 'Sem nada a fazer, dá uma volta pelas casas.', tipo: 'Vagar', peso: 1.4, fica: 1, gesto: 'none', dia: 'social', anda: true, social: 0.05, considera: [folga(0.3), acordado(), traco('inquieto', 'patience', -0.4), ...bem(), maos()] }),
  r({ nome: 'Explorar os arredores', descricao: 'O curioso vai ver um canto da aldeia que não conhece bem.', tipo: 'Explorar', peso: 1.5, fica: 2, gesto: 'none', dia: 'curious', anda: true, considera: [deDia(0.2), traco('curioso', 'curiosity', 0.8), ...bem(), maos()] }),
  r({ nome: 'Aquecer-se no fogo de casa', descricao: 'À noitinha, antes de dormir, fica perto do fogo de casa.', tipo: 'Aquecer', alvo: WOT.casa, peso: 1.9, fica: 3, gesto: 'rest', dia: 'rest', descanso: 0.1, considera: [c('anoitecer', E.eu, curva.lombada(0.5, 0.25, 0.1), { stat: 'noite' }), traco('caseiro', 'familism', 0.4), perto(60, 0.3)] }),
  r({ nome: 'Lavar o rosto no poço', descricao: 'Cansado e com calor, refresca o rosto no poço da praça.', tipo: 'Beber', alvo: WOT.praca, peso: 1.6, fica: 1.5, gesto: 'dig', dia: 'water', descanso: 0.1, considera: [cansaco(0.25), deDia(0.3), maos(), perto(30)] }),
  r({ nome: 'Contemplar o céu', descricao: 'De noite, sem sono, o curioso ou o devoto fica olhando as estrelas.', tipo: 'FicarParado', peso: 1.5, fica: 3, gesto: 'none', dia: 'pray', fe: 0.15, considera: [aNoite(0.05), c('sem sono', E.eu, curva.desce(1, 0.1), { stat: 'cansaco' }), traco('curioso', 'curiosity', 0.5), traco('devoto', 'faith', 0.3)] }),
  r({ nome: 'Arrumar a casa', descricao: 'Põe a casa em ordem de manhã cedo ou no fim da tarde.', tipo: 'FicarParado', alvo: WOT.casa, peso: 1.6, fica: 3, gesto: 'pick', dia: 'social', considera: [folga(0.35), acordado(), traco('caseiro', 'familism', 0.5), traco('diligente', 'diligence', 0.3), perto(40)] }),
  r({ nome: 'Remendar a roupa', descricao: 'No fim da tarde, remenda a roupa sentado em casa.', tipo: 'FicarParado', alvo: WOT.casa, peso: 1.5, fica: 3, gesto: 'hammer', dia: 'rest', descanso: 0.05, considera: [folga(), entardecer(0.4), traco('jeitoso', 'dexterity', 0.4), perto(40)] }),
  r({ nome: 'Beliscar algo no celeiro', descricao: 'Com um pouco de fome, passa no celeiro e come um bocado.', tipo: 'Comer', alvo: WOT.celeiro, peso: 1.9, fica: 1, gesto: 'rest', dia: 'eat', come: 0.25, considera: [c('fome leve', E.eu, curva.lombada(0.3, 0.12, 0), { stat: 'fome' }), doAlvo('tem comida', 'comida'), traco('guloso', 'greed', 0.3), perto(30)] }),
  r({ nome: 'Ficar sozinho pensando', descricao: 'O reservado se afasta um pouco para pensar na vida.', tipo: 'FicarParado', peso: 1.4, fica: 3, gesto: 'none', dia: 'rest', descanso: 0.05, considera: [folga(0.3), acordado(), c('sem falta de gente', E.eu, curva.desce(1, 0.1), { stat: 'solidao' }), traco('reservado', 'sociability', -0.6)] }),
  r({ nome: 'Tomar sol na praça', descricao: 'Num momento parado do dia, senta ao sol na praça.', tipo: 'FicarParado', alvo: WOT.praca, peso: 1.4, fica: 3, gesto: 'rest', dia: 'rest', descanso: 0.12, considera: [deDia(0.1), cansaco(0.2), traco('preguiça', 'diligence', -0.4), perto(30)] }),
]);

/** Pacote 40: a gente da aldeia, uma pessoa de cada vez. */
export const GENTE_DA_ALDEIA = pacote({ id: 40, nome: 'Gente da aldeia', camada: 'Vínculos', descricao: 'Cumprimentar, conversar, fofocar, brigar, fazer as pazes, consolar, ajudar.' }, [
  r({ nome: 'Cumprimentar um conhecido', descricao: 'Passa por alguém que conhece e para um instante para cumprimentar.', tipo: 'Conversar', alvo: P, peso: 1.5, fica: 0.8, gesto: 'talk', social: 0.08, laco: 1, considera: [acordado(), laco(), livre(0.4), traco('sociável', 'sociability', 0.4), perto(8, 0.1)] }),
  r({ nome: 'Conversar com um amigo', descricao: 'Encontra um amigo livre e conversa um pouco.', tipo: 'Conversar', alvo: P, peso: 2.5, fica: 3, gesto: 'talk', social: 0.45, outro: 0.3, laco: 3, considera: [folga(0.3), acordado(), solidao(0.3), doAlvo('amigo', 'amigo'), livre(), perto()] }),
  r({ nome: 'Fofocar com um vizinho', descricao: 'No fim da tarde, troca as novidades da aldeia com alguém de quem gosta.', tipo: 'Conversar', alvo: P, peso: 2.2, fica: 3, gesto: 'talk', social: 0.35, outro: 0.25, laco: 1, considera: [folga(), entardecer(), gostaDele(), doAlvo('adulto', 'adulto', 0.3), livre(), traco('sociável', 'sociability', 0.6), perto()] }),
  r({ nome: 'Contar uma piada', descricao: 'O carismático conta uma piada a quem está por perto.', tipo: 'Conversar', alvo: P, peso: 1.9, fica: 1.5, gesto: 'cheer', social: 0.25, outro: 0.25, laco: 2, considera: [folga(0.3), acordado(), livre(), traco('carismático', 'charisma', 0.7), laco(), perto(12)] }),
  r({ nome: 'Desabafar com o parceiro', descricao: 'Com o peito apertado, conta tudo ao parceiro.', tipo: 'Conversar', alvo: P, peso: 2.8, fica: 3, gesto: 'talk', social: 0.6, outro: 0.3, laco: 3, considera: [solidao(0.45), acordado(), doAlvo('parceiro', 'parceiro'), livre(0.3), perto(40)] }),
  r({ nome: 'Namorar', descricao: 'No fim da tarde, passa um tempo com o parceiro.', tipo: 'Cortejar', alvo: P, peso: 2.5, fica: 4, gesto: 'talk', social: 0.5, outro: 0.5, laco: 4, considera: [folga(0.15), entardecer(0.4), doAlvo('parceiro', 'parceiro'), livre(), ...bem(), perto(40)] }),
  r({ nome: 'Cortejar alguém', descricao: 'De quem gosta muito e ainda não é seu par, chega perto e puxa conversa.', tipo: 'Cortejar', alvo: P, peso: 2, fica: 3, gesto: 'talk', social: 0.3, laco: 3, considera: [folga(), acordado(), c('gosta muito', E.alvo, curva.limiar(0.7, 12), { stat: 'laco' }), doAlvo('adulto', 'adulto'), c('não é parente', E.alvo, curva.nao(0), { stat: 'familia' }), c('não é par', E.alvo, curva.nao(0), { stat: 'parceiro' }), traco('ousado', 'courage', 0.4), perto()] }),
  r({ nome: 'Discutir com um rival', descricao: 'Topa com um rival e a discussão começa.', tipo: 'Discutir', alvo: P, peso: 2, fica: 2, gesto: 'talk', social: 0.1, laco: -4, considera: [acordado(), doAlvo('rival', 'rival'), traco('briguento', 'aggression', 0.7), perto(10, 0.1)] }),
  r({ nome: 'Implicar com alguém', descricao: 'O briguento implica com quem não gosta.', tipo: 'Discutir', alvo: P, peso: 1.5, fica: 1.5, gesto: 'talk', laco: -2, considera: [acordado(), naoGosta(), doAlvo('adulto', 'adulto', 0.5), traco('briguento', 'aggression', 0.9), perto(10, 0.1)] }),
  r({ nome: 'Fazer as pazes', descricao: 'O bondoso procura o rival para acabar com a briga.', tipo: 'Conversar', alvo: P, peso: 1.9, fica: 3, gesto: 'talk', social: 0.2, laco: 8, considera: [folga(0.3), acordado(), doAlvo('rival', 'rival'), traco('bondoso', 'kindness', 0.7), traco('leal', 'loyalty', 0.3), perto()] }),
  r({ nome: 'Consolar quem está sozinho', descricao: 'Vê alguém triste e sozinho e vai fazer companhia.', tipo: 'Cuidar', alvo: P, peso: 2.2, fica: 3, gesto: 'talk', social: 0.2, outro: 0.5, laco: 3, considera: [acordado(), c('sozinho', E.alvo, curva.limiar(0.55, 10), { stat: 'sozinho' }), traco('bondoso', 'kindness', 0.7), livre(0.5), perto()] }),
  r({ nome: 'Dar de comer a quem está fraco', descricao: 'Alguém fraco de fome: o bondoso leva comida do celeiro.', tipo: 'Doar', alvo: P, peso: 2.8, fica: 1.5, gesto: 'carry', alimenta: 0.3, laco: 4, considera: [c('fraco', E.alvo, curva.limiar(0.4, 10), { stat: 'fraco' }), c('celeiro tem', E.eu, curva.nao(0.05), { stat: 'semComida' }), traco('bondoso', 'kindness', 0.8), perto()] }),
  r({ nome: 'Ajudar um cansado', descricao: 'Vê alguém exausto e dá uma mão para ele descansar.', tipo: 'Cuidar', alvo: P, peso: 1.8, fica: 2, gesto: 'carry', aliviar: 0.25, laco: 2, considera: [acordado(), c('cansado', E.alvo, curva.limiar(0.6, 10), { stat: 'cansado' }), traco('bondoso', 'kindness', 0.6), ...bem(), perto()] }),
  r({ nome: 'Trocar ideias com um colega', descricao: 'Conversa sobre o ofício com alguém do mesmo ofício.', tipo: 'Conversar', alvo: P, peso: 1.9, fica: 2.5, gesto: 'talk', social: 0.3, outro: 0.2, laco: 2, considera: [folga(0.3), acordado(), doAlvo('colega', 'colega'), livre(), traco('curioso', 'curiosity', 0.4), perto()] }),
  r({ nome: 'Pedir conselho a um idoso', descricao: 'Com uma dúvida da vida, vai ouvir um idoso.', tipo: 'Conversar', alvo: P, peso: 1.8, fica: 3, gesto: 'talk', social: 0.3, outro: 0.4, laco: 2, considera: [folga(0.3), acordado(), doAlvo('idoso', 'idoso'), traco('paciente', 'patience', 0.4), laco(), perto()] }),
  r({ nome: 'Brincar com uma criança', descricao: 'O bondoso brinca um pouco com uma criança da aldeia.', tipo: 'Brincar', alvo: P, peso: 1.8, fica: 2.5, gesto: 'cheer', social: 0.2, outro: 0.4, laco: 2, considera: [folga(), acordado(), doAlvo('criança', 'crianca'), traco('bondoso', 'kindness', 0.5), ...bem(), perto()] }),
  r({ nome: 'Acompanhar um amigo', descricao: 'Vai junto com um amigo aonde ele estiver indo.', tipo: 'Seguir', alvo: P, peso: 1.6, fica: 3, gesto: 'none', social: 0.25, laco: 1, considera: [folga(), acordado(), solidao(0.35), doAlvo('amigo', 'amigo'), traco('apegado', 'attachment', 0.5), perto(20)] }),
  r({ nome: 'Apresentar-se a alguém', descricao: 'O curioso puxa conversa com alguém da aldeia que mal conhece.', tipo: 'Conversar', alvo: P, peso: 1.6, fica: 2, gesto: 'talk', social: 0.2, outro: 0.15, laco: 3, considera: [folga(0.3), acordado(), c('mal conhece', E.alvo, curva.lombada(0.5, 0.05, 0), { stat: 'laco' }), livre(), traco('curioso', 'curiosity', 0.5), traco('sociável', 'sociability', 0.4), perto(12)] }),
  r({ nome: 'Rir com os amigos', descricao: 'No fim da tarde, ri das histórias do dia com um amigo.', tipo: 'Conversar', alvo: P, peso: 2.2, fica: 2.5, gesto: 'cheer', social: 0.4, outro: 0.4, laco: 2, considera: [folga(), entardecer(), doAlvo('amigo', 'amigo'), livre(), perto()] }),
  r({ nome: 'Ouvir quem precisa', descricao: 'O paciente ouve alguém que precisa falar.', tipo: 'Conversar', alvo: P, peso: 1.8, fica: 3, gesto: 'talk', social: 0.15, outro: 0.5, laco: 2, considera: [acordado(), c('sozinho', E.alvo, curva.limiar(0.45, 10), { stat: 'sozinho' }), traco('paciente', 'patience', 0.7), livre(0.3), perto()] }),
  r({ nome: 'Elogiar o trabalho de alguém', descricao: 'Passa por alguém trabalhando e elogia o que ele faz.', tipo: 'Conversar', alvo: P, peso: 1.4, fica: 1, gesto: 'talk', social: 0.05, laco: 2, considera: [acordado(), c('trabalhando', E.alvo, curva.nao(0), { stat: 'livre' }), doAlvo('adulto', 'adulto'), traco('gentil', 'kindness', 0.5), traco('carismático', 'charisma', 0.3), perto(8, 0.1)] }),
  r({ nome: 'Reclamar da vida', descricao: 'Cansado ou com fome, reclama com um amigo.', tipo: 'Conversar', alvo: P, peso: 1.6, fica: 2, gesto: 'talk', social: 0.25, laco: 1, considera: [acordado(), c('a vida pesa', E.eu, curva.limiar(0.35, 8), { stat: 'cansaco' }), doAlvo('amigo', 'amigo', 0.3), livre(), perto()] }),
  r({ nome: 'Apostar com alguém', descricao: 'O ganancioso aposta qualquer coisa com um conhecido.', tipo: 'Conversar', alvo: P, peso: 1.4, fica: 2, gesto: 'cheer', social: 0.2, laco: 1, considera: [folga(), acordado(), doAlvo('adulto', 'adulto'), livre(), traco('ganancioso', 'greed', 0.7), laco(), perto(12)] }),
  r({ nome: 'Desafiar para uma luta de brincadeira', descricao: 'O forte desafia um conhecido para uma luta de mentira.', tipo: 'Treinar', alvo: P, peso: 1.4, fica: 2, gesto: 'hammer', social: 0.15, outro: 0.1, laco: 1, considera: [folga(), entardecer(0.4), doAlvo('adulto', 'adulto'), livre(), traco('forte', 'strength', 0.6), traco('corajoso', 'courage', 0.4), perto(12)] }),
  r({ nome: 'Contar as novidades', descricao: 'Quem soube de algo corre para contar a um conhecido.', tipo: 'Conversar', alvo: P, peso: 1.5, fica: 1.5, gesto: 'talk', social: 0.15, outro: 0.1, laco: 1, considera: [acordado(), laco(), livre(), traco('falante', 'sociability', 0.5), traco('curioso', 'curiosity', 0.3), perto(12)] }),
  r({ nome: 'Dividir o almoço com um colega', descricao: 'Na pausa do meio do dia, come junto com alguém do mesmo ofício.', tipo: 'Comer', alvo: P, peso: 1.8, fica: 2, gesto: 'rest', dia: 'eat', social: 0.25, come: 0.15, laco: 2, considera: [deDia(0.05), c('fome leve', E.eu, curva.lombada(0.3, 0.15, 0), { stat: 'fome' }), doAlvo('colega', 'colega', 0.4), livre(), perto(12)] }),
]);

/** Pacote 41: a família e quem precisa de cuidado. */
export const FAMILIA_DA_ALDEIA = pacote({ id: 41, nome: 'Família na aldeia', camada: 'Vínculos', descricao: 'Filhos, pais, parceiro e quem precisa de cuidado.' }, [
  r({ nome: 'Abraçar o filho', descricao: 'Vê o filho e para para um abraço.', tipo: 'Cuidar', alvo: P, peso: 1.9, fica: 1, gesto: 'talk', social: 0.15, outro: 0.25, laco: 3, considera: [acordado(), doAlvo('filho', 'filho'), traco('carinhoso', 'familism', 0.5), perto(12)] }),
  r({ nome: 'Cuidar do filho pequeno', descricao: 'Fica de olho no filho pequeno.', tipo: 'Cuidar', alvo: P, peso: 2.4, fica: 4, gesto: 'none', social: 0.2, outro: 0.4, laco: 2, considera: [folga(0.3), acordado(), doAlvo('filho', 'filho'), doAlvo('criança', 'crianca'), traco('familiar', 'familism', 0.6), perto(30)] }),
  r({ nome: 'Ensinar o filho', descricao: 'Mostra ao filho como se faz o que ele faz.', tipo: 'Ensinar', alvo: P, peso: 2, fica: 3, gesto: 'talk', social: 0.15, outro: 0.25, laco: 2, considera: [folga(0.3), acordado(), doAlvo('filho', 'filho'), traco('paciente', 'patience', 0.5), ...bem(), perto(30)] }),
  r({ nome: 'Visitar os pais', descricao: 'Vai ver o pai ou a mãe.', tipo: 'Seguir', alvo: P, peso: 2.1, fica: 3, gesto: 'talk', social: 0.4, outro: 0.3, laco: 3, considera: [folga(), acordado(), doAlvo('pai ou mãe', 'parente'), traco('apegado', 'attachment', 0.5), perto(40)] }),
  r({ nome: 'Cuidar de um idoso da família', descricao: 'Ajuda um idoso da família no que ele precisar.', tipo: 'Cuidar', alvo: P, peso: 2.1, fica: 3, gesto: 'carry', social: 0.15, outro: 0.3, aliviar: 0.2, laco: 3, considera: [acordado(), doAlvo('idoso', 'idoso'), doAlvo('família', 'familia'), traco('bondoso', 'kindness', 0.5), perto(30)] }),
  r({ nome: 'Cuidar de um doente', descricao: 'Alguém está fraco: senta do lado e cuida dele.', tipo: 'Cuidar', alvo: P, peso: 2.4, fica: 4, gesto: 'pray', outro: 0.3, aliviar: 0.3, alimenta: 0.15, laco: 4, considera: [c('fraco', E.alvo, curva.limiar(0.55, 10), { stat: 'fraco' }), traco('bondoso', 'kindness', 0.6), laco(), perto(30)] }),
  r({ nome: 'Jantar com a família', descricao: 'No fim da tarde, come em casa com a família.', tipo: 'Comer', alvo: WOT.casa, peso: 2.5, fica: 3, gesto: 'rest', dia: 'eat', social: 0.3, come: 0.3, considera: [folga(0.1), entardecer(0.2), c('apetite', E.eu, curva.sobe(0.3, 1), { stat: 'fome' }), doAlvo('tem comida', 'comida'), traco('familiar', 'familism', 0.4), perto(60, 0.3)] }),
  r({ nome: 'Contar o dia ao parceiro', descricao: 'No fim da tarde, conta ao parceiro como foi o dia.', tipo: 'Conversar', alvo: P, peso: 2.4, fica: 3, gesto: 'talk', social: 0.4, outro: 0.4, laco: 2, considera: [folga(), entardecer(), doAlvo('parceiro', 'parceiro'), livre(), perto(40)] }),
  r({ nome: 'Pôr as crianças para dormir', descricao: 'À noitinha, leva o filho pequeno para a cama.', tipo: 'Cuidar', alvo: P, peso: 2.5, fica: 2, gesto: 'rest', outro: 0.2, aliviar: 0.2, laco: 2, considera: [c('anoitecer', E.eu, curva.lombada(0.5, 0.3, 0.05), { stat: 'noite' }), doAlvo('filho', 'filho'), doAlvo('criança', 'crianca'), perto(40)] }),
  r({ nome: 'Ralhar com o filho', descricao: 'O impaciente dá uma bronca no filho.', tipo: 'Discutir', alvo: P, peso: 1.4, fica: 1.5, gesto: 'talk', laco: -1, considera: [acordado(), doAlvo('filho', 'filho'), traco('impaciente', 'patience', -0.7), traco('bravo', 'aggression', 0.4), perto(12)] }),
  r({ nome: 'Preparar a comida da família', descricao: 'No fim da tarde, prepara a comida em casa.', tipo: 'FicarParado', alvo: WOT.casa, peso: 2, fica: 3, gesto: 'hammer', dia: 'eat', considera: [folga(0.2), entardecer(0.3), doAlvo('tem comida', 'comida'), traco('familiar', 'familism', 0.6), perto(60, 0.3)] }),
  r({ nome: 'Fazer um brinquedo', descricao: 'O jeitoso talha um brinquedo para as crianças de casa.', tipo: 'FicarParado', alvo: WOT.casa, peso: 1.4, fica: 4, gesto: 'hammer', descanso: 0.05, considera: [folga(), acordado(), traco('jeitoso', 'dexterity', 0.6), traco('familiar', 'familism', 0.5), perto(40)] }),
  r({ nome: 'Lembrar os mortos da família', descricao: 'Reza em casa pelos parentes que já morreram.', tipo: 'Rezar', alvo: WOT.casa, peso: 1.6, fica: 3, gesto: 'pray', dia: 'pray', fe: 0.25, considera: [folga(), acordado(), fe(0.3), traco('familiar', 'familism', 0.5), perto(40)] }),
  r({ nome: 'Cuidar do parceiro cansado', descricao: 'O parceiro está exausto: ajuda para ele descansar.', tipo: 'Cuidar', alvo: P, peso: 2, fica: 2, gesto: 'carry', aliviar: 0.3, outro: 0.2, laco: 3, considera: [acordado(), doAlvo('parceiro', 'parceiro'), c('cansado', E.alvo, curva.limiar(0.5, 10), { stat: 'cansado' }), perto(30)] }),
  r({ nome: 'Contar histórias às crianças', descricao: 'No fim da tarde, conta histórias antigas às crianças.', tipo: 'Ensinar', alvo: P, peso: 2, fica: 4, gesto: 'talk', social: 0.3, outro: 0.4, laco: 2, considera: [folga(0.2), entardecer(0.3), doAlvo('criança', 'crianca'), traco('falante', 'sociability', 0.4), traco('paciente', 'patience', 0.3), perto(20)] }),
]);

/** Pacote 42: os lugares da aldeia (praça, templo, celeiro, casa, obra). */
export const LUGARES_DA_ALDEIA = pacote({ id: 42, nome: 'Lugares da aldeia', camada: 'Lugar', descricao: 'Templo, praça, poço, celeiro e obra, fora do trabalho.' }, [
  r({ nome: 'Rezar em casa', descricao: 'Com vontade de rezar e sem templo perto, reza em casa.', tipo: 'Rezar', alvo: WOT.casa, peso: 2, fica: 2.5, gesto: 'pray', dia: 'pray', fe: 0.45, considera: [acordado(), fe(0.4), traco('devoto', 'faith', 0.5), perto(40)] }),
  r({ nome: 'Acender uma vela no templo', descricao: 'O devoto passa no templo e acende uma vela.', tipo: 'Rezar', alvo: WOT.templo, peso: 2, fica: 2, gesto: 'pray', dia: 'pray', fe: 0.3, considera: [acordado(), fe(0.25), traco('devoto', 'faith', 0.7), perto(50)] }),
  r({ nome: 'Agradecer pelo dia', descricao: 'No fim da tarde, agradece no templo pelo dia que passou.', tipo: 'Rezar', alvo: WOT.templo, peso: 1.9, fica: 2.5, gesto: 'pray', dia: 'pray', fe: 0.3, social: 0.1, considera: [folga(), entardecer(), traco('devoto', 'faith', 0.5), perto(50)] }),
  r({ nome: 'Pedir proteção no templo', descricao: 'O medroso vai ao templo pedir proteção.', tipo: 'Rezar', alvo: WOT.templo, peso: 1.8, fica: 2.5, gesto: 'pray', dia: 'pray', fe: 0.35, considera: [acordado(), fe(0.3), traco('medroso', 'courage', -0.7), perto(50)] }),
  r({ nome: 'Sentar perto do templo', descricao: 'Senta à porta do templo em silêncio.', tipo: 'FicarParado', alvo: WOT.templo, peso: 1.5, fica: 3, gesto: 'rest', dia: 'pray', fe: 0.15, descanso: 0.08, considera: [folga(), acordado(), traco('devoto', 'faith', 0.4), traco('paciente', 'patience', 0.3), perto(50)] }),
  r({ nome: 'Ouvir o sacerdote', descricao: 'Fica à porta do templo ouvindo o que se fala lá dentro.', tipo: 'Rezar', alvo: WOT.templo, peso: 1.5, fica: 3, gesto: 'none', dia: 'pray', fe: 0.2, social: 0.1, considera: [folga(0.3), acordado(), fe(0.2), traco('curioso', 'curiosity', 0.4), perto(50)] }),
  r({ nome: 'Passear pela praça ao entardecer', descricao: 'No fim da tarde, dá uma volta pela praça.', tipo: 'Passear', alvo: WOT.praca, peso: 2.2, fica: 3, gesto: 'none', social: 0.25, considera: [folga(0.15), entardecer(), traco('sociável', 'sociability', 0.4), ...bem(), perto(40)] }),
  r({ nome: 'Ver as crianças brincando', descricao: 'Fica na praça olhando as crianças brincarem.', tipo: 'FicarParado', alvo: WOT.praca, peso: 1.6, fica: 3, gesto: 'rest', descanso: 0.05, social: 0.15, considera: [folga(), acordado(), gente(), traco('familiar', 'familism', 0.5), perto(40)] }),
  r({ nome: 'Conferir o celeiro', descricao: 'O preocupado vai ver quanto ainda tem no celeiro.', tipo: 'Passear', alvo: WOT.celeiro, peso: 1.2, fica: 1.5, gesto: 'none', dia: 'curious', considera: [acordado(), c('celeiro baixo', E.eu, curva.sobe(0.2, 1), { stat: 'semComida' }), traco('ambicioso', 'ambition', 0.4), traco('ganancioso', 'greed', 0.3), perto(40)] }),
  r({ nome: 'Varrer a praça', descricao: 'O prestativo varre a praça num momento livre.', tipo: 'FicarParado', alvo: WOT.praca, peso: 1.4, fica: 3, gesto: 'dig', considera: [folga(0.4), acordado(), traco('prestativo', 'kindness', 0.5), traco('diligente', 'diligence', 0.4), perto(30)] }),
  r({ nome: 'Admirar a obra nova', descricao: 'Vai ver como anda a obra que estão levantando.', tipo: 'Passear', alvo: WOT.obra, peso: 1.4, fica: 2, gesto: 'none', dia: 'curious', social: 0.05, considera: [folga(0.3), acordado(), traco('curioso', 'curiosity', 0.6), perto(30)] }),
  r({ nome: 'Ver a roça crescer', descricao: 'Passa pela roça só para ver como está a plantação.', tipo: 'Passear', alvo: WOT.roca, peso: 1.2, fica: 2, gesto: 'none', dia: 'curious', considera: [folga(0.3), acordado(), doAlvo('safra', 'safra', 0.3), traco('paciente', 'patience', 0.3), perto(30)] }),
  r({ nome: 'Buscar água no poço', descricao: 'Leva água do poço da praça para casa.', tipo: 'Beber', alvo: WOT.praca, peso: 1.6, fica: 2, gesto: 'dig', dia: 'water', considera: [deDia(0.2), traco('familiar', 'familism', 0.4), maos(), perto(30)] }),
  r({ nome: 'Dançar na praça', descricao: 'Com gente na praça no fim da tarde, o animado dança.', tipo: 'Festejar', alvo: WOT.praca, peso: 2, fica: 3, gesto: 'cheer', dia: 'festival', social: 0.5, considera: [folga(0.1), entardecer(0.2), gente(), traco('sociável', 'sociability', 0.6), ...bem(), perto(40)] }),
  r({ nome: 'Cantar na praça', descricao: 'O carismático canta para quem estiver na praça.', tipo: 'Festejar', alvo: WOT.praca, peso: 1.8, fica: 3, gesto: 'cheer', dia: 'festival', social: 0.4, considera: [folga(0.15), entardecer(0.3), gente(), traco('carismático', 'charisma', 0.7), perto(40)] }),
  r({ nome: 'Mostrar o que fez', descricao: 'O ambicioso leva à praça algo que fez para os outros verem.', tipo: 'Passear', alvo: WOT.praca, peso: 1.4, fica: 2, gesto: 'talk', social: 0.2, considera: [folga(), acordado(), gente(), traco('ambicioso', 'ambition', 0.6), perto(40)] }),
  r({ nome: 'Esperar alguém na praça', descricao: 'Com vontade de companhia, espera na praça alguém aparecer.', tipo: 'FicarParado', alvo: WOT.praca, peso: 1.6, fica: 3, gesto: 'none', social: 0.12, considera: [folga(0.3), acordado(), solidao(0.35), perto(40)] }),
  r({ nome: 'Ver se chegou comida', descricao: 'Com fome e o celeiro baixo, vai ver se chegou alguma carga.', tipo: 'Passear', alvo: WOT.celeiro, peso: 1.5, fica: 1.5, gesto: 'none', dia: 'curious', considera: [fome(0.3), c('celeiro baixo', E.eu, curva.sobe(0.1, 1), { stat: 'semComida' }), perto(40)] }),
  r({ nome: 'Vigiar o portão à noite', descricao: 'O corajoso fica um pouco no portão olhando a escuridão.', tipo: 'Patrulhar', alvo: WOT.portao, peso: 1.4, fica: 3, gesto: 'none', dia: 'curious', considera: [aNoite(0.2), c('sem sono', E.eu, curva.desce(1, 0.1), { stat: 'cansaco' }), traco('corajoso', 'courage', 0.7), perto(40)] }),
  r({ nome: 'Sentar no banco da praça', descricao: 'Cansado no fim da tarde, senta na praça antes de ir para casa.', tipo: 'FicarParado', alvo: WOT.praca, peso: 1.8, fica: 3, gesto: 'rest', dia: 'rest', descanso: 0.15, social: 0.1, considera: [folga(0.2), entardecer(0.4), cansaco(0.25), perto(40)] }),
]);

/** Pacote 43: o ofício fora do turno e os passatempos de quem tem mão para alguma coisa. */
export const PASSATEMPOS_DA_ALDEIA = pacote({ id: 43, nome: 'Ofício e passatempos', camada: 'Sustento', descricao: 'Cuidar das ferramentas, treinar, aprender com um colega, talhar e tecer.' }, [
  r({ nome: 'Afiar as ferramentas', descricao: 'No fim da tarde, afia as ferramentas para o dia seguinte.', tipo: 'FicarParado', alvo: WOT.casa, peso: 1.6, fica: 3, gesto: 'hammer', considera: [folga(0.2), entardecer(0.4), traco('diligente', 'diligence', 0.6), perto(40)] }),
  r({ nome: 'Consertar a casa', descricao: 'Remenda uma parede ou o telhado de casa.', tipo: 'Construir', alvo: WOT.casa, peso: 1.5, fica: 3, gesto: 'hammer', considera: [folga(0.35), acordado(), traco('diligente', 'diligence', 0.4), traco('jeitoso', 'dexterity', 0.4), ...bem(), perto(40)] }),
  r({ nome: 'Treinar com a lança', descricao: 'O corajoso treina com a lança na praça.', tipo: 'Treinar', alvo: WOT.praca, peso: 1.5, fica: 3, gesto: 'hammer', considera: [folga(0.3), acordado(), traco('corajoso', 'courage', 0.6), traco('forte', 'strength', 0.4), ...bem(), perto(40)] }),
  r({ nome: 'Praticar o ofício em casa', descricao: 'O ambicioso pratica o ofício em casa para ficar melhor.', tipo: 'Produzir', alvo: WOT.casa, peso: 1.6, fica: 3, gesto: 'hammer', considera: [folga(), entardecer(0.4), traco('ambicioso', 'ambition', 0.7), ...bem(), perto(40)] }),
  r({ nome: 'Ajudar um colega no trabalho', descricao: 'Vê um colega trabalhando e dá uma mão.', tipo: 'Cuidar', alvo: P, peso: 1.6, fica: 3, gesto: 'carry', aliviar: 0.15, laco: 2, considera: [deDia(0.2), doAlvo('colega', 'colega'), c('trabalhando', E.alvo, curva.nao(0), { stat: 'livre' }), traco('prestativo', 'kindness', 0.5), ...bem(), perto(16)] }),
  r({ nome: 'Aprender com um colega', descricao: 'Fica olhando um colega mais experiente trabalhar.', tipo: 'Aprender', alvo: P, peso: 1.5, fica: 3, gesto: 'none', laco: 2, considera: [deDia(0.2), doAlvo('colega', 'colega'), traco('curioso', 'curiosity', 0.5), traco('ambicioso', 'ambition', 0.3), perto(16)] }),
  r({ nome: 'Planejar o dia seguinte', descricao: 'Antes de dormir, o ambicioso pensa no que fazer amanhã.', tipo: 'FicarParado', alvo: WOT.casa, peso: 1.5, fica: 2, gesto: 'rest', dia: 'rest', considera: [c('anoitecer', E.eu, curva.lombada(0.5, 0.3, 0.05), { stat: 'noite' }), traco('ambicioso', 'ambition', 0.6), perto(40)] }),
  r({ nome: 'Talhar madeira', descricao: 'O jeitoso talha um pedaço de madeira à toa.', tipo: 'FicarParado', peso: 1.5, fica: 4, gesto: 'hammer', dia: 'rest', descanso: 0.05, considera: [folga(), acordado(), traco('jeitoso', 'dexterity', 0.7), maos()] }),
  r({ nome: 'Tecer um cesto', descricao: 'O paciente tece um cesto sentado em casa.', tipo: 'FicarParado', alvo: WOT.casa, peso: 1.5, fica: 4, gesto: 'hammer', dia: 'rest', descanso: 0.05, considera: [folga(), entardecer(0.4), traco('paciente', 'patience', 0.6), traco('jeitoso', 'dexterity', 0.3), perto(40)] }),
  r({ nome: 'Juntar gravetos', descricao: 'Junta gravetos pela aldeia para o fogo de casa.', tipo: 'Coletar', peso: 1.4, fica: 2, gesto: 'pick', anda: true, considera: [deDia(0.2), traco('diligente', 'diligence', 0.4), traco('familiar', 'familism', 0.3), maos(), ...bem()] }),
  r({ nome: 'Colher ervas', descricao: 'O curioso procura ervas de chá e de remédio.', tipo: 'Coletar', peso: 1.4, fica: 2.5, gesto: 'reap', anda: true, considera: [deDia(0.2), traco('curioso', 'curiosity', 0.5), traco('paciente', 'patience', 0.3), maos(), ...bem()] }),
  r({ nome: 'Ler o tempo no céu', descricao: 'Olha as nuvens no fim da tarde para saber como será amanhã.', tipo: 'FicarParado', peso: 1.2, fica: 2, gesto: 'none', dia: 'curious', considera: [folga(), entardecer(0.3), traco('curioso', 'curiosity', 0.4), traco('paciente', 'patience', 0.3)] }),
  r({ nome: 'Contar o que tem guardado', descricao: 'O ganancioso confere em casa o que tem guardado.', tipo: 'FicarParado', alvo: WOT.casa, peso: 1.2, fica: 2, gesto: 'pick', considera: [folga(), acordado(), traco('ganancioso', 'greed', 0.8), perto(40)] }),
  r({ nome: 'Mostrar o ofício a um curioso', descricao: 'Mostra a um conhecido livre como se faz o que ele faz.', tipo: 'Ensinar', alvo: P, peso: 1.4, fica: 2.5, gesto: 'talk', social: 0.15, outro: 0.15, laco: 2, considera: [folga(0.3), acordado(), doAlvo('adulto', 'adulto', 0.4), livre(), traco('carismático', 'charisma', 0.5), laco(), perto(12)] }),
  r({ nome: 'Fazer força', descricao: 'O forte carrega pedras ou faz força para não perder o braço.', tipo: 'Treinar', peso: 1.2, fica: 3, gesto: 'carry', considera: [folga(0.3), acordado(), traco('forte', 'strength', 0.7), ...bem(), maos()] }),
]);

/** Pacote 44: a infância (além de brincar na praça e ficar perto dos pais, em pacotes.ts). */
export const BRINCADEIRAS_DA_ALDEIA = pacote({ id: 44, nome: 'Brincadeiras', camada: 'Vínculos', descricao: 'Correr, esconder, imitar os adultos, ouvir histórias e fazer travessuras.' }, [
  r({ nome: 'Correr pela aldeia', descricao: 'Sai correndo entre as casas.', tipo: 'Vagar', peso: 2, fica: 1, gesto: 'cheer', anda: true, social: 0.1, considera: [deDia(0.1), traco('agitado', 'patience', -0.4), ...bem()] }),
  r({ nome: 'Brincar de esconde-esconde', descricao: 'Com outras crianças na praça, brinca de se esconder.', tipo: 'Brincar', alvo: WOT.praca, peso: 2.4, fica: 3, gesto: 'cheer', social: 0.4, considera: [deDia(0.1), gente(), traco('sociável', 'sociability', 0.4), ...bem(), perto(40)] }),
  r({ nome: 'Brincar com um amigo', descricao: 'Chama outra criança de quem gosta para brincar.', tipo: 'Brincar', alvo: P, peso: 2.5, fica: 3, gesto: 'cheer', social: 0.5, outro: 0.4, laco: 2, considera: [deDia(0.1), doAlvo('criança', 'crianca'), laco(), livre(0.3), ...bem(), perto(20)] }),
  r({ nome: 'Imitar o trabalho dos adultos', descricao: 'Finge que capina ou que martela, como os grandes.', tipo: 'Brincar', peso: 1.8, fica: 2.5, gesto: 'dig', considera: [deDia(0.1), traco('curioso', 'curiosity', 0.5), ...bem()] }),
  r({ nome: 'Ouvir uma história de um idoso', descricao: 'Senta perto de um idoso para ouvir histórias.', tipo: 'Aprender', alvo: P, peso: 2.1, fica: 4, gesto: 'none', social: 0.3, outro: 0.3, laco: 2, considera: [folga(0.3), acordado(), doAlvo('idoso', 'idoso'), traco('curioso', 'curiosity', 0.4), perto(20)] }),
  r({ nome: 'Seguir os pais no trabalho', descricao: 'Vai atrás do pai ou da mãe para ver o trabalho.', tipo: 'Seguir', alvo: P, peso: 1.9, fica: 3, gesto: 'none', social: 0.2, laco: 1, considera: [deDia(0.2), doAlvo('pai ou mãe', 'parente'), traco('apegado', 'attachment', 0.5), perto(30)] }),
  r({ nome: 'Brigar com outra criança', descricao: 'A criança brava briga com outra por qualquer coisa.', tipo: 'Discutir', alvo: P, peso: 1.4, fica: 1.5, gesto: 'talk', laco: -2, considera: [acordado(), doAlvo('criança', 'crianca'), naoGosta(), traco('brava', 'aggression', 0.8), perto(10, 0.1)] }),
  r({ nome: 'Fazer travessura', descricao: 'Sai pela aldeia aprontando alguma.', tipo: 'Vagar', peso: 1.4, fica: 1.5, gesto: 'cheer', anda: true, considera: [deDia(0.1), traco('levada', 'aggression', 0.5), traco('curiosa', 'curiosity', 0.4), ...bem()] }),
  r({ nome: 'Pedir comida aos pais', descricao: 'Com fome, vai pedir comida ao pai ou à mãe.', tipo: 'Seguir', alvo: P, peso: 2.2, fica: 1.5, gesto: 'none', dia: 'eat', come: 0.3, laco: 1, considera: [fome(0.3), doAlvo('pai ou mãe', 'parente'), c('celeiro tem', E.eu, curva.nao(0.05), { stat: 'semComida' }), perto(40)] }),
  r({ nome: 'Cochilar depois de brincar', descricao: 'Cansada de brincar, tira um cochilo em casa.', tipo: 'Dormir', alvo: WOT.casa, peso: 2, fica: 3, gesto: 'rest', dia: 'rest', descanso: 0.35, considera: [cansaco(0.3), deDia(0.3), perto(40)] }),
]);

export const ROTINA_DA_ALDEIA = [OCIO_DA_ALDEIA, GENTE_DA_ALDEIA, FAMILIA_DA_ALDEIA, LUGARES_DA_ALDEIA, PASSATEMPOS_DA_ALDEIA, BRINCADEIRAS_DA_ALDEIA];
