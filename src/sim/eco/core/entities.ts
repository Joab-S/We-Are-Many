/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): espécies, nascimento, morte, movimento e grade espacial das criaturas.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import * as surfaceModule from '../../../procgen/surface';
import { CHILD, pickRole, ROLE } from '../../roles';
import { randomTraits, TRAIT_COUNT } from '../../../ai/traits';
import { emptyVital, type Exit } from '../../people';
import { habitatOf, type Species } from '../../species';
import { DECISIONS_PER_YEAR } from '../../fauna';
import * as constantsModule from '../constants';
import * as tilesModule from '../tiles';

// Cópias locais dos valores importados (eco/*, superfície, papéis...; o porquê está em ecosystem.ts).
const { temperatureAt } = surfaceModule;
const { MAX_CLIMB } = B;
const { BEHAVIOUR, CELL, THINK_INTERVAL, MIN_CAP, RELICT } = constantsModule;
const { isWater, isLand } = tilesModule;

/**
 * Resultado de `gatherNear`: as criaturas achadas e o deslocamento de cada uma, num rascunho do módulo
 * (sem closure nem alocação por consulta). Vale até a próxima chamada: quem percorre não pode consultar de novo.
 */
export const NEAR = { n: 0, i: new Int32Array(256), dx: new Float64Array(256), dy: new Float64Array(256) };

/** Dobra o rascunho `NEAR` (fora do laço quente, para não atrapalhar a otimização dele). */
function growNear(): void {
  const n = NEAR.i.length * 2;
  const i = new Int32Array(n);
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  i.set(NEAR.i);
  dx.set(NEAR.dx);
  dy.set(NEAR.dy);
  NEAR.i = i;
  NEAR.dx = dx;
  NEAR.dy = dy;
}

