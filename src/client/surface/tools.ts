import type { Ecosystem } from '../../sim/ecosystem';
import { ORE_NAMES, ORES, type Ore } from '../../sim/economy';
import { WORLD_EVENT_NAMES, type WorldEvent } from '../../sim/events';
import { EARTH_ID, habitatOf, type Species } from '../../sim/species';
import { LONER_GROUP_MIN } from '../../sim/balance';
import type { ChronicleKind } from '../../sim/ecosystem';
import { POLITICS_LABELS, POLITICS_PAIR, type EngineCommand, type PoliticsAction, type TerraformTool } from '../../sim/api/commands';
import { BODY_NAMES, SPRITES } from './art';

/**
 * Dados da superfície: abas, janelas, ferramentas e a animação de cada uma
 * (padrão Type Object: cada ferramenta é um registro, não uma classe). A
 * ferramenta não mexe no mundo: ela monta um comando (`src/sim/api/commands.ts`)
 * e o entrega ao contexto, que o enfileira para o motor.
 */

export type Tab = 'terrain' | 'climate' | 'life' | 'civ' | 'events';

/** Ícone de cada aba da barra de ferramentas e de cada janela de leitura (HUD Pergaminho de Bordo). */
export const TAB_ICONS: Record<Tab, string> = { terrain: 'terrain', climate: 'cloud', life: 'leaf', civ: 'civ', events: 'comet' };
export const WINDOW_ICONS: Record<string, string> = { chronicle: 'chron', kingdoms: 'crown', settlements: 'homes', species: 'paw', items: 'hammer', world: 'gear' };
/** Ferramenta -> ícone de traço. As que não estão aqui mantêm o sprite ou o emoji de antes. */
export const TOOL_ICONS: Record<string, string> = {
  raise: 'raise', lower: 'lower', mountain: 'peak', sea: 'wave', flatten: 'flat', sand: 'sand', lake: 'lake', clear: 'broom', demolish: 'demolish',
  heat: 'hot', cool: 'cold', adjust: 'temp', snow: 'snow', thaw: 'sun', rain: 'rain', dry: 'sun', plant: 'sprout', forest: 'tree',
  feed: 'apple', cull: 'x', harvest: 'grain', surprise: 'dice', provoke: 'fire', soothe: 'dove', incite: 'swords', inflame: 'fire', pacify: 'dove',
  'event:comet': 'comet', 'event:quake': 'quake', 'event:volcano': 'volcano', 'event:island': 'wave', 'event:fire': 'fire', 'event:drought': 'sun',
};
export const ORE_SWATCH: Record<string, string> = { copper: '#b87333', tin: '#c9ced6', iron: '#8a6a58', gold: '#e0c27a', coal: '#33363c' };
export const SETTLEMENT_TAB_ICONS: Record<string, string> = { summary: 'grain', economy: 'coin', people: 'users', buildings: 'home', relations: 'flag', history: 'chron' };
export const plain = (label: string) => label.replace(/^\S+\s/, '');

export const TABS: [Tab, string][] = [
  ['terrain', '⛰ Terreno'],
  ['climate', '☁ Clima'],
  ['life', '🌿 Vida'],
  ['civ', '🏛 Civilização'],
  ['events', '☄ Eventos'],
];

export type Win = 'chronicle' | 'kingdoms' | 'settlements' | 'species' | 'items' | 'world';

export const WINDOWS: [Win, string][] = [
  ['chronicle', '📜 Crônica'],
  ['kingdoms', '👑 Reinos'],
  ['settlements', '🏘 Assentamentos'],
  ['species', '🐾 Espécies'],
  ['items', '⚒ Itens'],
  ['world', '⚙ Mundo'],
];

export const KIND_ICONS: Record<ChronicleKind, string> = { povo: '👥', era: '⭐', guerra: '⚔', natureza: '🌋', mar: '⛵', economia: '⚒', jogador: '✋' };

