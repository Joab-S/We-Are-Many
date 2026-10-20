import * as THREE from 'three';
import { seedFor } from '../../core/rng';
import {
  BIOME_NAMES,
  classify,
  paintSurface,
  paintTile,
  tileHash,
  temperatureAt,
  type PlanetParams,
  type SurfaceMap,
} from '../../procgen/surface';
import { BOATS, BUILDING_NAMES, Ecosystem, elderAge, ERAS, isLand, YEAR_SECONDS, type ChronicleKind, type Village } from '../../sim/ecosystem';
import { ORE_COLORS, ORE_NAMES, ORES, STOCK_NAMES, WONDER_NAMES, type Ore } from '../../sim/economy';
import { QUIET_YEARS, runEvent, runRandomEvent, WORLD_EVENT_NAMES, type WorldEvent } from '../../sim/events';
import { CATEGORIES, ITEMS, MATERIALS } from '../../sim/items';
import { CHILD } from '../../sim/roles';
import { TIER_NAMES, TIER_RADIUS } from '../../sim/settlement';
import { earthCatalog, EARTH_ID, habitatOf, nativeSpecies, type Species } from '../../sim/species';
import { Input } from '../input';
import { SoftRenderer, type GameRenderer } from '../renderer';
import type { GameState } from '../state';
import { BODY_NAMES, makeDecorCanvas, ROLE_NAMES, ROLES, SPRITES } from './art';
import { generateSurfaceAsync } from './generateAsync';
import { SpriteAtlas, SpriteLayer, type SpriteName } from './sprites';

type Tab = 'terrain' | 'climate' | 'life' | 'civ' | 'events';

const TABS: [Tab, string][] = [
  ['terrain', '⛰ Terreno'],
  ['climate', '☁ Clima'],
  ['life', '🌿 Vida'],
  ['civ', '🏛 Civilização'],
  ['events', '☄ Eventos'],
];

interface Tool {
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
  apply?(map: SurfaceMap, i: number, strength: number): void;
  act?(ctx: SurfaceMode, x: number, y: number): void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const ORE_ICONS: Record<Ore, string> = { copper: '🟠', tin: '⚪', iron: '🟤', gold: '🟡', coal: '⚫' };

/** Ferramentas de terraformação e clima (RF-SUP-06). */
const TERRAIN_TOOLS: Tool[] = [
  { id: 'raise', tab: 'terrain', label: 'Elevar', icon: '⛰', tip: 'Levanta o chão aos poucos: do mar nasce terra, da terra, morros.', mode: 'brush', apply: (m, i, s) => (m.elevation[i] = clamp(m.elevation[i] + 0.02 * s, -1, 1)) },
  { id: 'lower', tab: 'terrain', label: 'Rebaixar', icon: '⛏', tip: 'Abaixa o chão aos poucos: vales, lagos e, no fim, mar.', mode: 'brush', apply: (m, i, s) => (m.elevation[i] = clamp(m.elevation[i] - 0.02 * s, -1, 1)) },
  { id: 'mountain', tab: 'terrain', label: 'Montanha', icon: '🏔', tip: 'Ergue serras de rocha rapidamente.', mode: 'brush', apply: (m, i, s) => (m.elevation[i] = clamp(m.elevation[i] + 0.06 * s, -1, 0.95)) },
  { id: 'sea', tab: 'terrain', label: 'Mar', icon: '🌊', tip: 'Afunda a terra até virar mar raso.', mode: 'brush', apply: (m, i, s) => (m.elevation[i] = Math.max(-0.3, m.elevation[i] - 0.06 * s)) },
  { id: 'flatten', tab: 'terrain', label: 'Nivelar', icon: '▭', tip: 'Aplaina o terreno para perto do nível de planície.', mode: 'brush', apply: (m, i, s) => (m.elevation[i] += (0.12 - m.elevation[i]) * Math.min(1, 0.05 * s)) },
  { id: 'sand', tab: 'terrain', label: 'Areia', icon: '🏜', tip: 'Seca o solo: vira praia ou deserto.', mode: 'brush', apply: (m, i, s) => { m.moisture[i] = clamp(m.moisture[i] - 0.05 * s, 0, 1); m.vegetation[i] = clamp(m.vegetation[i] - 0.05 * s, 0, 1); } },
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
      act: (ctx, x, y) => ctx.placeOre(x, y, ore),
    }),
  ),
  { id: 'heat', tab: 'climate', label: 'Aquecer', icon: '🔥', tip: 'Esquenta a região (derrete gelo, seca, e no extremo vira lava).', mode: 'brush', apply: (m, i, s) => (m.heat[i] = clamp(m.heat[i] + 1.5 * s, -150, 400)) },
  { id: 'cool', tab: 'climate', label: 'Resfriar', icon: '❄', tip: 'Esfria a região (neve, tundra e gelo no mar).', mode: 'brush', apply: (m, i, s) => (m.heat[i] = clamp(m.heat[i] - 1.5 * s, -150, 400)) },
  { id: 'rain', tab: 'climate', label: 'Chuva', icon: '🌧', tip: 'Deixa o clima mais úmido: a mata cresce melhor.', mode: 'brush', apply: (m, i, s) => (m.moisture[i] = clamp(m.moisture[i] + 0.04 * s, 0, 1)) },
  { id: 'dry', tab: 'climate', label: 'Secar', icon: '☀', tip: 'Deixa o clima mais seco.', mode: 'brush', apply: (m, i, s) => (m.moisture[i] = clamp(m.moisture[i] - 0.04 * s, 0, 1)) },
  { id: 'plant', tab: 'climate', label: 'Semear vida', icon: '🌱', tip: 'Espalha vegetação, que depois se espalha sozinha onde o clima deixa.', mode: 'brush', apply: (m, i, s) => (m.vegetation[i] = clamp(m.vegetation[i] + 0.06 * s, 0, 1)) },
  { id: 'forest', tab: 'climate', label: 'Floresta', icon: '🌳', tip: 'Planta mata fechada e umedece o solo.', mode: 'brush', apply: (m, i, s) => { m.vegetation[i] = clamp(m.vegetation[i] + 0.15 * s, 0, 1); m.moisture[i] = clamp(m.moisture[i] + 0.02 * s, 0, 1); } },
];

/** Eventos que o jogador pode provocar (aba Eventos). */
const EVENT_TOOLS: Tool[] = (
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
  act: (ctx: SurfaceMode, x: number, y: number) => ctx.trigger(ev, x, y),
}));

type Win = 'chronicle' | 'kingdoms' | 'species' | 'items' | 'world';

const WINDOWS: [Win, string][] = [
  ['chronicle', '📜 Crônica'],
  ['kingdoms', '👑 Reinos'],
  ['species', '🐾 Espécies'],
  ['items', '⚒ Itens'],
  ['world', '⚙ Mundo'],
];

const KIND_ICONS: Record<ChronicleKind, string> = { povo: '👥', era: '⭐', guerra: '⚔', natureza: '🌋', mar: '⛵', economia: '⚒', jogador: '✋' };

const DEFAULT_SPRITE = { fish: 'fish', herbivore: 'deer', predator: 'wolf', shark: 'shark', sapient: 'human' } as const;

/** Desenho de uma espécie de animal. */
function spriteOf(sp: Species): string {
  return sp.sprite && SPRITES[sp.sprite] ? sp.sprite : DEFAULT_SPRITE[sp.kind];
}

/** Corpo de uma espécie inteligente. */
function bodyOf(sp: Species): string {
  return sp.body && BODY_NAMES.includes(sp.body) ? sp.body : sp.origin === EARTH_ID ? 'human' : 'alien';
}

