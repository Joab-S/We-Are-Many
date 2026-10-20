import { temperatureAt } from '../procgen/surface';
import { makeCulture, type Ore } from './economy';
import { isLand, isWater, type Ecosystem, type Village } from './ecosystem';
import { CHILD } from './roles';
import { TIER_RADIUS } from './settlement';
import { makeVariant } from './species';

/**
 * Eventos do mundo (REQUISITOS-VIDA.md, seção 8.1): desastres naturais,
 * cometas, povos e espécies que chegam ou reaparecem. Acontecem raramente
 * por conta própria e, quando o mundo fica monótono (muitos anos sem nada
 * importante), um deles sacode a história. O jogador pode provocar os
 * naturais pelas ferramentas da aba Eventos.
 */

export const WORLD_EVENTS = ['comet', 'quake', 'volcano', 'island', 'fire', 'drought', 'plague', 'nomads', 'newSpecies', 'return', 'herd', 'goldenAge'] as const;
export type WorldEvent = (typeof WORLD_EVENTS)[number];

export const WORLD_EVENT_NAMES: Record<WorldEvent, string> = {
  comet: 'Cometa',
  quake: 'Terremoto',
  volcano: 'Vulcão',
  island: 'Ilha vulcânica',
  fire: 'Incêndio florestal',
  drought: 'Seca',
  plague: 'Peste',
  nomads: 'Povo nômade',
  newSpecies: 'Espécie nova',
  return: 'Espécie que reaparece',
  herd: 'Migração de animais',
  goldenAge: 'Era de ouro',
};

/** Anos sem acontecimento importante para o mundo ser considerado monótono. */
export const QUIET_YEARS = 30;

/** Chance de um evento natural por ano, mesmo sem marasmo (≈ 1 a cada 40 anos). */
const BASE_CHANCE = 0.025;

/** Uma vez por ano: talvez um evento aleatório (bem mais provável se o mundo está parado). */
export function yearlyEvents(eco: Ecosystem): void {
  if (!eco.autoEvents) return;
  const quiet = eco.year - eco.lastMajor > QUIET_YEARS;
  const chance = (quiet ? 0.2 : BASE_CHANCE) * eco.eventRate;
  if (eco.random() < chance) runRandomEvent(eco, quiet);
}

/** Sorteia e executa um evento, com pesos pelo estado do mundo. Retorna qual aconteceu. */
export function runRandomEvent(eco: Ecosystem, quiet = false): WorldEvent | null {
  const live = eco.villages.filter((v) => !v.abandoned);
  const kingdoms = live.filter((v) => v.kingdom === v.id).length;
  const big = live.some((v) => v.population >= 40);
  const sapients = eco.species.some((sp) => sp.kind === 'sapient');
  const weights: [WorldEvent, number][] = [
    ['comet', 2],
    ['quake', 2],
    ['volcano', 1.2],
    ['island', 0.6],
    ['fire', 1.5],
    ['drought', 1],
    ['plague', big ? 1.2 : 0],
    // No marasmo, gente nova e bichos novos mexem mais com a história.
    ['nomads', sapients ? (kingdoms < 4 ? 3 : 1.2) * (quiet ? 1.5 : 1) : 0],
    ['newSpecies', 1.2],
    ['return', eco.extinct.size ? 2 : 0],
    ['herd', 1],
    ['goldenAge', live.length ? 0.8 : 0],
  ];
  let total = 0;
  for (const [, w] of weights) total += w;
  let r = eco.random() * total;
  for (const [ev, w] of weights) {
    r -= w;
    if (r > 0 || w === 0) continue;
    if (runEvent(eco, ev)) return ev;
    break;
  }
  // Se o sorteado não coube (ex.: sem lugar), um cometa sempre cabe.
  return runEvent(eco, 'comet') ? 'comet' : null;
}

