/**
 * Camada 2, a mente: o tédio e o que fazer com ele, e o Tagging System (o que a pessoa diz de si e percebe nos
 * outros). As tags que nascem aqui alimentam todo o resto: quem acha que conhece um lenhador pode encomendar
 * lenha a ele; quem marcou uma presa vai caçá-la; quem se vê ferreiro abre a ferraria.
 */
import { curva } from '../curvas';
import { c, pacote } from '../dsl';
import { E } from '../entradas';
import { S, TAG, WOT } from '../vocab';

const CAMADA = 'Mente';

/** Pacote 4: tédio e entretenimento. */
export const OCIO = pacote({ id: 4, nome: 'Tédio e entretenimento', camada: CAMADA, descricao: 'O tédio sobe quando nada acontece; cada um se distrai do seu jeito.' }, [
  {
    nome: 'Passear pela praça',
    descricao: 'Entediado, vai passear onde há movimento (praça, mercado, beira da água).',
    tipo: 'Passear',
    contexto: 'eu',
    continuo: true,
    peso: 1.3,
    considera: [
      c('tédio', E.eu, curva.limiar(0.45, 8), { stat: S.tedio }),
      c('sociável', E.eu, curva.traco(0.4), { stat: 'tr.sociability' }),
      c('mora num lugar', E.MyHasTag, curva.sim(0.3), { tag: TAG.morador }),
    ],
  },
  {
    nome: 'Puxar conversa à toa',
    descricao: 'Entediado, conversa com quem está perto (o laço muda com o jeito dos dois).',
    tipo: 'Conversar',
    contexto: 'alvo',
    alvos: [WOT.pessoa],
    continuo: true,
    peso: 1.4,
    params: { assunto: 'à toa' },
    considera: [
      c('tédio', E.eu, curva.sobe(0.1, 1), { stat: S.tedio }),
      c('perto', E.DistanceToTarget, curva.perto(10, 0.05)),
      c('sociável', E.eu, curva.traco(0.5), { stat: 'tr.sociability' }),
      c('não é rival', E.laco, curva.faixa(-60, 0, 0, 1)),
      c('não falou agora com ele', E.TimeSinceThisContext, curva.faixa(0, 40, 0.1, 1)),
    ],
  },
  {
    nome: 'Ir à taberna',
    descricao: 'Entediado e com algum dinheiro, vai beber e prosear na taberna.',
    tipo: 'Festejar',
    contexto: 'alvo',
    alvos: [WOT.oficina],
    continuo: true,
    peso: 1.6,
    params: { onde: 'taberna' },
    considera: [
      c('tédio', E.eu, curva.limiar(0.5, 8), { stat: S.tedio }),
      c('é taberna', E.TargetHasTag, curva.sim(), { tag: TAG.taberna }),
      c('tem dinheiro', E.eu, curva.faixa(0, 4, 0.1, 1), { stat: S.riqueza }),
      c('sociável', E.eu, curva.traco(0.5), { stat: 'tr.sociability' }),
      c('perto', E.DistanceToTarget, curva.perto(40, 0.1)),
    ],
  },
  {
    nome: 'Contemplar a paisagem',
    descricao: 'Entediado mas calmo e devoto, senta e olha o mundo (o tédio passa devagar).',
    tipo: 'FicarParado',
    contexto: 'eu',
    continuo: true,
    peso: 0.9,
    params: { segundos: 6, distrai: 1 },
    considera: [
      c('tédio', E.eu, curva.sobe(0.2, 1), { stat: S.tedio }),
      c('paciência', E.eu, curva.traco(0.6), { stat: 'tr.patience' }),
      c('fé', E.eu, curva.traco(0.3), { stat: 'tr.faith' }),
    ],
  },
  {
    nome: 'Mexer no ofício por gosto',
    descricao: 'Trabalhador e entediado, faz algo do ofício sem ninguém pedir (um banco, uma panela).',
    tipo: 'Trabalhar',
    contexto: 'eu',
    continuo: true,
    peso: 1.1,
    params: { por: 'gosto' },
    considera: [
      c('tédio', E.eu, curva.limiar(0.5, 8), { stat: S.tedio }),
      c('diligente', E.eu, curva.traco(0.7), { stat: 'tr.diligence' }),
      c('tem ofício', E.temOficio, curva.sim()),
    ],
  },
  {
    nome: 'Ir à festa',
    descricao: 'Há festa no lugar: vai, mais ainda quem é sociável.',
    tipo: 'Festejar',
    contexto: 'alvo',
    alvos: [WOT.evento],
    continuo: true,
    peso: 2.2,
    params: { onde: 'festa' },
    considera: [
      c('é festa', E.TargetHasTag, curva.sim(), { tag: 'Festa' }),
      c('do meu lugar', E.doMeuLugar, curva.sim(0.2)),
      c('sociável', E.eu, curva.traco(0.5), { stat: 'tr.sociability' }),
      c('tédio', E.eu, curva.sobe(0.4, 1), { stat: S.tedio }),
    ],
  },
  {
    nome: 'Rezar',
    descricao: 'A fé pede: reza no templo ou onde estiver.',
    tipo: 'Rezar',
    contexto: 'eu',
    continuo: true,
    peso: 1.6,
    considera: [c('fé', E.eu, curva.limiar(0.55, 9), { stat: S.fe }), c('devoto', E.eu, curva.traco(0.7), { stat: 'tr.faith' })],
  },
]);