/** Gotas e flocos de chuva e neve na tela, no máximo (o visual do clima vivo fica barato). */
export const WEATHER_FX = 350;
/** Média anual (K) abaixo da qual a pancada cai como neve (pela média: não troca de chuva para neve no meio). */
export const SNOWFALL_K = 275;
/** Raio mínimo, em pixels de tela, do círculo de escolha de criaturas (RF-VIDA-330). */
export const PICK_RADIUS_PX = 6;
/** Fator do raio por tile de zoom: o mesmo círculo desenhado ao redor da criatura. */
export const PICK_RADIUS_PER_ZOOM = 0.9;
/** O desenho da criatura fica meio tile acima do ponto dela; o círculo é centrado no corpo. */
export const PICK_LIFT = 0.5;
/** Atualizações por segundo da janela do assentamento (RF-VIDA-341). */
export const VWIN_HZ = 4;
/** Segundos reais para passar 1 ano na velocidade 1x. */
export const REAL_YEAR_SECONDS = 12;

/** Modo de depuração (`?debug` no endereço): mostra as taxas do momento nos painéis (RF-VIDA-310). */
export const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

export type FxKind = 'heat' | 'cool' | 'snow' | 'thaw' | 'rain' | 'dry' | 'rise' | 'sink' | 'sea' | 'flatten' | 'sand' | 'grow' | 'clear' | 'demolish' | 'rage' | 'calm';

/** Tipos de partícula da animação do pincel. */
export const PARTICLE_KINDS = ['ember', 'flake', 'streak', 'dust', 'drop', 'ring', 'spark', 'chunk'] as const;
export type ParticleKind = (typeof PARTICLE_KINDS)[number];

/** Cor do brilho de cada animação e o que ela solta (tipo, cor, direção, velocidade em tiles/s). */
export const FX: Record<FxKind, { glow: [number, number, number, number]; kind: ParticleKind; rgb: [number, number, number]; vx: number; vy: number; spread: number; size: number }> = {
  heat: { glow: [255, 110, 30, 0.28], kind: 'ember', rgb: [255, 170, 50], vx: 0, vy: 2.2, spread: 0.8, size: 0.14 },
  cool: { glow: [90, 170, 255, 0.26], kind: 'flake', rgb: [225, 242, 255], vx: 0.2, vy: -1, spread: 0.4, size: 0.14 },
  snow: { glow: [210, 225, 245, 0.3], kind: 'flake', rgb: [255, 255, 255], vx: 0.5, vy: -1.6, spread: 0.5, size: 0.17 },
  thaw: { glow: [255, 190, 90, 0.2], kind: 'drop', rgb: [110, 180, 255], vx: 0, vy: -1.8, spread: 0.2, size: 0.12 },
  rain: { glow: [50, 80, 140, 0.3], kind: 'streak', rgb: [150, 200, 255], vx: -0.9, vy: -7, spread: 0.3, size: 0.4 },
  dry: { glow: [240, 200, 90, 0.26], kind: 'dust', rgb: [236, 206, 120], vx: 2, vy: 0.3, spread: 0.6, size: 0.3 },
  rise: { glow: [150, 110, 70, 0.22], kind: 'dust', rgb: [150, 112, 74], vx: 0, vy: 1.6, spread: 1, size: 0.3 },
  sink: { glow: [90, 70, 50, 0.22], kind: 'chunk', rgb: [110, 84, 58], vx: 0, vy: -2.4, spread: 0.5, size: 0.2 },
  sea: { glow: [40, 110, 200, 0.28], kind: 'ring', rgb: [180, 220, 255], vx: 0, vy: 0, spread: 0, size: 0.2 },
  flatten: { glow: [160, 160, 160, 0.2], kind: 'dust', rgb: [190, 190, 190], vx: 1.2, vy: 0, spread: 0.2, size: 0.22 },
  sand: { glow: [230, 200, 130, 0.24], kind: 'dust', rgb: [226, 196, 128], vx: 1.6, vy: 0.4, spread: 0.7, size: 0.26 },
  grow: { glow: [70, 190, 80, 0.24], kind: 'spark', rgb: [140, 240, 120], vx: 0, vy: 1.4, spread: 0.6, size: 0.18 },
  clear: { glow: [190, 190, 170, 0.22], kind: 'dust', rgb: [200, 196, 180], vx: 0.4, vy: 0.8, spread: 0.9, size: 0.3 },
  demolish: { glow: [150, 100, 70, 0.26], kind: 'chunk', rgb: [150, 112, 80], vx: 0, vy: 1.2, spread: 1.2, size: 0.24 },
  rage: { glow: [220, 40, 30, 0.3], kind: 'ember', rgb: [235, 70, 50], vx: 0, vy: 2.6, spread: 1.2, size: 0.16 },
  calm: { glow: [130, 210, 230, 0.26], kind: 'drop', rgb: [170, 235, 245], vx: 0, vy: -1.2, spread: 0.3, size: 0.13 },
};

