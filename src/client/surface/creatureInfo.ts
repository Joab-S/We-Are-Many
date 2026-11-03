import { elderAge, type Ecosystem, type Village } from '../../sim/ecosystem';
import { CHILD, ROLE, ROLE_NAMES, ROLES, type Role } from '../../sim/roles';
import { animalStage, familyName, personName } from '../../sim/people';
import { dietText, ecologyOf, HUNGRY, STARVING } from '../../sim/fauna';
import { ITEMS, MATERIALS, type Category, type ItemDef, type Material } from '../../sim/items';
import type { Thought } from '../../ai/trace';

/**
 * Dados da ficha de uma criatura (RF-VIDA-335), lidos do ecossistema sob demanda: só a criatura aberta
 * ou sob o mouse passa por aqui, nunca a população inteira. Nada é inventado: o que a simulação não
 * guarda volta vazio (null ou lista vazia) e a ficha esconde ou diz "Desconhecido".
 */

/** Pessoa de espécie inteligente (tem nome, família, personalidade e diário). */
export function isPerson(eco: Ecosystem, i: number): boolean {
  return eco.species[eco.kind[i]].kind === 'sapient';
}

/** Assentamento onde mora, ou null. */
export function homeOf(eco: Ecosystem, i: number): Village | null {
  const vi = eco.village[i];
  return vi >= 0 ? (eco.villages[vi] ?? null) : null;
}

/**
 * Povo que dá o nome à pessoa: o do lugar onde mora; sem lugar, o do lugar de onde veio (memória de origem)
 * ou onde nasceu; sem nenhum, a própria espécie (quem chegou de fora e nunca morou em lugar algum).
 */
export function cultureOf(eco: Ecosystem, i: number): number {
  const v = homeOf(eco, i) ?? eco.villages[eco.origin[i]] ?? eco.villages[eco.bornAt[i]];
  return v ? v.culture.id : eco.kind[i];
}

/** Nome e sobrenome de uma pessoa. */
export function personFullName(eco: Ecosystem, i: number): { first: string; family: string } {
  const c = cultureOf(eco, i);
  return { first: personName(eco.uid[i], c), family: familyName(eco.family[i], c) };
}

export type LifeStage = 'child' | 'adult' | 'elder';

/** Era usada para a idade de idoso: a do lugar; sem lugar, a Idade da Pedra. */
function eraOf(eco: Ecosystem, i: number): number {
  const v = homeOf(eco, i);
  return v ? Math.floor(v.tech) : 0;
}

/**
 * Fase da vida e ofício (RF-VIDA-334). Quem mora num lugar tem profissão (ou é criança); quem vive solto não
 * tem profissão, e a fase vem só da idade. O nome do idoso segue o da seleção: "Líder idoso", "Rei idoso".
 */
export function lifeOf(eco: Ecosystem, i: number): { stage: LifeStage; stageName: string; role: Role | null; label: string } {
  const sp = eco.species[eco.kind[i]];
  const v = homeOf(eco, i);
  const elder = eco.age[i] >= elderAge(sp, eraOf(eco, i));
  if (!v) {
    if (eco.age[i] < sp.maturity) return { stage: 'child', stageName: 'Criança', role: null, label: 'Criança' };
    return elder ? { stage: 'elder', stageName: 'Idoso', role: null, label: 'Idoso' } : { stage: 'adult', stageName: 'Adulto', role: null, label: 'Adulto' };
  }
  const r = eco.role[i];
  if (r === CHILD) return { stage: 'child', stageName: 'Criança', role: null, label: 'Criança' };
  const role = ROLES[r];
  const name = ROLE_NAMES[role];
  if (!elder) return { stage: 'adult', stageName: 'Adulto', role, label: name };
  // Líder e rei seguem no cargo na velhice; os outros param de trabalhar (ver activityOf).
  return r >= ROLE.leader ? { stage: 'elder', stageName: 'Idoso', role, label: `${name} idoso` } : { stage: 'elder', stageName: 'Idoso', role, label: 'Idoso' };
}

