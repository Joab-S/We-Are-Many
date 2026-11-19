/**
 * A pessoa numa aldeia do jogo (o Ecosystem, nos lugares perto da tela): um cérebro do IAUS por pessoa, com
 * ações atômicas. Cada comportamento é UMA coisa com UM alvo e um fim: comer no celeiro, dormir em casa, pegar
 * uma carga do pátio, levar a carga ao celeiro, derrubar esta árvore, bater nesta obra. Nada encadeia as ações
 * por roteiro: quem pega a carga passa a ter `carga`, e aí "levar ao celeiro" vale mais do que tudo o resto; quem
 * trabalhou cansa, e "dormir" sobe; quem vê a fruta no caminho com fome come e volta ao trabalho porque o
 * trabalho continua sendo a melhor nota.
 *
 * O que o mundo precisa dar (o corpo, em src/sim/eco/people/mente.ts):
 *
 * | Quem | Stats |
 * |---|---|
 * | A pessoa (`eu`) | `fome`, `cansaco`, `solidao`, `fe` (0 a 1), `semComida` (quanto falta no celeiro, 0 a 1), `cheio` e `espacoLenha` (a carga na mão, 0 a 1), `carga`, `trabalha`, `semCasa`, `alarme`, `enterro` (0 ou 1) e os traços `tr.*` (−1 a 1) |
 * | Celeiro e casa | `comida` (há o que comer) |
 * | Praça | `gente` (quantos estão lá, 0 a 1), `festa` e `caravana` (1 se há e a pessoa chega a tempo) |
 * | Posto, roça, carga, árvore | `falta` (quanto o lugar precisa do que sai dali, 0 a 1) |
 * | Roça | `safra` (0 a 1), `oficio` (1 para o agricultor) |
 * | Carga | `quantidade` (0 a 1) |
 * | Obra | `oficio` (1 para o construtor), `vaga`, `urgente` |
 * | Árvore | `cabe` (a madeira cabe no armazém) |
 * | Animal | `oficio` (1 para o caçador), `abundante` |
 * | Pessoa | `laco` (0 a 1), `livre`, `parente` |
 * | Portão | `oficio` (1 para guarda e soldado) |
 *
 * Os pesos seguem a ordem do IAUS: 1 ócio, 2 a 2,5 convívio e fé, 3 trabalho, 4 necessidades do corpo, 5
 * emergência. Uma ação em andamento vale `FOCO_ALDEIA` vezes mais, então só troca no meio quem tem algo bem
 * mais urgente (o momentum; o Curvature usa 25%).
 */
import { BrainLibrary } from '../../brain';
import { c, pacote, type ComportamentoDef } from '../dsl';
import { curva } from '../curvas';
import { E } from '../entradas';
import { WOT } from '../vocab';

/** Momentum das ações da aldeia: a ação em andamento vale 50% a mais (o pensamento é a cada segundo). */
export const FOCO_ALDEIA = 1.5;

/** Considerações que quase toda ação de trabalho tem: quem está com fome, cansado ou carregando para antes. */
const corpoEmOrdem = () => [
  c('alimentado', E.eu, curva.desce(1, 0.08), { stat: 'fome' }),
  c('descansado', E.eu, curva.desce(1, 0.08), { stat: 'cansaco' }),
];
const semCarga = () => c('mãos livres', E.eu, curva.nao(0), { stat: 'carga' });
const perto = (longe: number, piso: number) => c('perto', E.DistanceToTarget, curva.perto(longe, piso));
const trabalho = (b: Omit<ComportamentoDef, 'continuo' | 'foco'>): ComportamentoDef => ({ ...b, continuo: true, foco: FOCO_ALDEIA });

