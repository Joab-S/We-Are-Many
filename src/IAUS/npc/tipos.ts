/**
 * Tipos de comportamento das pessoas (Behavior Types): os "botões" que alguém aperta. Os comportamentos são as
 * razões; estes são as ações. Muitos comportamentos diferentes acabam no mesmo botão: "comer porque tem fome",
 * "comer porque a comida vai estragar" e "comer na festa" são todos `Comer`.
 *
 * Quase todos os tipos passam a ação ao corpo (`Pessoa.corpo.agir`), que é o mundo. Os do Tagging System (dar
 * e tirar tags de si, marcar e desmarcar os outros, perceber e esquecer tags nos outros) mexem nas tags aqui
 * mesmo, no IAUS, e só avisam o corpo.
 */
import { Abilities, BehaviorTypeBase, BehaviorTypes } from '../behaviorTypes';
import type { ContextInfo } from '../context';
import { identidades, meuOficio, oficioDoAlvo } from './entradas';
import { ehPessoa, type Resultado } from './pessoa';
import { OFICIOS, OFICIO_IDS, tagDe } from './vocab';

/** As ações que o corpo precisa saber fazer (o contrato de um mundo com as pessoas). */
export const ACOES = {
  // Corpo e movimento.
  FicarParado: 'Fica onde está (parado, observando, recuperando o fôlego).',
  Vagar: 'Anda à toa por perto.',
  Explorar: 'Anda para longe, para conhecer a região.',
  IrPara: 'Anda até o alvo (ou até a posição do contexto).',
  IrParaCasa: 'Volta para casa.',
  Seguir: 'Anda junto com o alvo.',
  Fugir: 'Afasta-se do alvo.',
  // Sobrevivência.
  Comer: 'Come do próprio estoque, do celeiro do lugar ou do alvo (fruta, peixe, caça).',
  Beber: 'Bebe água no alvo (rio, lago, poço).',
  Dormir: 'Dorme (em casa ou ao relento).',
  Aquecer: 'Faz fogo ou entra num abrigo para se aquecer.',
  // Trabalho no mato.
  Coletar: 'Colhe frutos do alvo.',
  CortarLenha: 'Corta a árvore do alvo e leva a madeira.',
  ExtrairPedra: 'Tira pedra da rocha do alvo.',
  Cacar: 'Persegue e abate o animal do alvo.',
  Pescar: 'Pesca no alvo.',
  Plantar: 'Prepara e semeia uma roça.',
  Colher: 'Colhe a roça madura do alvo.',
  Pastorear: 'Cuida dos animais da criação.',
  // Ofício e obras.
  EscolherOficio: 'Passa a praticar o ofício do alvo (ou troca para ele).',
  FazerTarefa: 'Faz a tarefa do quadro do lugar no alvo.',
  Trabalhar: 'Trabalha no ofício (habilidade do pacote do ofício).',
  Produzir: 'Transforma um bem em outro na oficina do alvo.',
  Construir: 'Bate na obra do alvo (casa, oficina, obra pública).',
  ConstruirCasa: 'Abre a obra da própria casa perto de onde está (e perto dos vizinhos).',
  AbrirOficina: 'Transforma (parte da) casa na oficina do ofício do alvo.',
  AmpliarCasa: 'Abre a obra que aumenta a casa.',
  Entregar: 'Leva a carga ao estoque da casa, ao celeiro ou a quem encomendou.',
  // Comércio.
  Negociar: 'Propõe uma troca ou compra ao alvo (cria uma oferta).',
  Contratar: 'Encomenda ao alvo um serviço ou bem que ele faz (cria uma oferta de encomenda).',
  AceitarOferta: 'Aceita a oferta do alvo: entrega do estoque ou vai produzir.',
  RecusarOferta: 'Recusa a oferta do alvo.',
  CancelarOferta: 'Desiste de uma oferta que fez.',
  Doar: 'Dá comida ou bens ao alvo que precisa.',
  // Vida social.
  Conversar: 'Conversa com o alvo (o laço muda com o jeito dos dois).',
  Brincar: 'Brinca (crianças) ou se diverte sozinho.',
  Passear: 'Passeia pela praça, pelo mercado ou pela beira da água.',
  Festejar: 'Vai à festa ou à taberna.',
  Rezar: 'Reza no templo ou sozinho.',
  Cortejar: 'Corteja o alvo.',
  Casar: 'Casa com o alvo.',
  TerFilho: 'O casal tem um filho.',
  Cuidar: 'Cuida do alvo (filho, doente, idoso).',
  Ensinar: 'Ensina o ofício ao alvo.',
  Aprender: 'Aprende o ofício com o alvo.',
  Discutir: 'Briga com o alvo.',
  // Moradia e lugares.
  Estabelecer: 'Decide ficar aqui: o lugar vira a casa dele (e, sem vizinhos, um assentamento novo).',
  JuntarSe: 'Passa a morar no assentamento do alvo.',
  MudarSe: 'Muda a família para o assentamento do alvo.',
  Fundar: 'Sai para fundar um lugar novo no sítio do alvo.',
  Ficar: 'Fica onde mora (não muda).',
  // Política e governo.
  ConvocarEleicao: 'Chama o povo para escolher um líder.',
  Candidatar: 'Candidata-se a líder.',
  Votar: 'Vota no candidato do alvo.',
  Apoiar: 'Apoia o líder em público.',
  Protestar: 'Protesta contra o líder.',
  PagarImposto: 'Paga o imposto ao tesouro do lugar.',
  Sonegar: 'Deixa de pagar o imposto.',
  DefinirImposto: 'O líder muda o imposto para a faixa do alvo.',
  OrdenarObra: 'O líder manda fazer a obra pública do alvo (paga pelo tesouro).',
  Recrutar: 'O líder chama gente para o exército.',
  Distribuir: 'O líder distribui comida do celeiro.',
  PromoverFesta: 'O líder faz uma festa na praça.',
  Renunciar: 'O líder deixa o cargo.',
  // Defesa.
  Alistar: 'Entra para o exército do lugar.',
  Patrulhar: 'Ronda o lugar.',
  Treinar: 'Treina com as armas.',
  Atacar: 'Ataca o alvo.',
  Abrigar: 'Corre para o abrigo.',
} as const;
export type Acao = keyof typeof ACOES;

