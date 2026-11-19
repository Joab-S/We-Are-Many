/**
 * Ícones do HUD (traço de 24 px, cor herdada). Um único sprite SVG é injetado
 * na página e cada ícone vira `<svg class="ic"><use href="#i-nome"/></svg>`.
 */
const PATHS: Record<string, string> = {
  'orbit': '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-20 12 12)"/>',
  'pause': '<path d="M8 5v14M16 5v14"/>',
  'chron': '<path d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2h4M11 9h5M11 13h5M11 17h3"/>',
  'crown': '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
  'homes': '<path d="M3 20v-9l5-4 5 4v9M13 20v-6l4-3 4 3v6M2 20h20M7 20v-4h2v4"/>',
  'paw': '<circle cx="8.5" cy="6.5" r="1.8"/><circle cx="15.5" cy="6.5" r="1.8"/><circle cx="4.5" cy="11.5" r="1.8"/><circle cx="19.5" cy="11.5" r="1.8"/><path d="M12 11.5c-3 0-5.5 4-5.5 6.2 0 1.8 2 2.3 5.5 2.3s5.5-.5 5.5-2.3c0-2.2-2.5-6.2-5.5-6.2z"/>',
  'hammer': '<path d="M13 6l5-3 3 3-3 5M13 6l5 5M13 6l-1.5 1.5M18 11l-1.5 1.5M11.5 7.5l5 5L7 22l-5-5z"/>',
  'gear': '<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  'terrain': '<path d="M2 20l7-12 4 6 3-4 6 10z"/>',
  'cloud': '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/>',
  'leaf': '<path d="M5 19C5 10 11 5 20 5c0 9-5 15-14 15M5 19l8-8"/>',
  'civ': '<path d="M3 9l9-5 9 5M5 9v9M10 9v9M14 9v9M19 9v9M3 20h18"/>',
  'comet': '<circle cx="16" cy="8" r="3.2"/><path d="M13.5 10.5L3 21M14.5 13L8 19.5M11 6.5L4.5 13"/>',
  'hand': '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 5V4a1.5 1.5 0 0 1 3 0v7M14 5.5a1.5 1.5 0 0 1 3 0V12M17 8a1.5 1.5 0 0 1 3 0v6a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-3-5a1.5 1.5 0 0 1 2.5-1.6L8 13"/>',
  'raise': '<path d="M3 20h18M12 16V5M7 10l5-5 5 5"/>',
  'lower': '<path d="M3 4h18M12 8v11M7 14l5 5 5-5"/>',
  'peak': '<path d="M1 20l8-14 5 8 2-3 7 9zM6.5 10.5L9 9l2 2"/>',
  'wave': '<path d="M2 9c2.5-2 5-2 7.5 0s5 2 7.5 0 3.5-1 5 0M2 15c2.5-2 5-2 7.5 0s5 2 7.5 0 3.5-1 5 0"/>',
  'flat': '<path d="M3 17h18M3 12c3 0 4-4 9-4s6 4 9 4"/>',
  'sand': '<path d="M3 18c4-3 14-3 18 0"/><path d="M8 12h.01M13 9.5h.01M17 13h.01M11 14.5h.01M6 15.5h.01" stroke-width="2.6"/>',
  'lake': '<ellipse cx="12" cy="14" rx="9.5" ry="5"/><path d="M8 14c1.3-1 2.7-1 4 0s2.7 1 4 0"/>',
  'broom': '<path d="M20 3l-7.5 8.5M10 10.5l5 4.5-3.5 6.5L3 17zM7 15.5l2.5 3.5"/>',
  'demolish': '<path d="M3 10h18v10H3zM3 15h18M9 10v5M15 15v5M6 10l3-6 3 3 3-4"/>',
  'ore': '<path d="M6 4h12l4 6-10 11L2 10zM2 10h20M9 4l3 6 3-6M12 10v11"/>',
  'temp': '<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0zM12 9v7"/>',
  'rain': '<path d="M7 14h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 5.5 4.3 4.3 0 0 0 7 14zM8 17l-1 3M12 17l-1 3M16 17l-1 3"/>',
  'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  'sprout': '<path d="M12 21v-9M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 14c0-4 3-6 7-6 0 4-3 6-7 6z"/>',
  'tree': '<path d="M12 22v-6M12 2l6 9h-3l4 5H5l4-5H6z"/>',
  'apple': '<path d="M12 7.5c-2-1.5-7-1-7 5 0 5 3 8.5 5 8.5 1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 5-3.5 5-8.5 0-6-5-6.5-7-5zM12 7.5c0-2 1-4 3-4.5"/>',
  'x': '<path d="M6 6l12 12M18 6L6 18"/>',
  'dove': '<path d="M3 12c4 0 6 2 9 2l9-8c-1 6-4 11-10 11-3 0-6-2-8-5zM11 17l-2 4"/>',
  'swords': '<path d="M4 4l11 11M4 4v4M4 4h4M20 4L9 15M20 4v4M20 4h-4M6.5 14.5l3 3M17.5 14.5l-3 3M5 19l2.5-2.5M19 19l-2.5-2.5"/>',
  'fire': '<path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-4 5-4 7-1-1-2-2-2-4-2 2-3 5-3 8 0 5 3 8 7 8z"/>',
  'dice': '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h.01M15 15h.01M15 9h.01M9 15h.01M12 12h.01" stroke-width="2.8"/>',
  'heart': '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
  'bolt': '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  'home': '<path d="M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-5h4v5"/>',
  'users': '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5M16 4.5a3.5 3.5 0 0 1 0 7M18 13.7c2.4.7 4 2.9 4 6.3"/>',
  'eye': '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  'help': '<circle cx="12" cy="12" r="9.5"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7v.5M12 17v.5"/>',
  'planet': '<circle cx="12" cy="12" r="6"/><path d="M5.5 14.5C2 17 2.5 19 6.5 18s9.5-4 12.5-7 2.8-5-.8-4.4"/>',
  'target': '<circle cx="12" cy="12" r="8"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  'alt': '<path d="M2 20l7-11 3 4 2-3 6 10zM18 3v5M16 5l2-2 2 2"/>',
  'drop': '<path d="M12 3s7 7.5 7 12a7 7 0 0 1-14 0c0-4.5 7-12 7-12z"/>',
  'star': '<path d="M12 3l2.6 6 6.4.6-4.8 4.3 1.4 6.3L12 17l-5.6 3.2 1.4-6.3L3 9.6 9.4 9z"/>',
  'warn': '<path d="M12 3l10 18H2zM12 10v5M12 18v.5"/>',
  'skull': '<path d="M5 11a7 7 0 0 1 14 0v4h-2v4H7v-4H5zM10 19v-2M14 19v-2"/><circle cx="9" cy="11" r="1.5"/><circle cx="15" cy="11" r="1.5"/>',
  'flag': '<path d="M5 21V4h12l-2 4 2 4H5"/>',
  'tagn': '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  'grain': '<path d="M12 21V8M12 8c-2-1-3-3-3-5 2 0 3 2 3 5zM12 8c2-1 3-3 3-5-2 0-3 2-3 5zM12 13c-2-1-4-2-4-5 2 0 4 2 4 5zM12 13c2-1 4-2 4-5-2 0-4 2-4 5z"/>',
  'ship': '<path d="M12 2l4 9-4 2-4-2zM8 11l-4 6 5-1M16 11l4 6-5-1M10 15l2 6 2-6"/>',
  'probe': '<path d="M12 2v6M9 8h6l2 6H7zM4 14h16M8 14l-3 7M16 14l3 7"/>',
  'auto': '<circle cx="12" cy="12" r="9"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M9.5 14.5L12 8l2.5 6.5L12 13z"/>',
  'land': '<path d="M12 3v10M8 9l4 4 4-4M4 20h16M7 17h10"/>',
  'chat': '<path d="M4 5h16v11H9l-5 4z"/>',
  'left': '<path d="M15 5l-7 7 7 7"/>',
  'layers': '<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5"/>',
  'coin': '<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6v1.5M12 16.5V18"/>',
  'scale': '<path d="M12 3v18M7 21h10M4 7h16M4 7l-2.5 6a2.5 2.5 0 0 0 5 0zM20 7l-2.5 6a2.5 2.5 0 0 0 5 0z"/>',
  'play': '<path d="M7 5l12 7-12 7z"/>',
  'quake': '<path d="M2 12h4l2-6 3 12 3-9 2 5 2-2h4"/>',
  'volcano': '<path d="M2 21l6-10h8l6 10zM9 11l1-3M15 11l-1-3M11 6c0-2 2-2 2-4"/>',
  'tent': '<path d="M2 20L12 4l10 16zM12 20v-7M9 20l3-7 3 7"/>',
  'save': '<path d="M4 4h13l3 3v13H4zM8 4v6h8V4M8 20v-6h8v6"/>',
  'load': '<path d="M3 6h7l2 2h9v11H3zM12 11v6M9 14l3 3 3-3"/>',
  'new': '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/>',
  'hot': '<path d="M9 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0zM11 9v7M19 9V3M16.5 5.5L19 3l2.5 2.5"/>',
  'cold': '<path d="M9 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0zM11 9v7M19 3v6M16.5 6.5L19 9l2.5-2.5"/>',
  'snow': '<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 4l3 2 3-2M9 20l3-2 3 2"/>',
  'search': '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>',
  'stop': '<rect x="6" y="6" width="12" height="12"/>',
  'lock': '<rect x="5" y="11" width="14" height="10"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  'chevu': '<path d="M5 15l7-7 7 7"/>',
  'cruise': '<path d="M5 6l7 6-7 6M12 6l7 6-7 6"/>',
  'scan': '<circle cx="12" cy="12" r="9"/><path d="M12 12L19 7M12 3v4M3 12h4"/>',
  'route': '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
};

export type IconName = keyof typeof PATHS;

export function iconSprite(): string {
  const symbols = Object.entries(PATHS).map(([n, p]) => `<symbol id="i-${n}" viewBox="0 0 24 24">${p}</symbol>`).join('');
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${symbols}</defs></svg>`;
}

export function icon(name: string, cls = ''): string {
  return PATHS[name] ? `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>` : '';
}

export function hasIcon(name: string): boolean {
  return name in PATHS;
}

export function mountIcons(): void {
  if (document.getElementById('hud-icons')) return;
  const host = document.createElement('div');
  host.id = 'hud-icons';
  host.innerHTML = iconSprite();
  document.body.appendChild(host);
}
