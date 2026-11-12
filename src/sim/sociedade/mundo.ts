/**
 * Laboratório da sociedade: um mundo pequeno, de pessoas individuais, onde os assentamentos nascem só das
 * escolhas de cada um (src/IAUS/npc). Ninguém aqui decide "fundar uma aldeia" nem "subir de nível": uma pessoa
 * acha um sítio com água, comida e material e fica; levanta a casa com o que tem à mão; outro chega, gosta dela e
 * fica perto; os filhos nascem; quando há gente para dividir o trabalho, cada um escolhe o ofício pela falta que
 * sente no lugar, abre a oficina na casa, encomenda ao vizinho o que não quer fazer; o lugar cresce, as brigas e
 * faltas aparecem, alguém pede um líder, o povo vota, e o líder manda fazer as obras públicas que a personalidade
 * dele acha melhores. O nome que o lugar ganha (casa isolada, lugarejo, aldeia, vila, cidade) é só a leitura do
 * que já está lá.
 *
 * Determinístico: a mesma semente dá a mesma história. Não depende do jogo; o jogo usa os mesmos pacotes.
 */
import { AiEntity, SimpleWorld } from '../../IAUS/aiEntity';
import type { Brain } from '../../IAUS/brain';
import { SelectionMode } from '../../IAUS/enums';
import { SeededRng, distance } from '../../IAUS/math';
import { Lugar, Pessoa, compatibilidade } from '../../IAUS/npc/pessoa';
import { ajustarPacotes, criarCerebro } from '../../IAUS/npc/pacotes/index';
import { meuOficio } from '../../IAUS/npc/entradas';
import { TRAITS } from '../../IAUS/npc/pessoa/traits';
import {
  BENS,
  IMPOSTOS,
  OBRAS_PUBLICAS,
  OFICIOS,
  OFICIO_IDS,
  S,
  TAG,
  WOT,
  falta,
  hab,
  inv,
  necessidadeObra,
  precisa,
  type Bem,
  type Imposto,
  type ObraPublica,
  type Oficio,
} from '../../IAUS/npc/vocab';
import { CHAO, ehAgua, gerarTerreno, type Terreno } from './terreno';
import { agir } from './acoes';

/** Segundos de um dia e de um ano do laboratório. */
export const DIA = 12;
export const ANO = 60;
export const ADULTO = 14;
export const IDOSO = 55;

export const PRECO: Record<Bem, number> = { comida: 1, madeira: 1, pedra: 1.5, ferramentas: 4, pao: 2, tabuas: 2, couro: 2, tecido: 3, ceramica: 3, cerveja: 2 };

/** Material e trabalho de cada obra. */
export const OBRA: Record<string, { madeira: number; pedra: number; trabalho: number; custo: number }> = {
  casa: { madeira: 6, pedra: 2, trabalho: 14, custo: 0 },
  ampliacao: { madeira: 4, pedra: 2, trabalho: 8, custo: 0 },
  oficina: { madeira: 5, pedra: 3, trabalho: 10, custo: 0 },
  estrada: { madeira: 0, pedra: 4, trabalho: 10, custo: 10 },
  praca: { madeira: 2, pedra: 6, trabalho: 12, custo: 14 },
  prefeitura: { madeira: 8, pedra: 10, trabalho: 20, custo: 30 },
  poco: { madeira: 1, pedra: 4, trabalho: 8, custo: 8 },
  celeiro: { madeira: 8, pedra: 2, trabalho: 12, custo: 12 },
  mercado: { madeira: 6, pedra: 4, trabalho: 12, custo: 18 },
  templo: { madeira: 6, pedra: 10, trabalho: 18, custo: 24 },
  muralha: { madeira: 4, pedra: 16, trabalho: 24, custo: 30 },
  quartel: { madeira: 8, pedra: 8, trabalho: 16, custo: 24 },
};

export const CATEGORIA_OBRA: Record<ObraPublica, 'Serviço' | 'Fé' | 'Defesa'> = {
  estrada: 'Serviço',
  praca: 'Serviço',
  prefeitura: 'Serviço',
  poco: 'Serviço',
  celeiro: 'Serviço',
  mercado: 'Serviço',
  templo: 'Fé',
  muralha: 'Defesa',
  quartel: 'Defesa',
};

/** Coisa física do mundo (recurso, prédio, obra, roça, animal), com o que guarda. */
export class Coisa extends AiEntity {
  /** Estoque (prédios) ou material já entregue (obras). */
  readonly estoque = new Map<Bem, number>();
  /** Obra: o que vira quando terminar ("casa", "oficina:padeiro", "estrada"...). */
  vira = '';
  /** Obra: material que pede e trabalho que falta. */
  pede = { madeira: 0, pedra: 0 };
  trabalho = 0;
  /** Recurso: quanto volta por segundo e o máximo. */
  volta = 0;
  maximo = 0;
  /** Animal: rumo. */
  vx = 0;
  vy = 0;
}

/** As coisas do mundo por id, com um índice por tipo (obras e roças sem varrer as árvores todas). */
export class Coisas extends Map<number, Coisa> {
  private readonly tipos = new Map<string, Set<Coisa>>();
  override set(id: number, c: Coisa): this {
    const velha = super.get(id);
    if (velha) this.tipos.get(velha.type)?.delete(velha);
    super.set(id, c);
    if (this.tipos) {
      let t = this.tipos.get(c.type);
      if (!t) this.tipos.set(c.type, (t = new Set()));
      t.add(c);
    }
    return this;
  }
  override delete(id: number): boolean {
    const c = super.get(id);
    if (c) this.tipos.get(c.type)?.delete(c);
    return super.delete(id);
  }
  doTipo(tipo: string): Iterable<Coisa> {
    return this.tipos.get(tipo) ?? [];
  }
}

/** Um morador do laboratório: a pessoa, o cérebro e o que só o mundo sabe dele. */
export interface Gente {
  p: Pessoa;
  brain: Brain;
  bolso: Map<Bem, number>;
  casa: Coisa | null;
  lugar: LugarVivo | null;
  nasceu: number;
  /** Idade em que morre de velhice. */
  limite: number;
  pais: number[];
  conjuge: number;
  oficioDesde: number;
  /** Posição a que a ação atual está indo (se houver) e o tempo já gasto nela. */
  rumo: { x: number; y: number } | null;
  tempo: number;
  /** Segundos com fome ou sede no máximo (morre se passar do limite). */
  aperto: number;
  diario: string[];
  /** Alvo que a ação atual escolheu sozinha (lote, ponto de passeio). */
  aux: { x: number; y: number } | null;
}

/** Um assentamento que existe porque gente mora junto. */
export interface LugarVivo {
  id: number;
  nome: string;
  ent: Lugar;
  x: number;
  y: number;
  fundadoEm: number;
  fundador: number;
  casas: Coisa[];
  oficinas: Coisa[];
  publicas: Set<ObraPublica>;
  celeiro: Map<Bem, number>;
  tesouro: number;
  imposto: Imposto;
  lider: number;
  eleicao: { ate: number; votos: Map<number, number> } | null;
  chamadoAte: number;
  conflitos: number;
  protestos: number[];
  apoios: number[];
  estradas: Set<number>;
  rotulo: string;
  /** Opções do líder (obras públicas e faixas de imposto) como alvos. */
  opcoesObra: AiEntity[];
  opcoesImposto: AiEntity[];
  festa: AiEntity | null;
  abandonado: boolean;
}

export interface Evento {
  t: number;
  texto: string;
  lugar: number;
}

