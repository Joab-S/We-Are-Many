/**
 * Quando sair (proposta de assentamentos 3.2 e 3.3, agente 3B): cada família compara ficar, migrar para
 * um lugar conhecido (`migrar:<vila>`) e fundar num sítio que os batedores viram (`fundar:<sítio>`).
 *
 * - **Ficar** vale a nota do lugar (comida, lenha, casa, estabilidade, guerra), menos a pressão social,
 *   mais os laços que a família tem ali e o apego. Quem chegou há pouco reluta em sair de novo (histerese).
 * - **Migrar** vale a nota do outro lugar (já sem a viagem e a diferença de povo e de reino), a pressão de
 *   lá, os amigos e parentes que moram lá e a afinidade entre os dois lugares; o apego pesa contra.
 * - **Fundar** vale a nota do sítio vazio, mas só acende com a pressão de casa (fissão por pressão, não
 *   por fome) e com a ousadia da família (curiosidade e ambição contra o apego).
 *
 * A pressão social é (pop/DUNBAR)² / (1 + instituições): o tamanho pesa ao quadrado, e as instituições
 * (organização, templo, degrau, reino, escrita e moeda) seguram mais gente junta. Funções puras: o
 * Ecosystem monta o contexto e aplica a escolha (`migrate`, em src/sim/eco/people/migration.ts).
 */
import { MOVE_W } from '../tuning';
import { TRAIT, TRAIT_COUNT, type Trait } from '../traits';
import { choose, curves, type Choice, type Curve, type Option } from '../utility';

/** Um lugar conhecido ao alcance, visto pela família. */
export interface PlaceView {
  /** Id do assentamento. */
  id: number;
  /** Nota do lugar (`placeScore`) já descontadas a viagem e a diferença de povo e de reino. */
  value: number;
  /** Pressão social lá. */
  pressure: number;
  /** Amigos e parentes da família que moram lá. */
  friends: number;
  /** Afinidade entre o lugar de origem e este (−100 a 100). */
  affinity: number;
}

/** Um sítio para fundar, como os batedores o descreveram. */
export interface SiteView {
  /** Posição na lista de sítios do lugar. */
  index: number;
  /** Nota do sítio (`siteValue`). */
  value: number;
}

export interface MoveContext {
  traits: Int8Array;
  /** Adultos da família (índices no array de traços); a família decide pela média deles. */
  adults: number[];
  /** O lugar onde mora: a nota, a pressão, os laços ali e a falta (0 a 1). */
  here: { value: number; pressure: number; friends: number; lack: number };
  places: PlaceView[];
  sites: SiteView[];
  /** Anos desde a última mudança de quem chegou por último (Infinity: nasceu ali). */
  yearsHere: number;
  /** Êxodo: anos de falta, ficar perde o bônus do costume e da histerese. */
  exodus?: boolean;
}

export type MoveAction = { kind: 'stay' } | { kind: 'migrate'; to: number } | { kind: 'found'; site: number };

/** Traço médio dos adultos da família, de −1 a 1. */
export function familyTrait(c: MoveContext, t: Trait): number {
  if (!c.adults.length) return 0;
  let s = 0;
  for (const i of c.adults) s += c.traits[i * TRAIT_COUNT + TRAIT[t]];
  return s / c.adults.length / 10;
}

/** Nota de um lugar na escala da escolha: cada `temper` pontos a menos que `top` dividem por e. */
const soft: Curve = (x) => Math.exp((Math.min(x, MOVE_W.top) - MOVE_W.top) / MOVE_W.temper);
/** Lugar cheio: metade em `crowd`, e cai rápido acima. */
const crowding: Curve = (p) => 1 / (1 + (Math.max(0, p) / MOVE_W.crowd) ** 2);
/** Vontade de fundar pela pressão de casa: em S, com o meio em `fission`. */
const fission: Curve = (p) => 1 / (1 + Math.exp(-MOVE_W.fissionK * (p - MOVE_W.fission)));
/** Laços: amigos e parentes contam um a um; a afinidade de 100 vale `kin` laços. */
const ties = (friends: number, affinity: number) => (friends + (MOVE_W.kin * Math.max(0, affinity)) / 100) / MOVE_W.friendsFull;

/** Histerese (anos desde a mudança): até `settle` pontos a mais para ficar, sumindo em `settleYears`. */
export function settling(yearsHere: number): number {
  return MOVE_W.settle * Math.max(0, 1 - yearsHere / MOVE_W.settleYears);
}