/** Executa um evento; `x`, `y` (tile) escolhem o lugar quando o jogador provoca. */
export function runEvent(eco: Ecosystem, ev: WorldEvent, x?: number, y?: number): boolean {
  switch (ev) {
    case 'comet':
      return comet(eco, x, y);
    case 'quake':
      return quake(eco, x, y);
    case 'volcano':
      return volcano(eco, x, y, false);
    case 'island':
      return volcano(eco, x, y, true);
    case 'fire':
      return fire(eco, x, y);
    case 'drought':
      return drought(eco, x, y);
    case 'plague':
      return plague(eco);
    case 'nomads':
      return nomads(eco);
    case 'newSpecies':
      return newSpecies(eco);
    case 'return':
      return reappear(eco);
    case 'herd':
      return herd(eco);
    case 'goldenAge':
      return goldenAge(eco);
  }
}

// Lugares --------------------------------------------------------------------

function randomTile(eco: Ecosystem, ok: (i: number) => boolean, tries = 200): number {
  const n = eco.map.width * eco.map.height;
  for (let t = 0; t < tries; t++) {
    const i = Math.floor(eco.random() * n);
    if (ok(i)) return i;
  }
  return -1;
}

const xy = (eco: Ecosystem, i: number) => ({ x: (i % eco.map.width) + 0.5, y: Math.floor(i / eco.map.width) + 0.5 });

/** Longe de todos os assentamentos (para desastres não apagarem uma capital por acaso). */
function farFromVillages(eco: Ecosystem, i: number, margin: number): boolean {
  const { x, y } = xy(eco, i);
  return eco.villages.every((v) => v.abandoned || Math.hypot(wrap(eco, v.x - x), v.y - y) > TIER_RADIUS[v.tier] + margin);
}

const wrap = (eco: Ecosystem, dx: number) => {
  const w = eco.map.width;
  return dx > w / 2 ? dx - w : dx < -w / 2 ? dx + w : dx;
};

/** Assentamento mais perto de um ponto (para dizer onde foi). */
function nearest(eco: Ecosystem, x: number, y: number, within = 40): Village | null {
  let best: Village | null = null;
  let bd = within;
  for (const v of eco.villages) {
    if (v.abandoned) continue;
    const d = Math.hypot(wrap(eco, v.x - x), v.y - y);
    if (d < bd) {
      bd = d;
      best = v;
    }
  }
  return best;
}

const near = (eco: Ecosystem, x: number, y: number) => {
  const v = nearest(eco, x, y);
  return v ? ` perto de ${v.name}` : '';
};

// Desastres --------------------------------------------------------------------

/**
 * Cometa: cai em 2 s (efeito), abre uma cratera que vira lago, levanta a
 * borda, queima a mata e deixa minério na borda. Povos perto passam a crer
 * no cometa.
 */
function comet(eco: Ecosystem, px?: number, py?: number): boolean {
  let x = px;
  let y = py;
  if (x === undefined || y === undefined) {
    const i = randomTile(eco, (t) => isLand(eco.map, t) && farFromVillages(eco, t, 6));
    if (i < 0) return false;
    ({ x, y } = xy(eco, i));
  }
  const r = 3 + eco.random() * 3;
  eco.effect('comet', x, y, 2, r);
  eco.effect('boom', x, y, 3.5, r * 2.2);
  eco.effect('smoke', x + 1, y - 1, 8, r * 1.4);
  eco.shake = Math.max(eco.shake, 1.2);
  eco.killAround(x, y, r * 1.3);
  const houses = eco.destroyAround(x, y, r * 1.2);
  eco.reshape(x, y, r * 1.7, (i, d) => {
    const m = eco.map;
    if (d < r) m.elevation[i] = Math.min(m.elevation[i], -0.08 - (1 - d / r) * 0.25);
    else m.elevation[i] = Math.min(1, m.elevation[i] + 0.08 * (1 - (d - r) / (r * 0.7)));
    m.moisture[i] = Math.min(1, m.moisture[i] + 0.3);
    m.vegetation[i] *= 0.2;
  });
  // Rocha do espaço: ferro, ouro ou cobre na borda da cratera.
  const ore: Ore = eco.random() < 0.55 ? 'iron' : eco.random() < 0.6 ? 'gold' : 'copper';
  const a = eco.random() * Math.PI * 2;
  const d = eco.addDeposit(x + Math.cos(a) * (r + 1), y + Math.sin(a) * (r + 1), ore, 120 + Math.round(eco.random() * 100), false);
  const v = nearest(eco, x, y, 60);
  if (v && eco.random() < 0.5) v.culture.belief = 'o Cometa';
  eco.note(
    `Um cometa caiu${near(eco, x, y)}${houses ? ` e destruiu ${houses} construções` : ''}${d ? `, deixando ${ore === 'iron' ? 'ferro' : ore === 'gold' ? 'ouro' : 'cobre'} na cratera` : ''}`,
    'natureza',
    { x, y },
    { major: true },
  );
  return true;
}

