/**
 * Camada 1, o corpo: manter-se vivo, descansar e se mover. É o chão de todo cérebro, do andarilho ao rei.
 */
import { curva } from '../curvas';
import { c, pacote } from '../dsl';
import { E } from '../entradas';
import { S, TAG, WOT, inv, tagDe } from '../vocab';

const CAMADA = 'Corpo';

/** Pacote 1: sobrevivência (fome, sede, frio, perigo). */
export const SOBREVIVENCIA = pacote({ id: 1, nome: 'Sobrevivência', camada: CAMADA, descricao: 'Comer, beber, se aquecer e fugir do perigo.' }, [
  {
    nome: 'Comer do que tenho',
    descricao: 'Com fome e comida guardada, come do próprio estoque.',
    tipo: 'Comer',
    contexto: 'eu',
    peso: 4,
    params: { fonte: 'estoque' },
    considera: [c('fome', E.eu, curva.limiar(0.45, 9), { stat: S.fome }), c('tenho comida', E.eu, curva.faixa(0, 3), { stat: inv('comida') })],
  },
  {
    nome: 'Comer no celeiro do lugar',
    descricao: 'Morador com fome e sem comida própria pega a parte dele no celeiro do lugar.',
    tipo: 'Comer',
    contexto: 'eu',
    peso: 3.6,
    params: { fonte: 'celeiro' },
    considera: [
      c('fome', E.eu, curva.limiar(0.5, 9), { stat: S.fome }),
      c('mora num lugar', E.MyHasTag, curva.sim(), { tag: TAG.morador }),
      c('celeiro tem', E.eu, curva.desce(1, 0.05), { stat: S.locFaltaComida }),
      c('sem comida própria', E.eu, curva.faixa(0, 2, 1, 0.3), { stat: inv('comida') }),
    ],
  },
  {
    nome: 'Colher frutas para comer',
    descricao: 'Com fome, vai ao arbusto com frutas mais perto e come lá.',
    tipo: 'Coletar',
    contexto: 'alvo',
    alvos: [WOT.arbusto],
    continuo: true,
    peso: 3.2,
    params: { para: 'comer' },
    considera: [
      c('fome', E.eu, curva.limiar(0.4, 8), { stat: S.fome }),
      c('tem fruta', E.alvo, curva.faixa(0, 3), { stat: S.quantidade }),
      c('perto', E.DistanceToTarget, curva.perto(25, 0.05)),
    ],
  },
  {
    nome: 'Beber água',
    descricao: 'Com sede, vai à água mais perto e bebe.',
    tipo: 'Beber',
    contexto: 'alvo',
    alvos: [WOT.agua],
    continuo: true,
    peso: 4.2,
    considera: [c('sede', E.eu, curva.limiar(0.4, 9), { stat: S.sede }), c('perto', E.DistanceToTarget, curva.perto(30, 0.05))],
  },
  {
    nome: 'Escolher uma presa',
    descricao: 'Com fome e coragem, vê um animal sem dono e o marca como alvo de caça (tag no animal).',
    tipo: 'MarcarAlvo',
    contexto: 'alvo',
    alvos: [WOT.animal],
    peso: 2.6,
    params: { tag: TAG.alvoDeCaca, dura: 120, eu: TAG.cacando },
    considera: [
      c('fome', E.eu, curva.limiar(0.45, 8), { stat: S.fome }),
      c('não estou caçando outra', E.MyHasTag, curva.nao(), { tag: TAG.cacando }),
      c('perto', E.DistanceToTarget, curva.perto(18, 0.05)),
      c('ninguém marcou', E.marcadoPorOutro, curva.nao(0.1), { tag: TAG.alvoDeCaca }),
      c('coragem', E.eu, curva.traco(0.5), { stat: 'tr.courage' }),
      c('perigo', E.alvo, curva.desce(1, 0.1), { stat: S.perigo }),
    ],
  },
  {
    nome: 'Caçar a presa marcada',
    descricao: 'Persegue e abate o animal que marcou como alvo de caça.',
    tipo: 'Cacar',
    contexto: 'alvo',
    alvos: [WOT.animal],
    continuo: true,
    peso: 3.4,
    params: { para: 'comer' },
    considera: [
      c('marquei', E.marcadoPorMim, curva.sim(), { tag: TAG.alvoDeCaca }),
      c('fome', E.eu, curva.sobe(0.4, 1), { stat: S.fome }),
      c('perto', E.DistanceToTarget, curva.perto(25, 0.1)),
      c('fôlego', E.eu, curva.desce(1, 0.2), { stat: S.cansaco }),
    ],
  },
  {
    nome: 'Desistir da presa',
    descricao: 'A presa fugiu para longe ou ele cansou: tira a marca de alvo de caça.',
    tipo: 'DesmarcarAlvo',
    contexto: 'alvo',
    alvos: [WOT.animal],
    peso: 2,
    params: { tag: TAG.alvoDeCaca, eu: TAG.cacando },
    considera: [
      c('marquei', E.marcadoPorMim, curva.sim(), { tag: TAG.alvoDeCaca }),
      c('longe ou cansado', E.DistanceToTarget, curva.faixa(10, 30, 0, 1)),
    ],
  },
  {
    nome: 'Pescar para comer',
    descricao: 'Com fome e água com peixe por perto, pesca e come.',
    tipo: 'Pescar',
    contexto: 'alvo',
    alvos: [WOT.pesqueiro],
    continuo: true,
    peso: 3,
    params: { para: 'comer' },
    considera: [
      c('fome', E.eu, curva.limiar(0.45, 8), { stat: S.fome }),
      c('tem peixe', E.alvo, curva.faixa(0, 3), { stat: S.quantidade }),
      c('perto', E.DistanceToTarget, curva.perto(25, 0.05)),
      c('paciência', E.eu, curva.traco(0.3), { stat: 'tr.patience' }),
    ],
  },
  {
    nome: 'Fugir do perigo',
    descricao: 'Um bicho bravo ou alguém hostil perto: corre para longe dele.',
    tipo: 'Fugir',
    contexto: 'alvo',
    alvos: [WOT.animal, WOT.pessoa],
    continuo: true,
    peso: 5,
    considera: [
      c('perigoso', E.alvo, curva.limiar(0.5, 10), { stat: S.perigo }),
      c('perto', E.DistanceToTarget, curva.perto(8, 0)),
      c('medo', E.eu, curva.traco(-0.6), { stat: 'tr.courage' }),
      c('não é minha caça', E.marcadoPorMim, curva.nao(0.3), { tag: TAG.alvoDeCaca }),
    ],
  },
  {
    nome: 'Abrigar-se do frio em casa',
    descricao: 'Com frio e casa, vai para dentro.',
    tipo: 'IrParaCasa',
    contexto: 'eu',
    continuo: true,
    peso: 3,
    params: { motivo: 'frio' },
    considera: [c('frio', E.eu, curva.limiar(0.5, 9), { stat: S.frio }), c('tem casa', E.MyHasTag, curva.sim(), { tag: TAG.temCasa })],
  },
  {
    nome: 'Fazer uma fogueira',
    descricao: 'Com frio e lenha à mão (ou sem casa), acende um fogo.',
    tipo: 'Aquecer',
    contexto: 'eu',
    continuo: true,
    peso: 2.8,
    considera: [
      c('frio', E.eu, curva.limiar(0.45, 9), { stat: S.frio }),
      c('tem lenha', E.eu, curva.faixa(0, 2, 0.1, 1), { stat: inv('madeira') }),
    ],
  },
]);

