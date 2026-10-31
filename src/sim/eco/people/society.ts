/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): epidemias, necessidades, estabilidade, ofícios, convívio, luto e diário das pessoas.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { binomial, happens } from '../../stochastic';
import * as P from '../../progress';
import { CHILD, pickRole, ROLE, ROLE_NAMES, ROLES, roleWeights, type Role } from '../../roles';
import { TRAIT, TRAIT_COUNT } from '../../../ai/traits';
import { chooseProfession, needDemand, professionReason, switchWill, type ProfessionContext } from '../../../ai/decisions/work';
import { remember, type ThoughtKind } from '../../../ai/trace';
import { BOND, forget } from '../../../ai/relations';
import { socialYear, type Resident } from '../../../ai/decisions/social';
import { SOCIAL } from '../../../ai/tuning';
import { personName } from '../../people';
import { fullNeeds, NEED_NAMES, ROLE_NEED, roleFor, VOCATION_NEED, VOCATION_ROLE, welfare, worstNeed } from '../../needs';
import type { Village } from '../types';
import * as helpersModule from '../helpers';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { elderAge } = helpersModule;
/** Posição do pilar organização nos níveis do assentamento (`v.levels`). */
const ORGANIZATION = P.PILLARS.indexOf('organizacao');

export const societyPart = {
  /**
   * Epidemias (RF-VIDA-284): cidades grandes sem saneamento adoecem com mais
   * facilidade; o aqueduto da metrópole corta o risco.
   */
  epidemics(this: Ecosystem): void {
    for (const v of this.villages) {
      if (v.abandoned || v.tier < 2) continue;
      const clean = v.houses.some((h) => h.kind === 'aqueduct') ? 0.25 : Math.floor(v.tech) >= 1 ? 0.6 : 1;
      if (!happens(this.civRnd, B.EPIDEMIC_RATE * (v.population / 100) * clean, 1)) continue;
      let toll = binomial(this.civRnd, v.population, B.EPIDEMIC_SHARE);
      if (toll <= 0) continue;
      const dead = toll;
      const here = this.residents(v.id);
      const leader = this.leaderOf(v);
      for (let k = 0; k < here.length && toll > 0; k++) {
        const i = here[k];
        if (!this.alive[i] || this.village[i] !== v.id || i === leader) continue;
        if (this.civRnd() < 0.5) continue;
        this.kill(i, true, 'doença');
        toll--;
      }
      this.emit({ kind: 'disaster', year: this.year, what: 'epidemic', x: v.x, y: v.y, village: v.id });
      this.note(`Uma epidemia matou ${dead - toll} pessoas em ${v.name}${clean < 1 && clean > 0.3 ? '' : clean <= 0.3 ? ', mesmo com o aqueduto' : ': faltam poços e esgoto'}`, 'natureza', v);
    }
  },

  /** Atendimento de cada necessidade no ano que passou, de 0 a 1 (RF-VIDA-210). */
  updateNeeds(this: Ecosystem, v: Village, adults: number): void {
    const l = v.ledgerNow ?? {};
    const ratio = (key: string) => {
      const e = l[key];
      return e && e[1] > 0 ? Math.min(1, e[0] / e[1]) : 1;
    };
    const pop = Math.max(1, v.population);
    const era = Math.floor(v.tech);
    // Água por perto: rio, lago ou mar em volta, ou a nascente do solo encharcado no centro (a mesma régua da água doce
    // dos sítios, `waterGrade`). Antes a nascente não contava, e o lugar fundado nela vivia com sede e sem barro.
    if (v.wet === undefined) {
      const center = this.tileAt(v.x, Math.floor(v.y));
      v.wet = this.nearWater(center) || this.coastal(v) || (center >= 0 && this.map.moisture[center] >= B.SITE_SPRING_MOISTURE);
    }
    const n = v.needs ?? fullNeeds();
    v.fedShare = ratio('_fed');
    n.food = 0.6 * v.fedShare + 0.4 * Math.min(1, v.food / (pop * B.CONSUME_FOOD));
    n.water = v.wet ? 1 : this.has(v, 'aqueduct') ? 1 : this.scale(v) >= 3 ? 0.5 : era >= 1 ? 0.85 : 0.75;
    // Lenha para o fogo e madeira para consertar as casas (seção 19.19).
    const fuel = l['_fuel'] ?? [0, 0];
    const fix = l['_upkeep'] ?? [0, 0];
    n.fuel = fuel[1] + fix[1] > 0 ? Math.min(1, (fuel[0] + fix[0]) / (fuel[1] + fix[1])) : 1;
    n.material = Math.min(1, this.housing(v) / pop);
    n.cloth = ratio('_cloth');
    n.tools = Math.min(1, v.stock.tools / Math.max(1, adults * 0.15));
    v.needs = n;
  },

  /**
   * Estabilidade (RF-VIDA-280 e RF-VIDA-136): sobe com as necessidades
   * atendidas, o templo e o sacerdote; cai com guerra, distância da capital e
   * cultura diferente da capital.
   */
  updateStability(this: Ecosystem, v: Village): void {
    const capital = this.villages[v.kingdom];
    const war = this.warOf(v.kingdom);
    let target = 0.3 + 0.6 * welfare(v.needs ?? fullNeeds());
    if (this.has(v, 'temple')) target += 0.08;
    if (v.luxuryJoy) target += B.LUXURY_STABILITY;
    if (war) target -= war.years > 10 ? 0.25 : 0.12;
    if (capital !== v) {
      target -= Math.min(0.2, this.distance(capital, v.x, v.y) / 300);
      if (capital.culture !== v.culture) target -= 0.1;
    }
    // Pressão social (agente 3B): gente demais para as instituições que o lugar tem azeda o convívio.
    v.pressure = this.socialPressure(v);
    target -= Math.min(B.PRESSURE_STABILITY_MAX, B.PRESSURE_STABILITY * Math.max(0, v.pressure - B.PRESSURE_CALM));
    target = Math.max(0, Math.min(1, target));
    const s = v.stability ?? target;
    v.stability = s + (target - s) * B.STABILITY_PULL;
  },

  /**
   * Instituições que seguram gente junta (pressão social, agente 3B): o pilar organização, o degrau, o templo,
   * o degrau político do reino, a escrita, a moeda e a circunscrição (sem para onde ir, o lugar se organiza:
   * Carneiro). Pesos INST_* em balance.ts.
   */
  institutions(this: Ecosystem, v: Village): number {
    let inst = B.INST_ORG * (v.levels?.[ORGANIZATION] ?? 0) + B.INST_TIER * v.tier;
    if (this.has(v, 'temple')) inst += B.INST_TEMPLE;
    const polity = this.villages[v.kingdom]?.polity;
    if (polity) inst += B.INST_POLITY[polity];
    if (this.knew(v, 'escrita')) inst += B.INST_WRITING;
    if (this.knew(v, 'moeda')) inst += B.INST_COIN;
    return inst + B.INST_CIRCUM * Math.min(1, (v.circumscribed ?? 0) / B.CIRCUM_FULL);
  },

  /**
   * Pressão social (pop/DUNBAR)² / (1 + instituições): o tamanho pesa ao quadrado, as instituições aliviam.
   * Acima de PRESSURE_FISSION o lugar quer se dividir; `population` permite medir com outra gente (quem chega).
   */
  socialPressure(this: Ecosystem, v: Village, population = v.population): number {
    const d = population / B.DUNBAR;
    return (d * d) / (1 + this.institutions(v));
  },

  /**
   * Pressão da terra (agente 3B): gente com fome num lugar sem terra para mais roça ao alcance (Malthus e
   * Boserup). Soma à pressão social na vontade de fundar e na circunscrição, não na estabilidade: é o aperto
   * de quem cresceu até o limite da terra, diferente da fome de um ano ruim, que manda migrar.
   */
  landPressure(this: Ecosystem, v: Village): number {
    const fed = v.fedShare ?? 1;
    if (fed >= B.HUNGER_LEVEL || v.population < B.COLONY_GROUP_MIN || this.freeLot(v, true)) return 0;
    return (B.LAND_PRESSURE * (B.HUNGER_LEVEL - fed)) / B.HUNGER_LEVEL;
  },

  /**
   * Circunscrição (Carneiro, agente 3B): pressão acima de PRESSURE_FISSION, o lugar podendo mandar um grupo
   * e nenhum sítio livre para a fissão. Cada ano assim soma um (`cramp`); com sítio ou sem aperto, desce um.
   */
  circumscribe(this: Ecosystem, v: Village, pressure: number, canSplit: boolean, hasSite: boolean): void {
    if (pressure >= B.PRESSURE_FISSION && canSplit && !hasSite) this.cramp(v);
    else if ((pressure < B.PRESSURE_FISSION || hasSite) && v.circumscribed) v.circumscribed--;
  },

  /**
   * Mais um ano apertado e sem para onde ir: o lugar se organiza (pontos no pilar organização e, por
   * `institutions`, mais gente aguentada junto) e o reino passa a olhar para a terra do vizinho (`intent`).
   */
  cramp(this: Ecosystem, v: Village): void {
    const years = (v.circumscribed = (v.circumscribed ?? 0) + 1);
    this.tally.circumYears++;
    const pts = (v.pts ??= P.emptyPoints());
    pts[ORGANIZATION] += B.CIRCUM_ORG_POINTS * Math.min(1, years / B.CIRCUM_FULL);
    if (years !== B.CIRCUM_NOTE) return;
    this.tally.circumscribed++;
    const pressure = v.pressure ?? this.socialPressure(v);
    this.emit({ kind: 'circumscribed', year: this.year, village: v.id, pressure, years });
    this.note(`${v.name} está apertada e sem terra livre por perto: o povo se organiza e olha para os vizinhos`, 'povo', v, { key: `circum-${v.id}` });
  },

  /**
   * Divisão do trabalho pela falta (RF-VIDA-214): uma parte dos adultos dos
   * setores mais folgados muda para o setor da necessidade mais mal
   * atendida, com peso extra para a vocação.
   */
  shiftLabor(this: Ecosystem, v: Village, adults: number[]): void {
    const n = v.needs;
    if (!n || adults.length < 2) return;
    const favour = v.vocation ? VOCATION_NEED[v.vocation] : undefined;
    const need = worstNeed(n, favour);
    const ctx = {
      era: Math.floor(v.tech),
      fields: v.fields > 0,
      port: v.port >= 0,
      herd: !!v.herd && v.herd.head > 0,
      loom: this.has(v, 'loom'),
      pottery: this.has(v, 'pottery') && !!v.wet,
      smithy: this.has(v, 'smithy'),
      vocation: v.vocation,
    };
    // Tudo atendido: só um pouco de gente vai para a profissão da vocação.
    const calm = n[need] >= 0.95;
    const role = calm ? (v.vocation ? VOCATION_ROLE[v.vocation] : null) : roleFor(need, ctx);
    if (!role || !this.roleContext(v)) return;
    if (role === 'fisher' && v.port < 0) return;
    if (role === 'shepherd' && !ctx.herd) return;
    if (role === 'miner' && calm && !v.mines.length) return;
    const target = ROLE[role];
    // Sobrevivência (seção 19.19): com fome ou sem lenha, muita gente larga o que faz (até soldados e mineradores).
    const crisis = !calm && (need === 'food' || need === 'fuel') && n[need] < B.CRISIS_NEED;
    let already = 0;
    for (const i of adults) if (this.role[i] === target) already++;
    const space = Math.max(1, Math.floor(adults.length * (crisis ? B.LABOR_CRISIS_MAX : B.LABOR_ROLE_MAX))) - already;
    if (space <= 0) return;
    let movers = Math.min(space, binomial(this.civRnd, adults.length, (crisis ? B.LABOR_CRISIS_SHIFT : B.LABOR_SHIFT) * (calm ? 0.15 : 1 - n[need])));
    if (movers <= 0) return;
    // Quem muda primeiro é decisão de cada um (IA local): o jeito para o ofício que falta, os traços que combinam
    // com ele mais que com o atual, e a abertura para mudar (curiosos mudam, pacientes ficam). Antes: só o jeito (RF-VIDA-420).
    const will = new Map<number, number>();
    const now = Math.floor(this.year);
    for (const i of adults) {
      // Quem acabou de trocar de ofício reluta em trocar de novo (sem isso, alguns pulavam de ofício a cada 3 anos).
      let last: number | undefined;
      for (const t of this.diary.get(this.uid[i]) ?? []) if (t.kind === 'ofício') last = t.year;
      will.set(i, switchWill(this.traits, i, ROLES[this.role[i]] as Role, role, P.aptitudeOf(this.uid[i], target), last === undefined ? Infinity : now - last));
    }
    for (const i of [...adults].sort((a, b) => will.get(b)! - will.get(a)!)) {
      if (movers <= 0) break;
      // Idosos não mudam de trabalho: já não trabalham.
      if (this.age[i] >= elderAge(this.species[this.kind[i]], Math.floor(v.tech))) continue;
      const from = ROLES[this.role[i]];
      const sector = ROLE_NEED[from];
      if (this.role[i] === target || i === this.leaderOf(v) || from === 'leader' || from === 'king') continue;
      // Fora da crise, ferreiros e mineradores ficam (o trabalho deles também leva à próxima era), e só muda quem tem setor.
      if (!crisis && (!sector || from === 'blacksmith' || from === 'miner')) continue;
      // Soldados e guardas só largam as armas na fome brava.
      if ((from === 'soldier' || from === 'guard') && n[need] >= B.SEVERE_NEED) continue;
      if (!calm && sector && n[sector] < n[need] + 0.15) continue;
      if (calm && sector === need) continue;
      if (from !== role) this.logThought(i, 'ofício', `Trocou ${ROLE_NAMES[from].toLowerCase()} por ${ROLE_NAMES[role].toLowerCase()}: ${calm ? 'é o forte do lugar' : `o lugar precisava de ${NEED_NAMES[need]}`}`);
      this.role[i] = target;
      movers--;
    }
  },

  /**
   * Profissão de quem vira adulto, escolhida pela IA da pessoa (src/ai/decisions/work.ts): a falta no lugar,
   * o que já está cheio, os traços, o jeito, o ofício dos pais e a vocação do lugar. Soldados e guardas
   * continuam sendo chamados pelo líder, na mesma proporção do sorteio antigo.
   */
  firstRole(this: Ecosystem, v: Village, era: number, i: number): number {
    const ctx = this.roleContext(v);
    const weights = roleWeights(era, this.scale(v), ctx);
    let total = 0;
    let arms = 0;
    for (const [r, w] of weights) {
      total += w;
      if (r === 'soldier' || r === 'guard') arms += w;
    }
    const draw = this.rnd();
    if (draw * total < arms) {
      let x = draw * total;
      for (const [r, w] of weights) {
        if (r !== 'soldier' && r !== 'guard') continue;
        x -= w;
        if (x <= 0) return ROLE[r];
      }
      return ROLE.soldier;
    }
    const pick = this.thinkProfession(v, i, weights);
    return pick ?? pickRole(era, this.scale(v), this.rnd(), ctx);
  },

  /** Contexto e escolha do ofício pela IA; anota no diário. Devolve null se não houver ofício civil. */
  thinkProfession(this: Ecosystem, v: Village, i: number, weights: [Role, number][], current?: Role): number | null {
    const civil = weights.filter(([r]) => r !== 'soldier' && r !== 'guard');
    if (!civil.length) return null;
    let top = 0;
    for (const [, w] of civil) top = Math.max(top, w);
    const common = new Map(civil.map(([r, w]) => [r, w / top]));
    const n = v.needs;
    const count = this.roleCount.get(v.id);
    let adults = 0;
    if (count) for (const c of count) adults += c;
    const parentIdx = this.indexOfUid(this.parent[i]);
    const parentRole = parentIdx >= 0 && this.role[parentIdx] !== CHILD ? ROLES[this.role[parentIdx]] : undefined;
    const c: ProfessionContext = {
      traits: this.traits,
      i,
      roles: civil.map(([r]) => r),
      demand: (r) => {
        const need = ROLE_NEED[r];
        return need && n ? needDemand(n[need]) : 0;
      },
      share: (r) => (count && adults ? count[ROLE[r]] / adults : 0),
      aptitude: (r) => P.aptitudeOf(this.uid[i], ROLE[r]),
      common: (r) => common.get(r) ?? 0,
      current,
      parent: parentRole,
      vocation: v.vocation ? VOCATION_ROLE[v.vocation] : undefined,
    };
    const choice = chooseProfession(c, this.mindRnd);
    if (!choice) return null;
    const role = choice.pick.action;
    if (role !== current) {
      const need = ROLE_NEED[role];
      const verb = current ? `Trocou ${ROLE_NAMES[current].toLowerCase()} por` : 'Virou';
      this.logThought(i, 'ofício', `${verb} ${ROLE_NAMES[role].toLowerCase()}: ${professionReason(c, role, need ? NEED_NAMES[need] : undefined)}`);
    }
    return ROLE[role];
  },

  /**
   * Índice de quem tem esse `uid` (-1 se morreu ou não existe). O `uid` é o handle estável da criatura
   * (Object Pool: o índice é reaproveitado depois da morte); o mapa `uidIndex` acompanha `spawn`, `kill`
   * e `restore`, então vale na hora, inclusive para quem nasceu ou desembarcou neste ano.
   */
  indexOfUid(this: Ecosystem, uid: number): number {
    return uid ? this.findUid(uid) : -1;
  },

  /**
   * Um ano de vida social no lugar (IA local, src/ai/decisions/social.ts): encontros, amizades, rivalidades,
   * casamentos e brigas, anotados no diário de cada um. Crianças fazem amigos mas não casam.
   */
  socialize(this: Ecosystem, v: Village, here: number[]): void {
    const people: Resident[] = [];
    const index = new Map<number, number>();
    const sp = this.species[v.species];
    const elder = elderAge(sp, Math.floor(v.tech));
    for (const i of here) {
      people.push({ i, uid: this.uid[i], adult: this.role[i] !== CHILD && this.age[i] < elder });
      index.set(this.uid[i], i);
    }
    const name = (uid: number) => personName(uid, v.culture.id);
    for (const e of socialYear(this.traits, this.bonds, people, this.mindRnd)) {
      const a = index.get(e.a);
      const b = index.get(e.b);
      if (a === undefined || b === undefined) continue;
      if (e.text === 'brigaram') {
        this.energy[a] = Math.max(0.05, this.energy[a] - SOCIAL.fightCost);
        this.energy[b] = Math.max(0.05, this.energy[b] - SOCIAL.fightCost);
        this.tally.fights++;
      } else if (e.text === 'casaram') this.tally.marriages++;
      const text: Record<typeof e.text, [string, string]> = {
        amigos: ['Ficou amigo(a) de', 'Ficou amigo(a) de'],
        rivais: ['Virou rival de', 'Virou rival de'],
        casaram: ['Casou com', 'Casou com'],
        brigaram: ['Brigou com', 'Brigou com'],
      };
      this.logThought(a, e.kind, `${text[e.text][0]} ${name(e.b)}`);
      this.logThought(b, e.kind, `${text[e.text][1]} ${name(e.a)}`);
    }
  },

  /** Quem morreu sai dos laços dos outros; o cônjuge fica livre para casar de novo e anota a perda. */
  mourn(this: Ecosystem, i: number): void {
    const me = this.uid[i];
    const list = this.bonds.get(me);
    if (!list) return;
    for (const b of list) {
      forget(this.bonds, b.uid, me);
      if (b.kind === BOND.partner || (b.kind === BOND.friend && b.value >= SOCIAL.love)) {
        const j = this.indexOfUid(b.uid);
        const v = this.villages[this.village[i]];
        if (j >= 0) this.logThought(j, b.kind === BOND.partner ? 'família' : 'amizade', `${b.kind === BOND.partner ? 'Perdeu o cônjuge' : 'Perdeu o melhor amigo'} ${personName(me, v?.culture.id ?? 0)}`);
      }
    }
    this.bonds.delete(me);
  },

  /**
   * Curiosidade para aprender e descobrir (de 0,3 a 1,8), pelo traço curiosidade da pessoa: a média fica
   * perto da antiga `curiosityOf` (0,87), então o ritmo das descobertas do povo não muda, só quem descobre.
   */
  curiosity(this: Ecosystem, i: number): number {
    return Math.max(0.3, 0.87 + 0.09 * this.traits[i * TRAIT_COUNT + TRAIT.curiosity]);
  },

  /** Anota uma decisão no diário da pessoa (IA local, src/ai/trace.ts). */
  logThought(this: Ecosystem, i: number, kind: ThoughtKind, text: string): void {
    remember(this.diary, this.uid[i], { year: Math.floor(this.year), kind, text });
  },
};
export type SocietyPart = typeof societyPart;