/**
 * Terremoto: uma falha corta o terreno; um lado sobe e o outro afunda
 * (morros novos, costa que avança ou recua). Casas perto da falha caem e
 * a rocha exposta pode revelar uma caverna com minério.
 */
function quake(eco: Ecosystem, px?: number, py?: number): boolean {
  let x = px;
  let y = py;
  if (x === undefined || y === undefined) {
    const i = randomTile(eco, (t) => isLand(eco.map, t));
    if (i < 0) return false;
    ({ x, y } = xy(eco, i));
  }
  const ang = eco.random() * Math.PI;
  const len = 18 + eco.random() * 30;
  const nx = -Math.sin(ang);
  const ny = Math.cos(ang);
  const lift = 0.08 + eco.random() * 0.1;
  let fallen = 0;
  for (let s = -len / 2; s <= len / 2; s += 2) {
    const cx = x + Math.cos(ang) * s;
    const cy = y + Math.sin(ang) * s;
    eco.reshape(cx, cy, 4, (i, d) => {
      const tx = (i % eco.map.width) + 0.5;
      const ty = Math.floor(i / eco.map.width) + 0.5;
      const side = wrap(eco, tx - cx) * nx + (ty - cy) * ny;
      const k = (1 - d / 4) * 0.5;
      eco.map.elevation[i] = Math.max(-1, Math.min(1, eco.map.elevation[i] + (side > 0 ? lift : -lift * 0.6) * k));
    });
    if (Math.abs(s) % 8 < 2) eco.effect('quake', cx, cy, 6, 2);
    fallen += eco.destroyAround(cx, cy, 5, 0.45);
  }
  const dead = eco.killAround(x, y, 6, 0.3);
  eco.shake = Math.max(eco.shake, 3);
  const found = eco.random() < 0.6 && eco.addDeposit(x + nx * 3, y + ny * 3, (['iron', 'coal', 'copper', 'tin', 'gold'] as Ore[])[Math.floor(eco.random() * 5)], 90 + Math.round(eco.random() * 120), true);
  eco.note(
    `Um terremoto sacudiu a terra${near(eco, x, y)}${fallen ? `: ${fallen} construções caíram` : ''}${dead ? `, ${dead} mortos` : ''}${found ? '; a rocha rachada revelou uma caverna' : ''}`,
    'natureza',
    { x, y },
    { major: true },
  );
  return true;
}

/**
 * Vulcão: o chão sobe num cone, a lava escorre (e esfria em rocha ao longo
 * dos anos), a mata queima e sobra minério nas encostas. No mar, ergue uma
 * ilha nova.
 */
