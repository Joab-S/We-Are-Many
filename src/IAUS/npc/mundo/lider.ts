/**
 * Quem lidera, no mundo agregado: quando o lugar fica sem líder, o povo escolhe entre os adultos pelo carisma,
 * pela ambição (quem quer se candidata), pela idade e pelos amigos; num reino, o herdeiro do rei morto leva
 * vantagem grande. É a eleição do pacote Cidadania (14: candidatar-se e votar) resumida numa escolha.
 */
import { c, pacote } from '../dsl';
import { curva } from '../curvas';
import { E } from '../entradas';
import { TRAIT, TRAIT_COUNT, TRAIT_INFO, type Trait } from '../pessoa/traits';
import { WOT } from '../vocab';
import { LEADER } from './ajustes';
import { Decisor, type Choice } from './decisor';

export interface Candidate {
  i: number;
  /** Na idade boa para liderar (adulto e ainda não idoso). */
  prime: boolean;
  /** Amigos no lugar. */
  friends: number;
  /** Filho ou cônjuge do líder anterior. */
  heir: boolean;
}

export interface LeaderContext {
  traits: Int8Array;
  /** Reino com rei: o herdeiro conta muito mais. */
  crown: boolean;
}

const t = (traits: Int8Array, i: number, k: Trait) => traits[i * TRAIT_COUNT + TRAIT[k]] / 10;

/** Pacote 32: a escolha do líder, pontuada por candidato (cada candidato é um alvo). */
export const LIDER_DO_LUGAR = pacote(
  { id: 32, nome: 'Líder do lugar', camada: 'Sociedade', descricao: 'Mundo agregado: o lugar sem líder escolhe um entre os adultos (ou o herdeiro, num reino).' },
  [
    {
      nome: 'Escolher quem lidera',
      descricao: 'Carisma, ambição, idade boa, amigos no lugar e, num reino, ser herdeiro.',
      tipo: 'Votar',
      contexto: 'alvo',
      alvos: [WOT.pessoa],
      considera: [
        c('carisma', E.alvo, curva.traco(LEADER.charisma), { stat: 'tr.charisma' }),
        c('ambição', E.alvo, curva.traco(LEADER.ambition), { stat: 'tr.ambition' }),
        c('idade', E.alvo, curva.sobe(LEADER.oldAge, 1), { stat: 'idadeBoa' }),
        c('amigos', E.alvo, curva.sobe(LEADER.noFriends, 1), { stat: 'amigos' }),
        c('herdeiro', E.alvo, curva.sobe(LEADER.commoner, 1), { stat: 'herdeiro' }),
      ],
    },
  ],
);

let decisor: Decisor | null = null;

/** Escolhe o líder entre os candidatos; o povo quase sempre fica com um dos melhores. */
export function chooseLeader(ctx: LeaderContext, cands: Candidate[], rnd: () => number): Choice<number> | null {
  decisor ??= new Decisor(LIDER_DO_LUGAR);
  return decisor.decidir(
    {},
    cands.map((x) => ({
      comportamento: 0,
      acao: x.i,
      rotulo: String(x.i),
      alvo: {
        'tr.charisma': t(ctx.traits, x.i, 'charisma'),
        'tr.ambition': t(ctx.traits, x.i, 'ambition'),
        idadeBoa: x.prime ? 1 : 0,
        amigos: x.friends / LEADER.friendsFull,
        herdeiro: x.heir ? 1 : ctx.crown ? 0 : 0.5,
      },
    })),
    rnd,
    LEADER.band,
  );
}

/** Porquê da escolha, para o diário e a crônica: "carismático e com muitos amigos". */
export function leaderReason(traits: Int8Array, c: Candidate, crown: boolean): string {
  if (c.heir && crown) return 'herdou a coroa';
  const parts: string[] = [];
  if (t(traits, c.i, 'charisma') >= 0.4) parts.push(TRAIT_INFO.charisma.high);
  if (t(traits, c.i, 'ambition') >= 0.4) parts.push(TRAIT_INFO.ambition.high);
  if (c.friends >= LEADER.friendsFull) parts.push('com muitos amigos');
  if (c.heir) parts.push('da família do líder');
  if (!parts.length) parts.push('o povo confiou');
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}` : parts[0];
}

/** Temperamento do líder para a guerra, de −1 (pacífico) a 1 (belicoso): agressividade e ambição contra gentileza e paciência. */
export function rulerTemper(traits: Int8Array, i: number): number {
  const v = LEADER.aggression * t(traits, i, 'aggression') + LEADER.ambitionWar * t(traits, i, 'ambition') - LEADER.kindness * t(traits, i, 'kindness') - LEADER.patience * t(traits, i, 'patience');
  return Math.max(-1, Math.min(1, v));
}
