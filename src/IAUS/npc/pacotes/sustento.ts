/**
 * Camada 5, o sustento: tirar do mato o que precisa (eu mesmo), escolher e praticar um ofício, e acudir o que o
 * lugar pede. A especialização nasce aqui: no começo cada um corta a própria lenha; com gente bastante para
 * dividir, cada um escolhe o ofício pela falta que o lugar sente, pelo jeito e pela tradição da família.
 */
import { Behavior } from '../../behavior';
import { BrainLibrary } from '../../brain';
import { ContextType, DurationType } from '../../enums';
import { curva } from '../curvas';
import { c, pacote, pacoteDeHabilidades } from '../dsl';
import { E } from '../entradas';
import { OFICIOS, OFICIO_IDS, S, TAG, WOT, inv, precisa } from '../vocab';

const CAMADA = 'Sustento';

/** Pacote 10: o trabalho no mato, feito pela própria pessoa (sem ofício ou para si). */
export const MATO = pacote({ id: 10, nome: 'Fazer eu mesmo', camada: CAMADA, descricao: 'Cortar lenha, tirar pedra, colher, caçar, pescar e plantar para si e para a casa.' }, [
  {
    nome: 'Cortar lenha eu mesmo',
    descricao: 'Precisa de madeira (casa, fogo, encomenda) e tem força: vai à árvore mais à mão e corta.',
    tipo: 'CortarLenha',
    contexto: 'alvo',
    alvos: [WOT.arvore],
    continuo: true,
    peso: 2.6,
    considera: [
      c('preciso de madeira', E.precisoDoQueAlvoDa, curva.limiar(0.3, 8)),
      c('não é de outro', E.marcadoPorOutro, curva.nao(0.05), { tag: TAG.reservado }),
      c('é a que reservei', E.marcadoPorMim, curva.sim(0.7), { tag: TAG.reservado }),
      c('tem madeira', E.alvo, curva.faixa(0, 4), { stat: S.quantidade }),
      c('perto', E.DistanceToTarget, curva.perto(30, 0.05)),
      c('força', E.eu, curva.traco(0.5), { stat: 'tr.strength' }),
      c('disposição', E.eu, curva.desce(1, 0.15), { stat: S.cansaco }),
      c('sou lenhador ou não tenho ofício', E.souDoOficio, curva.sim(0.55)),
    ],
  },
  {
    nome: 'Tirar pedra eu mesmo',
    descricao: 'Precisa de pedra e tem força: vai à rocha mais à mão e tira.',
    tipo: 'ExtrairPedra',
    contexto: 'alvo',
    alvos: [WOT.rocha],
    continuo: true,
    peso: 2.4,
    considera: [
      c('preciso de pedra', E.precisoDoQueAlvoDa, curva.limiar(0.3, 8)),
      c('não é de outro', E.marcadoPorOutro, curva.nao(0.05), { tag: TAG.reservado }),
      c('é a que reservei', E.marcadoPorMim, curva.sim(0.7), { tag: TAG.reservado }),
      c('tem pedra', E.alvo, curva.faixa(0, 4), { stat: S.quantidade }),
      c('perto', E.DistanceToTarget, curva.perto(45, 0.15)),
      c('força', E.eu, curva.traco(0.6), { stat: 'tr.strength' }),
      c('disposição', E.eu, curva.desce(1, 0.15), { stat: S.cansaco }),
      c('sou pedreiro ou não tenho ofício', E.souDoOficio, curva.sim(0.55)),
    ],
  },
  {
    nome: 'Colher frutos para guardar',
    descricao: 'A casa precisa de comida: colhe frutos e leva.',
    tipo: 'Coletar',
    contexto: 'alvo',
    alvos: [WOT.arbusto],
    continuo: true,
    peso: 2.2,
    params: { para: 'guardar' },
    considera: [
      c('preciso de comida', E.eu, curva.limiar(0.3, 8), { stat: precisa('comida') }),
      c('tem fruta', E.alvo, curva.faixa(0, 4), { stat: S.quantidade }),
      c('perto', E.DistanceToTarget, curva.perto(30, 0.05)),
      c('sou coletor ou não tenho ofício', E.souDoOficio, curva.sim(0.6)),
    ],
  },
  {
    nome: 'Caçar para a casa',
    descricao: 'A casa precisa de comida e ele marcou uma presa: vai atrás dela.',
    tipo: 'Cacar',
    contexto: 'alvo',
    alvos: [WOT.animal],
    continuo: true,
    peso: 2.4,
    params: { para: 'guardar' },
    considera: [
      c('marquei a presa', E.marcadoPorMim, curva.sim(), { tag: TAG.alvoDeCaca }),
      c('preciso de comida', E.eu, curva.sobe(0.3, 1), { stat: precisa('comida') }),
      c('perto', E.DistanceToTarget, curva.perto(30, 0.1)),
      c('coragem', E.eu, curva.traco(0.5), { stat: 'tr.courage' }),
      c('sou caçador ou não tenho ofício', E.souDoOficio, curva.sim(0.6)),
    ],
  },
  {
    nome: 'Marcar uma presa para a casa',
    descricao: 'Caçador (ou quem precisa de comida) vê um animal sem dono e o marca como alvo de caça.',
    tipo: 'MarcarAlvo',
    contexto: 'alvo',
    alvos: [WOT.animal],
    peso: 2.2,
    params: { tag: TAG.alvoDeCaca, dura: 120, eu: TAG.cacando },
    considera: [
      c('não estou caçando outra', E.MyHasTag, curva.nao(), { tag: TAG.cacando }),
      c('preciso de comida', E.eu, curva.sobe(0.2, 1), { stat: precisa('comida') }),
      c('sou caçador', E.souDoOficio, curva.sim(0.35)),
      c('ninguém marcou', E.marcadoPorOutro, curva.nao(), { tag: TAG.alvoDeCaca }),
      c('perto', E.DistanceToTarget, curva.perto(20, 0.05)),
    ],
  },
  {
    nome: 'Pescar para guardar',
    descricao: 'A casa precisa de comida e há peixe perto: pesca e leva.',
    tipo: 'Pescar',
    contexto: 'alvo',
    alvos: [WOT.pesqueiro],
    continuo: true,
    peso: 2.2,
    params: { para: 'guardar' },
    considera: [
      c('preciso de comida', E.eu, curva.limiar(0.3, 8), { stat: precisa('comida') }),
      c('tem peixe', E.alvo, curva.faixa(0, 4), { stat: S.quantidade }),
      c('perto', E.DistanceToTarget, curva.perto(30, 0.05)),
      c('paciência', E.eu, curva.traco(0.4), { stat: 'tr.patience' }),
      c('sou pescador ou não tenho ofício', E.souDoOficio, curva.sim(0.6)),
    ],
  },
  {
    nome: 'Plantar uma roça',
    descricao: 'Mora num lugar com terra boa e a comida do mato não basta: abre uma roça.',
    tipo: 'Plantar',
    contexto: 'eu',
    continuo: true,
    peso: 2,
    considera: [
      c('assentado', E.MyHasTag, curva.sim(), { tag: TAG.assentado }),
      c('terra boa', E.eu, curva.sim(), { stat: 'podePlantar' }),
      c('falta comida', E.eu, curva.sobe(0.2, 1), { stat: S.locFaltaComida }),
      c('paciência', E.eu, curva.traco(0.5), { stat: 'tr.patience' }),
      c('sou agricultor ou não tenho ofício', E.eu, curva.sim(0.5), { stat: 'agricultorOuSemOficio' }),
      c('poucas roças', E.eu, curva.faixa(0, 4, 1, 0.1), { stat: 'rocasPorCasa' }),
    ],
  },
  {
    nome: 'Colher a roça madura',
    descricao: 'Uma roça do lugar está madura: colhe.',
    tipo: 'Colher',
    contexto: 'alvo',
    alvos: [WOT.roca],
    continuo: true,
    peso: 2.8,
    considera: [
      c('madura', E.alvo, curva.sim(), { stat: S.maduro }),
      c('do meu lugar', E.doMeuLugar, curva.sim(0.1)),
      c('perto', E.DistanceToTarget, curva.perto(30, 0.1)),
      c('sou agricultor', E.souDoOficio, curva.sim(0.5)),
    ],
  },
  {
    nome: 'Levar a carga para casa',
    descricao: 'Carregando bastante: leva para o estoque da casa (ou do lugar).',
    tipo: 'Entregar',
    contexto: 'eu',
    continuo: true,
    peso: 2.4,
    params: { destino: 'casa' },
    considera: [c('carga', E.eu, curva.limiar(0.6, 10), { stat: 'carga' }), c('tem casa', E.MyHasTag, curva.sim(), { tag: TAG.temCasa })],
  },
]);