export const entitiesPart = {
  addSpecies(this: Ecosystem, sp: Species): number {
    const existing = this.species.findIndex((s) => s.id === sp.id);
    if (existing >= 0) return existing;
    this.species.push(sp);
    this.population.push(0);
    this.habitat.push(habitatOf(sp));
    this.everLived.push(false);
    this.caps.push(0);
    // Espécies do mesmo tipo dividem o habitat: o teto de cada uma cai.
    this.species.forEach((o, s) => {
      if (o.kind === sp.kind) this.caps[s] = this.habitatCap(o);
    });
    this.onSpecies(sp);
    return this.species.length - 1;
  },

  habitatCap(this: Ecosystem, sp: Species): number {
    const map = this.map;
    const mode = habitatOf(sp);
    let area = 0;
    for (let i = 0; i < map.elevation.length; i += 4) {
      const water = isWater(map, i);
      if (mode === 2 ? water || isLand(map, i) : mode === 1 ? water : isLand(map, i)) area += 4;
    }
    // Inteligentes: o teto é largo; quem limita cada assentamento são as casas.
    // Tiles por indivíduo: o peixe precisa de bem mais mar do que antes (o mar não é infinito),
    // e bichos de terra e predadores ganham mais espaço, para nenhuma espécie ficar com meia dúzia.
    const per = { fish: 260, herbivore: 90, predator: 600, shark: 2600, sapient: 80 }[sp.kind];
    const sameKind = this.species.filter((o) => o.kind === sp.kind).length;
    // O pasto (ou a caça) é o mesmo: a soma das espécies do tipo fica um pouco acima do teto de uma só.
    const share = sp.kind === 'sapient' ? 1 : 2 / (sameKind + 1);
    // Anfíbios ficam na costa: uma fração da área.
    const coast = mode === 2 ? 0.3 : 1;
    return Math.max(MIN_CAP, Math.min(BEHAVIOUR[sp.kind].cap * share, Math.round((area / per) * share * coast)));
  },

  /** Se a espécie `s` pode estar no tile (terra, água ou, para anfíbios, a costa). */
  canStand(this: Ecosystem, s: number, i: number): boolean {
    const mode = this.habitat[s];
    if (mode === 0) return isLand(this.map, i);
    if (mode === 1) return isWater(this.map, i);
    // Anfíbios: terra perto da água ou água rasa.
    return isLand(this.map, i) ? this.map.elevation[i] < 0.25 : isWater(this.map, i) && this.map.elevation[i] > -0.2;
  },

  /**
   * Se a espécie `s` consegue ir do tile `from` ao vizinho `to` (seção 19.18):
   * o destino precisa ser do habitat e, em terra, o desnível não pode ser um
   * penhasco. Descer aguenta o dobro de subir (escorrega, pula); quem está
   * num tile que deixou de ser do habitat pode sair por qualquer lado.
   */
  canStep(this: Ecosystem, s: number, from: number, to: number): boolean {
    if (!this.canStand(s, to)) return false;
    if (from === to || this.habitat[s] === 1 || !this.canStand(s, from)) return true;
    const a = this.map.elevation[from];
    const b = this.map.elevation[to];
    if (a < 0 || b < 0) return true;
    return b - a <= MAX_CLIMB && a - b <= MAX_CLIMB * 2;
  },

  /**
   * Bateu num obstáculo (água, penhasco, borda do habitat): em vez de voltar
   * para trás e tentar de novo o mesmo caminho, vira 45°, 90° ou 135° para o
   * lado que já vinha contornando e segue por ali por DETOUR_SECONDS. Assim a
   * criatura costeia o obstáculo até achar a passagem. Retorna se achou saída.
   */
  steer(this: Ecosystem, i: number, here: number, dt: number): boolean {
    const s = this.kind[i];
    const speed = Math.hypot(this.vx[i], this.vy[i]);
    if (speed < 0.01) return false;
    const a0 = Math.atan2(this.vy[i], this.vx[i]);
    const side = this.side[i] || (this.rnd() < 0.5 ? 1 : -1);
    const look = Math.max(0.8, speed * dt * 2);
    const w = this.map.width;
    for (let k = 1; k <= 4; k++) {
      for (const sign of k === 4 ? [side] : [side, -side]) {
        const a = a0 + sign * k * (Math.PI / 4);
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        const t = this.tileAt(this.x[i] + dx * look, Math.floor(this.y[i] + dy * look));
        if (t < 0 || t === here || !this.canStep(s, here, t)) continue;
        this.vx[i] = dx * speed;
        this.vy[i] = dy * speed;
        this.side[i] = sign;
        this.detour[i] = B.DETOUR_SECONDS;
        const nx = this.x[i] + this.vx[i] * dt;
        const ny = this.y[i] + this.vy[i] * dt;
        const nt = this.tileAt(nx, Math.floor(ny));
        if (nt >= 0 && (nt === here || this.canStep(s, here, nt))) {
          this.x[i] = ((nx % w) + w) % w;
          this.y[i] = ny;
        }
        return true;
      }
    }
    return false;
  },

  /** População inicial, proporcional ao habitat disponível. */
  populate(this: Ecosystem): void {
    const map = this.map;
    const n = map.width * map.height;
    let water = 0;
    let green = 0;
    for (let i = 0; i < n; i += 4) {
      if (isWater(map, i)) water++;
      else if (map.vegetation[i] > 0.3) green++;
    }
    water *= 4;
    green *= 4;
    this.populateWild();
    this.species.forEach((sp, s) => {
      if (this.wild(s)) return;
      const target = { fish: water / 220, herbivore: green / 260, predator: green / 2200, shark: water / 9000, sapient: 0 }[sp.kind];
      const amount = sp.kind === 'sapient' ? 0 : Math.min(this.caps[s] * 0.6, Math.max(Math.round(target), Math.min(12, this.caps[s] * 0.4)));
      // Em bandos, cardumes e matilhas: sozinhos espalhados, os bichos nunca se achavam para ter filhotes.
      const group = { fish: 6, herbivore: 5, predator: 3, shark: 2, sapient: 1 }[sp.kind];
      for (let k = 0; k < amount; k += group) {
        const tile = this.findTile(s, Math.floor(this.rnd() * n), 40);
        if (tile < 0) continue;
        for (let g = 0; g < group && k + g < amount; g++) {
          const near = this.tileAt((tile % map.width) + Math.floor((this.rnd() - 0.5) * 5), Math.floor(tile / map.width) + Math.floor((this.rnd() - 0.5) * 5));
          this.spawnAtTile(s, near >= 0 && this.habitable(s, near) ? near : tile, -1, this.rnd() * sp.maxAge * 0.6);
        }
      }
      if (sp.kind === 'sapient') {
        const villages = Math.max(2, Math.min(6, Math.round(green / 60000)));
        for (let v = 0; v < villages; v++) {
          for (let t = 0; t < 20; t++) {
            const tile = this.findTile(s, Math.floor(this.rnd() * n), 400, true);
            const tx = tile % map.width;
            const ty = Math.floor(tile / map.width);
            if (tile < 0 || !this.canSettle(s, tx, ty)) continue;
            this.foundVillage(s, tx, ty, 8);
            break;
          }
        }
      }
    });
  },

  /** Procura um tile habitável perto de `start` (tentativas aleatórias). */
  findTile(this: Ecosystem, s: number, start: number, tries: number, fertile = false): number {
    const map = this.map;
    const w = map.width;
    for (let t = 0; t < tries; t++) {
      const i = t === 0 ? start : Math.floor(this.rnd() * w * map.height);
      if (this.habitable(s, i) && (!fertile || map.vegetation[i] > 0.3)) return i;
    }
    return -1;
  },

  habitable(this: Ecosystem, s: number, i: number): boolean {
    const sp = this.species[s];
    if (!this.canStand(s, i)) return false;
    const t = temperatureAt(this.map, i);
    return t >= sp.tempMin - 5 && t <= sp.tempMax + 5;
  },

  grow(this: Ecosystem, capacity: number): void {
    const copy = <T extends Float32Array | Uint8Array | Int8Array | Int16Array | Int32Array | Uint32Array>(a: T, make: (n: number) => T): T => {
      const b = make(capacity);
      b.set(a);
      return b;
    };
    this.x = copy(this.x, (n) => new Float32Array(n));
    this.y = copy(this.y, (n) => new Float32Array(n));
    this.vx = copy(this.vx, (n) => new Float32Array(n));
    this.vy = copy(this.vy, (n) => new Float32Array(n));
    this.age = copy(this.age, (n) => new Float32Array(n));
    this.energy = copy(this.energy, (n) => new Float32Array(n));
    this.think = copy(this.think, (n) => new Float32Array(n));
    this.kind = copy(this.kind, (n) => new Uint8Array(n));
    this.alive = copy(this.alive, (n) => new Uint8Array(n));
    this.village = copy(this.village, (n) => new Int16Array(n));
    this.role = copy(this.role, (n) => new Uint8Array(n));
    this.uid = copy(this.uid, (n) => new Uint32Array(n));
    this.parent = copy(this.parent, (n) => new Uint32Array(n));
    this.family = copy(this.family, (n) => new Uint32Array(n));
    this.bornAt = copy(this.bornAt, (n) => new Int16Array(n));
    this.bornYear = copy(this.bornYear, (n) => new Float32Array(n));
    this.movedAt = copy(this.movedAt, (n) => new Float32Array(n));
    this.detour = copy(this.detour, (n) => new Float32Array(n));
    this.side = copy(this.side, (n) => new Int8Array(n));
    this.stuck = copy(this.stuck, (n) => new Float32Array(n));
    this.aimX = copy(this.aimX, (n) => new Float32Array(n));
    this.aimY = copy(this.aimY, (n) => new Float32Array(n));
    this.jobKind = copy(this.jobKind, (n) => new Uint8Array(n));
    this.job = copy(this.job, (n) => new Int32Array(n));
    this.jobWork = copy(this.jobWork, (n) => new Float32Array(n));
    this.jobWait = copy(this.jobWait, (n) => new Float32Array(n));
    this.home = copy(this.home, (n) => new Int32Array(n));
    this.origin = copy(this.origin, (n) => new Int32Array(n));
    this.day = copy(this.day, (n) => new Uint8Array(n));
    this.dayAt = copy(this.dayAt, (n) => new Int32Array(n));
    this.dayLeg = copy(this.dayLeg, (n) => new Uint8Array(n));
    this.dayTime = copy(this.dayTime, (n) => new Float32Array(n));
    this.carry = copy(this.carry, (n) => new Uint8Array(n));
    this.carryAmt = copy(this.carryAmt, (n) => new Float32Array(n));
    this.needRest = copy(this.needRest, (n) => new Float32Array(n));
    this.needSocial = copy(this.needSocial, (n) => new Float32Array(n));
    this.needFaith = copy(this.needFaith, (n) => new Float32Array(n));
    this.gesture = copy(this.gesture, (n) => new Uint8Array(n));
    this.act = copy(this.act, (n) => new Uint8Array(n));
    this.goal = copy(this.goal, (n) => new Int32Array(n));
    this.chase = copy(this.chase, (n) => new Int32Array(n));
    this.chaseUid = copy(this.chaseUid, (n) => new Uint32Array(n));
    this.escaped = copy(this.escaped, (n) => new Uint32Array(n));
    this.effort = copy(this.effort, (n) => new Uint8Array(n));
    this.parasite = copy(this.parasite, (n) => new Float32Array(n));
    const traits = new Int8Array(capacity * TRAIT_COUNT);
    traits.set(this.traits);
    this.traits = traits;
    // A grade pode estar em uso no meio de um passo: copiar, nunca zerar (zeros criariam um laço infinito).
    const next = new Int32Array(capacity).fill(-1);
    next.set(this.gridNext);
    this.gridNext = next;
    this.capacity = capacity;
  },

  spawn(this: Ecosystem, s: number, x: number, y: number, village = -1, age = 0): number {
    // Cada era (agricultura, cidades, indústria) sustenta mais gente.
    const era = village >= 0 ? Math.floor(this.villages[village].tech) : 0;
    if (this.population[s] >= this.caps[s] * (1 + 0.3 * era)) return -1;
    const w = this.map.width;
    x = ((x % w) + w) % w;
    y = Math.max(0.01, Math.min(this.map.height - 0.01, y));
    const t0 = this.tileAt(x, Math.floor(y));
    if (t0 < 0 || !this.canStand(s, t0)) {
      if (village >= 0 && this.canStand(s, this.tileAt(this.villages[village].x, Math.floor(this.villages[village].y)))) {
        x = this.villages[village].x;
        y = this.villages[village].y;
      } else {
        let fixed = false;
        const bx = Math.floor(x);
        const by = Math.floor(y);
        for (let r = 1; r <= 3 && !fixed; r++) {
          for (let oy = -r; oy <= r && !fixed; oy++) {
            for (let ox = -r; ox <= r && !fixed; ox++) {
              const nt = this.tileAt(bx + ox, by + oy);
              if (nt >= 0 && this.canStand(s, nt)) {
                x = (((bx + ox + 0.5) % w) + w) % w;
                y = by + oy + 0.5;
                fixed = true;
              }
            }
          }
        }
        if (!fixed) return -1;
      }
    }
    let i = this.free.pop();
    if (i === undefined) {
      if (this.count >= this.capacity) this.grow(this.capacity * 2);
      i = this.count++;
    }
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.age[i] = age;
    this.energy[i] = 0.6 + this.rnd() * 0.3;
    this.think[i] = this.rnd() * (this.wild(s) ? this.yearSpan / DECISIONS_PER_YEAR : THINK_INTERVAL);
    this.kind[i] = s;
    this.alive[i] = 1;
    this.village[i] = village;
    if (village >= 0) this.residentIndex.dirty = true;
    this.uid[i] = ++this.nextUid;
    this.uidIndex.set(this.uid[i], i);
    this.parent[i] = 0;
    this.family[i] = ++this.nextFamily;
    this.bornAt[i] = age === 0 ? village : -1;
    this.bornYear[i] = this.year - age;
    this.movedAt[i] = -1;
    this.detour[i] = 0;
    this.side[i] = 0;
    this.stuck[i] = 0;
    this.aimX[i] = 0;
    this.aimY[i] = 0;
    this.jobKind[i] = 0;
    this.jobWork[i] = 0;
    this.jobWait[i] = 0;
    this.home[i] = -1;
    this.origin[i] = village;
    this.day[i] = 0;
    this.dayLeg[i] = 0;
    this.dayTime[i] = 0;
    this.carry[i] = 0;
    this.carryAmt[i] = 0;
    this.needRest[i] = 0;
    this.needSocial[i] = 0;
    this.needFaith[i] = 0;
    this.gesture[i] = 0;
    this.act[i] = 0;
    this.goal[i] = -1;
    this.chase[i] = -1;
    this.chaseUid[i] = 0;
    this.escaped[i] = 0;
    this.effort[i] = 0;
    this.parasite[i] = 0;
    this.population[s]++;
    if (this.population[s] > RELICT * 2) this.threatened.delete(s);
    this.everLived[s] = true;
    if (village >= 0) {
      const v = this.villages[village];
      v.population++;
      const vital = (v.vitalNow ??= emptyVital());
      if (age === 0) vital.births++;
      else vital.arrived++;
      this.role[i] = age < this.species[s].maturity ? CHILD : pickRole(Math.floor(v.tech), this.scale(v), this.rnd(), this.roleContext(v));
    }
    if (this.species[s].kind === 'sapient') randomTraits(this.traits, i, this.mindRnd, village >= 0 ? this.villages[village].culture.value : undefined);
    else this.traits.fill(0, i * TRAIT_COUNT, (i + 1) * TRAIT_COUNT);
    return i;
  },

  spawnAtTile(this: Ecosystem, s: number, tile: number, village = -1, age = 0): number {
    const w = this.map.width;
    return this.spawn(s, (tile % w) + this.rnd(), Math.floor(tile / w) + this.rnd(), village, age);
  },

  /**
   * Remove a criatura. `quiet` não registra a morte na crônica; `cause` diz
   * como saiu (`partiu` é quem embarcou ou virou colono, não morreu).
   */
  kill(this: Ecosystem, i: number, quiet = false, cause: Exit = 'outra'): void {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.uidIndex.delete(this.uid[i]);
    if (this.village[i] >= 0) this.residentIndex.dirty = true;
    const s = this.kind[i];
    if (cause !== 'partiu') {
      this.diary.delete(this.uid[i]);
      this.mourn(i);
      this.deaths.unshift({ uid: this.uid[i], cause, age: this.age[i], x: this.x[i], y: this.y[i] });
      if (this.deaths.length > 64) this.deaths.pop();
    }
    if (this.village[i] >= 0) {
      const vital = (this.villages[this.village[i]].vitalNow ??= emptyVital());
      if (cause === 'partiu') vital.left++;
      else vital.deaths[cause] = (vital.deaths[cause] ?? 0) + 1;
      if (cause === 'fome') this.tally.hunger++;
      else if (cause === 'frio') this.tally.cold++;
      // Enterro (RF-AS-28): a família de quem morreu num lugar na tela se junta onde ele caiu.
      const home = this.villages[this.village[i]];
      if (cause !== 'partiu' && this.full(home) && this.family[i]) home.funeral = { tile: this.tileOf(i), until: this.year + B.FUNERAL_SPAN, family: this.family[i] };
      if (this.carry[i]) this.dropDay(i, home);
    }
    this.population[s]--;
    // Alerta (uma vez por queda): a espécie de terra ficou com tão poucos que pode sumir do planeta.
    if (this.population[s] === RELICT - 1 && this.wild(s) && !this.threatened.has(s)) {
      this.threatened.add(s);
      this.note(`${this.species[s].name}: restam poucos neste planeta; a espécie está ameaçada`, 'natureza', { x: this.x[i], y: this.y[i] }, { key: `threat-${s}` });
    }
    this.expedition.delete(i);
    this.mercenaries.delete(i);
    if (this.population[s] === 0 && this.species[s].kind !== 'sapient') {
      this.extinct.add(s);
      this.note(`${this.species[s].name}: a espécie foi extinta neste planeta`, 'natureza', { x: this.x[i], y: this.y[i] }, { major: true });
    }
    const v = this.village[i];
    if (v >= 0) {
      const village = this.villages[v];
      village.population--;
      if (village.pendingTech && village.pendingTech.uid === this.uid[i] && cause !== 'partiu') this.losePendingTech(village, 'morreu', quiet);
      // Só a morte de reis e de líderes de reinos entra nos acontecimentos.
      // O lugar `i` já está marcado como morto aqui: confere o líder pelo índice e pelo uid (o índice é reaproveitado).
      if (!quiet && village.leader === i && this.uid[i] === village.leaderUid && village.kingdom === village.id && (village.tier >= 2 || this.kingdomSize(village) > 1)) {
        const title = this.role[i] === ROLE.king ? 'O rei' : 'O líder';
        if (this.kingdomSize(village) >= 4) this.crises.add(village.id);
        this.note(`${title} de ${village.name} morreu aos ${Math.floor(this.age[i])} anos`, 'povo', village);
      }
    }
    this.free.push(i);
  },

  tileOf(this: Ecosystem, i: number): number {
    const w = this.map.width;
    const tx = Math.floor(this.x[i]);
    const ty = Math.min(this.map.height - 1, Math.max(0, Math.floor(this.y[i])));
    return ty * w + (((tx % w) + w) % w);
  },

  buildGrid(this: Ecosystem): void {
    this.gridHead.fill(-1);
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      const c = this.cellOf(this.x[i], this.y[i]);
      this.gridNext[i] = this.gridHead[c];
      this.gridHead[c] = i;
    }
  },

  cellOf(this: Ecosystem, x: number, y: number): number {
    const w = this.map.width;
    const cx = Math.floor((((x % w) + w) % w) / CELL);
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / CELL)));
    return cy * this.cols + cx;
  },

  /**
   * As criaturas num raio, como `forEachNear`, mas guardadas em `NEAR` em vez de chamar uma função para cada uma:
   * a mesma ordem de visita, sem closure por consulta (para os laços mais quentes da fauna). Devolve `NEAR`.
   */
  gatherNear(this: Ecosystem, x: number, y: number, radius: number): typeof NEAR {
    const w = this.map.width;
    const half = w / 2;
    const cols = this.cols;
    const rows = this.rows;
    const head = this.gridHead;
    const next = this.gridNext;
    const alive = this.alive;
    const xs = this.x;
    const ys = this.y;
    const r = Math.ceil(radius / CELL);
    const cx = Math.floor((((x % w) + w) % w) / CELL);
    const cy = Math.floor(y / CELL);
    const rr = radius * radius;
    let n = 0;
    let cap = NEAR.i.length;
    let oi = NEAR.i;
    let odx = NEAR.dx;
    let ody = NEAR.dy;
    for (let oy = -r; oy <= r; oy++) {
      const gy = cy + oy;
      if (gy < 0 || gy >= rows) continue;
      for (let ox = -r; ox <= r; ox++) {
        const gx = (((cx + ox) % cols) + cols) % cols;
        for (let i = head[gy * cols + gx]; i >= 0; i = next[i]) {
          if (!alive[i]) continue;
          let dx = xs[i] - x;
          if (dx > half) dx -= w;
          else if (dx < -half) dx += w;
          const dy = ys[i] - y;
          if (dx * dx + dy * dy > rr) continue;
          if (n === cap) {
            growNear();
            cap = NEAR.i.length;
            oi = NEAR.i;
            odx = NEAR.dx;
            ody = NEAR.dy;
          }
          oi[n] = i;
          odx[n] = dx;
          ody[n] = dy;
          n++;
        }
      }
    }
    NEAR.n = n;
    return NEAR;
  },

  /** Visita criaturas num raio (em tiles), considerando a volta horizontal do mapa. */
  forEachNear(this: Ecosystem, x: number, y: number, radius: number, fn: (i: number, dx: number, dy: number) => void): void {
    const w = this.map.width;
    const r = Math.ceil(radius / CELL);
    const cx = Math.floor((((x % w) + w) % w) / CELL);
    const cy = Math.floor(y / CELL);
    for (let oy = -r; oy <= r; oy++) {
      const gy = cy + oy;
      if (gy < 0 || gy >= this.rows) continue;
      for (let ox = -r; ox <= r; ox++) {
        const gx = (((cx + ox) % this.cols) + this.cols) % this.cols;
        for (let i = this.gridHead[gy * this.cols + gx]; i >= 0; i = this.gridNext[i]) {
          if (!this.alive[i]) continue;
          let dx = this.x[i] - x;
          if (dx > w / 2) dx -= w;
          else if (dx < -w / 2) dx += w;
          const dy = this.y[i] - y;
          if (dx * dx + dy * dy <= radius * radius) fn(i, dx, dy);
        }
      }
    }
  },
};
export type EntitiesPart = typeof entitiesPart;