/** Energia e saúde (0 a 1). A saúde é a da ficha de sempre: a energia e o peso da idade. */
export function vitalsOf(eco: Ecosystem, i: number): { energy: number; health: number } {
  const sp = eco.species[eco.kind[i]];
  const v = homeOf(eco, i);
  const life = sp.kind === 'sapient' ? sp.maxAge * (1 + 0.12 * Math.floor(v?.tech ?? 0)) : sp.maxAge;
  const old = Math.max(0, (eco.age[i] - life * 0.6) / (life * 0.4));
  const health = Math.max(0, Math.min(1, 0.4 + eco.energy[i] * 0.6) * (1 - 0.7 * Math.min(1, old)));
  return { energy: eco.energy[i], health };
}

/** Indicadores de estado que a simulação já guarda, para a linha de ícones da ficha. */
export interface StatusMark {
  icon: string;
  label: string;
  tone: 'good' | 'warn' | 'bad' | '';
}

export function statusMarks(eco: Ecosystem, i: number): StatusMark[] {
  const out: StatusMark[] = [];
  const e = eco.energy[i];
  // Pessoa procura comida abaixo de 30% (activityOf); bicho tem fome abaixo de HUNGRY e fome crítica abaixo de STARVING.
  if (isPerson(eco, i)) {
    if (e < 0.3) out.push({ icon: '🍖', label: 'Com fome', tone: e < 0.15 ? 'bad' : 'warn' });
  } else if (e < STARVING) out.push({ icon: '🍖', label: 'Com muita fome', tone: 'bad' });
  else if (e < HUNGRY) out.push({ icon: '🍖', label: 'Com fome', tone: 'warn' });
  const p = eco.parasite[i];
  if (p > 0.6) out.push({ icon: '🦠', label: 'Muitos parasitas', tone: 'bad' });
  if (!isPerson(eco, i)) return out;
  const v = homeOf(eco, i);
  if (v && v.leaderUid === eco.uid[i]) out.push({ icon: '👑', label: `Lidera ${v.name}`, tone: 'good' });
  if (eco.expedition.has(i)) out.push({ icon: '⚔️', label: 'Em campanha de guerra', tone: 'warn' });
  if (eco.mounted(i)) out.push({ icon: '🐎', label: 'Montado', tone: '' });
  if (v?.pendingTech?.uid === eco.uid[i]) out.push({ icon: '📜', label: 'Ensinando uma técnica', tone: 'good' });
  if (v && eco.full(v)) {
    // Necessidades do dia (só correm no modo completo, perto da tela).
    if (eco.needRest[i] > 0.75) out.push({ icon: '💤', label: 'Cansado', tone: 'warn' });
    if (eco.needSocial[i] > 0.75) out.push({ icon: '💬', label: 'Sente falta de companhia', tone: 'warn' });
    if (eco.needFaith[i] > 0.75) out.push({ icon: '🕯️', label: 'Quer rezar', tone: 'warn' });
  }
  return out;
}

/** Necessidades do dia (0 a 1, quanto mais alto mais urgente); null fora do modo completo, onde não correm. */
export function needsOf(eco: Ecosystem, i: number): { hunger: number; rest: number; social: number; faith: number } | null {
  const v = homeOf(eco, i);
  if (!v || !eco.full(v) || eco.role[i] === CHILD) return null;
  // A fome é a mesma conta que a escolha do dia usa (journeys.ts, pickDay): cheia com a energia em 25%, nula acima de 75%.
  const hunger = Math.max(0, Math.min(1, (0.75 - eco.energy[i]) / 0.5));
  return { hunger, rest: eco.needRest[i], social: eco.needSocial[i], faith: eco.needFaith[i] };
}

// ---- Equipamento ----------------------------------------------------------------------------------

/** Ordem dos materiais, do mais simples ao melhor. */
const GRADE: Material[] = ['wood', 'stone', 'bronze', 'iron', 'steel', 'gold'];