/** Pacote 2: descanso e sono. */
export const DESCANSO = pacote({ id: 2, nome: 'Descanso', camada: CAMADA, descricao: 'Dormir, descansar e se recuperar.' }, [
  {
    nome: 'Dormir em casa',
    descricao: 'Cansado (mais ainda à noite), vai dormir em casa.',
    tipo: 'Dormir',
    contexto: 'eu',
    continuo: true,
    peso: 3,
    params: { onde: 'casa' },
    considera: [
      c('cansaço', E.eu, curva.limiar(0.55, 9), { stat: S.cansaco }),
      c('noite', E.eu, curva.sim(0.35), { stat: S.noite }),
      c('tem casa', E.MyHasTag, curva.sim(), { tag: TAG.temCasa }),
    ],
  },
  {
    nome: 'Dormir ao relento',
    descricao: 'Muito cansado e sem casa, deita onde está.',
    tipo: 'Dormir',
    contexto: 'eu',
    continuo: true,
    peso: 2.6,
    params: { onde: 'aqui' },
    considera: [
      c('cansaço', E.eu, curva.limiar(0.65, 10), { stat: S.cansaco }),
      c('noite', E.eu, curva.sim(0.4), { stat: S.noite }),
      c('sem casa', E.MyHasTag, curva.nao(0.2), { tag: TAG.temCasa }),
    ],
  },
  {
    nome: 'Recuperar o fôlego',
    descricao: 'Um pouco cansado no meio do dia: para um pouco.',
    tipo: 'FicarParado',
    contexto: 'eu',
    continuo: true,
    peso: 1.4,
    params: { segundos: 4 },
    considera: [c('cansaço', E.eu, curva.lombada(0.45, 0.15), { stat: S.cansaco }), c('preguiça', E.eu, curva.traco(-0.4), { stat: 'tr.diligence' })],
  },
]);

