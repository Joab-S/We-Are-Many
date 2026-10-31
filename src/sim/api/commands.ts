import { classify, sowVegetation, temperatureAt, type SurfaceMap } from '../../procgen/surface';
import type { Ore } from '../economy';
import type { Ecosystem, Village } from '../ecosystem';
import { runEvent, runRandomEvent, WORLD_EVENT_NAMES, type WorldEvent } from '../events';
import type { Species } from '../species';

/**
 * Ações do jogador sobre o mundo como comandos (padrão Command, Game
 * Programming Patterns). O cliente só monta o comando e o enfileira; quem
 * mexe no Ecosystem e no SurfaceMap é `applyCommand`, do lado do motor, na
 * fronteira entre dois passos da simulação. Isso prepara a separação entre
 * motor e interface (o comando é dado puro, serializável em JSON), o replay
 * (o log guarda o passo em que cada comando entrou) e o desfazer dos pincéis.
 *
 * Este módulo não importa nada de `src/client` nem do three.js.
 *
 * Coordenadas: `x` é a coluna e `y` a linha do mapa (y cresce para o sul),
 * como nos métodos do Ecosystem; ambas podem ter fração.
 */

/** Pincéis de terreno e clima: mudam altitude, umidade, calor e vegetação do tile. */
export type TerraformTool =
  | 'raise'
  | 'lower'
  | 'mountain'
  | 'sea'
  | 'flatten'
  | 'sand'
  | 'lake'
  | 'heat'
  | 'cool'
  | 'adjust'
  | 'snow'
  | 'thaw'
  | 'rain'
  | 'dry'
  | 'plant'
  | 'forest';

/** Influência política do jogador sobre os reinos (aba Civilização). */
export type PoliticsAction = 'provoke' | 'soothe' | 'incite' | 'inflame' | 'pacify';

/** Nome de cada influência, usado nos avisos (o mesmo rótulo das ferramentas). */
export const POLITICS_LABELS: Record<PoliticsAction, string> = {
  provoke: 'Provocar',
  soothe: 'Amenizar',
  incite: 'Declarar guerra',
  inflame: 'Inflamar',
  pacify: 'Acalmar',
};

/** As influências que pedem dois reinos (origem e alvo). */
export const POLITICS_PAIR: Record<PoliticsAction, boolean> = { provoke: true, soothe: true, incite: true, inflame: false, pacify: false };

/** Um toque do pincel: `power` é o tempo do toque (segundos) vezes 30, como na ferramenta antiga. */
export interface TerraformCommand {
  kind: 'terraform';
  tool: TerraformTool;
  x: number;
  y: number;
  r: number;
  power: number;
  /** Temperatura alvo (K) e se Aquecer e Resfriar param nela. */
  target: number;
  limit: boolean;
}

/** Retrato de tiles para o desfazer (Ctrl+Z): os valores de antes de um traço do pincel. */
export interface RestoreTilesCommand {
  kind: 'restoreTiles';
  tiles: number[];
  elevation: number[];
  moisture: number[];
  heat: number[];
  vegetation: number[];
  felled: number[];
  bare: number[];
}

/** Tudo o que as ferramentas da superfície fazem com o mundo. União discriminada por `kind`, só com dados. */
export type EngineCommand =
  | TerraformCommand
  | RestoreTilesCommand
  /** Limpar: árvores, pedras, cactos, ruínas e veios do pincel. */
  | { kind: 'clear'; x: number; y: number; r: number }
  /** Demolir: casas, prédios, ruas, roças e pastos do pincel. */
  | { kind: 'demolish'; x: number; y: number; r: number }
  /** Um veio de minério num ponto. */
  | { kind: 'ore'; x: number; y: number; ore: Ore }
  /** Solta um indivíduo da espécie (a espécie vai inteira: pode vir de outro planeta). */
  | { kind: 'introduce'; species: Species; x: number; y: number }
  | { kind: 'feed'; x: number; y: number; r: number }
  | { kind: 'cull'; x: number; y: number; r: number }
  /** Ensinar (fora da barra desde 24/10/2026, RF-VIDA-75; o método segue no Ecosystem). */
  | { kind: 'teach'; x: number; y: number; r: number; amount: number }
  /** Boa colheita: comida para os assentamentos no pincel e mata viçosa em volta. */
  | { kind: 'harvest'; x: number; y: number; r: number }
  /** Lava num raio (o calor esfria em rocha com os anos). */
  | { kind: 'lava'; x: number; y: number; r: number; heat: number }
  /** Influência sobre reinos: `a` e `b` são ids de assentamento (`b` = `a` nas de um reino só). */
  | { kind: 'politics'; action: PoliticsAction; a: number; b: number }
  /** Evento provocado num ponto (cometa, terremoto, vulcão...). */
  | { kind: 'event'; event: WorldEvent; x: number; y: number }
  /** Um evento aleatório em algum lugar do mundo. */
  | { kind: 'surprise' }
  /** Eventos aleatórios ligados ou não, e a frequência deles (janela Mundo). */
  | { kind: 'events'; auto?: boolean; rate?: number };