/** O que cada ofício usa: as peças do catálogo (categoria e ícone) e o improviso quando o reino não tem nenhuma. */
interface Gear {
  category: Category;
  icons: string[];
  /** Sem peça no estoque: o que a pessoa leva feito à mão (pela era, como na ficha de antes). */
  fallback: (era: number) => { name: string; icon: string | null; material: Material | null };
}

const item = (name: string) => ITEMS.find((it) => it.name === name)!;
const plain = (it: ItemDef) => ({ name: it.name, icon: it.icon, material: it.material });

const GEAR: Partial<Record<Role, Gear[]>> = {
  hunter: [{ category: 'arma', icons: ['bow', 'crossbow', 'musket', 'spear'], fallback: (era) => plain(item(era >= 1 ? 'Arco' : 'Lança de pedra')) }],
  farmer: [{ category: 'ferramenta', icons: ['hoe'], fallback: () => plain(item('Enxada de madeira')) }],
  woodcutter: [{ category: 'ferramenta', icons: ['axe'], fallback: () => plain(item('Machado de pedra')) }],
  miner: [{ category: 'ferramenta', icons: ['pickaxe'], fallback: () => ({ name: 'Cunha de pedra', icon: 'pickaxe', material: 'stone' }) }],
  builder: [{ category: 'ferramenta', icons: ['hammer', 'saw'], fallback: () => plain(item('Martelo de pedra')) }],
  blacksmith: [{ category: 'ferramenta', icons: ['hammer'], fallback: () => plain(item('Martelo de pedra')) }],
  fisher: [{ category: 'ferramenta', icons: ['fishingRod'], fallback: () => plain(item('Vara de pesca')) }],
  gatherer: [{ category: 'ferramenta', icons: ['knife'], fallback: () => ({ name: 'Cesto', icon: null, material: null }) }],
  shepherd: [{ category: 'ferramenta', icons: [], fallback: () => ({ name: 'Cajado', icon: null, material: 'wood' }) }],
  soldier: [
    { category: 'arma', icons: ['sword', 'spear', 'axe', 'crossbow', 'musket', 'bow'], fallback: () => ({ name: 'Lança de madeira', icon: 'spear', material: 'wood' }) },
    { category: 'armadura', icons: ['armor', 'helmet', 'shield'], fallback: () => ({ name: '', icon: null, material: null }) },
  ],
  guard: [
    { category: 'arma', icons: ['sword', 'spear', 'axe', 'crossbow', 'musket', 'bow'], fallback: () => ({ name: 'Porrete', icon: null, material: 'wood' }) },
    { category: 'armadura', icons: ['armor', 'helmet', 'shield'], fallback: () => ({ name: '', icon: null, material: null }) },
  ],
  king: [{ category: 'joia', icons: ['crown'], fallback: () => ({ name: '', icon: null, material: null }) }],
};

export interface Equipment {
  name: string;
  /** Ícone do catálogo (art-extra.ts, `item:<icon>`), ou null. */
  icon: string | null;
  material: Material | null;
  category: Category;
  /** De onde vem: uma peça do estoque do reino ou feita à mão, sem peça no estoque. */
  source: 'estoque' | 'improviso';
}

/**
 * O que a pessoa leva, pelo ofício, pela era e pelo estoque do reino. A simulação não dá peças a cada pessoa:
 * o estoque é do reino (`store(v).items`). Então a ficha mostra a melhor peça daquele tipo que o reino tem
 * (o que o ofício usaria), ou o improviso da era quando não tem nenhuma. Criança e quem vive solto não levam nada.
 */