const vertexShader = /* glsl */ `
  out vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/**
 * Terreno em tela cheia. Longe: um pixel por tile. Perto: cada tile ganha
 * textura própria e o enfeite guardado no alfa (árvores, pinheiros, cactos,
 * pedras), desenhado numa grade de 8x8 pixels de arte, como no WorldBox.
 */
const fragmentShader = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform vec2 uMapSize;
  uniform vec2 uCenter;
  uniform float uZoom;
  uniform vec2 uResolution;
  uniform vec2 uHover;
  uniform float uBrush;
  uniform float uTime;
  uniform sampler2D uDecor;
  in vec2 vUv;
  out vec4 outColor;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  bool isWater(vec3 c) { return c.b > c.r + 0.25 && c.b > c.g; }

  vec4 at(ivec2 t) {
    t.x = (t.x + int(uMapSize.x)) % int(uMapSize.x);
    t.y = clamp(t.y, 0, int(uMapSize.y) - 1);
    return texelFetch(uMap, t, 0);
  }

  int kindOf(vec4 texel) { return int(texel.a * 255.0 + 0.5) / 16; }

  // Ruído 1D suave ao longo de uma borda entre tiles.
  float edgeNoise(float p, float line) {
    float i = floor(p);
    float u = fract(p);
    return mix(hash(vec2(i, line)), hash(vec2(i + 1.0, line)), u * u * (3.0 - 2.0 * u));
  }

  struct Px { vec4 texel; ivec2 tile; };

  // Pixel de arte global (16 por tile, y para baixo) com bordas orgânicas:
  // a fronteira entre dois tiles diferentes ondula, em vez de formar quadrados.
  Px artPx(ivec2 gp) {
    ivec2 t = ivec2(floor(vec2(gp) / 16.0));
    ivec2 f = gp - t * 16;
    vec4 me = at(t);
    int k = kindOf(me);
    if (k >= 7) return Px(me, t);
    int ex = f.x < 8 ? f.x : 15 - f.x;
    int ey = f.y < 8 ? f.y : 15 - f.y;
    bool vertical = ex < ey;
    int e = min(ex, ey);
    if (e >= 4) return Px(me, t);
    ivec2 off = vertical ? ivec2(f.x < 8 ? -1 : 1, 0) : ivec2(0, f.y < 8 ? -1 : 1);
    vec4 nb = at(t + off);
    int nk = kindOf(nb);
    if (nk >= 7) return Px(me, t);
    // Deslocamento da fronteira, igual para os dois lados: positivo empurra para o tile de menor índice.
    float line = vertical ? float(t.x + max(off.x, 0)) * 3.7 + 11.0 : float(t.y + max(off.y, 0)) * 5.3 + 47.0;
    float along = vertical ? float(gp.y) : float(gp.x);
    float d = (edgeNoise(along / 5.0, line) - 0.5) * 9.0;
    bool lowSide = vertical ? off.x > 0 : off.y > 0;
    float push = lowSide ? d : -d;
    if (push > float(e) + 0.5) return Px(nb, t + off);
    return Px(me, t);
  }

  bool waterPx(ivec2 gp) { return isWater(artPx(gp).texel.rgb); }

  // Ruas e estradas (enfeites 8 a 10): faixa no meio do tile que se liga às
  // ruas vizinhas, com cantos arredondados; fora da faixa aparece o chão.
  bool isRoad(vec4 tx) { int k = kindOf(tx); return k >= 8 && k <= 10; }

  bool onRoad(ivec2 f, int lo, int hi, bool rn, bool rs, bool rw, bool re) {
    bool midX = f.x >= lo && f.x <= hi;
    bool midY = f.y >= lo && f.y <= hi;
    if (midX && midY) {
      // Canto arredondado onde nenhuma rua chega pelos dois lados.
      bool cx = f.x == lo || f.x == hi;
      bool cy = f.y == lo || f.y == hi;
      if (cx && cy) {
        bool v = f.y == lo ? rn : rs;
        bool h = f.x == lo ? rw : re;
        return v || h;
      }
      return true;
    }
    if (midX && f.y < lo) return rn;
    if (midX && f.y > hi) return rs;
    if (midY && f.x < lo) return rw;
    if (midY && f.x > hi) return re;
    return false;
  }

  vec3 roadPx(ivec2 t, ivec2 f, int kind, vec3 base) {
    bool rn = isRoad(at(t + ivec2(0, -1)));
    bool rs = isRoad(at(t + ivec2(0, 1)));
    bool rw = isRoad(at(t + ivec2(-1, 0)));
    bool re = isRoad(at(t + ivec2(1, 0)));
    ivec2 gp = t * 16 + f;
    float grain = hash(vec2(gp) * 0.71 + 5.0);
    if (kind == 10) {
      // Praça: lajes grandes com rejunte e borda.
      bool edge = (f.y == 0 && !rn) || (f.y == 15 && !rs) || (f.x == 0 && !rw) || (f.x == 15 && !re);
      if (edge) return base * 0.7;
      ivec2 slab = gp / 6;
      if (gp.x % 6 == 0 || gp.y % 6 == 0) return base * 0.78;
      return base * (0.9 + 0.16 * hash(vec2(slab) + 2.0)) * (grain > 0.95 ? 0.9 : 1.0);
    }
    int lo = kind == 9 ? 2 : 3;
    int hi = 15 - lo;
    if (!onRoad(f, lo, hi, rn, rs, rw, re)) {
      // Chão do vizinho que não é rua; pisado logo ao lado da rua.
      vec4 n = at(t + ivec2(0, -1));
      vec4 s = at(t + ivec2(0, 1));
      vec4 w = at(t + ivec2(-1, 0));
      vec4 e = at(t + ivec2(1, 0));
      vec3 ground = !rn ? n.rgb : !rs ? s.rgb : !rw ? w.rgb : !re ? e.rgb : base * 1.1;
      if (isWater(ground)) ground = vec3(0.55, 0.62, 0.32);
      ground *= 0.9 + 0.12 * hash(floor(vec2(gp) / 3.0) + 0.37);
      bool near = onRoad(f + ivec2(1, 0), lo, hi, rn, rs, rw, re) || onRoad(f - ivec2(1, 0), lo, hi, rn, rs, rw, re)
        || onRoad(f + ivec2(0, 1), lo, hi, rn, rs, rw, re) || onRoad(f - ivec2(0, 1), lo, hi, rn, rs, rw, re);
      return near ? ground * 0.82 : ground;
    }
    bool border = !onRoad(f + ivec2(1, 0), lo, hi, rn, rs, rw, re) || !onRoad(f - ivec2(1, 0), lo, hi, rn, rs, rw, re)
      || !onRoad(f + ivec2(0, 1), lo, hi, rn, rs, rw, re) || !onRoad(f - ivec2(0, 1), lo, hi, rn, rs, rw, re);
    if (kind == 9) {
      // Calçamento de pedra: paralelepípedos em fiadas desencontradas e meio-fio claro.
      if (border) return base * 1.18;
      int row = gp.y / 3;
      int off = (row % 2) * 2;
      if (gp.y % 3 == 0 || (gp.x + off) % 4 == 0) return base * 0.7;
      return base * (0.9 + 0.18 * hash(vec2((gp.x + off) / 4, row) + 9.0));
    }
    // Terra batida: borda escura, sulcos das carroças e pedrinhas.
    if (border) return base * 0.78;
    bool horiz = (rw || re) && !(rn || rs);
    bool vert = (rn || rs) && !(rw || re);
    if ((horiz && (f.y == lo + 2 || f.y == hi - 2)) || (vert && (f.x == lo + 2 || f.x == hi - 2))) return base * 0.86;
    vec3 c = base * (0.94 + 0.1 * hash(floor(vec2(gp) / 2.0) + 1.3));
    if (grain > 0.94) c *= 1.18;
    else if (grain < 0.04) c *= 0.8;
    return c;
  }

  void main() {
    vec2 tile = uCenter + (vUv * uResolution - uResolution * 0.5) / uZoom;
    if (tile.y < 0.0 || tile.y >= uMapSize.y) { outColor = vec4(0.02, 0.03, 0.06, 1.0); return; }
    float x = mod(tile.x, uMapSize.x);
    ivec2 t = ivec2(int(x), int(uMapSize.y) - 1 - int(tile.y));
    vec4 texel = texelFetch(uMap, t, 0);
    vec3 c = texel.rgb;
    bool water = isWater(c);
    int kind = kindOf(texel);
    // Posição dentro do tile em pixels de arte (16x16), y para baixo.
    vec2 fp = vec2(fract(x), 1.0 - fract(tile.y)) * 16.0;
    ivec2 f = ivec2(fp);
    if (uZoom >= 3.0) {
      ivec2 gp = t * 16 + f;
      Px px = artPx(gp);
      c = px.texel.rgb;
      water = isWater(c);
      ivec2 pt = px.tile;
      // Variação suave por tile e manchas de 3 px, como as texturas de chão do WorldBox.
      float blot = hash(floor(vec2(gp) / 3.0) + 0.37);
      float grain = hash(vec2(gp) * 1.13);
      c *= 0.95 + 0.1 * hash(vec2(pt));
      if (water) {
        // Água rasa perto da terra, espuma colada na costa e ondinhas.
        bool n = !isWater(at(pt + ivec2(0, -1)).rgb);
        bool s = !isWater(at(pt + ivec2(0, 1)).rgb);
        bool w = !isWater(at(pt + ivec2(-1, 0)).rgb);
        bool e = !isWater(at(pt + ivec2(1, 0)).rgb);
        if (n || s || w || e) c = mix(c, vec3(0.45, 0.78, 0.92), 0.3);
        c *= 0.97 + 0.05 * blot;
        if (uZoom >= 4.0) {
          bool shore = !waterPx(gp + ivec2(1, 0)) || !waterPx(gp - ivec2(1, 0)) || !waterPx(gp + ivec2(0, 1)) || !waterPx(gp - ivec2(0, 1));
          if (shore) c = mix(c, vec3(0.93, 0.97, 1.0), 0.6);
          else if (!waterPx(gp + ivec2(2, 0)) || !waterPx(gp - ivec2(2, 0)) || !waterPx(gp + ivec2(0, 2)) || !waterPx(gp - ivec2(0, 2))) c = mix(c, vec3(0.6, 0.86, 0.95), 0.35);
          float wave = mod(float(gp.x) + float(gp.y) * 3.0 + floor(uTime * 3.0), 23.0);
          if (wave < 2.0 && hash(vec2(pt) + floor(uTime * 0.5)) > 0.55) c += 0.06;
        }
      } else {
        bool green = c.g > c.r && c.g > c.b * 1.1;
        bool sand = c.r > 0.55 && c.r >= c.g && c.g > c.b + 0.08;
        if (green) {
          // Grama: manchas claras e escuras e alguns fios.
          c *= 0.88 + 0.22 * blot;
          if (grain > 0.92) c *= 1.12;
          else if (grain < 0.06) c *= 0.8;
        } else if (sand) {
          // Areia: grãos escuros e claros espalhados.
          c *= 0.95 + 0.08 * blot;
          if (grain > 0.94) c *= 0.84;
          else if (grain < 0.05) c *= 1.08;
        } else {
          c *= 0.92 + 0.14 * blot + 0.04 * grain;
        }
        if (uZoom >= 4.0) {
          // Areia molhada na beira d'água e barranco quando a água fica ao sul.
          if (waterPx(gp + ivec2(0, 1)) || waterPx(gp + ivec2(0, 2))) c *= 0.62;
          else if (waterPx(gp + ivec2(1, 0)) || waterPx(gp - ivec2(1, 0)) || waterPx(gp - ivec2(0, 1))) c *= 0.85;
        }
      }
      texel = px.texel;
    }
    if (uZoom >= 3.0 && kind >= 8 && kind <= 10) c = roadPx(t, f, kind, texel.rgb);
    if (uZoom >= (kind == 7 ? 3.0 : 5.0) && kind > 0 && kind <= 7) {
      // Arte 16x16 do enfeite (art.ts): alfa cheio é cor, alfa parcial é sombra.
      vec4 d = texelFetch(uDecor, ivec2((kind - 1) * 16 + f.x, f.y), 0);
      if (d.a > 0.9) c = d.rgb * (0.94 + 0.12 * hash(vec2(t) + 7.0));
      else if (d.a > 0.2) c *= 0.62;
    } else if (uZoom >= 5.0 && kind == 0 && !water && texel.g > texel.r && texel.g > texel.b * 1.1) {
      // Tufos de grama e flores nos tiles verdes sem enfeite.
      float h = hash(vec2(t) + 3.1);
      ivec2 p = ivec2(3 + int(hash(vec2(t) + 1.7) * 10.0), 5 + int(hash(vec2(t) + 2.3) * 9.0));
      if (h < 0.4) {
        ivec2 d = f - p;
        if ((d.y == 0 && abs(d.x) <= 1 && d.x != 0) || (d.y == -1 && d.x == 0) || (d.y == -1 && abs(d.x) == 2)) c *= 0.72;
        if (d.y == -2 && abs(d.x) == 1) c *= 0.8;
      }
      if (h > 0.9) {
        ivec2 d = f - p + ivec2(4, 3);
        vec3 petals[4] = vec3[4](vec3(1.0, 0.95, 0.85), vec3(1.0, 0.85, 0.25), vec3(0.95, 0.5, 0.7), vec3(0.9, 0.3, 0.25));
        vec3 petal = petals[int(hash(vec2(t) + 9.0) * 4.0)];
        if (d == ivec2(0, 0)) c = petal;
        else if (abs(d.x) + abs(d.y) == 1 && d.y <= 0) c = mix(c, petal, 0.55);
        else if (d.x == 0 && d.y == 1) c *= 0.7;
      }
    }
    vec2 dd = vec2(mod(tile.x - uHover.x + uMapSize.x * 0.5, uMapSize.x) - uMapSize.x * 0.5, tile.y - uHover.y);
    float r = length(dd);
    if (uBrush > 0.0 && abs(r - uBrush) < 0.6 / max(uZoom * 0.25, 1.0) + 0.15) c = mix(c, vec3(1.0), 0.6);
    outColor = vec4(c, 1.0);
  }
`;

const SPEEDS = [0, 1, 2, 5];

/**
 * Visão da superfície no estilo WorldBox (REQUISITOS.md, seção 4.7). Enquanto
 * este modo está ativo, nada do 3D fica carregado.
 */
export class SurfaceMode {
  private readonly scene = new THREE.Scene();
  private readonly spriteScene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private map!: SurfaceMap;
  private eco!: Ecosystem;
  private pixels!: Uint8Array;
  private texture!: THREE.DataTexture;
  private material!: THREE.ShaderMaterial;
  private decorCanvas!: HTMLCanvasElement;
  private decorTexture!: THREE.CanvasTexture;
  private atlas!: SpriteAtlas;
  private sprites!: SpriteLayer;
  private readonly input: Input;
  private readonly root: HTMLDivElement;
  private tools: Tool[] = [...TERRAIN_TOOLS];
  /** Ferramenta na mão; null é a mão vazia (só move o mapa e inspeciona). */
  private tool: Tool | null = null;
  private brush = 6;
  private zoom = 3;
  private speed = 1;
  private center = new THREE.Vector2();
  private hover = new THREE.Vector2(-1e6, -1e6);
  private mouse: { x: number; y: number } | null = null;
  private painting = false;
  private clicked = false;
  private dragging: { x: number; y: number } | null = null;
  /** Onde começou o arraste da mão vazia, para separar clique de arraste. */
  private pressAt: { x: number; y: number } | null = null;
  /** Ficha fixada com um clique da mão vazia: uma criatura (segue ela) ou um lugar. */
  private pinned: { creature: number } | { x: number; y: number } | null = null;
  private folded = false;
  private showTerritory = true;
  private lastMini = 0;
  private miniBase: HTMLCanvasElement | null = null;
  private textureChanged = true;
  private lastView = '';
  private lastInfo = 0;
  private lastInfoHtml = '';
  private lastClockHtml = '';
  private lastPanelHtml = '';
  private raf = 0;
  private lastTime = performance.now();
  private simClock = 0;
  private ready = false;
  private readonly labels = new Map<number, HTMLDivElement>();
  private readonly abort = new AbortController();