export type CommandKind = EngineCommand['kind'];

/** O que o comando deu: `ok` falso quando não pôde agir ali; `at` é um lugar para a câmera ir (x, linha). */
export interface CommandResult {
  ok: boolean;
  at?: { x: number; y: number };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Efeito de cada pincel num tile: `s` é a força no tile (cai do centro para a borda); `target` em K. */
export const TERRAFORM: Record<TerraformTool, (m: SurfaceMap, i: number, s: number, target: number, limit: boolean) => void> = {
  raise: (m, i, s) => {
    m.elevation[i] = clamp(m.elevation[i] + 0.02 * s, -1, 1);
  },
  lower: (m, i, s) => {
    m.elevation[i] = clamp(m.elevation[i] - 0.02 * s, -1, 1);
  },
  mountain: (m, i, s) => {
    m.elevation[i] = clamp(m.elevation[i] + 0.06 * s, -1, 0.95);
  },
  sea: (m, i, s) => {
    m.elevation[i] = Math.max(-0.3, m.elevation[i] - 0.06 * s);
  },
  flatten: (m, i, s) => {
    m.elevation[i] += (0.12 - m.elevation[i]) * Math.min(1, 0.05 * s);
  },
  sand: (m, i, s) => {
    m.moisture[i] = clamp(m.moisture[i] - 0.05 * s, 0, 1);
    m.vegetation[i] = clamp(m.vegetation[i] - 0.05 * s, 0, 1);
  },
  lake: (m, i, s) => {
    m.elevation[i] = Math.max(-0.12, m.elevation[i] - 0.05 * s);
    m.moisture[i] = clamp(m.moisture[i] + 0.02 * s, 0, 1);
  },
  heat: (m, i, s, target, limit) => {
    const t = temperatureAt(m, i);
    if (limit && t >= target) return;
    const step = limit ? Math.min(1.5 * s, target - t) : 1.5 * s;
    m.heat[i] = clamp(m.heat[i] + step, -150, 400);
  },
  cool: (m, i, s, target, limit) => {
    const t = temperatureAt(m, i);
    if (limit && t <= target) return;
    const step = limit ? Math.min(1.5 * s, t - target) : 1.5 * s;
    m.heat[i] = clamp(m.heat[i] - step, -150, 400);
  },
  adjust: (m, i, s, target) => {
    const gap = target - temperatureAt(m, i);
    m.heat[i] = clamp(m.heat[i] + clamp(gap, -2 * s, 2 * s), -150, 400);
  },
  snow: (m, i, s) => {
    const t = temperatureAt(m, i);
    if (t > 258) m.heat[i] = clamp(m.heat[i] - Math.min(2 * s, t - 258), -150, 400);
    m.moisture[i] = clamp(m.moisture[i] + 0.02 * s, 0, 1);
  },
  thaw: (m, i, s) => {
    const t = temperatureAt(m, i);
    if (t < 278) m.heat[i] = clamp(m.heat[i] + Math.min(2 * s, 278 - t), -150, 400);
  },
  rain: (m, i, s) => {
    m.moisture[i] = clamp(m.moisture[i] + 0.04 * s, 0, 1);
  },
  dry: (m, i, s) => {
    m.moisture[i] = clamp(m.moisture[i] - 0.04 * s, 0, 1);
  },
  plant: (m, i, s) => sowVegetation(m, i, 0.06 * s),
  forest: (m, i, s) => {
    m.moisture[i] = clamp(m.moisture[i] + 0.03 * s, 0, 1);
    sowVegetation(m, i, Math.max(0.18 * s, m.felled?.[i] ? 0.3 : 0));
  },
};

export const TERRAFORM_TOOLS = Object.keys(TERRAFORM) as TerraformTool[];

export function isTerraformTool(id: string): id is TerraformTool {
  return Object.prototype.hasOwnProperty.call(TERRAFORM, id);
}

/**
 * Retrato dos tiles tocados por um traço do pincel, com o valor de antes do
 * primeiro toque em cada um. `toCommand` devolve o `restoreTiles` que desfaz o traço.
 */
export class TileJournal {
  private readonly seen = new Set<number>();
  private readonly tiles: number[] = [];
  private readonly elevation: number[] = [];
  private readonly moisture: number[] = [];
  private readonly heat: number[] = [];
  private readonly vegetation: number[] = [];
  private readonly felled: number[] = [];
  private readonly bare: number[] = [];

