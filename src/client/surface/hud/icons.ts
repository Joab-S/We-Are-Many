import { icon as svgIcon, hasIcon } from '../../ui/icons';
import { CREST_EMBLEMS, CREST_SHAPES } from '../../../sim/architecture';
import type { Village } from '../../../sim/ecosystem';
import { SPRITES } from '../art';
import type { SpriteAtlas } from '../sprites';
import { ORE_SWATCH, TOOL_ICONS, type Tool } from '../tools';

/** Ícones de sprite, brasões e ícones de ferramenta, guardados por chave (Flyweight). */
export class IconCache {
  private readonly icons = new Map<string, string>();
  private readonly crests = new Map<string, string>();

  constructor(private readonly atlas: SpriteAtlas) {}

  /** Ícone de sprite como imagem (para botões e janelas). */
  icon(name: string, tint: readonly number[] = [200, 200, 200], skin: readonly number[] = tint): string {
    const key = `${name}|${tint.join(',')}|${skin.join(',')}`;
    let url = this.icons.get(key);
    if (!url) {
      url = SPRITES[name] ? this.atlas.tinted(name, tint, skin).toDataURL() : '';
      this.icons.set(key, url);
    }
    return url ? `<img class="wb-px" src="${url}" alt="">` : '';
  }

  /**
   * Brasão do reino (RF-VIDA-288): escudo na cor do reino com a forma pelo
   * valor do povo e o emblema da vocação da capital.
   */
  crest(k: Village): string {
    const key = `${k.color.join(',')}|${k.culture.value}|${k.vocation ?? ''}`;
    let url = this.crests.get(key);
    if (!url) {
      const c = document.createElement('canvas');
      c.width = 11;
      c.height = 13;
      const g = c.getContext('2d')!;
      const shape = CREST_SHAPES[k.culture.value] ?? 'round';
      const inside = (x: number, y: number) => {
        if (shape === 'square') return y < 11;
        if (shape === 'banner') return y < 10 || (y < 13 && Math.abs(x - 5) >= y - 9);
        if (shape === 'pointed') return y < 7 || Math.abs(x - 5) <= 12 - y - 1;
        return y < 7 || (x - 5) ** 2 + (y - 6) ** 2 <= 30;
      };
      const [r, gr, b] = k.color;
      for (let y = 0; y < 13; y++) {
        for (let x = 0; x < 11; x++) {
          if (!inside(x, y)) continue;
          const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1) || x === 0 || x === 10 || y === 0;
          g.fillStyle = edge ? '#241a14' : x > 6 ? `rgb(${(r * 0.7) | 0},${(gr * 0.7) | 0},${(b * 0.7) | 0})` : `rgb(${r},${gr},${b})`;
          g.fillRect(x, y, 1, 1);
        }
      }
      const emblem = k.vocation ? CREST_EMBLEMS[k.vocation] : [];
      g.fillStyle = '#f1e8d4';
      emblem.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && g.fillRect(x + 3, y + 2, 1, 1)));
      url = c.toDataURL();
      this.crests.set(key, url);
    }
    return `<img class="wb-crest" src="${url}" alt="" title="Brasão do reino de ${k.name}">`;
  }

  toolIcon(t: Tool): string {
    const svg = TOOL_ICONS[t.id];
    if (svg && hasIcon(svg)) return svgIcon(svg);
    if (t.id.startsWith('ore:')) return `<span class="wb-ore" style="background:${ORE_SWATCH[t.id.slice(4)] ?? '#888'}"></span>`;
    return t.icon.startsWith('sprite:') ? this.icon(t.icon.slice(7), t.tint, t.skin) : `<span>${t.icon}</span>`;
  }
}