/** Pacote 5: percepção e marcação (Tagging System). */
export const PERCEPCAO = pacote({ id: 5, nome: 'Percepção e marcação', camada: CAMADA, descricao: 'Dar tags a si, perceber tags nos outros, marcar alvos e esquecer o que mudou.' }, [
  {
    nome: 'Reconhecer o ofício de alguém',
    descricao: 'Vê alguém que mostra um ofício e passa a saber o que ele faz ("ele é lenhador"): a tag vira crença.',
    tipo: 'PerceberTag',
    contexto: 'alvo',
    alvos: [WOT.pessoa],
    peso: 1.5,
    params: { tag: 'oficiosVistos', dura: 3600 },
    considera: [
      c('perto', E.DistanceToTarget, curva.perto(12, 0)),
      c('ele mostra um ofício', E.alvoMostraOficio, curva.sim()),
      c('não reparou nele agora', E.TimeSinceThisContext, curva.faixa(0, 300, 0, 1)),
    ],
  },
  {
    nome: 'Reconhecer quem lidera',
    descricao: 'Vê o líder do lugar e passa a saber quem é.',
    tipo: 'PerceberTag',
    contexto: 'alvo',
    alvos: [WOT.pessoa],
    peso: 1.4,
    params: { tag: TAG.lider, dura: 3600 },
    considera: [
      c('é o líder', E.TargetHasTag, curva.sim(), { tag: TAG.lider }),
      c('ainda não sei', E.creioQueAlvoE, curva.nao(), { tag: TAG.lider }),
      c('perto', E.DistanceToTarget, curva.perto(20, 0.1)),
    ],
  },
  {
    nome: 'Assumir a identidade do ofício',
    descricao: 'Pratica um ofício e já tem jeito nele: passa a se ver assim ("eu sou ferreiro") e a mostrar isso a todos.',
    tipo: 'DarTagASi',
    contexto: 'eu',
    peso: 1.8,
    params: { tag: 'meuOficio' },
    considera: [
      c('pratica um ofício', E.temOficio, curva.sim()),
      c('já tem prática', E.habNoMeuOficio, curva.limiar(0.3, 12)),
      c('ainda não se vê assim', E.tenhoIdentidade, curva.nao()),
    ],
  },
  {
    nome: 'Largar a identidade antiga',
    descricao: 'Trocou de ofício: deixa de se dizer o que era ("não sou mais pescador").',
    tipo: 'TirarTagDeSi',
    contexto: 'eu',
    peso: 1.8,
    params: { tag: 'identidadesVelhas' },
    considera: [c('carrega um ofício velho', E.identidadeVelha, curva.sim())],
  },
  {
    nome: 'Esquecer um ofício que mudou',
    descricao: 'Achava que alguém fazia um ofício, mas ele não mostra mais: a crença sai.',
    tipo: 'EsquecerTag',
    contexto: 'alvo',
    alvos: [WOT.pessoa],
    peso: 1.2,
    params: { tag: 'crencasVencidas' },
    considera: [c('perto', E.DistanceToTarget, curva.perto(12, 0)), c('crença vencida', E.crencaVencida, curva.sim())],
  },
  {
    nome: 'Marcar alguém como perigoso',
    descricao: 'Alguém hostil se aproxima do lugar: marca-o como perigoso para todos verem.',
    tipo: 'MarcarAlvo',
    contexto: 'alvo',
    alvos: [WOT.pessoa, WOT.animal],
    peso: 2.4,
    params: { tag: TAG.perigoso, dura: 300 },
    considera: [
      c('hostil', E.TargetHasTag, curva.sim(), { tag: TAG.hostil }),
      c('perto', E.DistanceToTarget, curva.perto(20, 0)),
      c('ainda não marquei', E.marcadoPorMim, curva.nao(), { tag: TAG.perigoso }),
    ],
  },
  {
    nome: 'Reservar uma árvore para cortar',
    descricao: 'Antes de ir cortar, marca a árvore como reservada (ninguém mais vai nela).',
    tipo: 'MarcarAlvo',
    contexto: 'alvo',
    alvos: [WOT.arvore, WOT.rocha],
    peso: 1.6,
    params: { tag: TAG.reservado, dura: 90, eu: TAG.reservando },
    considera: [
      c('preciso do que dá', E.precisoDoQueAlvoDa, curva.limiar(0.35, 8)),
      c('não tenho outra reservada', E.MyHasTag, curva.nao(), { tag: TAG.reservando }),
      c('perto', E.DistanceToTarget, curva.perto(25, 0.05)),
      c('ninguém reservou', E.marcadoPorOutro, curva.nao(), { tag: TAG.reservado }),
      c('tem o que tirar', E.alvo, curva.faixa(0, 4), { stat: S.quantidade }),
    ],
  },
]);