  /** Guarda o tile `i` como está, se ainda não foi guardado neste traço. */
  touch(map: SurfaceMap, i: number): void {
    if (this.seen.has(i)) return;
    this.seen.add(i);
    this.tiles.push(i);
    this.elevation.push(map.elevation[i]);
    this.moisture.push(map.moisture[i]);
    this.heat.push(map.heat[i]);
    this.vegetation.push(map.vegetation[i]);
    this.felled.push(map.felled?.[i] ?? 0);
    this.bare.push(map.bare?.[i] ?? 0);
  }

  get size(): number {
    return this.tiles.length;
  }

  toCommand(): RestoreTilesCommand {
    return {
      kind: 'restoreTiles',
      tiles: [...this.tiles],
      elevation: [...this.elevation],
      moisture: [...this.moisture],
      heat: [...this.heat],
      vegetation: [...this.vegetation],
      felled: [...this.felled],
      bare: [...this.bare],
    };
  }
}

/** Contexto opcional da aplicação: o retrato do traço em andamento (desfazer dos pincéis). */
export interface ApplyContext {
  journal?: TileJournal | null;
}

/** Tile de (coluna, linha) com volta horizontal; -1 fora do mapa. */
function tileAt(map: SurfaceMap, x: number, y: number): number {
  const w = map.width;
  if (y < 0 || y >= map.height) return -1;
  return y * w + (((Math.floor(x) % w) + w) % w);
}

/**
 * Visita os tiles do círculo de raio `r` em volta de (x, linha), como o
 * pincel sempre fez: `fn` recebe o tile e a distância ao centro (em tiles).
 */
function forDisc(map: SurfaceMap, x: number, y: number, r: number, fn: (i: number, d: number) => void): void {
  const ri = Math.ceil(r);
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  for (let dy = -ri; dy <= ri; dy++) {
    for (let dx = -ri; dx <= ri; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > r) continue;
      const i = tileAt(map, cx + dx, cy + dy);
      if (i >= 0) fn(i, d);
    }
  }
}

/** Distância horizontal com a volta do mapa. */
function wrapDx(dx: number, w: number): number {
  return ((dx + w * 1.5) % w) - w / 2;
}

/**
 * Executa um comando no motor. Só usa os métodos públicos do Ecosystem e as
 * funções do mapa; os tiles que muda são reclassificados aqui (o bioma é
 * estado da simulação) e avisados por `eco.onTileChanged`, que a interface
 * só usa para marcar o que repintar.
 */
