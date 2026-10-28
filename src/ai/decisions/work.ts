/**
 * Escolha de ofício pela IA (proposta da IA local, "Profissão"): cada ofício disponível no lugar
 * ganha uma nota pela falta que ele atende, por quão cheio já está, pelo jeito da pessoa (traços
 * e aptidão), pela tradição da família e pelo apego ao ofício atual. Substitui o sorteio por era
 * com a correção por falta.
 */
import type { Role } from '../../sim/roles';
import { PROFESSION, ROLE_FIT } from '../tuning';
import { TRAIT, TRAIT_COUNT, TRAIT_INFO, type Trait } from '../traits';
import { choose, curves, type Choice, type Option } from '../utility';

export interface ProfessionContext {
  traits: Int8Array;
  /** Índice da pessoa no array de traços. */
  i: number;
  /** Ofícios que o lugar comporta agora (civis: soldados e guardas são chamados pelo líder). */
  roles: Role[];
  /** Falta de 0 (nada) a 1 (tudo) que cada ofício atende no lugar. */
  demand: (role: Role) => number;
  /** Parte dos adultos do lugar que já está no ofício. */
  share: (role: Role) => number;
  /** Aptidão de 0 a 1 (jeito inato, `aptitudeOf`). */
  aptitude: (role: Role) => number;
  /** Quão comum o ofício é na era e no lugar, de 0 a 1 (o peso do sorteio antigo): ninguém vira moleiro sem moinho. */
  common: (role: Role) => number;
  current?: Role;
  parent?: Role;
  vocation?: Role;
}

/** Quanto os traços da pessoa combinam com o ofício, de −1 a 1. */
export function roleFit(traits: Int8Array, i: number, role: Role): number {
  const prof = ROLE_FIT[role];
  if (!prof) return 0;
  let s = 0;
  let w = 0;
  for (const [t, k] of Object.entries(prof) as [Trait, number][]) {
    s += (traits[i * TRAIT_COUNT + TRAIT[t]] / 10) * k;
    w += Math.abs(k);
  }
  return w ? s / w : 0;
}

const traitOf = (c: ProfessionContext, t: Trait) => c.traits[c.i * TRAIT_COUNT + TRAIT[t]] / 10;

function option(role: Role): Option<ProfessionContext, Role> {
  return {
    action: role,
    label: role,
    considerations: [
      { name: 'falta', input: (c) => c.demand(role), curve: curves.linear(PROFESSION.demandFloor, 1) },
      { name: 'vaga', input: (c) => 1 - c.share(role) / PROFESSION.crowdShare, curve: curves.linear(0.1, 1) },
      { name: 'jeito', input: (c) => (roleFit(c.traits, c.i, role) + 1) / 2, curve: curves.linear(1 - PROFESSION.fitStrength / 2, 1) },
      { name: 'aptidão', input: (c) => c.aptitude(role), curve: curves.linear(0.6, 1) },
      { name: 'era', input: (c) => c.common(role), curve: curves.linear(PROFESSION.commonFloor, 1) },
      {
        name: 'costume',
        input: (c) => {
          let b = 0;
          if (c.current === role) b += PROFESSION.stay * (1 + traitOf(c, 'patience')) / 2;
          if (c.parent === role) b += PROFESSION.tradition * (1 + traitOf(c, 'familism') - traitOf(c, 'curiosity')) / 2;
          if (c.vocation === role) b += PROFESSION.vocation;
          return b;
        },
        curve: (x) => 0.55 + 0.45 * Math.min(1, x),
      },
    ],
  };
}

/** Escolhe o ofício. `band` vem da paciência: impulsivos variam mais. */
export function chooseProfession(c: ProfessionContext, rnd: () => number): Choice<Role> | null {
  const band = 0.75 + 0.15 * traitOf(c, 'patience');
  return choose(c.roles.map(option), c, rnd, band);
}

/** Falta de 0 a 1 a partir do atendimento da necessidade (1 = tudo atendido). */
export function needDemand(met: number): number {
  return Math.max(0, Math.min(1, (1 - met) * PROFESSION.needScale));
}

/** Traço da pessoa que mais combina com o ofício, já como palavra ("corajoso"), se for marcante. */
function fitWord(traits: Int8Array, i: number, role: Role): string {
  const prof = ROLE_FIT[role];
  if (!prof) return '';
  let best = '';
  let top = 0.4;
  for (const [t, k] of Object.entries(prof) as [Trait, number][]) {
    // Só o lado do traço que ajuda no ofício (força alta para o lenhador, pouca sociabilidade para o pastor).
    const v = (traits[i * TRAIT_COUNT + TRAIT[t]] / 10) * Math.sign(k);
    if (v > top) {
      top = v;
      best = k > 0 ? TRAIT_INFO[t].high : TRAIT_INFO[t].low;
    }
  }
  return best;
}

/**
 * Porquê da escolha em português simples, para o diário da pessoa:
 * "o lugar precisava de comida, é corajoso e seguiu o ofício da família".
 */
export function professionReason(c: ProfessionContext, role: Role, needName?: string): string {
  const parts: string[] = [];
  if (needName && c.demand(role) >= 0.4) parts.push(`o lugar precisava de ${needName}`);
  const word = fitWord(c.traits, c.i, role);
  if (word) parts.push(`é ${word}`);
  if (c.aptitude(role) >= 0.8) parts.push('tem jeito para isso');
  if (c.parent === role) parts.push('seguiu o ofício da família');
  else if (c.vocation === role) parts.push('é o forte do lugar');
  if (!parts.length) parts.push(c.share(role) < 0.1 ? 'quase ninguém fazia isso' : 'era o que tinha');
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}` : parts[0];
}

/**
 * Vontade de largar o ofício atual por outro que está faltando (a divisão do trabalho na falta): o jeito,
 * quanto os traços combinam mais com o novo que com o atual, a abertura para mudar e há quanto tempo está no ofício
 * (quem acabou de trocar reluta). Quem tem mais vontade muda primeiro.
 */
export function switchWill(traits: Int8Array, i: number, from: Role, to: Role, aptitude: number, yearsInRole = Infinity): number {
  const t = (k: Trait) => traits[i * TRAIT_COUNT + TRAIT[k]] / 10;
  const settling = Math.max(0, 1 - yearsInRole / PROFESSION.settleYears);
  return (
    aptitude +
    PROFESSION.switchFit * (roleFit(traits, i, to) - roleFit(traits, i, from)) +
    PROFESSION.switchOpen * (t('curiosity') - t('patience')) -
    PROFESSION.settle * settling
  );
}
