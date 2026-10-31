/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): decisão e passeio das pessoas (inteligentes) e da fauna aquática.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { happens } from '../../stochastic';
import { temperatureAt } from '../../../procgen/surface';
import { CHILD, ROLE } from '../../roles';
import { inheritTraits } from '../../../ai/traits';
import { partnerOf } from '../../../ai/relations';
import { SOCIAL } from '../../../ai/tuning';
import type { DeathCause } from '../../people';
import { welfare } from '../../needs';
import { wrapDx } from '../../settlement';
import { ecologyOf } from '../../fauna';
import * as constantsModule from '../constants';
import * as helpersModule from '../helpers';
import * as tilesModule from '../tiles';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { BEHAVIOUR, CELL } = constantsModule;
const { lifespan, elderAge } = helpersModule;
const { isWater } = tilesModule;

export const peopleDecidePart = {
  wander(this: Ecosystem, i: number, speed: number, bias?: { x: number; y: number }): void {
    this.aimX[i] = bias ? bias.x : 0;
    this.aimY[i] = bias ? bias.y : 0;
    const a = this.rnd() * Math.PI * 2;
    let dx = Math.cos(a);
    let dy = Math.sin(a);
    const v = Math.hypot(this.vx[i], this.vy[i]);
    // Contornando um obstáculo: segue rente a ele mais um pouco antes de voltar a mirar o destino (seção 19.18).
    if (this.detour[i] > 0 && v > 0.05) {
      const go = Math.max(v, speed * 0.6);
      this.vx[i] = (this.vx[i] / v) * go;
      this.vy[i] = (this.vy[i] / v) * go;
      return;
    }
    // Sem destino, segue mais ou menos na mesma direção: explora o mapa em vez de rodar no lugar.
    if (!bias && v > 0.05) {
      dx = dx * 0.45 + (this.vx[i] / v) * 0.55;
      dy = dy * 0.45 + (this.vy[i] / v) * 0.55;
    }
    if (bias) {
      dx = dx * 0.4 + bias.x * 0.6;
      dy = dy * 0.4 + bias.y * 0.6;
    }
    const len = Math.hypot(dx, dy) || 1;
    const go = this.rnd() < 0.15 ? 0 : speed * (0.5 + this.rnd() * 0.5);
    this.vx[i] = (dx / len) * go;
    this.vy[i] = (dy / len) * go;
  },

  decide(this: Ecosystem, i: number, dt: number): void {
    const map = this.map;
    const s = this.kind[i];
    const sp = this.species[s];
    const b = BEHAVIOUR[sp.kind];
    const tile = this.tileOf(i);
    const temp = temperatureAt(map, tile);
    let e = this.energy[i] - b.metabolism * dt;
    if (temp < sp.tempMin || temp > sp.tempMax) e -= 0.2 * dt;
    // O habitat pode ter mudado por baixo da criatura (terraformação).
    if (!this.canStand(s, tile)) e -= 0.6 * dt;

    // Fora do clima da espécie (ou na beirada dele), todo bicho procura um lugar melhor.
    const outside = temp < sp.tempMin || temp > sp.tempMax;
    const comfort = temp < sp.tempMin + 2 || temp > sp.tempMax - 2 ? this.comfortBias(i, temp) : undefined;
    // Adulto bem alimentado e sem parceiro por perto vai atrás de um (às vezes, para poupar tempo).
    const mate = sp.kind !== 'sapient' && e > 0.55 && this.age[i] >= sp.maturity && this.rnd() < 0.35 ? this.seekMate(i) : undefined;

    switch (sp.kind) {
      case 'fish': {
        // Plâncton: o mar alimenta bem um peixe sozinho e mal um cardume apertado,
        // então a população fica abaixo do teto e oscila com tubarões, pesca e clima.
        if (isWater(map, tile)) {
          let school = 0;
          this.forEachNear(this.x[i], this.y[i], 3, (j) => {
            if (this.species[this.kind[j]].kind === 'fish') school++;
          });
          e += (0.075 * dt) / (1 + school / 5);
        }
        this.wander(i, sp.speed, comfort ?? mate);
        break;
      }
      case 'shark': {
        // Filtrador (a baleia) vive do plâncton: nada devagar pelo mar aberto, sem caçar nem atacar barcos.
        if (ecologyOf(sp).guild === 'filtrador') {
          if (isWater(map, tile)) e += 0.03 * dt;
          this.wander(i, sp.speed * 0.5, comfort ?? mate);
          break;
        }
        // Caça peixes e ataca barcos que passam perto; lulas e carniça cobrem parte da fome.
        if (isWater(map, tile)) e += 0.014 * dt;
        let prey = -1;
        let pd = Infinity;
        let pdx = 0;
        let pdy = 0;
        this.forEachNear(this.x[i], this.y[i], e < 0.4 ? 24 : 12, (j, dx, dy) => {
          if (this.species[this.kind[j]].kind !== 'fish') return;
          const d = dx * dx + dy * dy;
          if (d < pd) {
            pd = d;
            prey = j;
            pdx = dx;
            pdy = dy;
          }
        });
        const boat = e < 0.6 ? this.boatNear(this.x[i], this.y[i], 6) : null;
        if (boat) {
          const dx = wrapDx(boat.x - this.x[i], map.width);
          const dy = boat.y - this.y[i];
          const d = Math.hypot(dx, dy) || 1;
          if (d < 1.2) {
            this.sharkAttack(boat, sp.name);
            e += 0.4;
          }
          this.vx[i] = (dx / d) * sp.speed;
          this.vy[i] = (dy / d) * sp.speed;
        } else if (prey >= 0 && pd < 2.25) {
          // Dá o bote a até 1,5 tile.
          this.kill(prey, false, 'predador');
          e += 0.9;
          this.wander(i, sp.speed * 0.3);
        } else if (prey >= 0 && e < 0.85 && !outside) {
          const len = Math.sqrt(pd) || 1;
          this.vx[i] = (pdx / len) * sp.speed;
          this.vy[i] = (pdy / len) * sp.speed;
        } else {
          this.wander(i, sp.speed * (e < 0.5 ? 0.8 : 0.5), comfort ?? (e < 0.5 ? undefined : mate));
        }
        break;
      }
      case 'sapient': {
        // Sozinho (solto pelo jogador): procura um assentamento do seu povo ou funda um.
        const lone = this.village[i] < 0 ? this.loner(i) : undefined;
        const v = this.village[i] >= 0 ? this.villages[this.village[i]] : null;
        const era = Math.floor(v?.tech ?? 0);
        const veg = map.vegetation[tile];
        // Quem vive num assentamento belisca pouco no mato: o grosso da comida vem do estoque (seção 19.19).
        // Sozinho no mato, vive do que acha.
        if (v) {
          // Um bando pequeno ainda vive do mato; com mais gente em volta, cada um acha menos.
          if (veg > 0.25 || (e < 0.5 && v.food < 1 && veg > 0.12)) e += Math.max(B.FORAGE, B.FORAGE_WILD / (1 + v.population / B.FORAGE_CROWD)) * dt;
          if (this.nearWater(tile)) e += B.SHORE_FORAGE * dt;
          // Inverno frio sem lenha.
          if (v.chill) e -= B.FREEZE * v.chill * dt;
        } else {
          if (veg > 0.1) e += 0.06 * dt;
          if (this.nearWater(tile)) e += 0.05 * dt;
        }
        // Quem tem fome come o peixe que os barcos trouxeram.
        if (v && v.food >= 1 && e < 0.6) {
          v.food -= 1;
          this.book(v, 'food', 0, 1);
          e += 0.35;
        }
        // Crianças ganham uma profissão ao virar adultas.
        if (v && this.role[i] === CHILD && this.age[i] >= sp.maturity) this.role[i] = this.firstRole(v, era, i);
        const elder = this.age[i] >= elderAge(sp, era);
        const working = this.role[i] !== CHILD && !elder;
        let bias: { x: number; y: number } | undefined = lone;
        // Com uma ordem presencial, anda reto até o alvo (sem o vaivém do passeio) e fica parado trabalhando.
        let direct = false;
        if (v) {
          let dx = v.x - this.x[i];
          if (dx > map.width / 2) dx -= map.width;
          else if (dx < -map.width / 2) dx += map.width;
          let dy = v.y - this.y[i];
          const role = this.role[i];
          if (this.jobKind[i] && !this.jobFits(i, v, role, working)) this.dropJob(i);
          // Crianças, idosos, soldados, guardas e líderes ficam perto do centro; pescadores, perto do porto.
          let range = this.radius(v) * (role >= ROLE.soldier || !working ? 0.4 : 0.8);
          if (working && B.PRESENCE_BUILD && this.canBuildHere(v, role) && this.pickBuildJob(i, v)) {
            // Construtores vão à obra e ficam batendo nela até terminar (seção 19.21).
            [dx, dy] = this.jobDelta(i);
            range = B.BUILD_REACH * 0.6;
            direct = true;
          } else if (role === ROLE.fisher && v.port >= 0) {
            dx = wrapDx((v.port % map.width) + 0.5 - this.x[i], map.width);
            dy = Math.floor(v.port / map.width) + 0.5 - this.y[i];
            range = 4;
          } else if (role === ROLE.miner && working && v.mines.length) {
            // Mineradores trabalham na mina do assentamento.
            const d = this.deposits[v.mines[i % v.mines.length]];
            dx = wrapDx(d.x + 0.5 - this.x[i], map.width);
            dy = d.y + 0.5 - this.y[i];
            range = 2;
          } else if (role === ROLE.woodcutter && working && B.PRESENCE_WOOD) {
            // Lenhadores pegam uma ordem (derrubar ou plantar) e só então vão à mata (seção 19.21).
            if (this.pickJob(i, v) >= 0) {
              [dx, dy] = this.jobDelta(i);
              range = B.JOB_REACH * 0.5;
              direct = true;
            }
          } else if (role === ROLE.woodcutter && working && (v.fellAt ?? -1) >= 0) {
            // Lenhadores vão até a mata onde a próxima árvore vai cair (seção 19.19).
            const t = v.fellAt!;
            dx = wrapDx((t % map.width) + 0.5 - this.x[i], map.width);
            dy = Math.floor(t / map.width) + 0.5 - this.y[i];
            range = 2.5;
          } else if (role === ROLE.gatherer && working) {
            // Coletores andam até onde ainda há o que colher, além da borda.
            range = this.radius(v) + B.GATHER_REACH * 0.6;
          } else if (working && (role === ROLE.hunter || role === ROLE.miner)) {
            // Caçadores e mineradores sem mina exploram longe de casa, mais longe a cada era.
            range = this.radius(v) * (role === ROLE.miner ? 2.5 : 1.8) * (1 + 0.25 * era);
          }
          if (working && role <= ROLE.miner && this.rnd() < 0.3) this.discover(i, v);
          const scout = this.scoutTarget(i, v);
          if (scout) {
            dx = scout.x;
            dy = scout.y;
            range = 2;
          }
          const march = this.soldier(i, v);
          if (!this.alive[i]) return;
          if (march) {
            dx = march.x;
            dy = march.y;
            range = 2;
          }
          // Modo completo (RF-AS-20 a 31): a jornada decide para onde ir e quando parar para o gesto.
          if (!march && !scout && this.full(v) && !this.expedition.has(i)) {
            const j = this.journey(i, v, working, dt);
            if (j) {
              dx = j.x;
              dy = j.y;
              range = 0;
              direct = true;
            }
          } else if (this.day[i]) this.dropDay(i, v);
          if (dx * dx + dy * dy > range * range) bias = { x: dx, y: dy };
          // Caçadores abatem herbívoros por perto; com fome e sem comida no celeiro, qualquer adulto caça.
          if (((role === ROLE.hunter && working) || (this.role[i] !== CHILD && e < 0.4 && v.food < 1)) && e < 0.8) {
            let prey = -1;
            const c = this.cells?.ready ? this.cells : null;
            this.forEachNear(this.x[i], this.y[i], 3, (j) => {
              // Caça sustentável: só abate onde a espécie está acima da metade do que a região sustenta.
              const k = this.kind[j];
              if (prey >= 0 || this.species[k].kind !== 'herbivore') return;
              const ok = c ? this.crowding(c, c.of(this.x[j], this.y[j], map.width), k, ecologyOf(this.species[k]).herd) > 0.5 : this.population[k] > this.caps[k] * 0.25;
              if (ok) prey = j;
            });
            // Sem caça por perto: o caçador vai para a célula vizinha com mais caça sobrando (o entorno esvaziado obriga a ir longe).
            if (prey < 0 && role === ROLE.hunter && c && !march) bias = this.gameCell(i, c) ?? bias;
            if (prey >= 0) {
              this.kill(prey, false, 'predador');
              // A carne vai para o estoque e alimenta o assentamento (seção 19.19); a caça também dá peles.
              e += B.HUNT_EAT;
              const meat = this.put(v, 'food', B.HUNT_FOOD);
              this.book(v, '_hunt', meat, 0);
              this.pickUp(i, v, 'food', meat);
              this.gain(v, 'hides', 1);
            }
          }
        }
        // Sozinho e com fome: procura onde há o que comer (verde ou água), como os outros bichos.
        if (!v && e < 0.5) bias = this.betterSite(i) ?? bias;
        // Fora do clima, mesmo com assentamento, primeiro se protege.
        if (comfort && (!v || e < 0.4)) bias = comfort;
        const walk = sp.speed * B.WALK_PACE;
        if (direct && bias) this.walkTo(i, walk, bias.x, bias.y);
        else if (direct) this.stand(i);
        else this.wander(i, walk * (this.role[i] === CHILD ? 0.8 : elder ? 0.55 : 1), bias);
        // Muito tempo travado na beira da água com o destino do outro lado: corta árvores e faz uma jangada.
        if (this.stuck[i] >= B.RAFT_STUCK && this.role[i] !== CHILD && this.tryRaft(i)) return;
        break;
      }
    }

    this.energy[i] = Math.min(1, e);
    const v = this.village[i];
    const era = v >= 0 ? Math.floor(this.villages[v].tech) : 0;
    const life = lifespan(sp, era);
    const old = this.age[i] > life * (0.85 + 0.3 * ((i * 2654435761) % 1000) / 1000);
    if (this.energy[i] <= 0 || old) {
      const cold = v >= 0 && (this.villages[v].chill ?? 0) > 0.3 && (this.villages[v].food ?? 0) >= 1;
      const cause: DeathCause = this.energy[i] > 0 ? 'velhice' : cold ? 'frio' : 'fome';
      if (v >= 0 && this.villages[v].population === 1) this.villages[v].lastCause = cause === 'velhice' ? 'de velhice' : cause === 'frio' ? 'de frio' : 'de fome';
      this.kill(i, false, cause);
      return;
    }
    // Reprodução (idosos não têm filhos).
    const fertile = this.age[i] >= sp.maturity && (sp.kind !== 'sapient' || this.age[i] < elderAge(sp, era));
    // Necessidades mal atendidas freiam a natalidade dos inteligentes (RF-VIDA-210).
    const needs = v >= 0 ? this.villages[v].needs : undefined;
    // Com gente passando fome quase não nascem filhos (evolução dos povos): o povo para de crescer antes de morrer de fome.
    // Conta quem comeu bem, não o celeiro: celeiro vazio com todo mundo comendo não segura os nascimentos.
    const share = v >= 0 ? this.villages[v].fedShare : undefined;
    const fed = share !== undefined ? Math.min(1, Math.max(0.05, (share - B.BIRTH_FED_MIN) / (B.BIRTH_FED_FULL - B.BIRTH_FED_MIN))) : 1;
    // Filhos vêm dos casais (IA local, relações): casado tem SOCIAL.coupleBirth, solteiro só SOCIAL.singleBirth.
    const partner = sp.kind === 'sapient' ? partnerOf(this.bonds, this.uid[i]) : 0;
    const couple = sp.kind !== 'sapient' ? 1 : partner ? SOCIAL.coupleBirth : SOCIAL.singleBirth;
    const content = (needs ? (0.5 + 0.5 * welfare(needs)) * fed : 1) * couple;
    if (fertile && this.energy[i] > 0.65 && happens(this.rnd, b.birthRate * this.fertility(s, era) * content, dt)) {
      // Precisa de um parceiro adulto por perto (do mesmo assentamento, para os inteligentes).
      // Bichos acham o parceiro num raio maior (o cheiro e o chamado vão longe).
      let crowd = 0;
      let mates = 0;
      let mate = -1;
      const reach = sp.kind === 'sapient' ? CELL : CELL * 1.5;
      this.forEachNear(this.x[i], this.y[i], reach, (j, dx, dy) => {
        if (this.kind[j] !== s) return;
        if (dx * dx + dy * dy <= CELL * CELL) crowd++;
        if (j !== i && this.age[j] >= sp.maturity && (sp.kind !== 'sapient' || this.village[j] === v)) {
          mates++;
          mate = j;
        }
      });
      if (!mates || (sp.kind === 'sapient' && v < 0)) return;
      // Casas de eras mais avançadas e com andares a mais abrigam mais gente (sobrados, prédios).
      const housed = v < 0 || this.villages[v].population < this.housing(this.villages[v]);
      // Inteligentes não têm teto de aglomeração: quem limita são as casas (uma cidade densa também tem filhos).
      if ((sp.kind === 'sapient' || crowd < b.crowd) && housed) {
        const child = this.spawn(s, this.x[i] + (this.rnd() - 0.5), this.y[i] + (this.rnd() - 0.5), v);
        if (child >= 0) {
          this.energy[i] -= 0.3;
          this.parent[child] = this.uid[i];
          this.family[child] = this.family[i];
          // Os filhos lembram os pais sem ser cópia (IA local: herança dos traços); o outro pai é o cônjuge, se houver.
          const spouse = partner ? this.indexOfUid(partner) : -1;
          if (spouse >= 0 && this.village[spouse] === v) mate = spouse;
          if (sp.kind === 'sapient') inheritTraits(this.traits, child, i, mate, this.mindRnd, v >= 0 ? this.villages[v].culture.value : undefined);
        }
      }
    }
  },
};
export type PeopleDecidePart = typeof peopleDecidePart;
