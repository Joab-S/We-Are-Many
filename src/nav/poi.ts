import { LruCache } from '../core/lru';
import { mulberry32, seedFor } from '../core/rng';
import { AU_PER_PC, KM_PER_AU } from '../core/units';
import { alienName } from '../sim/species';

/**
 * Pontos de interesse do espaço profundo (seção 3.5: "nunca mais que ~3 min
 * sem nada interessante"). O espaço é dividido em células de CELL_PC parsecs
 * e cada célula gera, pelo próprio índice, de zero a dois pontos. Nada é
 * guardado: a mesma célula sempre gera os mesmos pontos (RNF-06).
 */

export type PoiKind = 'nebula' | 'rogue' | 'comet' | 'derelict' | 'signal' | 'brown-dwarf';

export interface Poi {
  id: string;
  kind: PoiKind;
  name: string;
  /** Posição no mundo, em UA. */
  pos: [number, number, number];
  /** Raio visual, em UA. */
  radius: number;
  /** Cor principal (RGB hex). */
  color: number;
  description: string;
}

export const CELL_PC = 2;
const CELL_AU = CELL_PC * AU_PER_PC;
/** Nada é gerado tão perto do Sol, para não poluir o ponto de partida. */
const SOL_CLEAR_AU = 0.4 * AU_PER_PC;

export const POI_LABEL: Record<PoiKind, string> = {
  nebula: 'Nebulosa',
  rogue: 'Planeta errante',
  comet: 'Cometa interestelar',
  derelict: 'Destroços',
  signal: 'Sinal desconhecido',
  'brown-dwarf': 'Anã marrom',
};

/** Peso de cada tipo no sorteio. */
const KIND_WEIGHTS: [PoiKind, number][] = [
  ['brown-dwarf', 0.22],
  ['rogue', 0.2],
  ['comet', 0.22],
  ['nebula', 0.12],
  ['derelict', 0.12],
  ['signal', 0.12],
];

const DERELICT_LORE = [
  'Casco de uma sonda antiga, sem energia. Os registros falam de uma viagem que começou há milênios.',
  'Restos de uma estação de reabastecimento. Alguém passou por aqui antes de nós.',
  'Fragmentos de um motor de fusão, ainda radioativos. Nenhuma tripulação a bordo.',
  'Um farol apagado, que um dia marcou uma rota entre as estrelas.',
];
const SIGNAL_LORE = [
  'Pulso de rádio repetido a cada 7,3 segundos. Natural ou artificial? Ainda não dá para saber.',
  'Emissão estreita em 1420 MHz, a linha do hidrogênio. Alguém escolheu bem a frequência.',
  'Eco fraco com estrutura de números primos.',
  'Interferência que só aparece quando a nave para. Ela parece estar nos ouvindo.',
];

function pickKind(r: number): PoiKind {
  let acc = 0;
  for (const [k, w] of KIND_WEIGHTS) {
    acc += w;
    if (r < acc) return k;
  }
  return 'comet';
}

const km = (v: number): number => v / KM_PER_AU;

function make(id: string, kind: PoiKind, pos: [number, number, number], rnd: () => number): Poi {
  const code = `${(Math.floor(rnd() * 9000) + 1000).toString()}`;
  switch (kind) {
    case 'nebula': {
      const color = [0xd070ff, 0x60b0ff, 0xff7090, 0x70ffd0][Math.floor(rnd() * 4)];
      return { id, kind, pos, color, name: `Nebulosa ${alienName(rnd)}`, radius: (0.03 + rnd() * 0.06) * AU_PER_PC, description: 'Nuvem de gás e poeira iluminada por dentro. Berçário de estrelas e fonte de hidrogênio.' };
    }
    case 'rogue':
      return { id, kind, pos, color: 0x5a6a80, name: `Planeta errante ${alienName(rnd)}`, radius: km(6000 + rnd() * 6000) * 100, description: 'Um planeta sem estrela, expulso do seu sistema. Escuro e gelado por fora, talvez quente por dentro.' };
    case 'comet':
      return { id, kind, pos, color: 0xaee8ff, name: `Cometa ${alienName(rnd, 2)}-${code}`, radius: km(30) * 2000, description: 'Bola de gelo vagando entre as estrelas. Rica em água e voláteis.' };
    case 'derelict':
      return { id, kind, pos, color: 0xffc070, name: `Destroços ${code}`, radius: km(20) * 2000, description: DERELICT_LORE[Math.floor(rnd() * DERELICT_LORE.length)] };
    case 'signal':
      return { id, kind, pos, color: 0x80ffa0, name: `Sinal ${code}`, radius: km(15) * 2000, description: SIGNAL_LORE[Math.floor(rnd() * SIGNAL_LORE.length)] };
    case 'brown-dwarf':
      return { id, kind, pos, color: 0xb04a30, name: `Anã marrom WAM-${code}`, radius: km(70000) * 100, description: 'Estrela que não chegou a acender. Fria demais para o catálogo, quente o bastante para brilhar em infravermelho.' };
  }
}

