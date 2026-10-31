/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): água, caça e lotação das células, reprodução, território e povoamento da fauna.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import { happens } from '../../stochastic';
import { Biome } from '../../../procgen/surface';
import { wrapDx } from '../../settlement';
import { EARTH_ID } from '../../species';
import { BREED_LENGTH, BREED_START, ECO_CELL, ecologyOf, refreshEcology, hunts, appetite, type Ecology } from '../../fauna';
import * as constantsModule from '../constants';
import type { EcoCells } from '../cells';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { RELICT, MATE_RANGE } = constantsModule;

export const faunaSpacePart = {
  /** A célula não tem água para beber e a espécie precisa (bicho do deserto aguenta; caçador tira água da presa). */
  thirsty(this: Ecosystem, e: Ecology, k: number): boolean {
    const wx = this.weather;
    if (!wx?.ready || (e.biomes[Biome.Desert] ?? 0) >= 0.8 || appetite(e) < 1) return false;
    return wx.water[k] < 0.01 && wx.soil[k] < 0.12 && wx.snow[k] < 0.05 && wx.rain[k] < 0.15;
  },

  /** Direção da célula com água mais perto (até 3 células), ou undefined. */
  waterCell(this: Ecosystem, i: number, c: EcoCells): { x: number; y: number } | undefined {
    const wx = this.weather;
    if (!wx?.ready) return undefined;
    const w = this.map.width;
    const here = c.of(this.x[i], this.y[i], w);
    const cx = here % c.cols;
    const cy = (here - cx) / c.cols;
    let best = -1;
    let bd = Infinity;
    for (let oy = -3; oy <= 3; oy++) {
      const y = cy + oy;
      if (y < 0 || y >= c.rows) continue;
      for (let ox = -3; ox <= 3; ox++) {
        const k = y * c.cols + ((cx + ox + c.cols) % c.cols);
        if (wx.water[k] < 0.01 && wx.soil[k] < 0.3 && wx.rain[k] < 0.15) continue;
        const d = ox * ox + oy * oy;
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
    }
    if (best < 0) return undefined;
    return { x: wrapDx((best % c.cols) * ECO_CELL + 8 - this.x[i], w), y: Math.floor(best / c.cols) * ECO_CELL + 8 - this.y[i] };
  },

  /** Direção da célula (até 3 de distância) com mais herbívoros acima da metade da capacidade: onde dá para caçar sem esvaziar. */
  gameCell(this: Ecosystem, i: number, c: EcoCells): { x: number; y: number } | undefined {
    const S = c.stride;
    const w = this.map.width;
    const here = c.of(this.x[i], this.y[i], w);
    const cx = here % c.cols;
    const cy = (here - cx) / c.cols;
    let best = -1;
    let most = 0.5;
    for (let oy = -3; oy <= 3; oy++) {
      const y = cy + oy;
      if (y < 0 || y >= c.rows) continue;
      for (let ox = -3; ox <= 3; ox++) {
        const k = y * c.cols + ((cx + ox + c.cols) % c.cols);
        let spare = 0;
        for (let s = 0; s < S; s++) if (this.species[s].kind === 'herbivore') spare += Math.max(0, c.N[k * S + s] - c.K[k * S + s] * 0.5);
        spare /= 1 + Math.hypot(ox, oy) * 0.3;
        if (spare > most) {
          most = spare;
          best = k;
        }
      }
    }
    if (best < 0 || best === here) return undefined;
    return { x: wrapDx((best % c.cols) * ECO_CELL + 8 - this.x[i], w), y: Math.floor(best / c.cols) * ECO_CELL + 8 - this.y[i] };
  },

  /** Célula a até 4 de distância com mais bichos da espécie (fora a do próprio bicho), ou -1. */
  crowdedCell(this: Ecosystem, i: number, c: EcoCells): number {
    const s = this.kind[i];
    const S = c.stride;
    const here = c.of(this.x[i], this.y[i], this.map.width);
    const cx = here % c.cols;
    const cy = (here - cx) / c.cols;
    let best = -1;
    let most = 0;
    for (let oy = -4; oy <= 4; oy++) {
      const y = cy + oy;
      if (y < 0 || y >= c.rows) continue;
      for (let ox = -4; ox <= 4; ox++) {
        const k = y * c.cols + ((cx + ox + c.cols) % c.cols);
        if (k !== here && c.N[k * S + s] > most) {
          most = c.N[k * S + s];
          best = k;
        }
      }
    }
    return best;
  },

  /**
   * Lotação da área de vida do bando (N/K): soma células em anéis em volta até a
   * capacidade caber o bando com folga (até 9×9 células). Bichos raros e espalhados
   * olham uma área grande; num lugar farto, a vizinhança basta.
   */
  crowding(this: Ecosystem, c: EcoCells, cell: number, s: number, herd: number): number {
    const S = c.stride;
    const memo = c.dens[cell * S + s];
    if (memo >= 0) return memo;
    const cx = cell % c.cols;
    const cy = (cell - cx) / c.cols;
    let n = c.N[cell * S + s];
    let k = c.K[cell * S + s];
    // A área cobre alguns bandos, não um só: senão todo bando pareceria lotado.
    const want = Math.max(4, herd * 3);
    for (let r = 1; r <= 6 && k < want; r++) {
      for (let oy = -r; oy <= r; oy++) {
        const y = cy + oy;
        if (y < 0 || y >= c.rows) continue;
        const edge = oy === -r || oy === r;
        for (let ox = -r; ox <= r; ox += edge ? 1 : 2 * r) {
          const q = (y * c.cols + ((cx + ox + c.cols) % c.cols)) * S + s;
          n += c.N[q];
          k += c.K[q];
        }
      }
    }
    // Espécie tão rara que nem 13×13 células dão para um bando: vale a lotação do planeta inteiro.
    const d = k < want ? this.population[s] / Math.max(1, c.total[s]) : n / Math.max(0.5, k);
    c.dens[cell * S + s] = d;
    return d;
  },

  /** Tile no centro da célula vizinha (até 2 células) menos lotada e com nicho bom, para a dispersão. */
  emptierCell(this: Ecosystem, i: number, c: EcoCells): number {
    const s = this.kind[i];
    const S = c.stride;
    const here = c.of(this.x[i], this.y[i], this.map.width);
    const cx = here % c.cols;
    const cy = (here - cx) / c.cols;
    const herd = ecologyOf(this.species[s]).herd;
    let best = -1;
    let low = this.crowding(c, here, s, herd) - 0.2;
    // Até três células de distância: uma área vazia com capacidade é recolonizada a pé pelos vizinhos.
    for (let oy = -3; oy <= 3; oy++) {
      const y = cy + oy;
      if (y < 0 || y >= c.rows) continue;
      for (let ox = -3; ox <= 3; ox++) {
        const k = y * c.cols + ((cx + ox + c.cols) % c.cols);
        if (k === here || c.suit[k * S + s] < 0.15) continue;
        const fill = this.crowding(c, k, s, herd) + this.rnd() * 0.1;
        if (fill < low) {
          low = fill;
          best = k;
        }
      }
    }
    if (best < 0) return -1;
    for (let k = 0; k < 8; k++) {
      const t = this.tileAt((best % c.cols) * ECO_CELL + Math.floor(this.rnd() * ECO_CELL), Math.min(this.map.height - 1, Math.floor(best / c.cols) * ECO_CELL + Math.floor(this.rnd() * ECO_CELL)));
      if (t >= 0 && this.habitable(s, t)) return t;
    }
    return -1;
  },

  /**
   * Reprodução: na estação, com energia e um parceiro adulto por perto. Os
   * nascimentos caem com a lotação da vizinhança (Beverton–Holt local) e com os
   * parasitas; uma espécie rara no planeta tem um empurrão.
   */
  breed(this: Ecosystem, i: number, e: Ecology, c: EcoCells, cell: number, local: number, yr: number): void {
    const s = this.kind[i];
    const sp = this.species[s];
    // Espécie que já está abaixo da metade do que o planeta sustenta não sente a lotação de um canto
    // (o bando amontoado se espalharia): vale a lotação do planeta. Evita a extinção por um aperto local.
    const global = this.population[s] / Math.max(1, c.total[s]);
    const dens = global < 0.5 ? Math.min(local, global) : local;
    if (this.age[i] < sp.maturity || this.energy[i] < (hunts(e) ? 0.45 : 0.7) || dens >= 1) return;
    const phase = this.yearPhase();
    if (e.seasonal && (phase < BREED_START || phase >= BREED_START + BREED_LENGTH)) return;
    // Espécie rara no planeta (abaixo da metade do que a terra sustenta) se recupera mais rápido.
    const rare = this.population[s] < RELICT ? 3 : this.population[s] < c.total[s] * 0.5 ? 2 : 1;
    // Cada cria tem dois pais: metade da ninhada por adulto, espalhada pela estação.
    const rate = ((e.litter / 2) * (1 - dens * dens) * (1 - 0.6 * this.parasite[i]) * rare) / (e.seasonal ? BREED_LENGTH : 1);
    if (!happens(this.rnd, rate, yr)) return;
    // Parceiro adulto por perto (solitários, como a onça, se encontram de mais longe).
    const k = this.kin(i, e.herd > 2 ? 8 : Math.max(8, e.range));
    if (!k.n || k.n > e.herd * 1.5 + 1) return;
    // Predador só cria filhote com território: nenhum outro grupo da espécie, maior ou tão grande, mora ali perto.
    // Espécie já rara não briga por território: sobra espaço para todos.
    if (appetite(e) < 1 && this.population[s] > RELICT * 3 && !this.holdsTerritory(i, e, c)) return;
    const child = this.spawn(s, this.x[i] + (this.rnd() - 0.5), this.y[i] + (this.rnd() - 0.5));
    if (child < 0) return;
    this.energy[i] -= 0.12;
    this.parent[child] = this.uid[i];
    this.family[child] = this.family[i];
    c.N[cell * c.stride + s]++;
  },

  /**
   * Território do grupo do bicho (matilha, casal ou solitário): nenhum outro grupo da mesma espécie
   * com o centro a menos de `range` tiles, a não ser um menor. Empate fica com o grupo mais antigo.
   * É o que espaça lobos e leões como na natureza e corta o excesso de predadores pela raiz.
   */
  holdsTerritory(this: Ecosystem, i: number, e: Ecology, c: EcoCells): boolean {
    const w = this.map.width;
    const s = this.kind[i];
    const fam = this.family[i];
    const own = c.herds.get(fam);
    const size = own ? own[3] : 1;
    const ox = own ? own[0] + own[1] / own[3] : this.x[i];
    const oy = own ? own[2] / own[3] : this.y[i];
    // Territórios se encostam: o centro do vizinho pode ficar a 70% do alcance.
    const r2 = e.range * e.range * 0.5;
    for (const [f, h] of c.herds) {
      if (f === fam || c.herdKind.get(f) !== s) continue;
      const dx = wrapDx(h[0] + h[1] / h[3] - ox, w);
      const dy = h[2] / h[3] - oy;
      if (dx * dx + dy * dy > r2) continue;
      if (h[3] > size || (h[3] === size && f < fam)) return false;
    }
    return true;
  },

  /**
   * Checagem de viabilidade da fauna sorteada de um planeta com vida própria (Plano 2), sem simular:
   * a capacidade de suporte é calculada como no jogo, e a espécie nativa que não teria uma população
   * viável tem a faixa de temperatura puxada para o clima do planeta e os biomas soltos, até três vezes.
   */
  adaptNatives(this: Ecosystem): void {
    const id = this.map.params.id;
    if (id === EARTH_ID) return;
    for (let round = 0; round < 3; round++) {
      const c = this.ecoCells();
      let changed = false;
      this.species.forEach((sp, s) => {
        // Herbívoros primeiro: a capacidade dos caçadores depende das presas já no mapa.
        if (!this.wild(s) || sp.origin !== id || sp.kind !== 'herbivore' || c.total[s] >= RELICT * 2) return;
        // A faixa anda metade do caminho até o clima médio do planeta e alarga um pouco.
        const shift = (this.map.params.temperatureK + 10 - (sp.tempMin + sp.tempMax) / 2) * 0.5;
        sp.tempMin = Math.round(sp.tempMin + shift - 8);
        sp.tempMax = Math.round(sp.tempMax + shift + 8);
        if (sp.eco) sp.eco = { ...sp.eco, biomes: {}, open: 1, moist: [0, 1], alt: [0, 0.85] };
        refreshEcology(sp);
        changed = true;
      });
      if (!changed) return;
      c.ready = false;
      c.passes = 0;
    }
  },

  /**
   * Coloca os bichos de terra pela capacidade de cada célula (herbívoros primeiro,
   * depois quem os come), já em bandos do tamanho típico da espécie: a capacidade
   * das células vai se acumulando e, quando dá um bando, ele nasce ali.
   */
  populateWild(this: Ecosystem): void {
    this.adaptNatives();
    const c = this.ecoCells();
    const S = c.stride;
    const w = this.map.width;
    for (const predators of [false, true]) {
      for (let s = 0; s < S; s++) {
        if (!this.wild(s)) continue;
        const e = ecologyOf(this.species[s]);
        // Na segunda leva entram os que vivem de carne: caçadores e necrófagos.
        if ((hunts(e) || e.carrion >= 0.8) !== predators) continue;
        const sp = this.species[s];
        const group = Math.max(2, Math.round(e.herd * 0.6));
        let acc = 0;
        const start = Math.floor(this.rnd() * c.n);
        for (let q = 0; q < c.n; q++) {
          const k = (start + q) % c.n;
          if (c.K[k * S + s] <= 0) continue;
          acc += c.K[k * S + s] * 0.7;
          if (acc < group * (0.5 + this.rnd())) continue;
          let n = Math.min(group, Math.round(acc));
          acc -= n;
          let at = -1;
          for (let tries = 0; tries < 12 && at < 0; tries++) {
            const t = this.tileAt((k % c.cols) * ECO_CELL + Math.floor(this.rnd() * ECO_CELL), Math.min(this.map.height - 1, Math.floor(k / c.cols) * ECO_CELL + Math.floor(this.rnd() * ECO_CELL)));
            if (t >= 0 && this.habitable(s, t)) at = t;
          }
          if (at < 0) continue;
          const family = ++this.nextFamily;
          for (let tries = 0; n > 0 && tries < 30; tries++) {
            const t = this.tileAt((at % w) + Math.floor((this.rnd() - 0.5) * 6), Math.floor(at / w) + Math.floor((this.rnd() - 0.5) * 6));
            if (t < 0 || !this.habitable(s, t)) continue;
            // Bando com adultos dos dois lados da idade: nunca só filhotes.
            const age = sp.maturity + this.rnd() * (sp.maxAge * 0.6 - sp.maturity);
            const j = this.spawn(s, (t % w) + this.rnd(), Math.floor(t / w) + this.rnd(), -1, Math.max(0, age));
            if (j < 0) continue;
            this.family[j] = family;
            n--;
          }
        }
      }
      this.countWild(c);
      this.updateCapacity(c);
    }
  },

  /**
   * Controle da natalidade: perto do teto quase não nascem filhotes (o
   * pasto e o espaço ficam disputados); uma espécie rara tem mais filhotes,
   * para conseguir se recuperar. Inteligentes só têm o empurrão de espécie rara: o teto deles é a comida e a casa de cada assentamento.
   */
  fertility(this: Ecosystem, s: number, era = 0): number {
    const cap = this.caps[s] * (this.species[s].kind === 'sapient' ? 1 + 0.3 * era : 1);
    const fill = this.population[s] / Math.max(1, cap);
    if (fill < 0.2) return 2.2;
    // Inteligentes não têm teto global da espécie (etapa 1): quem limita é a comida e a casa de cada assentamento.
    if (this.species[s].kind === 'sapient') return 1.1;
    return Math.max(0.08, 1.15 * (1 - fill * fill));
  },

  /** Direção do adulto da mesma espécie mais perto, se não houver um já ao lado; mais longe quando a espécie está rara. */
  seekMate(this: Ecosystem, i: number): { x: number; y: number } | undefined {
    const s = this.kind[i];
    const sp = this.species[s];
    const range = this.population[s] < this.caps[s] * 0.2 ? MATE_RANGE * 2 : MATE_RANGE;
    let bd = Infinity;
    let best: { x: number; y: number } | undefined;
    this.forEachNear(this.x[i], this.y[i], range, (j, dx, dy) => {
      if (j === i || this.kind[j] !== s || this.age[j] < sp.maturity) return;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = { x: dx, y: dy };
      }
    });
    return bd < 9 ? undefined : best;
  },
};
export type FaunaSpacePart = typeof faunaSpacePart;