/** O que a ferramenta precisa do jogo para agir: só lê o mundo e enfileira comandos. */
export interface ToolContext {
  readonly eco: Ecosystem;
  readonly brush: number;
  /** Converte coordenadas da vista (y para o norte) em linha do mapa. */
  toRow(viewY: number): number;
  /** Entrega o comando ao motor (aplicado na fronteira do próximo passo). */
  enqueue(cmd: EngineCommand): void;
  /** Explosão de partículas ao redor de um ponto (coordenadas da vista). */
  burst(kind: FxKind, x: number, viewY: number): void;
  /** Aviso curto da interface (não é estado do mundo). */
  say(text: string): void;
  /** Ferramentas de dois cliques: guarda o primeiro assentamento e espera o segundo. */
  pickSecond(tool: Tool, first: number): void;
  /** Leva a câmera até um tile (x, linha). */
  goTo(x: number, row: number): void;
}

export interface Tool {
  id: string;
  tab: Tab;
  /** Subtítulo dentro da aba (ex.: Minérios, Água, Costa). */
  group?: string;
  label: string;
  /** Emoji, ou um sprite (`sprite:nome` pintado com `tint`). */
  icon: string;
  tint?: readonly number[];
  skin?: readonly number[];
  /** Explicação curta, mostrada acima da barra. */
  tip: string;
  /** Pincel contínuo enquanto o botão está apertado, ou um clique por vez. */
  mode: 'brush' | 'click';
  /** Pincel de terreno ou clima: vira um comando `terraform` por quadro e entra no desfazer (Ctrl+Z). */
  terraform?: TerraformTool;
  /** Animação do pincel enquanto a ferramenta age (partículas e brilho sobre o mapa). */
  fx?: FxKind;
  /** Ação num ponto da vista (x, y para o norte): monta o comando e o enfileira. */
  act?(ctx: ToolContext, x: number, viewY: number): void;
  /** Ferramenta de dois cliques: o segundo clique (estado PickSecond) com o primeiro assentamento. */
  second?(ctx: ToolContext, first: number, x: number, viewY: number): void;
}

const ORE_ICONS: Record<Ore, string> = { copper: '🟠', tin: '⚪', iron: '🟤', gold: '🟡', coal: '⚫' };

const terraform = (id: TerraformTool, fx: FxKind, tab: Tab, label: string, icon: string, tip: string): Tool => ({ id, fx, tab, label, icon, tip, mode: 'brush', terraform: id });

