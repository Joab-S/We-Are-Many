import { BOATS, CARRIED, elderAge, GESTURE, type Ecosystem, type Village } from '../../sim/ecosystem';
import { ORE_COLORS } from '../../sim/economy';
import { CHILD } from '../../sim/roles';
import { houseStyle } from '../../sim/architecture';
import { ROLES, SPRITES } from './art';
import { economicState } from './settlementWindow';
import type { SpriteLayer, SpriteName } from './sprites';
import { bodyOf, HERD_SPRITES, HERD_TINT, HORSE_COAT, spriteOf, STALL_TINTS } from './tools';
import type { Viewport } from './Viewport';
import { AVENUE } from '../../sim/architecture';

/** Onde desenhar a criatura `i` (x, linha): a posição interpolada entre dois passos, ou a atual. */
export interface CreaturePositions {
  x(i: number): number;
  y(i: number): number;
}

/** Visitante dos índices de criaturas que podem estar na tela (recorte por célula da grade). */
export type VisibleCreatures = (x0: number, x1: number, r0: number, r1: number, out: (i: number) => void) => void;

const WHITE = [255, 255, 255];
const RUIN_TINT = [150, 150, 150];
const DONKEY_TINT = [132, 122, 112];
const CARGO_TINT = [140, 100, 70];
const FLOCK_TINT = [220, 220, 220];
const CARCASS_TINT = [150, 110, 80];
const MARGIN = 40;
const DEPOSIT_ROWS: Record<string, number> = { mine: 11, cave: 8, vein: 6 };
const BOAT_ROWS: Record<string, number> = { wreck: 4, canoe: 7, rowboat: 8, sailboat: 15, caravel: 17, steamship: 14 };
const LOAD_ART: Record<string, string> = { food: 'load:food', wood: 'load:wood', stone: 'load:stone', clay: 'load:stone', water: 'load:water' };
const ELDER = 'elder';
const LEADER = ROLES.indexOf('leader');
const STALLS: [number, number][] = [[-2.6, -0.2], [2.6, -0.2], [-0.9, -2.3], [1.4, 2.4]];

/**
 * Monta a camada de sprites da superfície a partir do ecossistema e da
 * câmera: casas, jazidas, ruínas, pedágios, barcos, caravanas, carcaças,
 * criaturas e efeitos. Só lê o mundo; os nomes de sprite compostos
 * (`corpo:profissão`, `nome:l`) ficam em tabelas para não criar texto a cada
 * quadro, e a posição na tela sai em números soltos, sem tuplas.
 */
export class SpriteCollector {
  // Construções do quadro, ordenadas de cima para baixo antes de ir para a camada.
  private bName: SpriteName[] = [];
  private bTint: (readonly number[])[] = [];
  private bx = new Float32Array(1024);
  private by = new Float32Array(1024);
  private bh = new Float32Array(1024);
  private bn = 0;
  private readonly order: number[] = [];
  private readonly byY = (a: number, b: number) => this.by[b] - this.by[a] || a - b;
  private readonly leftCache = new Map<string, string>();
  private readonly roleCache = new Map<string, Map<string, string>>();
  private readonly houseCache = new Map<string, Map<string, string[]>>();
  private readonly flagCache = new Map<string, string>();

  /** Versão virada para a esquerda do sprite, se existir. */
  left(name: string): string {
    let l = this.leftCache.get(name);
    if (l === undefined) {
      l = SPRITES[`${name}:l`] ? `${name}:l` : name;
      this.leftCache.set(name, l);
    }
    return l;
  }

  /** `corpo:papel` (gatherer, soldier, child, elder...). */
  private role(body: string, role: string): string {
    let m = this.roleCache.get(body);
    if (!m) this.roleCache.set(body, (m = new Map()));
    let s = m.get(role);
    if (s === undefined) m.set(role, (s = `${body}:${role}`));
    return s;
  }

  private flag(vocation: string | undefined): string {
    const k = vocation ?? 'none';
    let s = this.flagCache.get(k);
    if (s === undefined) this.flagCache.set(k, (s = `flag:${k}`));
    return s;
  }

