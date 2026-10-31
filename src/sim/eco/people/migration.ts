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
import type { Village } from '../types';

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
   * Quem decide compara a nota do próprio lugar com a dos outros que conhece (`migrate`).
   */
  placeScore(this: Ecosystem, o: Village): number {
    const n = o.needs;
    // Comida: quem come bem lá, e um pouco o celeiro.
    const food = 0.75 * (o.fedShare ?? 1) + 0.25 * Math.min(1, o.food / Math.max(1, o.population * B.CONSUME_FOOD));
    const fuel = n?.fuel ?? 1;
    const free = this.housing(o) - o.population;
    const room = Math.max(-1, Math.min(1, free / (3 + o.population * 0.15)));
    const size = B.MOVE_CITY_PULL * Math.log2(1 + o.population / 20) + B.MOVE_TIER_PULL * this.scale(o);
    const war = this.warOf(o.kingdom) ? B.MOVE_WAR : 0;
    return B.MOVE_FOOD * food + B.MOVE_FUEL * Math.min(1, fuel / 0.8) + B.MOVE_ROOM * room + size + B.MOVE_STABLE * (o.stability ?? 1) - war;
  },

  /**
   * Migração por nota (evolução dos povos, etapa 2; antes RF-VIDA-281): uma vez por ano, cada família de
   * cada assentamento pensa em se mudar com chance MOVE_THINK (bem mais na falta) e compara a nota de onde
   * mora (com o apego ao lugar) com a dos lugares do seu povo que conhece, descontada a distância e a
   * diferença de povo e de reino. Escolhe entre as melhores com sorteio ponderado, então duas famílias no
   * mesmo aperto podem decidir diferente. Na falta, sem lugar melhor por perto, parte do povo sai para
   * fundar outro lugar (êxodo), como antes; agora isso só acontece quando nenhum lugar conhecido é melhor.
   */
  migrate(this: Ecosystem): void {
    const live = this.villages.filter((o) => !o.abandoned && o.population > 0);
    const score = new Map<Village, number>();
    for (const o of live) score.set(o, this.placeScore(o));
    // Famílias de cada assentamento: cada adulto com os filhos ainda crianças que moram no mesmo lugar.
    const families = this.familyGroups();
    for (const v of live) {
      const fams = families.get(v.id);
      if (!fams || v.population < 1) continue;
      const lack = this.scarcity(v);
      const stay = (score.get(v) ?? 0) + B.MOVE_STAY;
      const reach = B.MOVE_RANGE + B.MOVE_RANGE_ERA * Math.floor(v.tech);
      // Lugares conhecidos: do mesmo povo e espécie, a pé, com nota de quem já mora lá menos a viagem e a diferença.
      const options: { o: Village; value: number }[] = [];
      for (const o of live) {
        if (o === v || o.species !== v.species) continue;
        const d = this.distance(o, v.x, v.y);
        if (d > reach) continue;
        const foreign = o.culture !== v.culture ? B.MOVE_FOREIGN : o.kingdom !== v.kingdom ? B.MOVE_OTHER_KINGDOM : 0;
        options.push({ o, value: (score.get(o) ?? 0) - d / B.MOVE_DIST - foreign });
      }
      options.sort((p, q) => q.value - p.value);
      // Última leva (RF-AS-08): um lugar minúsculo e em falta se muda inteiro para o melhor lugar ao alcance.
      if (v.population <= B.LAST_WAVE_POP && (lack > 0 || (v.want ?? 0) >= 2)) {
        const dest = options.find((c) => !c.o.abandoned && this.scarcity(c.o) === 0 && this.landPath(v.x, v.y, c.o.x, c.o.y))?.o;
        if (dest) {
          for (const members of fams.values()) for (const i of members) this.relocate(i, v, dest);
          this.emit({ kind: 'migrate', year: this.year, family: -1, from: v.id, to: dest.id, people: [...fams.values()].reduce((n, m) => n + m.length, 0), cause: 'lastWave' });
          v.leftTo = dest.id;
          this.tally.lastWaves++;
          this.note(`Os últimos moradores de ${v.name} se mudaram para ${dest.name}`, 'povo', dest, { key: `lastwave-${v.id}` });
          continue;
        }
      }
      if (v.population < 2) continue;
      // Anos de falta (êxodo): sem o apego, vale qualquer lugar conhecido melhor que este e que não esteja em falta;
      // sem nenhum, parte do povo vai fundar outro lugar (fronteira).
      const exodus = lack > 0 && (v.want ?? 0) >= 3 && v.population >= 10;
      const here = score.get(v) ?? 0;
      const better = options.filter((c) => (exodus ? c.value > here && this.scarcity(c.o) === 0 : c.value > stay)).slice(0, 4);
      const reachable = better.filter((c) => this.landPath(v.x, v.y, c.o.x, c.o.y));
      const think = exodus ? B.EXODUS_SHARE : Math.min(0.9, B.MOVE_THINK * (1 + B.MOVE_LACK * lack));
      const leader = this.leaderOf(v);
      let movedAny = 0;
      let to: Village | null = null;
      if (reachable.length) {
        for (const members of fams.values()) {
          if (members.includes(leader) || !happens(this.civRnd, think, 1)) continue;
          // Sorteio ponderado entre ficar e as opções: quanto maior a vantagem, mais provável (no êxodo, ficar não conta).
          const base = exodus ? here : stay;
          let total = exodus ? 0 : 1;
          const weights = reachable.map((c) => {
            const w = Math.exp((c.value - base) / B.MOVE_TEMPER) - 1;
            total += w;
            return w;
          });
          let r = this.civRnd() * total - (exodus ? 0 : 1);
          if (r < 0) continue;
          let pick = reachable[0];
          for (let k = 0; k < reachable.length; k++) {
            r -= weights[k];
            if (r <= 0) {
              pick = reachable[k];
              break;
            }
          }
          const dest = pick.o;
          if (dest.abandoned) continue;
          for (const i of members) this.relocate(i, v, dest);
          this.emit({ kind: 'migrate', year: this.year, family: this.family[members[0]] ?? -1, from: v.id, to: dest.id, people: members.length, cause: 'move' });
          movedAny += members.length;
          this.tally.familyMoves++;
          to = dest;
          if (v.population <= 0) break;
        }
      }
      if (movedAny && to) {
        const why = lack > 0 ? this.lackName(v) : to.tier > v.tier ? 'trabalho na cidade' : 'uma vida melhor';
        this.note(`Famílias de ${v.name} se mudaram para ${to.name} em busca de ${why}`, 'povo', to, { key: `migra-${v.id}-${to.id}` });
        if (exodus) v.want = 0;
        continue;
      }
      // Êxodo sem lugar conhecido melhor ao alcance: sítio, colônia, refúgio e, só longe de tudo, fundar (RF-AS-01).
      if (exodus && !reachable.length) this.exodusWithoutPlace(v, fams);
    }
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