/** Ferramentas de terraformação e clima (RF-SUP-06). */
export const TERRAIN_TOOLS: Tool[] = [
  terraform('raise', 'rise', 'terrain', 'Elevar', '⛰', 'Levanta o chão aos poucos: do mar nasce terra, da terra, morros.'),
  terraform('lower', 'sink', 'terrain', 'Rebaixar', '⛏', 'Abaixa o chão aos poucos: vales, lagos e, no fim, mar.'),
  terraform('mountain', 'rise', 'terrain', 'Montanha', '🏔', 'Ergue serras de rocha rapidamente.'),
  terraform('sea', 'sea', 'terrain', 'Mar', '🌊', 'Afunda a terra até virar mar raso.'),
  terraform('flatten', 'flatten', 'terrain', 'Nivelar', '▭', 'Aplaina o terreno para perto do nível de planície.'),
  terraform('sand', 'sand', 'terrain', 'Areia', '🏜', 'Seca o solo: vira praia ou deserto.'),
  terraform('lake', 'sea', 'terrain', 'Lago', '🏞', 'Cava um lago raso, de margem suave, e umedece a terra em volta.'),
  {
    id: 'clear',
    fx: 'clear',
    tab: 'terrain',
    group: 'Remover',
    label: 'Limpar',
    icon: '🧹',
    tip: 'Tira árvores, pedras, cactos, ruínas e veios de minério do pincel. O material removido se perde: só o trabalho do povo põe recursos no estoque.',
    mode: 'brush',
    act: (ctx, x, y) => ctx.enqueue({ kind: 'clear', x, y: ctx.toRow(y), r: ctx.brush }),
  },
  {
    id: 'demolish',
    fx: 'demolish',
    tab: 'terrain',
    group: 'Remover',
    label: 'Demolir',
    icon: '🧱',
    tip: 'Derruba casas, prédios, ruas, roças e pastos do pincel. O material se perde; o povo reconstrói depois, se precisar, pagando de novo.',
    mode: 'brush',
    act: (ctx, x, y) => ctx.enqueue({ kind: 'demolish', x, y: ctx.toRow(y), r: ctx.brush }),
  },
  // Minérios: ajuda leve aos povos, que ainda precisam achar o veio e abrir a mina.
  ...ORES.map(
    (ore): Tool => ({
      id: `ore:${ore}`,
      tab: 'terrain',
      group: 'Minérios',
      label: ORE_NAMES[ore][0].toUpperCase() + ORE_NAMES[ore].slice(1),
      icon: ORE_ICONS[ore],
      tip: `Coloca um veio de ${ORE_NAMES[ore]}. Os povos só usam depois de achá-lo e abrir uma mina.`,
      mode: 'click',
      act: (ctx, x, y) => ctx.enqueue({ kind: 'ore', x, y: ctx.toRow(y), ore }),
    }),
  ),
  terraform('heat', 'heat', 'climate', 'Aquecer', '🔥', 'Esquenta a região (derrete gelo, seca, e no extremo vira lava). Com o limite ligado, para na temperatura alvo.'),
  terraform('cool', 'cool', 'climate', 'Resfriar', '❄', 'Esfria a região (neve, tundra e gelo no mar). Com o limite ligado, para na temperatura alvo.'),
  terraform('adjust', 'heat', 'climate', 'Ajustar', '🌡', 'Leva a temperatura da região, para cima ou para baixo, até a temperatura alvo e para ali.'),
  terraform('snow', 'snow', 'climate', 'Nevar', '🌨', 'Faz nevar: esfria só até a neve pegar (cerca de -15 °C) e umedece o solo, sem congelar além disso.'),
  terraform('thaw', 'thaw', 'climate', 'Degelo', '💧', 'Derrete neve e gelo: esquenta só o que está congelado, até cerca de 5 °C, sem ressecar o resto.'),
  terraform('rain', 'rain', 'climate', 'Chuva', '🌧', 'Deixa o clima mais úmido: a mata cresce melhor.'),
  terraform('dry', 'dry', 'climate', 'Secar', '☀', 'Deixa o clima mais seco.'),
  terraform('plant', 'grow', 'climate', 'Semear vida', '🌱', 'Semeia sem mudar a umidade: cactos no deserto, pinheiros na tundra, acácias na savana, capim e árvores onde já é úmido. Faz tocos brotarem.'),
  terraform('forest', 'grow', 'climate', 'Floresta', '🌳', 'Umedece o solo e ergue mata fechada rápido, transformando tocos e mudas em árvores adultas.'),
];

