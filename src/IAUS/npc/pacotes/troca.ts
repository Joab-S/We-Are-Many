/**
 * Camada 6, a troca: fazer eu mesmo ou pedir a quem sabe. Quem precisa de lenha pontua, lado a lado, "cortar
 * lenha eu mesmo" diante de cada árvore e "encomendar a quem faz" diante de cada pessoa que ele CRÊ ser
 * lenhadora (a tag que percebeu nela). O fraco, o preguiçoso e quem já tem outro ofício tendem a encomendar; o
 * forte e o pão-duro, a cortar. Do outro lado, o lenhador pontua aceitar ou recusar pela própria necessidade:
 * quer o pagamento? está cansado? gosta do cliente? Se aceita, entrega do estoque ou vai cortar e entrega depois.
 */
import { curva } from '../curvas';
import { c, pacote } from '../dsl';
import { E } from '../entradas';
import { S, TAG, WOT } from '../vocab';

const CAMADA = 'Troca';

/** Pacote 13: comércio e contratação. */
export const COMERCIO = pacote({ id: 13, nome: 'Comércio e contratação', camada: CAMADA, descricao: 'Encomendar, comprar, trocar e vender; aceitar, recusar, cumprir e cancelar encomendas.' }, [
  {
    nome: 'Encomendar a quem faz',
    descricao: 'Precisa de um bem e conhece alguém que o faz (tag percebida): encomenda e paga na entrega, em vez de fazer.',
    tipo: 'Contratar',
    contexto: 'alvo',
    alvos: [WOT.pessoa],
    peso: 2.6,
    considera: [
      c('preciso do que ele faz', E.precisoDoQueAlvoDa, curva.limiar(0.3, 8)),
      c('posso pagar', E.possoPagar, curva.faixa(0.5, 2, 0, 1)),
      c('não quero fazer (fraco)', E.eu, curva.traco(-0.5), { stat: 'tr.strength' }),
      c('não quero fazer (tempo)', E.temOficio, curva.sim(0.55)),
      c('confio nele', E.laco, curva.faixa(-40, 50, 0.1, 1)),
      c('sem encomenda aberta', E.eu, curva.faixa(0, 2, 1, 0), { stat: 'encomendasAbertas' }),
      c('ele está perto', E.DistanceToTarget, curva.perto(60, 0.2)),
    ],
  },
  {
    nome: 'Comprar de quem vende',
    descricao: 'Precisa de um bem e alguém que o faz tem para vender agora: compra na hora.',
    tipo: 'Negociar',
    contexto: 'alvo',
    alvos: [WOT.pessoa],
    peso: 2.8,
    params: { modo: 'comprar' },
    considera: [
      c('preciso do que ele faz', E.precisoDoQueAlvoDa, curva.limiar(0.3, 8)),
      c('ele tem para vender', E.alvo, curva.sim(), { stat: 'vende' }),
      c('posso pagar', E.possoPagar, curva.faixa(0.5, 2, 0, 1)),
      c('ele está perto', E.DistanceToTarget, curva.perto(40, 0.1)),
      c('não comprou agora dele', E.TimeSinceThisContext, curva.faixa(0, 30, 0.1, 1)),
    ],
  },
  {
    nome: 'Trocar por escambo',
    descricao: 'Sem dinheiro, mas com sobra de outro bem: propõe uma troca a quem faz o que precisa.',
    tipo: 'Negociar',
    contexto: 'alvo',
    alvos: [WOT.pessoa],
    peso: 2,
    params: { modo: 'troca' },
    considera: [
      c('preciso do que ele faz', E.precisoDoQueAlvoDa, curva.limiar(0.35, 8)),
      c('tenho sobra para dar', E.eu, curva.limiar(0.4, 8), { stat: 'excedente' }),
      c('sem dinheiro', E.possoPagar, curva.faixa(0, 1.5, 1, 0.2)),
      c('gosto dele', E.laco, curva.faixa(-30, 60, 0.2, 1)),
      c('perto', E.DistanceToTarget, curva.perto(30, 0.1)),
    ],
  },
  {
    nome: 'Pôr a sobra à venda',
    descricao: 'Tem sobra do que produz: põe à venda na porta de casa ou no mercado.',
    tipo: 'Negociar',
    contexto: 'eu',
    peso: 1.6,
    params: { modo: 'vender' },
    considera: [
      c('tenho sobra', E.eu, curva.limiar(0.35, 8), { stat: 'excedente' }),
      c('ganância', E.eu, curva.traco(0.4), { stat: 'tr.greed' }),
      c('ainda não vendo', E.eu, curva.nao(0.2), { stat: 'vende' }),
    ],
  },
  {
    nome: 'Aceitar a encomenda',
    descricao: 'Recebeu uma encomenda do que faz: aceita se quer o pagamento, se tem disposição e se gosta de quem pediu.',
    tipo: 'AceitarOferta',
    contexto: 'alvo',
    alvos: [WOT.oferta],
    peso: 2.6,
    considera: [
      c('é para mim', E.ofertaParaMim, curva.sim()),
      c('ainda é proposta', E.alvo, curva.sim(), { stat: 'proposta' }),
      c('é o que faço', E.facoOBemDoAlvo, curva.sim(0.15)),
      c('quero o pagamento', E.eu, curva.faixa(0, 15, 1, 0.35), { stat: S.riqueza }),
      c('ganância', E.eu, curva.traco(0.3), { stat: 'tr.greed' }),
      c('disposição', E.eu, curva.desce(1, 0.2), { stat: S.cansaco }),
      c('gosto do cliente', E.lacoComCliente, curva.faixa(-60, 40, 0.1, 1)),
      c('tenho pronto ou dá para fazer', E.tenhoDoBemDoAlvo, curva.faixa(0, 3, 0.6, 1)),
    ],
  },
  {
    nome: 'Recusar a encomenda',
    descricao: 'A encomenda não compensa (cansado, já cheio de serviço, não gosta de quem pediu): recusa.',
    tipo: 'RecusarOferta',
    contexto: 'alvo',
    alvos: [WOT.oferta],
    peso: 1.2,
    considera: [
      c('é para mim', E.ofertaParaMim, curva.sim()),
      c('ainda é proposta', E.alvo, curva.sim(), { stat: 'proposta' }),
      c('cansado ou cheio', E.eu, curva.sobe(0.25, 1), { stat: S.cansaco }),
      c('não gosto do cliente', E.lacoComCliente, curva.faixa(-60, 40, 1, 0.3)),
      c('não é bem o que faço', E.facoOBemDoAlvo, curva.nao(0.4)),
    ],
  },
  {
    nome: 'Entregar a encomenda',
    descricao: 'Aceitou uma encomenda e já tem o bem (do estoque ou recém-feito): leva e recebe.',
    tipo: 'Entregar',
    contexto: 'alvo',
    alvos: [WOT.oferta],
    continuo: true,
    peso: 3,
    params: { destino: 'cliente' },
    considera: [
      c('é minha para cumprir', E.ofertaParaMim, curva.sim()),
      c('aceita', E.alvo, curva.sim(), { stat: 'aceita' }),
      c('tenho o bem', E.tenhoDoBemDoAlvo, curva.limiar(0.5, 10)),
    ],
  },
  {
    nome: 'Cancelar uma encomenda parada',
    descricao: 'Encomendou faz tempo e nada: desiste (e procura outro jeito).',
    tipo: 'CancelarOferta',
    contexto: 'alvo',
    alvos: [WOT.oferta],
    peso: 1.5,
    considera: [c('é minha', E.ofertaMinha, curva.sim()), c('parada há tempo', E.alvo, curva.limiar(0.7, 10), { stat: 'atraso' }), c('paciência', E.eu, curva.traco(-0.4), { stat: 'tr.patience' })],
  },
  {
    nome: 'Pagar o que deve',
    descricao: 'Está devendo a alguém e tem como pagar: paga.',
    tipo: 'Doar',
    contexto: 'alvo',
    alvos: [WOT.pessoa],
    peso: 2,
    params: { bem: 'dívida' },
    considera: [
      c('devo a ele', E.marcadoPorMim, curva.sim(), { tag: TAG.credor }),
      c('tenho como', E.eu, curva.faixa(0, 4), { stat: S.riqueza }),
      c('lealdade', E.eu, curva.traco(0.4), { stat: 'tr.loyalty' }),
    ],
  },
]);
