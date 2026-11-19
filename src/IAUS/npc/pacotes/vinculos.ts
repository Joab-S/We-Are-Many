/**
 * Camada 3, os vínculos: amizade, rivalidade, namoro, casamento, filhos e o cuidado com quem precisa.
 * É daqui que vem a "boa relação" que faz um andarilho decidir ficar perto de quem já mora num lugar.
 */
import { curva } from '../curvas';
import { c, pacote } from '../dsl';
import { E } from '../entradas';
import { S, TAG, WOT, inv } from '../vocab';

const CAMADA = 'Vínculos';

/** Pacote 6: vida social. */
export const SOCIAL = pacote({ id: 6, nome: 'Vida social', camada: CAMADA, descricao: 'Conversar, fazer amigos, ajudar, brigar com rivais e evitar quem não gosta.' }, [
  {
    nome: 'Conversar com um conhecido',
    descricao: 'Sentindo-se só, procura alguém de quem gosta para conversar.',
    tipo: 'Conversar',
    contexto: 'alvo',
    alvos: [WOT.pessoa],
    continuo: true,
    peso: 2,
    params: { assunto: 'amizade' },
    considera: [
      c('solidão', E.eu, curva.limiar(0.4, 8), { stat: S.solidao }),
      c('gosto dele', E.laco, curva.faixa(-20, 80, 0.1, 1)),
      c('perto', E.DistanceToTarget, curva.perto(20, 0.05)),
      c('não falou agora com ele', E.TimeSinceThisContext, curva.faixa(0, 60, 0.05, 1)),
    ],
  },
  {
    nome: 'Puxar amizade com alguém novo',
    descricao: 'Sociável, vai conhecer alguém com quem tem afinidade.',
    tipo: 'Conversar',
    contexto: 'alvo',
    alvos: [WOT.pessoa],
    continuo: true,
    peso: 1.6,
    params: { assunto: 'conhecer' },
    considera: [
      c('ainda não conhece', E.laco, { ...curva.lombada(0.5, 0.12, 0.05), min: -100, max: 100 }),
      c('afinidade', E.compatibilidade, curva.faixa(-1, 1, 0.1, 1)),
      c('sociável', E.eu, curva.traco(0.6), { stat: 'tr.sociability' }),
      c('perto', E.DistanceToTarget, curva.perto(15, 0.05)),
      c('não falou agora com ele', E.TimeSinceThisContext, curva.faixa(0, 90, 0.05, 1)),
    ],
  },
  {
    nome: 'Ajudar quem passa fome',
    descricao: 'Gentil e com comida sobrando, dá parte ao vizinho que tem fome.',
    tipo: 'Doar',
    contexto: 'alvo',
    alvos: [WOT.pessoa],
    peso: 2.4,
    params: { bem: 'comida' },
    considera: [
      c('ele tem fome', E.alvo, curva.limiar(0.6, 10), { stat: S.fome }),
      c('tenho comida sobrando', E.eu, curva.faixa(1, 6), { stat: inv('comida') }),
      c('gentileza', E.eu, curva.traco(0.7), { stat: 'tr.kindness' }),
      c('gosto dele', E.laco, curva.faixa(-50, 60, 0.2, 1)),
      c('perto', E.DistanceToTarget, curva.perto(20, 0.05)),
    ],
  },
  {
    nome: 'Discutir com um rival',
    descricao: 'Agressivo, perto de quem detesta: briga (os dois saem piores).',
    tipo: 'Discutir',
    contexto: 'alvo',
    alvos: [WOT.pessoa],
    peso: 1.4,
    considera: [
      c('detesta', E.laco, curva.faixa(-100, -30, 1, 0)),
      c('agressividade', E.eu, curva.traco(0.8), { stat: 'tr.aggression' }),
      c('perto', E.DistanceToTarget, curva.perto(6, 0)),
      c('não brigou agora', E.TimeSinceThisContext, curva.faixa(0, 120, 0, 1)),
    ],
  },
  {
    nome: 'Evitar um rival',
    descricao: 'Pacífico, perto de quem detesta: se afasta.',
    tipo: 'Fugir',
    contexto: 'alvo',
    alvos: [WOT.pessoa],
    continuo: true,
    peso: 1.3,
    params: { ate: 10 },
    considera: [c('detesta', E.laco, curva.faixa(-100, -30, 1, 0)), c('paz', E.eu, curva.traco(-0.6), { stat: 'tr.aggression' }), c('perto', E.DistanceToTarget, curva.perto(8, 0))],
  },
]);