  constructor(
    private readonly renderer: GameRenderer,
    private readonly state: GameState,
    private readonly params: PlanetParams,
    hud: HTMLElement,
    private readonly onExit: () => void,
  ) {
    this.input = new Input(renderer.domElement, false);
    this.root = document.createElement('div');
    this.root.className = 'surface-hud';
    this.root.innerHTML = `<div class="wb-loading">Observando a superfície de ${params.name}…</div>`;
    hud.appendChild(this.root);
    window.addEventListener('resize', this.resize, { signal: this.abort.signal });
    this.renderer.setClearColor(0x05070d);
    this.renderer.clear();

    const existing = state.surfaces.get(params.id);
    if (existing) this.init(existing);
    else void generateSurfaceAsync(params).then((map) => this.init(map));
  }

  private init(map: SurfaceMap): void {
    if (this.abort.signal.aborted) return;
    const state = this.state;
    this.map = map;
    state.surfaces.set(this.params.id, map);

    // Espécies nativas passam a ser conhecidas (podem ser levadas a outros planetas).
    let eco = state.ecosystems.get(this.params.id);
    if (!eco) {
      eco = new Ecosystem(map, seedFor(`${this.params.id}:life`));
      for (const sp of nativeSpecies(this.params)) {
        eco.addSpecies(sp);
        state.knownSpecies.set(sp.id, sp);
      }
      eco.populate();
      state.ecosystems.set(this.params.id, eco);
    }
    this.eco = eco;
    eco.onTileChanged = (i) => this.repaint(i);
    // O banco genético da Terra vem a bordo; variantes que surgem entram no catálogo.
    for (const sp of earthCatalog()) if (!state.knownSpecies.has(sp.id)) state.knownSpecies.set(sp.id, sp);
    for (const sp of eco.species) state.knownSpecies.set(sp.id, sp);
    eco.onSpecies = (sp) => {
      if (state.knownSpecies.has(sp.id)) return;
      state.knownSpecies.set(sp.id, sp);
      this.buildTools();
      if (this.ready) this.selectTab(this.tab);
    };

    this.pixels = new Uint8Array(map.width * map.height * 4);
    paintSurface(map, this.pixels);
    for (let i = 0; i < eco.road.length; i++) if (eco.road[i] || eco.built[i]) this.paintSettlement(i);
    this.texture = new THREE.DataTexture(this.pixels, map.width, map.height);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.needsUpdate = true;
    this.center.set(map.width / 2, map.height / 2);
    this.zoom = Math.max(1, window.innerHeight / map.height);
    this.decorCanvas = makeDecorCanvas();
    this.decorTexture = new THREE.CanvasTexture(this.decorCanvas);
    this.decorTexture.flipY = false;
    this.decorTexture.magFilter = THREE.NearestFilter;
    this.decorTexture.minFilter = THREE.NearestFilter;
    this.decorTexture.generateMipmaps = false;

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        uMap: { value: this.texture },
        uMapSize: { value: new THREE.Vector2(map.width, map.height) },
        uCenter: { value: this.center },
        uZoom: { value: this.zoom },
        uResolution: { value: new THREE.Vector2() },
        uHover: { value: this.hover },
        uBrush: { value: this.brush },
        uTime: { value: 0 },
        uDecor: { value: this.decorTexture },
      },
      depthTest: false,
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
    this.atlas = new SpriteAtlas();
    this.sprites = new SpriteLayer(this.atlas, 12000);
    this.spriteScene.add(this.sprites.mesh);