function volcano(eco: Ecosystem, px: number | undefined, py: number | undefined, sea: boolean): boolean {
  let x = px;
  let y = py;
  if (x === undefined || y === undefined) {
    const i = sea
      ? randomTile(eco, (t) => isWater(eco.map, t) && eco.map.elevation[t] > -0.5 && farFromVillages(eco, t, 10))
      : randomTile(eco, (t) => isLand(eco.map, t) && eco.map.elevation[t] > 0.25 && farFromVillages(eco, t, 8));
    if (i < 0) return false;
    ({ x, y } = xy(eco, i));
  }
  const r = sea ? 5 + eco.random() * 5 : 4 + eco.random() * 3;
  eco.effect('boom', x, y, 3, r * 1.5);
  for (let k = 0; k < 5; k++) eco.effect('smoke', x + (eco.random() - 0.5) * 3, y - k, 20 + k * 4, 2 + k * 0.6);
  eco.shake = Math.max(eco.shake, 2);
  eco.killAround(x, y, r * 1.2);
  const fallen = eco.destroyAround(x, y, r * 1.2);
  eco.reshape(x, y, r * 1.8, (i, d) => {
    const m = eco.map;
    const peak = sea ? 0.45 : 0.78;
    const target = peak * (1 - d / (r * 1.8)) ** 1.4;
    if (sea) m.elevation[i] = Math.max(m.elevation[i], target - 0.12);
    else m.elevation[i] = Math.min(1, m.elevation[i] + target * 0.6);
    m.vegetation[i] *= d < r ? 0 : 0.4;
    if (sea) m.moisture[i] = Math.max(m.moisture[i], 0.5);
  });
  // Lava no centro e escorrendo para um lado.
  const flow = eco.random() * Math.PI * 2;
  for (let s = 0; s < r * 1.5; s += 1) {
    const t = Math.floor(y + Math.sin(flow) * s) * eco.map.width + ((Math.floor(x + Math.cos(flow) * s) % eco.map.width) + eco.map.width) % eco.map.width;
    if (t >= 0 && t < eco.map.width * eco.map.height) {
      eco.pourLava(t, 500);
      eco.effect('flame', (t % eco.map.width) + 0.5, Math.floor(t / eco.map.width) + 0.5, 12 + s, 1);
    }
  }
  eco.reshape(x, y, 1.5, (i) => eco.pourLava(i, 500));
  for (let k = 0; k < 2; k++) {
    const a = eco.random() * Math.PI * 2;
    eco.addDeposit(x + Math.cos(a) * r, y + Math.sin(a) * r, (['coal', 'iron', 'gold'] as Ore[])[Math.floor(eco.random() * 3)], 100 + Math.round(eco.random() * 100), eco.random() < 0.5);
  }
  eco.note(
    sea ? `Um vulcão submarino ergueu uma ilha nova no mar${near(eco, x, y)}` : `Um vulcão entrou em erupção${near(eco, x, y)}${fallen ? ` e destruiu ${fallen} construções` : ''}`,
    'natureza',
    { x, y },
    { major: true },
  );
  return true;
}

/** Incêndio florestal: a mata seca pega fogo e queima numa área; os animais morrem ou fogem. */
function fire(eco: Ecosystem, px?: number, py?: number): boolean {
  let x = px;
  let y = py;
  if (x === undefined || y === undefined) {
    const i = randomTile(eco, (t) => isLand(eco.map, t) && eco.map.vegetation[t] > 0.55 && farFromVillages(eco, t, 4));
    if (i < 0) return false;
    ({ x, y } = xy(eco, i));
  }
  const r = 6 + eco.random() * 8;
  let burned = 0;
  eco.reshape(x, y, r, (i, d) => {
    const m = eco.map;
    if (m.vegetation[i] < 0.2 || eco.random() > 1.1 - d / r) return;
    m.vegetation[i] = 0.04;
    burned++;
    if (eco.random() < 0.06) eco.effect('flame', (i % m.width) + 0.5, Math.floor(i / m.width) + 0.5, 6 + eco.random() * 10, 1);
  });
  eco.effect('smoke', x, y, 14, r * 0.6);
  eco.killAround(x, y, r * 0.8, 0.5);
  const fallen = eco.destroyAround(x, y, r * 0.7, 0.3);
  eco.note(`Um incêndio queimou a floresta${near(eco, x, y)}${fallen ? ` e ${fallen} construções` : ''}`, 'natureza', { x, y }, { major: burned > 40 });
  return true;
}

