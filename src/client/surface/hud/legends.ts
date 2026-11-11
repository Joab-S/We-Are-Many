import { POLITY_NAMES } from '../../../sim/community';
import { eventVillages, isOfRealm, type DisasterKind, type LegendEntry } from '../../../sim/api/events';
import { TECH_BY_ID } from '../../../sim/progress';
import { TIER_NAMES } from '../../../sim/settlement';
import { ERAS } from '../../../sim/ecosystem';
import type { WarMotive } from '../../../sim/eco/types';

/** O que a janela Lendas lê do mundo: serve o motor e a vista dele, sem depender de nenhum dos dois. */
export interface LegendsSource {
  readonly legends: readonly LegendEntry[];
  readonly legendsLost: number;
  readonly year: number;
  readonly villages: readonly { readonly id: number; readonly name: string; readonly x: number; readonly y: number; readonly abandoned?: boolean; readonly kingdom: number }[];
  readonly species: readonly { readonly name: string }[];
}

const DISASTERS: Record<DisasterKind, string> = {
  comet: 'Cometa',
  quake: 'Terremoto',
  volcano: 'Vulcão',
  island: 'Ilha nova',
  fire: 'Incêndio',
  drought: 'Seca',
  plague: 'Praga',
  wildfire: 'Fogo no campo',
  epidemic: 'Epidemia',
  engulfed: 'Lugar tragado',
};

const MOTIVES: Record<WarMotive, string> = {
  loot: 'saque',
  land: 'terra',
  dominion: 'domínio',
  revenge: 'vingança',
  faith: 'fé',
  extermination: 'extermínio',
  civil: 'guerra civil',
};

const ICONS: Record<LegendEntry['kind'], string> = {
  found: '🏘',
  fission: '🏘',
  circumscribed: '⛰',
  exodus: '🚶',
  abandon: '🏚',
  merge: '🏘',
  tierUp: '🏛',
  tierDown: '🏚',
  polity: '👑',
  era: '⭐',
  tech: '⭐',
  warStart: '⚔',
  warEnd: '🕊',
  conquest: '⚔',
  revolt: '🔥',
  independence: '🚩',
  annex: '🤝',
  disaster: '🌋',
  extinction: '💀',
  species: '🐾',
};

/** Os que aparecem altos na linha do tempo: o que muda quem manda ou como se vive. */
const MAJOR = new Set<LegendEntry['kind']>(['polity', 'era', 'warStart', 'conquest', 'independence', 'extinction']);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A lenda em português. Os lugares vão pelo nome de hoje: um id nunca é reaproveitado, nem depois de abandonado. */
export function legendText(e: LegendEntry, src: Pick<LegendsSource, 'villages' | 'species'>): string {
  const n = (id: number) => src.villages[id]?.name ?? '?';
  switch (e.kind) {
    case 'found':
      return `${n(e.village)} foi fundado${e.from >= 0 ? ` por gente de ${n(e.from)}` : ''} (${e.how})`;
    case 'fission':
      return `${n(e.from)} cresceu demais: ${plural(e.people, 'pessoa')} partiram e fundaram ${n(e.to)}`;
    case 'circumscribed':
      return `${n(e.village)} ficou sem terra livre para crescer, depois de ${plural(e.years, 'ano')} de aperto`;
    case 'exodus':
      return `Êxodo em ${n(e.village)}: falta de ${e.lack}`;
    case 'abandon':
      return `${n(e.village)} ficou vazio${e.to >= 0 ? `; os últimos foram para ${n(e.to)}` : ''}`;
    case 'merge':
      return `${n(e.village)} virou bairro de ${n(e.into)}`;
    case 'tierUp':
      return `${n(e.village)} virou ${TIER_NAMES[e.tier].toLowerCase()}`;
    case 'tierDown':
      return `${n(e.village)} encolheu e voltou a ser ${TIER_NAMES[e.tier].toLowerCase()}`;
    case 'polity':
      return `${n(e.village)} virou ${POLITY_NAMES[e.polity].toLowerCase()}, com ${plural(e.places, 'lugar').replace('lugars', 'lugares')}`;
    case 'era':
      return `${n(e.village)} entrou na era ${ERAS[e.era]}${e.first ? ', antes de todos no mundo' : ''}`;
    case 'tech':
      return `${n(e.village)} aprendeu ${TECH_BY_ID[e.tech]?.name ?? e.tech}, antes de todos no mundo`;
    case 'warStart':
      return `Guerra: ${n(e.a)} atacou ${n(e.target)}, de ${n(e.b)}${e.naval ? ', pelo mar' : ''} (${MOTIVES[e.motive]})`;
    case 'warEnd':
      return `Fim da guerra de ${n(e.a)} contra ${n(e.b)}, depois de ${plural(e.years, 'ano')}`;
    case 'conquest':
      return e.razed ? `${n(e.winner)} arrasou ${n(e.village)}, de ${n(e.loser)}` : `${n(e.winner)} tomou ${n(e.village)} de ${n(e.loser)}`;
    case 'revolt':
      return `${n(e.village)} se revoltou contra ${n(e.against)} (${e.cause === 'stability' ? 'falta' : 'lealdade no chão'})`;
    case 'independence':
      return `${n(e.village)} se separou de ${n(e.from)} e virou capital`;
    case 'annex':
      return e.from >= 0 ? `${n(e.village)} trocou ${n(e.from)} por ${n(e.to)}, em paz` : `${n(e.village)} se juntou a ${n(e.to)}, em paz`;
    case 'disaster':
      return `${DISASTERS[e.what]}${e.village >= 0 ? ` em ${n(e.village)}` : ''}`;
    case 'extinction':
      return `${src.species[e.species]?.name ?? '?'} sumiu do planeta`;
    case 'species':
      return `${src.species[e.species]?.name ?? '?'} apareceu no planeta`;
  }
}