/** Pacote 35: o corpo (comer, dormir, se abrigar). */
export const NECESSIDADES_DA_ALDEIA = pacote(
  { id: 35, nome: 'Necessidades na aldeia', camada: 'Corpo', descricao: 'Comer, dormir e correr para o abrigo, cada um com um lugar e um fim.' },
  [
    trabalho({
      nome: 'Comer no celeiro',
      descricao: 'Com fome, vai ao celeiro e come até ficar satisfeito (se houver comida).',
      tipo: 'Comer',
      contexto: 'alvo',
      alvos: [WOT.celeiro],
      peso: 4,
      considera: [c('fome', E.eu, curva.limiar(0.4, 9), { stat: 'fome' }), c('tem comida', E.alvo, curva.sim(0), { stat: 'comida' }), perto(60, 0.3)],
    }),
    trabalho({
      nome: 'Comer em casa',
      descricao: 'Com fome, come em casa da comida da família (que vem do celeiro do lugar).',
      tipo: 'Comer',
      contexto: 'alvo',
      alvos: [WOT.casa],
      peso: 4,
      considera: [c('fome', E.eu, curva.limiar(0.4, 9), { stat: 'fome' }), c('tem comida', E.alvo, curva.sim(0), { stat: 'comida' }), perto(60, 0.3)],
    }),
    trabalho({
      nome: 'Procurar comida no mato',
      descricao: 'Com fome e o celeiro vazio, colhe o que acha no mato perto.',
      tipo: 'Coletar',
      contexto: 'eu',
      peso: 4,
      considera: [c('fome', E.eu, curva.limiar(0.45, 9), { stat: 'fome' }), c('celeiro vazio', E.eu, curva.sim(0.06), { stat: 'semComida' })],
    }),
    trabalho({
      nome: 'Dormir em casa',
      descricao: 'Cansado, vai para casa e dorme até descansar; o preguiçoso deita antes.',
      tipo: 'Dormir',
      contexto: 'alvo',
      alvos: [WOT.casa],
      peso: 4,
      considera: [c('cansaço', E.eu, curva.limiar(0.62, 9), { stat: 'cansaco' }), c('disposição', E.eu, curva.traco(-0.3), { stat: 'tr.diligence' }), perto(60, 0.3)],
    }),
    trabalho({
      nome: 'Dormir ao relento',
      descricao: 'Sem casa, dorme onde está quando o cansaço aperta.',
      tipo: 'Dormir',
      contexto: 'eu',
      peso: 4,
      considera: [c('cansaço', E.eu, curva.limiar(0.7, 9), { stat: 'cansaco' }), c('sem casa', E.eu, curva.sim(0), { stat: 'semCasa' })],
    }),
    trabalho({
      nome: 'Correr para o abrigo',
      descricao: 'O alarme tocou: quem não luta (ou tem medo) corre para a praça.',
      tipo: 'Abrigar',
      contexto: 'alvo',
      alvos: [WOT.praca],
      peso: 5,
      considera: [c('alarme', E.eu, curva.sim(0), { stat: 'alarme' }), c('medo', E.eu, curva.traco(-0.7), { stat: 'tr.courage' })],
    }),
  ],
);

