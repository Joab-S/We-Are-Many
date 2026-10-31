/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): eras, pilares do desenvolvimento e técnicas (seção 19.10).
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import { happens } from '../../stochastic';
import * as P from '../../progress';
import { ERA_NEEDS } from '../../economy';
import { CHILD, ROLES } from '../../roles';
import { familyName, personName } from '../../people';
import { welfare } from '../../needs';
import type { Village } from '../types';
import * as constantsModule from '../constants';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { YEAR_SECONDS, ERAS } = constantsModule;

export const techPart = {
  /**
   * Avança o conhecimento (usado em difusão comercial e testes). Mudar de etapa
   * continua respeitando a sequência física dos materiais e dos pontos.
   */
  advance(this: Ecosystem, v: Village, amount: number): void {
    const era = Math.floor(v.tech);
    let next = Math.min(ERAS.length - 1, v.tech + amount);
    const kmade = this.villages[v.kingdom].made;
    const m = {
      bronze: Math.max(v.made.bronze, kmade.bronze),
      iron: Math.max(v.made.iron, kmade.iron),
      steel: Math.max(v.made.steel, kmade.steel),
      stone: Math.max(v.made.stone, kmade.stone),
      coal: Math.max(v.made.coal, kmade.coal),
    };
    const techGate =
      (era === 0 && this.knew(v, 'fundicao')) ||
      (era === 1 && this.knew(v, 'siderurgia')) ||
      (era === 2 && this.knew(v, 'aco')) ||
      (era === 3 && this.knew(v, 'vapor'));
    if (
      Math.floor(next) > era &&
      era < ERA_NEEDS.length &&
      (!techGate && (!ERA_NEEDS[era].met(m) || !P.pointsMet(v.pts ?? P.emptyPoints(), era)))
    ) {
      next = Math.min(next, era + 0.999);
    }
    v.tech = next;
  },

  /** Técnicas conhecidas (seção 19.10). */
  knows(this: Ecosystem, v: Village): ReadonlySet<string> {
    return new Set(v.techs ?? []);
  },

  knew(this: Ecosystem, v: Village, id: string): boolean {
    return !!v.techs && v.techs.includes(id);
  },

  /** Aprende uma técnica: guarda e registra na crônica, com destaque para a primeira do mundo (RF-VIDA-274). */
  learn(this: Ecosystem, v: Village, t: P.Tech, how: string): void {
    if (this.knew(v, t.id)) return;
    (v.techs ??= []).push(t.id);
    if (v.samples) delete v.samples[t.id];
    const first = !this.techsSeen.has(t.id);
    this.techsSeen.add(t.id);
    this.note(`${v.name} ${how} ${t.name}: ${t.gives}`, 'economia', v, first ? { major: true } : { key: `tech-${t.id}` });
  },

  /** Assentamentos de onde vêm ideias: o mesmo reino e os parceiros de acordo comercial (RF-VIDA-74). */
  partnersOf(this: Ecosystem, v: Village): Village[] {
    const out = this.villages.filter((o) => o !== v && !o.abandoned && o.kingdom === v.kingdom);
    for (const g of this.agreements) {
      const o = g.a === v.id ? this.villages[g.b] : g.b === v.id ? this.villages[g.a] : null;
      if (o && !o.abandoned && !out.includes(o)) out.push(o);
    }
    return out;
  },

  useContext(this: Ecosystem, v: Village): P.UseContext {
    const st = v.stock;
    const kmade = this.villages[v.kingdom].made;
    const reach = this.radius(v) + 25;
    let softOre = st.copper + st.tin + st.gold > 0;
    let ironOre = st.iron > 0;
    let coal = st.coal > 0;
    for (const d of this.deposits) {
      if (d.amount <= 0 || (!d.known.has(v.kingdom) && d.mine !== v.id)) continue;
      if (d.mine !== v.id && this.distance(v, d.x + 0.5, d.y + 0.5) > reach) continue;
      if (d.ore === 'copper' || d.ore === 'tin' || d.ore === 'gold') softOre = true;
      else if (d.ore === 'iron') ironOre = true;
      else if (d.ore === 'coal') coal = true;
    }
    const herbivores = (!!v.herd && v.herd.head > 0) || this.species.some((sp, k) => sp.kind === 'herbivore' && this.population[k] > 0);
    return {
      tech: v.tech,
      tier: this.scale(v),
      wet: !!v.wet,
      herd: v.herd && v.herd.head > 0 ? v.herd.kind : undefined,
      farming: v.fields > 0,
      smithy: this.has(v, 'smithy'),
      market: this.has(v, 'market'),
      temple: this.has(v, 'temple'),
      mill: this.has(v, 'windmill'),
      coal,
      herbivores,
      tools: st.tools >= 1,
      softOre,
      ironOre,
      forgedBronze: v.made.bronze + kmade.bronze >= 1,
      forgedIron: v.made.iron + kmade.iron >= 1,
      stoneWorked: v.made.stone + kmade.stone >= 8 || st.stone >= 4,
    };
  },

  pillarContext(this: Ecosystem, v: Village): P.PillarContext {
    const cap = this.capOf(v, 'food');
    return {
      welfare: v.needs ? welfare(v.needs) : 1,
      foodFill: cap > 0 ? Math.min(1, v.food / cap) : 0,
      farming: v.fields > 0 || v.port >= 0,
      herd: !!v.herd && v.herd.head > 0,
      mines: v.mines.length > 0,
      smithy: this.has(v, 'smithy'),
      techs: v.techs?.length ?? 0,
      completeness: v.completeness ?? 0,
      port: v.port >= 0,
      market: this.has(v, 'market'),
      agreements: this.agreements.filter((g) => g.a === v.id || g.b === v.id).length,
      fair: v.fair !== undefined && this.year - v.fair < 3,
      temple: this.has(v, 'temple'),
      monument: this.has(v, 'statue') || this.has(v, 'wonder'),
      luxuryJoy: !!v.luxuryJoy,
      leader: v.leader >= 0 && !!this.alive[v.leader],
      tier: this.scale(v),
      stability: v.stability ?? 1,
      linked: !!v.linked,
      kingdom: this.kingdomSize(this.capitalOf(v)) > 1,
    };
  },

  /**
   * Desenvolvimento orgânico do assentamento (seção 19.10): nível e pontos de
   * cada pilar, progresso tecnológico pelo que o povo domina e constrói,
   * experimentação individual dos trabalhadores no ofício (com ensino gradual à
   * aldeia e risco de perda se o descobridor morrer antes), difusão pelos
   * vizinhos (RF-VIDA-271) e esquecimento raro num colapso (RF-VIDA-275).
   */
  develop(this: Ecosystem, v: Village, dt: number, adults: number[] = []): void {
    const yr = dt / YEAR_SECONDS;
    v.peak = Math.max(v.peak ?? 0, v.population);
    const levels = P.pillarLevels(this.pillarContext(v));
    v.levels = levels;
    const pts = (v.pts ??= P.emptyPoints());
    P.pointsFor(levels, yr, v.vocation).forEach((p, i) => (pts[i] += p));

    // Ensino em andamento: o descobridor passa a técnica aos poucos para a aldeia.
    if (v.pendingTech) {
      const aliveHere = adults.some((i) => this.uid[i] === v.pendingTech!.uid);
      // Sem o professor na aldeia, um aprendiz pode assumir; ele continua a partir do próximo passo.
      if (!aliveHere && adults.length > 0) this.losePendingTech(v, 'partiu');
      else {
        const wise = v.culture.value === 'conhecimento' ? 1.25 : 1;
        const written = this.knew(v, 'escrita') ? 1.2 : 1;
        v.pendingTech.progress += yr * P.TECH_TEACH_VILLAGE_RATE * wise * written;
        if (v.pendingTech.progress >= 1) {
          const t = P.TECH_BY_ID[v.pendingTech.id];
          const teacher = v.pendingTech.name;
          v.pendingTech = undefined;
          if (t) this.learn(v, t, `aprendeu com ${teacher}`);
        }
      }
    }

    // Atualiza o nível tecnológico orgânico pelo que a aldeia já domina e produz.
    const kmade = this.villages[v.kingdom].made;
    const organic = P.organicTech({
      techs: this.knows(v),
      tier: this.scale(v),
      fields: v.fields,
      herd: !!v.herd && v.herd.head > 0,
      port: v.port >= 0,
      smithy: this.has(v, 'smithy'),
      market: this.has(v, 'market'),
      madeBronze: Math.max(v.made.bronze, kmade.bronze),
      madeIron: Math.max(v.made.iron, kmade.iron),
      madeSteel: Math.max(v.made.steel, kmade.steel),
      madeStone: Math.max(v.made.stone, kmade.stone),
      madeCoal: Math.max(v.made.coal, kmade.coal),
      tools: v.stock.tools,
    });
    if (organic > v.tech) v.tech = organic;

    // Técnicas: no máximo quatro vezes por ano, com a chance do tempo passado.
    const since = this.year - (v.learnAt ?? 0);
    if (since < 0.25) return;
    v.learnAt = this.year;
    const known = this.knows(v);
    const learnable = P.learnable(known, v.tech);
    if (learnable.length) {
      const use = this.useContext(v);
      const partners = this.partnersOf(v);
      const press = known.has('imprensa') || partners.some((o) => o.techs?.includes('imprensa')) ? 1.5 : 1;
      const wise = v.culture.value === 'conhecimento' ? 1.25 : 1;
      const dev = P.devSpeed(levels) * wise * (known.has('escrita') ? 1.15 : 1);
      const fedEnough = (v.needs?.food ?? 1) >= 0.4;
      for (const t of learnable) {
        const taught = partners.some((o) => o.techs?.includes(t.id));
        if (taught && (t.use(use) || known.size >= t.needs.length) && happens(this.lore, P.TECH_NEIGHBOR_RATE * press * 0.45, since)) {
          if (v.pendingTech?.id === t.id) v.pendingTech = undefined;
          this.learn(v, t, 'aprendeu com os vizinhos');
          continue;
        }
        // Experimentação individual: trabalhadores do ofício com recursos disponíveis descobrem e ensinam.
        if (!v.pendingTech && fedEnough && t.use(use) && adults.length > 0) {
          const workers = adults.filter((i) => t.roles.includes(ROLES[this.role[i]]));
          const pool = workers.length > 0 ? workers : adults.length <= 6 ? adults : [];
          if (pool.length > 0) {
            let curiosity = 0;
            for (const i of pool) curiosity += this.curiosity(i);
            const effCuriosity = Math.min(4.5, curiosity);
            const sample = (v.samples?.[t.id] ?? -Infinity) > this.year ? P.TECH_SAMPLE_BOOST : 1;
            if (happens(this.lore, P.TECH_DISCOVER_RATE * effCuriosity * dev * sample, since)) {
              // Escolhe o descobridor ponderado pela curiosidade individual.
              let pick = pool[0];
              let r = this.lore() * curiosity;
              for (const i of pool) {
                r -= this.curiosity(i);
                if (r <= 0) {
                  pick = i;
                  break;
                }
              }
              const fullName = `${personName(this.uid[pick], v.culture.id)} ${familyName(this.family[pick], v.culture.id)}`;
              v.pendingTech = { id: t.id, uid: this.uid[pick], name: fullName, progress: 0 };
              this.note(`${fullName} descobriu ${t.name} em ${v.name} e começou a ensinar o povo`, 'economia', v, { key: `disc-${v.id}-${t.id}` });
            }
          }
        }
      }
    }
    // Colapso: gente demais perdida ou estabilidade no chão.
    const collapse = ((v.peak ?? 0) >= 20 && v.population < (v.peak ?? 0) * 0.4) || (v.stability ?? 1) < 0.12;
    if (collapse && (v.techs?.length ?? 0) > 0 && happens(this.lore, P.DECAY_RATE, since)) {
      const lost = P.forgettable(known);
      if (lost.length) {
        const t = lost[Math.floor(this.lore() * lost.length)];
        v.techs = v.techs!.filter((id) => id !== t.id);
        this.note(`${v.name} esqueceu ${t.name} depois do colapso`, 'economia', v, { major: true });
      }
    }
  },

  /**
   * Quem ensinava a técnica morreu ou partiu: com o ensino adiantado, o
   * aprendiz mais curioso do ofício guarda parte e continua (sem sorteio);
   * senão a descoberta se perde. Perder o sábio abala a aldeia.
   */
  losePendingTech(this: Ecosystem, v: Village, how: 'morreu' | 'partiu', quiet = false): void {
    const p = v.pendingTech;
    if (!p) return;
    v.pendingTech = undefined;
    const t = P.TECH_BY_ID[p.id];
    if (!t) return;
    v.stability = Math.max(0, (v.stability ?? 1) - P.TECH_LOSS_STABILITY);
    let heir = -1;
    if (p.progress >= P.TECH_RESCUE_MIN) {
      let best = -1;
      for (const j of this.residents(v.id)) {
        if (this.uid[j] === p.uid || this.role[j] === CHILD) continue;
        // Quem trabalha no ofício aprendeu mais de perto; os outros só se não houver ninguém dele.
        const c = this.curiosity(j) + (t.roles.includes(ROLES[this.role[j]]) ? 10 : 0);
        if (c > best) {
          best = c;
          heir = j;
        }
      }
    }
    const verb = how === 'morreu' ? 'morreu' : 'partiu';
    if (heir >= 0) {
      const name = `${personName(this.uid[heir], v.culture.id)} ${familyName(this.family[heir], v.culture.id)}`;
      v.pendingTech = { id: t.id, uid: this.uid[heir], name, progress: P.TECH_RESCUE_KEEP };
      if (!quiet) this.note(`${p.name} ${verb} antes de ensinar ${t.name} a ${v.name}, mas ${name}, aprendiz, guardou parte do que aprendeu`, 'economia', v);
    } else if (!quiet) this.note(`${p.name} ${verb} antes de ensinar ${t.name} a ${v.name}`, 'economia', v);
  },

  /** Passa uma técnica entre dois assentamentos que se encontram (caravana, feira). */
  shareTech(this: Ecosystem, a: Village, b: Village, chance: number): void {
    for (const [from, to] of [[a, b], [b, a]] as const) {
      const known = this.knows(to);
      const options = P.learnable(known, to.tech).filter((t) => from.techs?.includes(t.id));
      if (options.length && happens(this.lore, chance, 1)) this.learn(to, options[Math.floor(this.lore() * options.length)], 'aprendeu com os mercadores');
    }
  },

  /** O jogador ensina: uma técnica que o povo pode aprender entra de uma vez (RF-VIDA-75). */
  teachTech(this: Ecosystem, v: Village): void {
    const options = P.learnable(this.knows(v), v.tech);
    if (!options.length) return;
    const use = this.useContext(v);
    const useful = options.filter((t) => t.use(use));
    const pool = useful.length ? useful : options;
    this.learn(v, pool[Math.floor(this.lore() * pool.length)], 'aprendeu com você');
  },

  /** Recursos conhecidos que ainda não se usam (RF-VIDA-272). */
  latent(this: Ecosystem, v: Village): string[] {
    const r = this.radius(v) + 12;
    const ores = new Set<string>();
    for (const d of this.deposits) if (d.amount > 0 && this.distance(v, d.x + 0.5, d.y + 0.5) < r) ores.add(d.ore);
    let herbivores = false;
    this.forEachNear(v.x, v.y, this.radius(v) + 20, (j) => {
      if (this.species[this.kind[j]].kind === 'herbivore') herbivores = true;
    });
    return P.latentResources({ wet: !!v.wet, ores: [...ores], era: Math.floor(v.tech), techs: this.knows(v), herbivores: herbivores && v.tech < 1.5, tools: v.stock.tools >= 1 });
  },

  /** Próximo passo lógico do assentamento (ou o que falta quando forçado por teste), ou null. */
  eraNeed(this: Ecosystem, v: Village): string | null {
    const era = Math.floor(v.tech);
    if (era >= ERA_NEEDS.length) return null;
    const use = this.useContext(v);
    const step = P.nextStepText({
      techs: this.knows(v),
      era,
      tools: v.stock.tools,
      wet: !!v.wet,
      smithy: this.has(v, 'smithy'),
      softOre: !!use.softOre,
      ironOre: !!use.ironOre,
      coal: use.coal,
      pendingTech: v.pendingTech?.id,
      discovererName: v.pendingTech?.name,
    });
    const kmade = this.villages[v.kingdom].made;
    const m = {
      bronze: Math.max(v.made.bronze, kmade.bronze),
      iron: Math.max(v.made.iron, kmade.iron),
      steel: Math.max(v.made.steel, kmade.steel),
      stone: Math.max(v.made.stone, kmade.stone),
      coal: Math.max(v.made.coal, kmade.coal),
    };
    const metal = ERA_NEEDS[era].met(m) ? null : ERA_NEEDS[era].text;
    const points = P.pointsText(v.pts ?? P.emptyPoints(), era);
    if (step) return metal && !step.includes('bronze') && era === 0 ? `${step} (${metal})` : step;
    return metal && points ? `${metal}; ${points}` : metal ?? points;
  },
};
export type TechPart = typeof techPart;