export function equipmentOf(eco: Ecosystem, i: number): Equipment[] {
  const v = homeOf(eco, i);
  if (!v || eco.role[i] === CHILD) return [];
  const gear = GEAR[ROLES[eco.role[i]]];
  if (!gear) return [];
  const st = eco.store(v);
  const era = Math.floor(v.tech);
  const out: Equipment[] = [];
  for (const g of gear) {
    let best: ItemDef | null = null;
    for (const it of ITEMS) {
      if (it.category !== g.category || !g.icons.includes(it.icon) || it.era > era || !((st.items[it.id] ?? 0) > 0)) continue;
      if (!best || GRADE.indexOf(it.material) > GRADE.indexOf(best.material)) best = it;
    }
    if (best) out.push({ name: best.name, icon: best.icon, material: best.material, category: g.category, source: 'estoque' });
    else {
      const f = g.fallback(era);
      if (f.name) out.push({ ...f, category: g.category, source: 'improviso' });
    }
  }
  return out;
}

export function materialColor(m: Material | null): readonly number[] {
  return m ? MATERIALS[m].color : [176, 124, 72];
}

// ---- Família e laços ------------------------------------------------------------------------------

export interface Tie {
  i: number;
  value: number;
}

/** Cônjuge, até 3 amigos e até 3 rivais (IA local, relações), com a força do laço (−100 a 100). */
export function tiesWithValues(eco: Ecosystem, i: number): { partner: Tie | null; friends: Tie[]; rivals: Tie[]; moreFriends: number; moreRivals: number } {
  const t = eco.tiesOf(i);
  const list = eco.bonds.get(eco.uid[i]) ?? [];
  const value = (j: number) => list.find((b) => b.uid === eco.uid[j])?.value ?? 0;
  const tie = (j: number) => ({ i: j, value: value(j) });
  return {
    partner: t.partner >= 0 ? tie(t.partner) : null,
    friends: t.friends.slice(0, 3).map(tie),
    rivals: t.rivals.slice(0, 3).map(tie),
    moreFriends: Math.max(0, t.friends.length - 3),
    moreRivals: Math.max(0, t.rivals.length - 3),
  };
}

// ---- História ------------------------------------------------------------------------------------

export interface LifeEvent {
  /** Ano (inteiro) ou null quando a simulação não sabe. */
  year: number | null;
  icon: string;
  text: string;
  /** Lugar citado, para virar link. */
  village?: number;
}

const THOUGHT_ICONS: Record<Thought['kind'], string> = {
  ofício: '🛠️',
  mudança: '🧳',
  família: '👪',
  amizade: '🤝',
  briga: '😠',
  poder: '👑',
  saber: '📜',
};

export function thoughtIcon(t: Thought): string {
  return THOUGHT_ICONS[t.kind] ?? '✨';
}

/** Diário da pessoa (src/ai/trace.ts), do mais novo para o mais antigo. */
export function diaryOf(eco: Ecosystem, i: number): Thought[] {
  return (eco.diary.get(eco.uid[i]) ?? []).slice().reverse();
}

/**
 * O diário guarda algumas decisões no formato técnico de `explain` ("ir para Ruta (0,01): laços 1,00 · pressão
 * 1,00; depois ficar (0,00)"). Para a ficha, a mesma informação em frase: o que decidiu, o que pesou e a outra opção.
 */
export function thoughtText(text: string): string {
  const m = /^(.+?) \(([\d,]+)\): (.+?)(?:; depois (.+))?$/.exec(text);
  if (!m) return text[0].toUpperCase() + text.slice(1);
  const [, label, , why, next] = m;
  return `Decidiu ${label[0].toLowerCase()}${label.slice(1)}. Pesou: ${why.replace(/ · /g, ', ')}${next ? `. A outra opção era ${next}` : ''}`;
}

/**
 * Linha do tempo com o que a simulação registra: nascimento (lugar e ano) ou chegada de fora, o lugar onde
 * morava antes da última mudança, quando entrou no lugar de agora e as mudanças e cargos anotados no diário.
 */
