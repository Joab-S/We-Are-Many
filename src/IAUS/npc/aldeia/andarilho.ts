/**
 * O andarilho: quem vive sem assentamento (solto pelo jogador, sobrevivente de um lugar que acabou, quem saiu
 * andando). Perto da tela ele também tem um cérebro, e não só a regra de procurar o povo: come do mato, bebe no
 * rio, dorme ao relento, acende fogo, reza, explora, conversa com outro andarilho e procura o seu povo. Cada ação é
 * um passo só, como as da aldeia: ir até o lugar do povo (e entrar ao chegar), ir ao encontro de outro andarilho,
 * procurar um bom lugar para viver e fundar ali um lugar com o grupo. Juntas, refazem a regra de `loner`
 * (src/sim/eco/settlements/founding.ts), que continua valendo longe da tela.
 *
 * O corpo é o de `lonerAct` (src/sim/eco/people/mente.ts), com os mesmos params das ações simples (rotina.ts),
 * mais `mato` (come do verde onde está, em frações do forrageio do mato, FORAGE_WILD), `junta`, `encontra` e `funda`.
 *
 * Stats que o andarilho vê em si, além dos de sempre (`fome`, `cansaco`, `sono`, `noite`, `dia`, `tarde`,
 * `conversa`, `fe`, os traços): `povo` (1 quando conhece um lugar do seu povo a até 40 tiles) e `grupo` (quantos
 * solitários estão juntos dele, de 0 a 1, cheio no grupo mínimo para fundar) e `lugarBom` (onde está dá para fundar).
 * O mato (`arbusto`) tem `verde`; o outro andarilho (`pessoa`), `junto` (já está perto o bastante).
 */
import { c, pacote } from '../dsl';
import { curva } from '../curvas';
import { E } from '../entradas';
import { WOT } from '../vocab';
import { r } from './rotina';

const deDia = (piso = 0.15) => c('de dia', E.eu, curva.sim(piso), { stat: 'dia' });
const acordado = () => c('acordado', E.eu, curva.desce(1, 0.05), { stat: 'noite' });
const aNoite = (piso = 0.1) => c('à noite', E.eu, curva.sobe(piso, 1), { stat: 'noite' });
const bem = () => [c('alimentado', E.eu, curva.desce(1, 0.1), { stat: 'fome' }), c('descansado', E.eu, curva.desce(1, 0.2), { stat: 'cansaco' })];
const traco = (nome: string, t: string, forca: number) => c(nome, E.eu, curva.traco(forca), { stat: `tr.${t}` });
const perto = (longe = 24, piso = 0.25) => c('perto', E.DistanceToTarget, curva.perto(longe, piso));

