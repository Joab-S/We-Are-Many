/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): ruas, materiais, reformas, conserto, lotes, casas, prédios e roças.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { happens } from '../../stochastic';
import { Biome, isForestBiome, isRockyBiome, temperatureAt } from '../../../procgen/surface';
import { WONDER_NAMES } from '../../economy';
import type { ColonyMotive } from '../../community';
import { AVENUE, mainStreets, pickMaterial, type BuildMaterial } from '../../architecture';
import { VOCATION_BUILDING, welfare } from '../../needs';
import { wrapDx } from '../../settlement';
import type { BuildingKind, Building, Village } from '../types';
import * as constantsModule from '../constants';
import * as helpersModule from '../helpers';
import * as tilesModule from '../tiles';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { ERAS, BUILDINGS, BUILDING_NAMES } = constantsModule;
const { canBuild } = helpersModule;
const { isLand, NEIGHBORS4 } = tilesModule;

export const buildingsPart = {
  setRoad(this: Ecosystem, i: number, kind: number): void {
    if (this.road[i] >= kind || this.built[i]) return;
    this.road[i] = kind;
    this.roadDirty.push(i);
    this.onTileChanged(i);
  },

  /** Assentamento rico: calçamento uma era antes (RF-VIDA-253). */
  rich(this: Ecosystem, v: Village): boolean {
    return v.stock.gold >= this.capOf(v, 'gold') * 0.5 && (v.needs ? welfare(v.needs) : 1) >= 0.85;
  },

  /**
   * Marca ruas principais e vielas, calça as principais pela era e pela
   * riqueza e, de cidade em diante, abre a avenida: o trecho reto mais longo
   * de rua principal saindo da praça, com 2 tiles de largura (a única rua
   * larga, marcada como tal, RF-VIDA-191 e 253).
   */
  rankStreets(this: Ecosystem, v: Village): void {
    const w = this.map.width;
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    // Todas as ruas dentro da área, inclusive as de níveis e traçados anteriores.
    const streets = new Set<number>();
    const r = Math.ceil(this.radius(v));
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const t = this.tileAt(cx + dx, cy + dy);
        if (t >= 0 && (this.road[t] === 1 || this.road[t] === 2 || this.road[t] === AVENUE)) streets.add(t);
      }
    }
    const square: number[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) square.push(this.tileAt(cx + dx, cy + dy));
    const next = (t: number) => {
      const x = t % w;
      const y = (t - x) / w;
      return [this.tileAt(x + 1, y), this.tileAt(x - 1, y), this.tileAt(x, y + 1), this.tileAt(x, y - 1)];
    };
    const main = mainStreets(streets, square.filter((t) => t >= 0), next, B.MAIN_STREET_SHARE);
    const era = Math.floor(v.tech);
    const paveMain = era >= 3 || (era >= 2 && this.rich(v));
    // A cor da terra batida e do cascalho muda com a era: repinta tudo na troca.
    const repaint = v.paveEra !== era;
    v.paveEra = era;
    for (const t of streets) {
      this.mainStreet[t] = main.has(t) || this.road[t] === AVENUE ? 1 : 0;
      if (repaint) this.onTileChanged(t);
      if (this.road[t] === AVENUE) continue;
      // Rua muito usada pelas caravanas ganha pedra antes das outras (RF-VIDA-233).
      const want = era >= 4 || (paveMain && main.has(t)) || (era >= 2 && this.traffic[t] >= B.STONE_USE) ? 2 : 1;
      if (this.road[t] !== want) {
        this.road[t] = want;
        this.onTileChanged(t);
      }
    }
    if (v.tier < 2) return;
    // Avenida: o trecho reto mais longo de rua principal (ou da avenida que já existe).
    const isMain = (t: number) => t >= 0 && (main.has(t) || this.road[t] === AVENUE);
    let best: number[] = [];
    let side: [number, number] = [0, 0];
    for (const t of [...main, ...streets]) {
      if (!isMain(t)) continue;
      const x = t % w;
      const y = (t - x) / w;
      for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
        if (isMain(this.tileAt(x - dx, y - dy))) continue;
        const run: number[] = [];
        for (let k = 0; k < 40; k++) {
          const u = this.tileAt(x + dx * k, y + dy * k);
          if (!isMain(u)) break;
          run.push(u);
        }
        if (run.length > best.length) {
          best = run;
          side = [dy, dx];
        }
      }
    }
    if (best.length < B.AVENUE_MIN) return;
    for (const t of best) {
      const x = t % w;
      const y = (t - x) / w;
      this.road[t] = AVENUE;
      this.mainStreet[t] = 1;
      this.onTileChanged(t);
      const n = this.tileAt(x + side[0], y + side[1]);
      if (n >= 0 && isLand(this.map, n) && !this.built[n] && this.depositAt[n] < 0 && (this.road[n] === 0 || this.road[n] === 1 || this.road[n] === 2)) {
        this.road[n] = AVENUE;
        this.mainStreet[n] = 1;
        this.onTileChanged(n);
      }
    }
  },

  /** Material das casas pelo entorno, sem sorteio (RF-VIDA-252); guardado no assentamento. */
  materialOf(this: Ecosystem, v: Village): BuildMaterial {
    if (v.material) return v.material;
    const r = this.radius(v) + 4;
    let n = 0;
    let rock = 0;
    let forest = 0;
    let desert = 0;
    let cold = 0;
    for (let dy = -r; dy <= r; dy += 2) {
      for (let dx = -r; dx <= r; dx += 2) {
        if (dx * dx + dy * dy > r * r) continue;
        const t = this.tileAt(v.x + dx, Math.floor(v.y + dy));
        if (t < 0 || !isLand(this.map, t)) continue;
        n++;
        const b = this.map.biome[t] as Biome;
        if (isRockyBiome(b) || this.map.elevation[t] > 0.45) rock++;
        if (isForestBiome(b)) forest++;
        if (b === Biome.Desert) desert++;
        if (b === Biome.Snow || b === Biome.Tundra || temperatureAt(this.map, t) < 268) cold++;
      }
    }
    n = Math.max(1, n);
    v.material = pickMaterial({ rock: rock / n, forest: forest / n, desert: desert / n, cold: cold / n, wet: this.nearWater(this.tileAt(v.x, Math.floor(v.y))) || this.coastal(v) });
    return v.material;
  },

  /** Casa ainda no estilo de uma era passada, a mais perto do centro (RF-VIDA-251). */
  outdated(this: Ecosystem, v: Village): Building | null {
    const era = Math.floor(v.tech);
    let best: Building | null = null;
    let bd = Infinity;
    for (const h of v.houses) {
      if (h.kind !== 'house' || (h.era ?? era) >= era || this.underWork(h)) continue;
      const d = Math.hypot(wrapDx(h.x + 1 - v.x, this.map.width), h.y + 1 - v.y);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    return best;
  },

  /**
   * Reforma para o estilo da era nova, uma casa por vez, do centro para fora
   * (RF-VIDA-251): por um tempo a cidade mistura estilos.
   */
  restyle(this: Ecosystem, v: Village): boolean {
    const h = this.outdated(v);
    if (!h || !this.pay(v, 'reform')) return false;
    h.era = Math.floor(v.tech);
    this.startWork(h, B.WORK_YEARS, false);
    this.note(`${v.name} está trocando as casas pelo estilo da ${ERAS[h.era]}`, 'povo', v, { key: `restyle-${v.id}-${h.era}` });
    return true;
  },

  /** Madeira e pedra por ano para consertar as casas e os prédios (seção 19.19). */
  repairs(this: Ecosystem, v: Village): { wood: number; stone: number } {
    const era = Math.floor(v.tech);
    let wood = 0;
    let stone = 0;
    for (const h of v.houses) {
      if (h.kind === 'house') {
        const k = 1 + 0.5 * (h.level ?? 0);
        if (era >= 3) {
          wood += B.STONE_HOUSE_UPKEEP * k;
          stone += B.STONE_HOUSE_UPKEEP * k;
        } else wood += B.HOUSE_UPKEEP * k;
      } else if (h.kind !== 'port') wood += B.BUILDING_UPKEEP;
    }
    return { wood, stone };
  },

  /**
   * Conserto das casas (seção 19.19), uma vez por ano, pelo que foi pago ao longo do ano (em
   * `consume`): sem material, as casas mais longe do centro ficam sem conserto; com DECAY_YEARS
   * anos ficam vazias, caindo aos pedaços, e com COLLAPSE_YEARS desabam.
   */
  upkeep(this: Ecosystem, v: Village): void {
    const era = Math.floor(v.tech);
    const e = v.ledgerNow?.['_upkeep'];
    if (!e || e[1] <= 0) return;
    const share = Math.min(1, e[0] / e[1]);
    // As casas mais perto do centro são consertadas primeiro.
    const order = v.houses.filter((h) => h.kind !== 'port').sort((p, q) => this.distance(v, q.x + 1, q.y + 1) - this.distance(v, p.x + 1, p.y + 1));
    const unpaid = Math.round((1 - share) * order.length);
    let empty = 0;
    let fallen = 0;
    for (let k = 0; k < order.length; k++) {
      const h = order[k];
      if (k >= unpaid) {
        h.wear = Math.max(0, (h.wear ?? 0) - 1);
        continue;
      }
      h.wear = (h.wear ?? 0) + 1;
      if (h.kind === 'house' && h.wear >= B.DECAY_YEARS && !h.empty) {
        h.empty = true;
        empty++;
      }
      if (h.wear >= B.COLLAPSE_YEARS && h.kind !== 'port') {
        const at = v.houses.indexOf(h);
        if (at >= 0) {
          this.raze(v, at);
          fallen++;
          this.tally.collapsed++;
        }
      }
    }
    const what = era >= 3 ? 'madeira e pedra' : 'madeira';
    if (fallen) this.note(`${fallen > 1 ? `${fallen} casas desabaram` : 'Uma casa desabou'} em ${v.name}: faltou ${what} para os consertos`, 'economia', v, { key: `collapse-${v.id}` });
    else if (empty) this.note(`Casas de ${v.name} estão caindo aos pedaços: falta ${what} para os consertos`, 'economia', v, { key: `decay-${v.id}` });
  },

  /**
   * A mata ao alcance, uma vez por ano (seção 19.19): conta as árvores de pé e decide se o povo
   * passa a replantar. Sem manejo, quando a mata acaba os lenhadores ficam sem o que cortar.
   */
  woodland(this: Ecosystem, v: Village): void {
    const before = v.trees ?? -1;
    this.scanTrees(v);
    const trees = v.trees ?? 0;
    const used = (v.ledgerNow?.['wood']?.[1] ?? 0) / B.WOOD_PER_TREE;
    if (!v.forestry && used > 0.5 && trees < used * B.FORESTRY_YEARS) {
      const tech = v.culture.belief === 'a Floresta' ? 0 : B.FORESTRY_TECH;
      if (v.tech >= tech) {
        v.forestry = true;
        this.note(`${v.name} passou a replantar a mata: as árvores por perto estavam acabando`, 'economia', v, { key: `forestry-${v.id}` });
      }
    }
    if (before > 0 && trees === 0) this.note(`Acabou a mata em volta de ${v.name}: não há mais árvore para cortar ao alcance`, 'economia', v, { key: `deforest-${v.id}` });
  },

  /** Casas vazias na crise e ocupadas de novo na melhora (RF-VIDA-254). */
  neglect(this: Ecosystem, v: Village): void {
    const w = v.needs ? welfare(v.needs) : 1;
    const homes = v.houses.filter((h) => h.kind === 'house');
    if (w < 0.5 && homes.length > 3 && happens(this.civRnd, B.CRISIS_EMPTY_RATE, 1)) {
      // A casa mais longe do centro fica vazia primeiro.
      let far: Building | null = null;
      let fd = -1;
      for (const h of homes) {
        if (h.empty) continue;
        const d = Math.hypot(wrapDx(h.x + 1 - v.x, this.map.width), h.y + 1 - v.y);
        if (d > fd) {
          fd = d;
          far = h;
        }
      }
      if (far && homes.filter((h) => h.empty).length < homes.length / 3) {
        far.empty = true;
        this.note(`Casas ficaram vazias em ${v.name}`, 'economia', v, { key: `empty-${v.id}` });
      }
    } else if (w >= 0.7 && happens(this.civRnd, B.CRISIS_REFILL_RATE, 1)) {
      const h = homes.find((o) => o.empty && (o.wear ?? 0) < B.DECAY_YEARS);
      if (h) h.empty = false;
    }
  },

  /** Tiles do lote livre (casas: do centro para fora; plantações: de fora para dentro). */
  freeLot(this: Ecosystem, v: Village, fromEdge = false): number[] | null {
    // Plano novo (RF-AS-11 e 16): casas pelo valor do solo; roças e cercados no anel de fora.
    // A busca olha centenas de lotes: o resultado vale por um tempo, enquanto os tiles continuam livres.
    const key = v.id * 2 + (fromEdge ? 1 : 0);
    const hit = this.lotCache.get(key);
    const free = (t: number) => !this.built[t] && (fromEdge ? !this.road[t] : !this.road[t] || this.road[t] === 4);
    if (hit && this.year < hit.until && (hit.tiles === null || hit.tiles.every(free))) return hit.tiles;
    const tiles = fromEdge ? this.fieldLot(v) : this.bestLot(v);
    this.lotCache.set(key, { tiles, until: this.year + (tiles ? 0.5 : 1) });
    return tiles;
  },

  /** Motivo para uma colônia agora, ou null (RF-AS-03). */
  colonyMotive(this: Ecosystem, v: Village, crowded: boolean): ColonyMotive | null {
    if (crowded) return 'espaço';
    if ((v.fedShare ?? 1) < 0.85 && !this.freeLot(v, true)) return 'terra';
    if (v.tech >= 0.5 && this.wanted(v).length) {
      const reach = this.radius(v) + B.COLONY_REACH;
      for (const d of this.deposits) {
        if (d.mine >= 0 || d.amount <= 0) continue;
        const dist = this.distance(v, d.x + 0.5, d.y + 0.5);
        if (dist > this.radius(v) + 25 && dist < reach) return 'jazida';
      }
    }
    if (v.culture.value === 'comércio' && v.port < 0 && v.tech >= 1 && !this.coastal(v)) return 'porto';
    return null;
  },

  /** Constrói uma casa (ou construção especial) no lote livre mais perto do centro. */
  buildHouse(this: Ecosystem, v: Village, kind: BuildingKind = 'house', free = false): boolean {
    const tiles = this.freeLot(v);
    if (!tiles || (!free && !this.pay(v, kind))) return false;
    const w = this.map.width;
    // Casa sobre roça (o núcleo cresceu até ela): a roça sai e o anel de roças anda para fora (RF-AS-16).
    if (tiles.some((t) => this.road[t] === 4)) this.dropFieldAt(v, tiles.find((t) => this.road[t] === 4)!);
    for (const t of tiles) {
      this.built[t] = 1;
      this.onTileChanged(t);
    }
    v.foot = undefined;
    this.layAccess(v, tiles[0] % w, Math.floor(tiles[0] / w));
    const built: Building = { x: tiles[0] % w, y: Math.floor(tiles[0] / w), kind, variant: Math.floor(this.civRnd() * 4), era: Math.floor(v.tech) };
    // A casa dos fundadores sai pronta; as demais viram obra e só os construtores no lugar a terminam (seção 19.21).
    if (!free) this.startWork(built, B.WORK_YEARS / 2, true);
    v.houses.push(built);
    if (kind === 'wonder') this.note(`${v.name} ergueu a ${WONDER_NAMES[v.culture.value]}, orgulho do povo ${v.culture.name}`, 'povo', v, { major: true });
    else if (kind === 'statue') this.note(`${v.name} ergueu uma estátua do seu líder`, 'povo', v);
    else if (kind !== 'house') this.note(`${v.name} construiu ${kind === 'smithy' || kind === 'factory' ? 'uma' : 'um'} ${BUILDING_NAMES[kind].toLowerCase()}`, 'economia', v);
    return true;
  },

  /** Casa que ainda pode ganhar um andar nesta era, a mais perto do centro. */
  reformable(this: Ecosystem, v: Village): Building | null {
    const max = this.maxLevel(v);
    let best: Building | null = null;
    let bd = Infinity;
    for (const h of v.houses) {
      if (h.kind !== 'house' || (h.level ?? 0) >= max || this.underWork(h)) continue;
      const d = Math.hypot(wrapDx(h.x + 1 - v.x, this.map.width), h.y + 1 - v.y);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    return best;
  },

  /** Reforma (RF-VIDA-203): a casa ganha um andar e fica com andaime por um tempo. */
  reform(this: Ecosystem, v: Village): boolean {
    const h = this.reformable(v);
    if (!h || !this.pay(v, 'reform')) return false;
    h.level = (h.level ?? 0) + 1;
    this.startWork(h, B.WORK_YEARS, false);
    this.note(`${v.name} está reformando casas`, 'povo', v, { key: `reform-${v.id}` });
    return true;
  },

  /** Próxima construção especial que o assentamento pode erguer, se houver. */
  nextBuilding(this: Ecosystem, v: Village): BuildingKind | null {
    const ctx = this.buildContext(v);
    // O prédio característico da vocação vem primeiro (RF-VIDA-221).
    const own = v.vocation ? VOCATION_BUILDING[v.vocation] : '';
    if (own && own !== 'port' && canBuild(own as (typeof BUILDINGS)[number], ctx) && !this.has(v, own as BuildingKind, true)) return own as BuildingKind;
    for (const b of BUILDINGS) if (canBuild(b, ctx) && !this.has(v, b, true)) return b;
    return null;
  },

  /** Plantação na borda da área: tiles de lavoura com trigo. */
  plantField(this: Ecosystem, v: Village): boolean {
    const tiles = this.freeLot(v, true);
    if (!tiles) return false;
    for (const t of tiles) {
      this.road[t] = 4;
      this.onTileChanged(t);
    }
    v.fields++;
    return true;
  },

  /** Larga a roça mais longe do centro: os tiles de lavoura voltam a ser campo. */
  dropField(this: Ecosystem, v: Village): void {
    const r = Math.ceil(this.radius(v)) + 1;
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    let best = -1;
    let bd = -1;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = dx * dx + dy * dy;
        if (d > r * r || d <= bd) continue;
        const t = this.tileAt(cx + dx, cy + dy);
        if (t < 0 || this.road[t] !== 4) continue;
        const o = this.settlementAt(cx + dx + 0.5, cy + dy + 0.5);
        if (o && o !== v) continue;
        best = t;
        bd = d;
      }
    }
    v.fields--;
    if (best < 0) return;
    // A roça é um lote 2x2: some o tile e os vizinhos de lavoura, até quatro.
    const w = this.map.width;
    const queue = [best];
    for (let n = 0; queue.length && n < 4; n++) {
      const t = queue.shift()!;
      if (this.road[t] !== 4) continue;
      this.road[t] = 0;
      this.onTileChanged(t);
      const x = t % w;
      const y = Math.floor(t / w);
      for (const [ox, oy] of NEIGHBORS4) {
        const u = this.tileAt(x + ox, y + oy);
        if (u >= 0 && this.road[u] === 4) queue.push(u);
      }
    }
  },

  /** Tira a roça que tem o tile `t` (até 4 tiles de lavoura ligados). */
  dropFieldAt(this: Ecosystem, v: Village, t0: number): void {
    const w = this.map.width;
    const queue = [t0];
    for (let n = 0; queue.length && n < 4; n++) {
      const t = queue.shift()!;
      if (this.road[t] !== 4) continue;
      this.road[t] = 0;
      this.onTileChanged(t);
      const x = t % w;
      const y = Math.floor(t / w);
      for (const [ox, oy] of NEIGHBORS4) {
        const u = this.tileAt(x + ox, y + oy);
        if (u >= 0 && this.road[u] === 4) queue.push(u);
      }
    }
    v.fields = Math.max(0, v.fields - 1);
  },
};
export type BuildingsPart = typeof buildingsPart;