/**
 * Nota de um sítio vazio na escala dos lugares: a base mais a nota do sítio (cheia em `siteFull`), mas no
 * máximo `foundGain` acima da nota de casa. Quem funda leva o enxoval e a experiência de onde veio: um lugar
 * com fome não tem o que dar a uma colônia, e a família com fome vai atrás de um lugar que já existe.
 */
export function foundValue(site: number, home = Infinity): number {
  return Math.min(MOVE_W.foundBase + MOVE_W.foundSite * Math.max(0, Math.min(1, site / MOVE_W.siteFull)), home + MOVE_W.foundGain);
}

/** Nota de ficar: a do lugar, mais o custo de mudar e a histerese (no êxodo, nenhum dos dois: só conta o que o lugar dá). */
export function stayValue(c: MoveContext): number {
  return c.exodus ? c.here.value : c.here.value + MOVE_W.stay + settling(c.yearsHere);
}

function stayOption(): Option<MoveContext, MoveAction> {
  return {
    action: { kind: 'stay' },
    label: 'ficar',
    considerations: [
      { name: 'lugar', input: stayValue, curve: soft },
      { name: 'pressão', input: (c) => c.here.pressure, curve: crowding },
      { name: 'laços', input: (c) => ties(c.here.friends, 100), curve: curves.linear(MOVE_W.lonely, 1) },
      { name: 'apego', input: (c) => familyTrait(c, 'attachment'), curve: curves.trait(MOVE_W.attachment) },
    ],
  };
}

function migrateOption(p: PlaceView): Option<MoveContext, MoveAction> {
  return {
    action: { kind: 'migrate', to: p.id },
    label: `migrar:${p.id}`,
    considerations: [
      { name: 'lugar', input: () => p.value, curve: soft },
      { name: 'pressão', input: () => p.pressure, curve: crowding },
      { name: 'laços', input: () => ties(p.friends, p.affinity), curve: curves.linear(MOVE_W.lonely, 1) },
      { name: 'desapego', input: (c) => -familyTrait(c, 'attachment'), curve: curves.trait(MOVE_W.attachment) },
    ],
  };
}

function foundOption(s: SiteView): Option<MoveContext, MoveAction> {
  return {
    action: { kind: 'found', site: s.index },
    label: `fundar:${s.index}`,
    considerations: [
      { name: 'sítio', input: (c) => foundValue(s.value, c.here.value), curve: soft },
      { name: 'pressão', input: (c) => c.here.pressure, curve: fission },
      { name: 'ousadia', input: (c) => (familyTrait(c, 'curiosity') + familyTrait(c, 'ambition') - familyTrait(c, 'attachment')) / 2, curve: curves.trait(MOVE_W.bold) },
    ],
  };
}

/** As opções da família: ficar, cada lugar conhecido e cada sítio. */
export function moveOptions(c: MoveContext): Option<MoveContext, MoveAction>[] {
  return [stayOption(), ...c.places.map(migrateOption), ...c.sites.map(foundOption)];
}

/**
 * Escolhe entre ficar, migrar e fundar. A faixa vem da paciência média da família: a paciente fica quase
 * sempre com a melhor, a impulsiva varia mais.
 */
export function chooseMove(c: MoveContext, rnd: () => number): Choice<MoveAction> | null {
  const band = Math.max(0.5, Math.min(0.95, MOVE_W.band + 0.1 * familyTrait(c, 'patience')));
  return choose(moveOptions(c), c, rnd, band);
}

/** Porquê da escolha para o diário: "fundar (0,41): pressão 0,93 · sítio 0,62; depois ficar (0,30)". */
export function moveWhy(c: Choice<MoveAction>, name: (a: MoveAction) => string): string {
  const f = (n: number) => n.toFixed(2).replace('.', ',');
  const why = c.pick.factors
    .slice()
    .sort((p, q) => q.value - p.value)
    .slice(0, 3)
    .map((x) => `${x.name} ${f(x.value)}`)
    .join(' · ');
  const next = c.others
    .slice(0, 2)
    .map((o) => `${name(o.action)} (${f(o.score)})`)
    .join(', ');
  return `${name(c.pick.action)} (${f(c.pick.score)}): ${why}${next ? `; depois ${next}` : ''}`;
}
