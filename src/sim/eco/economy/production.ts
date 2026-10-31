/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): produção dos ofícios e transporte até o estoque.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { happens } from '../../stochastic';
import { type Biome, decorAt, isRockyBiome, isTree } from '../../../procgen/surface';
import { forge, ORE_NAMES, type Good } from '../../economy';
import { TIER_MATERIAL } from '../../items';
import { ROLE } from '../../roles';
import { seasonOf, type Vocation } from '../../needs';
import type { Village } from '../types';
import * as constantsModule from '../constants';
import * as tilesModule from '../tiles';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { YEAR_SECONDS } = constantsModule;
const { isLand } = tilesModule;

export const productionPart = {
  /** Floresta e rocha em volta do assentamento (amostra), para lenha e pedra. */
  survey(this: Ecosystem, v: Village): void {
    const r = this.radius(v) + 6;
    let veg = 0;
    let rock = false;
    for (let k = 0; k < 40; k++) {
      const a = this.civRnd() * Math.PI * 2;
      const d = Math.sqrt(this.civRnd()) * r;
      const t = this.tileAt(v.x + Math.cos(a) * d, Math.floor(v.y + Math.sin(a) * d));
      if (t < 0) continue;
      veg += this.map.vegetation[t];
      const b = this.map.biome[t] as Biome;
      if (isRockyBiome(b) || this.map.elevation[t] > 0.35) rock = true;
    }
    v.forest = veg / 40;
    v.rock = rock;
  },

  /**
   * Um ano (proporcional) de trabalho: lenha, pedra, barro e tijolo, minas,
   * ferraria, rebanho, lã e roupa, e o ganho dos comerciantes. Tudo entra no
   * estoque do próprio assentamento (RF-VIDA-212), com retorno decrescente
   * perto do teto; a vocação dá bônus no setor dela (RF-VIDA-221).
   */
  produce(this: Ecosystem, v: Village, w: number[], adults: number, dt: number): void {
    const yr = dt / YEAR_SECONDS;
    const st = v.stock;
    if (happens(this.civRnd, B.SURVEY_RATE, yr) || v.forest === 0) this.survey(v);
    const tools = st.tools > 0 ? 1.4 : 1;
    const bonus = (voc: Vocation) => (v.vocation === voc ? 1 + B.VOCATION_BONUS : 1);
    const season = seasonOf(this.actionPhase());
    // Lenha (seção 19.19): os lenhadores derrubam árvores de verdade, da mais perto para a mais longe;
    // quanto mais longe a mata, menos madeira chega por ano. A serraria aproveita mais de cada tronco.
    v.crew = w[ROLE.builder];
    const cutters = w[ROLE.woodcutter] + (this.scale(v) === 0 && v.population <= 4 && st.wood < 6 ? w[ROLE.leader] * 0.5 : 0);
    if (cutters && !B.PRESENCE_WOOD) this.cutWood(v, cutters * B.CUT_RATE * yr * tools * bonus('madeireira'), (this.has(v, 'sawmill') ? 1.3 : 1) * this.areaOf(v).wood);
    // Coletores trazem frutos, raízes e mel do mato, que se gasta e rebrota (seção 19.19). Numa aldeia pequenina, o líder também ajuda a colher.
    if (this.scale(v) === 0 && v.population <= 6 && w[ROLE.leader] && v.food < 6 && v.forest > 0.2) {
      this.book(v, '_gather', this.put(v, 'food', w[ROLE.leader] * B.GATHER_RATE * 0.6 * yr * this.harvest(v)), 0);
    }
    if (w[ROLE.gatherer]) this.gather(v, w[ROLE.gatherer] * B.GATHER_RATE * yr * this.harvest(v) * this.seasonWeightOf(v, B.SEASON_HARVEST) ** 0.5);
    // Minas: o minério sai da jazida (limitada) para o estoque do assentamento que a explora.
    const mines = v.mines.map((id) => this.deposits[id]);
    if (mines.length && w[ROLE.miner]) {
      const each = (w[ROLE.miner] * 0.8 * yr * tools * bonus('mineira')) / mines.length;
      for (const d of mines) {
        const take = this.gain(v, d.ore, Math.min(d.amount, each));
        d.amount -= take;
        // O que se extrai e forja conta para o próprio lugar (antes também para a capital, e a era do reino era a do mais rico).
        if (d.ore === 'coal') v.made.coal += take;
        if (d.amount <= 0) {
          d.mine = -1;
          v.mines.splice(v.mines.indexOf(d.id), 1);
          this.note(`A mina de ${ORE_NAMES[d.ore]} de ${v.name} se esgotou`, 'economia', d);
        }
      }
    }
    // Pedra (seção 19.19): mineradores sem mina e construtores tiram pedra da rocha por perto, ou
    // juntam pedras soltas do chão; cada tile tem um tanto e acaba.
    const quarry = (mines.length ? 0 : w[ROLE.miner]) + w[ROLE.builder] * 0.5;
    if (quarry) {
      const q = this.quarry(v, quarry * B.QUARRY_RATE * yr * tools);
      v.made.stone += q;
    }
    // Barro e tijolo (RF-VIDA-211): o oleiro tira barro perto da água e queima tijolo e telha na olaria.
    if (w[ROLE.potter] && v.wet && this.has(v, 'pottery')) {
      this.gain(v, 'clay', w[ROLE.potter] * 2 * yr * tools);
      const fired = this.spend(v, 'clay', Math.min(st.clay, w[ROLE.potter] * 1.5 * yr));
      this.gain(v, 'brick', fired);
    }
    // Rebanho (RF-VIDA-215): leite, carne, couro e lã; a tosquia é na primavera (RF-VIDA-290). O pasto do bioma
    // (`graze`) dá mais leite e carne por cabeça na pradaria do que na mata fechada.
    const herd = v.herd;
    if (herd && herd.head > 0) {
      const tend = Math.min(1, 0.4 + (w[ROLE.shepherd] * 6) / herd.head);
      const extra = herd.kind === 'sheep' ? bonus('ovelhas') : herd.kind === 'cattle' || herd.kind === 'goat' ? bonus('gado') : bonus('cavalos');
      const k = herd.head * tend * extra * this.areaOf(v).graze * yr;
      let meat = 0;
      if (herd.kind === 'sheep') {
        this.gain(v, 'wool', k * 0.35 * B.SEASON_WOOL[season]);
        meat = this.gain(v, 'food', k * 0.08);
      } else if (herd.kind === 'cattle') {
        meat = this.gain(v, 'food', k * 0.3);
        this.gain(v, 'hides', k * 0.06);
      } else if (herd.kind === 'goat') {
        meat = this.gain(v, 'food', k * 0.22);
        this.gain(v, 'hides', k * 0.04);
      } else meat = this.gain(v, 'food', k * 0.05);
      this.book(v, '_herd', meat, 0);
    }
    // Tear: a lã vira roupa.
    if (w[ROLE.weaver] && this.has(v, 'loom')) this.gain(v, 'cloth', this.spend(v, 'wool', Math.min(st.wool, w[ROLE.weaver] * 1.5 * yr)) * bonus('ovelhas'));
    // Coletores trançam fibra e casca em roupa simples.
    if (w[ROLE.gatherer]) this.gain(v, 'cloth', w[ROLE.gatherer] * 0.4 * yr);
    // Comerciantes no mercado ganham um pouco de ouro com as trocas.
    if (w[ROLE.merchant] && this.has(v, 'market')) this.gain(v, 'gold', w[ROLE.merchant] * 0.25 * yr * bonus('mercantil'));
    const era = Math.floor(v.tech);
    const soldiers = w[ROLE.soldier] + w[ROLE.guard];
    // Ferramentas e armas iniciais: construtores, coletores e mineradores lascam pedra e madeira (sem ferraria).
    if (st.stone >= 1 && st.wood >= 1 && this.civRnd() < (w[ROLE.builder] + w[ROLE.gatherer] + w[ROLE.miner]) * 0.18 * yr) {
      this.spend(v, 'stone', 1);
      this.spend(v, 'wood', 1);
      this.craft(v, st, this.needed(st, adults, soldiers, v), 'stone', era);
    }
    // Ferraria: cada ferreiro faz uma peça a cada ano e pouco, se houver metal e técnica; a fábrica dobra o ritmo.
    if (w[ROLE.blacksmith] && this.has(v, 'smithy')) {
      const factory = this.has(v, 'factory') ? 2 : 1;
      const known = this.knows(v);
      v.forgeWork += w[ROLE.blacksmith] * 0.6 * yr * factory * bonus('mineira');
      while (v.forgeWork >= 1) {
        // Ouro vira joia de vez em quando (anéis, amuletos e a coroa do rei).
        if ((era >= 1 || known.has('fundicao')) && st.gold >= 2 && this.civRnd() < 0.2) {
          this.spend(v, 'gold', 2);
          v.forgeWork -= 1;
          this.craft(v, st, 'joia', 'gold', era);
          continue;
        }
        const before = st.copper + st.tin + st.iron + st.coal;
        const piece = forge(st, era, known);
        if (!piece) {
          v.forgeWork = 0;
          break;
        }
        this.book(v, 'metal', 0, before - (st.copper + st.tin + st.iron + st.coal));
        v.forgeWork -= 1;
        v.made[piece.kind]++;
        this.craft(v, st, this.needed(st, adults, soldiers, v), TIER_MATERIAL[piece.tier], era);
      }
    }
    // Abre uma mina numa jazida conhecida, respeitando a sequência de materiais que o povo já sabe explorar.
    if (w[ROLE.miner] && v.mines.length < 1 + this.scale(v) && happens(this.civRnd, B.MINE_RATE, dt / YEAR_SECONDS)) this.openMine(v);
  },

  // Recursos do mapa (seção 19.19) ----------------------------------------------

  /**
   * Põe no estoque o que alguém trouxe carregado (árvore, pedra, colheita, caça), sem o retorno
   * decrescente da produção: o que não cabe no teto se perde. Retorna quanto entrou.
   */
  put(this: Ecosystem, v: Village, good: Good | 'food', amount: number): number {
    if (amount <= 0) return 0;
    const have = (good === 'food' ? v.food : v.stock[good]) + (v.yard?.[good] ?? 0);
    const got = Math.max(0, Math.min(this.capOf(v, good) - have, amount));
    this.store1(v, good, got);
    this.book(v, good, got, 0);
    return got;
  },

  /** Alcance do corte, da pedreira e da coleta além da borda: cresce com a era (estradas, carroças). */
  reachOf(this: Ecosystem, v: Village, base: number): number {
    return this.radius(v) + base * (1 + B.REACH_PER_ERA * Math.floor(v.tech));
  },

  /** Parte do trabalho que sobra depois de carregar de longe até o assentamento: metade a HAUL_TILES além da borda. */
  haulFactor(this: Ecosystem, v: Village, t: number): number {
    const w = this.map.width;
    const d = Math.max(0, this.distance(v, (t % w) + 0.5, Math.floor(t / w) + 0.5) - this.radius(v));
    const horses = this.knew(v, 'montaria') && (v.stock.horses > 0 || (!!v.herd && v.herd.head >= 2 && v.herd.kind !== 'sheep' && v.herd.kind !== 'goat'));
    const carts = 1 + B.CART_PER_ERA * Math.floor(v.tech) + (this.knew(v, 'roda') ? 0.5 : 0) + (horses ? B.HORSE_HAUL : 0);
    return 1 / (1 + d / (B.HAUL_TILES * carts));
  },

  /** Tile com uma árvore de pé que o povo pode cortar. */
  standingTree(this: Ecosystem, t: number): boolean {
    return isLand(this.map, t) && !this.road[t] && !this.built[t] && isTree(decorAt(this.map, t));
  },
};
export type ProductionPart = typeof productionPart;