    this.buildTools();
    this.buildUi();
    this.resize();
    this.ready = true;
    // `?debug` deixa a cena acessível no console (testes e calibragem).
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as { surface: SurfaceMode }).surface = this;
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Ferramentas: terreno e clima, uma por espécie conhecida (Vida e Civilização) e eventos. */
  private buildTools(): void {
    const known = [...this.state.knownSpecies.values()];
    const group = (sp: Species) => (sp.parent ? 'Variantes' : habitatOf(sp) === 1 ? 'Água' : habitatOf(sp) === 2 ? 'Costa' : 'Terra');
    const order = ['Terra', 'Costa', 'Água', 'Variantes'];
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
        act: (ctx: SurfaceMode, x: number, y: number) => ctx.introduce(sp, x, y),
      }));
    life.push(
      { id: 'feed', tab: 'life', group: 'Cuidar', label: 'Alimentar', icon: '🍎', tip: 'Enche a energia das criaturas no pincel.', mode: 'brush', act: (ctx, x, y) => ctx.eco.feed(x, ctx.toRow(y), ctx.brush) },
      { id: 'cull', tab: 'life', group: 'Cuidar', label: 'Reduzir', icon: '✖', tip: 'Remove as criaturas dentro do pincel (controle de população).', mode: 'click', act: (ctx, x, y) => ctx.eco.cull(x, ctx.toRow(y), ctx.brush) },
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
        tip: `Solta um(a) ${sp.name.toLowerCase()} por clique. Sozinho, ele procura um assentamento do seu povo ou funda um novo; para nascerem filhos, precisa de pelo menos dois.`,
        mode: 'click' as const,
        act: (ctx: SurfaceMode, x: number, y: number) => ctx.introduce(sp, x, y),
      }));
    civ.push(
      {
        id: 'teach',
        tab: 'civ',
        group: 'Ajudar de leve',
        label: 'Ensinar',
        icon: '📜',
        tip: 'Adianta um pouco o conhecimento das aldeias no pincel (não pula a condição de era).',
        mode: 'click',
        act: (ctx, x, y) => {
          const taught = ctx.eco.teach(x, ctx.toRow(y), ctx.brush, 0.35);
          if (taught.length) ctx.eco.note(`Você ensinou ${taught.map((v) => v.name).join(', ')}`, 'jogador', taught[0]);
        },
      },
      {
        id: 'harvest',
        tab: 'civ',
        group: 'Ajudar de leve',
        label: 'Boa colheita',
        icon: '🌾',
        tip: 'Uma colheita farta para os assentamentos no pincel: comida guardada e mata viçosa em volta.',
        mode: 'click',
        act: (ctx, x, y) => ctx.harvest(x, y),
      },
    );
    const surprise: Tool = {
      id: 'surprise',
      tab: 'events',
      label: 'Surpresa',
      icon: '🎲',
      tip: 'Um evento aleatório acontece em algum lugar do mundo (pode ser um povo novo, uma espécie, um desastre...).',
      mode: 'click',
      act: (ctx) => ctx.surprise(),
    };
    this.tools = [...TERRAIN_TOOLS, ...life, ...civ, ...EVENT_TOOLS, surprise];
  }

  // Ações chamadas pelas ferramentas ----------------------------------------

  /** Converte coordenadas da vista (y para o norte) em linha do mapa. */
  toRow(viewY: number): number {
    return this.map.height - viewY;
  }

  introduce(sp: Species, x: number, viewY: number): void {
    const s = this.eco.addSpecies(sp);
    const born = this.eco.introduceOne(s, x, this.toRow(viewY));
    if (born < 0) this.eco.hint = `${sp.name}: o lugar não é habitável`;
    else this.eco.note(`Você soltou ${sp.name.toLowerCase()}`, 'jogador', { x, y: this.toRow(viewY) }, { key: `spawn:${sp.id}` });
  }

  placeOre(x: number, viewY: number, ore: Ore): void {
    if (!this.eco.placeOre(x, this.toRow(viewY), ore)) this.eco.hint = 'Aqui não dá para colocar minério';
  }

  /** Evento provocado pelo jogador no ponto clicado. */
  trigger(ev: WorldEvent, x: number, viewY: number): void {
    if (!runEvent(this.eco, ev, x, this.toRow(viewY))) this.eco.hint = `${WORLD_EVENT_NAMES[ev]}: não deu certo aqui`;
  }

  surprise(): void {
    const ev = runRandomEvent(this.eco);
    const e = this.eco.chronicle[0];
    if (ev && e && e.x >= 0) this.goTo(e.x, e.y);
  }

  /** Boa colheita: comida para os assentamentos no pincel e mata viçosa em volta. */
  harvest(x: number, viewY: number): void {
    const row = this.toRow(viewY);
    const helped = this.eco.villages.filter((v) => !v.abandoned && Math.hypot(((v.x - x + this.map.width * 1.5) % this.map.width) - this.map.width / 2, v.y - row) < this.brush + 6);
    for (const v of helped) v.food = Math.min(60, v.food + 25);
    this.forBrush(x, viewY, this.brush, (i) => (this.map.vegetation[i] = clamp(this.map.vegetation[i] + 0.2, 0, 1)));
    if (helped.length) this.eco.note(`Você deu uma boa colheita a ${helped.map((v) => v.name).join(', ')}`, 'jogador', helped[0]);
    else this.eco.hint = 'Nenhum assentamento no pincel';
  }

  /** Leva a câmera até um tile (x, linha). */
  goTo(x: number, row: number): void {
    this.center.set(x, this.map.height - row);
    this.zoom = Math.max(this.zoom, 8);
  }

  private forBrush(x: number, viewY: number, r: number, fn: (i: number, d: number) => void): void {
    const ri = Math.ceil(r);
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > r) continue;
        const i = this.tileIndex(x + dx, viewY + dy);
        if (i < 0) continue;
        fn(i, d);
        this.map.biome[i] = classify(this.map, i);
        this.repaint(i);
      }
    }
  }

  private repaint(i: number): void {
    this.map.biome[i] = classify(this.map, i);
    paintTile(this.map, this.pixels, i);
    if (this.eco.road[i] || this.eco.built[i]) this.paintSettlement(i);
    this.textureChanged = true;
  }

  /** Ruas, praça e terreno das casas por cima do terreno, sem enfeites. */
  private paintSettlement(i: number): void {
    if (!isLand(this.map, i)) return;
    const o = i * 4;
    const px = this.pixels;
    const road = this.eco.road[i];
    const n = tileHash(i) * 0.12 - 0.06;
    let c: [number, number, number] | null = null;
    if (road === 1) c = [150, 114, 74];
    else if (road === 2) c = [146, 144, 150];
    else if (road === 3) c = [184, 160, 120];
    else if (road === 4) c = [196, 160, 78];
    if (c) {
      px[o] = clamp(c[0] * (1 + n), 0, 255);
      px[o + 1] = clamp(c[1] * (1 + n), 0, 255);
      px[o + 2] = clamp(c[2] * (1 + n), 0, 255);
    } else {
      // Quintal: o chão sob a casa fica um pouco mais seco.
      px[o] = clamp(px[o] * 1.05 + 10, 0, 255);
      px[o + 1] = clamp(px[o + 1] * 0.98, 0, 255);
    }
    // Plantação leva o enfeite de trigo (7); terra batida, pedra e praça, os
    // enfeites 8, 9 e 10 (desenhados no shader); casas, o 15 (nem enfeite nem grama).
    const kind = road === 4 ? 7 : road === 1 ? 8 : road === 2 ? 9 : road === 3 ? 10 : 15;
    px[o + 3] = kind * 16 + 15;
  }

  // Interface ----------------------------------------------------------------

  private tab: Tab = 'terrain';
  /** Janela aberta (crônica, reinos, espécies, itens, mundo) e o filtro dela. */
  private win: Win | null = null;
  private winFilter = '';
  private lastWinHtml = '';
  private lastWin = 0;
  private showMinor = false;
  private showLabels = true;
  private readonly iconCache = new Map<string, string>();

  /** Ícone de sprite como imagem (para botões e janelas). */
  private icon(name: string, tint: readonly number[] = [200, 200, 200], skin: readonly number[] = tint): string {
    const key = `${name}|${tint.join(',')}|${skin.join(',')}`;
    let url = this.iconCache.get(key);
    if (!url) {
      url = SPRITES[name] ? this.atlas.tinted(name, tint, skin).toDataURL() : '';
      this.iconCache.set(key, url);
    }
    return url ? `<img class="wb-px" src="${url}" alt="">` : '';
  }

  private toolIcon(t: Tool): string {
    return t.icon.startsWith('sprite:') ? this.icon(t.icon.slice(7), t.tint, t.skin) : `<span>${t.icon}</span>`;
  }

  private buildUi(): void {
    this.root.innerHTML = `
      <canvas class="wb-terr" data-terr></canvas>
      <div class="wb-labels" data-l></div>
      <div class="wb-top">
        <button class="wb-back" data-a="back">⟵ Órbita</button>
        <div class="wb-title">${this.params.name}</div>
        <div class="wb-stats" data-s></div>
        <div class="wb-clock" data-clock></div>
        <div class="wb-menu">
          ${WINDOWS.map(([id, label]) => `<button class="wb-back" data-w="${id}">${label}</button>`).join('')}
          <button class="wb-back" data-a="help" title="Controles (H)">?</button>
        </div>
      </div>
      <div class="wb-info" data-i hidden></div>
      <div class="wb-side" data-side>
        <div class="wb-side-head">
          <canvas class="wb-mini" data-mini width="200" height="100" title="Clique ou arraste para levar a câmera"></canvas>
          <button class="wb-fold" data-fold title="Esconder ou mostrar o painel (P)">▾ Painel</button>
        </div>
        <div class="wb-side-body" data-p></div>
      </div>
      <div class="wb-cursor" data-cursor hidden></div>
      <div class="wb-window" data-win hidden>
        <div class="wb-win-head"><b data-win-title></b><button class="wb-x" data-close title="Fechar (Esc)">✕</button></div>
        <div class="wb-win-body" data-win-body></div>
      </div>
      <div class="wb-toast" data-toast hidden></div>
      <div class="wb-dock">
        <div class="wb-tip" data-tip></div>
        <div class="wb-tabs">${TABS.map(([id, label]) => `<button data-tab="${id}">${label}</button>`).join('')}</div>
        <div class="wb-bar" data-bar></div>
      </div>
      <div class="wb-help" data-help hidden>
        <div class="wb-win-head"><b>Controles</b><button class="wb-x" data-a="help" title="Fechar (H)">✕</button></div>
        <div class="wb-keys">
          <span><kbd>Esquerdo</kbd> usa a ferramenta; de mão vazia arrasta o mapa e um clique fixa a ficha do que está embaixo</span>
          <span><kbd>Direito</kbd><kbd>WASD</kbd> movem o mapa · <kbd>Roda</kbd> zoom</span>
          <span><kbd>Espaço</kbd> pausa · <kbd>1</kbd>–<kbd>4</kbd> velocidade</span>
          <span><kbd>[</kbd><kbd>]</kbd> tamanho do pincel · <kbd>Esc</kbd> guarda a ferramenta, fecha a janela ou volta à órbita</span>
          <span><kbd>C</kbd> crônica · <kbd>R</kbd> reinos · <kbd>E</kbd> espécies · <kbd>I</kbd> itens · <kbd>P</kbd> painel · <kbd>T</kbd> territórios · <kbd>H</kbd> esta ajuda</span>
          <span>Cada reino tem uma cor: a área dos assentamentos e a faixa do nome mostram de quem é. Borda cheia é a capital; tracejada, os outros assentamentos do reino.</span>
          <span>No minimapa, clique ou arraste para levar a câmera.</span>
        </div>
      </div>`;
    const signal = this.abort.signal;
    this.root.querySelector('[data-a="back"]')!.addEventListener('click', () => this.onExit(), { signal });
    this.root.querySelectorAll('[data-a="help"]').forEach((b) => b.addEventListener('click', () => this.toggleHelp(), { signal }));
    this.root.querySelector('[data-fold]')!.addEventListener('click', () => this.fold(), { signal });
    const mini = this.root.querySelector<HTMLCanvasElement>('[data-mini]')!;
    const jump = (e: PointerEvent) => {
      const r = mini.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * this.map.width;
      const row = ((e.clientY - r.top) / r.height) * this.map.height;
      this.center.set(x, this.map.height - row);
    };
    mini.addEventListener('pointerdown', (e) => {
      mini.setPointerCapture(e.pointerId);
      jump(e);
    }, { signal });
    mini.addEventListener('pointermove', (e) => {
      if (mini.hasPointerCapture(e.pointerId)) jump(e);
    }, { signal });
    this.scrollable(this.root.querySelector<HTMLElement>('[data-bar]')!, signal);
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
      b.addEventListener('click', () => this.selectTab(b.dataset.tab as Tab), { signal });
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-w]').forEach((b) => {
      b.addEventListener('click', () => this.openWindow(b.dataset.w as Win), { signal });
    });
    this.root.querySelector('[data-close]')!.addEventListener('click', () => this.openWindow(null), { signal });
    // pointerdown porque o painel e as janelas são redesenhados enquanto a
    // simulação roda e um clique (descer e subir) poderia cair em botões já substituídos.
    const onPanel = (e: Event) => {
      const el = e.target as HTMLElement;
      const speed = el.closest<HTMLElement>('[data-speed]');
      if (speed) this.speed = Number(speed.dataset.speed);
      const go = el.closest<HTMLElement>('[data-go]');
      if (go) {
        const [x, y] = go.dataset.go!.split(',').map(Number);
        this.goTo(x, y);
      }
      const village = el.closest<HTMLElement>('[data-village]');
      const v = village && this.eco.villages.find((it) => it.id === Number(village.dataset.village));
      if (v) this.goTo(v.x, v.y);
      const filter = el.closest<HTMLElement>('[data-filter]');
      if (filter) {
        this.winFilter = filter.dataset.filter!;
        this.lastWinHtml = '';
        this.updateWindow(true);
      }
      const tool = el.closest<HTMLElement>('[data-pick]');
      if (tool) {
        const t = this.tools.find((it) => it.id === tool.dataset.pick);
        if (t) {
          this.selectTab(t.tab);
          this.tool = t;
          this.updateToolbar();
          this.openWindow(null);
        }
      }
      const opt = el.closest<HTMLElement>('[data-opt]');
      if (opt) this.setOption(opt.dataset.opt!);
      const open = el.closest<HTMLElement>('[data-open]');
      if (open) this.openWindow(open.dataset.open as Win);
    };
    this.root.querySelector('[data-p]')!.addEventListener('pointerdown', onPanel, { signal });
    this.root.querySelector('[data-win-body]')!.addEventListener('pointerdown', onPanel, { signal });
    this.root.querySelector('[data-clock]')!.addEventListener('pointerdown', onPanel, { signal });
    this.selectTab('terrain');

    const canvas = this.renderer.domElement;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 0 && this.tool) {
        this.painting = true;
        this.clicked = true;
      } else {
        this.dragging = { x: e.clientX, y: e.clientY };
        if (e.button === 0) this.pressAt = { x: e.clientX, y: e.clientY };
      }
      canvas.setPointerCapture(e.pointerId);
    }, { signal });
    canvas.addEventListener('pointerup', (e) => {
      // Clique curto da mão vazia: fixa (ou solta) a ficha do que está embaixo.
      if (this.pressAt && Math.hypot(e.clientX - this.pressAt.x, e.clientY - this.pressAt.y) < 5) this.pin();
      this.pressAt = null;
      this.painting = false;
      this.dragging = null;
    }, { signal });
    canvas.addEventListener('pointermove', (e) => {
      if (this.dragging) {
        this.center.x -= (e.clientX - this.dragging.x) / this.zoom;
        this.center.y += (e.clientY - this.dragging.y) / this.zoom;
        this.dragging = { x: e.clientX, y: e.clientY };
      }
      this.mouse = { x: e.clientX, y: e.clientY };
    }, { signal });
    canvas.addEventListener('pointerleave', () => {
      this.mouse = null;
      this.root.querySelector<HTMLElement>('[data-cursor]')!.hidden = true;
    }, { signal });
  }

  private toggleHelp(): void {
    const el = this.root.querySelector<HTMLElement>('[data-help]')!;
    el.hidden = !el.hidden;
  }

  /** Esconde o painel lateral (o minimapa fica). */
  private fold(): void {
    this.folded = !this.folded;
    this.root.querySelector('[data-side]')!.classList.toggle('folded', this.folded);
    this.root.querySelector('[data-fold]')!.textContent = this.folded ? '▸ Painel' : '▾ Painel';
  }

  /** Fixa a ficha do que está sob o mouse; clicar no mesmo vazio de novo solta. */
  private pin(): void {
    const row = this.toRow(this.hover.y);
    const picked = this.eco.pick(this.hover.x, row, Math.max(0.8, 6 / this.zoom));
    if (picked >= 0) this.pinned = { creature: picked };
    else if (this.eco.settlementAt(this.hover.x, row)) this.pinned = { x: this.hover.x, y: this.hover.y };
    else this.pinned = null;
    this.lastInfoHtml = '';
    this.updateInfo();
  }

  /** Minimapa: o mapa inteiro reduzido e o retângulo da vista. */
  private updateMinimap(now: number): void {
    const mini = this.root.querySelector<HTMLCanvasElement>('[data-mini]')!;
    const { width: w, height: h } = this.map;
    if (!this.miniBase || now - this.lastMini > 1000) {
      this.lastMini = now;
      this.miniBase ??= Object.assign(document.createElement('canvas'), { width: w, height: h });
      const ctx = this.miniBase.getContext('2d')!;
      ctx.putImageData(new ImageData(new Uint8ClampedArray(this.pixels), w, h), 0, 0);
    }
    const ctx = mini.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.miniBase, 0, 0, mini.width, mini.height);
    const sx = mini.width / w;
    const sy = mini.height / h;
    // Assentamentos como pontos na cor do reino.
    for (const v of this.eco.villages) {
      if (v.abandoned) continue;
      ctx.fillStyle = `rgb(${v.color.join(',')})`;
      const r = 1 + v.tier;
      ctx.fillRect(v.x * sx - r / 2, v.y * sy - r / 2, r, r);
    }
    const vw = window.innerWidth / this.zoom;
    const vh = window.innerHeight / this.zoom;
    const x0 = this.center.x - vw / 2;
    const y0 = h - this.center.y - vh / 2;
    ctx.strokeStyle = '#f0c860';
    ctx.lineWidth = 1.5;
    for (const off of [-w, 0, w]) ctx.strokeRect((x0 + off) * sx, y0 * sy, vw * sx, vh * sy);
  }

  /** Soltar uma criatura é num ponto só: sem círculo de pincel. */
  private usesBrush(): boolean {
    return !!this.tool && !this.tool.id.startsWith('spawn:');
  }

  /** Ícone da ferramenta na mão, ao lado do cursor. */
  private updateCursor(): void {
    const el = this.root.querySelector<HTMLElement>('[data-cursor]')!;
    if (!this.tool || !this.mouse) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.style.transform = `translate(${this.mouse.x + 14}px, ${this.mouse.y + 14}px)`;
    if (el.dataset.t !== this.tool.id) {
      el.dataset.t = this.tool.id;
      el.innerHTML = this.toolIcon(this.tool);
    }
  }

  private setOption(opt: string): void {
    const eco = this.eco;
    if (opt === 'events') eco.autoEvents = !eco.autoEvents;
    else if (opt.startsWith('rate:')) eco.eventRate = Number(opt.slice(5));
    else if (opt === 'minor') this.showMinor = !this.showMinor;
    else if (opt === 'labels') this.showLabels = !this.showLabels;
    else if (opt === 'territory') this.showTerritory = !this.showTerritory;
    else if (opt === 'now') this.surprise();
    this.lastWinHtml = '';
    this.lastPanelHtml = '';
    this.updateWindow(true);
  }

  private selectTab(tab: Tab): void {
    this.tab = tab;
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const tools = this.tools.filter((t) => t.tab === tab);
    if (this.tool && this.tool.tab !== tab) this.tool = null;
    const bar = this.root.querySelector<HTMLElement>('[data-bar]')!;
    let html = '';
    let group: string | undefined;
    for (const t of tools) {
      if (t.group !== group) {
        group = t.group;
        if (group) html += `<div class="wb-group">${group}</div>`;
      }
      html += `<button class="wb-tool" data-t="${t.id}" title="${t.tip}">${this.toolIcon(t)}${t.label}</button>`;
    }
    bar.innerHTML = `
      ${html}
      <div class="wb-group"></div>
      <button class="wb-tool" data-t="inspect" title="Mão vazia: arraste para mover o mapa e passe o mouse para ver detalhes, sem mexer em nada"><span>✋</span>Mão</button>
      <label class="wb-brush">Pincel <input type="range" min="1" max="30" value="${this.brush}" data-b /></label>`;
    const signal = this.abort.signal;
    bar.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => {
      b.addEventListener('click', () => {
        // Clicar de novo na ferramenta da mão a guarda (volta à mão vazia).
        const t = this.tools.find((it) => it.id === b.dataset.t) ?? null;
        this.tool = t && t !== this.tool ? t : null;
        this.updateToolbar();
      }, { signal });
    });
    bar.querySelector<HTMLInputElement>('[data-b]')!.addEventListener('input', (e) => {
      this.brush = Number((e.target as HTMLInputElement).value);
    }, { signal });
    this.updateToolbar();
  }

  /**
   * Barra de ferramentas rolável para o lado: roda do mouse, arrastar com o
   * mouse ou o dedo e a barra de rolagem. Um arraste não conta como clique.
   */
  private scrollable(bar: HTMLElement, signal: AbortSignal): void {
    bar.addEventListener('wheel', (e) => {
      e.stopPropagation();
      if (bar.scrollWidth <= bar.clientWidth) return;
      e.preventDefault();
      bar.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    }, { signal, passive: false });
    let drag: { x: number; left: number; id: number } | null = null;
    let moved = false;
    bar.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target instanceof HTMLInputElement) return;
      drag = { x: e.clientX, left: bar.scrollLeft, id: e.pointerId };
      moved = false;
    }, { signal });
    bar.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (!moved && Math.abs(dx) > 6) {
        moved = true;
        bar.setPointerCapture(e.pointerId);
      }
      if (moved) bar.scrollLeft = drag.left - dx;
    }, { signal });
    const end = () => {
      drag = null;
    };
    bar.addEventListener('pointerup', end, { signal });
    bar.addEventListener('pointercancel', end, { signal });
    bar.addEventListener('click', (e) => {
      if (!moved) return;
      moved = false;
      e.stopPropagation();
      e.preventDefault();
    }, { signal, capture: true });
  }

  private updateToolbar(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => {
      b.classList.toggle('on', (this.tool?.id ?? 'inspect') === b.dataset.t);
    });
    const tip = this.root.querySelector<HTMLElement>('[data-tip]')!;
    tip.textContent = this.tool ? `${this.tool.label}: ${this.tool.tip} (clique de novo ou Esc para guardar)` : 'Mão vazia: arraste para mover o mapa e passe o mouse para ver detalhes. Escolha uma ferramenta para mexer no mundo.';
  }

  // Janelas ----------------------------------------------------------------

  private openWindow(win: Win | null): void {
    this.win = this.win === win ? null : win;
    this.winFilter = '';
    this.lastWinHtml = '';
    const el = this.root.querySelector<HTMLElement>('[data-win]')!;
    el.hidden = !this.win;
    this.root.querySelectorAll<HTMLButtonElement>('[data-w]').forEach((b) => b.classList.toggle('on', b.dataset.w === this.win));
    this.updateWindow(true);
  }

  private updateWindow(force = false): void {
    if (!this.win) return;
    const now = performance.now();
    if (!force && now - this.lastWin < 600) return;
    this.lastWin = now;
    const title = WINDOWS.find(([id]) => id === this.win)![1];
    const body =
      this.win === 'chronicle' ? this.chronicleHtml() : this.win === 'kingdoms' ? this.kingdomsHtml() : this.win === 'species' ? this.speciesHtml() : this.win === 'items' ? this.itemsHtml() : this.worldHtml();
    if (body === this.lastWinHtml) return;
    this.lastWinHtml = body;
    this.root.querySelector<HTMLElement>('[data-win-title]')!.textContent = title;
    this.root.querySelector<HTMLElement>('[data-win-body]')!.innerHTML = body;
  }

  private filters(list: [string, string][]): string {
    return `<div class="wb-filters">${list.map(([id, label]) => `<button data-filter="${id}" class="${this.winFilter === id ? 'on' : ''}">${label}</button>`).join('')}</div>`;
  }

  private chronicleHtml(): string {
    const f = this.winFilter;
    const kinds: Record<string, ChronicleKind[]> = { povos: ['povo', 'era'], guerra: ['guerra'], natureza: ['natureza'], mar: ['mar'], economia: ['economia'], voce: ['jogador'] };
    const list = this.eco.chronicle.filter((e) => (f === '' ? true : f === 'major' ? e.major : kinds[f]?.includes(e.kind)));
    const rows = list
      .slice(0, 150)
      .map((e) => {
        const where = e.x >= 0 ? ` data-go="${e.x.toFixed(1)},${e.y.toFixed(1)}"` : '';
        return `<button class="wb-row ${e.major ? 'major' : ''}"${where}><i>${KIND_ICONS[e.kind]}</i><span class="wb-yr">${Math.floor(e.year)}</span>${Ecosystem.describe(e)}${e.x >= 0 ? '<em>📍</em>' : ''}</button>`;
      })
      .join('');
    return `
      ${this.filters([['', 'Tudo'], ['major', 'Importantes'], ['povos', 'Povos'], ['guerra', 'Guerras'], ['natureza', 'Natureza'], ['mar', 'Mar'], ['economia', 'Economia'], ['voce', 'Você']])}
      <div class="wb-list">${rows || '<div class="wb-empty">Nada registrado ainda.</div>'}</div>
      <div class="wb-note">Clique numa linha com 📍 para ir ao lugar. A crônica guarda os ${this.eco.chronicle.length} acontecimentos mais recentes.</div>`;
  }

  private kingdomsHtml(): string {
    const eco = this.eco;
    const capitals = eco.villages.filter((v) => !v.abandoned && v.kingdom === v.id);
    if (!capitals.length) return '<div class="wb-empty">Nenhum povo neste planeta ainda. Leve um pela aba Civilização.</div>';
    const cards = capitals
      .map((k) => {
        const members = eco.villages.filter((v) => !v.abandoned && v.kingdom === k.id);
        const pop = members.reduce((n, v) => n + v.population, 0);
        const st = k.stock;
        const stock = STOCK_NAMES.filter(([key]) => st[key] >= 1).map(([key, name]) => `${name} ${Math.floor(st[key])}`).join(' · ');
        const c = k.culture;
        const rels = capitals
          .filter((o) => o !== k && (eco.relations.has(`${Math.min(o.id, k.id)}:${Math.max(o.id, k.id)}`)))
          .map((o) => {
            const r = eco.relation(o.id, k.id);
            const at = eco.warOf(k.id) && eco.wars.some((w) => (w.a === k.id && w.b === o.id) || (w.b === k.id && w.a === o.id));
            const [mark, cls] = at ? ['⚔ guerra', 'bad'] : eco.allied(o.id, k.id) ? ['❤ aliado', 'good'] : r < -35 ? ['hostil', 'bad'] : r < 0 ? ['tensão', 'warn'] : r > 40 ? ['amigo', 'good'] : ['paz', ''];
            return `<span class="wb-rel ${cls}"><i style="background:rgb(${o.color.join(',')})"></i>${o.name}: ${mark}</span>`;
          })
          .join('');
        const wonder = k.houses.some((h) => h.kind === 'wonder') ? ` · 🏛 ${WONDER_NAMES[c.value]}` : '';
        return `
          <div class="wb-card">
            <button class="wb-card-head" data-village="${k.id}"><i style="background:rgb(${k.color.join(',')})"></i><b>${members.length > 1 || k.tier >= 2 ? 'Reino de ' : ''}${k.name}</b><em>📍</em></button>
            <div>Povo ${c.name} · ${eco.species[k.species].name} · valoriza ${c.value} · crê em ${c.belief}${wonder}</div>
            <div>${members.length} assentamento${members.length > 1 ? 's' : ''} · ${pop} habitantes · ${ERAS[Math.floor(Math.max(...members.map((v) => v.tech)))]}</div>
            ${stock ? `<div class="wb-dim">${stock}</div>` : ''}
            ${rels ? `<div class="wb-rels">${rels}</div>` : ''}
          </div>`;
      })
      .join('');
    return `<div class="wb-grid">${cards}</div>`;
  }

  private speciesHtml(): string {
    const eco = this.eco;
    const f = this.winFilter;
    const known = [...this.state.knownSpecies.values()].filter((sp) => (f === '' ? true : f === 'here' ? eco.species.some((o, s) => o.id === sp.id && eco.population[s] > 0) : f === 'sapient' ? sp.kind === 'sapient' : sp.kind !== 'sapient'));
    const kindName = (sp: Species) => (sp.kind === 'sapient' ? 'Inteligente' : sp.kind === 'fish' ? 'Peixe' : sp.kind === 'shark' ? 'Marinho grande' : sp.kind === 'predator' ? 'Predador' : 'Herbívoro') + (sp.amphibious ? ' · anfíbio' : '');
    const cards = known
      .map((sp) => {
        const s = eco.species.findIndex((o) => o.id === sp.id);
        const pop = s >= 0 ? eco.population[s] : 0;
        const status = s < 0 ? 'Não vive aqui' : eco.extinct.has(s) ? '<span class="bad">Extinta aqui</span>' : `${pop} aqui`;
        const origin = sp.parent ? `variante de ${this.state.knownSpecies.get(sp.parent)?.name ?? '?'}` : sp.origin === EARTH_ID ? 'Terra' : sp.origin === this.params.id ? 'nativa' : sp.origin;
        const img = sp.kind === 'sapient' ? this.icon(`${bodyOf(sp)}:gatherer`, [200, 160, 90], sp.color) : this.icon(spriteOf(sp), sp.color);
        return `
          <div class="wb-sp">
            <div class="wb-sp-img">${img}</div>
            <div><b>${sp.name}</b><div class="wb-dim">${kindName(sp)} · ${origin}</div><div class="wb-dim">${(sp.tempMin - 273).toFixed(0)} a ${(sp.tempMax - 273).toFixed(0)} °C · vive ${Math.round(sp.maxAge)} anos</div><div>${status}</div></div>
            <button class="wb-mini" data-pick="spawn:${sp.id}">Soltar</button>
          </div>`;
      })
      .join('');
    return `${this.filters([['', 'Todas'], ['here', 'Neste planeta'], ['animal', 'Animais'], ['sapient', 'Inteligentes']])}<div class="wb-grid sp">${cards}</div>
      <div class="wb-note">O banco genético da Terra viaja com você. Espécies novas que surgem por evolução entram aqui sozinhas.</div>`;
  }

  private itemsHtml(): string {
    const eco = this.eco;
    const sections = CATEGORIES.map((cat) => {
      const items = ITEMS.filter((it) => it.category === cat)
        .map((it) => {
          const n = eco.crafted.get(it.id) ?? 0;
          const mat = MATERIALS[it.material];
          return `<div class="wb-item ${n ? '' : 'locked'}" title="${it.name}: ${mat.name}, desde a ${ERAS[it.era]}">${this.icon(`item:${it.icon}`, mat.color)}<b>${it.name}</b><span>${n ? `${n} feitos` : 'ainda não'}</span></div>`;
        })
        .join('');
      return `<div class="wb-section">${cat[0].toUpperCase() + cat.slice(1)}s</div><div class="wb-items">${items}</div>`;
    }).join('');
    return `${sections}<div class="wb-note">Os ferreiros fazem o que o minério permite: bronze (cobre + estanho), ferro e aço (ferro + carvão). Ouro vira joia. Na Idade da Pedra, pedra e madeira.</div>`;
  }

  private worldHtml(): string {
    const eco = this.eco;
    const quiet = Math.floor(eco.year - eco.lastMajor);
    const on = (b: boolean) => (b ? 'on' : '');
    return `
      <div class="wb-section">Eventos do mundo</div>
      <div class="wb-filters"><button data-opt="events" class="${on(eco.autoEvents)}">${eco.autoEvents ? 'Eventos aleatórios: ligados' : 'Eventos aleatórios: desligados'}</button></div>
      <div class="wb-filters">${[[0.5, 'Raros'], [1, 'Normais'], [2, 'Frequentes']].map(([r, l]) => `<button data-opt="rate:${r}" class="${on(eco.eventRate === r)}">${l}</button>`).join('')}</div>
      <div class="wb-note">Cometas, terremotos, vulcões, incêndios, secas, pestes, povos nômades, espécies novas e reaparecimentos acontecem de vez em quando. Se ${QUIET_YEARS} anos passam sem nada importante, um deles sacode o mundo. Agora: ${quiet} anos desde o último acontecimento importante.</div>
      <div class="wb-filters"><button data-opt="now">🎲 Provocar um evento agora</button></div>
      <div class="wb-section">Exibição</div>
      <div class="wb-filters"><button data-opt="labels" class="${on(this.showLabels)}">Nomes no mapa</button><button data-opt="territory" class="${on(this.showTerritory)}">Territórios coloridos (T)</button><button data-opt="minor" class="${on(this.showMinor)}">Acontecimentos menores no painel</button></div>
      <div class="wb-section">Atalhos</div>
      <div class="wb-note">Espaço pausa · 1 a 4 mudam a velocidade · C crônica · R reinos · E espécies · I itens · Esc fecha a janela ou volta à órbita.</div>`;
  }

  private readonly resize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.material) {
      (this.material.uniforms.uResolution.value as THREE.Vector2).copy(this.renderer.getDrawingBufferSize(new THREE.Vector2()));
    }
    this.lastView = '';
  };

  // Laço principal -----------------------------------------------------------

  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.state.time += dt;

    const input = this.input;
    if (input.hit('Escape')) {
      if (this.win) this.openWindow(null);
      else if (!this.root.querySelector<HTMLElement>('[data-help]')!.hidden) this.toggleHelp();
      else if (this.pinned) {
        this.pinned = null;
        this.lastInfoHtml = '';
      } else if (this.tool) {
        this.tool = null;
        this.updateToolbar();
      } else {
        this.onExit();
        return;
      }
    }
    if (input.hit('Space')) this.speed = this.speed ? 0 : 1;
    for (let k = 0; k < SPEEDS.length; k++) if (input.hit(`Digit${k + 1}`)) this.speed = k;
    if (input.hit('KeyH')) this.toggleHelp();
    if (input.hit('KeyT')) {
      this.showTerritory = !this.showTerritory;
      this.lastView = '';
    }
    if (input.hit('KeyP')) this.fold();
    for (const [code, step] of [['BracketLeft', -2], ['BracketRight', 2]] as const) {
      if (!input.hit(code)) continue;
      this.brush = clamp(this.brush + step, 1, 30);
      this.root.querySelector<HTMLInputElement>('[data-b]')!.value = String(this.brush);
    }
    for (const [code, win] of [['KeyC', 'chronicle'], ['KeyR', 'kingdoms'], ['KeyE', 'species'], ['KeyI', 'items']] as const) if (input.hit(code)) this.openWindow(win);
    const pan = 300 / this.zoom;
    this.center.x += ((input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0)) * pan * dt;
    this.center.y += ((input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0)) * pan * dt;
    if (input.wheel) this.zoom = clamp(this.zoom * (input.wheel < 0 ? 1.25 : 0.8), 0.5, 48);
    // Como no WorldBox, a vista não passa dos polos quando o mapa cabe na altura da tela.
    const halfView = window.innerHeight / 2 / this.zoom;
    this.center.y = halfView * 2 < this.map.height ? clamp(this.center.y, halfView, this.map.height - halfView) : this.map.height / 2;
    this.center.x = ((this.center.x % this.map.width) + this.map.width) % this.map.width;

    this.updateHover();
    this.useTool(dt);

    // Simulação em passos de no máximo 0,1 s, multiplicados pela velocidade escolhida.
    const simDt = dt * SPEEDS[this.speed];
    if (simDt > 0) {
      this.simClock += simDt;
      while (this.simClock > 0.1) {
        this.eco.step(0.1);
        this.simClock -= 0.1;
      }
    }

    if (this.textureChanged) this.texture.needsUpdate = true;
    // Parado e sem mudanças, não redesenha.
    const view = `${this.center.x},${this.center.y},${this.zoom},${this.hover.x},${this.hover.y},${this.tool?.id},${this.brush},${this.renderer.getPixelRatio()}`;
    if (simDt > 0 || this.textureChanged || view !== this.lastView || this.eco.effects.length) {
      this.lastView = view;
      this.textureChanged = false;
      this.render(now);
    }
    if (now - this.lastInfo > 150) {
      this.lastInfo = now;
      this.updateInfo();
      this.updatePanel();
      this.updateMinimap(now);
      this.updateWindow();
      this.updateToast(now);
    }
    this.updateCursor();
    input.endFrame();
  };

  private render(now: number): void {
    // Terremoto: a câmera treme enquanto dura.
    const shake = this.eco.shake > 0 ? Math.min(1, this.eco.shake) * 6 / this.zoom : 0;
    const cx = this.center.x;
    const cy = this.center.y;
    if (shake) this.center.set(cx + (Math.random() - 0.5) * shake, cy + (Math.random() - 0.5) * shake);
    this.renderView(now);
    this.drawTerritory();
    this.center.set(cx, cy);
  }

  /**
   * Território de cada assentamento na cor do seu reino: área tingida e borda.
   * Assentamentos do mesmo reino têm a mesma cor; povos independentes, outra.
   */
  private drawTerritory(): void {
    const canvas = this.root.querySelector<HTMLCanvasElement>('[data-terr]')!;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    if (!this.showTerritory || this.zoom < 1) return;
    const z = this.zoom;
    for (const v of this.eco.villages) {
      if (v.abandoned) continue;
      const [sx, gy] = this.toScreen(v.x, v.y, z, w, h);
      const sy = h - gy;
      const r = TIER_RADIUS[v.tier] * z;
      if (sx < -r || sx > w + r || sy < -r || sy > h + r) continue;
      const c = v.color.join(',');
      const capital = v.kingdom === v.id;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      // De perto o véu quase some, para não apagar a arte das casas, ruas e plantações.
      ctx.fillStyle = `rgba(${c},${Math.min(0.18, Math.max(0.03, 0.7 / z)).toFixed(3)})`;
      ctx.fill();
      ctx.lineWidth = Math.min(capital ? 4 : 3, Math.max(1.5, z * (capital ? 0.35 : 0.22)));
      ctx.setLineDash(capital ? [] : [z * 0.8, z * 0.5]);
      ctx.strokeStyle = `rgba(${c},0.9)`;
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  private renderView(now: number): void {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const pr = this.renderer.getPixelRatio();
    if (this.renderer instanceof SoftRenderer) {
      this.renderSoft(this.renderer.context, size.x, size.y, this.zoom * pr);
      this.updateLabels();
      return;
    }
    const u = this.material.uniforms;
    (u.uResolution.value as THREE.Vector2).copy(size);
    u.uZoom.value = this.zoom * pr;
    u.uBrush.value = this.usesBrush() ? this.brush : 0;
    u.uTime.value = now / 1000;
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.camera);
    this.drawSprites(size.x, size.y, this.zoom * pr);
    this.renderer.autoClear = false;
    this.renderer.render(this.spriteScene, this.camera);
    this.renderer.autoClear = true;
    this.updateLabels();
  }

  private softCanvas: HTMLCanvasElement | null = null;
  private softImage: ImageData | null = null;
  private softVersion = -1;

  /**
   * Desenho sem WebGL: o mapa vira um canvas de um pixel por tile, ampliado
   * sem suavização; os sprites são desenhados por cima. Sem os enfeites por
   * tile nem o brilho da água, que dependem do shader.
   */
  private renderSoft(ctx: CanvasRenderingContext2D, w: number, h: number, z: number): void {
    const map = this.map;
    const mw = map.width;
    const mh = map.height;
    if (!this.softCanvas) {
      this.softCanvas = document.createElement('canvas');
      this.softCanvas.width = mw;
      this.softCanvas.height = mh;
      this.softImage = new ImageData(mw, mh);
    }
    if (this.softVersion !== this.texture.version) {
      this.softVersion = this.texture.version;
      const out = this.softImage!.data;
      const src = this.pixels;
      for (let i = 0; i < out.length; i += 4) {
        out[i] = src[i];
        out[i + 1] = src[i + 1];
        out[i + 2] = src[i + 2];
        out[i + 3] = 255;
      }
      this.softCanvas.getContext('2d')!.putImageData(this.softImage!, 0, 0);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    // Canto superior esquerdo do mapa na tela; o mapa se repete na horizontal.
    const top = h / 2 - (mh - this.center.y) * z;
    const x0 = this.center.x - w / 2 / z;
    const x1 = this.center.x + w / 2 / z;
    for (let copy = Math.floor(x0 / mw); copy * mw < x1; copy++) {
      const a = Math.max(x0, copy * mw);
      const b = Math.min(x1, (copy + 1) * mw);
      const sa = Math.floor(a - copy * mw);
      const sb = Math.min(mw, Math.ceil(b - copy * mw));
      if (sb <= sa) continue;
      const dx = (copy * mw + sa - this.center.x) * z + w / 2;
      ctx.drawImage(this.softCanvas, sa, 0, sb - sa, mh, dx, top, (sb - sa) * z, mh * z);
    }
    if (z >= 5) {
      // Enfeites (árvores, pedras) com a mesma arte do shader.
      const r0 = Math.max(0, Math.floor(mh - this.center.y - h / 2 / z));
      const r1 = Math.min(mh - 1, Math.ceil(mh - this.center.y + h / 2 / z));
      const c0 = Math.floor(x0);
      const c1 = Math.ceil(x1);
      const size = Math.ceil(z);
      for (let row = r0; row <= r1; row++) {
        const sy = top + row * z;
        for (let col = c0; col <= c1; col++) {
          const i = row * mw + (((col % mw) + mw) % mw);
          const kind = this.pixels[i * 4 + 3] >> 4;
          if (kind < 1 || kind > 7) continue;
          ctx.drawImage(this.decorCanvas, (kind - 1) * 16, 0, 16, 16, Math.floor((col - this.center.x) * z + w / 2), Math.floor(sy), size, size);
        }
      }
    }
    this.drawSprites(w, h, z);
    this.sprites.drawSoft(ctx, h);
    if (this.usesBrush() && this.hover.x > -1e5) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = Math.max(1, z * 0.15);
      ctx.beginPath();
      ctx.arc((this.hover.x - this.center.x) * z + w / 2, h / 2 - (this.hover.y - this.center.y) * z, this.brush * z, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** Converte coordenadas do mapa (x, linha) em pixels do buffer, com volta horizontal. */
  private toScreen(x: number, row: number, z: number, w: number, h: number): [number, number] {
    const mw = this.map.width;
    let dx = x - this.center.x;
    dx -= Math.round(dx / mw) * mw;
    return [dx * z + w / 2, (this.map.height - row - this.center.y) * z + h / 2];
  }

  private drawSprites(w: number, h: number, z: number): void {
    const eco = this.eco;
    const layer = this.sprites;
    layer.begin(w, h);
    const margin = 40;
    const small = z < 3.5;
    // Casas primeiro, criaturas por cima.
    const buildings: { sprite: SpriteName; sx: number; sy: number; h: number; tint: readonly number[] }[] = [];
    // As chamas das fogueiras trocam de quadro algumas vezes por segundo.
    const flame = Math.floor(performance.now() / 260) % 2 === 0;
    for (const v of eco.villages) {
      if (v.abandoned) continue;
      const era = Math.floor(v.tech);
      // Uma casa por era; cidades medievais já têm sobrados.
      const style =
        era >= 4 || (era >= 3 && v.tier >= 2) ? 'townhouse' : era >= 3 ? 'stoneHouse' : era >= 2 ? 'house' : era >= 1 ? 'cottage' : 'hut';
      for (const house of v.houses) {
        if (house.kind === 'port') {
          // O píer fica virado para a água (variante 1: água a oeste).
          const [px, py] = this.toScreen(house.x + 0.5, house.y + 1.1, z, w, h);
          if (px < -margin || px > w + margin || py < -margin || py > h + margin) continue;
          buildings.push({ sprite: 'port', sx: px, sy: py, h: z * 1.4, tint: v.color });
          continue;
        }
        const [sx, sy] = this.toScreen(house.x + 1, house.y + 2, z, w, h);
        if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) continue;
        const sprite = house.kind !== 'house' ? house.kind : house.variant ? `${style}:${house.variant}` : style;
        buildings.push({ sprite, sx, sy, h: Math.max(3, z * 2), tint: v.color });
        // Na Idade da Pedra, algumas cabanas têm uma fogueira no quintal.
        if (!small && era === 0 && house.kind === 'house' && house.variant === 1) {
          const [cx, cy] = this.toScreen(house.x + 2.3, house.y + 2, z, w, h);
          buildings.push({ sprite: flame ? 'campfire' : 'campfire2', sx: cx, sy: cy, h: z * 0.6, tint: v.color });
        }
      }
      if (!small) {
        const [fx, fy] = this.toScreen(v.x, v.y + 1.5, z, w, h);
        const capital = v.kingdom === v.id && eco.kingdomSize(v) > 1;
        // Idade da Pedra: a praça é uma fogueira, mesmo nas cidades; depois, poço ou fortaleza.
        if (era === 0) buildings.push({ sprite: flame ? 'bonfire' : 'bonfire2', sx: fx, sy: fy, h: z * 1.25, tint: v.color });
        else if (v.tier >= 2) buildings.push({ sprite: capital ? 'castle' : 'keep', sx: fx, sy: fy, h: z * (capital ? 2 : 2.6), tint: v.color });
        else buildings.push({ sprite: 'well', sx: fx, sy: fy, h: z * 1.3, tint: v.color });
      }
    }
    // Jazidas: caverna, veio ou mina, com pontos na cor do minério.
    if (!small) {
      for (const d of eco.deposits) {
        if (d.amount <= 0) continue;
        const [sx, sy] = this.toScreen(d.x + 0.5, d.y + 1, z, w, h);
        if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) continue;
        const sprite = d.mine >= 0 ? 'mine' : d.cave ? 'cave' : 'vein';
        const rows = { mine: 11, cave: 8, vein: 6 }[sprite];
        buildings.push({ sprite, sx, sy, h: (rows * z) / 8, tint: ORE_COLORS[d.ore] });
      }
    }
    // Ruínas de construções destruídas por desastres.
    if (!small) {
      for (const r of eco.ruins) {
        const [sx, sy] = this.toScreen(r.x, r.y, z, w, h);
        if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) continue;
        buildings.push({ sprite: 'ruin', sx, sy, h: z * 1.25, tint: [150, 150, 150] });
      }
    }
    // De cima para baixo, para as construções da frente cobrirem as de trás.
    buildings.sort((a, b) => b.sy - a.sy);
    for (const b of buildings) layer.push(b.sprite, b.sx, b.sy, b.h, b.tint);
    // Barcos com a cor do reino; destroços ficam boiando um pouco depois do naufrágio.
    const px = (z * 1.05) / 9;
    for (const b of eco.boats) {
      const [sx, sy] = this.toScreen(b.x, b.y, z, w, h);
      if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) continue;
      const tint = eco.villages[b.village].color;
      if (small) {
        layer.push('dot', sx, sy, Math.max(2, z), tint);
        continue;
      }
      const name = b.sunk >= 0 ? 'wreck' : BOATS[b.kind].sprite;
      const rows = { wreck: 4, canoe: 7, rowboat: 8, sailboat: 15, caravel: 17, steamship: 14 }[name] ?? 8;
      const bob = Math.sin((performance.now() / 1000) * 2 + b.x) * px * 0.6;
      layer.push(b.sunk < 0 && b.facing < 0 ? `${name}:l` : name, sx, sy - z * 0.4 + bob, rows * px, tint, tint);
    }
    for (let i = 0; i < eco.count; i++) {
      if (!eco.alive[i]) continue;
      const [sx, sy] = this.toScreen(eco.x[i], eco.y[i], z, w, h);
      if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) continue;
      const sp = eco.species[eco.kind[i]];
      const vi = eco.village[i];
      const tint = sp.kind === 'sapient' && vi >= 0 ? eco.villages[vi].color : sp.color;
      if (small) {
        layer.push('dot', sx, sy, Math.max(1.5, z * 0.7), tint);
        continue;
      }
      if (sp.kind === 'sapient') {
        // Aparência pela profissão e pela idade; a pele de espécies alienígenas é a cor da espécie.
        const body = bodyOf(sp);
        const role = vi >= 0 ? eco.role[i] : 0;
        const era = vi >= 0 ? Math.floor(eco.villages[vi].tech) : 0;
        if (role === CHILD) {
          layer.push(`${body}:child`, sx, sy - z * 0.5, z * 1.05 * (6 / 9), tint, sp.color);
          continue;
        }
        const elder = eco.age[i] >= elderAge(sp, era) && role < ROLES.indexOf('leader');
        layer.push(`${body}:${elder ? 'elder' : ROLES[role]}`, sx, sy - z * 0.5, z * 1.05 * (11 / 9), tint, sp.color);
        continue;
      }
      const name: SpriteName = spriteOf(sp);
      // Altura pelo tamanho da espécie; os bichos olham para onde andam.
      const height = (name === 'fish' ? 0.5 : name === 'shark' ? 0.55 : name === 'whale' ? 0.7 : 0.85) * (sp.size ?? 1);
      const flipped = eco.vx[i] < 0 && SPRITES[`${name}:l`] ? `${name}:l` : name;
      layer.push(flipped, sx, sy - z * 0.5, z * height, tint);
    }
    this.drawEffects(layer, w, h, z, margin);
    layer.end();
  }

  /** Efeitos de eventos (cometa caindo, explosão, fumaça, fogo, peste) e marcadores de guerra. */
  private drawEffects(layer: SpriteLayer, w: number, h: number, z: number, margin: number): void {
    const eco = this.eco;
    const white = [255, 255, 255];
    for (const fx of eco.effects) {
      const t = fx.age / fx.life;
      let x = fx.x;
      let y = fx.y;
      let size = Math.max(fx.size, 1) * z;
      let sprite: SpriteName = fx.kind;
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
      const [sx, sy] = this.toScreen(x, y, z, w, h);
      if (sx < -margin * 4 || sx > w + margin * 4 || sy < -margin * 4 || sy > h + margin * 4) continue;
      layer.push(sprite, sx, sy, size, white);
    }
    // Espadas cruzadas sobre os alvos das guerras em andamento.
    if (z >= 1.5) {
      for (const war of eco.wars) {
        const v = eco.villages[war.target];
        const [sx, sy] = this.toScreen(v.x, v.y - 4.5, z, w, h);
        if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) continue;
        layer.push('swords', sx, sy, Math.max(10, z * 1.6), white);
      }
    }
  }

  /** Nomes das aldeias (como no WorldBox), visíveis com zoom. */
  private updateLabels(): void {
    const container = this.root.querySelector<HTMLElement>('[data-l]')!;
    const show = this.showLabels && this.zoom >= 2.5;
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const v of this.eco.villages) {
      let el = this.labels.get(v.id);
      if (!show || v.abandoned) {
        if (el) el.hidden = true;
        continue;
      }
      const [sx, sy] = this.toScreen(v.x, v.y - 2.5, this.zoom, w, h);
      if (sx < -100 || sx > w + 100 || sy < -40 || sy > h + 40) {
        if (el) el.hidden = true;
        continue;
      }
      if (!el) {
        el = document.createElement('div');
        el.className = 'wb-village';
        container.appendChild(el);
        this.labels.set(v.id, el);
      }
      el.hidden = false;
      const text =
        v.kingdom === v.id && this.eco.kingdomSize(v) > 1
          ? `♛ Reino de ${v.name} · ${v.population}`
          : `${TIER_NAMES[v.tier]} ${v.name} · ${v.population}`;
      if (el.textContent !== text) el.textContent = text;
      const color = `rgb(${v.color.join(',')})`;
      if (el.style.borderLeftColor !== color) el.style.borderLeftColor = color;
      el.title = v.kingdom === v.id ? `Povo ${v.culture.name}` : `Reino de ${this.eco.capitalOf(v).name} · povo ${v.culture.name}`;
      el.style.transform = `translate(${sx}px, ${h - sy}px) translate(-50%, -100%)`;
    }
  }

  /** Converte a posição do mouse em coordenadas do mapa (y cresce para o norte). */
  private updateHover(): void {
    if (!this.mouse) {
      this.hover.set(-1e6, -1e6);
      return;
    }
    const sx = this.mouse.x - window.innerWidth / 2;
    const sy = window.innerHeight / 2 - this.mouse.y;
    this.hover.set(this.center.x + sx / this.zoom, this.center.y + sy / this.zoom);
  }

  private tileIndex(x: number, viewY: number): number {
    const w = this.map.width;
    const tx = ((Math.floor(x) % w) + w) % w;
    const ty = this.map.height - 1 - Math.floor(viewY);
    return ty < 0 || ty >= this.map.height ? -1 : ty * w + tx;
  }

  private useTool(dt: number): void {
    const tool = this.tool;
    const click = this.clicked;
    this.clicked = false;
    if (!tool || this.hover.x < -1e5) return;
    if (tool.mode === 'click') {
      if (click) tool.act?.(this, this.hover.x, this.hover.y);
      return;
    }
    if (!this.painting) return;
    if (tool.apply) {
      const r = this.brush;
      this.forBrush(this.hover.x, this.hover.y, r, (i, d) => tool.apply!(this.map, i, (1 - d / (r + 1)) * dt * 30));
    } else {
      tool.act?.(this, this.hover.x, this.hover.y);
    }
  }

  /** Nome da construção, rua ou plantação no tile, se houver. */
  private placeAt(i: number): string | null {
    const dep = this.eco.depositAt[i];
    if (dep >= 0 && this.eco.deposits[dep].amount > 0) {
      const d = this.eco.deposits[dep];
      const what = d.mine >= 0 ? `Mina de ${ORE_NAMES[d.ore]} · ${this.eco.villages[d.mine].name}` : `${d.cave ? 'Caverna com' : 'Veio de'} ${ORE_NAMES[d.ore]}`;
      return `${what} · restam ${Math.ceil(d.amount)} de ${d.initial}`;
    }
    const road = this.eco.road[i];
    if (road === 4) return 'Plantação';
    if (road === 3) return 'Praça';
    if (road) return 'Rua';
    if (!this.eco.built[i]) return null;
    const w = this.map.width;
    const x = i % w;
    const y = Math.floor(i / w);
    for (const v of this.eco.villages) {
      for (const h of v.houses) {
        const size = h.kind === 'port' ? 0 : 1;
        if (y >= h.y && y <= h.y + size && (x - h.x + w) % w <= size) return `${h.kind === 'wonder' ? WONDER_NAMES[v.culture.value] : BUILDING_NAMES[h.kind]} · ${v.name}`;
      }
    }
    return null;
  }

  /** Resumo do assentamento sob o mouse: reino, povo, estoque, o que falta para a próxima era e guerra. */
  private settlementInfo(v: Village): string {
    const eco = this.eco;
    const capital = eco.capitalOf(v);
    const st = eco.store(v);
    const stock = STOCK_NAMES.filter(([k]) => st[k] >= 1).map(([k, name]) => `${name} ${Math.floor(st[k])}`).join(' · ');
    const need = eco.eraNeed(v);
    const war = eco.warOf(v.kingdom);
    const enemy = war ? eco.villages[war.a === v.kingdom ? war.b : war.a].name : '';
    const c = v.culture;
    const allies = eco.villages.filter((o) => !o.abandoned && o.kingdom === o.id && o.id !== v.kingdom && eco.allied(o.id, v.kingdom)).map((o) => o.name);
    return `
      <b>${TIER_NAMES[v.tier]} ${v.name}${capital !== v ? ` · Reino de ${capital.name}` : ''}</b>
      <span>Povo ${c.name} · valoriza ${c.value} · crê n${c.belief.startsWith('a') ? 'a' : 'o'}${c.belief.startsWith('os') || c.belief.startsWith('as') ? 's' : ''} ${c.belief.split(' ').slice(1).join(' ')}</span>
      ${stock ? `<span>${stock}</span>` : ''}
      ${need ? `<span>Para a próxima era: ${need}</span>` : ''}
      ${war ? `<span>⚔ Em guerra com ${enemy}</span>` : ''}
      ${allies.length ? `<span>❤ Aliado de ${allies.join(', ')}</span>` : ''}
      <hr>`;
  }

  /** Profissão, ou a fase da vida de quem não trabalha. */
  private lifeStage(i: number): string {
    const eco = this.eco;
    const role = eco.role[i];
    if (role === CHILD) return 'Criança';
    const sp = eco.species[eco.kind[i]];
    const v = eco.villages[eco.village[i]];
    const name = ROLE_NAMES[ROLES[role]];
    return eco.age[i] >= elderAge(sp, Math.floor(v.tech)) ? (role >= ROLES.indexOf('leader') ? `${name} idoso` : 'Idoso') : name;
  }

  private updateInfo(): void {
    const el = this.root.querySelector<HTMLElement>('[data-i]')!;
    // Ficha fixada: segue a criatura (enquanto viver) ou fica no lugar clicado.
    let at = this.hover;
    let picked = -1;
    const pin = this.pinned;
    if (pin && 'creature' in pin) {
      if (this.eco.alive[pin.creature]) {
        picked = pin.creature;
        at = new THREE.Vector2(this.eco.x[picked], this.map.height - this.eco.y[picked]);
      } else this.pinned = null;
    } else if (pin) at = new THREE.Vector2(pin.x, pin.y);
    const i = this.tileIndex(at.x, at.y);
    if (i < 0) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.classList.toggle('pinned', !!this.pinned);
    let html: string;
    if (!pin || !('creature' in pin)) picked = this.eco.pick(at.x, this.toRow(at.y), Math.max(0.8, 6 / this.zoom));
    if (picked >= 0) {
      const sp = this.eco.species[this.eco.kind[picked]];
      const v = this.eco.village[picked] >= 0 ? this.eco.villages[this.eco.village[picked]] : null;
      html = `
        <b>${sp.name}${v ? ` · ${this.lifeStage(picked)}` : ''}</b>
        ${v ? `<span>${TIER_NAMES[v.tier]} ${v.name} · ${ERAS[Math.floor(v.tech)]}</span>` : ''}
        ${v && v.kingdom !== v.id ? `<span>Reino de ${this.eco.capitalOf(v).name}</span>` : ''}
        <span>Idade ${this.eco.age[picked].toFixed(0)} anos</span>
        <span>Energia ${(this.eco.energy[picked] * 100).toFixed(0)}%</span>`;
    } else {
      const t = temperatureAt(this.map, i);
      const place = this.placeAt(i);
      const v = this.eco.settlementAt(at.x, this.toRow(at.y));
      html = `
        ${v ? this.settlementInfo(v) : ''}
        <b>${place ?? BIOME_NAMES[this.map.biome[i] as keyof typeof BIOME_NAMES]}</b>
        <span>Altitude ${(this.map.elevation[i] * 100).toFixed(0)}</span>
        <span>Temperatura ${(t - 273.15).toFixed(0)} °C</span>
        <span>Umidade ${(this.map.moisture[i] * 100).toFixed(0)}%</span>
        <span>Vegetação ${(this.map.vegetation[i] * 100).toFixed(0)}%</span>`;
    }
    if (this.pinned) html = `<div class="wb-pin">📌 Fixado · Esc ou clique no vazio solta</div>${html}`;
    if (html !== this.lastInfoHtml) {
      this.lastInfoHtml = html;
      el.innerHTML = html;
    }
  }

  /** Quanto falta para a próxima era no assentamento mais avançado. */
  private progressLine(live: { tech: number }[]): string {
    if (!live.length) return '';
    const top = Math.max(...live.map((v) => v.tech));
    const era = Math.floor(top);
    if (era >= ERAS.length - 1) return ' · última era';
    return ` · rumo à ${ERAS[era + 1]}: ${Math.floor((top - era) * 100)}%`;
  }

  /** Painel lateral: ano, era, velocidade, população, povos, guerras e acontecimentos importantes. */
  private updatePanel(): void {
    const eco = this.eco;
    const live = eco.villages.filter((v) => !v.abandoned);
    const kingdoms = live.filter((v) => v.kingdom === v.id).length;
    const era = live.length ? ERAS[Math.floor(Math.max(...live.map((v) => v.tech)))] : 'Sem civilização';
    const alive = eco.species.map((sp, s) => ({ sp, n: eco.population[s] })).filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
    const rows = alive
      .slice(0, 7)
      .map(({ sp, n }) => `<div class="wb-pop"><i style="background:rgb(${sp.color.join(',')})"></i>${sp.name}<b>${n}</b></div>`)
      .join('');
    const more = alive.length > 7 ? `<button class="wb-goto" data-open="species">+ ${alive.length - 7} espécies…</button>` : '';
    const events = eco.chronicle.filter((e) => this.showMinor || e.major).slice(0, 6);
    const clock = `
      <div class="wb-clock-text"><b>${era}</b><span>Ano ${Math.floor(eco.year)}${this.progressLine(live)}</span></div>
      <div class="wb-speed">${SPEEDS.map((v, k) => `<button data-speed="${k}" class="${k === this.speed ? 'on' : ''}" title="${v === 0 ? 'Pausa (Espaço)' : `Velocidade ${v}x (${k + 1})`}">${v === 0 ? '❚❚' : `${v}x`}</button>`).join('')}</div>`;
    if (clock !== this.lastClockHtml) {
      this.lastClockHtml = clock;
      this.root.querySelector<HTMLElement>('[data-clock]')!.innerHTML = clock;
    }
    const html = `
      <div class="wb-section">População</div>
      ${rows || '<div class="wb-empty">Nenhuma espécie. Leve uma pela aba Vida.</div>'}
      ${more}
      <div class="wb-section">Povos</div>
      <div class="wb-pop">Assentamentos<b>${live.length}</b></div>
      ${kingdoms ? `<button class="wb-goto" data-open="kingdoms">Reinos e povos<b>${kingdoms}</b></button>` : ''}
      ${eco.alliances.size ? `<div class="wb-pop">Alianças<b>${eco.alliances.size}</b></div>` : ''}
      ${eco.wars.map((war) => `<button class="wb-goto bad" data-village="${war.target}">⚔ ${eco.villages[war.a].name} × ${eco.villages[war.b].name}<b>${war.losses[0] + war.losses[1]}†</b></button>`).join('')}
      ${[...live].sort((a, b) => b.population - a.population).slice(0, 4).map((v) => `<button class="wb-goto" data-village="${v.id}"><i style="background:rgb(${v.color.join(',')})"></i>${TIER_NAMES[v.tier]} ${v.name}<b>${v.population}</b></button>`).join('')}
      ${events.length ? `<div class="wb-section">Acontecimentos</div>${events.map((e) => `<button class="wb-log"${e.x >= 0 ? ` data-go="${e.x.toFixed(1)},${e.y.toFixed(1)}"` : ''}><span class="wb-yr">${Math.floor(e.year)}</span> ${Ecosystem.describe(e)}</button>`).join('')}<button class="wb-goto" data-open="chronicle">Crônica completa…</button>` : ''}`;
    if (html !== this.lastPanelHtml) {
      this.lastPanelHtml = html;
      this.root.querySelector<HTMLElement>('[data-p]')!.innerHTML = html;
    }
    let land = 0;
    let life = 0;
    for (let k = 0; k < this.map.elevation.length; k += 7) {
      if (this.map.elevation[k] >= 0) land++;
      life += this.map.vegetation[k];
    }
    const total = this.map.elevation.length / 7;
    this.root.querySelector<HTMLElement>('[data-s]')!.textContent =
      `terra ${Math.round((land / total) * 100)}% · vegetação ${Math.round((life / total) * 100)}% · 1 ano = ${YEAR_SECONDS / Math.max(1, SPEEDS[this.speed])} s`;
  }

  private toastUntil = 0;

  /** Avisos curtos (lugar inválido etc.) num balão que some sozinho. */
  private updateToast(now: number): void {
    const el = this.root.querySelector<HTMLElement>('[data-toast]')!;
    if (this.eco.hint) {
      el.textContent = this.eco.hint;
      el.hidden = false;
      this.eco.hint = '';
      this.toastUntil = now + 2500;
    } else if (now > this.toastUntil) el.hidden = true;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.input.dispose();
    if (this.ready) {
      this.eco.onTileChanged = () => {};
      this.scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      this.material.dispose();
      this.texture.dispose();
      this.decorTexture.dispose();
      this.sprites.dispose();
      this.atlas.dispose();
    }
    this.root.remove();
    this.renderer.setClearColor(0x000000);
    this.renderer.renderLists.dispose();
  }
}