/** As lendas de um filtro, do ano 0 até agora: '' tudo, `realm:<id>` um reino, `place:<id>` um lugar. */
export function legendsOf(legends: readonly LegendEntry[], filter: string): LegendEntry[] {
  const id = Number(filter.slice(filter.indexOf(':') + 1));
  if (filter.startsWith('realm:')) return legends.filter((e) => isOfRealm(e, id));
  if (filter.startsWith('place:')) return legends.filter((e) => eventVillages(e).includes(id));
  return legends.slice();
}

/** Linhas por janela, e riscos na linha do tempo: mais que isso custaria caro refazer a cada 600 ms. */
const MAX_ROWS = 300;
const MAX_TICKS = 400;

function timeline(list: readonly LegendEntry[], year: number): string {
  const span = Math.max(1, year);
  const step = Math.max(1, Math.ceil(list.length / MAX_TICKS));
  const ticks = list
    .filter((e, i) => MAJOR.has(e.kind) || i % step === 0)
    .slice(-MAX_TICKS)
    .map((e) => `<i class="${MAJOR.has(e.kind) ? 'major' : ''}" style="left:${((100 * e.year) / span).toFixed(2)}%"></i>`)
    .join('');
  return `<div class="wb-ltl" data-ltl>${ticks}</div><div class="wb-ltl-ends"><span>ano 0</span><span>ano ${Math.floor(year)}</span></div>`;
}

/** Os reinos com história, os mais movimentados primeiro; † o que não é mais capital ou ficou vazio. */
function realmChips(src: LegendsSource, filter: string): string {
  const count = new Map<number, number>();
  for (const e of src.legends) if (e.realm >= 0) count.set(e.realm, (count.get(e.realm) ?? 0) + 1);
  return [...count]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 24)
    .map(([id, n]) => {
      const v = src.villages[id];
      const gone = !v || v.abandoned || v.kingdom !== id;
      return `<button data-filter="realm:${id}" class="${filter === `realm:${id}` ? 'on' : ''}">${v?.name ?? '?'}${gone ? ' †' : ''} · ${n}</button>`;
    })
    .join('');
}

/** Os lugares que aparecem na história de um reino, para ver a de um só. */
function placeChips(src: LegendsSource, list: readonly LegendEntry[], filter: string): string {
  const seen = new Set<number>();
  for (const e of list) for (const id of eventVillages(e)) seen.add(id);
  return [...seen]
    .slice(0, 40)
    .map((id) => `<button data-filter="place:${id}" class="${filter === `place:${id}` ? 'on' : ''}">${src.villages[id]?.name ?? '?'}</button>`)
    .join('');
}

export function legendsHtml(src: LegendsSource, filter: string): string {
  const list = legendsOf(src.legends, filter);
  const shown = list.slice(-MAX_ROWS);
  const rows = shown
    .map((e) => {
      const v = eventVillages(e).map((id) => src.villages[id])[0];
      const where = v ? ` data-go="${v.x.toFixed(1)},${v.y.toFixed(1)}"` : '';
      return `<button class="wb-row ${MAJOR.has(e.kind) ? 'major' : ''}"${where}><i>${ICONS[e.kind]}</i><span class="wb-yr">${Math.floor(e.year)}</span>${legendText(e, src)}</button>`;
    })
    .join('');
  const realm = filter.startsWith('realm:') ? list : null;
  const cut = list.length - shown.length;
  return `
    <div class="wb-filters"><button data-filter="" class="${filter === '' ? 'on' : ''}">Tudo</button>${realmChips(src, filter)}</div>
    ${realm ? `<div class="wb-filters">${placeChips(src, realm, filter)}</div>` : ''}
    ${timeline(list, src.year)}
    <div class="wb-list" data-legends>${rows || '<div class="wb-empty">Nada registrado ainda.</div>'}</div>
    <div class="wb-note">
      ${plural(list.length, 'lenda')} do ano 0 até agora${cut ? `; aqui as ${shown.length} mais recentes, e o resto na exportação` : ''}.
      ${src.legendsLost ? `As ${src.legendsLost} mais antigas já saíram do registro.` : ''}
      † é reino que acabou.
      <button class="wb-btn" data-legends-json>Exportar JSON</button>
    </div>`;
}

/** O que a exportação leva: cada lenda com o dado cru e o texto, do filtro que estava na tela. */
export function legendsJson(src: LegendsSource, filter: string, planet: { id: string; name: string }): string {
  return JSON.stringify(
    {
      planet: planet.id,
      name: planet.name,
      year: src.year,
      filter,
      lost: src.legendsLost,
      legends: legendsOf(src.legends, filter).map((e) => ({ ...e, text: legendText(e, src) })),
    },
    null,
    1,
  );
}

export function downloadLegends(src: LegendsSource, filter: string, planet: { id: string; name: string }): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([legendsJson(src, filter, planet)], { type: 'application/json' }));
  link.download = `lendas-${planet.id}-ano-${Math.floor(src.year)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}