export function applyCommand(eco: Ecosystem, map: SurfaceMap, cmd: EngineCommand, ctx: ApplyContext = {}): CommandResult {
  switch (cmd.kind) {
    case 'terraform': {
      const fn = TERRAFORM[cmd.tool];
      const journal = ctx.journal;
      forDisc(map, cmd.x, cmd.y, cmd.r, (i, d) => {
        journal?.touch(map, i);
        fn(map, i, (1 - d / (cmd.r + 1)) * cmd.power, cmd.target, cmd.limit);
        map.biome[i] = classify(map, i);
        eco.onTileChanged(i);
      });
      // O que o terreno novo não sustenta (rua na água, casa no barranco, mina afogada) some junto (seção 19.18).
      eco.sweep(cmd.x, cmd.y, cmd.r);
      return { ok: true };
    }
    case 'restoreTiles':
      return restoreTiles(eco, map, cmd);
    case 'clear':
      return { ok: eco.clearNature(cmd.x, cmd.y, cmd.r) > 0 };
    case 'demolish':
      return { ok: eco.demolish(cmd.x, cmd.y, cmd.r) > 0 };
    case 'ore': {
      const ok = eco.placeOre(cmd.x, cmd.y, cmd.ore);
      if (!ok) eco.hint = 'Aqui não dá para colocar minério';
      return { ok };
    }
    case 'introduce': {
      const s = eco.addSpecies(cmd.species);
      const born = eco.introduceOne(s, cmd.x, cmd.y);
      if (born < 0) {
        eco.hint = `${cmd.species.name}: o lugar não é habitável`;
        return { ok: false };
      }
      eco.note(`Você soltou ${cmd.species.name.toLowerCase()}`, 'jogador', { x: cmd.x, y: cmd.y }, { key: `spawn:${cmd.species.id}` });
      return { ok: true };
    }
    case 'feed':
      eco.feed(cmd.x, cmd.y, cmd.r);
      return { ok: true };
    case 'cull':
      return { ok: eco.cull(cmd.x, cmd.y, cmd.r) > 0 };
    case 'teach':
      return { ok: eco.teach(cmd.x, cmd.y, cmd.r, cmd.amount).length > 0 };
    case 'harvest': {
      const w = map.width;
      const helped = eco.villages.filter((v) => !v.abandoned && Math.hypot(wrapDx(v.x - cmd.x, w), v.y - cmd.y) < cmd.r + 6);
      for (const v of helped) v.food = Math.min(60, v.food + 25);
      forDisc(map, cmd.x, cmd.y, cmd.r, (i) => {
        sowVegetation(map, i, 0.2);
        map.biome[i] = classify(map, i);
        eco.onTileChanged(i);
      });
      eco.sweep(cmd.x, cmd.y, cmd.r);
      if (helped.length) eco.note(`Você deu uma boa colheita a ${helped.map((v) => v.name).join(', ')}`, 'jogador', helped[0]);
      else eco.hint = 'Nenhum assentamento no pincel';
      return { ok: helped.length > 0 };
    }
    case 'lava':
      forDisc(map, cmd.x, cmd.y, cmd.r, (i) => {
        eco.pourLava(i, cmd.heat);
        map.biome[i] = classify(map, i);
        eco.onTileChanged(i);
      });
      eco.sweep(cmd.x, cmd.y, cmd.r);
      return { ok: true };
    case 'politics':
      return politics(eco, cmd.action, eco.villages[cmd.a], eco.villages[cmd.b]);
    case 'event': {
      const ok = runEvent(eco, cmd.event, cmd.x, cmd.y);
      if (!ok) eco.hint = `${WORLD_EVENT_NAMES[cmd.event]}: não deu certo aqui`;
      return { ok };
    }
    case 'surprise': {
      const ev = runRandomEvent(eco);
      const e = eco.chronicle[0];
      return ev && e && e.x >= 0 ? { ok: true, at: { x: e.x, y: e.y } } : { ok: !!ev };
    }
    case 'events':
      if (cmd.auto !== undefined) eco.autoEvents = cmd.auto;
      if (cmd.rate !== undefined) eco.eventRate = cmd.rate;
      return { ok: true };
  }
}

function politics(eco: Ecosystem, action: PoliticsAction, a: Village | undefined, b: Village | undefined): CommandResult {
  const label = POLITICS_LABELS[action];
  if (!a || !b || a.abandoned || b.abandoned) {
    eco.hint = `${label}: clique sobre um assentamento`;
    return { ok: false };
  }
  let ok = true;
  if (action === 'provoke') ok = eco.provoke(a, b);
  else if (action === 'soothe') ok = eco.soothe(a, b);
  else if (action === 'incite') ok = eco.incite(a, b);
  else eco.sway(a, action === 'inflame' ? 1 : -1);
  if (!ok) eco.hint = `${label}: não deu (mesmo reino, ou já em guerra)`;
  return { ok };
}

/** Desfaz um traço: devolve os valores guardados, reclassifica e tira o que o terreno de volta não sustenta. */
function restoreTiles(eco: Ecosystem, map: SurfaceMap, cmd: RestoreTilesCommand): CommandResult {
  const n = cmd.tiles.length;
  if (!n) return { ok: false };
  const w = map.width;
  // Caixa dos tiles (com a volta horizontal medida a partir do primeiro) para a limpeza do terreno.
  const x0 = cmd.tiles[0] % w;
  let minX = 0;
  let maxX = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let k = 0; k < n; k++) {
    const i = cmd.tiles[k];
    map.elevation[i] = cmd.elevation[k];
    map.moisture[i] = cmd.moisture[k];
    map.heat[i] = cmd.heat[k];
    map.vegetation[i] = cmd.vegetation[k];
    if (map.felled) map.felled[i] = cmd.felled[k];
    if (map.bare) map.bare[i] = cmd.bare[k];
    else if (cmd.bare[k]) {
      map.bare = new Uint8Array(map.width * map.height);
      map.bare[i] = cmd.bare[k];
    }
    const x = i % w;
    const y = (i - x) / w;
    const dx = wrapDx(x - x0, w);
    if (dx < minX) minX = dx;
    if (dx > maxX) maxX = dx;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  // Depois de tudo de volta, o bioma (que olha os vizinhos) e o aviso de repintura.
  for (let k = 0; k < n; k++) {
    const i = cmd.tiles[k];
    map.biome[i] = classify(map, i);
    eco.onTileChanged(i);
  }
  const cx = x0 + (minX + maxX) / 2 + 0.5;
  const cy = (minY + maxY) / 2 + 0.5;
  eco.sweep((cx + w) % w, cy, Math.max(maxX - minX, maxY - minY) / 2 + 1);
  return { ok: true };
}
