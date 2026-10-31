/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): eventos do mundo: efeitos, relevo, lava, destruição e incêndios.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { windAt } from '../../climate';
import { Biome, classify, temperatureAt } from '../../../procgen/surface';
import { wrapDx } from '../../settlement';
import { ECO_CELL } from '../../fauna';
import type { Effect, Village } from '../types';
import * as tilesModule from '../tiles';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { isWater, isLand } = tilesModule;

export const disastersPart = {
  // Mudanças no mundo (eventos e ferramentas) -------------------------------

  /** Número aleatório da simulação (determinístico pela semente). */
  random(this: Ecosystem): number {
    return this.worldRnd();
  },

  effect(this: Ecosystem, kind: Effect['kind'], x: number, y: number, life: number, size = 1): void {
    if (this.effects.length < 300) this.effects.push({ kind, x, y, age: 0, life, size });
  },

  /**
   * Altera o terreno num raio: `fn` recebe o tile e a distância ao centro.
   * Reclassifica o bioma e avisa a renderização.
   */
  reshape(this: Ecosystem, x: number, y: number, r: number, fn: (i: number, d: number) => void): void {
    const ri = Math.ceil(r);
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        const t = this.tileAt(Math.floor(x) + dx, Math.floor(y) + dy);
        if (t < 0) continue;
        fn(t, d);
        if (this.map.bare) this.map.bare[t] = 0;
        this.map.biome[t] = classify(this.map, t);
        this.onTileChanged(t);
      }
    }
    this.sweep(x, y, r);
  },

  /** Lava num tile: o calor sobe e vai esfriando ao longo dos anos até virar rocha. */
  pourLava(this: Ecosystem, i: number, heat: number): void {
    this.map.heat[i] += heat;
    this.cooling.push({ i, heat });
  },

  /** Esfria a lava um pouco a cada ano. */
  coolLava(this: Ecosystem): void {
    for (let k = this.cooling.length - 1; k >= 0; k--) {
      const c = this.cooling[k];
      const drop = Math.max(8, c.heat * 0.12);
      const d = Math.min(drop, c.heat);
      c.heat -= d;
      this.map.heat[c.i] -= d;
      this.map.biome[c.i] = classify(this.map, c.i);
      this.onTileChanged(c.i);
      if (c.heat <= 0) this.cooling.splice(k, 1);
    }
  },

  /**
   * Destrói construções num raio (terremoto, cometa, vulcão): casas viram
   * ruína, assentamentos sem casa são abandonados. Retorna quantas caíram.
   */
  destroyAround(this: Ecosystem, x: number, y: number, r: number, chance = 1): number {
    let n = 0;
    for (const v of this.villages) {
      if (v.abandoned || this.distance(v, x, y) > r + this.radius(v)) continue;
      for (let k = v.houses.length - 1; k >= 0; k--) {
        const h = v.houses[k];
        if (Math.hypot(wrapDx(h.x + 1 - x, this.map.width), h.y + 1 - y) > r || this.worldRnd() > chance) continue;
        this.raze(v, k);
        n++;
      }
    }
    if (this.ruins.length > 200) this.ruins.splice(0, this.ruins.length - 200);
    return n;
  },

  /**
   * Derruba a construção `k` do assentamento: libera o terreno, deixa uma
   * ruína (se o chão ainda é terra). O material se perde (seção 19.19).
   */
  raze(this: Ecosystem, v: Village, k: number): void {
    const h = v.houses[k];
    const size = h.kind === 'port' ? 1 : 2;
    let land = false;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const t = this.tileAt(h.x + dx, h.y + dy);
        if (t < 0) continue;
        if (isLand(this.map, t)) land = true;
        this.built[t] = 0;
        this.onTileChanged(t);
        // Sem a casa ao lado, um bloco de rua que ela segurava pode sair na limpeza do ano.
        this.roadDirty.push(t);
      }
    }
    if (h.kind === 'port') v.port = -1;
    v.houses.splice(k, 1);
    v.foot = undefined;
    if (!land) return;
    this.ruins.push({ x: h.x + size / 2, y: h.y + size, age: 0 });
  },

  /**
   * Faz o que a construção do povo sobreviver à mudança do terreno (seção
   * 19.18): depois de cometa, terremoto, vulcão, ferramentas de terreno ou
   * clima, tudo que ficou sem chão para existir some. Estrada, praça, roça e
   * pasto na água, na lava ou no gelo; jazida submersa; casa, porto e prédio
   * com tile que não é terra, num barranco (desnível acima de
   * HOUSE_MAX_RELIEF) ou porto sem água ao lado. Assentamento cujo centro
   * afundou se afoga. Retorna quantas construções caíram.
   */
  sweep(this: Ecosystem, cx: number, cy: number, r: number): number {
    const map = this.map;
    const ri = Math.ceil(r) + 2;
    const x0 = Math.floor(cx);
    const y0 = Math.floor(cy);
    let lost = 0;
    let roads = 0;
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        const t = this.tileAt(x0 + dx, y0 + dy);
        if (t < 0) continue;
        if (!map.felled?.[t]) this.stumps.delete(t);
        if (isLand(map, t)) continue;
        if (this.road[t]) {
          this.road[t] = 0;
          this.mainStreet[t] = 0;
          this.traffic[t] = 0;
          this.tolls.delete(t);
          roads++;
          this.onTileChanged(t);
        }
        const id = this.depositAt[t];
        if (id >= 0 && this.deposits[id].amount > 0) {
          const d = this.deposits[id];
          d.amount = 0;
          if (d.mine >= 0) {
            const owner = this.villages[d.mine];
            const at = owner.mines.indexOf(id);
            if (at >= 0) owner.mines.splice(at, 1);
            d.mine = -1;
          }
        }
      }
    }
    for (const v of this.villages) {
      if (v.abandoned) continue;
      if (this.distance(v, cx, cy) <= ri + this.reachOf(v, B.WOOD_REACH)) v.treeScan = -1;
      if (this.distance(v, cx, cy) > ri + this.radius(v) + 6) continue;
      for (let k = v.houses.length - 1; k >= 0; k--) {
        const h = v.houses[k];
        const size = h.kind === 'port' ? 1 : 2;
        let bad = false;
        let lo = Infinity;
        let hi = -Infinity;
        for (let dy = 0; dy < size && !bad; dy++) {
          for (let dx = 0; dx < size; dx++) {
            const t = this.tileAt(h.x + dx, h.y + dy);
            if (t < 0 || !isLand(map, t)) {
              bad = true;
              break;
            }
            lo = Math.min(lo, map.elevation[t]);
            hi = Math.max(hi, map.elevation[t]);
          }
        }
        if (!bad && hi - lo > B.HOUSE_MAX_RELIEF) bad = true;
        if (!bad && h.kind === 'port' && (v.port < 0 || !isWater(map, v.port))) bad = true;
        if (!bad) continue;
        this.raze(v, k);
        lost++;
        roads++;
      }
      // O centro afundou, queimou ou virou gelo: o assentamento acabou (os moradores se afogam).
      const center = this.tileAt(v.x, Math.floor(v.y));
      if (center >= 0 && !isLand(map, center) && v.population > 0) {
        for (const i of this.residents(v.id)) if (this.alive[i] && this.village[i] === v.id) this.kill(i, true, 'desastre');
        this.note(`${v.name} foi tomada pelas águas, pelo fogo ou pelo gelo`, 'natureza', v, { major: v.tier >= 1 });
        this.emit({ kind: 'disaster', year: this.year, what: 'engulfed', x: v.x, y: v.y, village: v.id });
      }
    }
    for (let k = this.ruins.length - 1; k >= 0; k--) {
      const t = this.tileAt(this.ruins[k].x, Math.floor(this.ruins[k].y) - 1);
      if (t >= 0 && !isLand(map, t)) this.ruins.splice(k, 1);
    }
    if (roads) this.reconcile(cx, cy, ri);
    return lost;
  },

  /**
   * Acerta as contas dos assentamentos perto de um ponto depois que tiles de
   * rua, roça, pasto ou casa sumiram: roças contadas a mais, cercados
   * incompletos e estrada que precisa ser refeita (`linked`).
   */
  reconcile(this: Ecosystem, cx: number, cy: number, ri: number): void {
    this.mapVersionKey++;
    const w = this.map.width;
    for (const v of this.villages) {
      if (v.abandoned || this.distance(v, cx, cy) > ri + this.radius(v) + 8) continue;
      v.linked = false;
      if (v.pens?.length) {
        v.pens = v.pens.filter((p) => {
          const tiles = [this.tileAt(p.x, p.y), this.tileAt(p.x + 1, p.y), this.tileAt(p.x, p.y + 1), this.tileAt(p.x + 1, p.y + 1)];
          if (tiles.every((t) => t >= 0 && this.road[t] === 5)) return true;
          for (const t of tiles) {
            if (t >= 0 && this.road[t] === 5) {
              this.road[t] = 0;
              this.onTileChanged(t);
            }
          }
          return false;
        });
      }
      if (v.fields > 0) {
        const r = Math.ceil(this.radius(v)) + 1;
        let tiles = 0;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const t = this.tileAt(Math.floor(v.x) + dx, Math.floor(v.y) + dy);
            if (t >= 0 && this.road[t] === 4) tiles++;
          }
        }
        v.fields = Math.min(v.fields, Math.ceil(tiles / 4));
      }
    }
    void w;
  },

  /**
   * Lava e chão em brasa pegam fogo no que está em volta (seção 19.18): a
   * mata perto queima, animais morrem e casas dentro do alcance caem. Uma
   * vez por ano, com no máximo `limit` focos, para não pesar.
   */
  lavaFires(this: Ecosystem, limit = 60): void {
    const map = this.map;
    const w = map.width;
    const n = w * map.height;
    // Sem lava esfriando e sem lava de nascença, não há o que varrer (o mapa inteiro, uma vez por ano).
    if (!this.cooling.length) {
      if (this.bornLava < 0) this.bornLava = map.biome.some((b) => b === Biome.Lava) ? 1 : 0;
      if (!this.bornLava) return;
    }
    let started = 0;
    for (let t = 0; t < n && started < limit; t++) {
      if (map.biome[t] !== Biome.Lava || this.worldRnd() > B.LAVA_FIRE_RATE / 6) continue;
      const x = t % w;
      const y = (t - x) / w;
      let hit = false;
      this.reshape(x, y, B.LAVA_FIRE_RANGE, (i, d) => {
        if (map.vegetation[i] < 0.1 || this.worldRnd() > 0.8 - d * 0.2) return;
        map.vegetation[i] = 0.03;
        hit = true;
      });
      const fallen = this.destroyAround(x + 0.5, y + 0.5, B.LAVA_FIRE_RANGE, 0.5);
      if (!hit && !fallen) continue;
      started++;
      this.effect('flame', x + 0.5, y + 0.5, 8, 1.4);
      this.killAround(x + 0.5, y + 0.5, B.LAVA_FIRE_RANGE, 0.4);
      const near = this.settlementAt(x + 0.5, y + 0.5);
      if (fallen || near) this.note(`O fogo da lava queimou ${fallen ? `${fallen} construções` : 'a mata'} perto de ${near?.name ?? 'um assentamento'}`, 'natureza', { x, y }, { key: 'lava-fire' });
    }
  },

  /**
   * Fogo natural (Plano 2): no auge do verão, algumas células são sorteadas; mata densa, quente e seca
   * pega fogo por raio com chance que cresce com a secura (umidade baixa e ano de seca na região).
   * O fogo anda alguns passos com o vento, deixa terra queimada que volta pelo capim (o crescimento
   * de sempre), mata parte dos bichos que não fogem e deixa as carcaças para os necrófagos.
   */
  wildfires(this: Ecosystem): void {
    const c = this.cells;
    if (!c) return;
    const map = this.map;
    let fires = 0;
    const tries = Math.ceil(c.n / 8);
    for (let n = 0; n < tries && fires < B.WILDFIRE_MAX; n++) {
      const k = Math.floor(this.worldRnd() * c.n);
      if (c.wood[k] < 40) continue;
      const x0 = (k % c.cols) * ECO_CELL + Math.floor(this.worldRnd() * ECO_CELL);
      const y0 = Math.floor(k / c.cols) * ECO_CELL + Math.floor(this.worldRnd() * ECO_CELL);
      const t0 = this.tileAt(x0, y0);
      if (t0 < 0 || !isLand(map, t0) || map.vegetation[t0] < 0.5 || this.built[t0]) continue;
      const wx = this.weather;
      const temp = wx?.ready ? wx.tempNow(k, this.yearPhase()) : temperatureAt(map, t0);
      if (temp < 288 || (wx?.ready && wx.snow[k] > 0.05)) continue;
      const drought = Math.max(0, -this.climateAt(x0, y0));
      // Solo seco (pela água no solo do clima vivo, ou pela umidade do lugar) em ano de seca.
      const soil = wx?.ready ? wx.soil[k] : map.moisture[t0];
      const dry = Math.min(1, (1 - soil) * (0.6 + 0.6 * drought));
      if (this.worldRnd() > B.WILDFIRE_RATE * dry * dry * dry * 8) continue;
      fires++;
      this.burn(x0 + 0.5, y0 + 0.5);
    }
  },

  /** Um incêndio de mata: anda com o vento a partir de (x, y), queimando o que é lenhoso. */
  burn(this: Ecosystem, x: number, y: number): void {
    const map = this.map;
    const wind = windAt(y, map.height);
    let burnt = 0;
    let fx = x;
    let fy = y;
    for (let step = 0; step < B.WILDFIRE_STEPS; step++) {
      this.reshape(fx, fy, 2.5, (t, d) => {
        if (map.vegetation[t] < 0.3 || this.built[t] || this.worldRnd() > 0.95 - d * 0.15) return;
        map.vegetation[t] = 0.04;
        burnt++;
      });
      this.effect('flame', fx, fy, 6, 1.6);
      this.forEachNear(fx, fy, 3, (i) => {
        if (!this.wild(this.kind[i]) || this.worldRnd() > 0.25) return;
        this.leaveCarcass(i);
        this.kill(i, false, 'desastre');
      });
      fx += wind.x * 2.5 + (this.worldRnd() - 0.5) * 1.5;
      fy = Math.max(1, Math.min(map.height - 2, fy + wind.y * 2.5 + (this.worldRnd() - 0.5) * 1.5));
    }
    this.tally.wildfires++;
    const near = this.settlementAt(x, y) ?? this.villages.find((v) => !v.abandoned && Math.hypot(wrapDx(v.x - x, map.width), v.y - y) < 30);
    this.emit({ kind: 'disaster', year: this.year, what: 'wildfire', x: Math.floor(x), y: Math.floor(y), village: near?.id ?? -1 });
    this.note(`Um raio pôs fogo na mata seca${near ? ` perto de ${near.name}` : ''}: ${burnt} tiles queimados, o capim volta primeiro`, 'natureza', { x: Math.floor(x), y: Math.floor(y) }, { key: 'wildfire' });
  },
};
export type DisastersPart = typeof disastersPart;