/** Eventos que o jogador pode provocar (aba Eventos). */
export const EVENT_TOOLS: Tool[] = (
  [
    ['comet', '☄', 'Um cometa cai onde você clicar: cratera, lago e minério do espaço.'],
    ['quake', '〰', 'Uma falha corta o chão: um lado sobe, o outro afunda; casas perto caem.'],
    ['volcano', '🌋', 'Um vulcão nasce: o chão sobe, a lava escorre e esfria em rocha.'],
    ['island', '🏝', 'Um vulcão no mar ergue uma ilha nova.'],
    ['fire', '🔥', 'Fogo na mata: queima a floresta em volta.'],
    ['drought', '🏜', 'Seca numa região grande: a vegetação murcha por um tempo.'],
  ] as [WorldEvent, string, string][]
).map(([ev, icon, tip]) => ({
  id: `event:${ev}`,
  tab: 'events' as Tab,
  label: WORLD_EVENT_NAMES[ev],
  icon,
  tip,
  mode: 'click' as const,
  act: (ctx: ToolContext, x: number, y: number) => ctx.enqueue({ kind: 'event', event: ev, x, y: ctx.toRow(y) }),
}));

const DEFAULT_SPRITE = { fish: 'fish', herbivore: 'deer', predator: 'wolf', shark: 'shark', sapient: 'human' } as const;

/** Desenho de uma espécie de animal. */
export function spriteOf(sp: Species): string {
  return sp.sprite && SPRITES[sp.sprite] ? sp.sprite : DEFAULT_SPRITE[sp.kind];
}

/** Corpo de uma espécie inteligente. */
export function bodyOf(sp: Species): string {
  return sp.body && BODY_NAMES.includes(sp.body) ? sp.body : sp.origin === EARTH_ID ? 'human' : 'alien';
}

/** Sprite e cor de cada animal de rebanho. */
export const HERD_SPRITES: Record<string, string> = { sheep: 'sheep', cattle: 'cow', goat: 'goat', horse: 'horse', camel: 'camel' };
/** Toldos das barracas da feira. */
export const STALL_TINTS: [number, number, number][] = [
  [214, 64, 52],
  [52, 110, 220],
  [232, 196, 56],
  [64, 168, 80],
  [148, 72, 200],
];
export const HERD_TINT: Record<string, [number, number, number]> = { sheep: [238, 234, 222], cattle: [150, 96, 62], goat: [196, 176, 146], horse: [128, 82, 48], camel: [204, 164, 104] };
/** Pelagem do cavalo da cavalaria. */
export const HORSE_COAT: [number, number, number] = [122, 84, 52];

/** Influência política: o primeiro clique escolhe o reino de origem; nas que pedem par, o segundo escolhe o outro. Anima nos dois. */
function politic(id: PoliticsAction, icon: string, tip: string, fx: FxKind): Tool {
  const label = POLITICS_LABELS[id];
  const pair = POLITICS_PAIR[id];
  return {
    id,
    tab: 'civ',
    group: 'Influenciar os povos',
    label,
    icon,
    tip,
    mode: 'click',
    fx,
    act(ctx, x, y) {
      const v = ctx.eco.settlementAt(x, ctx.toRow(y));
      if (!v) {
        ctx.say(`${label}: clique sobre um assentamento`);
        return;
      }
      ctx.burst(fx, v.x, ctx.eco.map.height - v.y);
      if (!pair) {
        ctx.enqueue({ kind: 'politics', action: id, a: v.id, b: v.id });
        return;
      }
      ctx.pickSecond(this, v.id);
      ctx.say(`${label}: agora clique no outro reino`);
    },
    second(ctx, first, x, y) {
      const v = ctx.eco.settlementAt(x, ctx.toRow(y));
      if (!v) {
        ctx.say(`${label}: clique sobre um assentamento`);
        return;
      }
      ctx.burst(fx, v.x, ctx.eco.map.height - v.y);
      ctx.enqueue({ kind: 'politics', action: id, a: first, b: v.id });
    },
  };
}

