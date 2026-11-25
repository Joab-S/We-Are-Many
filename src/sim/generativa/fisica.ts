/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): a física do modelo generativo. Diz o que existe (as tags
 * de cada coisa) e o que acontece de verdade quando um corpo faz um verbo numa coisa (`genEfeito`). Nenhum efeito
 * está num "comportamento": comer um arbusto tira a fome porque o arbusto tem o que comer; galhos juntos abrigam
 * porque cobrem alguém; pedra batida em pedra solta uma lasca. Combinações que ninguém previu funcionam do mesmo
 * jeito, porque a conta é sobre o que a coisa tem.
 *
 * Os únicos limiares daqui são físicos (tantos galhos cobrem uma pessoa). Nada aqui sabe o que é um grupo.
 */
import type { Ecosystem } from '../ecosystem';
import { temperatureAt, decorAt, isTree, tileHash, Decor, seasonStrength, type SurfaceMap } from '../../procgen/surface';
import { ecologyOf } from '../fauna';
import { isRockyBiome } from '../../procgen/biomes';
import { TRAIT, TRAIT_COUNT, inheritTraits } from '../../IAUS/npc/pessoa/traits';
import { bondWith, touch } from '../../IAUS/npc/pessoa/relations';
import { wrapDx } from '../settlement';
import { isLand, isWater } from '../eco/tiles';
import { elderAge } from '../eco/helpers';
import { contar, creditar, herdar, lembrarLugar, novaPessoa } from './crencas';
import { GEN, MATERIAIS, NI, TAG_DO_MATERIAL, type Coisa, type Material, type MundoGen, type PessoaGen, type Verbo } from './tipos';

/** O que a pessoa percebe: uma coisa com tags, num lugar. */
export interface Percepto {
  /** Estável de um pensamento ao outro (a chave do foco do IAUS). */
  id: number;
  tipo: 'aqui' | 'mao' | 'tile' | 'coisa' | 'pessoa' | 'animal' | 'carcaca' | 'lugar';
  x: number;
  y: number;
  dist: number;
  tags: Record<string, number>;
  /** As tags que contam, já ordenadas (guardado por quem pensa, para não refazer a cada verbo). */
  ts?: [string, number][];
  /** Tile, índice da criatura, id da coisa e índice da carcaça (-1 ou 0 quando não se aplica). */
  t: number;
  j: number;
  coisa: number;
  k: number;
}

/** O resultado físico de um ato. */
export interface Efeito {
  ok: boolean;
  /** A coisa (id negativo) ou a pessoa (uid) em que mexeu e que pode render depois; 0 = nenhuma. */
  ref: number;
  /** O que pôs ali (as tags do material), para o crédito de mais tarde. */
  pos: string[];
  /** Rendeu agora de uma coisa em que alguém mexeu antes (a mesma `ref`)? */
  rendeu: boolean;
}

const NADA: Efeito = { ok: false, ref: 0, pos: [], rendeu: false };
const feito = (ref = 0, pos: string[] = [], rendeu = false): Efeito => ({ ok: true, ref, pos, rendeu });

/** Índice dos montes por tile: derivado de `gen.coisas`, fora do save. */
const POR_TILE = new WeakMap<MundoGen, Map<number, Coisa>>();
function porTile(g: MundoGen): Map<number, Coisa> {
  let m = POR_TILE.get(g);
  if (!m) {
    m = new Map();
    for (const c of g.coisas) m.set(c.t, c);
    POR_TILE.set(g, m);
  }
  return m;
}

export const novoMundoGen = (): MundoGen => ({ versao: 1, pessoas: new Map(), coisas: [], proxCoisa: 1, proxHabito: 1, colhido: new Map(), tirado: new Map(), relogio: 0, conta: { nascidos: 0, mortos: 0, concepcoes: 0, abates: 0, abatesGrandes: 0, abatesJuntos: 0 } });

/** O sexo é um fato do corpo, tirado do uid (o motor não guarda um). */
export const fem = (uid: number): boolean => uid % 2 === 0;

const q = (c: Coisa, m: Material): number => c.m[m] ?? 0;

/** A força das estações no planeta (inclinação do eixo e luz recebida), guardada por mapa. */
const FORCA_DA_ESTACAO = new WeakMap<SurfaceMap, number>();
function forcaDaEstacao(map: SurfaceMap): number {
  let f = FORCA_DA_ESTACAO.get(map);
  if (f === undefined) FORCA_DA_ESTACAO.set(map, (f = Math.max(0, Math.min(1.5, seasonStrength(map.params)))));
  return f;
}

/** O quanto o que se tem na mão soma ao golpe (a lasca já entra na força do corpo). */
const ARMA: Partial<Record<Material, number>> = { pedra: 1.2, lasca: 1.3 };

