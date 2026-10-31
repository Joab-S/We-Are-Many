/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): forma do assentamento: lotes, acessos, praça, casas das famílias, muralha e nível.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { Decor, decorAt, isTree } from '../../../procgen/surface';
import { ROLE } from '../../roles';
import { belowTier, tierAllowed } from '../../community';
import { isStreet, TRAIL, WALL } from '../../architecture';
import { TIER_NAMES, wrapDx } from '../../settlement';
import type { Building, Village } from '../types';
import * as tilesModule from '../tiles';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { isLand } = tilesModule;

export const formPart = {
  /**
   * Melhor lote 2x2 para uma casa pelo valor do solo (RF-AS-11 e 12): perto da praça pelo caminho, com
   * frente para a rua, água e vizinhos; no núcleo as casas podem encostar, na periferia ficam com folga.
   */
  bestLot(this: Ecosystem, v: Village): number[] | null {
    const foot = this.footprint(v);
    const reach = Math.ceil(foot + B.LOT_REACH);
    const core = Math.max(3.5, foot * B.CORE_SHARE);
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    const map = this.map;
    const near = this.villages.filter((o) => o !== v && !o.abandoned && this.distance(o, v.x, v.y) < reach + this.footprint(o) + 4);
    let best: number[] | null = null;
    let bv = -Infinity;
    const tiles = [0, 0, 0, 0];
    for (let oy = -reach; oy <= reach; oy++) {
      for (let ox = -reach; ox <= reach; ox++) {
        const lx = cx + ox;
        const ly = cy + oy;
        const d = this.distance(v, lx + 1, ly + 1);
        if (d > reach || d < 2.4) continue;
        let ok = true;
        let field = 0;
        let water = false;
        for (let k = 0; k < 4 && ok; k++) {
          const t = this.tileAt(lx + (k & 1), ly + (k >> 1));
          tiles[k] = t;
          if (t < 0 || !isLand(map, t) || this.built[t] || this.depositAt[t] >= 0 || this.wall[t] || !this.flat(t)) ok = false;
          else if (this.road[t] === 4) field++;
          else if (this.road[t]) ok = false;
          else if (!water && this.nearWater(t)) water = true;
        }
        if (!ok) continue;
        if (near.some((o) => this.distance(o, lx + 1, ly + 1) < this.footprint(o))) continue;
        // Anel em volta do lote: casas vizinhas e rua na frente.
        let neighbors = 0;
        let front = false;
        let street = false;
        for (let ry = -1; ry <= 2; ry++) {
          for (let rx = -1; rx <= 2; rx++) {
            if (rx >= 0 && rx <= 1 && ry >= 0 && ry <= 1) continue;
            const t = this.tileAt(lx + rx, ly + ry);
            if (t < 0) continue;
            if (this.built[t]) neighbors++;
            if (isStreet(this.road[t]) && (rx === -1 || rx === 2) !== (ry === -1 || ry === 2)) front = true;
          }
        }
        if (d > core && neighbors > 0) continue;
        if (!front) {
          for (let ry = -2; ry <= 3 && !street; ry++) {
            for (let rx = -2; rx <= 3 && !street; rx++) {
              const t = this.tileAt(lx + rx, ly + ry);
              if (t >= 0 && isStreet(this.road[t])) street = true;
            }
          }
          if (!street) continue;
        }
        const value =
          -B.LAND_DIST * d +
          B.LAND_CLUSTER * Math.min(neighbors, 6) +
          (front ? B.LAND_FRONT : 0) +
          (water ? B.LAND_WATER : 0) -
          1.5 * field +
          ((Math.imul(lx * 73856093 + ly, 19349663) >>> 0) % 100) * 0.001;
        if (value > bv) {
          bv = value;
          best = [...tiles];
        }
      }
    }
    return best;
  },

  /** Lote 2x2 para roça ou cercado (RF-AS-16): no anel logo fora das casas, encostado nas outras roças. */
  fieldLot(this: Ecosystem, v: Village, kind: 4 | 5 = 4): number[] | null {
    const foot = this.footprint(v);
    const reach = Math.ceil(foot + B.FIELD_RING + (kind === 5 ? 3 : 0));
    const inner = foot - 0.5 + (kind === 5 ? 2 : 0);
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    const map = this.map;
    const near = this.villages.filter((o) => o !== v && !o.abandoned && this.distance(o, v.x, v.y) < reach + this.footprint(o) + 4);
    let best: number[] | null = null;
    let bv = -Infinity;
    for (let oy = -reach; oy <= reach; oy++) {
      for (let ox = -reach; ox <= reach; ox++) {
        const lx = cx + ox;
        const ly = cy + oy;
        const d = this.distance(v, lx + 1, ly + 1);
        if (d > reach || d < inner) continue;
        const tiles: number[] = [];
        let veg = 0;
        for (let k = 0; k < 4; k++) {
          const t = this.tileAt(lx + (k & 1), ly + (k >> 1));
          if (t < 0 || !isLand(map, t) || this.road[t] || this.built[t] || this.depositAt[t] >= 0 || this.wall[t]) break;
          tiles.push(t);
          veg += map.vegetation[t];
        }
        if (tiles.length < 4) continue;
        if (near.some((o) => this.distance(o, lx + 1, ly + 1) < this.footprint(o) + 1)) continue;
        // Faixas: encostar em roça (ou cercado) do mesmo tipo e numa trilha vale mais.
        let strip = 0;
        let trail = false;
        for (let ry = -1; ry <= 2; ry++) {
          for (let rx = -1; rx <= 2; rx++) {
            if (rx >= 0 && rx <= 1 && ry >= 0 && ry <= 1) continue;
            const t = this.tileAt(lx + rx, ly + ry);
            if (t < 0) continue;
            if (this.road[t] === kind) strip++;
            if (isStreet(this.road[t])) trail = true;
            if (this.built[t]) strip -= 0.5;
          }
        }
        const value = -0.6 * Math.abs(d - (inner + 2)) + 0.5 * Math.min(strip, 4) + (trail ? 0.8 : 0) + veg * 0.6;
        if (value > bv) {
          bv = value;
          best = tiles;
        }
      }
    }
    return best;
  },

  /**
   * Caminho de acesso (RF-AS-13): da casa nova até a rede mais perto, por tiles livres, pintado como
   * trilha. Sem rede ao alcance, o caminho vai até a praça (que sempre existe).
   */
  layAccess(this: Ecosystem, v: Village, x: number, y: number, reach = B.ACCESS_REACH): void {
    const map = this.map;
    const w = map.width;
    const start: number[] = [];
    for (let ry = -1; ry <= 2; ry++) {
      for (let rx = -1; rx <= 2; rx++) {
        const corner = (rx === -1 || rx === 2) && (ry === -1 || ry === 2);
        if (corner || (rx >= 0 && rx <= 1 && ry >= 0 && ry <= 1)) continue;
        const t = this.tileAt(x + rx, y + ry);
        if (t < 0) continue;
        if (isStreet(this.road[t])) return;
        if (isLand(map, t) && !this.built[t] && !this.road[t] && this.depositAt[t] < 0) start.push(t);
      }
    }
    const prev = new Map<number, number>();
    const dist = new Map<number, number>();
    let queue = start;
    for (const t of start) {
      prev.set(t, -1);
      dist.set(t, 0);
    }
    let goal = -1;
    for (let step = 0; step < reach * 2 && queue.length && goal < 0; step++) {
      const next: number[] = [];
      for (const t of queue) {
        const tx = t % w;
        const ty = (t - tx) / w;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = this.tileAt(tx + ox, ty + oy);
          if (n < 0 || prev.has(n)) continue;
          if (isStreet(this.road[n])) {
            prev.set(n, t);
            goal = n;
            break;
          }
          if (!isLand(map, n) || this.built[n] || this.road[n] || this.depositAt[n] >= 0 || this.wall[n]) continue;
          prev.set(n, t);
          dist.set(n, (dist.get(t) ?? 0) + 1);
          next.push(n);
        }
        if (goal >= 0) break;
      }
      queue = next;
    }
    if (goal < 0) return;
    const laid: number[] = [];
    for (let t = prev.get(goal)!; t >= 0; t = prev.get(t)!) {
      if (!this.road[t]) {
        this.road[t] = TRAIL;
        this.roadDirty.push(t);
        this.onTileChanged(t);
        laid.push(t);
      }
    }
    if (laid.length) this.pruneRoads(laid);
    void v;
  },

  /** Praça do assentamento: 3x3 tiles no centro (RF-VIDA-100). As ruas nascem depois, do uso (RF-AS-13). */
  layPlaza(this: Ecosystem, v: Village): void {
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const t = this.tileAt(cx + dx, cy + dy);
        if (t >= 0 && isLand(this.map, t) && !this.built[t]) {
          this.road[t] = 3;
          this.onTileChanged(t);
        }
      }
    }
    v.streetLen = 0;
    v.streetPlan = 0;
    v.lots = [];
  },

  /**
   * Casa por família (RF-AS-17): uma vez por ano cada família ganha uma casa (a do líder, a melhor e mais
   * perto da praça; os agricultores preferem os sítios). Casa sem família por IDLE_HOUSE_YEARS anos fica
   * vazia e começa a cair; com o dobro, desaba.
   */
  assignHomes(this: Ecosystem, v: Village, families: Map<number, number[]> | undefined): void {
    const w = this.map.width;
    const era = Math.floor(v.tech);
    const homes = v.houses.filter((h) => h.kind === 'house' && !h.site);
    const room = new Map<Building, number>();
    for (const h of homes) room.set(h, 4 + era + (h.level ?? 0) * B.LEVEL_HOUSING);
    const byCenter = [...homes].sort((p, q) => this.distance(v, p.x + 1, p.y + 1) - this.distance(v, q.x + 1, q.y + 1));
    const used = new Set<Building>();
    const fams = [...(families?.entries() ?? [])].sort((p, q) => (q[1].includes(v.leader) ? 1 : 0) - (p[1].includes(v.leader) ? 1 : 0) || q[1].length - p[1].length);
    for (const [key, members] of fams) {
      const farmer = members.some((i) => this.role[i] === ROLE.farmer || this.role[i] === ROLE.shepherd);
      const order = farmer ? [...byCenter.filter((h) => h.farm), ...byCenter.filter((h) => !h.farm)] : byCenter.filter((h) => !h.farm).concat(byCenter.filter((h) => h.farm));
      let pick: Building | null = null;
      for (const h of order) {
        const left = room.get(h)!;
        if (left >= members.length || (left > 0 && !pick)) {
          pick = h;
          if (left >= members.length) break;
        }
      }
      if (!pick) {
        for (const i of members) this.home[i] = -1;
        continue;
      }
      room.set(pick, room.get(pick)! - members.length);
      if (!used.has(pick)) pick.owner = key;
      used.add(pick);
      const tile = pick.y * w + pick.x;
      for (const i of members) this.home[i] = tile;
    }
    for (const h of homes) {
      if (used.has(h)) {
        h.idle = 0;
        continue;
      }
      h.owner = undefined;
      h.idle = (h.idle ?? 0) + 1;
      if (h.idle >= B.IDLE_HOUSE_YEARS) h.empty = true;
      if (h.idle >= B.IDLE_HOUSE_YEARS * 2 && homes.length > 2) {
        const at = v.houses.indexOf(h);
        if (at >= 0) {
          this.raze(v, at);
          this.note(`Uma casa abandonada caiu em ${v.name}`, 'povo', v, { key: `idle-${v.id}` });
        }
      }
    }
  },

  /** Núcleo sem árvore nativa (RF-AS-12): de vila em diante, as árvores entre as casas viram lenha. */
  clearCore(this: Ecosystem, v: Village): void {
    if (v.tier < 1) return;
    const map = this.map;
    const r = Math.ceil(this.footprint(v) * B.CORE_SHARE + 1);
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const t = this.tileAt(cx + dx, cy + dy);
        if (t < 0 || this.road[t] || this.built[t] || !isLand(map, t)) continue;
        const decor = decorAt(map, t);
        if (!isTree(decor) && decor !== Decor.Stump && decor !== Decor.Sapling) continue;
        if (isTree(decor)) {
          this.put(v, 'wood', B.WOOD_PER_TREE);
          this.treesCut++;
        } else {
          map.felled![t] = 0;
          this.stumps.delete(t);
        }
        map.bare ??= new Uint8Array(map.width * map.height);
        map.bare[t] = 1;
        this.onTileChanged(t);
      }
    }
  },

  /**
   * Muralha que segue a pegada (RF-AS-18): paliçada de madeira na vila (Bronze em diante) e muralha de
   * pedra na cidade (Ferro em diante), contornando as casas do núcleo, com portão onde a rua cruza.
   * Quem constrói fora dela forma o subúrbio; a metrópole ergue um segundo anel quando ele enche.
   */
  updateWall(this: Ecosystem, v: Village): void {
    const era = Math.floor(v.tech);
    if (v.tier < 1 || era < 1) return;
    if (v.wallAt !== undefined && this.year - v.wallAt < B.WALL_REVIEW_YEARS) return;
    v.wallAt = this.year;
    const stone = v.tier >= 2 && era >= 2;
    const N = 64;
    const radii = new Float32Array(N);
    const inner = v.houses.filter((h) => !h.farm && h.kind !== 'port');
    const old = v.walls ?? [];
    // Casas fora do anel atual: o subúrbio. A metrópole cerca o subúrbio cheio com um segundo anel.
    const ringed = old.length > 0;
    if (ringed) {
      const outside = inner.filter((h) => !this.insideWall(v, h.x + 1, h.y + 1)).length;
      if (v.tier < 3 || outside < inner.length * 0.3) {
        if (stone && old.some((t) => this.wall[t] === WALL.palisade)) {
          if (!this.payWall(v, old.length, true)) return;
          for (const t of old) if (this.wall[t] === WALL.palisade) this.wall[t] = WALL.stone;
          for (const t of old) this.onTileChanged(t);
          this.note(`${v.name} trocou a paliçada por uma muralha de pedra`, 'povo', v, { major: true });
        }
        return;
      }
    }
    for (const h of inner) {
      const dx = wrapDx(h.x + 1 - v.x, this.map.width);
      const dy = h.y + 1 - v.y;
      const k = Math.floor(((Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1) * N) % N;
      radii[k] = Math.max(radii[k], Math.hypot(dx, dy) + 1.5);
    }
    const ring = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      let m = 0;
      for (let d = -3; d <= 3; d++) m = Math.max(m, radii[(k + d + N) % N]);
      ring[k] = Math.max(3, m) + B.WALL_PAD;
    }
    const R = Math.ceil(Math.max(...ring)) + 1;
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    const tiles: number[] = [];
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const t = this.tileAt(cx + dx, cy + dy);
        if (t < 0 || !isLand(this.map, t) || this.built[t] || this.wall[t]) continue;
        const ax = cx + dx + 0.5 - v.x;
        const ay = cy + dy + 0.5 - v.y;
        const k = Math.floor(((Math.atan2(ay, ax) / (Math.PI * 2) + 1) % 1) * N) % N;
        const d = Math.hypot(ax, ay);
        if (d < ring[k] || d >= ring[k] + 1) continue;
        if (this.road[t] === 4 || this.road[t] === 5 || this.road[t] === 3) continue;
        tiles.push(t);
      }
    }
    if (tiles.length < 8 || !this.payWall(v, tiles.length, stone)) return;
    for (const t of tiles) {
      this.wall[t] = isStreet(this.road[t]) ? WALL.gate : stone ? WALL.stone : WALL.palisade;
      this.onTileChanged(t);
    }
    v.walls = [...old, ...tiles];
    this.note(
      ringed ? `${v.name} cercou o subúrbio com um segundo anel de muralha` : stone ? `${v.name} ergueu uma muralha de pedra com portões` : `${v.name} se cercou com uma paliçada`,
      'povo',
      v,
      { major: v.tier >= 2 },
    );
  },

  /** O ponto está do lado de dentro da muralha de `v` (sem muralha, tudo é dentro). */
  insideWall(this: Ecosystem, v: Village, x: number, y: number): boolean {
    if (!v.walls?.length) return true;
    const dx = wrapDx(x - v.x, this.map.width);
    const dy = y - v.y;
    const d = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    let wall = Infinity;
    const w = this.map.width;
    for (const t of v.walls) {
      const tx = wrapDx((t % w) + 0.5 - v.x, w);
      const ty = Math.floor(t / w) + 0.5 - v.y;
      let da = Math.abs(Math.atan2(ty, tx) - a);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (da < 0.12) wall = Math.min(wall, Math.hypot(tx, ty));
    }
    return d < wall;
  },

  /** Paga a muralha do estoque: madeira na paliçada, pedra na muralha. */
  payWall(this: Ecosystem, v: Village, tiles: number, stone: boolean): boolean {
    const st = this.store(v);
    if (stone) {
      const need = tiles * B.WALL_STONE;
      if (st.stone < need) return false;
      this.spend(v, 'stone', need);
    } else {
      const need = tiles * B.WALL_WOOD;
      if (st.wood < need) return false;
      this.spend(v, 'wood', need);
    }
    return true;
  },

  /** Tira a muralha de um assentamento (abandono ou fusão). */
  dropWall(this: Ecosystem, v: Village): void {
    for (const t of v.walls ?? []) {
      this.wall[t] = 0;
      this.onTileChanged(t);
    }
    v.walls = undefined;
  },

  /**
   * Degrau por população e funções (RF-AS seção 4): sobe um degrau quando a gente e as funções
   * permitem; desce quando fica abaixo do que o degrau pede por TIER_DOWN_YEARS anos.
   */
  updateTier(this: Ecosystem, v: Village, yearly: boolean): void {
    const check = this.tierCheck(v);
    const target = tierAllowed(check);
    if (target > v.tier) {
      v.tier++;
      v.lowYears = 0;
      if (v.tier >= 1) this.rankStreets(v);
      this.note(`${v.name} virou ${TIER_NAMES[v.tier].toLowerCase()}`, 'povo', v, { major: v.tier >= 2 });
      this.emit({ kind: 'tierUp', year: this.year, village: v.id, tier: v.tier });
      return;
    }
    if (!yearly) return;
    if (belowTier(v.tier, check)) {
      v.lowYears = (v.lowYears ?? 0) + 1;
      if (v.lowYears >= B.TIER_DOWN_YEARS) {
        v.tier--;
        v.lowYears = 0;
        this.tally.tierDowns++;
        this.note(`${v.name} encolheu e voltou a ser ${TIER_NAMES[v.tier].toLowerCase()}`, 'povo', v, { major: v.tier >= 1 });
        this.emit({ kind: 'tierDown', year: this.year, village: v.id, tier: v.tier });
      }
    } else v.lowYears = 0;
  },

  /**
   * Um ano do plano novo dos assentamentos (seção 20): colônias que partem, casas por família, núcleo
   * sem árvore, muralhas, sítios que se emancipam, degraus que sobem ou descem, fusões e política.
   */
  communityYear(this: Ecosystem): void {
    const families = this.familyGroups();
    for (const v of this.villages) {
      if (v.abandoned || v.population <= 0) continue;
      // O que ficou no pátio vai ao celeiro de carroça na virada do ano (RF-AS-23 e 24).
      this.flushYard(v);
      // Festa da colheita na virada do ano, quando houve comida (RF-AS-28).
      if (v.population >= 8 && (v.needs?.food ?? 1) >= B.FESTIVAL_FED) {
        v.festivalUntil = this.year + B.FESTIVAL_SPAN;
        this.tally.festivals++;
        // Evento compartilhado (RF-AS-47): os vizinhos amigos vêm à festa e todos se aproximam.
        let guests = 0;
        for (const o of this.villages) {
          if (guests >= 2 || o === v || o.abandoned || o.species !== v.species || this.distance(o, v.x, v.y) > B.VISIT_RANGE || this.affinity(v.id, o.id) < 20) continue;
          this.addAffinity(v.id, o.id, B.AFFINITY_FEAST);
          guests++;
        }
      }
      if (v.colony && this.year >= v.colony.until) this.departColony(v, families.get(v.id));
      this.assignHomes(v, families.get(v.id));
      this.clearCore(v);
      this.updateWall(v);
      this.freeFarmsteads(v);
      this.updateTier(v, true);
    }
    this.mergeVillages();
    this.updatePolities();
  },
};
export type FormPart = typeof formPart;