/** Seca: a vegetação murcha numa região grande (volta com o tempo) e a comida fica escassa. */
function drought(eco: Ecosystem, px?: number, py?: number): boolean {
  let x = px;
  let y = py;
  if (x === undefined || y === undefined) {
    const i = randomTile(eco, (t) => isLand(eco.map, t) && eco.map.vegetation[t] > 0.3);
    if (i < 0) return false;
    ({ x, y } = xy(eco, i));
  }
  const r = 16 + eco.random() * 14;
  eco.reshape(x, y, r, (i, d) => {
    eco.map.vegetation[i] *= 0.35 + 0.5 * (d / r);
  });
  for (const v of eco.villages) {
    if (!v.abandoned && Math.hypot(wrap(eco, v.x - x), v.y - y) < r) v.food = 0;
  }
  eco.note(`Uma seca castigou a região${near(eco, x, y)}`, 'natureza', { x, y }, { major: true });
  return true;
}

/** Peste: começa numa cidade cheia e pode passar para assentamentos do mesmo reino. */
function plague(eco: Ecosystem): boolean {
  const live = eco.villages.filter((v) => !v.abandoned && v.population >= 25);
  if (!live.length) return false;
  const start = live.sort((a, b) => b.population - a.population)[Math.floor(eco.random() * Math.min(3, live.length))];
  const hit = new Set([start.id]);
  for (const v of eco.villages) {
    if (!v.abandoned && v !== start && v.kingdom === start.kingdom && eco.random() < 0.35) hit.add(v.id);
  }
  let dead = 0;
  for (let i = 0; i < eco.count; i++) {
    if (!eco.alive[i] || !hit.has(eco.village[i])) continue;
    // Crianças e idosos morrem mais.
    const frail = eco.role[i] === CHILD || eco.age[i] > eco.species[eco.kind[i]].maxAge * 0.6;
    if (eco.random() < (frail ? 0.35 : 0.15)) {
      eco.kill(i, true);
      dead++;
    }
  }
  for (const id of hit) {
    const v = eco.villages[id];
    eco.effect('skull', v.x, v.y - 2, 12, 1);
  }
  eco.note(`Uma peste atingiu ${start.name}${hit.size > 1 ? ` e mais ${hit.size - 1} assentamentos` : ''}: ${dead} mortos`, 'natureza', start, { major: true });
  return dead > 0;
}

// Povos e espécies ----------------------------------------------------------

/**
 * Povo nômade: um grupo de uma espécie inteligente que já vive no planeta
 * chega de terras distantes e funda um assentamento longe dos outros, com
 * cultura própria e um pouco do conhecimento do mundo.
 */
function nomads(eco: Ecosystem): boolean {
  const kinds = eco.species.map((sp, s) => ({ sp, s })).filter(({ sp }) => sp.kind === 'sapient');
  if (!kinds.length) return false;
  const { s } = kinds[Math.floor(eco.random() * kinds.length)];
  const map = eco.map;
  const i = randomTile(
    eco,
    (t) => eco.habitable(s, t) && map.vegetation[t] > 0.3 && farFromVillages(eco, t, 25) && eco.canFound(t % map.width, Math.floor(t / map.width)),
    600,
  );
  if (i < 0) return false;
  const live = eco.villages.filter((v) => !v.abandoned);
  const tech = live.length ? Math.min(...live.map((v) => v.tech)) * 0.7 : 0;
  const v = eco.foundVillage(s, i % map.width, Math.floor(i / map.width), 7 + Math.floor(eco.random() * 5));
  v.tech = Math.min(tech, Math.floor(tech) + 0.5);
  v.culture = makeCulture(v.culture.id, v.name, () => eco.random());
  v.stock.wood += 20;
  eco.effect('tent', v.x + 2, v.y, 40, 1);
  eco.note(`Um povo nômade, os ${v.culture.name}, chegou de terras distantes e fundou ${v.name}`, 'povo', v, { major: true });
  return true;
}