/** Pacote 36: o trabalho (ofício, colheita, carga, obra, lenha, caça, defesa). */
export const TRABALHO_DA_ALDEIA = pacote(
  { id: 36, nome: 'Trabalho na aldeia', camada: 'Sustento', descricao: 'O que o lugar precisa, visto por quem trabalha: cada tarefa é uma ação com alvo e fim.' },
  [
    trabalho({
      nome: 'Trabalhar no posto do ofício',
      descricao: 'Vai ao posto do ofício (roça, mina, porto, oficina) e trabalha um turno; o que sai fica no pátio ou na mão.',
      tipo: 'Trabalhar',
      contexto: 'alvo',
      alvos: [WOT.posto],
      peso: 3,
      considera: [c('falta', E.alvo, curva.sobe(0.35, 1), { stat: 'falta' }), c('diligente', E.eu, curva.traco(0.5), { stat: 'tr.diligence' }), semCarga(), ...corpoEmOrdem(), perto(40, 0.15)],
    }),
    trabalho({
      nome: 'Colher a roça',
      descricao: 'Na safra, colhe a roça madura; o agricultor sempre, os outros quando falta comida.',
      tipo: 'Colher',
      contexto: 'alvo',
      alvos: [WOT.roca],
      peso: 3,
      considera: [c('safra', E.alvo, curva.sobe(0, 1), { stat: 'safra' }), c('ofício', E.alvo, curva.sobe(0.3, 1), { stat: 'oficio' }), c('falta', E.alvo, curva.sobe(0.4, 1), { stat: 'falta' }), semCarga(), ...corpoEmOrdem(), perto(40, 0.15)],
    }),
    trabalho({
      nome: 'Pegar a carga do pátio',
      descricao: 'Há carga parada no pátio: pega uma para levar ao celeiro, mais se faz falta lá.',
      tipo: 'PegarCarga',
      contexto: 'alvo',
      alvos: [WOT.carga],
      peso: 3,
      considera: [c('carga cheia', E.alvo, curva.limiar(0.5, 10), { stat: 'quantidade' }), c('falta', E.alvo, curva.sobe(0.4, 1), { stat: 'falta' }), c('diligente', E.eu, curva.traco(0.3), { stat: 'tr.diligence' }), semCarga(), ...corpoEmOrdem(), perto(40, 0.15)],
    }),
    trabalho({
      nome: 'Levar a carga ao celeiro',
      descricao: 'Com a carga na mão, leva ao celeiro.',
      tipo: 'Entregar',
      contexto: 'alvo',
      alvos: [WOT.celeiro],
      peso: 3.5,
      considera: [c('carga', E.eu, curva.sim(0), { stat: 'carga' }), c('mão cheia', E.eu, curva.sobe(0, 1), { stat: 'cheio' }), perto(120, 0.6)],
    }),
    trabalho({
      nome: 'Bater na obra',
      descricao: 'Trabalha na obra aberta: o construtor sempre; os outros no mutirão (obra grande ou sem construtor).',
      tipo: 'Construir',
      contexto: 'alvo',
      alvos: [WOT.obra],
      peso: 3,
      considera: [c('ofício', E.alvo, curva.sobe(0, 1), { stat: 'oficio' }), c('vaga', E.alvo, curva.sim(0), { stat: 'vaga' }), c('urgente', E.alvo, curva.sobe(0.6, 1), { stat: 'urgente' }), c('diligente', E.eu, curva.traco(0.4), { stat: 'tr.diligence' }), semCarga(), ...corpoEmOrdem(), perto(40, 0.15)],
    }),
    trabalho({
      nome: 'Derrubar uma árvore',
      descricao: 'O lenhador escolhe uma árvore livre, derruba e sai com a madeira na mão.',
      tipo: 'CortarLenha',
      contexto: 'alvo',
      alvos: [WOT.arvore],
      peso: 3,
      considera: [c('falta', E.alvo, curva.sobe(0.3, 1), { stat: 'falta' }), c('cabe no armazém', E.alvo, curva.sim(0), { stat: 'cabe' }), c('cabe na mão', E.eu, curva.sobe(0, 1), { stat: 'espacoLenha' }), ...corpoEmOrdem(), perto(40, 0.15)],
    }),
    trabalho({
      nome: 'Caçar',
      descricao: 'O caçador persegue um bicho onde a caça sobra; a carne vai na mão para o celeiro.',
      tipo: 'Cacar',
      contexto: 'alvo',
      alvos: [WOT.animal],
      peso: 3,
      considera: [c('ofício', E.alvo, curva.sobe(0, 1), { stat: 'oficio' }), c('caça sobrando', E.alvo, curva.sim(0), { stat: 'abundante' }), semCarga(), ...corpoEmOrdem(), perto(24, 0.3)],
    }),
    trabalho({
      nome: 'Defender o lugar',
      descricao: 'O alarme tocou: o corajoso pega a lança e vai ao portão.',
      tipo: 'Defender',
      contexto: 'alvo',
      alvos: [WOT.portao],
      peso: 5,
      considera: [c('alarme', E.eu, curva.sim(0), { stat: 'alarme' }), c('coragem', E.eu, curva.traco(0.9), { stat: 'tr.courage' })],
    }),
    trabalho({
      nome: 'Patrulhar',
      descricao: 'Guarda e soldado rondam o portão quando não há outra coisa a fazer.',
      tipo: 'Patrulhar',
      contexto: 'alvo',
      alvos: [WOT.portao],
      peso: 2,
      considera: [c('ofício', E.alvo, curva.sim(0), { stat: 'oficio' }), ...corpoEmOrdem(), perto(40, 0.2)],
    }),
  ],
);