/** Pacote 45: a vida de quem anda sozinho, sem lugar. */
export const ANDARILHO = pacote({ id: 45, nome: 'Vida sem lugar', camada: 'Mente', descricao: 'Quem anda sozinho: comer do mato, dormir ao relento, fazer fogo e procurar o seu povo.' }, [
  r({ nome: 'Ir para o lugar do seu povo', descricao: 'Sabe onde vive o seu povo: anda até lá e, ao chegar, passa a morar ali.', tipo: 'JuntarSe', alvo: WOT.assentamento, peso: 2.4, fica: 0, gesto: 'none', dia: 'curious', junta: true, considera: [deDia(0.3), c('vontade de gente', E.eu, curva.sobe(0.4, 1), { stat: 'conversa' }), ...bem(), perto(40, 0.5)] }),
  r({ nome: 'Ir ao encontro de outro andarilho', descricao: 'Sem lugar do povo por perto, vai até outro que anda sozinho: juntos podem fundar um lugar.', tipo: 'Seguir', alvo: WOT.pessoa, peso: 2.2, fica: 0, gesto: 'none', dia: 'social', encontra: true, social: 0.05, considera: [c('não sabe onde ir', E.eu, curva.nao(0), { stat: 'povo' }), c('longe dele', E.alvo, curva.nao(0), { stat: 'junto' }), deDia(0.3), c('vontade de gente', E.eu, curva.sobe(0.4, 1), { stat: 'conversa' }), perto(40, 0.3)] }),
  r({ nome: 'Procurar um bom lugar para viver', descricao: 'Anda até um lugar melhor para viver por perto: verde, com água, ou as ruínas de um lugar antigo.', tipo: 'Explorar', alvo: WOT.sitio, peso: 1.8, fica: 0.5, gesto: 'none', dia: 'curious', considera: [c('não sabe onde ir', E.eu, curva.nao(0), { stat: 'povo' }), c('aqui não serve', E.eu, curva.nao(0.1), { stat: 'lugarBom' }), deDia(0.3), ...bem(), perto(30, 0.4)] }),
  r({ nome: 'Fundar um lugar com o grupo', descricao: 'Com outros andarilhos juntos e num lugar bom, fundam ali um lugar para viver.', tipo: 'Fundar', peso: 3, fica: 2, gesto: 'hammer', dia: 'curious', funda: true, considera: [c('não sabe onde ir', E.eu, curva.nao(0), { stat: 'povo' }), c('em grupo', E.eu, curva.limiar(0.95, 30), { stat: 'grupo' }), c('lugar bom', E.eu, curva.sim(0), { stat: 'lugarBom' }), deDia(0.4)] }),
  r({ nome: 'Colher frutos no mato', descricao: 'Com fome e sem celeiro, procura frutos e raízes no mato mais verde por perto.', tipo: 'Coletar', alvo: WOT.arbusto, peso: 2.6, fica: 4, gesto: 'reap', dia: 'eat', mato: 0.5, considera: [c('fome', E.eu, curva.limiar(0.3, 8), { stat: 'fome' }), c('verde', E.alvo, curva.sobe(0.2, 1), { stat: 'verde' }), perto(12, 0.3)] }),
  r({ nome: 'Beber água no rio', descricao: 'Vai até a beira da água beber e se lavar (e acha alguma coisa para comer na margem).', tipo: 'Beber', alvo: WOT.agua, peso: 1.5, fica: 2, gesto: 'dig', dia: 'water', descanso: 0.1, mato: 0.2, considera: [deDia(0.2), c('calor e cansaço', E.eu, curva.sobe(0.3, 1), { stat: 'cansaco' }), perto(15, 0.2)] }),
  r({ nome: 'Dormir ao relento', descricao: 'Com sono, deita onde está e dorme até descansar (de noite, até o dia nascer).', tipo: 'Dormir', peso: 3, fica: 1, gesto: 'rest', dia: 'rest', considera: [c('sono', E.eu, curva.limiar(0.55, 10), { stat: 'sono' })] }),
  r({ nome: 'Acender uma fogueira', descricao: 'Ao escurecer, junta gravetos e acende um fogo para passar a noite.', tipo: 'Aquecer', peso: 1.9, fica: 3, gesto: 'hammer', dia: 'rest', descanso: 0.15, considera: [c('anoitecer', E.eu, curva.lombada(0.5, 0.3, 0.05), { stat: 'noite' }), traco('jeitoso', 'dexterity', 0.3)] }),
  r({ nome: 'Descansar à sombra', descricao: 'Cansado da caminhada, senta à sombra um pouco.', tipo: 'FicarParado', peso: 1.7, fica: 3, gesto: 'rest', dia: 'rest', descanso: 0.25, considera: [c('cansaço', E.eu, curva.limiar(0.3, 8), { stat: 'cansaco' }), deDia(0.3)] }),
  r({ nome: 'Explorar os arredores', descricao: 'Vai ver o que tem ali perto: um vale, uma mata, um rastro.', tipo: 'Explorar', peso: 1.4, fica: 2, gesto: 'none', dia: 'curious', anda: true, considera: [deDia(0.2), traco('curioso', 'curiosity', 0.6), ...bem()] }),
  r({ nome: 'Subir num alto para olhar longe', descricao: 'Sem saber onde está o seu povo, sobe num lugar alto e olha o horizonte.', tipo: 'Explorar', peso: 1.5, fica: 2, gesto: 'none', dia: 'curious', anda: true, considera: [deDia(0.2), c('não sabe onde ir', E.eu, curva.nao(0.1), { stat: 'povo' }), traco('paciente', 'patience', 0.3), ...bem()] }),
  r({ nome: 'Rezar sozinho', descricao: 'A fé pede: ajoelha onde está e reza.', tipo: 'Rezar', peso: 1.6, fica: 2.5, gesto: 'pray', dia: 'pray', fe: 0.4, considera: [acordado(), c('fé', E.eu, curva.limiar(0.4, 8), { stat: 'fe' }), traco('devoto', 'faith', 0.4)] }),
  r({ nome: 'Contemplar as estrelas', descricao: 'De noite, sem sono, fica olhando o céu.', tipo: 'FicarParado', peso: 1.2, fica: 3, gesto: 'none', dia: 'pray', fe: 0.15, considera: [aNoite(0.05), c('sem sono', E.eu, curva.desce(1, 0.1), { stat: 'cansaco' }), traco('curioso', 'curiosity', 0.4)] }),
  r({ nome: 'Conversar com outro andarilho', descricao: 'Encontra outro que anda sozinho e conversa um pouco.', tipo: 'Conversar', alvo: WOT.pessoa, peso: 2.2, fica: 3, gesto: 'talk', social: 0.45, outro: 0.4, laco: 3, considera: [acordado(), c('vontade de conversar', E.eu, curva.limiar(0.3, 8), { stat: 'conversa' }), perto(12)] }),
  r({ nome: 'Talhar uma ferramenta', descricao: 'O jeitoso lasca uma pedra ou talha um pau para ter com que se virar.', tipo: 'Produzir', peso: 1.2, fica: 4, gesto: 'hammer', dia: 'rest', descanso: 0.05, considera: [deDia(0.3), traco('jeitoso', 'dexterity', 0.6), ...bem()] }),
  r({ nome: 'Cantar para si mesmo', descricao: 'No fim da tarde, canta baixinho para espantar a solidão.', tipo: 'Festejar', peso: 1.1, fica: 2, gesto: 'cheer', dia: 'social', social: 0.12, considera: [c('fim de tarde', E.eu, curva.sobe(0.2, 1), { stat: 'tarde' }), traco('carismático', 'charisma', 0.4), traco('sociável', 'sociability', 0.3)] }),
]);
