/**
 * Ficar, migrar ou fundar, no mundo agregado (o pacote Mudança, 9, na escala de uma família por ano):
 *
 * - **Ficar** vale a nota do lugar (comida, lenha, casa, estabilidade, guerra), menos a pressão social, mais os
 *   laços que a família tem ali e o apego. Quem chegou há pouco reluta em sair de novo (histerese).
 * - **Migrar** vale a nota do outro lugar (já sem a viagem e a diferença de povo e de reino), a pressão de lá,
 *   os amigos e parentes que moram lá e a afinidade entre os dois lugares; o apego pesa contra.
 * - **Fundar** vale a nota do sítio vazio, mas só acende com a pressão de casa (fissão por pressão, não por
 *   fome) e com a ousadia da família (curiosidade e ambição contra o apego).
 *
 * As formas que o IAUS não tem (a exponencial da nota e a queda da lotação) vão calculadas no stat, com a
 * curva identidade; a vontade de fundar pela pressão é uma logística normalizada na faixa da pressão.
 */
import { c, pacote } from '../dsl';
import { curva, type Curva } from '../curvas';
import { E } from '../entradas';
import { TRAIT, TRAIT_COUNT, type Trait } from '../pessoa/traits';
import { WOT } from '../vocab';
import { MOVE_W } from './ajustes';
import { Decisor, explain, type Choice } from './decisor';

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
const soft = (x: number) => Math.exp((Math.min(x, MOVE_W.top) - MOVE_W.top) / MOVE_W.temper);
/** Lugar cheio: metade em `crowd`, e cai rápido acima. */
const crowding = (p: number) => 1 / (1 + (Math.max(0, p) / MOVE_W.crowd) ** 2);
/** A pressão vai de 0 a FISSION_RANGE (RangeMax); a logística do IAUS é a mesma em x = pressão / FISSION_RANGE. */
const FISSION_RANGE = 8;
const fissao = (): Curva => ({ ...curva.limiar(MOVE_W.fission / FISSION_RANGE, MOVE_W.fissionK * FISSION_RANGE), min: 0, max: FISSION_RANGE });
/** Laços: amigos e parentes contam um a um; a afinidade de 100 vale `kin` laços. */
const ties = (friends: number, affinity: number) => (friends + (MOVE_W.kin * Math.max(0, affinity)) / 100) / MOVE_W.friendsFull;
/** A ousadia soma três traços e passa de 1: a entrada do traço vai de −1,5 a 1,5. */
const BOLD_RANGE = 1.5;

/** Histerese (anos desde a mudança): até `settle` pontos a mais para ficar, sumindo em `settleYears`. */
export function settling(yearsHere: number): number {
  return MOVE_W.settle * Math.max(0, 1 - yearsHere / MOVE_W.settleYears);
}

/**
 * Nota de um sítio vazio na escala dos lugares: a base mais a nota do sítio (cheia em `siteFull`), mas no
 * máximo `foundGain` acima da nota de casa (um lugar com fome não tem o que dar a uma colônia).
 */
export function foundValue(site: number, home = Infinity): number {
  return Math.min(MOVE_W.foundBase + MOVE_W.foundSite * Math.max(0, Math.min(1, site / MOVE_W.siteFull)), home + MOVE_W.foundGain);
}

/** Nota de ficar: a do lugar, mais o custo de mudar e a histerese (no êxodo, só conta o que o lugar dá). */
export function stayValue(c: MoveContext): number {
  return c.exodus ? c.here.value : c.here.value + MOVE_W.stay + settling(c.yearsHere);
}

const ACT = { stay: 0, migrate: 1, found: 2 } as const;