/**
 * Espécie nova: uma população de animal isolada vira variante própria
 * (RF-VIDA-51), adaptada ao clima de onde vive. Nunca cria inteligentes.
 */
function newSpecies(eco: Ecosystem): boolean {
  const options = eco.species.map((sp, s) => ({ sp, s })).filter(({ sp, s }) => sp.kind !== 'sapient' && eco.population[s] >= 6 && !sp.parent);
  if (!options.length) return herd(eco);
  const { sp, s } = options[Math.floor(eco.random() * options.length)];
  // Um indivíduo qualquer da espécie: onde ela vive, nasce a variante.
  let at = -1;
  for (let k = 0; k < 400 && at < 0; k++) {
    const i = Math.floor(eco.random() * eco.count);
    if (eco.alive[i] && eco.kind[i] === s) at = i;
  }
  if (at < 0) return false;
  const tile = Math.floor(eco.y[at]) * eco.map.width + Math.floor(eco.x[at]);
  const variant = makeVariant(sp, temperatureAt(eco.map, tile), eco.map.elevation[tile], eco.species.length, () => eco.random());
  if (eco.species.some((o) => o.name === variant.name)) return false;
  const ns = eco.addSpecies(variant);
  const born = eco.introduce(ns, eco.x[at], eco.y[at], 6, 10);
  if (!born) return false;
  eco.note(`Uma espécie nova surgiu: ${variant.name}, descendente de ${sp.name.toLowerCase()}s isolados`, 'natureza', { x: eco.x[at], y: eco.y[at] }, { major: true });
  return true;
}

/** Uma espécie extinta reaparece: sobreviventes escondidos voltam a se multiplicar. */
function reappear(eco: Ecosystem): boolean {
  for (const s of eco.extinct) {
    const i = randomTile(eco, (t) => eco.habitable(s, t), 800);
    if (i < 0) continue;
    const { x, y } = xy(eco, i);
    const born = eco.introduce(s, x, y, 8, 12);
    if (!born) continue;
    eco.extinct.delete(s);
    eco.note(`${eco.species[s].name}s reapareceram: alguns sobreviveram escondidos`, 'natureza', { x, y }, { major: true });
    return true;
  }
  return false;
}

/** Migração: uma manada de uma espécie que já vive aqui chega a uma região com bastante pasto. */
function herd(eco: Ecosystem): boolean {
  const options = eco.species.map((sp, s) => ({ sp, s })).filter(({ sp }) => sp.kind === 'herbivore' || sp.kind === 'predator');
  if (!options.length) return false;
  const { sp, s } = options[Math.floor(eco.random() * options.length)];
  const i = randomTile(eco, (t) => eco.habitable(s, t) && eco.map.vegetation[t] > 0.45, 500);
  if (i < 0) return false;
  const { x, y } = xy(eco, i);
  const born = eco.introduce(s, x, y, 6, sp.kind === 'predator' ? 5 : 14);
  if (!born) return false;
  eco.note(`${sp.kind === 'predator' ? 'Uma alcateia' : 'Uma manada'} de ${sp.name.toLowerCase()}s migrou para a região${near(eco, x, y)}`, 'natureza', { x, y });
  return true;
}

/** Era de ouro: sábios de um reino aceleram o conhecimento (sem pular a condição de era). */
function goldenAge(eco: Ecosystem): boolean {
  const capitals = eco.villages.filter((v) => !v.abandoned && v.kingdom === v.id && v.population >= 10);
  if (!capitals.length) return false;
  const v = capitals[Math.floor(eco.random() * capitals.length)];
  for (const o of eco.villages) if (!o.abandoned && o.kingdom === v.id) eco.teachVillage(o, 0.3);
  if (v.stock.gold < 5) v.stock.gold += 5;
  eco.note(`Uma era de ouro começou no reino de ${v.name}: sábios, artistas e comerciantes prosperam`, 'povo', v, { major: true });
  return true;
}