/** Pacote 3: movimento (andar, parar, vagar, explorar, voltar). */
export const MOVIMENTO = pacote({ id: 3, nome: 'Movimento', camada: CAMADA, descricao: 'Ficar parado, vagar, explorar, voltar para casa e acompanhar alguém.' }, [
  {
    nome: 'Ficar parado',
    descricao: 'Nada urgente: fica onde está, olhando em volta. É o piso de todo cérebro.',
    tipo: 'FicarParado',
    contexto: 'eu',
    continuo: true,
    peso: 0.25,
    params: { segundos: 3 },
    considera: [c('calma', E.Constant, curva.sempre(1)), c('preguiça', E.eu, curva.traco(-0.3), { stat: 'tr.diligence' })],
  },
  {
    nome: 'Vagar por perto',
    descricao: 'Sem nada para fazer, anda à toa por perto.',
    tipo: 'Vagar',
    contexto: 'sozinho',
    continuo: true,
    peso: 0.4,
    params: { raio: 6 },
    considera: [c('tédio', E.eu, curva.sobe(0.4, 1), { stat: S.tedio }), c('não vagou agora', E.TimeSinceThisBehavior, curva.faixa(0, 10, 0.3, 1))],
  },
  {
    nome: 'Explorar a região',
    descricao: 'Curioso (ou sem lugar para morar), anda para longe para conhecer a região.',
    tipo: 'Explorar',
    contexto: 'lugar',
    continuo: true,
    peso: 1.1,
    params: { raio: 30 },
    considera: [
      c('curiosidade', E.eu, curva.traco(0.6), { stat: 'tr.curiosity' }),
      c('sem casa ou entediado', E.eu, curva.sobe(0.3, 1), { stat: S.tedio }),
      c('não explorou agora', E.TimeSinceThisBehavior, curva.faixa(0, 60, 0.2, 1)),
      c('sem teto', E.MyHasTag, curva.sim(0.35), { tag: TAG.semTeto }),
    ],
  },
  {
    nome: 'Voltar para casa ao anoitecer',
    descricao: 'À noite, longe de casa, volta.',
    tipo: 'IrParaCasa',
    contexto: 'eu',
    continuo: true,
    peso: 2,
    params: { motivo: 'noite' },
    considera: [c('noite', E.eu, curva.sim(), { stat: S.noite }), c('tem casa', E.MyHasTag, curva.sim(), { tag: TAG.temCasa }), c('apego', E.eu, curva.traco(0.4), { stat: 'tr.attachment' })],
  },
  {
    nome: 'Acompanhar alguém querido',
    descricao: 'Sozinho e com saudade, anda junto de um amigo ou parente que está perto.',
    tipo: 'Seguir',
    contexto: 'alvo',
    alvos: [WOT.pessoa],
    continuo: true,
    peso: 1.2,
    considera: [
      c('solidão', E.eu, curva.sobe(0.2, 1), { stat: S.solidao }),
      c('laço', E.laco, curva.faixa(20, 90, 0, 1)),
      c('perto', E.DistanceToTarget, curva.perto(15, 0.1)),
    ],
  },
]);

/** Marca de caça desta pessoa num animal (para o mundo achar a presa de alguém). */
export const marcaDeCaca = (quem: number): string => tagDe(TAG.alvoDeCaca, quem);