/** Pacote 37: convívio, fé e o que acontece na praça. */
export const CONVIVIO_DA_ALDEIA = pacote(
  { id: 37, nome: 'Convívio na aldeia', camada: 'Vínculos', descricao: 'Conversar, rezar, a festa, o enterro, a caravana e ficar em casa.' },
  [
    trabalho({
      nome: 'Conversar com alguém',
      descricao: 'Sozinho há tempo, procura alguém de quem gosta que esteja livre por perto.',
      tipo: 'Conversar',
      contexto: 'alvo',
      alvos: [WOT.pessoa],
      peso: 2.5,
      considera: [
        c('solidão', E.eu, curva.limiar(0.55, 8), { stat: 'solidao' }),
        c('sociável', E.eu, curva.traco(0.6), { stat: 'tr.sociability' }),
        c('laço', E.alvo, curva.sobe(0.5, 1), { stat: 'laco' }),
        c('livre', E.alvo, curva.sim(0.3), { stat: 'livre' }),
        perto(24, 0.2),
      ],
    }),
    trabalho({
      nome: 'Ir à praça encontrar gente',
      descricao: 'Sozinho há tempo, vai à praça, mais se há gente lá.',
      tipo: 'Passear',
      contexto: 'alvo',
      alvos: [WOT.praca],
      peso: 2.5,
      considera: [c('solidão', E.eu, curva.limiar(0.62, 8), { stat: 'solidao' }), c('sociável', E.eu, curva.traco(0.5), { stat: 'tr.sociability' }), c('gente', E.alvo, curva.sobe(0.4, 1), { stat: 'gente' }), perto(40, 0.2)],
    }),
    trabalho({
      nome: 'Rezar no templo',
      descricao: 'A fé chama: vai ao templo, mais cedo o devoto.',
      tipo: 'Rezar',
      contexto: 'alvo',
      alvos: [WOT.templo],
      peso: 2.5,
      considera: [c('fé', E.eu, curva.limiar(0.6, 8), { stat: 'fe' }), c('devoto', E.eu, curva.traco(0.8), { stat: 'tr.faith' }), perto(50, 0.2)],
    }),
    trabalho({
      nome: 'Ir à festa',
      descricao: 'Há festa na praça e dá tempo de chegar: o sociável vai, quem está com fome come antes.',
      tipo: 'Festejar',
      contexto: 'alvo',
      alvos: [WOT.praca],
      peso: 3,
      considera: [c('festa', E.alvo, curva.sim(0), { stat: 'festa' }), c('sociável', E.eu, curva.traco(0.5), { stat: 'tr.sociability' }), c('alimentado', E.eu, curva.desce(1, 0.2), { stat: 'fome' })],
    }),
    trabalho({
      nome: 'Ir ao enterro',
      descricao: 'Morreu alguém da família: vai ao enterro.',
      tipo: 'Rezar',
      contexto: 'alvo',
      alvos: [WOT.evento],
      peso: 3.5,
      considera: [c('enterro', E.eu, curva.sim(0), { stat: 'enterro' })],
    }),
    trabalho({
      nome: 'Ver a caravana',
      descricao: 'Chegou uma caravana à praça: o curioso vai ver.',
      tipo: 'Passear',
      contexto: 'alvo',
      alvos: [WOT.praca],
      peso: 2,
      considera: [c('caravana', E.alvo, curva.sim(0), { stat: 'caravana' }), c('curioso', E.eu, curva.traco(0.9), { stat: 'tr.curiosity' }), ...corpoEmOrdem()],
    }),
    trabalho({
      nome: 'Ficar em casa',
      descricao: 'Nada pede a pessoa: fica em casa (o caseiro mais).',
      tipo: 'IrParaCasa',
      contexto: 'alvo',
      alvos: [WOT.casa],
      peso: 1,
      considera: [c('à toa', E.Constant, curva.sempre(0.25)), c('caseiro', E.eu, curva.traco(0.4), { stat: 'tr.familism' }), perto(60, 0.3)],
    }),
  ],
);

/** Pacote 38: a criança da aldeia. */
export const INFANCIA_DA_ALDEIA = pacote(
  { id: 38, nome: 'Infância na aldeia', camada: 'Vínculos', descricao: 'Brincar na praça e ficar perto dos pais.' },
  [
    trabalho({
      nome: 'Brincar na praça',
      descricao: 'Brinca na praça com as outras crianças.',
      tipo: 'Brincar',
      contexto: 'alvo',
      alvos: [WOT.praca],
      peso: 2,
      considera: [c('vontade de brincar', E.Constant, curva.sempre(0.6)), c('gente', E.alvo, curva.sobe(0.5, 1), { stat: 'gente' }), ...corpoEmOrdem(), perto(40, 0.2)],
    }),
    trabalho({
      nome: 'Ficar perto dos pais',
      descricao: 'Sente falta dos pais e vai para perto deles.',
      tipo: 'Seguir',
      contexto: 'alvo',
      alvos: [WOT.pessoa],
      peso: 2,
      considera: [c('pai ou mãe', E.alvo, curva.sim(0), { stat: 'parente' }), c('solidão', E.eu, curva.sobe(0.3, 1), { stat: 'solidao' }), perto(40, 0.4)],
    }),
  ],
);

export const PACOTES_DA_ALDEIA = [NECESSIDADES_DA_ALDEIA, TRABALHO_DA_ALDEIA, CONVIVIO_DA_ALDEIA, INFANCIA_DA_ALDEIA];

/** Cérebros de nascença da aldeia: adulto que trabalha, criança e idoso. */
export const CEREBRO_DA_ALDEIA = { adulto: 11, crianca: 12, idoso: 13 } as const;
const ids = (...p: { id: number }[]) => p.map((x) => x.id);
for (const [id, name, packs] of [
  [CEREBRO_DA_ALDEIA.adulto, 'Aldeão', ids(NECESSIDADES_DA_ALDEIA, TRABALHO_DA_ALDEIA, CONVIVIO_DA_ALDEIA)],
  [CEREBRO_DA_ALDEIA.crianca, 'Criança da aldeia', ids(NECESSIDADES_DA_ALDEIA, CONVIVIO_DA_ALDEIA, INFANCIA_DA_ALDEIA)],
  [CEREBRO_DA_ALDEIA.idoso, 'Idoso da aldeia', ids(NECESSIDADES_DA_ALDEIA, CONVIVIO_DA_ALDEIA)],
] as const) {
  if (!BrainLibrary.brains.has(id)) BrainLibrary.brains.set(id, { id, name, behaviorPackIds: [...packs], abilityPackIds: [] });
}