/** Células já geradas; a lista do GUIA (6 pc) consulta 343 por vez. Antes, o cache era esvaziado inteiro ao passar de 4000. */
const CELL_CACHE_LIMIT = 4096;
const cellCache = new LruCache<string, Poi[]>(CELL_CACHE_LIMIT);

/** Pontos de interesse da célula (ix, iy, iz). */
export function poisInCell(ix: number, iy: number, iz: number): Poi[] {
  const key = `${ix},${iy},${iz}`;
  let list = cellCache.get(key);
  if (list) return list;
  list = [];
  const rnd = mulberry32(seedFor(`poi:${key}`));
  const roll = rnd();
  const count = roll < 0.5 ? 1 : roll < 0.68 ? 2 : 0;
  for (let k = 0; k < count; k++) {
    const pos: [number, number, number] = [(ix + rnd()) * CELL_AU, (iy + rnd()) * CELL_AU, (iz + rnd()) * CELL_AU];
    const kind = pickKind(rnd());
    if (Math.hypot(...pos) < SOL_CLEAR_AU) continue;
    list.push(make(`poi:${key}:${k}`, kind, pos, rnd));
  }
  cellCache.set(key, list);
  return list;
}

/** Distância (UA) em que a nave para ao chegar ao ponto de interesse. */
export function poiArrive(p: Pick<Poi, 'kind' | 'radius'>): number {
  if (p.kind === 'nebula') return p.radius * 1.3;
  if (p.kind === 'brown-dwarf') return p.radius * 6;
  if (p.kind === 'rogue') return p.radius * 4;
  return Math.max(p.radius * 12, 1e-4);
}

/** Ponto fixo perto do Sol, para o GUIA ensinar a varredura e o piloto automático. */
export const TUTORIAL_POI: Poi = {
  id: 'poi:oort',
  kind: 'signal',
  name: 'Sinal da Nuvem de Oort',
  pos: [0.11 * AU_PER_PC, 0.05 * AU_PER_PC, 0.02 * AU_PER_PC],
  radius: km(15) * 2000,
  color: 0x80ffa0,
  description: 'Um sinal fraco vindo da borda do Sistema Solar. Bom lugar para testar o piloto automático.',
};

/** Pontos de interesse a menos de `radiusAu` de `p`, mais próximos primeiro. */
export function poisNear(p: { x: number; y: number; z: number }, radiusAu: number): (Poi & { dist: number })[] {
  const out: (Poi & { dist: number })[] = [];
  const r = Math.ceil(radiusAu / CELL_AU);
  const cx = Math.floor(p.x / CELL_AU);
  const cy = Math.floor(p.y / CELL_AU);
  const cz = Math.floor(p.z / CELL_AU);
  const test = (poi: Poi) => {
    const d = Math.hypot(poi.pos[0] - p.x, poi.pos[1] - p.y, poi.pos[2] - p.z);
    if (d < radiusAu) out.push({ ...poi, dist: d });
  };
  test(TUTORIAL_POI);
  // Os pontos ficam dentro da própria célula: células inteiras além do raio nem são geradas
  // (nos cantos do cubo de células são quase metade). A folga cobre o arredondamento.
  const limit = (radiusAu * (1 + 1e-9)) ** 2;
  const gap = (i: number, v: number) => Math.max(0, i * CELL_AU - v, v - (i + 1) * CELL_AU);
  for (let x = cx - r; x <= cx + r; x++) {
    const gx = gap(x, p.x) ** 2;
    for (let y = cy - r; y <= cy + r; y++) {
      const gxy = gx + gap(y, p.y) ** 2;
      for (let z = cz - r; z <= cz + r; z++) {
        if (gxy + gap(z, p.z) ** 2 >= limit) continue;
        for (const poi of poisInCell(x, y, z)) test(poi);
      }
    }
  }
  return out.sort((a, b) => a.dist - b.dist);
}

/** Procura um ponto de interesse pelo id. */
export function findPoi(id: string): Poi | null {
  if (id === TUTORIAL_POI.id) return TUTORIAL_POI;
  const m = /^poi:(-?\d+),(-?\d+),(-?\d+):(\d+)$/.exec(id);
  if (!m) return null;
  return poisInCell(+m[1], +m[2], +m[3]).find((p) => p.id === id) ?? null;
}