export function historyOf(eco: Ecosystem, i: number): LifeEvent[] {
  const out: (LifeEvent & { at: number })[] = [];
  const v = homeOf(eco, i);
  const born = eco.bornAt[i] >= 0 ? eco.villages[eco.bornAt[i]] : null;
  const bornYear = Math.floor(eco.bornYear[i]);
  if (born) out.push({ at: -Infinity, year: Math.max(0, bornYear), icon: '🍼', text: `Nasceu em ${born.name}`, village: born.id });
  else out.push({ at: -Infinity, year: bornYear >= 0 ? bornYear : null, icon: '🧭', text: bornYear >= 0 ? `Chegou de fora, nascido por volta do ano ${bornYear}` : 'Chegou de fora, antes do começo da crônica' });
  const moved = eco.movedAt[i] >= 0 ? Math.floor(eco.movedAt[i]) : -1;
  // O lugar de onde veio na última mudança (memória de origem): sem ano próprio, fica logo antes da chegada.
  const from = eco.origin[i] >= 0 ? eco.villages[eco.origin[i]] : null;
  if (from && from !== v && from !== born) out.push({ at: moved >= 0 ? moved - 0.5 : -1e9, year: null, icon: '🏚️', text: `Morou em ${from.name}`, village: from.id });
  if (v && moved >= 0) out.push({ at: moved + 0.1, year: moved, icon: '🏠', text: `Entrou em ${v.name}`, village: v.id });
  for (const t of eco.diary.get(eco.uid[i]) ?? []) if (t.kind === 'mudança' || t.kind === 'poder') out.push({ at: t.year, year: t.year, icon: thoughtIcon(t), text: thoughtText(t.text) });
  return out.sort((a, b) => a.at - b.at).map(({ at, ...e }) => (void at, e));
}

// ---- Animais -------------------------------------------------------------------------------------

export interface AnimalInfo {
  stage: string;
  age: number;
  maxAge: number;
  diet: string;
  /** Carga de parasitas só quando pesa (> 25%). */
  parasites: { name: string; heavy: boolean } | null;
  /** Bando, matilha ou cardume: tamanho (1 = sozinho). */
  group: { name: string; size: number };
  /** Predador mais perto, para quem é presa. */
  threat: { name: string; distance: number } | null;
}

export function animalOf(eco: Ecosystem, i: number): AnimalInfo {
  const sp = eco.species[eco.kind[i]];
  const ecol = ecologyOf(sp);
  const diet = sp.kind === 'fish' ? 'algas e plâncton' : sp.kind === 'shark' && ecol.guild !== 'filtrador' ? 'peixes' : dietText(ecol);
  const load = eco.parasite[i];
  const parasites = load > 0.25 ? { name: ecol.parasite, heavy: load > 0.6 } : null;
  const prey = sp.kind !== 'predator' && sp.kind !== 'shark';
  let near = 0;
  let threat: AnimalInfo['threat'] = null;
  for (const j of eco.pickAll(eco.x[i], eco.y[i], 8)) {
    const o = eco.species[eco.kind[j]];
    const d = Math.hypot(eco.x[j] - eco.x[i], eco.y[j] - eco.y[i]);
    if (eco.kind[j] === eco.kind[i] && d <= 6) near++;
    if (j !== i && prey && (o.kind === 'predator' || o.kind === 'shark' || (eco.wild(eco.kind[j]) && ecologyOf(o).guild === 'predador')) && (!threat || d < threat.distance)) threat = { name: o.name, distance: d };
  }
  // Bicho de terra: o bando de verdade (mesma família, contado nas células da fauna); na água, quem nada junto.
  const herd = eco.wild(eco.kind[i]) ? eco.cells?.herds.get(eco.family[i])?.[3] : undefined;
  const name = sp.kind === 'fish' || sp.kind === 'shark' || ecol.open ? 'cardume' : ecol.pack ? 'matilha' : 'bando';
  return {
    stage: animalStage(eco.age[i], sp.maturity, sp.maxAge),
    age: eco.age[i],
    maxAge: sp.maxAge,
    diet,
    parasites,
    group: { name, size: Math.max(1, herd ?? near) },
    threat,
  };
}
