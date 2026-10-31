/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): colônias por terra, batedores, comboios, refúgio e sítios rurais.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { happens } from '../../stochastic';
import { type Biome, isRockyBiome } from '../../../procgen/surface';
import { CHILD, ROLE } from '../../roles';
import { TRAIT, TRAIT_COUNT } from '../../../ai/traits';
import { partnerOf } from '../../../ai/relations';
import { MOTIVE_TEXT, siteValue, spacingFor, type ColonyMotive, type SiteLook } from '../../community';
import { isStreet } from '../../architecture';
import { cartOf, packAnimal, type Cargo } from '../../trade';
import { emptyVital } from '../../people';
import { TIER_RADIUS, wrapDx } from '../../settlement';
import type { Building, FoundCause, Village } from '../types';
import * as helpersModule from '../helpers';
import * as tilesModule from '../tiles';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { elderAge } = helpersModule;
const { isWater, isLand } = tilesModule;

export const coloniesPart = {
  /**
   * Funda um assentamento por terra perto de `v`, sem atravessar água, com famílias inteiras (o casal e os
   * filhos, nunca o líder): as mais dispostas primeiro, até LONE_GROUP_MIN pessoas. Sem gente bastante que
   * queira ir, ninguém parte (antes saíam até 6 adultos pela ordem do array, separando casais e deixando
   * as crianças). Retorna se conseguiu.
   */
  colonizeByLand(this: Ecosystem, v: Village, families?: Map<number, number[]>): boolean {
    const { group } = this.departingFamilies(v, families, B.LONE_GROUP_MIN, B.LONE_GROUP_MIN * 2);
    if (group.length < B.LONE_GROUP_MIN) return false;
    const map = this.map;
    for (let t = 0; t < 12; t++) {
      const a = this.civRnd() * Math.PI * 2;
      const d = this.radius(v) + TIER_RADIUS[0] + 2 + this.civRnd() * 22;
      const nx = Math.floor(v.x + Math.cos(a) * d);
      const ny = Math.floor(v.y + Math.sin(a) * d);
      if (ny < 2 || ny >= map.height - 2) continue;
      const tx = ((nx % map.width) + map.width) % map.width;
      const tile = ny * map.width + tx;
      if (!this.habitable(v.species, tile) || map.vegetation[tile] < this.minFertility(v) || !this.canSettle(v.species, tx, ny, v.tech)) continue;
      if (!this.landPath(v.x, v.y, tx + 0.5, ny + 0.5)) continue;
      const nv = this.foundVillage(v.species, tx, ny, 0, v, 'família');
      for (const i of group) {
        this.setVillage(i, nv.id);
        this.movedAt[i] = this.year;
        this.home[i] = -1;
        v.population--;
        nv.population++;
        (v.vitalNow ??= emptyVital()).left++;
        (nv.vitalNow ??= emptyVital()).arrived++;
      }
      this.tally.foundFamine++;
      this.note(`Colonos de ${v.name} fundaram ${nv.name}`, 'povo', nv);
      this.emit({ kind: 'colony', year: this.year, phase: 'depart', from: v.id, to: nv.id, people: group.length, by: 'land' });
      return true;
    }
    return false;
  },

  /**
   * Famílias inteiras de `v` que topam partir (agente 3B), da mais disposta para a menos: curiosas e ambiciosas,
   * pouco apegadas, com fome, e as da lista `keen` (que já escolheram fundar) bem antes. Junta até chegar a
   * `want` pessoas sem passar de `max` e sem tirar mais de 45% do povo; a família do líder fica.
   */
  departingFamilies(this: Ecosystem, v: Village, families: Map<number, number[]> | undefined, want: number, max: number, keen?: ReadonlySet<number>): { group: number[]; families: number } {
    if (!families) return { group: [], families: 0 };
    const t = (i: number, k: keyof typeof TRAIT) => this.traits[i * TRAIT_COUNT + TRAIT[k]] / 10;
    const chief = this.leaderOf(v);
    const fams = [...families.entries()]
      .filter(([, m]) => !m.includes(chief) && m.every((i) => this.alive[i] && this.village[i] === v.id))
      .map(([key, m]) => {
        const adults = m.filter((i) => this.role[i] !== CHILD);
        const will = adults.reduce((n, i) => n + t(i, 'curiosity') + t(i, 'ambition') - t(i, 'attachment') + (this.energy[i] < 0.4 ? 0.5 : 0), 0) / Math.max(1, adults.length);
        return { m, adults: adults.length, will: will + (keen?.has(key) ? B.FISSION_KEEN : 0) + (this.civRnd() - 0.5) * 0.6 };
      })
      .sort((p, q) => q.will - p.will);
    const group: number[] = [];
    let n = 0;
    for (const f of fams) {
      if (group.length >= want) break;
      if (!f.adults || group.length + f.m.length > max || v.population - group.length - f.m.length < v.population * 0.55) continue;
      group.push(...f.m);
      n++;
    }
    return { group, families: n };
  },

  /**
   * Lotado: mais gente do que as casas planejadas abrigam, sem lote livre nem casa para reformar. É o único
   * predicado de "lotado" (a colônia em `updateVillages` e as taxas do painel `?debug`). Quem chama e já tem
   * as contas do passo passa o lote livre que procurou (`lot`) e se falta casa (`needRoom`); sem elas, conta agora.
   */
  crowded(this: Ecosystem, v: Village, lot?: number[] | null, needRoom?: boolean): boolean {
    if (!(needRoom ?? v.population > this.housing(v, true) - 3)) return false;
    return !(lot === undefined ? this.freeLot(v) : lot) && !this.reformable(v);
  },

  // ---- Plano novo dos assentamentos: nascimento (seção 20, fase 1) ----

  /** Famílias de cada assentamento: cada adulto com os filhos crianças do mesmo lugar; o casal junto (chave: menor `uid`). */
  familyGroups(this: Ecosystem): Map<number, Map<number, number[]>> {
    const families = new Map<number, Map<number, number[]>>();
    // Cônjuge e pai pelo índice uid -> índice exato (só contam se moram no mesmo lugar, conferido abaixo).
    const head = (k: number) => {
      const mate = partnerOf(this.bonds, this.uid[k]);
      const m = mate ? this.findUid(mate) : -1;
      return m >= 0 && this.village[m] === this.village[k] ? Math.min(this.uid[k], mate) : this.uid[k];
    };
    // Varredura em ordem de índice (não por assentamento): a ordem dos lugares no mapa devolvido conta para quem o percorre.
    for (let i = 0; i < this.count; i++) {
      const vid = this.village[i];
      if (vid < 0 || !this.alive[i] || this.species[this.kind[i]].kind !== 'sapient') continue;
      const p = this.role[i] === CHILD && this.parent[i] ? this.findUid(this.parent[i]) : -1;
      const key = p >= 0 && this.village[p] === vid && this.role[p] !== CHILD ? head(p) : head(i);
      let fams = families.get(vid);
      if (!fams) families.set(vid, (fams = new Map()));
      const list = fams.get(key);
      if (list) list.push(i);
      else fams.set(key, [i]);
    }
    return families;
  },

  /** O que os batedores veem num sítio (RF-AS-04). */
  siteLook(this: Ecosystem, s: number, x: number, y: number, from: Village | null, motive: ColonyMotive): SiteLook {
    const map = this.map;
    const R = 8;
    let land = 0;
    let veg = 0;
    let trees = 0;
    let rock = 0;
    let level = 0;
    let water = 0;
    let road = 0;
    let elev = 0;
    let ore = 0;
    let near = 99;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        const t = this.tileAt(x + dx, y + dy);
        if (t < 0) continue;
        if (isWater(map, t)) {
          water++;
          near = Math.min(near, Math.hypot(dx, dy));
          continue;
        }
        land++;
        veg += map.vegetation[t];
        elev += map.elevation[t];
        if (this.standingTree(t)) trees++;
        if (isRockyBiome(map.biome[t] as Biome)) rock++;
        if (this.flat(t)) level++;
        if (isStreet(this.road[t])) road++;
        const d = this.depositAt[t];
        if (d >= 0 && this.deposits[d].mine < 0 && this.deposits[d].amount > 0) ore++;
      }
    }
    const center = this.tileAt(x, y);
    const fertile = land ? veg / land : 0;
    const coast = water > 0 && water < (land + water) * 0.6 ? 1 : 0;
    const fit = motive === 'terra' ? fertile : motive === 'jazida' ? (ore ? 1 : 0) : motive === 'porto' ? coast : 0.5;
    return {
      water: near <= 3 ? 1 : near <= 6 ? 0.5 : 0,
      fertile,
      forest: Math.min(1, trees / (land * 0.3 + 1)),
      rock: Math.min(1, rock / (land * 0.1 + 1)),
      flat: land ? level / land : 0,
      coast,
      ruin: this.ruinNear(x + 0.5, y + 0.5, 4, s) ? 1 : 0,
      defense: land && center >= 0 ? Math.max(0, Math.min(1, (map.elevation[center] - elev / land) * 20)) : 0,
      route: road > 0 ? 1 : 0,
      motive: fit,
      dist: from ? this.distance(from, x + 0.5, y + 0.5) : B.SITE_IDEAL_DIST,
    };
  },

  /** Sítios bons para um grupo de `v` fundar, os melhores primeiro (RF-AS-04). */
  scoutSites(this: Ecosystem, v: Village, motive: ColonyMotive, count: number): { x: number; y: number; value: number }[] {
    const map = this.map;
    const out: { x: number; y: number; value: number }[] = [];
    const base = spacingFor(v.tier) + this.footprint(v);
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2 + this.civRnd() * 0.2;
      const d = base + this.civRnd() * B.COLONY_REACH;
      const ny = Math.floor(v.y + Math.sin(a) * d);
      if (ny < 2 || ny >= map.height - 2) continue;
      const nx = ((Math.floor(v.x + Math.cos(a) * d) % map.width) + map.width) % map.width;
      const tile = ny * map.width + nx;
      if (!this.habitable(v.species, tile) || map.vegetation[tile] < this.minFertility(v) || !this.canSettle(v.species, nx, ny, v.tech)) continue;
      if (!this.landPath(v.x, v.y, nx + 0.5, ny + 0.5)) continue;
      if (out.some((o) => Math.hypot(wrapDx(o.x - nx, map.width), o.y - ny) < 6)) continue;
      out.push({ x: nx, y: ny, value: siteValue(this.siteLook(v.species, nx, ny, v, motive)) });
    }
    return out.sort((p, q) => q.value - p.value).slice(0, count);
  },

  /** Pode mandar um grupo agora: sem colônia em formação, com gente de sobra e passado o intervalo desde a última. */
  canSplit(this: Ecosystem, v: Village, motive: ColonyMotive = 'espaço'): boolean {
    // Com fome (motivo terra) basta ter gente para um grupo e sobrar o bastante na origem.
    const min = motive === 'terra' ? B.COLONY_GROUP_MIN * 2.5 : B.COLONY_SOURCE_POP;
    return !v.colony && v.population >= min && this.year - (v.colonyAt ?? -1e9) >= B.COLONY_COOLDOWN;
  },

  /**
   * Começa a juntar uma colônia em `v`: batedores saem para ver os sítios (RF-AS-03). Na fissão por pressão
   * (agente 3B) os sítios já vieram dos batedores e as famílias que escolheram fundar (`volunteers`) vão primeiro.
   */
  organizeColony(this: Ecosystem, v: Village, motive: ColonyMotive, found?: { x: number; y: number; value: number }[], volunteers?: number[], why?: FoundCause): boolean {
    if (!this.canSplit(v, motive)) return false;
    const sites = found ?? this.scoutSites(v, motive, B.COLONY_SCOUTS);
    if (!sites.length) return false;
    // Batedores: os adultos mais curiosos e corajosos, nunca o líder.
    const elder = elderAge(this.species[v.species], Math.floor(v.tech));
    const pool: { i: number; w: number }[] = [];
    const leader = this.leaderOf(v);
    for (const i of this.residents(v.id)) {
      if (!this.alive[i] || this.village[i] !== v.id || i === leader || this.role[i] === CHILD || this.age[i] >= elder || this.role[i] >= ROLE.soldier) continue;
      pool.push({ i, w: this.traits[i * TRAIT_COUNT + TRAIT.curiosity] + this.traits[i * TRAIT_COUNT + TRAIT.courage] + this.civRnd() * 4 });
    }
    pool.sort((p, q) => q.w - p.w);
    const scouts = pool.slice(0, 2).map((p) => this.uid[p.i]);
    // Por que sai: a pressão (social ou da terra) de quem escolheu fundar, o lugar lotado, a fome ou um recurso de fora.
    const cause: FoundCause = why ?? (volunteers?.length ? (motive === 'terra' ? 'terra' : 'pressão') : motive === 'espaço' ? 'pressão' : motive === 'terra' ? 'fome' : 'recurso');
    v.colony = { motive, sites, until: this.year + B.COLONY_SCOUT_YEARS, scouts, cause, volunteers };
    for (const p of pool.slice(0, 2)) this.logThought(p.i, 'mudança', `Saiu de batedor para ver ${sites.length} lugares para uma colônia (${MOTIVE_TEXT[motive]})`);
    this.note(`${v.name} mandou batedores procurar ${MOTIVE_TEXT[motive]} para uma colônia`, 'povo', v, { key: `scout-${v.id}` });
    return true;
  },

  /** Para onde o batedor `i` anda agora: um sítio por vez e depois de volta (deslocamento), ou null. */
  scoutTarget(this: Ecosystem, i: number, v: Village): { x: number; y: number } | null {
    const c = v.colony;
    if (!c || !c.scouts.includes(this.uid[i])) return null;
    const left = Math.max(0, Math.min(1, (c.until - this.year) / B.COLONY_SCOUT_YEARS));
    const k = Math.floor((1 - left) * (c.sites.length + 1));
    if (k >= c.sites.length) return null;
    const p = c.sites[k];
    return { x: wrapDx(p.x + 0.5 - this.x[i], this.map.width), y: p.y + 0.5 - this.y[i] };
  },

  /**
   * O grupo da colônia parte: escolhe o sítio, junta as famílias que querem ir e funda (RF-AS-03). Na fissão por
   * pressão (agente 3B) vão todas as famílias que escolheram fundar, até FISSION_SHARE do povo; nas outras, um
   * grupo de COLONY_GROUP_MIN pessoas. Sempre famílias inteiras, nunca a do líder.
   */
  departColony(this: Ecosystem, v: Village, families: Map<number, number[]> | undefined): void {
    const c = v.colony!;
    v.colony = undefined;
    v.colonyAt = this.year;
    const sites = c.sites
      .filter((p) => this.canSettle(v.species, p.x, p.y, v.tech))
      .map((p) => ({ ...p, value: p.value + (this.civRnd() - 0.5) * 0.4 }))
      .sort((p, q) => q.value - p.value);
    if (!sites.length || !families) {
      // Os sítios da fissão foram tomados antes da partida: o lugar continua apertado e sem para onde ir.
      if ((c.cause === 'pressão' || c.cause === 'terra') && c.volunteers?.length) this.cramp(v);
      this.note(`A colônia de ${v.name} desistiu: os lugares que os batedores viram já estavam tomados`, 'povo', v, { key: `colony-off-${v.id}` });
      return;
    }
    const site = sites[0];
    const t = (i: number, k: keyof typeof TRAIT) => this.traits[i * TRAIT_COUNT + TRAIT[k]] / 10;
    // Fissão: as famílias que escolheram fundar pela pressão (social ou da terra) saem juntas, e mais gente.
    const split = (c.cause === 'pressão' || c.cause === 'terra') && !!c.volunteers?.length;
    const fission = split && c.cause === 'pressão';
    const keen = new Set(c.volunteers ?? []);
    let want = B.COLONY_GROUP_MIN;
    let max = B.COLONY_GROUP_MAX;
    if (split) {
      max = Math.max(B.COLONY_GROUP_MAX, Math.round(v.population * B.FISSION_SHARE));
      let ready = 0;
      for (const key of keen) ready += families.get(key)?.length ?? 0;
      want = Math.min(max, Math.max(B.COLONY_GROUP_MIN, ready));
    }
    const origin = v.population;
    const { group, families: n } = this.departingFamilies(v, families, want, max, keen);
    if (group.length < B.COLONY_GROUP_MIN * 0.7) {
      this.note(`A colônia de ${v.name} não saiu: poucas famílias quiseram ir`, 'povo', v, { key: `colony-off-${v.id}` });
      return;
    }
    const nv = this.foundVillage(v.species, site.x, site.y, 0, v, 'colônia');
    // O enxoval vai numa carroça com o grupo (o que `foundVillage` separou da origem).
    const cargo: Cargo[] = [];
    if (nv.stock.wood >= 1) cargo.push({ good: 'wood', amount: Math.floor(nv.stock.wood) });
    if (nv.food >= 1) cargo.push({ good: 'food', amount: Math.floor(nv.food) });
    let leader = -1;
    for (const i of group) {
      this.setVillage(i, nv.id);
      this.movedAt[i] = this.year;
      this.home[i] = -1;
      v.population--;
      nv.population++;
      (v.vitalNow ??= emptyVital()).left++;
      (nv.vitalNow ??= emptyVital()).arrived++;
      this.logThought(i, 'mudança', `Partiu com a colônia para fundar ${nv.name} (${MOTIVE_TEXT[c.motive]})`);
      if (this.role[i] !== CHILD && (leader < 0 || t(i, 'charisma') > t(leader, 'charisma'))) leader = i;
    }
    if (leader >= 0) {
      nv.leader = leader;
      nv.leaderUid = this.uid[leader];
      this.role[leader] = ROLE.leader;
    }
    const path = this.roadPath(v.x, v.y, nv.x, nv.y);
    if (cargo.length && path && path.length > 1) {
      nv.stock.wood -= cargo.find((g) => g.good === 'wood')?.amount ?? 0;
      nv.food -= cargo.find((g) => g.good === 'food')?.amount ?? 0;
      const crew = group.find((i) => this.role[i] !== CHILD && i !== leader);
      if (crew === undefined || !this.launchConvoy(v, nv, 'settlers', path, cargo, crew)) {
        nv.stock.wood += cargo.find((g) => g.good === 'wood')?.amount ?? 0;
        nv.food += cargo.find((g) => g.good === 'food')?.amount ?? 0;
      }
    }
    this.tally.colonies++;
    const cause = c.cause ?? (c.motive === 'terra' ? 'fome' : c.motive === 'espaço' ? 'pressão' : 'recurso');
    if (cause === 'pressão') this.tally.foundPressure++;
    else if (cause === 'terra') this.tally.foundLand++;
    else if (cause === 'fome') this.tally.foundFamine++;
    else this.tally.foundResource++;
    this.emit({ kind: 'colony', year: this.year, phase: 'depart', from: v.id, to: nv.id, people: group.length, by: 'land' });
    if (fission) {
      // Fissão (agente 3B): o lugar ficou grande demais para as instituições que tem e se dividiu.
      this.tally.fissions++;
      this.tally.fissionPop += origin;
      this.emit({ kind: 'fission', year: this.year, from: v.id, to: nv.id, people: group.length, population: origin, pressure: v.pressure ?? 0 });
      this.note(`${v.name} cresceu demais e se dividiu: ${n} famílias partiram e fundaram ${nv.name}`, 'povo', nv, { major: v.tier >= 1 });
    } else this.note(`${n} famílias de ${v.name} partiram atrás de ${MOTIVE_TEXT[c.motive]} e fundaram ${nv.name}`, 'povo', nv, { major: v.tier >= 1 });
  },

  /**
   * Comboio que não é comércio (RF-AS-03, 42 e 45): enxoval de colonos, ajuda a um vizinho com fome
   * ou visita a parentes. Quem vai é a pessoa `i`, que sai do mapa e volta (ou chega) com a carroça.
   */
  launchConvoy(this: Ecosystem, v: Village, o: Village, kind: 'settlers' | 'aid' | 'visit', path: number[], cargo: Cargo[], i: number): boolean {
    if (i < 0 || !this.alive[i]) return false;
    const era = Math.floor(v.tech);
    const w = this.map.width;
    const walker = kind === 'visit';
    const animal = packAnimal(v.material === 'adobe' || v.herd?.kind === 'camel', v.stock.horses);
    if (kind === 'settlers') {
      // Quem leva o enxoval já mora no lugar novo.
      this.setVillage(i, o.id);
    }
    this.caravans.push({
      id: this.nextCaravan++,
      kind,
      home: kind === 'settlers' ? o.id : v.id,
      target: o.id,
      path,
      step: 0,
      x: (path[0] % w) + 0.5,
      y: Math.floor(path[0] / w) + 0.5,
      facing: 1,
      back: kind === 'settlers',
      animal,
      animals: walker ? 0 : 1,
      cart: walker ? 0 : cartOf(era),
      cargo,
      purse: 0,
      crew: this.embark(i),
      speed: B.CARAVAN_SPEED * (walker ? 0.8 : 1),
      wait: 0,
      tolls: [],
      era,
    });
    return true;
  },

  /**
   * Família sem lugar melhor conhecido (RF-AS-01): sítio, refúgio num lugar do povo, colônia atrás de terra e,
   * só longe de tudo, um grupo de famílias para longe. A fome manda primeiro para um lugar que já existe:
   * fundar é o último recurso (agente 3B; antes a colônia vinha antes do refúgio).
   */
  exodusWithoutPlace(this: Ecosystem, v: Village, families: Map<number, number[]> | undefined): void {
    const why = this.lackName(v);
    v.want = 0;
    // O sítio rural não tira ninguém do lugar: é mais roça, e não conta como êxodo.
    if (why === 'comida' && this.openFarmstead(v)) return;
    // Só é êxodo quando alguém sai (antes contavam também os anos em que ninguém achou para onde ir).
    const exodus = () => {
      this.tally.exodus++;
      if (why === 'lenha') this.tally.exodusFuel++;
      this.emit({ kind: 'exodus', year: this.year, village: v.id, lack: why });
    };
    if (families && this.seekRefuge(v, families, why)) return exodus();
    if (this.organizeColony(v, why === 'comida' ? 'terra' : 'espaço', undefined, undefined, 'fome')) return exodus();
    const near = this.villages.some((o) => o !== v && !o.abandoned && o.species === v.species && this.distance(o, v.x, v.y) < B.LONE_FOUND_DIST);
    if (!near && this.colonizeByLand(v, families)) {
      exodus();
      this.tally.soloFounds++;
      this.note(`Sem ${why}, uma família de ${v.name} partiu para longe`, 'povo', v, { key: `exodus-${v.id}` });
    }
  },

  /** Refúgio (RF-AS-01 e 08): famílias com falta vão para qualquer lugar do povo ao alcance, mesmo pior. */
  seekRefuge(this: Ecosystem, v: Village, families: Map<number, number[]>, why: string): boolean {
    const reach = (B.MOVE_RANGE + B.MOVE_RANGE_ERA * Math.floor(v.tech)) * 2.5;
    let best: Village | null = null;
    let bv = -Infinity;
    for (const o of this.villages) {
      if (o === v || o.abandoned || o.species !== v.species || o.population < 3) continue;
      const d = this.distance(o, v.x, v.y);
      if (d > reach || !this.landPath(v.x, v.y, o.x, o.y)) continue;
      const value = this.placeScore(o) - d / B.MOVE_DIST - (this.scarcity(o) > 0 ? 1 : 0) + this.affinity(v.id, o.id) / 50;
      if (value > bv) {
        bv = value;
        best = o;
      }
    }
    if (!best) return false;
    let moved = 0;
    const leader = this.leaderOf(v);
    for (const m of families.values()) {
      if (m.includes(leader) || !happens(this.civRnd, B.EXODUS_SHARE, 1)) continue;
      for (const i of m) this.relocate(i, v, best);
      this.emit({ kind: 'migrate', year: this.year, family: this.family[m[0]] ?? -1, from: v.id, to: best.id, people: m.length, cause: 'refuge' });
      moved += m.length;
      this.tally.familyMoves++;
    }
    if (!moved) return false;
    this.note(`Sem ${why}, famílias de ${v.name} buscaram refúgio em ${best.name}`, 'povo', best, { key: `refuge-${v.id}-${best.id}` });
    return true;
  },

  /**
   * Sítio rural (RF-AS-02): uma casa e uma roça a 6 a 15 tiles do núcleo, ligadas a ele por trilha. O
   * sítio não é um lugar novo: conta na população e no estoque do núcleo, e quem mora nele é do núcleo.
   */
  openFarmstead(this: Ecosystem, v: Village): boolean {
    const farms = v.houses.filter((h) => h.farm).length;
    if (farms >= B.FARMSTEADS_MAX || v.population < 8) return false;
    const map = this.map;
    const w = map.width;
    const foot = this.footprint(v);
    for (let k = 0; k < 20; k++) {
      const a = this.civRnd() * Math.PI * 2;
      const d = foot + B.FARMSTEAD_MIN * 0.5 + this.civRnd() * (B.FARMSTEAD_MAX - B.FARMSTEAD_MIN);
      const x0 = Math.floor(v.x + Math.cos(a) * d);
      const y0 = Math.floor(v.y + Math.sin(a) * d);
      if (y0 < 2 || y0 >= map.height - 3) continue;
      const tiles: number[] = [];
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 4; dx++) tiles.push(this.tileAt(x0 + dx, y0 + dy));
      if (tiles.some((t) => t < 0 || !isLand(map, t) || this.road[t] || this.built[t] || this.depositAt[t] >= 0 || !this.flat(t))) continue;
      if (tiles.slice(4).some((t) => map.vegetation[t] < this.minFertility(v))) continue;
      if (this.villages.some((o) => o !== v && !o.abandoned && this.distance(o, x0 + 2, y0 + 1) < this.footprint(o) + 6)) continue;
      if (!this.landPath(v.x, v.y, x0 + 1, y0 + 1) || !this.pay(v, 'house')) continue;
      const lot = [tiles[0], tiles[1], tiles[4], tiles[5]];
      for (const t of lot) {
        this.built[t] = 1;
        this.onTileChanged(t);
      }
      const house: Building = { x: x0, y: y0, kind: 'house', variant: Math.floor(this.civRnd() * 4), era: Math.floor(v.tech), farm: true };
      this.startWork(house, B.WORK_YEARS / 2, true);
      v.houses.push(house);
      for (const t of [tiles[2], tiles[3], tiles[6], tiles[7]]) {
        this.road[t] = 4;
        this.onTileChanged(t);
      }
      v.fields++;
      this.layAccess(v, x0, y0, Math.ceil(d) + 8);
      this.tally.farmsteads++;
      this.note(`Famílias de ${v.name} abriram um sítio a ${Math.round(d)} tiles do centro`, 'povo', { x: x0 + 1, y: y0 + 1 }, { key: `farmstead-${v.id}` });
      this.emit({ kind: 'farmstead', year: this.year, village: v.id, x: x0 + 1, y: y0 + 1 });
      void w;
      return true;
    }
    return false;
  },

  /**
   * Sítios que viraram aldeia (RF-AS-02): casas de sítio com FARMSTEAD_FREE_POP moradores juntos, longe do
   * núcleo, se emancipam como um lugar novo do mesmo povo e do mesmo reino.
   */
  freeFarmsteads(this: Ecosystem, v: Village): void {
    const w = this.map.width;
    const farms = v.houses.filter((h) => h.farm && !h.site && this.distance(v, h.x + 1, h.y + 1) >= B.FARMSTEAD_FREE_DIST);
    if (farms.length < 2) return;
    const seed = farms[0];
    const group = farms.filter((h) => Math.hypot(wrapDx(h.x - seed.x, w), h.y - seed.y) < 8);
    const keys = new Set(group.map((h) => h.y * w + h.x));
    const people: number[] = [];
    for (const i of this.residents(v.id)) if (keys.has(this.home[i])) people.push(i);
    if (people.length < B.FARMSTEAD_FREE_POP) return;
    const cx = Math.floor(group.reduce((n, h) => n + h.x + 1, 0) / group.length);
    const cy = Math.floor(group.reduce((n, h) => n + h.y + 1, 0) / group.length);
    // A praça do lugar novo fica num tile livre perto do meio do sítio.
    let px = -1;
    let py = -1;
    for (let r = 0; r < 4 && px < 0; r++) {
      for (let dy = -r; dy <= r && px < 0; dy++) {
        for (let dx = -r; dx <= r && px < 0; dx++) {
          const t = this.tileAt(cx + dx, cy + dy);
          if (t >= 0 && isLand(this.map, t) && !this.built[t] && this.road[t] !== 4) {
            px = cx + dx;
            py = cy + dy;
          }
        }
      }
    }
    if (px < 0) return;
    const nv = this.foundVillage(v.species, px, py, 0, v, 'sítio');
    // `foundVillage` ergueu uma cabana dos fundadores: as casas do sítio já bastam.
    for (const h of nv.houses.splice(0)) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) this.built[this.tileAt(h.x + dx, h.y + dy)] = 0;
    for (const h of group) {
      v.houses.splice(v.houses.indexOf(h), 1);
      h.farm = false;
      nv.houses.push(h);
    }
    nv.stock.wood += 0;
    v.foot = undefined;
    nv.foot = undefined;
    for (const i of people) {
      this.setVillage(i, nv.id);
      v.population--;
      nv.population++;
    }
    this.note(`O sítio de ${v.name} cresceu e virou a aldeia ${nv.name}`, 'povo', nv, { major: false });
  },
};
export type ColoniesPart = typeof coloniesPart;