/** Tipos do Tagging System, que mexem nas tags no próprio IAUS. */
export const ACOES_DE_TAG = {
  DarTagASi: 'Dá uma tag a si mesmo ("eu sou lenhador").',
  TirarTagDeSi: 'Tira uma tag de si mesmo.',
  MarcarAlvo: 'Marca uma tag no alvo, com o próprio id ("AlvoDeCaca:12"), visível a todos; com o param `eu`, marca a si junto ("Caçando").',
  DesmarcarAlvo: 'Tira a marca que pôs no alvo (e a de si, com o param `eu`).',
  PerceberTag: 'Passa a crer que o alvo tem uma tag (ou as tags de ofício que o alvo mostra).',
  EsquecerTag: 'Deixa de crer numa tag do alvo.',
} as const;

/** Passa a ação ao corpo. Instantâneas rodam uma vez; contínuas rodam a cada passo até o corpo dizer que acabou. */
export class AcaoNoCorpo extends BehaviorTypeBase {
  private estado: Resultado = 'continua';
  private comecou = false;
  constructor(
    ctx: ContextInfo,
    private readonly acao: string,
  ) {
    super(ctx);
  }
  execute(): void {
    if (this.comecou) return;
    this.comecou = true;
    this.estado = this.agir(0);
  }
  update(dt: number): void {
    if (this.estado === 'continua') this.estado = this.agir(dt);
  }
  isDone(): boolean {
    return this.estado !== 'continua';
  }
  private agir(dt: number): Resultado {
    const o = this.ctx.owner;
    return ehPessoa(o) ? o.corpo.agir(this.acao, this.ctx, dt) : 'falhou';
  }
}