export interface SociedadeOpcoes {
  w?: number;
  h?: number;
  /** Quantos andarilhos começam no mapa. */
  pioneiros?: number;
  /** Chegada de andarilhos de fora: por ano. */
  chegadas?: number;
  /** Teto de gente no mapa. */
  teto?: number;
}

const NOMES = ['Ana', 'Bento', 'Cora', 'Davi', 'Elis', 'Fábio', 'Gil', 'Hana', 'Ivo', 'Jade', 'Lia', 'Mauro', 'Nina', 'Otto', 'Pia', 'Rui', 'Sara', 'Téo', 'Uma', 'Vito', 'Zoe'];
const LUGARES = ['Água Clara', 'Pedra Alta', 'Bosque Novo', 'Vau', 'Remanso', 'Campina', 'Boa Vista', 'Lajeado', 'Cerrito', 'Ribeira', 'Pinhal', 'Recanto'];

export class Sociedade {
  readonly t: Terreno;
  readonly rng: SeededRng;
  readonly world = new SimpleWorld();
  readonly gente = new Map<number, Gente>();
  readonly coisas = new Coisas();
  readonly lugares: LugarVivo[] = [];
  readonly ofertas = new Map<number, AiEntity>();
  readonly sitios: AiEntity[] = [];
  readonly cronica: Evento[] = [];
  readonly mortos: { nome: string; causa: string; t: number }[] = [];
  private nextId = 1;
  private grade = new Map<number, AiEntity[]>();
  private relogioLento = 0;
  private relogioSitios = 0;
  private relogioChegada = 0;
  readonly opt: Required<SociedadeOpcoes>;
  /** Opções de ofício de cada pessoa (o "alvo" da escolha), pelo id da pessoa. */
  private readonly opcoesOficio = new Map<number, AiEntity[]>();
  /** A última água (e pedra) que cada um viu: quem anda longe lembra o caminho de volta. */
  private readonly lembra = new Map<string, AiEntity>();
  private readonly cacheComum = new Map<string, { t: number; v: number }>();

  constructor(
    readonly semente: number,
    opt: SociedadeOpcoes = {},
  ) {
    this.opt = { w: opt.w ?? 80, h: opt.h ?? 80, pioneiros: opt.pioneiros ?? 1, chegadas: opt.chegadas ?? 0.6, teto: opt.teto ?? 70 };
    this.rng = new SeededRng(semente);
    this.t = gerarTerreno(this.opt.w, this.opt.h, semente);
    this.semear();
    this.atualizarSitios();
    for (let k = 0; k < this.opt.pioneiros; k++) this.chegarAndarilho(true);
  }

  get agora(): number {
    return this.world.time;
  }
  get ano(): number {
    return this.world.time / ANO;
  }
  id(): number {
    return this.nextId++;
  }
  sorte(): number {
    return this.rng.next();
  }

  // ---- Mundo físico ----