  /** Sprite da casa pela era, material e variante (RF-VIDA-251 e 252), guardado por estilo, material e variante. */
  private house(style: string, material: string, variant: number): string {
    let byMaterial = this.houseCache.get(style);
    if (!byMaterial) this.houseCache.set(style, (byMaterial = new Map()));
    let byVariant = byMaterial.get(material);
    if (!byVariant) byMaterial.set(material, (byVariant = []));
    let s = byVariant[variant];
    if (s === undefined) {
      s = material === 'plain' ? (variant ? `${style}:${variant}` : style) : `${style}:${material}${variant % 2 ? ':1' : ''}`;
      byVariant[variant] = s;
    }
    return s;
  }

  private building(sprite: SpriteName, sx: number, sy: number, h: number, tint: readonly number[]): void {
    const k = this.bn++;
    if (k >= this.bx.length) {
      const grow = (a: Float32Array) => {
        const b = new Float32Array(a.length * 2);
        b.set(a);
        return b;
      };
      this.bx = grow(this.bx);
      this.by = grow(this.by);
      this.bh = grow(this.bh);
    }
    this.bName[k] = sprite;
    this.bTint[k] = tint;
    this.bx[k] = sx;
    this.by[k] = sy;
    this.bh[k] = h;
  }

  /**
   * Preenche `layer` com tudo o que aparece na vista. `z` é o zoom em pixels
   * do buffer, `now` o relógio da animação (ms) e `pos` a posição de cada
   * criatura; `visible`, se dado, recorta as criaturas pela grade espacial.
   */
  collect(eco: Ecosystem, view: Viewport, layer: SpriteLayer, z: number, now: number, pos: CreaturePositions, visible?: VisibleCreatures): void {
    const w = view.width;
    const h = view.height;
    const mw = eco.map.width;
    layer.begin(w, h);
    const small = z < 3.5;
    const off = (sx: number, sy: number, m: number) => sx < -m || sx > w + m || sy < -m || sy > h + m;
    const X = (x: number) => view.screenX(x, z);
    const Y = (row: number) => view.glY(row, z);
    this.bn = 0;
    // Casas primeiro, criaturas por cima.
    // As chamas das fogueiras trocam de quadro algumas vezes por segundo.
    const flame = Math.floor(now / 260) % 2 === 0;
    const secs = now / 1000;
    for (const v of eco.villages) {
      if (v.abandoned) continue;
      const era = Math.floor(v.tech);
      const material = eco.materialOf(v);
      const prosperous = economicState(v).label === 'Próspero';
      for (const house of v.houses) {
        if (house.kind === 'port') {
          // O píer fica virado para a água (variante 1: água a oeste).
          const px = X(house.x + 0.5);
          const py = Y(house.y + 1.1);
          if (off(px, py, MARGIN)) continue;
          this.building('port', px, py, z * 1.4, v.color);
          continue;
        }
        const sx = X(house.x + 1);
        const sy = Y(house.y + 2);
        if (off(sx, sy, MARGIN)) continue;
        // Estilo da era em que a casa foi feita ou reformada (a cidade mistura estilos na troca de era, RF-VIDA-251);
        // casa reformada ganha um andar e usa o estilo seguinte. Material da região (RF-VIDA-252).
        const style = houseStyle(house.era ?? era, v.tier, house.level ?? 0);
        // Acampamento (seção 4 do plano novo): tendas antes das casas fixas.
        const camp = house.kind === 'house' && eco.camp(v);
        const sprite = camp ? 'tent' : house.kind !== 'house' ? house.kind : this.house(style, material, house.variant);
        this.building(sprite, sx, sy, Math.max(3, z * 2), v.color);
        if (!small && house.kind === 'house') {
          // Casa vazia na crise: tábuas nas janelas; assentamento próspero: canteiro de flores (RF-VIDA-254).
          if (house.empty) this.building('boards', sx, sy - 0.01, Math.max(3, z * 2), v.color);
          else if (prosperous && (house.x * 7 + house.y * 3) % 3 === 0) this.building('garden', X(house.x + 2.1), Y(house.y + 2) + 0.01, z * 0.55, v.color);
        }
        // Olaria acesa: fumaça saindo da chaminé.
        if (!small && house.kind === 'pottery') this.building(flame ? 'smoke' : 'smoke2', sx + z * 0.45, sy + z * 2.05, z * 0.5, v.color);
        // Obra em andamento (construção ou reforma): andaime por cima.
        if (!small && eco.underWork(house)) this.building('scaffold', sx, sy - 0.01, z * 1.75, v.color);
        // Na Idade da Pedra, algumas cabanas têm uma fogueira no quintal.
        if (!small && era === 0 && house.kind === 'house' && house.variant === 1) this.building(flame ? 'campfire' : 'campfire2', X(house.x + 2.3), Y(house.y + 2), z * 0.6, v.color);
      }
      // Cercados de pasto e o rebanho pastando dentro deles (RF-VIDA-215 e 216).
      if (!small && v.pens) {
        const animal = v.herd ? HERD_SPRITES[v.herd.kind] : '';
        // Parte do rebanho pode estar no pasto alto (RF-VIDA-293).
        let left = (v.herd?.head ?? 0) - (v.herd?.away ?? 0);
        for (const pen of v.pens) {
          const px = X(pen.x + 1);
          const py = Y(pen.y + 2);
          if (off(px, py, MARGIN)) continue;
          this.building('pen', px, py + 0.02, z * 2, v.color);
          // Até 3 bichos por cercado, andando devagar de um lado para o outro.
          const shown = animal ? Math.min(3, left) : 0;
          for (let k = 0; k < shown; k++) {
            const seed = (pen.x * 7 + pen.y * 13 + k * 31) % 17;
            const ox = 0.45 + 1.1 * (0.5 + 0.5 * Math.sin(secs * 0.25 + seed));
            const oy = 0.55 + 0.35 * k + 0.1 * Math.sin(secs * 0.4 + seed * 2);
            const facing = Math.cos(secs * 0.25 + seed) < 0 ? this.left(animal) : animal;
            this.building(facing, X(pen.x + ox), Y(pen.y + oy + 0.5), z * 0.62, HERD_TINT[v.herd!.kind]);
          }
          left -= shown;
        }
      }
      if (!small) {
        const fx = X(v.x);
        const fy = Y(v.y + 1.5);
        const capital = v.kingdom === v.id && eco.kingdomSize(v) > 1;
        // Idade da Pedra: a praça é uma fogueira, mesmo nas cidades; depois, poço ou fortaleza.
        if (era === 0) this.building(flame ? 'bonfire' : 'bonfire2', fx, fy, z * 1.25, v.color);
        else if (v.tier >= 2) {
          this.building(capital ? 'castle' : 'keep', fx, fy, z * (capital ? 2 : 2.6), v.color);
          // Bandeira com o brasão do reino na fortaleza (RF-VIDA-288).
          const king = eco.villages[v.kingdom];
          this.building(this.flag(king.vocation), fx + z * 0.15, fy + z * (capital ? 2.6 : 3.1), z * 1.1, king.color);
        } else this.building('well', fx, fy, z * 1.3, v.color);
        if (era >= 4 && z >= 6) this.lamps(eco, v, view, z);
        // Feira anual no verão: barracas em volta da praça (RF-VIDA-234).
        if (v.fair === Math.floor(eco.year) && eco.season() === 1) {
          for (const [ox, oy] of STALLS) this.building('stall', X(v.x + ox), Y(v.y + oy + 1), z * 0.8, STALL_TINTS[(Math.abs(Math.round(ox * 3 + oy)) + v.id) % STALL_TINTS.length]);
        }
      }
    }
    if (!small) {
      // Jazidas: caverna, veio ou mina, com pontos na cor do minério.
      for (const d of eco.deposits) {
        if (d.amount <= 0) continue;
        const sx = X(d.x + 0.5);
        const sy = Y(d.y + 1);
        if (off(sx, sy, MARGIN)) continue;
        const sprite = d.mine >= 0 ? 'mine' : d.cave ? 'cave' : 'vein';
        this.building(sprite, sx, sy, (DEPOSIT_ROWS[sprite] * z) / 8, ORE_COLORS[d.ore]);
      }
      // Ruínas de construções destruídas por desastres.
      for (const r of eco.ruins) {
        const sx = X(r.x);
        const sy = Y(r.y);
        if (off(sx, sy, MARGIN)) continue;
        this.building('ruin', sx, sy, z * 1.25, RUIN_TINT);
      }
      // Postos de pedágio nos passos de montanha (RF-VIDA-286).
      for (const [t, owner] of eco.tolls) {
        const o = eco.villages[owner];
        if (!o || o.abandoned) continue;
        const sx = X((t % mw) + 0.5);
        const sy = Y(Math.floor(t / mw) + 1);
        if (off(sx, sy, MARGIN)) continue;
        this.building('toll', sx, sy, z * 0.9, eco.villages[o.kingdom].color);
      }
    }
    // De cima para baixo, para as construções da frente cobrirem as de trás (na ordem de chegada quando empatam).
    const order = this.order;
    order.length = this.bn;
    for (let k = 0; k < this.bn; k++) order[k] = k;
    order.sort(this.byY);
    for (const k of order) layer.push(this.bName[k], this.bx[k], this.by[k], this.bh[k], this.bTint[k]);
    // Barcos com a cor do reino; destroços ficam boiando um pouco depois do naufrágio.
    const px = (z * 1.05) / 9;
    for (const b of eco.boats) {
      const sx = X(b.x);
      const sy = Y(b.y);
      if (off(sx, sy, MARGIN)) continue;
      const tint = eco.villages[b.village].color;
      if (small) {
        layer.push('dot', sx, sy, Math.max(2, z), tint);
        continue;
      }
      const name = b.sunk >= 0 ? 'wreck' : BOATS[b.kind].sprite;
      const rows = BOAT_ROWS[name] ?? 8;
      const bob = Math.sin(secs * 2 + b.x) * px * 0.6;
      layer.push(b.sunk < 0 && b.facing < 0 ? this.left(name) : name, sx, sy - z * 0.4 + bob, rows * px, tint, tint);
      // Barco mercante leva caixotes no convés (RF-VIDA-235).
      if (b.sunk < 0 && b.purpose === 'trade') layer.push('crates', sx - b.facing * z * 0.2, sy - z * 0.4 + bob + px * 3, z * 0.35, tint);
      // Bandeira do reino no mastro (RF-VIDA-288).
      if (b.sunk < 0 && z >= 4) {
        const king = eco.villages[eco.villages[b.village].kingdom];
        layer.push(this.flag(king.vocation), sx + z * 0.1, sy - z * 0.4 + bob + rows * px, z * 0.55, king.color);
      }
    }
    this.caravans(eco, view, layer, z, small);
    // Carcaças: o que sobrou de uma caçada ou de uma morte no mato, até apodrecer (necrófagos vêm comer).
    if (!small) {
      for (const cc of eco.carcasses) {
        const sx = X(cc.x);
        const sy = Y(cc.y);
        if (off(sx, sy, MARGIN)) continue;
        layer.push('carcass', sx, sy - z * 0.2, z * 0.45 * Math.min(1.3, 0.6 + Math.cbrt(cc.kg) / 8), eco.species[cc.sp]?.color ?? CARCASS_TINT);
      }
    }
    const creature = (i: number) => {
      if (!eco.alive[i]) return;
      const sx = X(pos.x(i));
      const sy = Y(pos.y(i));
      if (off(sx, sy, MARGIN)) return;
      this.creature(eco, layer, i, sx, sy, z, small, now);
    };
    if (visible) {
      const halfW = w / 2 / z + MARGIN / z + 1;
      const halfH = h / 2 / z + MARGIN / z + 1;
      const row = view.toRow(view.center.y);
      visible(view.center.x - halfW, view.center.x + halfW, row - halfH, row + halfH, creature);
    } else for (let i = 0; i < eco.count; i++) creature(i);
    this.effects(eco, view, layer, z);
    layer.end();
  }