/** Pacote 11: ofício (escolher, trocar, ensinar e aprender). */
export const OFICIO = pacote({ id: 11, nome: 'Ofício', camada: CAMADA, descricao: 'Escolher o ofício pela necessidade do lugar e pelo próprio jeito, trocar na falta, ensinar e aprender.' }, [
  {
    nome: 'Escolher um ofício',
    descricao:
      'Com gente para dividir o trabalho, escolhe o que fazer: o que o lugar sente faltar, o que ainda tem vaga, o próprio jeito e aptidão, o costume da família e o que a era permite.',
    tipo: 'EscolherOficio',
    contexto: 'alvo',
    alvos: [WOT.oficio],
    // Decisão grande e rara: só existe para quem ainda não tem ofício, e por isso pode pesar como trabalho.
    peso: 3.2,
    considera: [
      c('sem ofício', E.temOficio, curva.nao()),
      c('falta no lugar', E.alvo, curva.sobe(0.25, 1), { stat: S.falta }),
      c('vaga', E.alvo, curva.faixa(0, 0.35, 1, 0.1), { stat: S.ocupacao }),
      c('jeito', E.jeito, curva.traco(0.8)),
      c('aptidão', E.habilidade, curva.sobe(0.6, 1)),
      c('era', E.alvo, curva.sobe(0.2, 1), { stat: S.comum }),
      c('costume', E.alvo, curva.faixa(-1, 1, 0.5, 1), { stat: 'costume' }),
      c('gente para dividir', E.eu, curva.faixa(1, 5, 0.05, 1), { stat: S.locPop }),
    ],
  },
  {
    nome: 'Trocar de ofício',
    descricao: 'O lugar sente muita falta de outro ofício e o dele está sobrando: quem tem mais jeito e abertura troca primeiro.',
    tipo: 'EscolherOficio',
    contexto: 'alvo',
    alvos: [WOT.oficio],
    peso: 2.4,
    params: { troca: true },
    considera: [
      c('tem ofício', E.temOficio, curva.sim()),
      c('não é o atual', E.oficioAtual, curva.nao()),
      c('falta muito', E.alvo, curva.limiar(0.5, 8), { stat: S.falta }),
      c('o meu está sobrando', E.faltaDoMeuOficio, curva.desce(1, 0.05)),
      c('jeito', E.jeito, curva.traco(0.6)),
      c('abertura', E.eu, curva.traco(0.3), { stat: 'abertura' }),
      c('não trocou faz pouco', E.eu, curva.faixa(2, 8, 0, 1), { stat: S.anosNoOficio }),
    ],
  },
  {
    nome: 'Ensinar o ofício a um filho',
    descricao: 'Mestre no ofício, ensina o filho que o acompanha.',
    tipo: 'Ensinar',
    contexto: 'alvo',
    alvos: [WOT.pessoa],
    continuo: true,
    peso: 1.6,
    considera: [
      c('sou bom nisso', E.habNoMeuOficio, curva.limiar(0.6, 10)),
      c('é meu filho', E.marcadoPorMim, curva.sim(0.3), { tag: TAG.filho }),
      c('ele está perto', E.DistanceToTarget, curva.perto(8, 0)),
      c('paciência', E.eu, curva.traco(0.4), { stat: 'tr.patience' }),
      c('não ensinou agora', E.TimeSinceThisContext, curva.faixa(0, 60, 0, 1)),
    ],
  },
  {
    nome: 'Aprender com quem sabe',
    descricao: 'Ainda sem jeito no ofício, vai aprender com quem ele crê que é mestre nele.',
    tipo: 'Aprender',
    contexto: 'alvo',
    alvos: [WOT.pessoa],
    continuo: true,
    peso: 1.4,
    params: { modo: 'aprender' },
    considera: [
      c('ainda sei pouco', E.habNoMeuOficio, curva.desce(1, 0)),
      c('ele faz o mesmo', E.alvoMostraOficio, curva.sim()),
      c('confio nele', E.laco, curva.faixa(-30, 60, 0.2, 1)),
      c('curiosidade', E.eu, curva.traco(0.5), { stat: 'tr.curiosity' }),
      c('perto', E.DistanceToTarget, curva.perto(20, 0.05)),
    ],
  },
]);