/** Ferramentas: terreno e clima, uma por espécie conhecida (Vida e Civilização) e eventos. */
export function buildTools(knownSpecies: Iterable<Species>): Tool[] {
  const known = [...knownSpecies];
  const group = (sp: Species) => (sp.parent ? 'Variantes' : habitatOf(sp) === 1 ? 'Água' : habitatOf(sp) === 2 ? 'Costa' : 'Terra');
  const order = ['Terra', 'Costa', 'Água', 'Variantes'];
  const introduce = (sp: Species) => (ctx: ToolContext, x: number, y: number) => ctx.enqueue({ kind: 'introduce', species: sp, x, y: ctx.toRow(y) });
  const life: Tool[] = known
    .filter((sp) => sp.kind !== 'sapient')
    .sort((a, b) => order.indexOf(group(a)) - order.indexOf(group(b)))
    .map((sp) => ({
      id: `spawn:${sp.id}`,
      tab: 'life' as Tab,
      group: group(sp),
      label: sp.name,
      icon: `sprite:${spriteOf(sp)}`,
      tint: sp.color,
      tip: `Solta um(a) ${sp.name.toLowerCase()} por clique (para nascerem filhotes, precisa de pelo menos dois). Vive de ${(sp.tempMin - 273).toFixed(0)} a ${(sp.tempMax - 273).toFixed(0)} °C${habitatOf(sp) === 2 ? ', na costa' : habitatOf(sp) === 1 ? ', na água' : ''}.`,
      mode: 'click' as const,
      act: introduce(sp),
    }));
  life.push(
    { id: 'feed', tab: 'life', group: 'Cuidar', label: 'Alimentar', icon: '🍎', tip: 'Enche a energia das criaturas no pincel.', mode: 'brush', act: (ctx, x, y) => ctx.enqueue({ kind: 'feed', x, y: ctx.toRow(y), r: ctx.brush }) },
    { id: 'cull', tab: 'life', group: 'Cuidar', label: 'Reduzir', icon: '✖', tip: 'Remove as criaturas dentro do pincel (controle de população).', mode: 'click', act: (ctx, x, y) => ctx.enqueue({ kind: 'cull', x, y: ctx.toRow(y), r: ctx.brush }) },
  );
  const civ: Tool[] = known
    .filter((sp) => sp.kind === 'sapient')
    .map((sp) => ({
      id: `spawn:${sp.id}`,
      tab: 'civ' as Tab,
      group: 'Povos',
      label: sp.name,
      icon: `sprite:${bodyOf(sp)}:gatherer`,
      tint: [200, 160, 90],
      skin: sp.color,
      tip: `Solta um(a) ${sp.name.toLowerCase()} por clique. Sozinho, ele procura um assentamento do seu povo ou outros como ele: só funda um novo com ${LONER_GROUP_MIN} juntos. Para nascerem filhos, precisa de pelo menos dois.`,
      mode: 'click' as const,
      act: introduce(sp),
    }));
  civ.push({
    id: 'harvest',
    tab: 'civ',
    group: 'Ajudar de leve',
    label: 'Boa colheita',
    icon: '🌾',
    tip: 'Uma colheita farta para os assentamentos no pincel: comida guardada e mata viçosa em volta.',
    mode: 'click',
    act: (ctx, x, y) => ctx.enqueue({ kind: 'harvest', x, y: ctx.toRow(y), r: ctx.brush }),
  });
  civ.push(
    politic('provoke', '😠', 'Clique em um reino e depois em outro: a tensão entre eles sobe e a trégua acaba. Eles ainda precisam de preparo para guerrear.', 'rage'),
    politic('soothe', '🕊', 'Clique em um reino e depois em outro: a tensão cai e os planos de guerra entre eles se desfazem; a trégua dura mais.', 'calm'),
    politic('incite', '⚔', 'Clique no reino que ataca e depois no alvo: a guerra começa já, sem esperar o preparo.', 'rage'),
    politic('inflame', '🔥', 'Clique em um reino: ele fica mais belicoso (ganha motivos com mais facilidade e se dá por pronto com menos).', 'rage'),
    politic('pacify', '🌿', 'Clique em um reino: ele fica mais pacato (exige muito mais vantagem e preparo antes de atacar).', 'calm'),
  );
  const surprise: Tool = {
    id: 'surprise',
    tab: 'events',
    label: 'Surpresa',
    icon: '🎲',
    tip: 'Um evento aleatório acontece em algum lugar do mundo (pode ser um povo novo, uma espécie, um desastre...).',
    mode: 'click',
    act: (ctx) => ctx.enqueue({ kind: 'surprise' }),
  };
  return [...TERRAIN_TOOLS, ...life, ...civ, ...EVENT_TOOLS, surprise];
}