  private creature(eco: Ecosystem, layer: SpriteLayer, i: number, sx: number, sy: number, z: number, small: boolean, now: number): void {
    const sp = eco.species[eco.kind[i]];
    const vi = eco.village[i];
    const tint = sp.kind === 'sapient' && vi >= 0 ? eco.villages[vi].color : sp.color;
    if (small) {
      layer.push('dot', sx, sy, Math.max(1.5, z * 0.7), tint);
      return;
    }
    if (sp.kind === 'sapient') {
      // Aparência pela profissão e pela idade; a pele de espécies alienígenas é a cor da espécie.
      const body = bodyOf(sp);
      const role = vi >= 0 ? eco.role[i] : 0;
      const era = vi >= 0 ? Math.floor(eco.villages[vi].tech) : 0;
      if (role === CHILD) {
        layer.push(this.role(body, 'child'), sx, sy - z * 0.5, z * 1.05 * (6 / 9), tint, sp.color);
        return;
      }
      const elder = eco.age[i] >= elderAge(sp, era) && role < LEADER;
      // Soldado montado (RF-VIDA-223): o cavalo embaixo e o soldado em cima.
      if (eco.mounted(i)) {
        layer.push(eco.vx[i] < 0 ? this.left('horse') : 'horse', sx, sy - z * 0.45, z * 0.9, HORSE_COAT);
        layer.push(this.role(body, 'soldier'), sx, sy - z * 1.15, z * 0.95 * (11 / 9), tint, sp.color);
        return;
      }
      // Gesto no lugar da tarefa (RF-AS-27): quem trabalha balança no ritmo do gesto, com a ferramenta ao lado.
      const g = eco.gesture[i];
      const beat = g && g !== GESTURE.carry ? Math.sin(now / (g === GESTURE.talk || g === GESTURE.pray ? 420 : 160) + i) : 0;
      const bob = g === GESTURE.rest ? 0 : beat * z * 0.08;
      layer.push(this.role(body, elder ? ELDER : ROLES[role]), sx, sy - z * 0.5 + bob, z * 1.05 * (11 / 9), tint, sp.color);
      if (g === GESTURE.dig || g === GESTURE.reap || g === GESTURE.chop || g === GESTURE.hammer || g === GESTURE.pick || g === GESTURE.row) {
        layer.push('tool', sx + z * 0.45, sy - z * (0.75 + 0.15 * beat), z * 0.42, tint);
      }
      // Carga na mão (RF-AS-24): o cesto, o feixe, a pedra, o minério ou o balde acima do ombro.
      const load = eco.carry[i] ? CARRIED[eco.carry[i] - 1] : null;
      if (load) layer.push(LOAD_ART[load] ?? 'load:ore', sx + z * 0.3, sy - z * 1.25, z * 0.5, tint);
      return;
    }
    const name: SpriteName = spriteOf(sp);
    // Altura pelo tamanho da espécie; os bichos olham para onde andam.
    const height = (name === 'fish' ? 0.5 : name === 'shark' ? 0.55 : name === 'whale' ? 0.7 : 0.85) * (sp.size ?? 1);
    layer.push(eco.vx[i] < 0 ? this.left(name) : name, sx, sy - z * 0.5, z * height, tint);
  }