/** Pacote 7: família (namoro, casamento, filhos, cuidado). */
export const FAMILIA = pacote({ id: 7, nome: 'Família', camada: CAMADA, descricao: 'Cortejar, casar, ter filhos, cuidar deles e de quem está doente.' }, [
  {
    nome: 'Cortejar alguém',
    descricao: 'Adulto sem par, com um amigo muito próximo também sem par: corteja.',
    tipo: 'Cortejar',
    contexto: 'alvo',
    alvos: [WOT.pessoa],
    continuo: true,
    peso: 2,
    considera: [
      c('sou adulto', E.MyHasTag, curva.sim(), { tag: TAG.adulto }),
      c('não sou casado', E.MyHasTag, curva.nao(), { tag: TAG.casado }),
      c('ele é adulto', E.TargetHasTag, curva.sim(), { tag: TAG.adulto }),
      c('ele não é casado', E.TargetHasTag, curva.nao(), { tag: TAG.casado }),
      c('gosto muito', E.laco, { ...curva.limiar(0.85, 14), min: -100, max: 100 }),
      c('quer família', E.eu, curva.traco(0.5), { stat: 'tr.familism' }),
      c('perto', E.DistanceToTarget, curva.perto(20, 0.1)),
    ],
  },
  {
    nome: 'Casar',
    descricao: 'Namorando há um tempo e o laço é forte: casa.',
    tipo: 'Casar',
    contexto: 'alvo',
    alvos: [WOT.pessoa],
    peso: 2.6,
    considera: [
      c('namorando ele', E.creioQueAlvoE, curva.sim(), { tag: TAG.namorando }),
      c('ele não é casado', E.TargetHasTag, curva.nao(), { tag: TAG.casado }),
      c('laço forte', E.laco, { ...curva.limiar(0.9, 14), min: -100, max: 100 }),
      c('quer família', E.eu, curva.traco(0.4), { stat: 'tr.familism' }),
    ],
  },
  {
    nome: 'Ter um filho',
    descricao: 'Casado, com casa, comida e lugar na casa: o casal tem um filho.',
    tipo: 'TerFilho',
    contexto: 'eu',
    peso: 1.8,
    considera: [
      c('casado', E.MyHasTag, curva.sim(), { tag: TAG.casado }),
      c('tem casa', E.MyHasTag, curva.sim(), { tag: TAG.temCasa }),
      c('quer família', E.eu, curva.traco(0.6), { stat: 'tr.familism' }),
      c('cabe na casa', E.casaLotada, curva.faixa(0.5, 1.2, 1, 0)),
      c('sem fome', E.eu, curva.desce(1, 0), { stat: S.fome }),
      c('não teve filho agora', E.TimeSinceThisBehavior, curva.faixa(0, 600, 0, 1)),
    ],
  },
  {
    nome: 'Cuidar do filho',
    descricao: 'Vê o filho com fome ou sozinho e vai cuidar dele.',
    tipo: 'Cuidar',
    contexto: 'alvo',
    alvos: [WOT.pessoa],
    continuo: true,
    peso: 2.8,
    considera: [
      c('é meu filho', E.marcadoPorMim, curva.sim(), { tag: TAG.filho }),
      c('ele é criança', E.TargetHasTag, curva.sim(), { tag: TAG.crianca }),
      c('ele precisa', E.alvo, curva.sobe(0.1, 1), { stat: S.fome }),
      c('família', E.eu, curva.traco(0.5), { stat: 'tr.familism' }),
    ],
  },
  {
    nome: 'Cuidar de um idoso',
    descricao: 'Gentil, vê um idoso querido com fome e o ajuda.',
    tipo: 'Cuidar',
    contexto: 'alvo',
    alvos: [WOT.pessoa],
    continuo: true,
    peso: 1.8,
    considera: [
      c('é idoso', E.TargetHasTag, curva.sim(), { tag: TAG.idoso }),
      c('precisa', E.alvo, curva.limiar(0.5, 9), { stat: S.fome }),
      c('gosto dele', E.laco, curva.faixa(0, 80, 0.2, 1)),
      c('gentileza', E.eu, curva.traco(0.6), { stat: 'tr.kindness' }),
    ],
  },
]);

/** Pacote 17: infância. */
export const INFANCIA = pacote({ id: 17, nome: 'Infância', camada: CAMADA, descricao: 'Brincar, ficar perto dos pais e aprender olhando quem trabalha.' }, [
  {
    nome: 'Brincar',
    descricao: 'Criança entediada brinca (sozinha ou com outras crianças perto).',
    tipo: 'Brincar',
    contexto: 'eu',
    continuo: true,
    peso: 2,
    considera: [c('é criança', E.MyHasTag, curva.sim(), { tag: TAG.crianca }), c('tédio', E.eu, curva.sobe(0.3, 1), { stat: S.tedio })],
  },
  {
    nome: 'Ficar perto dos pais',
    descricao: 'Criança longe dos pais (ou com medo) vai para perto deles.',
    tipo: 'Seguir',
    contexto: 'alvo',
    alvos: [WOT.pessoa],
    continuo: true,
    peso: 2.2,
    considera: [
      c('é criança', E.MyHasTag, curva.sim(), { tag: TAG.crianca }),
      c('é meu pai ou mãe', E.creioQueAlvoE, curva.sim(), { tag: 'MeuPai' }),
      c('longe', E.DistanceToTarget, curva.faixa(3, 15, 0, 1)),
    ],
  },
  {
    nome: 'Olhar alguém trabalhar',
    descricao: 'Criança curiosa observa um adulto no ofício (ganha um pouco de jeito para ele).',
    tipo: 'Aprender',
    contexto: 'alvo',
    alvos: [WOT.pessoa],
    continuo: true,
    peso: 1.4,
    params: { modo: 'olhar' },
    considera: [
      c('é criança', E.MyHasTag, curva.sim(), { tag: TAG.crianca }),
      c('ele mostra um ofício', E.alvoMostraOficio, curva.sim()),
      c('curiosidade', E.eu, curva.traco(0.6), { stat: 'tr.curiosity' }),
      c('perto', E.DistanceToTarget, curva.perto(12, 0.05)),
    ],
  },
]);
