/**
 * Camada 4, o lugar: onde morar. É aqui que um assentamento nasce sem planta nenhuma: um andarilho acha um
 * sítio com água, comida e material por perto e decide ficar; levanta a casa com o que tem à mão; outro chega,
 * gosta de quem já está e fica também, com a casa perto; os filhos crescem e fazem as suas. Ninguém decide
 * "fundar uma aldeia": a aldeia é o nome que se dá depois ao que as escolhas de cada um fizeram.
 */
import { curva } from '../curvas';
import { c, pacote } from '../dsl';
import { E } from '../entradas';
import { S, TAG, WOT } from '../vocab';

const CAMADA = 'Lugar';

/** Pacote 8: moradia. */
export const MORADIA = pacote({ id: 8, nome: 'Moradia', camada: CAMADA, descricao: 'Escolher onde ficar, juntar-se a quem já mora, levantar e ampliar a casa, abrir a oficina nela.' }, [
  {
    nome: 'Estabelecer-se aqui',
    descricao: 'Sem teto, num sítio com água, comida e madeira ou pedra perto (e clima bom): decide que é aqui que vai morar.',
    tipo: 'Estabelecer',
    contexto: 'eu',
    peso: 3,
    considera: [
      c('sem teto', E.MyHasTag, curva.sim(), { tag: TAG.semTeto }),
      c('água perto', E.eu, curva.limiar(0.35, 10), { stat: S.aquiAgua }),
      c('comida perto', E.eu, curva.limiar(0.3, 9), { stat: S.aquiComida }),
      c('material perto', E.eu, curva.sobe(0.15, 1), { stat: S.aquiMadeira }),
      c('pedra perto', E.eu, curva.sobe(0.6, 1), { stat: S.aquiPedra }),
      c('clima', E.eu, curva.sobe(0.1, 1), { stat: S.aquiClima }),
      c('apego (cansou de andar)', E.eu, curva.traco(0.3), { stat: 'tr.attachment' }),
      c('olhou bastante', E.TimeSinceBehaviorType, curva.faixa(0, 30, 1, 0.4), { behaviorType: 'Explorar' }),
    ],
  },
  {
    nome: 'Juntar-se a quem já mora perto',
    descricao: 'Sem teto, perto de um lugar onde mora alguém de quem gosta: decide morar lá, com a casa perto da dele.',
    tipo: 'JuntarSe',
    contexto: 'alvo',
    alvos: [WOT.assentamento],
    peso: 3.4,
    considera: [
      c('sem teto', E.MyHasTag, curva.sim(), { tag: TAG.semTeto }),
      c('gosto de quem mora lá', E.melhorLacoLa, curva.faixa(-20, 70, 0.05, 1)),
      c('o lugar é bom', E.alvo, curva.sobe(0.2, 1), { stat: S.valor }),
      c('não está cheio', E.alvo, curva.faixa(0, 3, 1, 0.2), { stat: S.pressao }),
      c('sociável', E.eu, curva.traco(0.4), { stat: 'tr.sociability' }),
      c('perto', E.DistanceToTarget, curva.perto(40, 0.1)),
    ],
  },
  {
    nome: 'Procurar um sítio melhor',
    descricao: 'Sem teto e onde está não serve: anda até o melhor sítio que viu.',
    tipo: 'IrPara',
    contexto: 'alvo',
    alvos: [WOT.sitio],
    continuo: true,
    peso: 2.2,
    considera: [
      c('sem teto', E.MyHasTag, curva.sim(), { tag: TAG.semTeto }),
      c('sítio bom', E.alvo, curva.acelera(2, 0.05), { stat: S.valor }),
      c('aqui é pior', E.eu, curva.desce(1, 0.2), { stat: S.aquiAgua }),
      c('perto', E.DistanceToTarget, curva.perto(60, 0.2)),
    ],
  },
  {
    nome: 'Abrir a obra da minha casa',
    descricao: 'Já decidiu onde morar e não tem casa: marca o terreno (perto dos vizinhos) e começa a obra.',
    tipo: 'ConstruirCasa',
    contexto: 'eu',
    peso: 3,
    considera: [
      c('assentado', E.MyHasTag, curva.sim(), { tag: TAG.assentado }),
      c('sem casa', E.MyHasTag, curva.nao(), { tag: TAG.temCasa }),
      c('sem obra aberta', E.eu, curva.nao(), { stat: 'obraPropria' }),
      c('adulto', E.MyHasTag, curva.nao(), { tag: TAG.crianca }),
    ],
  },
  {
    nome: 'Trabalhar na obra da minha casa',
    descricao: 'Tem a obra da própria casa (ou da oficina) e material: bate nela até terminar.',
    tipo: 'Construir',
    contexto: 'alvo',
    alvos: [WOT.obra],
    continuo: true,
    peso: 2.8,
    considera: [
      c('é minha', E.meu, curva.sim()),
      c('tem material', E.alvo, curva.acelera(), { stat: 'temMaterial' }),
      c('disposição', E.eu, curva.desce(1, 0.2), { stat: S.cansaco }),
      c('diligente', E.eu, curva.traco(0.3), { stat: 'tr.diligence' }),
    ],
  },
  {
    nome: 'Ampliar a casa',
    descricao: 'A família não cabe mais: abre a obra de um cômodo a mais (ou de um andar).',
    tipo: 'AmpliarCasa',
    contexto: 'eu',
    peso: 2,
    considera: [
      c('tem casa', E.MyHasTag, curva.sim(), { tag: TAG.temCasa }),
      c('casa apertada', E.casaLotada, curva.limiar(0.95, 12)),
      c('sem obra aberta', E.eu, curva.nao(), { stat: 'obraPropria' }),
      c('ambição', E.eu, curva.traco(0.3), { stat: 'tr.ambition' }),
    ],
  },
  {
    nome: 'Abrir a oficina do meu ofício',
    descricao: 'Já se vê no ofício e o lugar precisa dele: transforma parte da casa na oficina (padaria, marcenaria, ferraria...).',
    tipo: 'AbrirOficina',
    contexto: 'alvo',
    alvos: [WOT.oficio],
    peso: 2.4,
    considera: [
      c('é o meu ofício', E.souDoOficio, curva.sim()),
      c('já me vejo nele', E.tenhoIdentidade, curva.sim()),
      c('o ofício tem oficina', E.alvo, curva.sim(), { stat: 'temOficina' }),
      c('ainda não tenho', E.eu, curva.nao(), { stat: 'temOficina' }),
      c('tem casa', E.MyHasTag, curva.sim(), { tag: TAG.temCasa }),
      c('o lugar precisa', E.alvo, curva.sobe(0.25, 1), { stat: S.falta }),
      c('ambição', E.eu, curva.traco(0.3), { stat: 'tr.ambition' }),
      c('sem obra aberta', E.eu, curva.nao(), { stat: 'obraPropria' }),
    ],
  },
]);