  /**
   * Caravanas (RF-VIDA-230): o comerciante na frente, os animais de carga
   * atrás, com fardos no lombo na Idade da Pedra, carroça do Bronze ao Ferro
   * e carroção coberto depois. Na transumância, o pastor e o rebanho.
   */
  private caravans(eco: Ecosystem, view: Viewport, layer: SpriteLayer, z: number, small: boolean): void {
    const w = view.width;
    const h = view.height;
    const X = (x: number) => view.screenX(x, z);
    const Y = (row: number) => view.glY(row, z);
    const tall = z * 1.05 * (11 / 9);
    for (const c of eco.caravans) {
      const home = eco.villages[c.home];
      const sx = X(c.x);
      const sy = Y(c.y);
      if (sx < -MARGIN || sx > w + MARGIN || sy < -MARGIN || sy > h + MARGIN) continue;
      if (small) {
        layer.push('dot', sx, sy, Math.max(2, z), home.color);
        continue;
      }
      const left = c.facing < 0;
      const bx = (k: number) => X(c.x - c.facing * k);
      const by = (k: number) => Y(c.y + 0.05 * (k % 2));
      const sp = eco.species[home.species];
      const body = bodyOf(sp);
      if (c.kind === 'flock') {
        const name = HERD_SPRITES[c.animal] ?? 'sheep';
        const shown = Math.min(5, c.animals);
        for (let k = shown; k >= 1; k--) {
          const ax = X(c.x - c.facing * (0.7 + 0.55 * k));
          const ay = Y(c.y + 0.35 * (((k * 7) % 3) - 1));
          layer.push(left ? this.left(name) : name, ax, ay - z * 0.5, z * 0.62, HERD_TINT[c.animal] ?? FLOCK_TINT);
        }
        layer.push(this.role(body, 'shepherd'), sx, sy - z * 0.5, tall, home.color, sp.color);
        continue;
      }
      // Visita (RF-AS-42): viajantes a pé, sem animal; colonos (RF-AS-03): famílias andando atrás do enxoval.
      if (c.kind === 'visit') {
        layer.push(this.role(body, 'gatherer'), bx(0.7), by(0.7) - z * 0.5, tall, home.color, sp.color);
        layer.push(this.role(body, 'merchant'), sx, sy - z * 0.5, tall, home.color, sp.color);
        continue;
      }
      if (c.kind === 'settlers') {
        for (let k = 3; k >= 1; k--) {
          const d = 1.6 + k * 0.6;
          layer.push(this.role(body, k === 3 ? 'child' : 'farmer'), bx(d), by(d) - z * 0.5, z * 1.05 * (k === 3 ? 6 / 9 : 11 / 9), home.color, sp.color);
        }
      }
      const animal = c.animal === 'donkey' ? 'donkey' : c.animal;
      const tint = c.animal === 'donkey' ? DONKEY_TINT : (HERD_TINT[c.animal] ?? CARGO_TINT);
      const n = Math.max(1, Math.min(3, c.animals));
      // De trás para a frente: carroça, animais, comerciante.
      if (c.cart > 0) {
        const cart = c.cart >= 2 ? 'wagon' : 'cart';
        const d = 0.8 + n * 0.85;
        layer.push(left ? this.left(cart) : cart, bx(d), by(d) - z * 0.5, z * (c.cart >= 2 ? 0.95 : 0.7), home.color);
      }
      for (let k = n; k >= 1; k--) {
        const d = 0.15 + k * 0.85;
        const ax = bx(d);
        const ay = by(d);
        layer.push(left ? this.left(animal) : animal, ax, ay - z * 0.5, z * 0.72, tint);
        if (c.cart === 0) layer.push(left ? 'packs:l' : 'packs', ax - c.facing * z * 0.05, ay - z * 0.5 + z * 0.42, z * 0.32, tint);
      }
      layer.push(this.role(body, 'merchant'), sx, sy - z * 0.5, tall, home.color, sp.color);
    }
  }

