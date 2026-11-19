/**
 * Flora (Plano 2): a planta dominante de cada tile, a estação dos frutos e a parte lenhosa da mata,
 * que dá ramagem e fruto aos ramoneadores e frugívoros. Tudo é função do bioma, da vegetação,
 * da temperatura e da época do ano: nada fica guardado por tile.
 */
import { Biome } from '../procgen/biomes';

/** Temperatura (K) a partir da qual a mata dá fruto o ano todo (trópico). */
const TROPICAL_K = 293;
/** Abaixo disto não há fruto (frio demais para florescer). */
const FROST_K = 268;

/**
 * Quanto a mata está dando fruto agora (0 a 1). No trópico, o ano todo; na mata temperada,
 * no verão e no outono (fase 0,25 a 0,75 do ano), com um resto no começo do inverno.
 */
export function fruitSeason(temp: number, phase: number): number {
  if (temp < FROST_K) return 0;
  if (temp >= TROPICAL_K) return 1;
  if (phase >= 0.25 && phase < 0.75) return 1;
  return phase >= 0.75 && phase < 0.85 ? 0.3 : 0;
}

/** Parte lenhosa da vegetação (arbusto e árvore, 0 a 1): o que dá ramagem e fruto. */
export function woody(vegetation: number): number {
  return Math.max(0, Math.min(1, (vegetation - 0.25) / 0.5));
}

/** Ramagem e fruto que o tile oferece agora (0 a 1), antes de descontar o que foi comido. */
export function browseOf(vegetation: number, temp: number, phase: number): number {
  const w = woody(vegetation);
  // Folha e broto ficam o ano todo (menos no inverno frio); o fruto vem na estação.
  const leaves = temp < FROST_K ? 0.15 : 0.5;
  return w * (leaves + 0.5 * fruitSeason(temp, phase));
}

export interface Flora {
  /** Planta dominante, como aparece na ficha do tile. */
  name: string;
  /** Está com fruto agora. */
  fruiting: boolean;
}

/** Planta dominante do tile pelo bioma e pela densidade da vegetação (só quando o jogador olha). */
export function floraOf(biome: Biome, vegetation: number, temp: number, phase: number): Flora | null {
  if (vegetation < 0.05) return null;
  const bush = vegetation < 0.4;
  const fruit = woody(vegetation) > 0.2 && fruitSeason(temp, phase) > 0.5;
  const pick = (open: string, shrub: string, trees: string, fruits = fruit): Flora => ({
    name: vegetation < 0.2 ? open : bush ? shrub : trees,
    fruiting: vegetation >= 0.2 && fruits,
  });
  switch (biome) {
    case Biome.Grass:
      return pick('Capim', 'Flores do campo', 'Arbustos de baga');
    case Biome.Forest:
      return pick('Capim', 'Arbustos de baga', temp >= 283 ? 'Carvalhos e árvores frutíferas' : 'Carvalhos');
    case Biome.Taiga:
      return pick('Musgo', 'Mirtilos', 'Pinheiros', fruit && vegetation < 0.4);
    case Biome.Jungle:
      return pick('Samambaias', 'Bananeiras', 'Árvores frutíferas');
    case Biome.Savanna:
      return pick('Capim alto', 'Arbustos espinhosos', 'Acácias');
    case Biome.Desert:
    case Biome.Barren:
      return { name: vegetation < 0.2 ? 'Tufos secos' : 'Cactos', fruiting: false };
    case Biome.Tundra:
    case Biome.Snow:
    case Biome.Ice:
      return { name: vegetation < 0.2 ? 'Líquen' : 'Arbustos anões', fruiting: false };
    case Biome.Swamp:
      return pick('Juncos', 'Juncos e taboas', 'Árvores do brejo', false);
    case Biome.Mangrove:
      return { name: 'Mangue', fruiting: false };
    case Biome.Beach:
      return { name: vegetation < 0.3 ? 'Capim da praia' : 'Coqueiros', fruiting: vegetation >= 0.3 && temp >= TROPICAL_K };
    case Biome.Rock:
    case Biome.Mountain:
    case Biome.Cliff:
      return { name: vegetation < 0.3 ? 'Líquen e musgo' : 'Pinheiros da serra', fruiting: false };
    default:
      return null;
  }
}