/** Pacote 33: ficar (Self), migrar (por lugar) e fundar (por sítio). */
export const MUDANCA_DO_ANO = pacote(
  { id: 33, nome: 'Mudança do ano', camada: 'Lugar', descricao: 'Mundo agregado: cada família compara ficar, migrar para um lugar conhecido e fundar num sítio vazio.' },
  [
    {
      nome: 'Ficar onde mora (família)',
      descricao: 'A nota do lugar com o custo de mudar e a histerese, a lotação, os laços ali e o apego.',
      tipo: 'Ficar',
      contexto: 'eu',
      considera: [
        c('lugar', E.eu, curva.sobe(), { stat: 'lugar' }),
        c('pressão', E.eu, curva.sobe(), { stat: 'lotacao' }),
        c('laços', E.eu, curva.sobe(MOVE_W.lonely, 1), { stat: 'lacos' }),
        c('apego', E.eu, curva.traco(MOVE_W.attachment), { stat: 'tr.attachment' }),
      ],
    },
    {
      nome: 'Migrar para um lugar conhecido',
      descricao: 'A nota do outro lugar, a lotação de lá, os amigos e parentes lá e a afinidade; o apego pesa contra.',
      tipo: 'MudarSe',
      contexto: 'alvo',
      alvos: [WOT.assentamento],
      considera: [
        c('lugar', E.alvo, curva.sobe(), { stat: 'lugar' }),
        c('pressão', E.alvo, curva.sobe(), { stat: 'lotacao' }),
        c('laços', E.alvo, curva.sobe(MOVE_W.lonely, 1), { stat: 'lacos' }),
        c('desapego', E.eu, curva.traco(MOVE_W.attachment), { stat: 'desapego' }),
      ],
    },
    {
      nome: 'Fundar num sítio vazio',
      descricao: 'A nota do sítio (no máximo um pouco acima da de casa), a pressão de casa (fissão) e a ousadia.',
      tipo: 'Fundar',
      contexto: 'alvo',
      alvos: [WOT.sitio],
      considera: [
        c('sítio', E.alvo, curva.sobe(), { stat: 'sitio' }),
        c('pressão', E.eu, fissao(), { stat: 'pressao' }),
        c('ousadia', E.eu, curva.traco(MOVE_W.bold, BOLD_RANGE), { stat: 'ousadia' }),
      ],
    },
  ],
);

let decisor: Decisor | null = null;

/** Escolhe entre ficar, migrar e fundar. A faixa vem da paciência média da família. */
export function chooseMove(c: MoveContext, rnd: () => number): Choice<MoveAction> | null {
  const band = Math.max(0.5, Math.min(0.95, MOVE_W.band + 0.1 * familyTrait(c, 'patience')));
  const apego = familyTrait(c, 'attachment');
  decisor ??= new Decisor(MUDANCA_DO_ANO);
  return decisor.decidir<MoveAction>(
    {
      lugar: soft(stayValue(c)),
      lotacao: crowding(c.here.pressure),
      lacos: ties(c.here.friends, 100),
      'tr.attachment': apego,
      desapego: -apego,
      pressao: c.here.pressure,
      ousadia: (familyTrait(c, 'curiosity') + familyTrait(c, 'ambition') - apego) / 2,
    },
    [
      { comportamento: ACT.stay, acao: { kind: 'stay' }, rotulo: 'ficar' },
      ...c.places.map((p) => ({
        comportamento: ACT.migrate,
        acao: { kind: 'migrate', to: p.id } as MoveAction,
        rotulo: `migrar:${p.id}`,
        alvo: { lugar: soft(p.value), lotacao: crowding(p.pressure), lacos: ties(p.friends, p.affinity) },
      })),
      ...c.sites.map((s) => ({
        comportamento: ACT.found,
        acao: { kind: 'found', site: s.index } as MoveAction,
        rotulo: `fundar:${s.index}`,
        alvo: { sitio: soft(foundValue(s.value, c.here.value)) },
      })),
    ],
    rnd,
    band,
  );
}

/** Porquê da escolha para o diário: "fundar (0,41): pressão 0,93 · sítio 0,62; depois ficar (0,30)". */
export function moveWhy(c: Choice<MoveAction>, name: (a: MoveAction) => string): string {
  return explain(c, (s) => name(s.action));
}