/** Pacote 9: ficar, mudar ou fundar (a decisão das famílias quando o lugar aperta). */
export const MUDANCA = pacote({ id: 9, nome: 'Ficar, mudar ou fundar', camada: CAMADA, descricao: 'Comparar o lugar onde mora com os outros conhecidos e com os sítios vazios.' }, [
  {
    nome: 'Ficar onde mora',
    descricao: 'O lugar é bom, os laços estão aqui e mudar custa: fica.',
    tipo: 'Ficar',
    contexto: 'eu',
    peso: 1,
    considera: [
      c('o lugar é bom', E.eu, curva.sobe(0.05, 1), { stat: S.locBemEstar }),
      c('não está cheio', E.eu, curva.faixa(0, 3, 1, 0.1), { stat: S.locPressao }),
      c('laços aqui', E.eu, curva.faixa(0, 4, 0.4, 1), { stat: 'amigosAqui' }),
      c('apego', E.eu, curva.traco(0.5), { stat: 'tr.attachment' }),
      c('chegou há pouco', E.eu, curva.faixa(0, 15, 1, 0.7), { stat: 'anosAqui' }),
    ],
  },
  {
    nome: 'Mudar-se para outro lugar',
    descricao: 'Outro lugar conhecido está melhor (comida, espaço, amigos lá): a família se muda.',
    tipo: 'MudarSe',
    contexto: 'alvo',
    alvos: [WOT.assentamento],
    peso: 1,
    considera: [
      c('não é o meu', E.doMeuLugar, curva.nao()),
      c('o lugar é bom', E.alvo, curva.sobe(0.05, 1), { stat: S.valor }),
      c('não está cheio', E.alvo, curva.faixa(0, 3, 1, 0.1), { stat: S.pressao }),
      c('amigos lá', E.amigosLa, curva.faixa(0, 4, 0.4, 1)),
      c('desapego', E.eu, curva.traco(-0.5), { stat: 'tr.attachment' }),
    ],
  },
  {
    nome: 'Fundar um lugar novo',
    descricao: 'O lugar está cheio demais e há um sítio vazio bom: a família sai para começar de novo (fissão).',
    tipo: 'Fundar',
    contexto: 'alvo',
    alvos: [WOT.sitio],
    peso: 1,
    considera: [
      c('sítio bom', E.alvo, curva.sobe(0.05, 1), { stat: S.valor }),
      c('aperto em casa', E.eu, { ...curva.limiar(1 / 8, 48), min: 0, max: 8 }, { stat: S.locPressao }),
      c('ousadia', E.eu, curva.traco(0.6), { stat: 'ousadia' }),
      c('não é o líder', E.MyHasTag, curva.nao(0.1), { tag: TAG.lider }),
    ],
  },
]);