/** Tag de um comportamento de tag: o parâmetro `tag`, ou a do ofício do alvo (`tag: 'oficio'`). */
function tagDoContexto(ctx: ContextInfo): string[] {
  const t = ctx.behavior.strParam('tag', '');
  if (t === 'oficio') {
    const o = oficioDoAlvo(ctx.target);
    return o ? [OFICIOS[o].tag] : [];
  }
  if (t === 'oficiosVistos') {
    // As tags de ofício que o alvo mostra (o que ele faz à vista de todos).
    return ctx.target ? identidades(ctx.target, ctx.now) : [];
  }
  if (t === 'meuOficio') {
    const o = meuOficio(ctx.owner);
    return o ? [OFICIOS[o].tag] : [];
  }
  if (t === 'identidadesVelhas') {
    const o = meuOficio(ctx.owner);
    return identidades(ctx.owner, ctx.now).filter((x) => !o || x !== OFICIOS[o].tag);
  }
  if (t === 'crencasVencidas') {
    const alvo = ctx.target;
    if (!alvo) return [];
    const oficios = new Set(OFICIO_IDS.map((o) => OFICIOS[o].tag));
    return ctx.owner.beliefs.tagsOf(alvo.id).filter((x) => oficios.has(x) && !alvo.tags.has(x, ctx.now));
  }
  return t ? [t] : [];
}

class TagNoIAUS extends BehaviorTypeBase {
  constructor(
    ctx: ContextInfo,
    private readonly modo: keyof typeof ACOES_DE_TAG,
  ) {
    super(ctx);
  }
  execute(): void {
    const { owner, target } = this.ctx;
    const dura = this.ctx.behavior.numParam('dura', Infinity);
    const ate = dura === Infinity ? Infinity : this.ctx.now + dura;
    // Marcar alguém pode marcar a si junto (o caçador com a presa escolhida fica "Caçando"), pelo mesmo tempo.
    const eu = this.ctx.behavior.strParam('eu', '');
    for (const tag of tagDoContexto(this.ctx)) {
      switch (this.modo) {
        case 'DarTagASi':
          owner.tagSelf(tag, ate);
          break;
        case 'TirarTagDeSi':
          owner.untagSelf(tag);
          break;
        case 'MarcarAlvo':
          if (target) owner.mark(target, tagDe(tag, owner.id), ate);
          if (target && eu) owner.tagSelf(eu, ate);
          break;
        case 'DesmarcarAlvo':
          if (target) owner.unmark(target, tagDe(tag, owner.id));
          if (eu) owner.untagSelf(eu);
          break;
        case 'PerceberTag':
          if (target) owner.perceive(target, tag, ate);
          break;
        case 'EsquecerTag':
          if (target) owner.beliefs.forget(target.id, tag);
          break;
      }
    }
    // O mundo fica sabendo (diário, crônica, desenho), mas a tag já mudou.
    if (ehPessoa(owner)) owner.corpo.agir(this.modo, this.ctx, 0);
  }
}

let registrado = false;

/** Registra os tipos e as habilidades dos ofícios no IAUS (uma vez). */
export function registrarTipos(): void {
  if (registrado) return;
  registrado = true;
  for (const nome of Object.keys(ACOES)) BehaviorTypes.register(nome, (c) => new AcaoNoCorpo(c, nome));
  for (const nome of Object.keys(ACOES_DE_TAG) as (keyof typeof ACOES_DE_TAG)[]) BehaviorTypes.register(nome, (c) => new TagNoIAUS(c, nome));
  // Habilidades (o "o quê" dos pacotes de habilidade): o trabalho de cada ofício, feito pelo corpo.
  for (const o of OFICIO_IDS) {
    Abilities.register({
      id: `oficio:${o}`,
      name: OFICIOS[o].nome,
      perform: (ctx, dt) => {
        const owner = ctx.owner;
        if (!ehPessoa(owner)) return true;
        return owner.corpo.agir(`habilidade:oficio:${o}`, ctx, dt) !== 'continua';
      },
    });
  }
}

registrarTipos();
