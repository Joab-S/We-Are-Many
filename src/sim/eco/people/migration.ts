/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): taxas, nota dos lugares, migração e afinidade entre assentamentos.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { happens } from '../../stochastic';
import { CHILD } from '../../roles';
import { pairKey } from '../../community';
import { emptyVital } from '../../people';
import { BOND } from '../../../ai/relations';
import { chooseMove, moveWhy, type MoveAction, type MoveContext, type PlaceView } from '../../../ai/decisions/move';
import type { Village } from '../types';

/** Um lugar conhecido ao alcance e o custo de ir até lá (viagem e diferença de povo e de reino), em pontos da nota. */
interface Known {
  o: Village;
  cost: number;
}

/** Lugares que a família compara de cada vez (os melhores pela nota): a escolha fica barata e o porquê, curto. */
const MOVE_OPTIONS = 5;

export const migrationPart = {
  /**
   * Clima e vegetação (RF-SUP-07): a vegetação se espalha para vizinhos com
   * clima favorável e morre onde o clima ficou hostil.
   */
  /**
   * Taxas do momento num assentamento, por ano (RF-VIDA-310): para depurar e
   * calibrar, mostradas no painel com `?debug` no endereço.
   */
  rates(this: Ecosystem, v: Village): { name: string; perYear: number }[] {
    const homes = v.houses.filter((h) => h.kind === 'house').length;
    const crowded = this.crowded(v);
    const curious = v.culture.value === 'comércio' || v.culture.value === 'conhecimento' ? 2 : 1;
    return [
      { name: 'casa nova', perYear: v.population > homes * 3 ? B.HOUSE_RATE : 0 },
      { name: 'andarilho', perYear: B.WANDERER_RATE[v.population <= 3 ? 0 : v.population < 10 ? 1 : v.population < 30 ? 2 : 3] },
      // A mesma taxa da colônia em `updateVillages`: de quem tem gente de sobra, maior quando está lotado.
      { name: 'colonos', perYear: !v.colony && v.population >= B.COLONY_SOURCE_POP ? B.COLONY_RATE * (1 + 0.25 * Math.floor(v.tech)) * (crowded ? B.COLONY_PRESSURE_CROWDED : 1) : 0 },
      { name: 'porto', perYear: v.port < 0 && v.tech >= 0.5 ? B.PORT_RATE : 0 },
      { name: 'exploração', perYear: v.port >= 0 && v.tech >= 1 ? B.EXPLORE_RATE * curious : 0 },
      { name: 'colheita (× ano normal)', perYear: this.harvest(v) },
    ];
  },

  /**
   * Nota de um assentamento como lugar para morar (evolução dos povos, etapa 2): comida, casa sobrando,
   * o tamanho (mais ofícios, mercado e proteção: as luzes da cidade), a guerra e a estabilidade.
   * Quem decide compara a nota do próprio lugar com a dos outros que conhece (`migrate`). O prêmio de
   * tamanho cresce com o log da população e a pressão social (agente 3B) com o quadrado: a cidade atrai
   * até encher para as instituições que tem, e a nota cai a cada família que chega.
   */
  placeScore(this: Ecosystem, o: Village): number {
    const n = o.needs;
    // Comida: quem come bem lá, e um pouco o celeiro.
    const food = 0.75 * (o.fedShare ?? 1) + 0.25 * Math.min(1, o.food / Math.max(1, o.population * B.CONSUME_FOOD));
    const fuel = n?.fuel ?? 1;
    const free = this.housing(o) - o.population;
    const room = Math.max(-1, Math.min(1, free / (3 + o.population * 0.15)));
    const size = B.MOVE_CITY_PULL * Math.log2(1 + o.population / 20) + B.MOVE_TIER_PULL * this.scale(o) - B.MOVE_PRESSURE * this.socialPressure(o);
    const war = this.warOf(o.kingdom) ? B.MOVE_WAR : 0;
    return B.MOVE_FOOD * food + B.MOVE_FUEL * Math.min(1, fuel / 0.8) + B.MOVE_ROOM * room + size + B.MOVE_STABLE * (o.stability ?? 1) - war;
  },

  /**
   * Migração por nota (evolução dos povos, etapa 2; antes RF-VIDA-281), decidida pela IA de quando sair
   * (src/ai/decisions/move.ts): uma vez por ano, depois do ano da economia (as necessidades já são as deste
   * ano), cada família pensa em se mudar com chance MOVE_THINK (bem mais na falta) e escolhe entre ficar e
   * os lugares do seu povo que conhece, com caminho por terra, pela nota de cada um (descontadas a viagem e a
   * diferença de povo e de reino), a pressão social, os laços que tem lá, o apego e os anos desde a última
   * mudança (histerese). A cada família que chega, a nota do destino e a da origem são refeitas: o lugar que
   * lota deixa de atrair (sem estouro de manada). Na falta, sem lugar melhor por perto, parte do povo sai
   * para fundar outro lugar (êxodo); isso só acontece quando nenhum lugar conhecido é melhor.
   */
  migrate(this: Ecosystem): void {
    const live = this.villages.filter((o) => !o.abandoned && o.population > 0);
    // Nota e pressão social de cada lugar, refeitas a cada chegada e saída (sem estouro de manada).
    const score = new Map<Village, number>();
    const crowd = new Map<Village, number>();
    const rescore = (o: Village) => {
      score.set(o, this.placeScore(o));
      crowd.set(o, this.socialPressure(o));
    };
    for (const o of live) rescore(o);
    // Famílias de cada assentamento: cada adulto com os filhos ainda crianças que moram no mesmo lugar.
    const families = this.familyGroups();
    for (const v of live) {
      const fams = families.get(v.id);
      if (!fams || v.population < 1) continue;
      const lack = this.scarcity(v);
      const reach = B.MOVE_RANGE + B.MOVE_RANGE_ERA * Math.floor(v.tech);
      // Lugares conhecidos: do mesmo povo e espécie, a pé e com caminho por terra. O caminho é conferido
      // antes de escolher (antes, a lista era cortada nos 4 melhores e só então se via quem dava para alcançar).
      const known: Known[] = [];
      for (const o of live) {
        if (o === v || o.species !== v.species) continue;
        const d = this.distance(o, v.x, v.y);
        if (d > reach || !this.landPath(v.x, v.y, o.x, o.y)) continue;
        known.push({ o, cost: d / B.MOVE_DIST + (o.culture !== v.culture ? B.MOVE_FOREIGN : o.kingdom !== v.kingdom ? B.MOVE_OTHER_KINGDOM : 0) });
      }
      const value = (c: Known) => (score.get(c.o) ?? 0) - c.cost;
      // Última leva (RF-AS-08): um lugar minúsculo e em falta se muda inteiro para o melhor lugar ao alcance.
      if (v.population <= B.LAST_WAVE_POP && (lack > 0 || (v.want ?? 0) >= 2)) {
        const dest = [...known].sort((p, q) => value(q) - value(p)).find((c) => !c.o.abandoned && this.scarcity(c.o) === 0)?.o;
        if (dest) {
          for (const members of fams.values()) for (const i of members) this.relocate(i, v, dest);
          this.emit({ kind: 'migrate', year: this.year, family: -1, from: v.id, to: dest.id, people: [...fams.values()].reduce((n, m) => n + m.length, 0), cause: 'lastWave' });
          v.leftTo = dest.id;
          this.tally.lastWaves++;
          this.note(`Os últimos moradores de ${v.name} se mudaram para ${dest.name}`, 'povo', dest, { key: `lastwave-${v.id}` });
          rescore(dest);
          continue;
        }
      }
      if (v.population < 2) continue;
      // Anos de falta (êxodo): ficar perde o costume e a histerese, e valem só os lugares melhores que este e
      // que não estejam em falta; sem nenhum, parte do povo vai fundar outro lugar (fronteira).
      const exodus = lack > 0 && (v.want ?? 0) >= 3 && v.population >= 10;
      const here = score.get(v) ?? 0;
      const targets = exodus ? known.filter((c) => value(c) > here && this.scarcity(c.o) === 0) : known;
      // Fissão por pressão: a social (gente demais para as instituições que o lugar tem) mais a da terra (com
      // fome e sem terra para mais roça perto). Com ela alta, os batedores procuram espaço ou terra (a que mais
      // aperta), cada família pode escolher fundar, e mais famílias pensam em sair.
      const social = this.socialPressure(v);
      const land = this.landPressure(v);
      const pressure = social + land;
      const motive = land > social ? 'terra' : 'espaço';
      const split = !exodus && this.canSplit(v, motive);
      const sites = split && pressure >= B.PRESSURE_SCOUT ? this.scoutSites(v, motive, B.COLONY_SCOUTS) : [];
      // Apertado e sem sítio livre: circunscrição (guerra por terra e instituições, Carneiro).
      this.circumscribe(v, pressure, split, sites.length > 0);
      const think = exodus ? B.EXODUS_SHARE : Math.min(0.9, B.MOVE_THINK * (1 + B.MOVE_LACK * lack) + B.MOVE_PRESS_THINK * Math.max(0, pressure - B.PRESSURE_SCOUT));
      const leader = this.leaderOf(v);
      let movedAny = 0;
      let to: Village | null = null;
      const volunteers: number[] = [];
      let ready = 0;
      if (targets.length || sites.length) {
        for (const [key, members] of fams) {
          if (members.includes(leader) || !happens(this.civRnd, think, 1)) continue;
          const pick = this.thinkMove(v, members, targets, score, crowd, lack, exodus, sites, pressure);
          if (pick?.kind === 'found') {
            // Quem escolheu fundar espera o grupo: a colônia sai quando houver famílias bastantes.
            volunteers.push(key);
            ready += members.length;
            continue;
          }
          if (pick?.kind !== 'migrate') continue;
          const dest = this.villages[pick.to];
          if (dest.abandoned) continue;
          for (const i of members) this.relocate(i, v, dest);
          this.emit({ kind: 'migrate', year: this.year, family: this.family[members[0]] ?? -1, from: v.id, to: dest.id, people: members.length, cause: 'move' });
          movedAny += members.length;
          this.tally.familyMoves++;
          to = dest;
          // A chegada muda as duas notas (casa sobrando, pressão): a próxima família já vê o destino mais cheio.
          rescore(dest);
          rescore(v);
          if (v.population <= 0) break;
        }
      }
      if (ready >= B.COLONY_GROUP_MIN * B.FISSION_READY) this.organizeColony(v, motive, sites, volunteers);
      if (movedAny && to) {
        const why = lack > 0 ? this.lackName(v) : to.tier > v.tier ? 'trabalho na cidade' : 'uma vida melhor';
        this.note(`Famílias de ${v.name} se mudaram para ${to.name} em busca de ${why}`, 'povo', to, { key: `migra-${v.id}-${to.id}` });
        if (exodus) v.want = 0;
        continue;
      }
      // Êxodo sem lugar conhecido melhor ao alcance: sítio, refúgio, colônia e, só longe de tudo, um grupo para longe (RF-AS-01).
      if (exodus && !targets.length) this.exodusWithoutPlace(v, fams);
    }
  },

  /**
   * A família `members` de `v` pensa em se mudar (src/ai/decisions/move.ts): monta o que ela sabe (a nota de
   * cada lugar ao alcance em `score`, a pressão social em `crowd` e a de casa em `pressure`, os laços que tem
   * em cada um, há quanto tempo chegou e os sítios que os batedores viram) e escolhe. Quem decide sair anota o
   * porquê no diário. Devolve a escolha (null: nenhuma opção).
   */
  thinkMove(this: Ecosystem, v: Village, members: number[], known: Known[], score: Map<Village, number>, crowd: Map<Village, number>, lack: number, exodus: boolean, sites: { value: number }[] = [], pressure?: number): MoveAction | null {
    const adults = members.filter((i) => this.role[i] !== CHILD);
    if (!adults.length) return null;
    const ties = this.tiesByPlace(members);
    let yearsHere = Infinity;
    for (const i of adults) if (this.movedAt[i] >= 0) yearsHere = Math.min(yearsHere, this.year - this.movedAt[i]);
    const places: PlaceView[] = known
      .map((c) => ({ id: c.o.id, value: (score.get(c.o) ?? 0) - c.cost, pressure: crowd.get(c.o) ?? this.socialPressure(c.o), friends: ties.get(c.o.id) ?? 0, affinity: this.affinity(v.id, c.o.id) }))
      .sort((p, q) => q.value - p.value)
      .slice(0, MOVE_OPTIONS);
    const ctx: MoveContext = {
      traits: this.traits,
      adults,
      here: { value: score.get(v) ?? 0, pressure: pressure ?? this.socialPressure(v), friends: ties.get(v.id) ?? 0, lack },
      places,
      sites: sites.map((p, index) => ({ index, value: p.value })),
      yearsHere,
      exodus,
    };
    const choice = chooseMove(ctx, this.mindRnd);
    if (!choice) return null;
    const pick = choice.pick.action;
    if (pick.kind !== 'stay') {
      const name = (a: MoveAction) => (a.kind === 'stay' ? 'ficar' : a.kind === 'migrate' ? `ir para ${this.villages[a.to].name}` : 'fundar um lugar novo');
      const why = moveWhy(choice, name);
      for (const i of adults) this.logThought(i, 'mudança', why.charAt(0).toUpperCase() + why.slice(1));
    }
    return pick;
  },

  /**
   * Laços da família por lugar (amigos, cônjuges e pais dos adultos, pelo uid): quantos moram em cada
   * assentamento, sem contar a própria família (que vai junto).
   */
  tiesByPlace(this: Ecosystem, members: number[]): Map<number, number> {
    const out = new Map<number, number>();
    const add = (j: number) => {
      if (j < 0 || members.includes(j)) return;
      const vid = this.village[j];
      if (vid >= 0) out.set(vid, (out.get(vid) ?? 0) + 1);
    };
    for (const i of members) {
      if (this.role[i] === CHILD) continue;
      for (const b of this.bonds.get(this.uid[i]) ?? []) if (b.kind === BOND.friend || b.kind === BOND.partner) add(this.findUid(b.uid));
      if (this.parent[i]) add(this.findUid(this.parent[i]));
    }
    return out;
  },

  /** O que mais falta no assentamento em falta: comida (gente com fome) ou lenha. */
  lackName(this: Ecosystem, v: Village): 'comida' | 'lenha' {
    const food = B.HUNGER_LEVEL - (v.fedShare ?? v.needs?.food ?? 1);
    const fuel = (B.SCARCITY_LEVEL - (v.needs?.fuel ?? 1)) * (B.HUNGER_LEVEL / B.SCARCITY_LEVEL);
    return food >= fuel ? 'comida' : 'lenha';
  },

  /** Afinidade entre dois assentamentos, de −100 a 100 (RF-AS-43). */
  affinity(this: Ecosystem, a: number, b: number): number {
    return a === b ? 100 : (this.affinities.get(pairKey(a, b)) ?? 0);
  },

  /** Soma à afinidade entre dois assentamentos, dentro de −100 a 100. */
  addAffinity(this: Ecosystem, a: number, b: number, delta: number): void {
    if (a === b) return;
    const k = pairKey(a, b);
    this.affinities.set(k, Math.max(-100, Math.min(100, (this.affinities.get(k) ?? 0) + delta)));
  },

  /** Muda a criatura `i` de `from` para `to`: chega pela borda do destino e vai andando até a praça. */
  relocate(this: Ecosystem, i: number, from: Village, to: Village): void {
    // Memória de origem (RF-AS-41): quem se muda guarda o laço com o lugar de onde veio.
    this.origin[i] = from.id;
    from.population--;
    (from.vitalNow ??= emptyVital()).left++;
    this.setVillage(i, -1);
    const w = this.map.width;
    for (let t = 0; t < 8; t++) {
      const a = this.civRnd() * Math.PI * 2;
      const d = this.footprint(to) + 1 + this.civRnd() * 2;
      const x = to.x + Math.cos(a) * d;
      const y = to.y + Math.sin(a) * d;
      const tile = this.tileAt(x, Math.floor(y));
      if (tile < 0 || !this.habitable(to.species, tile)) continue;
      this.x[i] = ((x % w) + w) % w;
      this.y[i] = y;
      break;
    }
    if (this.role[i] === CHILD) {
      this.setVillage(i, to.id);
      this.movedAt[i] = this.year;
      to.population++;
      (to.vitalNow ??= emptyVital()).arrived++;
    } else this.join(i, to);
    this.tally.migrants++;
  },
};
export type MigrationPart = typeof migrationPart;