/** Pacote 12: o que o lugar pede (o quadro de tarefas e o mutirão). */
export const QUADRO = pacote({ id: 12, nome: 'O que o lugar pede', camada: CAMADA, descricao: 'Pegar tarefas do quadro do lugar, acudir as urgentes e ajudar nas obras dos outros e nas públicas.' }, [
  {
    nome: 'Pegar uma tarefa do quadro',
    descricao: 'O lugar tem tarefas abertas: pega a de mais prioridade que combina com o ofício e está perto.',
    tipo: 'FazerTarefa',
    contexto: 'alvo',
    alvos: [WOT.tarefa],
    continuo: true,
    peso: 1,
    considera: [
      c('prioridade', E.alvo, curva.sobe(0.25, 1), { stat: S.prioridade }),
      c('ofício', E.alvo, curva.sobe(0, 1), { stat: 'combina' }),
      c('perto', E.DistanceToTarget, curva.perto(40, 0.2)),
      c('vaga', E.alvo, curva.sim(), { stat: S.vagas }),
      c('amigos nela', E.alvo, curva.faixa(0, 2, 0.85, 1), { stat: 'amigos' }),
      c('não urgente', E.alvo, curva.nao(), { stat: S.urgente }),
    ],
  },
  {
    nome: 'Acudir uma tarefa urgente',
    descricao: 'Colheita, fogo ou alarme: qualquer adulto ajuda, mesmo fora do ofício.',
    tipo: 'FazerTarefa',
    contexto: 'alvo',
    alvos: [WOT.tarefa],
    continuo: true,
    peso: 1.6,
    considera: [
      c('urgente', E.alvo, curva.sim(), { stat: S.urgente }),
      c('prioridade', E.alvo, curva.sobe(0.25, 1), { stat: S.prioridade }),
      c('ofício', E.alvo, curva.sobe(0.7, 1), { stat: 'combina' }),
      c('perto', E.DistanceToTarget, curva.perto(40, 0.2)),
      c('vaga', E.alvo, curva.sim(), { stat: S.vagas }),
    ],
  },
  {
    nome: 'Ajudar na obra de um vizinho',
    descricao: 'Construtor (ou gentil e à toa) ajuda a levantar a obra de alguém do lugar.',
    tipo: 'Construir',
    contexto: 'alvo',
    alvos: [WOT.obra],
    continuo: true,
    peso: 1.8,
    considera: [
      c('do meu lugar', E.doMeuLugar, curva.sim()),
      c('não é minha', E.meu, curva.nao()),
      c('tem material', E.alvo, curva.sim(0.05), { stat: 'temMaterial' }),
      c('sou construtor', E.souDoOficio, curva.sim(0.25)),
      c('gentileza', E.eu, curva.traco(0.3), { stat: 'tr.kindness' }),
      c('perto', E.DistanceToTarget, curva.perto(40, 0.1)),
    ],
  },
  {
    nome: 'Trabalhar na obra pública',
    descricao: 'O líder mandou fazer uma obra e paga por ela: quem precisa do pagamento (e é leal) vai trabalhar.',
    tipo: 'Construir',
    contexto: 'alvo',
    alvos: [WOT.obra],
    continuo: true,
    peso: 2,
    params: { paga: true },
    considera: [
      c('é pública', E.TargetHasTag, curva.sim(), { tag: 'Pública' }),
      c('do meu lugar', E.doMeuLugar, curva.sim()),
      c('tem material', E.alvo, curva.acelera(2, 0.05), { stat: 'temMaterial' }),
      c('preciso do pagamento', E.eu, curva.faixa(0, 10, 1, 0.3), { stat: S.riqueza }),
      c('lealdade', E.eu, curva.traco(0.3), { stat: 'tr.loyalty' }),
      c('sou construtor', E.souDoOficio, curva.sim(0.5)),
      c('perto', E.DistanceToTarget, curva.perto(50, 0.1)),
    ],
  },
  {
    nome: 'Levar material à obra pública',
    descricao: 'A obra que o líder mandou fazer está parada por falta de madeira ou pedra e ele tem: leva, e o tesouro paga.',
    tipo: 'Entregar',
    contexto: 'alvo',
    alvos: [WOT.obra],
    continuo: true,
    peso: 2.6,
    params: { destino: 'obra' },
    considera: [
      c('é pública', E.TargetHasTag, curva.sim(), { tag: 'Pública' }),
      c('do meu lugar', E.doMeuLugar, curva.sim()),
      c('tenho o que falta', E.tenhoMaterialDaObra, curva.limiar(0.2, 10)),
      c('o tesouro paga', E.tesouroPaga, curva.faixa(0, 1, 0.4, 1)),
      c('lealdade', E.eu, curva.traco(0.3), { stat: 'tr.loyalty' }),
      c('perto', E.DistanceToTarget, curva.perto(50, 0.2)),
    ],
  },
  {
    nome: 'Levar a produção ao celeiro',
    descricao: 'Tem produção na mão e o lugar tem celeiro: leva para lá (o lugar todo come dela).',
    tipo: 'Entregar',
    contexto: 'eu',
    continuo: true,
    peso: 2,
    params: { destino: 'celeiro' },
    considera: [
      c('carga', E.eu, curva.limiar(0.5, 10), { stat: 'carga' }),
      c('o lugar tem celeiro', E.eu, curva.sim(), { stat: 'temCeleiro' }),
      c('falta comida', E.eu, curva.sobe(0.3, 1), { stat: S.locFaltaComida }),
      c('generosidade', E.eu, curva.traco(-0.4), { stat: 'tr.greed' }),
    ],
  },
]);