export const genFisicaPart = {
  /** A parte generativa da pessoa `i`, criada (só com o instinto) na primeira vez. */
  genDe(this: Ecosystem, i: number): PessoaGen {
    const g = this.gen!;
    let p = g.pessoas.get(this.uid[i]);
    if (!p) g.pessoas.set(this.uid[i], (p = novaPessoa(this.year)));
    return p;
  },

  /** Quanto há para comer no tile agora (0 a 1): o verde menos o que foi colhido e ainda não rebrotou. */
  genComivel(this: Ecosystem, t: number): number {
    const veg = this.map.vegetation[t];
    if (veg <= 0.1 || !isLand(this.map, t)) return 0;
    const c = this.gen!.colhido.get(t);
    let falta = 0;
    if (c) {
      falta = c[0] - (this.year - c[1]) / GEN.rebrota;
      if (falta <= 0) {
        this.gen!.colhido.delete(t);
        falta = 0;
      }
    }
    const fruta = isTree(decorAt(this.map, t)) ? 0.2 : 0;
    return Math.max(0, Math.min(1, Math.min(1, veg * 1.1 + fruta) * (1 - Math.min(1, falta)) * (1 + 2 * GEN.invernoComida * this.genVerao(t))));
  },

  /**
   * O quanto é inverno no tile agora (0 a 1): a fase do ciclo de estações da pessoa (`GEN.estacao`, separado do
   * ano do mundo) vezes a força da estação ali, que cresce com a latitude e com a inclinação do planeta. O sul
   * tem o inverno na metade oposta do ciclo. No trópico a estação quase não se sente.
   */
  genInverno(this: Ecosystem, t: number): number {
    return this.genAmplitude(t) / 2 - this.genVerao(t);
  },

  /**
   * O desvio da estação no tile (de −amp/2 no fundo do inverno a +amp/2 no auge do verão). A média do ciclo é
   * zero: o verão dá a mais o que o inverno tira, então o mato do ano não muda, só a época dele.
   */
  genVerao(this: Ecosystem, t: number): number {
    const amp = this.genAmplitude(t);
    if (amp <= 0) return 0;
    const map = this.map;
    const fase = (this.year * this.yearSpan) / GEN.estacao + (Math.floor(t / map.width) >= map.height / 2 ? 0.5 : 0);
    return (amp * Math.cos(2 * Math.PI * fase)) / 2;
  },

  /** A força da estação no tile (0 a 1): cresce com a latitude e com a inclinação do planeta. */
  genAmplitude(this: Ecosystem, t: number): number {
    const map = this.map;
    const lat = Math.abs((2 * (Math.floor(t / map.width) + 0.5)) / map.height - 1);
    return Math.min(1, (0.1 + 0.9 * lat) * forcaDaEstacao(map));
  },

  /** Tira do tile uma fração do que ele dá (o mato colhido demora a rebrotar). */
  genColher(this: Ecosystem, t: number, quanto: number): void {
    const c = this.gen!.colhido.get(t);
    const falta = c ? Math.max(0, c[0] - (this.year - c[1]) / GEN.rebrota) : 0;
    this.gen!.colhido.set(t, [Math.min(1, falta + quanto), this.year]);
  },

  /** O que o tile oferece. */
  genTagsDoTile(this: Ecosystem, t: number): Record<string, number> {
    const map = this.map;
    const out: Record<string, number> = {};
    const com = this.genComivel(t);
    if (com > 0.05) out.comivel = com;
    const d = decorAt(map, t);
    if (isTree(d) && !this.built[t]) {
      out.madeira = 1;
      out.galho = 0.8;
      out.sombra = 0.7;
      if (this.genTroncoCaido(t)) out.tronco = 1;
    }
    if (d === Decor.Boulder) out.pedra = 1;
    else if (isRockyBiome(map.biome[t])) out.pedra = 0.5;
    if (this.nearWater(t)) {
      out.agua = 1;
      out.peixe = 0.3;
    }
    const alto = (map.elevation[t] - 0.3) / 0.4;
    if (alto > 0.1) out.alto = Math.min(1, alto);
    return out;
  },

  genCoisaEm(this: Ecosystem, t: number): Coisa | undefined {
    return porTile(this.gen!).get(t);
  },

  genCoisa(this: Ecosystem, id: number): Coisa | undefined {
    for (const c of this.gen!.coisas) if (c.id === id) return c;
    return undefined;
  },

  /** O monte do tile, criado se ainda não há um. */
  genMonte(this: Ecosystem, t: number, de: number): Coisa {
    const g = this.gen!;
    const idx = porTile(g);
    let c = idx.get(t);
    if (!c) {
      const w = this.map.width;
      c = { id: g.proxCoisa++, t, x: (t % w) + 0.5, y: Math.floor(t / w) + 0.5, m: {}, fogo: 0, broto: 0, planta: 0, de, em: this.year };
      g.coisas.push(c);
      idx.set(t, c);
    }
    return c;
  },

  /** O quanto um monte cobre alguém (0 a 1): galhos, pedras e troncos bastantes abrigam. O limite é do corpo, não do grupo. */
  genAbrigo(this: Ecosystem, c: Coisa): number {
    return Math.min(1, (q(c, 'galho') + 2 * q(c, 'pedra') + 3 * q(c, 'tronco')) / GEN.abrigo);
  },

  /** O que um monte oferece, saído do que ele tem. `uid` é quem olha (para "é meu" e "é de outro"). */
  genTagsDaCoisa(this: Ecosystem, c: Coisa, uid: number): Record<string, number> {
    const out: Record<string, number> = { monte: 1 };
    for (const m of MATERIAIS) {
      const n = q(c, m);
      if (n > 0) out[TAG_DO_MATERIAL[m]] = Math.min(1, n / 3);
    }
    if (q(c, 'carne') > 0) out.comivel = Math.max(out.comivel ?? 0, Math.min(1, q(c, 'carne') / 3) * 0.7);
    if (q(c, 'comida') + q(c, 'carne') > 0) out.guardado = Math.min(1, (q(c, 'comida') + q(c, 'carne')) / 4);
    const ab = this.genAbrigo(c);
    if (ab >= 0.25) out.abrigo = ab;
    if (c.fogo > 0) {
      out.fogo = 1;
      out.quente = 1;
      out.luz = 1;
    }
    if (c.broto > 0) out.broto = Math.min(1, c.broto);
    if (c.planta >= 1) {
      out.planta = Math.min(1, c.planta / 3);
      out.comivel = Math.max(out.comivel ?? 0, Math.min(1, c.planta / 3));
    }
    if (c.de === uid) out.meu = 1;
    else if (c.de) out.deOutro = 1;
    return out;
  },

  /** A força do corpo numa disputa: idade, traço, ferida e o que tem na mão. */
  genForca(this: Ecosystem, i: number): number {
    const sp = this.species[this.kind[i]];
    const p = this.gen!.pessoas.get(this.uid[i]);
    const adulto = this.age[i] >= sp.maturity ? 1 : 0.2 + (0.6 * this.age[i]) / sp.maturity;
    const velho = this.age[i] >= elderAge(sp, 0) ? 0.7 : 1;
    return adulto * velho * (1 + 0.03 * this.traits[i * TRAIT_COUNT + TRAIT.strength]) * (1 - 0.5 * (p?.ferida ?? 0)) * (p?.mao?.que === 'lasca' ? 1.4 : 1);
  },

  /**
   * Um golpe de `i` no bicho `j`: a força de quem bate, mais a de quem bate no mesmo bicho junto (e um pouco a de
   * quem só está ali, cercando), contra o corpo dele, que resiste pela massa. Um coelho cai com qualquer golpe que
   * acerta; um bisão quase não cai de um só, e um mamute pede muita gente. Nada aqui sabe o que é uma caçada.
   */
  genGolpe(this: Ecosystem, i: number, j: number, bravo: boolean): { chance: number; juntos: number; perto: number; massa: number } {
    const g = this.gen!;
    const arma = (k: number) => ARMA[g.pessoas.get(this.uid[k])?.mao?.que as Material] ?? 1;
    let forca = this.genForca(i) * arma(i);
    let juntos = 0;
    let perto = 0;
    const alvo = this.uid[j];
    this.forEachNear(this.x[j], this.y[j], 3, (k) => {
      if (k === i || this.species[this.kind[k]].kind !== 'sapient' || !g.pessoas.has(this.uid[k])) return;
      const op = this.genMenteDe(k)?.ato?.op;
      if (op?.v === 'bater' && op.a.id === alvo) {
        juntos++;
        forca += this.genForca(k) * arma(k);
      } else if (this.age[k] >= this.species[this.kind[k]].maturity) {
        perto++;
        forca += 0.25 * this.genForca(k);
      }
    });
    const massa = ecologyOf(this.species[this.kind[j]]).mass;
    const resiste = Math.pow(Math.max(0.5, massa) / GEN.massaRef, GEN.resiste) * (bravo ? 2 : 1);
    return { chance: 1 - Math.exp((-GEN.golpe * forca) / resiste), juntos, perto, massa };
  },

  /** O que se vê num bicho de pasto: carne (mais quanto maior), o tamanho, se é dos que fogem e se já há gente batendo nele. */
  genTagsDoBicho(this: Ecosystem, j: number): Record<string, number> {
    const e = ecologyOf(this.species[this.kind[j]]);
    const out: Record<string, number> = { animal: 1, carne: Math.min(1, 0.4 + 0.2 * Math.log10(Math.max(1, e.mass))) };
    const grande = Math.log10(e.mass / GEN.massaRef) / 1.5;
    if (grande > 0.05) out.grande = Math.min(1, grande);
    if (e.fear >= 0.5) out.fugidio = e.fear;
    // Gente batendo nele agora: um fato que se vê de longe (é o que deixa alguém notar que dá para ir junto).
    let batendo = 0;
    const alvo = this.uid[j];
    this.forEachNear(this.x[j], this.y[j], 3, (k) => {
      if (this.species[this.kind[k]].kind !== 'sapient') return;
      const op = this.genMenteDe(k)?.ato?.op;
      if (op?.v === 'bater' && op.a.id === alvo) batendo++;
    });
    if (batendo) out.acuado = Math.min(1, batendo / 3);
    return out;
  },

  /** O que `i` vê em outra pessoa `j`: fatos, nunca papéis. */
  genTagsDaPessoa(this: Ecosystem, i: number, j: number): Record<string, number> {
    const sp = this.species[this.kind[j]];
    const eu = this.uid[i];
    const ele = this.uid[j];
    const pj = this.gen!.pessoas.get(ele);
    const out: Record<string, number> = { gente: 1 };
    const adulto = this.age[j] >= sp.maturity;
    const meuFilho = this.parent[j] === eu;
    const parente = meuFilho || this.parent[i] === ele || (this.parent[i] !== 0 && this.parent[i] === this.parent[j]) || (this.family[i] === this.family[j] && this.family[i] > 0);
    if (parente) out.parente = 1;
    if (meuFilho && !adulto) out.filho = 1;
    if (this.age[j] < GEN.anda) out.bebe = 1;
    else if (!adulto) out.crianca = 1;
    const laco = bondWith(this.bonds, eu, ele);
    if (!laco && !parente) out.estranho = 1;
    else if ((laco?.value ?? 0) > 15) out.amigo = Math.min(1, laco!.value / 60);
    else if ((laco?.value ?? 0) < -15) {
      out.desafeto = Math.min(1, -laco!.value / 60);
      // Quem já me feriu é perigoso para mim (um fato da minha memória, não um papel dele).
      if (laco!.value <= -25) out.perigoso = out.desafeto * 0.6;
    }
    const fertil = (k: number) => this.age[k] >= this.species[this.kind[k]].maturity && this.age[k] < elderAge(this.species[this.kind[k]], 0);
    // Par possível: adultos férteis de sexos diferentes que não são pai, mãe, filho nem irmãos (os primos podem).
    const proximo = meuFilho || this.parent[i] === ele || (this.parent[i] !== 0 && this.parent[i] === this.parent[j]);
    if (!proximo && fertil(i) && fertil(j) && fem(eu) !== fem(ele) && !pj?.gravida && !this.gen!.pessoas.get(eu)?.gravida) out.parceiro = 1;
    if (pj?.mao) {
      const m = pj.mao.que;
      if (m === 'comida' || m === 'carne') out.carregaComida = 1;
      if (m === 'lasca') out.armado = 1;
    }
    const f = this.genForca(j) / Math.max(0.2, this.genForca(i));
    if (f > 1.2) out.forte = Math.min(1, f - 0.7);
    else if (f < 0.75) out.fraco = Math.min(1, 1.4 - f);
    if ((pj?.ferida ?? 0) > 0.2) out.ferido = pj!.ferida;
    if (this.energy[j] < 0.4) out.comFome = Math.min(1, (0.45 - this.energy[j]) / 0.3);
    if ((pj?.seguidores ?? 0) >= 2) out.seguido = Math.min(1, pj!.seguidores / 5);
    if (pj?.dorme) out.dormindo = 1;
    return out;
  },

  /**
   * A física das coisas, uma vez por segundo de simulação: o fogo gasta os galhos, a semente na terra vira planta, a
   * comida guardada estraga (e um resto dela brota), o monte vazio some. Quem dorme perto de bicho bravo, sem
   * fogo e sem gente, pode ser mordido.
   */
  genFisica(this: Ecosystem, dt: number): void {
    const g = this.gen!;
    g.relogio += dt;
    if (g.relogio < 1) return;
    const s = g.relogio;
    g.relogio = 0;
    const anos = s / this.yearSpan;
    const idx = porTile(g);
    for (let k = g.coisas.length - 1; k >= 0; k--) {
      const c = g.coisas[k];
      if (c.fogo > 0) c.fogo = Math.max(0, c.fogo - s);
      const fertil = this.map.vegetation[c.t] > 0.2 && isLand(this.map, c.t);
      // No frio do inverno a comida guardada dura mais e a semente espera a terra esquentar.
      const inverno = this.genInverno(c.t);
      for (const m of ['comida', 'carne'] as const) {
        const n = q(c, m);
        if (n <= 0) continue;
        const perde = Math.min(n, (n * GEN.estraga * (m === 'carne' ? 3 : 1) * anos + 0.002 * s) * (1 - GEN.invernoEstraga * inverno));
        c.m[m] = n - perde;
        // A fruta que apodrece na terra boa deixa semente (pouca): quem volta ali acha planta.
        if (m === 'comida' && fertil) c.m.semente = q(c, 'semente') + perde * 0.15;
        if ((c.m[m] ?? 0) < 0.05) delete c.m[m];
      }
      // Galho apodrece devagar: o abrigo que ninguém mantém vai sumindo (pedra e tronco ficam, como ruína).
      if (c.fogo <= 0 && q(c, 'galho') > 0) {
        c.m.galho = q(c, 'galho') * (1 - GEN.galhoApodrece * anos);
        if (c.m.galho < 0.05) delete c.m.galho;
      }
      const sem = q(c, 'semente');
      if (sem >= 0.5 && fertil) {
        c.broto += (anos / GEN.brotar) * (1 - inverno);
        if (c.broto >= 1) {
          c.planta += sem * GEN.colheita;
          delete c.m.semente;
          c.broto = 0;
        }
      } else if (c.broto > 0) c.broto = 0;
      // A planta que ninguém colhe se ressemeia devagar e não passa de um canteiro.
      if (c.planta > 12) c.planta = 12;
      let tem = c.fogo > 0 || c.planta >= 0.5 || c.broto > 0;
      for (const m of MATERIAIS) if (q(c, m) > 0.05) tem = true;
      if (!tem) {
        g.coisas.splice(k, 1);
        idx.delete(c.t);
      }
    }
    // Quantos seguem cada um agora: um fato que se vê (refeito do zero, nunca guardado como grupo).
    for (const p of g.pessoas.values()) p.seguidores = 0;
    for (const [uid, p] of g.pessoas) {
      const i = this.indexOfUid(uid);
      if (i < 0 || !this.alive[i]) {
        g.pessoas.delete(uid);
        g.conta.mortos++;
        continue;
      }
      if (p.segue) {
        const lider = g.pessoas.get(p.segue);
        if (lider) lider.seguidores++;
      }
      // Os filhos que cresceram ou morreram saem da conta do corpo.
      if (p.filhos.length) p.filhos = p.filhos.filter((f) => {
        const j = this.indexOfUid(f);
        return j >= 0 && this.alive[j] && this.age[j] < this.species[this.kind[j]].maturity;
      });
      if (p.colo) {
        const j = this.indexOfUid(p.colo);
        if (j < 0 || !this.alive[j] || this.age[j] >= GEN.come) p.colo = 0;
      }
    }
  },

  /** Bicho bravo ao lado de quem está sozinho e sem fogo: pode morder (a mordida é do mundo, não da mente). */
  genMordida(this: Ecosystem, i: number, p: PessoaGen, perigo: number, gente: number, fogo: number): void {
    if (perigo < 0.75 || gente >= 2 || fogo > 0) return;
    if (this.mindRnd() < 0.04 * (p.dorme ? 2 : 1)) p.ferida = Math.min(1.2, p.ferida + 0.3);
    void i;
  },

  /** Larga o que tem na mão no monte do tile onde está (o monte passa a ter isso). */
  /** Há um tronco caído ao pé da árvore deste tile (e ninguém o levou ainda)? */
  genTroncoCaido(this: Ecosystem, t: number): boolean {
    return t >= 0 && tileHash(t + 7919) < GEN.troncoCaido && isTree(decorAt(this.map, t)) && !this.gen!.tirado.has(t);
  },

  /**
   * Quem segura um tronco boia: entra na água e anda por ela (devagar), e sai em qualquer terra onde dê pé. É a
   * física da travessia: o motor não deixa mais ninguém pisar na água, e nada aqui diz para atravessar.
   */
  genFlutua(this: Ecosystem, i: number, de: number, para: number): boolean {
    if (this.species[this.kind[i]].kind !== 'sapient' || this.village[i] >= 0) return false;
    if (this.gen!.pessoas.get(this.uid[i])?.mao?.que !== 'tronco') return false;
    return isWater(this.map, para) || (isWater(this.map, de) && this.canStand(this.kind[i], para));
  },

  genLargar(this: Ecosystem, i: number, p: PessoaGen, em?: Coisa): Coisa | null {
    if (!p.mao) return null;
    const c = em ?? this.genMonte(this.tileOf(i), this.uid[i]);
    c.m[p.mao.que] = q(c, p.mao.que) + p.mao.q;
    p.mao = null;
    return c;
  },

  /** O que dá para pegar deste percepto com a mão como está (null = nada). */
  genOQuePega(this: Ecosystem, p: PessoaGen, a: Percepto): Material | null {
    const cabe = (m: Material) => !p.mao || (p.mao.que === m && p.mao.q < GEN.mao);
    if (a.tipo === 'tile' || a.tipo === 'aqui') {
      if ((a.tags.comivel ?? 0) > 0.15 && cabe('comida') && a.coisa === 0) return 'comida';
      if (a.coisa) {
        const c = this.genCoisa(a.coisa);
        if (c) {
          if (c.planta >= 1 && cabe('comida')) return 'comida';
          for (const m of ['comida', 'carne', 'lasca', 'semente', 'galho', 'pedra', 'tronco'] as const) if (q(c, m) >= 1 && cabe(m)) return m;
        }
      }
      if ((a.tags.comivel ?? 0) > 0.15 && cabe('comida')) return 'comida';
      if (this.genTroncoCaido(a.t) && cabe('tronco')) return 'tronco';
      if ((a.tags.galho ?? 0) > 0 && cabe('galho')) return 'galho';
      if ((a.tags.pedra ?? 0) >= 0.5 && cabe('pedra')) return 'pedra';
      return null;
    }
    if (a.tipo === 'coisa') {
      const c = this.genCoisa(a.coisa);
      if (!c) return null;
      if (c.planta >= 1 && cabe('comida')) return 'comida';
      if (p.mao && q(c, p.mao.que) >= 1 && cabe(p.mao.que)) return p.mao.que;
      for (const m of ['comida', 'carne', 'lasca', 'semente', 'galho', 'pedra', 'tronco'] as const) if (q(c, m) >= 1 && cabe(m)) return m;
      return null;
    }
    if (a.tipo === 'carcaca') return cabe('carne') ? 'carne' : null;
    if (a.tipo === 'pessoa') {
      const m = this.gen!.pessoas.get(this.uid[a.j])?.mao;
      return m && cabe(m.que) ? m.que : null;
    }
    return null;
  },

  /**
   * O que acontece de verdade quando `i` faz `v` em `a`. Só olha o que a coisa é e tem. Devolve se deu, e em que
   * coisa (ou pessoa) o ato mexeu, para o crédito de mais tarde.
   */
  genEfeito(this: Ecosystem, i: number, p: PessoaGen, v: Verbo, a: Percepto): Efeito {
    const g = this.gen!;
    const uid = this.uid[i];
    const rnd = this.mindRnd;
    const sp = this.species[this.kind[i]];
    const j = a.j;
    const viva = j >= 0 && this.alive[j] === 1 && this.uid[j] === a.id;
    const pj = viva && a.tipo === 'pessoa' ? this.genDe(j) : null;
    const coisa = a.coisa ? this.genCoisa(a.coisa) : a.tipo === 'aqui' ? this.genCoisaEm(this.tileOf(i)) : undefined;
    const naMao = (m: Material, n: number): boolean => {
      if (p.mao && p.mao.que !== m) return false;
      p.mao = { que: m, q: Math.min(GEN.mao, (p.mao?.q ?? 0) + n) };
      return true;
    };
    const gasta = (n = 1) => {
      if (p.mao && (p.mao.q -= n) <= 0) p.mao = null;
    };
    const comer = (e: number) => {
      this.energy[i] = Math.min(1, this.energy[i] + e);
    };
    const laco = (x: number, y: number, d: number) => {
      const b = touch(this.bonds, this.uid[x], this.uid[y]);
      b.value = Math.max(-100, Math.min(100, b.value + d));
    };
    switch (v) {
      case 'andar':
        return feito();
      case 'olhar': {
        // Olhar em volta guarda o lugar na memória (o que há ali) e alivia o tédio; no alto, com fogo ou no desconhecido, mais.
        const novo = (a.tags.desconhecido ?? 0) + (a.tags.alto ?? 0) + (a.tags.fogo ?? 0);
        p.nec[NI.tedio] = Math.max(0, p.nec[NI.tedio] - 0.12 - 0.3 * Math.min(1, novo));
        if (novo > 0.3) this.needFaith[i] = Math.max(0, this.needFaith[i] - 0.3);
        return feito();
      }
      case 'pegar': {
        const m = this.genOQuePega(p, a);
        if (!m) return NADA;
        if (a.tipo === 'pessoa') {
          // Tomar da mão de alguém: dá se ele dorme, é bem mais fraco ou perde a disputa. Fica o desafeto.
          if (!pj?.mao) return NADA;
          const ganha = pj.dorme || this.genForca(i) * (0.6 + 0.8 * rnd()) > this.genForca(j);
          laco(j, i, -18);
          pj.nec[NI.respeito] = Math.min(1, pj.nec[NI.respeito] + 0.3);
          if (!ganha) {
            p.ferida = Math.min(1.2, p.ferida + 0.12);
            return NADA;
          }
          const n = pj.mao.q;
          pj.mao = null;
          naMao(m, n);
          p.conta.tomou++;
          return feito(this.uid[j]);
        }
        if (a.tipo === 'carcaca') {
          const cc = this.carcasses[a.k];
          if (!cc || cc.kg < 0.3) return NADA;
          cc.kg = Math.max(0, cc.kg - 2);
          naMao('carne', 1);
          return feito();
        }
        const c = a.tipo === 'coisa' || a.coisa ? coisa : undefined;
        if (c && c.planta >= 1 && m === 'comida' && !(q(c, 'comida') >= 1)) {
          c.planta -= 1;
          naMao('comida', 1);
          return feito(-c.id, [], true);
        }
        if (c && q(c, m) >= 1) {
          const n = Math.min(q(c, m), GEN.mao - (p.mao?.q ?? 0), m === 'comida' || m === 'carne' ? 1 : GEN.mao);
          c.m[m] = q(c, m) - n;
          naMao(m, n);
          return feito(-c.id);
        }
        if (m === 'comida') {
          const com = this.genComivel(a.t);
          if (com < 0.15) return NADA;
          this.genColher(a.t, 0.5);
          naMao('comida', 1);
          return feito();
        }
        if (m === 'tronco' && this.genTroncoCaido(a.t)) {
          if (!naMao('tronco', 1)) return NADA;
          g.tirado.set(a.t, this.year);
          return feito();
        }
        if (m === 'galho') return naMao('galho', 2) ? feito() : NADA;
        if (m === 'pedra') return rnd() < (a.tags.pedra ?? 0) && naMao('pedra', 1) ? feito() : NADA;
        return NADA;
      }
      case 'largar':
      case 'empilhar': {
        if (!p.mao) return NADA;
        const tag = TAG_DO_MATERIAL[p.mao.que];
        const c = this.genLargar(i, p, v === 'empilhar' ? coisa : undefined);
        return c ? feito(-c.id, [tag]) : NADA;
      }
      case 'carregar': {
        if (!pj || p.colo || pj.noColo || this.age[j] >= GEN.come) return NADA;
        p.colo = this.uid[j];
        pj.noColo = uid;
        return feito(this.uid[j]);
      }
      case 'comer': {
        if (a.tipo === 'mao') {
          if (!p.mao || (p.mao.que !== 'comida' && p.mao.que !== 'carne')) return NADA;
          comer(p.mao.que === 'carne' ? 0.4 : 0.3);
          const fruta = p.mao.que === 'comida';
          gasta();
          // Da fruta comida sobra o caroço, se a mão ficou livre.
          if (fruta && !p.mao && rnd() < 0.35) p.mao = { que: 'semente', q: 1 };
          return feito();
        }
        if (a.tipo === 'carcaca') {
          const cc = this.carcasses[a.k];
          if (!cc || cc.kg < 0.3) return NADA;
          cc.kg = Math.max(0, cc.kg - 1.5);
          comer(0.3);
          return feito();
        }
        if (coisa && (a.tipo === 'coisa' || a.tipo === 'aqui')) {
          if (q(coisa, 'comida') >= 0.5) {
            coisa.m.comida = Math.max(0, q(coisa, 'comida') - 1);
            comer(0.3);
            return feito(-coisa.id, [], true);
          }
          if (q(coisa, 'carne') >= 0.5) {
            coisa.m.carne = Math.max(0, q(coisa, 'carne') - 1);
            comer(coisa.fogo > 0 ? 0.5 : 0.35);
            return feito(-coisa.id, [], true);
          }
          if (coisa.planta >= 1) {
            coisa.planta -= 1;
            comer(0.3);
            return feito(-coisa.id, [], true);
          }
          if (a.tipo === 'coisa') return NADA;
        }
        const com = this.genComivel(a.t >= 0 ? a.t : this.tileOf(i));
        if (com < 0.08) return NADA;
        this.genColher(a.t >= 0 ? a.t : this.tileOf(i), 1);
        comer(GEN.bocado * com);
        return feito();
      }
      case 'beber':
        if (!(a.tags.agua > 0)) return NADA;
        p.nec[NI.sede] = 0;
        return feito();
      case 'dormir':
      case 'descansar':
      case 'abrigar': {
        // O descanso em si corre no corpo enquanto a pessoa fica ali (ver `genSentir`); aqui só fica o vínculo com a coisa.
        const c = a.tipo === 'coisa' || a.tipo === 'aqui' ? coisa : undefined;
        if (v === 'descansar') p.nec[NI.cansaco] = Math.max(0, p.nec[NI.cansaco] - 0.3);
        const cobre = !!c && (this.genAbrigo(c) >= 0.25 || c.fogo > 0);
        return feito(cobre ? -c!.id : 0, [], cobre);
      }
      case 'cavar': {
        const t = this.tileOf(i);
        const pedra = isRockyBiome(this.map.biome[t]) ? 0.7 : 0.15;
        if (rnd() < pedra && naMao('pedra', 1)) return feito();
        // Raízes: pouco, mas é comida.
        const veg = this.map.vegetation[t];
        if (veg > 0.2 && rnd() < 0.6) {
          comer(0.06 * veg);
          return feito();
        }
        return NADA;
      }
      case 'cortar': {
        if (p.mao?.que !== 'lasca') return NADA;
        if (rnd() < 0.08) gasta();
        if (a.tipo === 'carcaca') {
          const cc = this.carcasses[a.k];
          if (!cc || cc.kg < 0.3) return NADA;
          const n = Math.min(4, Math.ceil(cc.kg / 2));
          cc.kg = Math.max(0, cc.kg - n * 2);
          const c = this.genMonte(this.tileOf(i), uid);
          c.m.carne = q(c, 'carne') + n;
          return feito(-c.id, ['carne']);
        }
        if (a.t >= 0 && this.standingTree(a.t)) {
          this.fellTree(a.t, false);
          const c = this.genMonte(a.t, uid);
          c.m.tronco = q(c, 'tronco') + 1;
          c.m.galho = q(c, 'galho') + 3;
          return feito(-c.id, ['tronco']);
        }
        return NADA;
      }
      case 'bater': {
        if (a.tipo === 'animal') {
          if (!viva) return NADA;
          const bravo = (a.tags.perigoso ?? 0) > 0;
          const golpe = this.genGolpe(i, j, bravo);
          if (rnd() < golpe.chance) {
            this.leaveCarcass(j);
            this.kill(j, true, 'predador');
            g.conta.abates++;
            if (golpe.massa >= GEN.grande) g.conta.abatesGrandes++;
            if (golpe.juntos > 0) g.conta.abatesJuntos++;
            return feito();
          }
          // O golpe que falha: o bicho bravo morde, e o bicho grande revida (com chifre, casco e peso), mais em quem está só.
          const outros = golpe.juntos + 0.5 * golpe.perto;
          if (bravo && rnd() < 0.5 / (1 + outros)) p.ferida = Math.min(1.2, p.ferida + 0.3);
          else if (golpe.massa >= GEN.grande && rnd() < (GEN.revide * Math.min(1, 0.5 + Math.log10(golpe.massa / GEN.grande))) / (1 + outros)) p.ferida = Math.min(1.2, p.ferida + 0.25);
          return NADA;
        }
        if (a.tipo === 'pessoa') {
          if (!pj) return NADA;
          const gostava = Math.max(0, (bondWith(this.bonds, uid, this.uid[j])?.value ?? 0) / 100);
          pj.ferida = Math.min(1.2, pj.ferida + 0.2 * Math.min(2, this.genForca(i) / Math.max(0.3, this.genForca(j))));
          laco(j, i, -25);
          laco(i, j, -8);
          p.conta.bateu++;
          pj.conta.apanhou++;
          pj.nec[NI.medo] = Math.min(1, pj.nec[NI.medo] + 0.4);
          pj.dorme = false;
          // Bater em quem se gosta dói em quem bate, na medida do laço (é o que faz um presente aceito proteger quem deu).
          p.nec[NI.apego] = Math.min(1, p.nec[NI.apego] + 0.5 * gostava);
          // Quem apanha larga o que carrega (menos na água: o tronco é o que o segura). Quem vê passa a gostar menos de quem bateu.
          if (pj.mao && !isWater(this.map, this.tileOf(j))) this.genLargar(j, pj);
          this.forEachNear(this.x[i], this.y[i], 6, (k) => {
            if (k !== i && k !== j && this.species[this.kind[k]].kind === 'sapient' && this.gen!.pessoas.has(this.uid[k])) laco(k, i, -6);
          });
          return feito(this.uid[j]);
        }
        // Pedra batida em pedra solta uma lasca (com sorte e com jeito).
        if ((a.tags.pedra ?? 0) > 0 && p.mao?.que === 'pedra') {
          const jeito = 0.45 + 0.03 * this.traits[i * TRAIT_COUNT + TRAIT.dexterity];
          if (rnd() < jeito) {
            p.mao = { que: 'lasca', q: 1 };
            return feito();
          }
        }
        return NADA;
      }
      case 'fugir':
        return feito();
      case 'seguir':
        if (!pj) return NADA;
        this.needSocial[i] = Math.max(0, this.needSocial[i] - 0.12);
        laco(i, j, 1);
        return feito(this.uid[j]);
      case 'falar': {
        if (!pj || pj.dorme) return NADA;
        this.needSocial[i] = Math.max(0, this.needSocial[i] - 0.4);
        this.needSocial[j] = Math.max(0, this.needSocial[j] - 0.3);
        p.nec[NI.tedio] = Math.max(0, p.nec[NI.tedio] - 0.1);
        p.nec[NI.respeito] = Math.max(0, p.nec[NI.respeito] - 0.12);
        pj.nec[NI.respeito] = Math.max(0, pj.nec[NI.respeito] - 0.12);
        const fe = (x: number, y: number) => Math.max(0, Math.min(1, ((bondWith(this.bonds, this.uid[x], this.uid[y])?.value ?? 0) + 20) / 80));
        // A conversa vai nos dois sentidos: cada um passa algo que o outro não sabe, com ruído, pesado pela confiança.
        contar(p, uid, pj, fe(j, i), rnd, this.year);
        contar(pj, this.uid[j], p, fe(i, j), rnd, this.year);
        laco(i, j, 2);
        laco(j, i, 2);
        // Quem ensina os seus acha sentido nisso.
        if (this.parent[j] === uid) this.needFaith[i] = Math.max(0, this.needFaith[i] - 0.2);
        return feito(this.uid[j]);
      }
      case 'mostrar': {
        if (!pj || pj.dorme) return NADA;
        const l = [...p.lugares].sort((x, y) => y.bem - x.bem)[0];
        if (!l && !p.mao) return NADA;
        if (l) lembrarLugar(pj, l.x, l.y, l.tags, Math.max(0.3, l.bem * 0.5), this.year, uid);
        p.nec[NI.respeito] = Math.max(0, p.nec[NI.respeito] - 0.18);
        laco(j, i, 2);
        return feito(this.uid[j]);
      }
      case 'dar': {
        if (!pj || !p.mao) return NADA;
        const m = p.mao.que;
        const comida = m === 'comida' || m === 'carne';
        const antes = pj.nec.slice();
        if (comida && this.energy[j] < 0.7) {
          // Quem tem fome come o que recebe ali mesmo.
          this.energy[j] = Math.min(1, this.energy[j] + (m === 'carne' ? 0.4 : 0.3));
          gasta();
        } else if (!pj.mao || (pj.mao.que === m && pj.mao.q < GEN.mao)) {
          const n = Math.min(p.mao.q, GEN.mao - (pj.mao?.q ?? 0));
          pj.mao = { que: m, q: (pj.mao?.q ?? 0) + n };
          gasta(n);
        } else return NADA;
        laco(j, i, 8);
        laco(i, j, 2);
        // Dar a quem mete medo, e ele aceitar, acalma quem deu: o desafeto antigo cede um pouco dos dois lados.
        if ((a.tags.perigoso ?? 0) > 0) {
          p.nec[NI.medo] = Math.max(0, p.nec[NI.medo] - 0.4 * a.tags.perigoso);
          laco(i, j, 8);
        }
        p.conta.deu++;
        pj.conta.recebeu++;
        p.conta.para.unshift(this.uid[j]);
        if (p.conta.para.length > 8) p.conta.para.length = 8;
        p.nec[NI.respeito] = Math.max(0, p.nec[NI.respeito] - 0.2);
        pj.nec[NI.respeito] = Math.max(0, pj.nec[NI.respeito] - 0.1);
        if (pj.pedido?.de === uid) pj.pedido = null;
        // Para quem recebeu, isto rendeu de alguém: os atos antigos dele sobre esta pessoa (pedir, dar, seguir) levam o crédito.
        const real = antes.map((x, n) => -x + pj.nec[n]);
        real[NI.fome] = comida ? -0.3 : 0;
        creditar(pj, uid, real, this.year);
        return feito(this.uid[j]);
      }
      case 'pedir': {
        if (!pj || pj.dorme) return NADA;
        pj.pedido = { de: uid, em: this.year };
        return feito(this.uid[j]);
      }
      case 'acender': {
        if (!coisa || coisa.fogo > 0 || q(coisa, 'galho') < 1) return NADA;
        const jeito = GEN.acender + 0.02 * this.traits[i * TRAIT_COUNT + TRAIT.dexterity] + (p.mao?.que === 'lasca' || p.mao?.que === 'pedra' ? 0.25 : 0);
        if (rnd() >= jeito) return NADA;
        coisa.fogo = q(coisa, 'galho') * GEN.fogoPorGalho;
        delete coisa.m.galho;
        return feito(-coisa.id, ['galho']);
      }
      case 'cuidar': {
        if (!pj) return NADA;
        const crianca = this.age[j] < sp.maturity;
        if (this.energy[j] < 0.7 && (crianca || pj.ferida > 0.2)) {
          if (p.mao && (p.mao.que === 'comida' || p.mao.que === 'carne')) {
            this.energy[j] = Math.min(1, this.energy[j] + 0.3);
            gasta();
          } else if (this.age[j] < GEN.come && this.age[i] >= sp.maturity && this.energy[i] > 0.35) {
            // O bebê mama: a comida dele sai do corpo de quem cuida.
            this.energy[i] -= 0.07;
            this.energy[j] = Math.min(1, this.energy[j] + 0.22);
          }
        }
        if (pj.ferida > 0) pj.ferida = Math.max(0, pj.ferida - 0.12);
        // Cuidar dos seus acalma quem cuida (o quanto, depende do quanto o outro precisava).
        if (a.tags.filho || a.tags.parente) p.nec[NI.apego] = Math.max(0, p.nec[NI.apego] - 0.15 - 0.3 * Math.max(a.tags.comFome ?? 0, a.tags.ferido ?? 0));
        pj.nec[NI.medo] = Math.max(0, pj.nec[NI.medo] - 0.25);
        this.needSocial[j] = Math.max(0, this.needSocial[j] - 0.2);
        laco(j, i, 4);
        if (pj.pedido?.de === uid || this.parent[j] === uid) pj.pedido = null;
        if (p.pedido?.de === this.uid[j]) p.pedido = null;
        return feito(this.uid[j]);
      }
      case 'acasalar': {
        if (!pj || !(a.tags.parceiro > 0) || pj.dorme) return NADA;
        // O outro também precisa querer: a vontade dele e o laço entre os dois.
        const quer = pj.desejo > 0.25 && (bondWith(this.bonds, this.uid[j], uid)?.value ?? 0) > -10;
        if (!quer) {
          laco(j, i, -2);
          return NADA;
        }
        // A vontade passa na hora (para os dois): é isto que o corpo sente e a crença aprende.
        p.nec[NI.apego] = Math.max(0, p.nec[NI.apego] - 0.8 * p.desejo);
        pj.nec[NI.apego] = Math.max(0, pj.nec[NI.apego] - 0.8 * pj.desejo);
        p.desejo = 0;
        pj.desejo = 0;
        laco(i, j, 6);
        laco(j, i, 6);
        const mae = fem(uid) ? i : j;
        const pm = mae === i ? p : pj;
        const temBebe = pm.filhos.some((f) => {
          const k = this.indexOfUid(f);
          return k >= 0 && this.age[k] < 1.5;
        });
        if (!pm.gravida && !temBebe && this.energy[mae] >= GEN.conceber && rnd() < 0.75) {
          pm.gravida = this.year + GEN.gestacao;
          pm.par = mae === i ? this.uid[j] : uid;
          g.conta.concepcoes++;
        }
        return feito(this.uid[j]);
      }
    }
    return NADA;
  },

  /** O filho nasce onde a mãe está, em qualquer lugar: herda os traços e parte do que os pais sabem. */
  genNascer(this: Ecosystem, mae: number, pm: PessoaGen): void {
    const g = this.gen!;
    const s = this.kind[mae];
    const pai = pm.par ? this.indexOfUid(pm.par) : -1;
    pm.gravida = 0;
    const f = this.spawn(s, this.x[mae], this.y[mae], -1, 0);
    if (f < 0) return;
    this.energy[mae] = Math.max(0.05, this.energy[mae] - 0.12);
    this.energy[f] = 0.6;
    this.parent[f] = this.uid[mae];
    this.family[f] = this.family[mae];
    inheritTraits(this.traits, f, mae, pai >= 0 && this.alive[pai] ? pai : mae, this.mindRnd);
    const pf = this.genDe(f);
    const pais = [{ uid: this.uid[mae], p: pm }];
    const pp = pai >= 0 && this.alive[pai] ? g.pessoas.get(this.uid[pai]) : undefined;
    if (pp) pais.push({ uid: this.uid[pai], p: pp });
    herdar(pf, pais, this.year);
    pm.filhos.push(this.uid[f]);
    if (pp) pp.filhos.push(this.uid[f]);
    // A mãe conhece o filho (e o pai, se está perto): o laço nasce junto.
    touch(this.bonds, this.uid[mae], this.uid[f]).value = 40;
    touch(this.bonds, this.uid[f], this.uid[mae]).value = 40;
    g.conta.nascidos++;
  },

  /** Temperatura sentida no tile (K): o clima, a noite, o fogo e o abrigo de onde se está. */
  genTemperatura(this: Ecosystem, t: number, noite: number): number {
    let temp = temperatureAt(this.map, t) - 7 * noite + 2 * GEN.invernoFrio * this.genVerao(t);
    const c = this.genCoisaEm(t);
    if (c) temp += (c.fogo > 0 ? 9 : 0) + 6 * this.genAbrigo(c) * (noite > 0.3 || temp < 283 ? 1 : 0);
    return temp;
  },

  /** A hora do dia, de 0 a 1 (0 é meia-noite), e o quanto é noite (0 a 1). */
  genNoite(this: Ecosystem): number {
    const h = ((this.year * this.yearSpan) / GEN.dia) % 1;
    const d = Math.abs(h - 0.5) * 2; // 0 ao meio-dia, 1 à meia-noite
    return Math.max(0, Math.min(1, (d - 0.55) / 0.25));
  },

  /** Distância com a volta do mapa. */
  genDist(this: Ecosystem, i: number, x: number, y: number): number {
    return Math.hypot(wrapDx(x - this.x[i], this.map.width), y - this.y[i]);
  },

  /** Dá para ficar de pé no tile (terra firme, no habitat). */
  genPisa(this: Ecosystem, i: number, t: number): boolean {
    return t >= 0 && !isWater(this.map, t) && this.canStand(this.kind[i], t);
  },
};
export type GenFisicaPart = typeof genFisicaPart;
