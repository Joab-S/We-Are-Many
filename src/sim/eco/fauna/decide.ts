/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): decisão dos bichos de terra (IA híbrida), comer, caçar e vagar.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { happens } from '../../stochastic';
import { classify, temperatureAt } from '../../../procgen/surface';
import type { DeathCause } from '../../people';
import { wrapDx } from '../../settlement';
import {
  BITE,
  BREED_LENGTH,
  BREED_START,
  DECISIONS_PER_YEAR,
  ECO_CELL,
  ecologyOf,
  EDIBLE,
  FOOD_MIN,
  GRAZE_COST,
  HUNGRY,
  HUNT_SUCCESS,
  hunts,
  METABOLISM_YEAR,
  ration,
  appetite,
  PARASITE_RATE,
  PARASITE_RECOVERY,
  SATED,
  STARVING,
  THERMAL_YEAR,
  type Ecology,
} from '../../fauna';
import * as constantsModule from '../constants';
import type { EcoCells } from '../cells';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { RELICT, THIRST_COST, ACT, STRIKE, CHASE_TRIES, CHASE_LIMIT, GOAL_TRIES } = constantsModule;

export const faunaDecidePart = {
  /**
   * Decisão de um bicho de terra, uma vez a cada 1/DECISIONS_PER_YEAR de ano.
   * Portões fixos primeiro (fugir de quem caça, comer com fome crítica); depois a
   * IAUS: cada ação recebe uma nota (produto de curvas), a atual ganha inércia e
   * vence a maior. Tudo por ano: a mesma coisa acontece com o ano de 6 s ou de 12 s.
   */
  decideAnimal(this: Ecosystem, i: number, yr: number): void {
    // Quantas decisões normais esta vale (3 longe da tela): o que é por decisão rende na mesma proporção.
    this.lodStride = yr * DECISIONS_PER_YEAR;
    const map = this.map;
    const s = this.kind[i];
    const sp = this.species[s];
    const e = ecologyOf(sp);
    const c = this.ecoCells();
    const tile = this.tileOf(i);
    const temp = temperatureAt(map, tile);
    const phase = this.yearPhase();
    const p = this.parasite[i];
    const cell = c.of(this.x[i], this.y[i], map.width);

    // Inverno: quem hiberna dorme e gasta pouco.
    const sleeping = e.hibernate && phase > 0.75 && this.energy[i] > STARVING;
    // População relicta (poucos no planeta inteiro) vive nos melhores cantos e gasta menos: o piso contra a extinção.
    const relict = this.population[s] < RELICT ? 0.3 : this.population[s] < RELICT * 1.5 ? 0.6 : 1;
    let en = this.energy[i] - METABOLISM_YEAR * appetite(e) * yr * (sleeping ? 0.3 : 1) * (1 + 0.5 * p) * relict;
    const cold = temp < sp.tempMin;
    const hot = temp > sp.tempMax;
    if (cold || hot) en -= THERMAL_YEAR * yr;
    if (!this.canStand(s, tile)) en -= 6 * yr;
    // Sede: sem água por perto (lago, rio, costa, chuva recente ou neve) o bicho gasta mais e vai beber.
    const thirsty = this.thirsty(e, cell);
    if (thirsty) en -= METABOLISM_YEAR * THIRST_COST * yr;

    // Parasitas: pega mais onde a célula está lotada; cura comendo bem.
    const dens = this.crowding(c, cell, s, e.herd);
    if (happens(this.rnd, PARASITE_RATE * Math.min(2, dens), yr)) this.parasite[i] = Math.min(1, p + 0.25);
    else if (p > 0) this.parasite[i] = Math.max(0, p - PARASITE_RECOVERY * yr * (en > 0.6 ? 1 : 0.3));

    // Morte: velhice, frio, calor, doença ou fome (cada uma com a sua causa).
    const old = this.age[i] > sp.maxAge * (0.85 + (0.3 * ((i * 2654435761) % 1000)) / 1000);
    if (en <= 0 || old) {
      const cause: DeathCause = en > 0 ? 'velhice' : cold ? 'frio' : hot ? 'calor' : p > 0.7 ? 'doença' : 'fome';
      if (cause === 'fome' && !hunts(e) && e.carrion < 0.5) {
        this.tally.wildStarved++;
        if (this.foodWithin(e, this.x[i], this.y[i], 8)) this.tally.wildStarvedNearFood++;
      }
      this.leaveCarcass(i);
      this.kill(i, false, cause);
      return;
    }
    this.energy[i] = Math.min(1, en);
    const speed = this.pace(e, sp) * (1 - 0.3 * p);

    // Portão 1: perigo real. Foge para longe do predador, mais rápido que o normal.
    const threat = e.fear > 0 ? this.threatTo(i, e) : -1;
    if (threat >= 0) {
      const dx = wrapDx(this.x[i] - this.x[threat], map.width);
      const dy = this.y[i] - this.y[threat];
      this.act[i] = ACT.flee;
      this.goal[i] = -1;
      this.headTo(i, dx * 4, dy * 4, speed * 1.6);
      return;
    }
    if (sleeping) {
      this.act[i] = ACT.hibernate;
      this.stop(i);
      return;
    }

    // Notas da IAUS (0 a 1). Fome: 0 saciado, 1 morrendo.
    const hunger = Math.max(0, Math.min(1, (SATED - en) / (SATED - STARVING)));
    const plants = e.forage > 0 || e.fruit > 0 || e.insects > 0 || e.fish > 0 || e.plankton > 0;
    const foodHere = plants ? this.foodAt(e, tile) : 0;
    // Come com fome e continua até saciar (com folga de meia mordida, para não beliscar sem parar).
    const want = en < HUNGRY ? 0.5 + 0.5 * hunger : en < SATED - BITE / 2 && this.act[i] === ACT.eat ? 0.45 : 0;
    const fearHere = 1 - Math.min(0.8, this.fear[cell] * 0.3 * e.fear);
    let best: number = ACT.rest;
    let top = 0.2 + (this.act[i] === ACT.rest ? 0.1 : 0);
    const consider = (act: number, score: number) => {
      const v = score + (this.act[i] === act ? 0.1 : 0) + this.rnd() * 0.03;
      if (v > top) {
        top = v;
        best = act;
      }
    };
    if (plants) consider(ACT.eat, want * (foodHere >= FOOD_MIN ? 1 : 0.8) * fearHere * Math.max(e.forage, e.fruit, e.insects, e.fish, e.plankton));
    // Predador só caça com fome (abaixo de HUNGRY - 0,1).
    // Quem também come planta ou inseto (raposa, urso) prefere isso a uma caçada sem presa à vista.
    if (hunts(e) && en < HUNGRY) consider(ACT.hunt, (0.55 + 0.45 * hunger) * e.meat * (this.chase[i] >= 0 || !plants ? 1 : 0.6));
    let carcass = -1;
    // Necrófagos enxergam carcaças longe; caçadores voltam à carne da caça que está perto.
    // Como no pasto: começa com fome e segue até saciar, sem beliscar a carcaça de barriga cheia.
    const meat = en < HUNGRY ? 0.5 + 0.5 * hunger : en < SATED - BITE / 2 && this.act[i] === ACT.scavenge ? 0.45 : 0;
    if ((e.carrion > 0 || hunts(e)) && meat > 0) {
      // O urubu, planando, enxerga longe.
      carcass = this.carcassNear(this.x[i], this.y[i], e.carrion > 0 ? (e.carrion >= 0.8 && !hunts(e) && !plants ? 90 : Math.min(40, 8 + e.range * 1.5)) : 6);
      if (carcass >= 0) consider(ACT.scavenge, meat * Math.max(e.carrion, hunts(e) ? 0.8 : 0));
      // Necrófago sem carcaça à vista sai rondando (o urubu plana procurando).
      else if (e.carrion >= 0.8 && !plants && !hunts(e) && en < HUNGRY) consider(ACT.scavenge, 0.5 + 0.4 * hunger);
    }
    // Fome crítica: comida passa por cima de tudo que não é fuga (portão 2).
    const starving = en < STARVING;
    if (!starving) {
      const gap = Math.max(0, sp.tempMin + 2 - temp, temp - (sp.tempMax - 2));
      if (gap > 0) consider(ACT.shelter, Math.min(1, gap / 6) * 0.9 + (cold || hot ? 0.3 : 0));
      if (thirsty) consider(ACT.drink, 0.5);
      const season = !e.seasonal || (phase >= BREED_START && phase < BREED_START + BREED_LENGTH);
      const adult = this.age[i] >= sp.maturity;
      if (season && adult && en > (hunts(e) ? 0.42 : 0.6) && dens < 1) consider(ACT.mate, 0.35);
      // Dispersão: o jovem que amadurece numa célula lotada sai procurando lugar.
      // (Só de vez em quando procura o destino; achado, segue nele até chegar.)
      // Bando grande demais também se divide: os jovens adultos saem.
      const going = this.act[i] === ACT.disperse && this.goal[i] >= 0;
      const young = this.age[i] < sp.maturity * 1.4;
      const big = young && (c.herds.get(this.family[i])?.[3] ?? 0) > e.herd * 1.5;
      if (adult && (going || this.rnd() < 0.15 * this.lodStride) && (dens > 1.2 || big || (young && dens > 0.8))) consider(ACT.disperse, 0.3 + 0.3 * Math.min(1, Math.max(0.3, dens - 0.8)));
      // Bando: quem ficou longe do centro do seu bando volta para perto; sozinho e adulto, procura parceiro.
      const center = e.herd > 1 ? this.herdCenter(i, c) : null;
      const away = center ? Math.hypot(center.x, center.y) : 0;
      if (center && away > 4 + e.herd * 0.5) consider(ACT.herd, Math.min(0.6, 0.35 + away / 100));
      else if (!center && adult && en > 0.5 && this.kin(i, 8).n === 0) consider(ACT.mate, 0.33);
    } else if (best === ACT.rest) best = plants ? ACT.eat : hunts(e) ? ACT.hunt : ACT.scavenge;

    this.act[i] = best;
    switch (best) {
      case ACT.eat: {
        if (foodHere >= FOOD_MIN) {
          this.stop(i);
          this.goal[i] = -1;
          // Mancha rendendo pouco (valor marginal de Charnov): já escolhe uma melhor por perto para a próxima.
          if (this.eatHere(i, e, tile, en) < BITE * 0.35) this.goal[i] = this.nearFood(i, e, Math.min(10, 2 + e.roam / 30), foodHere * 1.5);
          if (this.goal[i] >= 0) this.headToTile(i, this.goal[i], speed);
          break;
        }
        let goal = this.goal[i];
        // Destino que não chega nunca (penhasco, água no meio): larga e procura outro.
        if (goal >= 0 && ++this.effort[i] > GOAL_TRIES) {
          this.effort[i] = 0;
          this.goal[i] = -1;
          this.roam(i, speed);
          break;
        }
        if (goal < 0 || this.foodAt(e, goal) < FOOD_MIN) {
          this.effort[i] = 0;
          // Primeiro a vizinhança (o que dá para ver); depois o mapa de comida das células, até onde
          // o bicho anda em uns dois meses (mais longe com fome crítica).
          goal = this.nearFood(i, e, Math.min(10, 2 + e.roam / 30));
          const reach = Math.max(1, Math.min(4, Math.round((e.roam * (starving ? 0.25 : 0.15)) / ECO_CELL)));
          if (goal < 0) goal = this.findFood(i, e, c, reach);
        }
        this.goal[i] = goal;
        if (goal >= 0) this.headToTile(i, goal, speed);
        else this.roam(i, speed);
        break;
      }
      case ACT.hunt:
        this.hunt(i, e, c, speed);
        break;
      case ACT.scavenge: {
        if (carcass < 0) {
          this.roam(i, speed);
          break;
        }
        const cc = this.carcasses[carcass];
        const dx = wrapDx(cc.x - this.x[i], map.width);
        const dy = cc.y - this.y[i];
        if (dx * dx + dy * dy < 1.5) {
          this.stop(i);
          this.energy[i] = Math.min(1, this.energy[i] + this.eatCarcass(i, carcass, e));
        } else this.headTo(i, dx, dy, speed);
        break;
      }
      case ACT.drink: {
        // Vai até a célula com água mais perto; os bichos se juntam nos bebedouros na seca.
        const to = this.waterCell(i, c);
        if (to) this.headTo(i, to.x, to.y, speed);
        else this.roam(i, speed);
        break;
      }
      case ACT.shelter: {
        const dir = this.comfortBias(i, temp);
        if (dir) this.headTo(i, dir.x * 8, dir.y * 8, speed);
        else this.roam(i, speed);
        break;
      }
      case ACT.mate: {
        // Vai até o adulto mais perto; com um já ao lado, fica; sem ninguém à vista, explora.
        const dir = this.seekMate(i);
        if (dir) this.headTo(i, dir.x, dir.y, speed);
        else if (this.kin(i, 3).n) this.stop(i);
        else {
          // Ninguém à vista: vai para a célula vizinha com mais bichos da espécie (o cheiro, o chamado).
          // Predador com território não vai atrás de outro bando (juntaria todos num lugar só), a não ser que a espécie esteja rara.
          const cell2 = appetite(e) < 1 && this.population[this.kind[i]] > RELICT * 3 ? -1 : this.crowdedCell(i, c);
          if (cell2 >= 0) this.headTo(i, wrapDx((cell2 % c.cols) * ECO_CELL + 8 - this.x[i], map.width), Math.floor(cell2 / c.cols) * ECO_CELL + 8 - this.y[i], speed);
          else this.roam(i, speed);
        }
        break;
      }
      case ACT.disperse: {
        let goal = this.goal[i];
        if (goal < 0) {
          goal = this.goal[i] = this.emptierCell(i, c);
          // Quem sai para um lugar novo começa um bando novo (fissão).
          if (goal >= 0) this.family[i] = ++this.nextFamily;
        }
        if (goal >= 0 && c.of((goal % map.width) + 0.5, Math.floor(goal / map.width) + 0.5, map.width) === cell) goal = this.goal[i] = -1;
        if (goal >= 0) this.headToTile(i, goal, speed);
        else {
          // Nenhum lugar menos lotado por perto: fica.
          this.act[i] = ACT.rest;
          this.loiter(i, speed);
        }
        break;
      }
      case ACT.herd: {
        const center = this.herdCenter(i, c);
        if (center) this.headTo(i, center.x, center.y, speed);
        else this.loiter(i, speed);
        break;
      }
      default:
        this.goal[i] = -1;
        this.loiter(i, speed);
    }
    this.breed(i, e, c, cell, dens, yr);
  },

  /** Come no lugar: pasto (some do tile e rebrota), insetos ou comida da costa. Devolve a energia ganha. */
  eatHere(this: Ecosystem, i: number, e: Ecology, t: number, en: number): number {
    const gain = Math.min(BITE * this.lodStride, SATED - en);
    if (gain <= 0) return 0;
    const field = Math.max(e.insects * this.insectsAt(t), Math.max(e.fish, e.plankton) * this.shoreAt(t));
    const grass = e.forage * this.forageAt(t);
    const browse = e.fruit * this.browseAt(t);
    let got: number;
    // O peso da comida na dieta diz quanto ela rende (a raposa vive mal só de frutos e insetos).
    if (field >= grass && field >= browse) got = gain * Math.min(1, field / 0.4);
    else if (browse > grass && this.cells) {
      // Ramagem e fruto: sai da célula (a mata inteira em volta), não do tile.
      const cost = GRAZE_COST * ration(e);
      const c = this.cells;
      got = (this.browseCell(c, c.of(this.x[i], this.y[i], this.map.width), gain * cost) / cost) * e.fruit;
    } else {
      const cost = GRAZE_COST * ration(e);
      got = (this.grazePatch(t, gain * cost) / cost) * e.forage;
      // Engenheiro (elefante): às vezes derruba uma árvore e abre clareira.
      if (e.engineer && this.map.vegetation[t] > B.TREE_BAND && this.rnd() < 0.08 * this.lodStride) {
        this.map.vegetation[t] = Math.max(B.TREE_BAND - 0.1, this.map.vegetation[t] - 0.15);
        this.map.biome[t] = classify(this.map, t);
        this.onTileChanged(t);
      }
    }
    this.energy[i] = Math.min(1, this.energy[i] + got);
    return got;
  },

  /** Caça: segue a presa escolhida e dá o bote quando chega perto; sem presa à vista, vai para onde há mais caça. */
  hunt(this: Ecosystem, i: number, e: Ecology, c: EcoCells, speed: number): void {
    const map = this.map;
    const w = map.width;
    const helpers = e.pack ? Math.min(4, this.kin(i, 6).n) : 0;
    let prey = this.chase[i];
    if (prey >= 0 && (!this.alive[prey] || this.kind[prey] === this.kind[i])) prey = -1;
    if (prey >= 0) {
      const dx = wrapDx(this.x[prey] - this.x[i], w);
      const dy = this.y[prey] - this.y[i];
      // Longe demais ou perseguição comprida: desiste (e descansa um pouco antes de tentar outra).
      if (dx * dx + dy * dy > 30 * 30 || ++this.effort[i] > CHASE_LIMIT) {
        this.chase[i] = -1;
        this.effort[i] = 0;
        // Guarda a presa que escapou para não voltar logo atrás dela.
        this.goal[i] = prey;
        this.stop(i);
        return;
      }
    }
    if (prey < 0) {
      prey = this.pickPrey(i, e, helpers);
      // Fôlego da perseguição: o tempo de chegar até a presa (no passo de corrida, em decisões rápidas) e mais CHASE_TRIES.
      const d = prey >= 0 ? Math.hypot(wrapDx(this.x[prey] - this.x[i], w), this.y[prey] - this.y[i]) : 0;
      const step = speed * 1.8 * (this.yearSpan / DECISIONS_PER_YEAR / 3);
      this.effort[i] = Math.max(0, CHASE_LIMIT - CHASE_TRIES - Math.ceil(d / Math.max(0.05, step)));
    }
    this.chase[i] = prey;
    if (prey < 0) {
      // Sem presa à vista: vai para a célula próxima onde há mais caça, sem ficar rodando num lugar vazio.
      const here = c.of(this.x[i], this.y[i], w);
      const S = c.stride;
      const s = this.kind[i];
      const cx = here % c.cols;
      const cy = (here - cx) / c.cols;
      // Capacidade dele ali (que conta só as presas do seu tamanho), dividida pelos da espécie que já
      // caçam ali: senão todos correm para a mesma célula e ficam num lugar já vazio.
      let best = here;
      let most = (c.K[here * S + s] / Math.max(1, c.N[here * S + s])) * 1.2;
      for (let oy = -4; oy <= 4; oy++) {
        const y = cy + oy;
        if (y < 0 || y >= c.rows) continue;
        for (let ox = -4; ox <= 4; ox++) {
          const k = y * c.cols + ((cx + ox + c.cols) % c.cols);
          const v = c.K[k * S + s] / (1 + c.N[k * S + s]) / (1 + Math.hypot(ox, oy) * 0.15);
          if (v > most) {
            most = v;
            best = k;
          }
        }
      }
      if (best !== here) this.headTo(i, wrapDx((best % c.cols) * ECO_CELL + 8 - this.x[i], w), Math.floor(best / c.cols) * ECO_CELL + 8 - this.y[i], speed);
      else this.roam(i, speed);
      return;
    }
    const dx = wrapDx(this.x[prey] - this.x[i], w);
    const dy = this.y[prey] - this.y[i];
    if (dx * dx + dy * dy > STRIKE * STRIKE) {
      // Mira um pouco à frente da presa (para onde ela está correndo).
      const lead = this.yearSpan / DECISIONS_PER_YEAR;
      this.headTo(i, dx + this.vx[prey] * lead, dy + this.vy[prey] * lead, speed * 1.8);
      return;
    }
    // O bote: chance base, mais fácil em presa frágil e em matilha.
    this.stop(i);
    // Tipo III de Holling: presa rara à vista (sozinha, longe do grupo) é mais difícil de pegar.
    // E presa abaixo da capacidade da região ocupa só os melhores esconderijos: a caça falha mais.
    const pk = this.kind[prey];
    // E a espécie já escassa no planeta (abaixo da metade do que a terra sustenta) sobra nos refúgios: a caça cai junto.
    let spare = 1;
    if (this.wild(pk)) {
      const scarce = Math.min(1, this.population[pk] / Math.max(1, c.total[pk] * 0.5));
      spare = Math.min(1, 0.4 + this.crowding(c, c.of(this.x[prey], this.y[prey], w), pk, ecologyOf(this.species[pk]).herd) / 0.8) * Math.max(0.05, scarce * scarce);
    }
    const chance = Math.min(0.9, HUNT_SUCCESS * this.vulnerable(prey) * (1 + 0.25 * helpers) * (0.4 + 0.6 * this.preyAbundance) * spare);
    if (this.rnd() < chance) {
      const young = this.age[prey] < this.species[this.kind[prey]].maturity;
      const kg = ecologyOf(this.species[this.kind[prey]]).mass * EDIBLE * (young ? 0.3 : 1);
      const at = c.of(this.x[prey], this.y[prey], w);
      this.fear[at] = Math.min(3, this.fear[at] + 1);
      this.leaveCarcass(prey, kg);
      this.kill(prey, false, 'predador');
      this.chase[i] = -1;
      this.effort[i] = 0;
      const k = this.carcasses.length - 1;
      if (k >= 0) {
        this.energy[i] = Math.min(1, this.energy[i] + this.eatCarcass(i, k, e));
        // A matilha come junto: quem do bando está perto e com fome divide a presa.
        if (e.pack) {
          const s = this.kind[i];
          this.forEachNear(this.x[i], this.y[i], 8, (j) => {
            if (j === i || this.kind[j] !== s || this.family[j] !== this.family[i] || this.energy[j] >= HUNGRY) return;
            this.energy[j] = Math.min(1, this.energy[j] + this.eatCarcass(j, k, e));
          });
        }
      }
    } else {
      // Errou: a presa dispara e o caçador cansa.
      this.energy[i] -= 0.01;
      const pe = ecologyOf(this.species[this.kind[prey]]);
      if (this.wild(this.kind[prey])) {
        this.act[prey] = ACT.flee;
        this.headTo(prey, dx * 4, dy * 4, this.pace(pe, this.species[this.kind[prey]]) * 1.6);
      }
    }
  },

  /** Sem destino: segue mais ou menos na mesma direção (explora em vez de rodar no lugar). */
  roam(this: Ecosystem, i: number, speed: number): void {
    const v = Math.hypot(this.vx[i], this.vy[i]);
    let a = this.rnd() * Math.PI * 2;
    if (v > 0.05) a = Math.atan2(this.vy[i], this.vx[i]) + (this.rnd() - 0.5) * 0.8;
    // Se o caminho em frente está fechado (penhasco, água), tenta outros rumos.
    for (let k = 0; k < 8 && !this.reachable(i, Math.cos(a), Math.sin(a), 3); k++) a += Math.PI / 4 + (this.rnd() - 0.5) * 0.4;
    this.vx[i] = Math.cos(a) * speed * 0.8;
    this.vy[i] = Math.sin(a) * speed * 0.8;
  },

  /**
   * Descansando: fica parado ou vai andando devagar, pastando pelo caminho, num
   * rumo que muda pouco de uma decisão para outra (o bando atravessa a área de vida
   * em vez de rodar no lugar).
   */
  loiter(this: Ecosystem, i: number, speed: number): void {
    // Caçadores descansam no território (de tocaia); pastadores vão pastando adiante.
    if (this.rnd() < (hunts(ecologyOf(this.species[this.kind[i]])) ? 0.75 : 0.3)) return this.stop(i);
    // O bando inteiro vai para o mesmo lado, que muda a cada estação (sorteio pela família e pela estação).
    const h = Math.imul(this.family[i] ^ Math.floor(this.year * 4), 2654435761) >>> 0;
    const a = (h / 4294967296) * Math.PI * 2 + (this.rnd() - 0.5) * 0.6;
    this.aimX[i] = Math.cos(a);
    this.aimY[i] = Math.sin(a);
    this.vx[i] = this.aimX[i] * speed * 0.5;
    this.vy[i] = this.aimY[i] * speed * 0.5;
  },
};
export type FaunaDecidePart = typeof faunaDecidePart;