/**
 * O porquê de trabalhar no ofício é o mesmo para todos (o lugar precisa, há disposição); o quê muda com o
 * ofício (cortar lenha, assar pão, forjar). No IAUS isso é um Behavior-Ability Pair: um comportamento de tipo
 * `Ability` ligado, em cada pacote de habilidade, à habilidade de um ofício. Quem passa a praticar um ofício
 * ganha o pacote de habilidade dele; quem troca, perde o velho e ganha o novo.
 */
export const TRABALHAR_NO_OFICIO = (() => {
  // Na faixa do pacote 100 (os pacotes de habilidade): 100 × 100 + 1, longe dos ids dos pacotes de comportamento.
  const id = 10001;
  const ja = BrainLibrary.behaviors.get(id);
  if (ja) return ja;
  const b = new Behavior({
    id,
    name: 'Trabalhar no meu ofício',
    description: 'Pratica o ofício: o quanto o lugar precisa dele, a disposição e a diligência decidem; de noite quase ninguém trabalha.',
    behaviorType: 'Ability',
    contextType: ContextType.Self,
    duration: DurationType.Continuous,
    weight: 2.6,
    considerations: [
      c('o lugar precisa', E.faltaDaHabilidade, curva.sobe(0.35, 1)),
      c('disposição', E.eu, curva.desce(1, 0.1), { stat: S.cansaco }),
      c('diligência', E.eu, curva.traco(0.5), { stat: 'tr.diligence' }),
      c('é dia', E.eu, curva.nao(0.1), { stat: S.noite }),
      c('sem fome', E.eu, curva.desce(1, 0.3), { stat: S.fome }),
    ],
  });
  BrainLibrary.behaviors.set(id, b);
  return b;
})();

/** Pacotes de habilidade: um por ofício (id 100 + posição do ofício). */
export const HABILIDADES = Object.fromEntries(
  OFICIO_IDS.map((o, k) => [o, pacoteDeHabilidades(100 + k, `Ofício: ${OFICIOS[o].nome}`, `Trabalhar como ${OFICIOS[o].nome.toLowerCase()}.`, [{ comportamento: TRABALHAR_NO_OFICIO, habilidade: `oficio:${o}` }])]),
) as Record<(typeof OFICIO_IDS)[number], ReturnType<typeof pacoteDeHabilidades>>;

/** O que a pessoa crê que precisa para sustentar a casa (o mundo usa o mesmo nome dos stats). */
export const necessidadeDeBem = (b: string): string => precisa(b);
export const estoque = (b: string): string => inv(b);