  /** Lampiões nas ruas principais e na avenida da Era Industrial. */
  private lamps(eco: Ecosystem, v: Village, view: Viewport, z: number): void {
    const w = view.width;
    const h = view.height;
    const r = Math.ceil(eco.radius(v));
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (((cx + dx) * 3 + (cy + dy) * 5) % 7 !== 0) continue;
        const t = view.tileIndex(cx + dx, view.mapHeight - (cy + dy) - 1);
        if (t < 0 || !eco.mainStreet[t] || !(eco.road[t] === 2 || eco.road[t] === AVENUE)) continue;
        const sx = view.screenX(cx + dx + 0.85, z);
        const sy = view.glY(cy + dy + 1, z);
        if (sx < -MARGIN || sx > w + MARGIN || sy < -MARGIN || sy > h + MARGIN) continue;
        this.building('lamp', sx, sy, z * 0.8, v.color);
      }
    }
  }

  /** Efeitos de eventos (cometa caindo, explosão, fumaça, fogo, peste) e marcadores de guerra. */
  private effects(eco: Ecosystem, view: Viewport, layer: SpriteLayer, z: number): void {
    const w = view.width;
    const h = view.height;
    const wide = MARGIN * 4;
    for (const fx of eco.effects) {
      const t = fx.age / fx.life;
      let x = fx.x;
      let y = fx.y;
      let size = Math.max(fx.size, 1) * z;
      if (fx.kind === 'comet') {
        // Desce do céu em diagonal até o ponto de impacto.
        x -= (1 - t) * 30;
        y -= (1 - t) * 40;
        size = z * 3;
      } else if (fx.kind === 'boom') {
        // A explosão só aparece quando o cometa chega (depois de 2 s) e cresce.
        const start = 2 / fx.life;
        if (t < start && fx.life > 3) continue;
        size *= 0.6 + 0.4 * Math.min(1, (t - start) * 4);
      } else if (fx.kind === 'smoke') {
        y -= t * 4;
        size *= 1 + t;
      } else if (fx.kind === 'flame') {
        size = z * (1 + 0.2 * Math.sin(fx.age * 12 + fx.x));
      } else if (fx.kind === 'quake') {
        size = z * 1.2;
      } else size = z * 1.6;
      const sx = view.screenX(x, z);
      const sy = view.glY(y, z);
      if (sx < -wide || sx > w + wide || sy < -wide || sy > h + wide) continue;
      layer.push(fx.kind, sx, sy, size, WHITE);
    }
    // Espadas cruzadas sobre os alvos das guerras em andamento.
    if (z >= 1.5) {
      for (const war of eco.wars) {
        const v = eco.villages[war.target];
        const sx = view.screenX(v.x, z);
        const sy = view.glY(v.y - 4.5, z);
        if (sx < -MARGIN || sx > w + MARGIN || sy < -MARGIN || sy > h + MARGIN) continue;
        layer.push('swords', sx, sy, Math.max(10, z * 1.6), WHITE);
      }
    }
  }
}