  private semear(): void {
    const { w, h, chao } = this.t;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const c = chao[y * w + x];
        const r = this.sorte();
        if (c === CHAO.mata && r < 0.35) this.recurso(WOT.arvore, x, y, 6, 0.02);
        else if (c === CHAO.campo && r < 0.025) this.recurso(WOT.arvore, x, y, 6, 0.02);
        else if (c === CHAO.pedra && r < 0.3) this.recurso(WOT.rocha, x, y, 10, 0.004);
        else if ((c === CHAO.campo || c === CHAO.fertil) && r < 0.035) this.recurso(WOT.arbusto, x, y, 4, 0.05);
        // Pedras soltas no campo e na mata: pouca pedra, mas perto de quase todo lugar.
        else if ((c === CHAO.campo || c === CHAO.mata) && r > 0.993) this.recurso(WOT.rocha, x, y, 4, 0.002);
        else if (c === CHAO.agua && r < 0.04 && !ehAgua(this.t, x + 1, y) !== !ehAgua(this.t, x - 1, y)) this.recurso(WOT.pesqueiro, x + (ehAgua(this.t, x + 1, y) ? -0.6 : 0.6), y, 5, 0.04);
        // Pontos de água para beber e pesqueiros ficam na margem (terra ao lado da água), onde se chega a pé.
        if (c === CHAO.agua && r > 0.88) {
          const m = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => !ehAgua(this.t, x + dx, y + dy));
          if (m) this.recurso(WOT.agua, x + m[0] * 0.6, y + m[1] * 0.6, 99, 99);
        }
      }
    }
    for (let k = 0; k < Math.round((w * h) / 260); k++) this.animal(false);
    for (let k = 0; k < Math.round((w * h) / 2600); k++) this.animal(true);
  }

  recurso(tipo: string, x: number, y: number, qtd: number, volta: number): Coisa {
    const c = new Coisa({ id: this.id(), name: tipo, type: tipo, position: { x: x + 0.5, y: y + 0.5 }, stats: { [S.quantidade]: qtd } });
    c.volta = volta;
    c.maximo = qtd;
    this.coisas.set(c.id, c);
    this.world.add(c);
    return c;
  }

  animal(bravo: boolean, x?: number, y?: number): Coisa | null {
    for (let tent = 0; tent < 30; tent++) {
      const px = x ?? 2 + this.sorte() * (this.t.w - 4);
      const py = y ?? 2 + this.sorte() * (this.t.h - 4);
      if (ehAgua(this.t, px, py)) continue;
      const c = new Coisa({
        id: this.id(),
        name: bravo ? 'lobo' : 'cervo',
        type: WOT.animal,
        position: { x: px, y: py },
        stats: { [S.perigo]: bravo ? 0.85 : 0.05, [S.quantidade]: 4 },
        tags: bravo ? [TAG.hostil] : [],
      });
      this.coisas.set(c.id, c);
      this.world.add(c);
      return c;
    }
    return null;
  }

  removerCoisa(c: AiEntity): void {
    this.coisas.delete(c.id);
    this.world.remove(c.id);
  }

  livre(x: number, y: number): boolean {
    if (ehAgua(this.t, x, y)) return false;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    for (const c of this.perto(x, y, 1.5)) {
      if ((c.type === WOT.casa || c.type === WOT.oficina || c.type === WOT.obra || c.type === WOT.roca) && Math.floor(c.position.x) === xi && Math.floor(c.position.y) === yi) return false;
    }
    return true;
  }

  // ---- Grade espacial (refeita a cada passo) ----

  private chave(x: number, y: number): number {
    return Math.floor(y / 8) * 1000 + Math.floor(x / 8);
  }
  private refazerGrade(): void {
    this.grade.clear();
    for (const e of this.world.entities()) {
      if (e.type === WOT.oferta || e.type === WOT.oficio || e.type === WOT.obraPublica || e.type === WOT.imposto || e.type === WOT.sitio || e.type === WOT.assentamento || e.type === WOT.evento) continue;
      const k = this.chave(e.position.x, e.position.y);
      const l = this.grade.get(k);
      if (l) l.push(e);
      else this.grade.set(k, [e]);
    }
  }
  /** Coisas a até `r` tiles. */
  perto(x: number, y: number, r: number): AiEntity[] {
    const out: AiEntity[] = [];
    const x0 = Math.floor((x - r) / 8);
    const x1 = Math.floor((x + r) / 8);
    const y0 = Math.floor((y - r) / 8);
    const y1 = Math.floor((y + r) / 8);
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        for (const e of this.grade.get(gy * 1000 + gx) ?? []) if (Math.hypot(e.position.x - x, e.position.y - y) <= r) out.push(e);
      }
    }
    return out;
  }

  // ---- Gente ----

  chegarAndarilho(pioneiro = false): Gente | null {
    for (let tent = 0; tent < 40; tent++) {
      const borda = this.sorte() * 4;
      const pos = pioneiro
        ? { x: 4 + this.sorte() * (this.t.w - 8), y: 4 + this.sorte() * (this.t.h - 8) }
        : borda < 1
          ? { x: 1.5, y: 2 + this.sorte() * (this.t.h - 4) }
          : borda < 2
            ? { x: this.t.w - 1.5, y: 2 + this.sorte() * (this.t.h - 4) }
            : borda < 3
              ? { x: 2 + this.sorte() * (this.t.w - 4), y: 1.5 }
              : { x: 2 + this.sorte() * (this.t.w - 4), y: this.t.h - 1.5 };
      if (ehAgua(this.t, pos.x, pos.y)) continue;
      const g = this.nascer(pos.x, pos.y, 18 + this.sorte() * 12, null, []);
      this.anotar(`${g.p.name} chegou à região, sem lugar para morar`, -1);
      return g;
    }
    return null;
  }

  nascer(x: number, y: number, idade: number, lugar: LugarVivo | null, pais: Gente[]): Gente {
    const id = this.id();
    const tracos: Record<string, number> = {};
    for (const t of TRAITS) {
      const herdado = pais.length ? pais.reduce((s, q) => s + q.p.traco(t), 0) / pais.length : 0;
      tracos[t] = Math.max(-1, Math.min(1, herdado * 0.6 + (this.sorte() + this.sorte() + this.sorte() - 1.5) * 0.7));
    }
    const nome = `${NOMES[Math.floor(this.sorte() * NOMES.length)]} ${id}`;
    const p = new Pessoa({ id, name: nome, position: { x, y }, tracos });
    const g: Gente = {
      p,
      brain: null as unknown as Brain,
      bolso: new Map(),
      casa: null,
      lugar: null,
      nasceu: this.agora - idade * ANO,
      limite: 58 + this.sorte() * 18,
      pais: pais.map((q) => q.p.id),
      conjuge: -1,
      oficioDesde: this.agora,
      rumo: null,
      tempo: 0,
      aperto: 0,
      diario: [],
      aux: null,
    };
    p.corpo = { agir: (acao, ctx, dt) => agir(this, g, acao, ctx, dt) };
    p.setStat(S.riqueza, pais.length ? 0 : 3);
    p.setStat('oficio', -1);
    for (const o of OFICIO_IDS) p.setStat(hab(o), 0.05 + this.sorte() * 0.25);
    p.tagSelf(idade >= ADULTO ? TAG.adulto : TAG.crianca);
    if (!lugar) p.tagSelf(TAG.semTeto);
    // Fome e sede começam baixas; tédio e solidão sorteados.
    p.setStat(S.fome, this.sorte() * 0.3);
    p.setStat(S.sede, this.sorte() * 0.3);
    p.setStat(S.tedio, this.sorte() * 0.4);
    p.setStat(S.solidao, this.sorte() * 0.4);
    p.setStat('ousadia', (p.traco('curiosity') + p.traco('ambition') - p.traco('attachment')) / 2);
    p.setStat('abertura', p.traco('curiosity') - p.traco('patience'));
    this.world.add(p);
    this.gente.set(id, g);
    if (lugar) this.morarEm(g, lugar);
    for (const q of pais) {
      q.p.mark(p, `${TAG.filho}:${q.p.id}`);
      p.perceive(q.p, 'MeuPai');
      p.lacos.set(q.p.id, 70);
      q.p.lacos.set(id, 80);
      const of = meuOficio(q.p);
      if (of) p.tagSelf(`Tradição:${of}`);
    }
    g.brain = criarCerebro(p, this.world, {
      thinkInterval: 1.5,
      thinkJitter: 0.4,
      idleThinkInterval: 0.3,
      selection: { mode: SelectionMode.WeightedRandomTop, withinFractionOfBest: 0.85 + 0.1 * p.traco('patience') },
      rng: this.rng,
      perceive: (_b, now) => this.perceber(g, now),
    });
    return g;
  }

  morarEm(g: Gente, l: LugarVivo): void {
    if (g.lugar && g.lugar !== l) g.lugar.ent.moradores.delete(g.p.id);
    g.lugar = l;
    l.ent.moradores.add(g.p.id);
    g.p.untagSelf(TAG.semTeto);
    g.p.tagSelf(TAG.assentado);
    g.p.tagSelf(TAG.morador);
    g.p.setStat('lugar', l.id);
    g.p.setStat('anosAqui', 0);
    // Andarilho que vira morador ganha os pacotes de quem mora num lugar (ofício, quadro, mudança, cidadania).
    if (g.brain) ajustarPacotes(g.brain);
  }

  morrer(g: Gente, causa: string): void {
    this.mortos.push({ nome: g.p.name, causa, t: this.agora });
    this.anotar(`${g.p.name} morreu ${causa}`, g.lugar?.id ?? -1);
    if (g.lugar) {
      g.lugar.ent.moradores.delete(g.p.id);
      if (g.lugar.lider === g.p.id) {
        g.lugar.lider = -1;
        this.anotar(`${g.lugar.nome} ficou sem líder`, g.lugar.id);
      }
    }
    if (g.conjuge >= 0) {
      const c = this.gente.get(g.conjuge);
      if (c) {
        c.conjuge = -1;
        c.p.untagSelf(TAG.casado);
      }
    }
    // A casa fica para a família; sem ninguém nela, fica vazia.
    if (g.casa) {
      const herdeiro = [...this.gente.values()].find((q) => q !== g && q.casa === g.casa);
      g.casa.setStat('dono', herdeiro ? herdeiro.p.id : -1);
    }
    for (const o of [...this.ofertas.values()]) if (o.stat('cliente') === g.p.id || o.stat('fornecedor') === g.p.id) this.fecharOferta(o);
    g.p.tagSelf('Dead');
    this.gente.delete(g.p.id);
    this.world.remove(g.p.id);
    this.opcoesOficio.delete(g.p.id);
    this.lembra.delete(`${g.p.id}:${WOT.agua}`);
    this.lembra.delete(`${g.p.id}:${WOT.rocha}`);
  }

  anotar(texto: string, lugar: number): void {
    this.cronica.push({ t: this.agora, texto, lugar });
  }
  lembrar(g: Gente, texto: string): void {
    g.diario.push(`[${this.ano.toFixed(1)}] ${texto}`);
    if (g.diario.length > 30) g.diario.shift();
  }

  idade(g: Gente): number {
    return (this.agora - g.nasceu) / ANO;
  }
  noite(): boolean {
    return this.agora % DIA > DIA * 0.72;
  }

  // ---- Lugares ----

  fundarLugar(g: Gente): LugarVivo {
    const id = this.lugares.length;
    const ent = new Lugar({ id: this.id(), name: LUGARES[id % LUGARES.length] + (id >= LUGARES.length ? ` ${Math.floor(id / LUGARES.length) + 1}` : ''), position: { ...g.p.position } });
    const l: LugarVivo = {
      id,
      nome: ent.name,
      ent,
      x: g.p.position.x,
      y: g.p.position.y,
      fundadoEm: this.agora,
      fundador: g.p.id,
      casas: [],
      oficinas: [],
      publicas: new Set(),
      celeiro: new Map(),
      tesouro: 0,
      imposto: 'nenhum',
      lider: -1,
      eleicao: null,
      chamadoAte: -1,
      conflitos: 0,
      protestos: [],
      apoios: [],
      estradas: new Set(),
      rotulo: 'acampamento',
      opcoesObra: [],
      opcoesImposto: [],
      festa: null,
      abandonado: false,
    };
    ent.setStat('lugar', id);
    this.world.add(ent);
    for (const o of OBRAS_PUBLICAS) {
      const e = new AiEntity({ id: this.id(), name: o, type: WOT.obraPublica, position: { x: l.x, y: l.y }, tags: [CATEGORIA_OBRA[o]] });
      e.setStat('lugar', id);
      e.setStat('preco', OBRA[o].custo);
      l.opcoesObra.push(e);
    }
    const faixas = Object.keys(IMPOSTOS) as Imposto[];
    faixas.forEach((k) => {
      const e = new AiEntity({ id: this.id(), name: k, type: WOT.imposto, position: { x: l.x, y: l.y } });
      e.setStat('lugar', id);
      l.opcoesImposto.push(e);
    });
    this.lugares.push(l);
    g.p.tagSelf(TAG.fundador);
    this.anotar(`${g.p.name} decidiu ficar perto de ${l.nome}: água, comida e material à mão`, id);
    return l;
  }

  lugarPerto(x: number, y: number, r: number): LugarVivo | null {
    let best: LugarVivo | null = null;
    let bd = r;
    for (const l of this.lugares) {
      if (l.abandonado) continue;
      const d = Math.hypot(l.x - x, l.y - y);
      if (d < bd) {
        bd = d;
        best = l;
      }
    }
    return best;
  }

  moradores(l: LugarVivo): Gente[] {
    const out: Gente[] = [];
    for (const id of l.ent.moradores) {
      const g = this.gente.get(id);
      if (g) out.push(g);
    }
    return out;
  }

  /** O que um sítio oferece (água, comida, madeira, pedra, clima), de 0 a 1 cada. */
  avaliarSitio(x: number, y: number): { agua: number; comida: number; madeira: number; pedra: number; clima: number; valor: number } {
    let agua = 0;
    let comida = 0;
    let madeira = 0;
    let pedra = 0;
    for (const e of this.perto(x, y, 9)) {
      const d = Math.hypot(e.position.x - x, e.position.y - y);
      const w = 1 - d / 10;
      if (e.type === WOT.agua) agua = Math.max(agua, w * 1.4);
      else if (e.type === WOT.arbusto || e.type === WOT.pesqueiro) comida += w * 0.25;
      else if (e.type === WOT.animal && e.stat(S.perigo) < 0.5) comida += w * 0.15;
      else if (e.type === WOT.arvore) madeira += w * 0.12;
      else if (e.type === WOT.rocha) pedra += w * 0.2;
    }
    // Terra boa também é comida (dá para plantar).
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    let fertil = 0;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (this.t.chao[(yi + dy) * this.t.w + xi + dx] === CHAO.fertil) fertil++;
    comida += fertil / 40;
    const cl = this.t.clima[Math.max(0, Math.min(this.t.h - 1, yi)) * this.t.w + Math.max(0, Math.min(this.t.w - 1, xi))] ?? 0.5;
    const c = (v: number) => Math.max(0, Math.min(1, v));
    const r = { agua: c(agua), comida: c(comida), madeira: c(madeira), pedra: c(pedra), clima: c(cl) };
    return { ...r, valor: c(r.agua * 0.35 + r.comida * 0.3 + r.madeira * 0.2 + r.pedra * 0.1 + r.clima * 0.05) };
  }

  atualizarSitios(): void {
    for (const s of this.sitios) this.world.remove(s.id);
    this.sitios.length = 0;
    this.refazerGrade();
    const cands: { x: number; y: number; v: number }[] = [];
    for (let y = 6; y < this.t.h - 6; y += 7) {
      for (let x = 6; x < this.t.w - 6; x += 7) {
        if (ehAgua(this.t, x, y)) continue;
        if (this.lugarPerto(x, y, 14)) continue;
        cands.push({ x: x + 0.5, y: y + 0.5, v: this.avaliarSitio(x + 0.5, y + 0.5).valor });
      }
    }
    cands.sort((a, b) => b.v - a.v);
    for (const s of cands.slice(0, 10)) {
      const e = new AiEntity({ id: this.id(), name: 'sítio', type: WOT.sitio, position: { x: s.x, y: s.y }, stats: { [S.valor]: s.v } });
      this.sitios.push(e);
      this.world.add(e);
    }
  }

  // ---- Percepção: o que cada um enxerga e sente agora ----

  private perceber(g: Gente, now: number): AiEntity[] {
    const p = g.p;
    const out: AiEntity[] = [];
    const porTipo = new Map<string, { e: AiEntity; d: number }[]>();
    for (const e of this.perto(p.position.x, p.position.y, 22)) {
      if (e === p || e.tags.has('Dead')) continue;
      const d = distance(p.position, e.position);
      const l = porTipo.get(e.type) ?? [];
      l.push({ e, d });
      porTipo.set(e.type, l);
    }
    const limite: Record<string, number> = { pessoa: 10, arvore: 5, rocha: 4, arbusto: 4, pesqueiro: 3, agua: 3, animal: 5, roca: 6, casa: 4, oficina: 6, obra: 6 };
    for (const [tipo, l] of porTipo) {
      l.sort((a, b) => a.d - b.d);
      for (const x of l.slice(0, limite[tipo] ?? 4)) out.push(x.e);
    }
    // Lembra a última água e a última pedra que viu, para voltar a elas quando estão fora da vista.
    for (const tipo of [WOT.agua, WOT.rocha]) {
      const k = `${p.id}:${tipo}`;
      const visto = porTipo.get(tipo)?.[0]?.e;
      const lembrado = this.lembra.get(k);
      if (visto) this.lembra.set(k, visto);
      else if (lembrado && this.world.getEntity(lembrado.id) === lembrado) out.push(lembrado);
    }
    // O que se lembra mesmo longe: o próprio lugar e os outros perto, as obras e ofertas suas, os sítios.
    for (const l of this.lugares) if (!l.abandonado && Math.hypot(l.x - p.position.x, l.y - p.position.y) < 70) out.push(l.ent);
    if (p.tags.has(TAG.semTeto, now) || p.tags.has(TAG.morador, now)) out.push(...this.sitios);
    for (const o of this.ofertas.values()) if (o.stat('cliente') === p.id || o.stat('fornecedor') === p.id) out.push(o);
    for (const c of this.coisas.doTipo(WOT.obra)) if (c.stat('dono') === p.id && !out.includes(c)) out.push(c);
    if (g.lugar) {
      if (g.lugar.lider === p.id) out.push(...g.lugar.opcoesObra, ...g.lugar.opcoesImposto);
      if (g.lugar.festa) out.push(g.lugar.festa);
      for (const c of this.coisas.doTipo(WOT.obra)) if (c.tags.has('Pública') && c.stat('lugar') === g.lugar.id && !out.includes(c)) out.push(c);
      const lider = this.gente.get(g.lugar.lider);
      if (lider && !out.includes(lider.p)) out.push(lider.p);
      if (g.lugar.eleicao) for (const q of this.moradores(g.lugar)) if (q.p.tags.has(TAG.candidato) && !out.includes(q.p)) out.push(q.p);
    }
    if (p.tags.has(TAG.adulto, now)) out.push(...this.opcoesDeOficio(g));
    this.sentir(g, now);
    return out;
  }

  /** As opções de ofício desta pessoa, com o que ela percebe de cada uma. */
  private opcoesDeOficio(g: Gente): AiEntity[] {
    let ops = this.opcoesOficio.get(g.p.id);
    if (!ops) {
      ops = OFICIO_IDS.map((o) => new AiEntity({ id: this.id(), name: o, type: WOT.oficio, position: { ...g.p.position } }));
      this.opcoesOficio.set(g.p.id, ops);
    }
    const l = g.lugar;
    const pop = l ? l.ent.moradores.size : 1;
    const adultos = l ? this.moradores(l).filter((q) => q.p.tags.has(TAG.adulto)) : [g];
    for (const e of ops) {
      const o = e.name as Oficio;
      e.position = { ...g.p.position };
      const fazem = adultos.filter((q) => meuOficio(q.p) === o).length;
      e.setStat(S.falta, g.p.stat(falta(o)));
      e.setStat(S.ocupacao, adultos.length ? fazem / adultos.length : 0);
      e.setStat(S.comum, this.comum(o, l, pop));
      e.setStat('temOficina', OFICIOS[o].oficina ? 1 : 0);
      let costume = 0;
      if (meuOficio(g.p) === o) costume += 0.6 * (1 + g.p.traco('patience')) / 2;
      if (g.p.tags.has(`Tradição:${o}`)) costume += 0.35 * (1 + g.p.traco('familism') - g.p.traco('curiosity')) / 2;
      e.setStat('costume', costume);
    }
    return ops;
  }

  /** Quanto um ofício faz sentido no lugar como ele é (não é regra de nível: é o que a pessoa vê possível). */
  private comum(o: Oficio, l: LugarVivo | null, pop: number): number {
    const info = OFICIOS[o];
    if (info.primario) {
      // O que a natureza em volta oferece muda devagar: guarda por um tempo.
      const k = `${l?.id ?? -1}:${o}`;
      const c = this.cacheComum.get(k);
      if (c && this.agora - c.t < 6) return c.v;
      const v = this.comumPrimario(info.onde, l);
      this.cacheComum.set(k, { t: this.agora, v });
      return v;
    }
    if (o === 'construtor') return Math.min(1, pop / 8);
    if (o === 'sacerdote') return l?.publicas.has('templo') ? 1 : Math.min(0.5, pop / 40);
    if (o === 'comerciante') return Math.min(1, (l?.oficinas.length ?? 0) / 4);
    return Math.min(1, Math.max(0.05, (pop - 3) / 12));
  }

  private comumPrimario(tipo: string, l: LugarVivo | null): number {
    if (!l) return 1;
    if (tipo === WOT.roca) return this.t.chao[Math.floor(l.y) * this.t.w + Math.floor(l.x)] !== CHAO.pedra ? 1 : 0.1;
    return this.perto(l.x, l.y, 20).some((e) => e.type === tipo) ? 1 : 0.1;
  }

  /** Atualiza o que a pessoa sente e percebe (necessidades, onde está, o lugar). */
  private sentir(g: Gente, now: number): void {
    const p = g.p;
    p.setStat(S.noite, this.noite() ? 1 : 0);
    p.setStat(S.idade, this.idade(g));
    const s = this.avaliarSitio(p.position.x, p.position.y);
    p.setStat(S.aquiAgua, s.agua);
    p.setStat(S.aquiComida, s.comida);
    p.setStat(S.aquiMadeira, s.madeira);
    p.setStat(S.aquiPedra, s.pedra);
    p.setStat(S.aquiClima, s.clima);
    // Estoque: o bolso mais a casa.
    for (const b of BENS) p.setStat(inv(b), (g.bolso.get(b) ?? 0) + (g.casa?.estoque.get(b) ?? 0));
    let carga = 0;
    for (const v of g.bolso.values()) carga += v;
    p.setStat('carga', Math.min(1, carga / 10));
    p.setStat('temOficina', g.casa && this.coisas.has(g.casa.stat('oficina', -1)) ? 1 : 0);
    let minhaObra: Coisa | undefined;
    for (const c of this.coisas.doTipo(WOT.obra)) if (c.stat('dono') === p.id) minhaObra = c;
    p.setStat('obraPropria', minhaObra ? 1 : 0);
    p.setStat('familia', g.casa ? [...this.gente.values()].filter((q) => q.casa === g.casa).length : 1);
    p.setStat('vagasCasa', g.casa ? g.casa.stat('vagas', 4) : 0);
    if (g.casa) p.tagSelf(TAG.temCasa);
    else p.untagSelf(TAG.temCasa);
    const of = meuOficio(p);
    p.setStat(S.anosNoOficio, of ? (now - g.oficioDesde) / ANO : 0);
    p.setStat('agricultorOuSemOficio', !of || of === 'agricultor' ? 1 : 0);
    p.setStat('podePlantar', this.terraBoaPerto(g) ? 1 : 0);
    // O que precisa (0 a 1) de cada bem.
    const fam = Math.max(1, p.stat('familia', 1));
    const comida = p.stat(inv('comida'));
    p.setStat(precisa('comida'), Math.max(0, Math.min(1, 1 - comida / (fam * 4))));
    const pedeObra = minhaObra ? minhaObra.pede : { madeira: 0, pedra: 0 };
    const temObra = minhaObra ? { madeira: minhaObra.estoque.get('madeira') ?? 0, pedra: minhaObra.estoque.get('pedra') ?? 0 } : { madeira: 0, pedra: 0 };
    if (minhaObra) {
      // Quanto do material da própria obra já está à mão (na obra, no bolso ou em casa): 1 quando dá para bater nela.
      const pede = minhaObra.pede.madeira + minhaObra.pede.pedra;
      const tem = Math.min(minhaObra.pede.madeira, temObra.madeira + p.stat(inv('madeira'))) + Math.min(minhaObra.pede.pedra, temObra.pedra + p.stat(inv('pedra')));
      minhaObra.setStat('temMaterial', pede ? tem / pede : 1);
    }
    const devo = (b: Bem) => {
      let n = 0;
      for (const o of this.ofertas.values()) if (o.stat('fornecedor') === p.id && o.stat('aceita') && BENS[o.stat('bem')] === b) n += o.stat(S.quantidade);
      return n;
    };
    const insumo = (b: Bem) => (of && OFICIOS[of].consome === b && p.stat('temOficina') ? 3 : 0);
    // Quem tira madeira ou pedra de ofício também sente o que a obra pública do lugar pede (o tesouro paga).
    let publicaM = 0;
    let publicaP = 0;
    if (g.lugar && (of === 'lenhador' || of === 'pedreiro'))
      for (const o of this.coisas.doTipo(WOT.obra))
        if (o.tags.has('Pública') && o.stat('lugar') === g.lugar.id) {
          publicaM += o.stat('faltaMadeira');
          publicaP += o.stat('faltaPedra');
        }
    const madeiraQuer = Math.max(0, pedeObra.madeira - temObra.madeira) + devo('madeira') + insumo('madeira') + (p.stat(S.frio) > 0.4 ? 1 : 0) + (of === 'lenhador' ? Math.min(6, publicaM) : 0);
    const pedraQuer = Math.max(0, pedeObra.pedra - temObra.pedra) + devo('pedra') + insumo('pedra') + (of === 'pedreiro' ? Math.min(6, publicaP) : 0);
    p.setStat(precisa('madeira'), Math.max(0, Math.min(1, (madeiraQuer - p.stat(inv('madeira'))) / 4)));
    p.setStat(precisa('pedra'), Math.max(0, Math.min(1, (pedraQuer - p.stat(inv('pedra'))) / 3)));
    for (const b of BENS) {
      if (b === 'comida' || b === 'madeira' || b === 'pedra') continue;
      const quer = devo(b) + insumo(b) + (b === 'ferramentas' && of && OFICIOS[of].primario && (g.lugar?.ent.moradores.size ?? 0) >= 6 ? 1 : 0) + ((b === 'pao' || b === 'cerveja') && p.stat(S.riqueza) > 6 ? 1 : 0);
      p.setStat(precisa(b), Math.max(0, Math.min(1, (quer - p.stat(inv(b))) / 2)));
    }
    let sobra = 0;
    for (const b of BENS) {
      const reserva = b === 'comida' ? fam * 4 : b === 'madeira' ? madeiraQuer + 2 : b === 'pedra' ? pedraQuer + 1 : devo(b);
      sobra = Math.max(sobra, (p.stat(inv(b)) - reserva) / 8);
    }
    p.setStat('excedente', Math.max(0, Math.min(1, sobra)));
    if (p.stat('excedente') < 0.1) p.setStat('vende', 0);
    let abertas = 0;
    for (const o of this.ofertas.values()) if (o.stat('cliente') === p.id) abertas++;
    p.setStat('encomendasAbertas', abertas);
    p.setStat('preco', 2 + Math.max(0, p.traco('greed')) * 1.5);
    // O lugar, como a pessoa o percebe.
    const l = g.lugar;
    if (l) {
      for (const [k, v] of l.ent.stats) if (k.startsWith('loc.')) p.setStat(k, v);
      p.setStat('temCeleiro', l.publicas.has('celeiro') ? 1 : 0);
      let amigos = 0;
      for (const id of l.ent.moradores) if (id !== p.id && p.laco(id) >= 40) amigos++;
      p.setStat('amigosAqui', amigos);
      let rocas = 0;
      for (const c of this.coisas.doTipo(WOT.roca)) if (c.stat('lugar') === l.id) rocas++;
      p.setStat('rocasPorCasa', rocas / Math.max(1, l.casas.length));
      if (l.lider >= 0 && l.lider !== p.id) {
        const imp = IMPOSTOS[l.imposto];
        const bem = 1 - l.ent.stat(S.locFaltaComida) * 0.6 - l.ent.stat(S.locFaltaCasa) * 0.3;
        const obras = Math.min(0.3, l.publicas.size * 0.06);
        const laco = p.laco(l.lider) / 300;
        p.setStat(S.aprovacao, Math.max(0, Math.min(1, 0.35 + bem * 0.4 + obras + laco - imp * 1.6 + p.traco('loyalty') * 0.1)));
      }
    } else {
      p.setStat(S.locPop, 0);
      p.setStat(S.locSemLider, 0);
      p.setStat(S.locEleicao, 0);
    }
  }

  private terraBoaPerto(g: Gente): boolean {
    const base = g.casa?.position ?? g.p.position;
    const xi = Math.floor(base.x);
    const yi = Math.floor(base.y);
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) if (this.t.chao[(yi + dy) * this.t.w + xi + dx] === CHAO.fertil) return true;
    return false;
  }

  /** A necessidade coletiva de cada lugar: o que os moradores sentem faltar, pelo que veem lá. */
  private lerLugares(): void {
    for (const l of this.lugares) {
      if (l.abandonado) continue;
      const mor = this.moradores(l);
      if (!mor.length) {
        l.abandonado = true;
        this.anotar(`${l.nome} ficou vazio`, l.id);
        continue;
      }
      const e = l.ent;
      const pop = mor.length;
      const adultos = mor.filter((q) => q.p.tags.has(TAG.adulto));
      let comida = l.celeiro.get('comida') ?? 0;
      let semCasa = 0;
      let ferramentas = 0;
      let fe = 0;
      for (const q of mor) {
        comida += (q.bolso.get('comida') ?? 0) + (q.casa ? 0 : 0);
        ferramentas += q.bolso.get('ferramentas') ?? 0;
        if (!q.casa && q.p.tags.has(TAG.adulto)) semCasa++;
        fe += q.p.stat(S.fe);
      }
      for (const c of l.casas) {
        comida += c.estoque.get('comida') ?? 0;
        ferramentas += c.estoque.get('ferramentas') ?? 0;
      }
      const obras = [...this.coisas.doTipo(WOT.obra)].filter((c) => c.stat('lugar') === l.id);
      let madeiraPede = 0;
      let pedraPede = 0;
      for (const o of obras) {
        if (o.tags.has('Pública')) {
          // Obra pública: conta o que já está nela e o que o celeiro tem para mandar.
          const pede = o.pede.madeira + o.pede.pedra;
          const m = Math.min(o.pede.madeira, (o.estoque.get('madeira') ?? 0) + (l.celeiro.get('madeira') ?? 0));
          const pe = Math.min(o.pede.pedra, (o.estoque.get('pedra') ?? 0) + (l.celeiro.get('pedra') ?? 0));
          o.setStat('temMaterial', pede ? (m + pe) / pede : 1);
          o.setStat('faltaMadeira', Math.max(0, o.pede.madeira - (o.estoque.get('madeira') ?? 0)));
          o.setStat('faltaPedra', Math.max(0, o.pede.pedra - (o.estoque.get('pedra') ?? 0)));
          o.setStat('preco', 1);
        }
        madeiraPede += Math.max(0, o.pede.madeira - (o.estoque.get('madeira') ?? 0));
        pedraPede += Math.max(0, o.pede.pedra - (o.estoque.get('pedra') ?? 0));
      }
      const faltaComida = Math.max(0, Math.min(1, 1 - comida / (pop * 3)));
      const faltaMadeira = Math.max(0, Math.min(1, madeiraPede / 8 + semCasa * 0.2));
      const faltaPedra = Math.max(0, Math.min(1, pedraPede / 6));
      const faltaFerr = pop >= 6 ? Math.max(0, Math.min(1, 1 - ferramentas / (adultos.length / 2 || 1))) : 0;
      const faltaCasa = Math.max(0, Math.min(1, semCasa / Math.max(1, adultos.length)));
      e.setStat(S.locPop, pop);
      e.setStat(S.locCasas, l.casas.length);
      e.setStat(S.locFaltaComida, faltaComida);
      e.setStat(S.locFaltaMadeira, faltaMadeira);
      e.setStat(S.locFaltaPedra, faltaPedra);
      e.setStat(S.locFaltaFerramentas, faltaFerr);
      e.setStat(S.locFaltaCasa, faltaCasa);
      e.setStat(S.locSemLider, l.lider < 0 ? 1 : 0);
      e.setStat(S.locEleicao, l.eleicao ? 1 : 0);
      l.conflitos *= 0.97;
      e.setStat(S.locConflitos, Math.max(0, Math.min(1, l.conflitos / Math.max(3, pop) + faltaComida * 0.5 + faltaCasa * 0.3 + (pop >= 8 ? 0.25 : 0))));
      let ameaca = 0;
      for (const x of this.perto(l.x, l.y, 12)) if (x.tags.has(TAG.hostil)) ameaca += 0.3;
      e.setStat(S.locAmeaca, Math.min(1, ameaca));
      e.setStat(S.locTesouro, l.tesouro);
      e.setStat(S.locImposto, IMPOSTOS[l.imposto]);
      e.setStat(S.locBemEstar, Math.max(0, 1 - faltaComida * 0.6 - faltaCasa * 0.4));
      const inst = (l.lider >= 0 ? 1 : 0) + l.publicas.size * 0.3;
      e.setStat(S.locPressao, (pop / 30) ** 2 / (1 + inst));
      e.setStat(S.locChamado, l.chamadoAte > this.agora ? 1 : 0);
      e.setStat(S.locObraAberta, obras.some((o) => o.tags.has('Pública')) ? 1 : 0);
      e.setStat(S.valor, e.stat(S.locBemEstar) * 0.7 + 0.3);
      e.setStat(S.pressao, e.stat(S.locPressao));
      // Falta de cada ofício: a necessidade que ele atende menos quem já faz.
      const fazem = (o: Oficio) => adultos.filter((q) => meuOficio(q.p) === o).length / Math.max(1, adultos.length);
      const quer: Record<Oficio, number> = {
        coletor: faltaComida * 0.7,
        cacador: faltaComida * 0.6,
        pescador: faltaComida * 0.7,
        agricultor: faltaComida * (pop >= 4 ? 0.9 : 0.4),
        lenhador: faltaMadeira,
        pedreiro: faltaPedra,
        construtor: Math.min(1, obras.length / 3),
        pastor: pop >= 10 ? 0.3 : 0,
        padeiro: pop >= 8 ? 0.5 - faltaComida * 0.3 : 0,
        taberneiro: pop >= 9 && !l.oficinas.some((o) => o.tags.has(TAG.taberna)) ? 0.55 : 0.05,
        marceneiro: pop >= 10 ? 0.4 : 0,
        ferreiro: faltaFerr,
        tecelao: pop >= 15 ? 0.3 : 0,
        oleiro: pop >= 15 ? 0.3 : 0,
        comerciante: l.oficinas.length >= 3 ? 0.4 : 0,
        sacerdote: Math.min(1, fe / Math.max(1, pop)) * (pop >= 10 ? 1 : 0.2),
      };
      for (const o of OFICIO_IDS) e.setStat(falta(o), Math.max(0, Math.min(1, quer[o] * 1.4 - fazem(o))));
      // Obras públicas: quanto o lugar sente cada uma faltar.
      const desligadas = l.casas.filter((c) => !l.estradas.has(this.tile(c.position.x, c.position.y))).length;
      const precisaObra: Record<ObraPublica, number> = {
        estrada: l.publicas.has('praca') || l.casas.length >= 6 ? Math.min(1, desligadas / Math.max(3, l.casas.length)) : 0,
        praca: !l.publicas.has('praca') ? Math.min(1, pop / 10) : 0,
        prefeitura: !l.publicas.has('prefeitura') && l.lider >= 0 ? Math.min(1, pop / 16) : 0,
        poco: !l.publicas.has('poco') ? 1 - this.avaliarSitio(l.x, l.y).agua : 0,
        celeiro: !l.publicas.has('celeiro') ? Math.min(1, pop / 8) * (0.5 + faltaComida) : 0,
        mercado: !l.publicas.has('mercado') ? Math.min(1, l.oficinas.length / 4) : 0,
        templo: !l.publicas.has('templo') ? Math.min(1, (fe / pop) * 1.6) * Math.min(1, pop / 10) : 0,
        muralha: !l.publicas.has('muralha') ? e.stat(S.locAmeaca) * Math.min(1, pop / 12) : 0,
        quartel: !l.publicas.has('quartel') ? e.stat(S.locAmeaca) * Math.min(1, pop / 18) : 0,
      };
      // A obra do mesmo tipo já aberta não se manda fazer de novo.
      for (const o of obras) if (o.tags.has('Pública')) precisaObra[o.vira.split(':')[0] as ObraPublica] = 0;
      for (const op of l.opcoesObra) {
        const k = op.name as ObraPublica;
        op.setStat(S.valor, precisaObra[k]);
        e.setStat(necessidadeObra(k), precisaObra[k]);
      }
      const faixas = Object.keys(IMPOSTOS) as Imposto[];
      const atual = faixas.indexOf(l.imposto);
      l.opcoesImposto.forEach((op, k) => {
        op.setStat('acima', k > atual ? 1 : 0);
        op.setStat('abaixo', k < atual ? 1 : 0);
        op.setStat('vizinho', Math.abs(k - atual) === 1 ? 1 : 0);
      });
      // Popularidade: o quanto os outros moradores gostam de cada um.
      for (const q of mor) {
        let soma = 0;
        for (const r of mor) if (r !== q) soma += r.p.laco(q.p.id);
        q.p.setStat(S.popularidade, Math.max(0, Math.min(1, soma / Math.max(1, mor.length - 1) / 60 + 0.1)));
      }
      // Aprovação do líder e protestos.
      const lider = this.gente.get(l.lider);
      if (lider) {
        const ap = mor.filter((q) => q !== lider).map((q) => q.p.stat(S.aprovacao, 0.6));
        lider.p.setStat(S.aprovacao, ap.length ? ap.reduce((a, b) => a + b, 0) / ap.length : 0.7);
        l.protestos = l.protestos.filter((t) => this.agora - t < ANO * 2);
        if (l.protestos.length >= Math.max(2, adultos.length * 0.4)) this.deporLider(l, 'o povo protestou até ele cair');
      }
      // Eleição: fecha e conta os votos.
      if (l.eleicao && this.agora >= l.eleicao.ate) this.apurar(l);
      if (l.festa && this.agora > l.festa.stat('ate')) {
        this.world.remove(l.festa.id);
        l.festa = null;
      }
      this.nomear(l);
    }
  }

  tile(x: number, y: number): number {
    return Math.floor(y) * this.t.w + Math.floor(x);
  }

  /** O nome que se dá ao que já está lá (não é um nível a subir). */
  private nomear(l: LugarVivo): void {
    const casas = l.casas.length;
    const rot =
      casas >= 30 && l.lider >= 0 && l.publicas.size >= 4
        ? 'cidade'
        : casas >= 12 && l.lider >= 0
          ? 'vila'
          : casas >= 5 && l.oficinas.length >= 1
            ? 'aldeia'
            : casas >= 2
              ? 'lugarejo'
              : casas === 1
                ? 'casa isolada'
                : 'acampamento';
    if (rot !== l.rotulo) {
      l.rotulo = rot;
      this.anotar(`Já se pode chamar ${l.nome} de ${rot}`, l.id);
    }
  }

  abrirEleicao(l: LugarVivo, por: Gente): void {
    if (l.eleicao) return;
    l.eleicao = { ate: this.agora + DIA * 3, votos: new Map() };
    for (const q of this.moradores(l)) {
      q.p.untagSelf(TAG.votou);
      q.p.untagSelf(TAG.candidato);
    }
    this.anotar(`${por.p.name} chamou ${l.nome} para escolher um líder`, l.id);
  }

  private apurar(l: LugarVivo): void {
    const votos = l.eleicao!.votos;
    l.eleicao = null;
    const mor = this.moradores(l);
    let best: Gente | null = null;
    let bv = -1;
    for (const q of mor) {
      if (!q.p.tags.has(TAG.candidato)) continue;
      const v = votos.get(q.p.id) ?? 0;
      if (v > bv || (v === bv && best && q.p.stat(S.popularidade) > best.p.stat(S.popularidade))) {
        bv = v;
        best = q;
      }
    }
    for (const q of mor) {
      q.p.untagSelf(TAG.candidato);
      q.p.untagSelf(TAG.votou);
    }
    if (!best) {
      this.anotar(`Ninguém se candidatou em ${l.nome}`, l.id);
      return;
    }
    const velho = this.gente.get(l.lider);
    if (velho && velho !== best) {
      velho.p.untagSelf(TAG.lider);
      ajustarPacotes(velho.brain);
    }
    l.lider = best.p.id;
    l.protestos = [];
    best.p.tagSelf(TAG.lider);
    best.p.setStat(S.aprovacao, 0.7);
    ajustarPacotes(best.brain);
    this.lembrar(best, `Eleito líder de ${l.nome} com ${bv} votos`);
    this.anotar(`${best.p.name} foi eleito líder de ${l.nome} com ${bv} votos`, l.id);
  }

  deporLider(l: LugarVivo, porque: string): void {
    const g = this.gente.get(l.lider);
    if (g) {
      g.p.untagSelf(TAG.lider);
      ajustarPacotes(g.brain);
      this.lembrar(g, `Deixou de liderar ${l.nome}: ${porque}`);
    }
    l.lider = -1;
    l.protestos = [];
    this.anotar(`${g?.p.name ?? 'O líder'} deixou de liderar ${l.nome}: ${porque}`, l.id);
  }

  // ---- Ofertas (negócios e encomendas) ----

  abrirOferta(cliente: Gente, fornecedor: Pessoa, bem: Bem, qtd: number, preco: number): AiEntity {
    const o = new AiEntity({ id: this.id(), name: `${qtd} ${bem}`, type: WOT.oferta, position: { ...fornecedor.position } });
    o.setStat('cliente', cliente.p.id);
    o.setStat('fornecedor', fornecedor.id);
    o.setStat('bem', BENS.indexOf(bem));
    o.setStat(S.quantidade, qtd);
    o.setStat('preco', preco);
    o.setStat('proposta', 1);
    o.setStat('aceita', 0);
    o.setStat('desde', this.agora);
    o.setStat('atraso', 0);
    this.ofertas.set(o.id, o);
    this.world.add(o);
    return o;
  }

  fecharOferta(o: AiEntity): void {
    this.ofertas.delete(o.id);
    this.world.remove(o.id);
  }

  // ---- Passo ----

  passo(dt: number): void {
    this.world.time += dt;
    this.refazerGrade();
    // Recursos voltam; animais andam e se reproduzem um pouco.
    let animais = 0;
    for (const c of this.coisas.values()) {
      if (c.volta > 0 && c.type !== WOT.animal) {
        const q = c.stat(S.quantidade);
        if (q < c.maximo) c.setStat(S.quantidade, Math.min(c.maximo, q + c.volta * dt));
      }
      if (c.type === WOT.roca) {
        const g = c.stat('cresce') + dt / (ANO * 0.5);
        c.setStat('cresce', g);
        c.setStat(S.maduro, g >= 1 ? 1 : 0);
      }
      if (c.type === WOT.animal) {
        animais++;
        if (this.sorte() < dt * 0.2) {
          c.vx = (this.sorte() - 0.5) * 1.2;
          c.vy = (this.sorte() - 0.5) * 1.2;
        }
        const nx = c.position.x + c.vx * dt;
        const ny = c.position.y + c.vy * dt;
        if (!ehAgua(this.t, nx, ny)) c.position = { x: nx, y: ny };
        else {
          c.vx = -c.vx;
          c.vy = -c.vy;
        }
      }
    }
    if (animais < (this.t.w * this.t.h) / 260 && this.sorte() < dt * 0.05) this.animal(this.sorte() < 0.08);
    // Gente: necessidades, cérebro e corpo.
    for (const g of [...this.gente.values()]) {
      if (!this.gente.has(g.p.id)) continue;
      this.viver(g, dt);
      if (!this.gente.has(g.p.id)) continue;
      g.brain.update(dt);
    }
    this.relogioLento += dt;
    if (this.relogioLento >= 2) {
      this.relogioLento = 0;
      this.lerLugares();
      this.cobrarImpostos();
      for (const o of this.ofertas.values()) o.setStat('atraso', Math.min(1, (this.agora - o.stat('desde')) / (DIA * 4)));
    }
    this.relogioSitios += dt;
    if (this.relogioSitios >= ANO / 2) {
      this.relogioSitios = 0;
      this.atualizarSitios();
    }
    this.relogioChegada += dt;
    if (this.relogioChegada >= 1) {
      this.relogioChegada = 0;
      if (this.gente.size < this.opt.teto && this.sorte() < this.opt.chegadas / ANO) this.chegarAndarilho();
    }
  }

  private viver(g: Gente, dt: number): void {
    const p = g.p;
    const crianca = p.tags.has(TAG.crianca);
    const sobe = (k: string, v: number) => p.setStat(k, Math.max(0, Math.min(1, p.stat(k) + v)));
    sobe(S.fome, dt / (crianca ? 90 : 75));
    sobe(S.sede, dt / 55);
    sobe(S.cansaco, dt / 110);
    sobe(S.tedio, dt / 70);
    sobe(S.solidao, dt / (90 * (1.2 - p.traco('sociability') * 0.4)));
    sobe(S.fe, (dt / 220) * (1 + p.traco('faith')));
    const emCasa = g.casa && distance(p.position, g.casa.position) < 2;
    const frio = this.noite() && !emCasa && this.t.clima[this.tile(p.position.x, p.position.y)] < 0.6;
    sobe(S.frio, frio ? dt / 40 : -dt / 15);
    p.setStat('anosAqui', p.stat('anosAqui') + dt / ANO);
    if (p.stat(S.fome) >= 1 || p.stat(S.sede) >= 1) g.aperto += dt;
    else g.aperto = Math.max(0, g.aperto - dt);
    const idade = this.idade(g);
    if (g.aperto > 25) {
      this.morrer(g, p.stat(S.sede) >= 1 ? 'de sede' : 'de fome');
      return;
    }
    if (idade > g.limite) {
      this.morrer(g, 'de velhice');
      return;
    }
    // Fases da vida: o cérebro troca de pacotes em grupo.
    if (crianca && idade >= ADULTO) {
      p.untagSelf(TAG.crianca);
      p.tagSelf(TAG.adulto);
      this.lembrar(g, 'Virou adulto');
      ajustarPacotes(g.brain);
    } else if (!p.tags.has(TAG.idoso) && idade >= IDOSO) {
      p.tagSelf(TAG.idoso);
      ajustarPacotes(g.brain);
    }
  }

  private cobrarImpostos(): void {
    for (const l of this.lugares) {
      if (l.abandonado || l.lider < 0 || l.imposto === 'nenhum') continue;
      if (Math.floor(this.agora / ANO) === Math.floor((this.agora - 2) / ANO)) continue;
      // Virou o ano: cada adulto passa a dever a parte dele.
      for (const q of this.moradores(l)) if (q.p.tags.has(TAG.adulto) && q.p.id !== l.lider) q.p.setStat(S.impostoDevido, 1);
    }
  }

  // ---- Leitura para testes e para a tela ----

  resumo(): { ano: number; gente: number; lugares: { nome: string; rotulo: string; pop: number; casas: number; oficinas: string[]; publicas: string[]; lider: string; tesouro: number; imposto: string }[] } {
    return {
      ano: this.ano,
      gente: this.gente.size,
      lugares: this.lugares
        .filter((l) => !l.abandonado)
        .map((l) => ({
          nome: l.nome,
          rotulo: l.rotulo,
          pop: l.ent.moradores.size,
          casas: l.casas.length,
          oficinas: l.oficinas.map((o) => o.name),
          publicas: [...l.publicas],
          lider: this.gente.get(l.lider)?.p.name ?? '',
          tesouro: Math.round(l.tesouro),
          imposto: l.imposto,
        })),
    };
  }

  /** Quantas vezes cada comportamento foi escolhido (pelo histórico dos cérebros vivos). */
  pessoa(nome: string): Gente | undefined {
    return [...this.gente.values()].find((g) => g.p.name === nome);
  }
}

export { compatibilidade };
