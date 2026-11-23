import type { MenteDebug } from '../../../sim/api/debug';
import { fichaGenerativaHtml } from '../debugMente';
import type { DayNote, Ecosystem, MindLive, NoteFactor, NoteTarget } from '../../../sim/ecosystem';
import { ROLE_NAMES, ROLES } from '../../../sim/roles';
import { aptitudeOf, bestCraft, TECH_BY_ID } from '../../../sim/progress';
import { notable, TRAIT, TRAIT_INFO, TRAITS, TRAIT_COUNT, type Trait } from '../../../IAUS/npc/pessoa/traits';
import { DEATH_TEXT } from '../../../sim/people';
import { installPixelArt } from '../../ui/pixelArt';
import { pixelIcon, pixelize } from '../../ui/pixelIcons';
import { ROLE_ICONS } from '../settlementWindow';
import { bodyOf, spriteOf } from '../tools';
import { humanPortrait } from '../SpriteCollector';
import {
  animalOf,
  diaryOf,
  equipmentOf,
  historyOf,
  homeOf,
  isPerson,
  lifeOf,
  materialColor,
  needsOf,
  personFullName,
  statusMarks,
  thoughtIcon,
  thoughtText,
  tiesWithValues,
  vitalsOf,
  type Tie,
} from '../creatureInfo';
import type { Selection } from '../selection';
import type { IconCache } from './icons';
import { HtmlSlot, HudComponent } from './component';

/** Abas da ficha, cada uma com um tipo de informação. Cada criatura mostra só as que têm conteúdo para ela. */
export type SheetTab = 'overview' | 'status' | 'personality' | 'family' | 'diary' | 'journey' | 'history' | 'gear' | 'nature';

const TAB_INFO: Record<SheetTab, { label: string; icon: string }> = {
  overview: { label: 'Resumo', icon: 'person' },
  status: { label: 'Condição e necessidades', icon: 'heart' },
  personality: { label: 'Personalidade', icon: 'sparkle' },
  family: { label: 'Família e laços', icon: 'group' },
  diary: { label: 'Pensamentos recentes', icon: 'thought' },
  journey: { label: 'Mente e decisão', icon: 'compass' },
  history: { label: 'História de vida', icon: 'scroll' },
  gear: { label: 'Equipamento', icon: 'sword' },
  nature: { label: 'Vida selvagem', icon: 'leaf' },
};

/**
 * Cada consideração da escolha do dia (src/IAUS/npc/mundo/jornada.ts) em palavras de gente: o ícone, a frase de quando
 * ela favoreceu a opção (`pro`), a de quando a derrubou (`con`) e o traço de personalidade de que depende, se houver.
 */
const FACTOR: Record<string, { icon: string; pro: string; con: string; trait?: Trait }> = {
  prioridade: { icon: 'flag', pro: 'é importante para o lugar agora', con: 'não é urgente para o lugar', trait: 'diligence' },
  ofício: { icon: 'hammer', pro: 'é do seu ofício', con: 'não é do seu ofício' },
  perto: { icon: 'pin', pro: 'fica perto', con: 'fica longe', trait: 'diligence' },
  amigos: { icon: 'smile', pro: 'amigos também vão', con: 'nenhum amigo vai junto', trait: 'sociability' },
  fome: { icon: 'meat', pro: 'está com fome', con: 'não está com fome' },
  cansaço: { icon: 'rest', pro: 'está cansado', con: 'não está cansado' },
  disposição: { icon: 'bolt', pro: 'o jeito dele pede uma pausa', con: 'é trabalhador demais para parar', trait: 'diligence' },
  solidão: { icon: 'chat', pro: 'sente falta de companhia', con: 'não sente falta de companhia' },
  sociável: { icon: 'smile', pro: 'gosta de companhia', con: 'prefere ficar sozinho', trait: 'sociability' },
  fé: { icon: 'candle', pro: 'sente vontade de rezar', con: 'não sente vontade de rezar' },
  devoto: { icon: 'candle', pro: 'é devoto', con: 'não é muito devoto', trait: 'faith' },
  // As considerações da mente da aldeia (src/IAUS/npc/aldeia/pacotes.ts).
  falta: { icon: 'flag', pro: 'o lugar precisa disso', con: 'o lugar já tem o bastante' },
  urgente: { icon: 'warn', pro: 'é urgente', con: 'pode esperar' },
  vaga: { icon: 'group', pro: 'ainda cabe gente', con: 'já tem gente demais' },
  safra: { icon: 'wheat', pro: 'a roça tem o que colher', con: 'a roça não tem o que colher' },
  diligente: { icon: 'hammer', pro: 'gosta de trabalhar', con: 'não é muito trabalhador', trait: 'diligence' },
  alimentado: { icon: 'meat', pro: 'está alimentado', con: 'está com fome' },
  descansado: { icon: 'rest', pro: 'está descansado', con: 'está cansado' },
  'mãos livres': { icon: 'bag', pro: 'está com as mãos livres', con: 'está carregando algo' },
  carga: { icon: 'bag', pro: 'está carregando algo', con: 'não carrega nada' },
  'mão cheia': { icon: 'bag', pro: 'a carga está cheia', con: 'ainda cabe mais na carga' },
  'cabe na mão': { icon: 'axe', pro: 'ainda cabe lenha na mão', con: 'a mão já está cheia' },
  'cabe no armazém': { icon: 'house', pro: 'cabe no armazém', con: 'o armazém está cheio' },
  'carga cheia': { icon: 'bag', pro: 'há uma carga inteira no pátio', con: 'no pátio há pouca coisa' },
  'caça sobrando': { icon: 'paw', pro: 'há caça de sobra', con: 'a caça está rara' },
  'tem comida': { icon: 'cake', pro: 'tem comida lá', con: 'não tem comida lá' },
  'celeiro vazio': { icon: 'cake', pro: 'o celeiro está vazio', con: 'o celeiro tem comida' },
  'sem casa': { icon: 'tent', pro: 'não tem casa', con: 'tem casa' },
  alarme: { icon: 'warn', pro: 'o alarme tocou', con: 'está tudo calmo' },
  medo: { icon: 'shield', pro: 'tem medo', con: 'é corajoso', trait: 'courage' },
  coragem: { icon: 'sword', pro: 'é corajoso', con: 'tem medo', trait: 'courage' },
  laço: { icon: 'heart', pro: 'gosta dessa pessoa', con: 'não é próximo dessa pessoa' },
  livre: { icon: 'chat', pro: 'a pessoa está livre', con: 'a pessoa está ocupada' },
  gente: { icon: 'group', pro: 'tem gente lá', con: 'não tem ninguém lá' },
  festa: { icon: 'star', pro: 'tem festa', con: 'não tem festa' },
  caravana: { icon: 'coin', pro: 'chegou uma caravana', con: 'não há caravana' },
  curioso: { icon: 'magnifier', pro: 'é curioso', con: 'não é curioso', trait: 'curiosity' },
  enterro: { icon: 'skull', pro: 'morreu alguém da família', con: 'ninguém da família morreu' },
  caseiro: { icon: 'house', pro: 'gosta de ficar em casa', con: 'não liga de ficar em casa', trait: 'familism' },
  'à toa': { icon: 'hourglass', pro: 'não tem nada melhor a fazer', con: 'tem coisa melhor a fazer' },
  'vontade de brincar': { icon: 'child', pro: 'quer brincar', con: 'não quer brincar' },
  'pai ou mãe': { icon: 'person', pro: 'é o pai ou a mãe', con: 'não é da família' },
  'de dia': { icon: 'hourglass', pro: 'é hora de trabalhar', con: 'já é noite' },
  // A rotina da aldeia (src/IAUS/npc/aldeia/rotina.ts).
  folga: { icon: 'hourglass', pro: 'o turno de trabalho acabou', con: 'ainda é hora de trabalhar' },
  'fim de tarde': { icon: 'chat', pro: 'é fim de tarde', con: 'não é fim de tarde' },
  acordado: { icon: 'eye', pro: 'é dia', con: 'é madrugada' },
  'à noite': { icon: 'rest', pro: 'é noite', con: 'ainda não é noite' },
  anoitecer: { icon: 'rest', pro: 'está anoitecendo', con: 'não é a hora' },
  'fome leve': { icon: 'meat', pro: 'está com um pouco de fome', con: 'a fome não é essa' },
  apetite: { icon: 'meat', pro: 'tem apetite', con: 'está sem fome' },
  'a vida pesa': { icon: 'rest', pro: 'está cansado da vida', con: 'está bem disposto' },
  'celeiro baixo': { icon: 'cake', pro: 'o celeiro está baixo', con: 'o celeiro está cheio' },
  'celeiro tem': { icon: 'cake', pro: 'o celeiro tem comida', con: 'o celeiro está vazio' },
  'sem falta de gente': { icon: 'chat', pro: 'não sente falta de ninguém', con: 'sente falta de gente' },
  'sem sono': { icon: 'eye', pro: 'está sem sono', con: 'está com sono' },
  // O andarilho (src/IAUS/npc/aldeia/andarilho.ts).
  'vontade de gente': { icon: 'chat', pro: 'sente falta do seu povo', con: 'não sente falta de gente' },
  'sabe onde ir': { icon: 'flag', pro: 'sabe onde fica o seu povo', con: 'não sabe onde fica o seu povo' },
  'não sabe onde ir': { icon: 'flag', pro: 'não sabe onde fica o seu povo', con: 'já sabe para onde ir' },
  'calor e cansaço': { icon: 'rest', pro: 'está cansado da caminhada', con: 'está bem disposto' },
  'longe dele': { icon: 'person', pro: 'o outro ainda está longe', con: 'já estão juntos' },
  'aqui não serve': { icon: 'flag', pro: 'onde está não dá para viver', con: 'onde está já serve' },
  'em grupo': { icon: 'person', pro: 'tem gente bastante junto', con: 'ainda falta gente para fundar' },
  'lugar bom': { icon: 'flag', pro: 'o lugar serve para viver', con: 'o lugar não serve para viver' },
  'alguém com fome': { icon: 'meat', pro: 'alguém perto está com fome', con: 'ninguém perto passa fome' },
  'comida na mão': { icon: 'meat', pro: 'tem comida na mão', con: 'não tem comida na mão' },
  'um pouco cansado': { icon: 'rest', pro: 'está um pouco cansado', con: 'não precisa de pausa' },
  verde: { icon: 'leaf', pro: 'o mato ali está verde', con: 'o mato ali está seco' },
  amigo: { icon: 'smile', pro: 'é um amigo', con: 'não é amigo' },
  rival: { icon: 'angry', pro: 'é um rival', con: 'não é rival' },
  parceiro: { icon: 'heart', pro: 'é o seu par', con: 'não é o seu par' },
  filho: { icon: 'child', pro: 'é o seu filho', con: 'não é o seu filho' },
  família: { icon: 'house', pro: 'é da família', con: 'não é da família' },
  criança: { icon: 'child', pro: 'é uma criança', con: 'não é criança' },
  idoso: { icon: 'elder', pro: 'é um idoso', con: 'não é idoso' },
  adulto: { icon: 'person', pro: 'é adulto', con: 'não é adulto' },
  fraco: { icon: 'warn', pro: 'está fraco', con: 'está forte' },
  sozinho: { icon: 'chat', pro: 'está sozinho', con: 'tem companhia' },
  cansado: { icon: 'rest', pro: 'está cansado', con: 'está descansado' },
  colega: { icon: 'hammer', pro: 'é do mesmo ofício', con: 'é de outro ofício' },
  trabalhando: { icon: 'hammer', pro: 'está trabalhando', con: 'está à toa' },
  'gosta muito': { icon: 'heart', pro: 'gosta muito dessa pessoa', con: 'não gosta tanto' },
  'mal conhece': { icon: 'person', pro: 'mal conhece essa pessoa', con: 'já conhece bem' },
  'não gosta': { icon: 'angry', pro: 'não gosta dessa pessoa', con: 'gosta dessa pessoa' },
  'não é par': { icon: 'heart', pro: 'ainda não é o seu par', con: 'já é o seu par' },
  'não é parente': { icon: 'house', pro: 'não é parente', con: 'é parente' },
  bondoso: { icon: 'heart', pro: 'é bondoso', con: 'não é muito bondoso', trait: 'kindness' },
  gentil: { icon: 'heart', pro: 'é gentil', con: 'não é muito gentil', trait: 'kindness' },
  prestativo: { icon: 'heart', pro: 'é prestativo', con: 'não é muito prestativo', trait: 'kindness' },
  paciente: { icon: 'hourglass', pro: 'é paciente', con: 'é impaciente', trait: 'patience' },
  impaciente: { icon: 'hourglass', pro: 'é impaciente', con: 'é paciente', trait: 'patience' },
  inquieto: { icon: 'bolt', pro: 'é inquieto', con: 'é calmo', trait: 'patience' },
  agitado: { icon: 'bolt', pro: 'é agitado', con: 'é calmo', trait: 'patience' },
  carismático: { icon: 'star', pro: 'é carismático', con: 'não tem muito carisma', trait: 'charisma' },
  falante: { icon: 'chat', pro: 'gosta de falar', con: 'fala pouco', trait: 'sociability' },
  reservado: { icon: 'chat', pro: 'é reservado', con: 'gosta de gente', trait: 'sociability' },
  briguento: { icon: 'angry', pro: 'é briguento', con: 'é pacífico', trait: 'aggression' },
  bravo: { icon: 'angry', pro: 'é bravo', con: 'é calmo', trait: 'aggression' },
  brava: { icon: 'angry', pro: 'é brava', con: 'é calma', trait: 'aggression' },
  levada: { icon: 'angry', pro: 'é levada', con: 'é comportada', trait: 'aggression' },
  curiosa: { icon: 'magnifier', pro: 'é curiosa', con: 'não é curiosa', trait: 'curiosity' },
  ambicioso: { icon: 'crown', pro: 'é ambicioso', con: 'não é ambicioso', trait: 'ambition' },
  ganancioso: { icon: 'coin', pro: 'é ganancioso', con: 'não liga para bens', trait: 'greed' },
  guloso: { icon: 'meat', pro: 'é guloso', con: 'come pouco', trait: 'greed' },
  apegado: { icon: 'heart', pro: 'é apegado', con: 'é independente', trait: 'attachment' },
  carinhoso: { icon: 'heart', pro: 'é carinhoso', con: 'é seco', trait: 'familism' },
  familiar: { icon: 'house', pro: 'liga muito para a família', con: 'não liga muito para a família', trait: 'familism' },
  corajoso: { icon: 'sword', pro: 'é corajoso', con: 'tem medo', trait: 'courage' },
  ousado: { icon: 'sword', pro: 'é ousado', con: 'é tímido', trait: 'courage' },
  medroso: { icon: 'shield', pro: 'é medroso', con: 'é corajoso', trait: 'courage' },
  forte: { icon: 'sword', pro: 'é forte', con: 'é fraco', trait: 'strength' },
  jeitoso: { icon: 'hammer', pro: 'tem jeito com as mãos', con: 'não tem jeito com as mãos', trait: 'dexterity' },
  leal: { icon: 'shield', pro: 'é leal', con: 'não é muito leal', trait: 'loyalty' },
  preguiça: { icon: 'rest', pro: 'é preguiçoso', con: 'é trabalhador', trait: 'diligence' },
  variar: { icon: 'sparkle', pro: 'faz tempo que não faz isso', con: 'já faz isso há muito tempo e quer variar' },
  sono: { icon: 'rest', pro: 'está com sono', con: 'não está com sono' },
  'vontade de conversar': { icon: 'chat', pro: 'quer companhia', con: 'não quer companhia agora' },
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = (f: number) => `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`;
const num = (n: number) => n.toFixed(2).replace('.', ',');
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const tone = (f: number) => (f >= 0.7 ? 'good' : f >= 0.4 ? 'warn' : 'bad');
const years = (n: number) => `${Math.floor(n)} ${Math.floor(n) === 1 ? 'ano' : 'anos'}`;

/**
 * Ofício ou fase em uma etiqueta curta: "⛏️ Minerador", "👑 Líder idoso", "👴 Idoso" (quem parou de trabalhar),
 * "🧒 Criança" ou "Adulto · sem profissão" (quem vive solto).
 */
function jobLabel(life: ReturnType<typeof lifeOf>): string {
  if (life.stage === 'child') return '🧒 Criança';
  if (!life.role) return `${life.stageName} · sem profissão`;
  if (life.stage === 'elder' && life.label === 'Idoso') return '👴 Idoso';
  return `${ROLE_ICONS[life.role]} ${life.label}`;
}

/** Barra com ícone, rótulo e valor (necessidades, progresso). */
function meter(label: string, frac: number, text: string, t = tone(frac), ic = '', hint = ''): string {
  const f = Math.max(0, Math.min(1, frac));
  return `<div class="cs-meter ${t}" title="${esc(hint || `${label}: ${text}`)}">${ic ? `<span class="cs-mi">${ic}</span>` : ''}<span class="cs-ml">${label}</span><span class="cs-mb"><i style="width:${(f * 100).toFixed(0)}%"></i><em>${text}</em></span></div>`;
}

/** Barra de status do cabeçalho (ícone e cápsula com o valor dentro; o rótulo fica na dica). */
function vital(label: string, frac: number, text: string, t = tone(frac), ic = ''): string {
  const f = Math.max(0, Math.min(1, frac));
  return `<div class="cs-vital ${t}" title="${esc(label)}: ${esc(text)}">${ic}<span class="cs-mb"><i style="width:${(f * 100).toFixed(0)}%"></i><em>${text}</em></span></div>`;
}

/** Cor do título: a do povo (ou da espécie), clareada para ler sobre a placa preta. */
function titleColor(rgb: readonly number[]): string {
  const [r, g, b] = rgb.map((c) => Math.round(c + (255 - c) * 0.4));
  return `rgb(${r},${g},${b})`;
}

/** Necessidade do dia (0 a 1): quanto mais cheia, mais urgente. */
const need = (label: string, f: number, ic: string, hint: string) => meter(label, f, pct(f), f > 0.75 ? 'bad' : f > 0.5 ? 'warn' : 'good', ic, hint);

/** Linha rótulo à esquerda, valor à direita. */
const row = (label: string, value: string, ic = '') => `<div class="cs-row"><span>${ic ? `<i>${ic}</i>` : ''}${label}</span><b>${value}</b></div>`;
/** Medalha de ícone, valor e rótulo (a grade de atributos das referências). */
const tile = (ic: string, value: string, label: string, t = '') => `<span class="cs-tile ${t}" title="${esc(label)}"><i>${ic}</i><span><b>${value}</b><em>${label}</em></span></span>`;
const section = (title: string) => `<div class="cs-sec"><span>${title}</span></div>`;
const empty = (text: string) => `<div class="cs-empty">${text}</div>`;
const now = (eco: Ecosystem, i: number) => `<div class="cs-now">${pixelIcon('play')}<span>Agora: <b>${esc(eco.activityOf(i))}</b></span></div>`;
/** A linha do pensamento na prévia do mouse: a ação de agora e o motivo principal (ou só a ação, fora da aldeia). */
function thought(eco: Ecosystem, i: number): string {
  if (!homeOf(eco, i)) return now(eco, i);
  const { d, act } = doing(eco, i);
  const top = d.note?.factors?.find((f) => f.value >= 0.5);
  const why = top ? FACTOR[top.name]?.pro ?? top.name : '';
  return `<div class="cs-now think">${pixelIcon('thought')}<span><b>${esc(cap(act))}</b>${why ? `<em>porque ${esc(why)}</em>` : ''}</span></div>`;
}
/** O que a pessoa faz agora e a decisão por trás, lidos juntos (a mente da ficha e o resumo usam os dois). */
const doing = (eco: Ecosystem, i: number) => ({ d: eco.dayOf(i), act: eco.activityOf(i), live: eco.mindLive(i), past: eco.mindHistory(i), hour: eco.hourOf(), year: eco.year, span: eco.yearSpan, find: (u: number) => eco.findUid(u), kindName: (j: number) => eco.species[eco.kind[j]].name });
type Doing = ReturnType<typeof doing>;
/** A hora do dia na tela, com o que ela pede (o cérebro vê o mesmo: noite em casa, fim de tarde de conversa). */
const clock = (h: number) => {
  const hr = Math.floor(h * 24);
  const [ic, what] = hr >= 21 || hr < 4 ? ['rest', 'noite'] : hr >= 17 ? ['chat', 'fim de tarde'] : hr < 6 ? ['sparkle', 'amanhecer'] : ['hammer', 'hora de trabalhar'];
  return `<span class="cs-clock" title="Hora do dia na aldeia: ${what}. De noite quase todos dormem; no fim da tarde o trabalho para e a conversa sobe.">${pixelIcon(ic)}${String(hr).padStart(2, '0')}h</span>`;
};
/** Tempo de jogo curto: "12 s", "2 min". */
const secs = (s: number) => (s < 60 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`);
/** Alvos das ações da aldeia (os tipos de src/IAUS/npc/vocab.ts) em palavras. */
const TARGET: Record<string, { name: string }> = {
  celeiro: { name: 'o celeiro' },
  casa: { name: 'a casa' },
  praca: { name: 'a praça' },
  templo: { name: 'o templo' },
  posto: { name: 'o posto do ofício' },
  roca: { name: 'a roça' },
  carga: { name: 'a carga do pátio' },
  obra: { name: 'a obra' },
  arvore: { name: 'uma árvore' },
  arbusto: { name: 'o mato' },
  agua: { name: 'a beira d\'água' },
  assentamento: { name: 'o lugar do seu povo' },
  sitio: { name: 'um lugar para viver' },
  animal: { name: 'a caça' },
  pessoa: { name: 'uma pessoa' },
  portao: { name: 'o portão' },
  evento: { name: 'o evento' },
};
const WOT_PESSOA = 'pessoa';
/** Como uma ação acabou, no histórico. */
const END = {
  feito: { icon: 'check', label: 'terminou', cls: 'ok' },
  falhou: { icon: 'x', label: 'falhou', cls: 'bad' },
  trocou: { icon: 'chevron', label: 'trocou no meio', cls: 'mid' },
} as const;
/**
 * A curva de resposta de uma consideração em miniatura (x e y de 0 a 1): a linha da curva, a guia vertical na
 * entrada de agora e o ponto onde ela cai na curva. É o "por que este fator deu tanto" da conta.
 */
function curvePlot(shape: number[], x: number, y: number): string {
  const W = 56;
  const H = 22;
  const n = shape.length - 1;
  const pts = shape.map((v, k) => `${((k / n) * W).toFixed(1)},${(H - v * H).toFixed(1)}`).join(' ');
  const cx = (Math.max(0, Math.min(1, x)) * W).toFixed(1);
  const cy = (H - Math.max(0, Math.min(1, y)) * H).toFixed(1);
  return `<svg class="cs-curve" viewBox="-2 -2 ${W + 4} ${H + 4}" width="${W}" height="${H}" aria-hidden="true"><path d="M0 ${H}H${W}" class="ax"/><polyline points="${pts}"/><path d="M${cx} ${H}V${cy}" class="gd"/><circle cx="${cx}" cy="${cy}" r="2.6"/></svg>`;
}

/** "a, b e c". */
const andList = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}` : (xs[0] ?? ''));

/**
 * Ficha completa de uma criatura (RF-VIDA-335): janela no meio da tela, aberta com o clique e fixada, com
 * abas verticais. Também mostra a ficha de grupo (Shift + arrastar, RF-VIDA-336). Só a criatura aberta é
 * lida, a cada `interval`; cada parte (cabeça, abas, corpo, rodapé) só reescreve o DOM quando mudou.
 */
export class CreatureSheet extends HudComponent {
  tab: SheetTab = 'overview';
  private readonly title: HtmlSlot;
  private readonly head: HtmlSlot;
  private readonly tabs: HtmlSlot;
  private readonly body: HtmlSlot;
  private readonly foot: HtmlSlot;
  /** Quem estava aberto no último quadro, para voltar a rolagem ao topo quando troca. */
  private shown = '';
  /** Última cor escrita na placa do título (só mexe no DOM quando muda). */
  private titleTint = '';
  /** Detalhes abertos na ficha (as linhas da disputa, a conta, a explicação), pela chave. */
  private readonly open = new Set<string>();
  /** Decisão do histórico que está sendo lida (`null` = a atual). */
  private pickAt: number | null = null;
  /** Mouse em cima do corpo: a mente para de se reescrever enquanto o jogador lê. */
  private hover = false;
  /** Congelada pelo botão de cadeado (fica parada até soltar). */
  private locked = false;
  /** Atualização pedida pelo jogador (clique, troca de aba): passa por cima do congelamento. */
  private forcing = false;

  constructor(
    private readonly el: HTMLElement,
    private readonly sel: Selection,
    private readonly icons: IconCache,
    private readonly host: { say(text: string): void; mente?(i: number): MenteDebug | null },
  ) {
    super(250);
    installPixelArt();
    el.innerHTML = pixelize(`
      <div class="cs-frame">
        <div class="cs-head" data-cs-head></div>
        <div class="cs-plaque" data-cs-title></div>
        <button class="cs-close" data-sheet-close title="Fechar (Esc)" aria-label="Fechar">${pixelIcon('x')}</button>
        <nav class="cs-tabs" data-cs-tabs></nav>
        <div class="cs-rtabs"><span class="cs-rtab" title="Ficha fixada: clique no vazio ou Esc solta">${pixelIcon('pin')}</span></div>
        <div class="cs-body" data-cs-body></div>
        <div class="cs-foot" data-cs-foot></div>
      </div>`);
    const q = (s: string) => el.querySelector<HTMLElement>(s)!;
    this.title = new HtmlSlot(q('[data-cs-title]'));
    this.head = new HtmlSlot(q('[data-cs-head]'));
    this.tabs = new HtmlSlot(q('[data-cs-tabs]'));
    this.body = new HtmlSlot(q('[data-cs-body]'));
    this.foot = new HtmlSlot(q('[data-cs-foot]'));
    const body = this.body.el;
    body.addEventListener('mouseenter', () => (this.hover = true));
    body.addEventListener('mouseleave', () => (this.hover = false));
  }

  /** A mente fica parada enquanto o jogador lê (mouse em cima ou cadeado). */
  private get held(): boolean {
    return this.tab === 'journey' && (this.hover || this.locked) && !this.forcing;
  }

  /** Troca de aba sem esperar o intervalo (os dados já estão no ecossistema; só o corpo é refeito). */
  setTab(eco: Ecosystem, tab: SheetTab): void {
    this.tab = tab;
    this.body.el.scrollTop = 0;
    this.refresh(eco);
  }

  refresh(eco: Ecosystem): void {
    this.forcing = true;
    try {
      this.tick(eco, performance.now(), true);
    } finally {
      this.forcing = false;
    }
  }

  protected update(eco: Ecosystem): void {
    const pin = this.sel.pinned;
    const el = this.el;
    if (pin && 'group' in pin) {
      this.show(eco, `g:${pin.group.length}`);
      this.groupSheet(eco, pin.set);
      return;
    }
    if (!pin || !('creature' in pin)) {
      el.hidden = true;
      this.shown = '';
      return;
    }
    const i = this.sel.resolve();
    if (i < 0) {
      // Morreu (ou partiu num barco): avisa com a causa e a idade e solta a ficha (RF-VIDA-333).
      const d = eco.deaths.find((x) => x.uid === pin.uid);
      const who = this.sel.lastName ?? 'Quem você acompanhava';
      if (d) {
        const cause = DEATH_TEXT[d.cause];
        this.host.say(`☠ ${who} morreu${cause ? ` ${cause}` : ''} aos ${Math.floor(d.age)} anos${this.sel.follow ? ' · a câmera parou de seguir' : ''}`);
      } else this.host.say(`${who} saiu de vista (embarcou ou partiu)`);
      this.sel.unpin();
      return;
    }
    this.show(eco, `c:${pin.uid}`);
    const person = isPerson(eco, i);
    this.sel.lastName = person ? personFullName(eco, i).first : eco.species[eco.kind[i]].name;
    const tabs = this.tabsFor(eco, i);
    if (!tabs.includes(this.tab)) this.tab = tabs[0];
    el.classList.toggle('docked', this.sel.follow);
    this.setTitle(this.titleOf(eco, i), this.titleRgb(eco, i));
    this.head.set(pixelize(this.headHtml(eco, i)));
    this.tabs.set(this.tabsHtml(tabs, person));
    const held = person && this.held;
    if (!held) this.setBody(person ? this.personTab(eco, i) : this.animalTab(eco, i));
    const mind = person && this.tab === 'journey';
    const lock = mind
      ? `<button class="cs-btn sm ${this.locked ? 'on' : ''}" data-cs-x="lock" title="Congela a mente para ler com calma (clique de novo para voltar ao vivo)">${pixelIcon(this.locked ? 'play' : 'hourglass')}<span>${this.locked ? 'Ao vivo' : 'Congelar'}</span></button>`
      : '';
    const hint = held
      ? `<span class="cs-hold" title="${this.locked ? 'A mente está congelada: clique em Ao vivo para voltar' : 'A mente para de se atualizar enquanto o mouse está em cima, para dar tempo de ler'}">${pixelIcon('hourglass')}${this.locked ? 'Congelada' : 'Pausada'}</span>`
      : '<span class="cs-hint">Clique no vazio ou Esc para soltar</span>';
    this.foot.set(
      pixelize(`<button class="cs-btn ${this.sel.follow ? 'on' : ''}" data-act="follow" title="A câmera acompanha a criatura (F)">${pixelIcon(this.sel.follow ? 'x' : 'eye')}<span>${this.sel.follow ? 'Parar de seguir' : 'Seguir'}</span><kbd>F</kbd></button>
       ${lock}${hint}`),
    );
  }

  /** Mostra a janela; ao trocar de criatura, a rolagem volta ao topo. */
  private show(eco: Ecosystem, key: string): void {
    void eco;
    this.el.hidden = false;
    if (key !== this.shown) {
      this.shown = key;
      this.open.clear();
      this.pickAt = null;
      this.locked = false;
      this.body.el.scrollTop = 0;
    }
  }

  /** Reescreve o corpo mantendo a rolagem (o corpo muda a cada atualização: energia, atividade). */
  private setBody(html: string): void {
    const top = this.body.el.scrollTop;
    if (this.body.set(pixelize(html))) this.body.el.scrollTop = top;
  }

  /** Abas que fazem sentido para a criatura: as de pessoa só para pessoas, e nenhuma aba vazia. */
  private tabsFor(eco: Ecosystem, i: number): SheetTab[] {
    if (!isPerson(eco, i)) return ['overview', 'nature'];
    // A mente vem logo depois do resumo: é o que mais se consulta para entender o comportamento.
    const out: SheetTab[] = ['overview', 'journey', 'status', 'personality'];
    const fam = eco.familyOf(i);
    const t = eco.tiesOf(i);
    if (fam.parent >= 0 || fam.children.length || t.partner >= 0 || t.friends.length || t.rivals.length) out.push('family');
    if (eco.diary.get(eco.uid[i])?.length) out.push('diary');
    out.push('history');
    if (equipmentOf(eco, i).length) out.push('gear');
    return out;
  }

  private tabsHtml(tabs: SheetTab[], person: boolean): string {
    return tabs
      .map((t) => {
        const label = t === 'overview' && !person ? 'Resumo do animal' : TAB_INFO[t].label;
        const icon = t === 'overview' && !person ? 'paw' : TAB_INFO[t].icon;
        return `<button class="cs-tab ${t === this.tab ? 'on' : ''}" data-ctab="${t}" aria-label="${label}" aria-pressed="${t === this.tab}">${pixelIcon(icon)}<span class="cs-tip">${label}</span></button>`;
      })
      .join('');
  }

  /** Retrato em pixel art: o sprite que anda no mapa, na cor do lugar e da espécie. */
  portrait(eco: Ecosystem, i: number): string {
    const sp = eco.species[eco.kind[i]];
    if (!isPerson(eco, i)) return this.icons.icon(spriteOf(sp), sp.color);
    const v = homeOf(eco, i);
    // Humanos: o mesmo quadro, gênero, pele e cabelo de quem anda no mapa.
    if (bodyOf(sp) === 'human') {
      const { name, person } = humanPortrait(eco, i);
      return this.icons.icon(name, v ? v.color : sp.color, person.skin, person.hair);
    }
    const life = lifeOf(eco, i);
    const look = life.stage === 'child' ? 'child' : life.stage === 'elder' && (!life.role || ROLES.indexOf(life.role) < ROLES.indexOf('leader')) ? 'elder' : (life.role ?? 'gatherer');
    return this.icons.icon(`${bodyOf(sp)}:${look}`, v ? v.color : sp.color, sp.color);
  }

  /** Nome na placa do título. */
  private titleOf(eco: Ecosystem, i: number): string {
    if (!isPerson(eco, i)) return eco.species[eco.kind[i]].name;
    const n = personFullName(eco, i);
    return `${n.first} ${n.family}`;
  }

  /** Cor da placa: a do povo de quem mora num lugar, senão a da espécie. */
  private titleRgb(eco: Ecosystem, i: number): readonly number[] {
    return (isPerson(eco, i) ? homeOf(eco, i)?.color : null) ?? eco.species[eco.kind[i]].color;
  }

  private setTitle(text: string, rgb?: readonly number[]): void {
    this.title.set(`<span>${esc(text)}</span>`);
    const tint = rgb ? titleColor(rgb) : '';
    if (tint !== this.titleTint) {
      this.titleTint = tint;
      if (tint) this.title.el.style.setProperty('--title', tint);
      else this.title.el.style.removeProperty('--title');
    }
  }

  /** Cabeçalho: retrato, o que é (espécie e ofício ou fase), os estados em ícones e as barras de saúde e energia (sempre à vista). */
  private headHtml(eco: Ecosystem, i: number): string {
    const sp = eco.species[eco.kind[i]];
    let sub: string;
    if (isPerson(eco, i)) sub = `${sp.name} · ${jobLabel(lifeOf(eco, i))}`;
    else {
      const a = animalOf(eco, i);
      sub = `${cap(a.stage)} · ${years(a.age)}`;
    }
    const marks = statusMarks(eco, i);
    const icons = marks.map((s) => `<span class="cs-hm ${s.tone}" title="${esc(s.label)}">${s.icon}</span>`).join('');
    return `<div class="cs-portrait">${this.portrait(eco, i)}</div>
      <div class="cs-hslot"><span>${esc(sub)}</span></div>
      <div class="cs-hslot ${marks.length ? '' : 'dim'}">${icons || '<span>Nenhum estado especial</span>'}</div>
      ${this.vitals(eco, i)}`;
  }

  // ---- Pessoas -----------------------------------------------------------------------------------

  private personTab(eco: Ecosystem, i: number): string {
    switch (this.tab) {
      case 'status':
        return this.personStatus(eco, i);
      case 'personality':
        return this.personPersonality(eco, i);
      case 'family':
        return this.personFamily(eco, i);
      case 'diary':
        return this.personDiary(eco, i);
      case 'journey':
        return this.personJourney(eco, i);
      case 'history':
        return this.personHistory(eco, i);
      case 'gear':
        return this.personGear(eco, i);
      default:
        return this.personOverview(eco, i);
    }
  }

  /** Link para a ficha de outra pessoa. */
  private who(eco: Ecosystem, j: number): string {
    const n = personFullName(eco, j);
    return `<button class="cs-link" data-uid="${eco.uid[j]}" title="Abrir a ficha">${esc(n.first)}</button>`;
  }

  private marks(eco: Ecosystem, i: number): string {
    const m = statusMarks(eco, i);
    return m.length ? `<div class="cs-marks">${m.map((s) => `<span class="cs-mark ${s.tone}" title="${esc(s.label)}">${s.icon}<em>${esc(s.label)}</em></span>`).join('')}</div>` : '';
  }

  private vitals(eco: Ecosystem, i: number): string {
    const v = vitalsOf(eco, i);
    return `<div class="cs-vitals">${vital('Saúde', v.health, pct(v.health), tone(v.health), '❤')}${vital('Energia', v.energy, pct(v.energy), tone(v.energy), '⚡')}</div>`;
  }

  /** Cartão do lugar onde mora (clicável, abre a janela do assentamento), ou "Sem assentamento". */
  private placeCard(eco: Ecosystem, i: number): string {
    const v = homeOf(eco, i);
    if (!v) return `<div class="cs-place none"><i>${pixelIcon('tent')}</i><span><b>Sem assentamento</b><em>Vive solto, sem lugar nem profissão</em></span></div>`;
    const king = eco.villages[v.kingdom];
    const polity = v.kingdom !== v.id ? eco.polityName(v) : null;
    return `<button class="cs-place" data-village="${v.id}" title="Abrir a janela de ${esc(v.name)}">${this.icons.crest(king)}<span><b>${eco.tierName(v)} ${esc(v.name)}</b><em>${polity ? `Reino: ${esc(polity)}` : 'Independente'}</em></span><i class="cs-go">${pixelIcon('chevron')}</i></button>`;
  }

  private personOverview(eco: Ecosystem, i: number): string {
    const life = lifeOf(eco, i);
    const fam = eco.familyOf(i);
    const t = eco.tiesOf(i);
    const v = homeOf(eco, i);
    const craft = life.stage !== 'child' ? ROLE_NAMES[ROLES[bestCraft(eco.uid[i])]] : '';
    const stage = life.stage === 'child' ? 'Criança' : life.stage === 'elder' ? 'Idoso' : 'Adulto';
    const tiles = [
      tile(pixelIcon('cake'), `${Math.floor(eco.age[i])}`, 'Idade em anos'),
      tile(pixelIcon(life.stage === 'child' ? 'child' : life.stage === 'elder' ? 'elder' : 'person'), stage, 'Fase da vida'),
      tile(pixelIcon('child'), `${fam.children.length}`, 'Filhos vivos'),
      tile(pixelIcon('smile'), `${t.friends.length}`, 'Amigos'),
      tile(pixelIcon('angry'), `${t.rivals.length}`, 'Rivais', t.rivals.length ? 'bad' : ''),
      tile(pixelIcon('heartPink'), t.partner >= 0 ? 'Sim' : 'Não', 'Casado(a)'),
      life.role ? tile(ROLE_ICONS[life.role], esc(life.stage === 'elder' && life.label === 'Idoso' ? 'Aposentado' : life.label), 'Ofício') : tile(pixelIcon('tent'), 'Nenhum', life.stage === 'child' ? 'Ofício (criança)' : 'Ofício'),
      craft ? tile(pixelIcon('star'), esc(craft), 'Jeito para') : '',
    ].join('');
    const teaching = v?.pendingTech?.uid === eco.uid[i] ? v.pendingTech : null;
    return `
      ${this.mindPeek(eco, i) || now(eco, i)}
      <div class="cs-tiles">${tiles}</div>
      ${this.placeCard(eco, i)}
      <div class="cs-rows">
        ${row('Família', esc(personFullName(eco, i).family), pixelIcon('flag'))}
        ${row('Espécie', esc(eco.species[eco.kind[i]].name), pixelIcon('dna'))}
      </div>
      ${teaching ? this.teaching(teaching) : ''}`;
  }

  /**
   * O pensamento em um cartão no resumo: o que está fazendo, a decisão por trás (quando é outra coisa), o motivo
   * principal e quantas ideias venceu, com a nota e o atalho para a aba da mente. Vazio para quem vive solto.
   */
  private mindPeek(eco: Ecosystem, i: number): string {
    if (!homeOf(eco, i)) return '';
    const { d, act } = doing(eco, i);
    const n = d.note;
    const top = n?.factors?.find((f) => f.value >= 0.5);
    const why = top ? cap(FACTOR[top.name]?.pro ?? top.name) : cap(d.why);
    const parts = [act !== d.task ? `Decidiu ${d.task}` : '', why, n?.others.length ? `venceu ${n.others.length} ${n.others.length === 1 ? 'ideia' : 'ideias'}` : ''].filter(Boolean);
    return `<button class="cs-peek" data-ctab="journey" title="Ver o que pensa: Mente e decisão">${pixelIcon('thought')}<span><em>Agora</em><b>${esc(cap(act))}</b><small>${esc(parts.join(' · '))}</small></span>${n?.score !== undefined ? `<code title="Nota da decisão">${num(n.score)}</code>` : ''}<i class="cs-go">${pixelIcon('chevron')}</i></button>`;
  }

  /** Quem descobriu uma técnica e ainda a ensina ao lugar (RF-VIDA-419): nome, progresso e o aviso de que transmite. */
  private teaching(t: { id: string; progress: number }): string {
    const name = TECH_BY_ID[t.id]?.name ?? t.id;
    return `<div class="cs-teach"><i class="cs-teach-ic">${pixelIcon('scroll')}</i><span><b>Ensinando ${esc(name)}</b><em>Transmite o que descobriu ao lugar</em></span>${meter('Progresso', t.progress, pct(t.progress), 'good')}</div>`;
  }

  /** Condição: o que o corpo e a rotina pedem agora (as necessidades do dia) e os estados com texto. */
  private personStatus(eco: Ecosystem, i: number): string {
    const life = lifeOf(eco, i);
    const needs = needsOf(eco, i);
    const v = homeOf(eco, i);
    const craft = life.stage !== 'child' ? bestCraft(eco.uid[i]) : -1;
    const apt = craft >= 0 ? aptitudeOf(eco.uid[i], craft) : 0;
    const teaching = v?.pendingTech?.uid === eco.uid[i] ? v.pendingTech : null;
    const temple = v ? eco.has(v, 'temple') : false;
    const needsHtml = needs
      ? `${section('Necessidades do dia')}<div class="cs-bars">${need('Fome', needs.hunger, pixelIcon('meat'), 'Fome: calculada da energia (mais fome abaixo de 75% de energia)')}${need('Cansaço', needs.rest, pixelIcon('rest'), 'Cansaço: sobe com o tempo (mais devagar sem trabalhar) e zera ao descansar em casa')}${need('Falta de companhia', needs.social, pixelIcon('chat'), 'Falta de companhia: sobe com o tempo e zera ao conversar na praça, na festa ou vendo a caravana')}${need('Vontade de rezar', needs.faith, pixelIcon('candle'), 'Vontade de rezar: sobe com o tempo e zera ao rezar no templo ou ir a um enterro')}</div>
        <div class="cs-note">Cada necessidade sobe sozinha com o tempo e só zera quando a pessoa conclui o gesto (descansar em casa, conversar na praça, rezar no templo). Trabalho e eventos do lugar disputam a vez com elas, por isso gente do mesmo lugar costuma ter valores parecidos. Acima de 75% a ficha mostra o aviso no cabeçalho.${temple ? '' : ' Este lugar não tem templo: sem ele ninguém consegue rezar, e a vontade de rezar só sobe.'}</div>`
      : `${section('Necessidades do dia')}${empty(life.stage === 'child' ? 'Criança ainda não tem as necessidades do dia dos adultos.' : !v ? 'Quem vive solto não segue a rotina de um assentamento.' : 'As necessidades só correm nos lugares perto da câmera ou de quem está aberto na ficha.')}`;
    return `
      ${needsHtml}
      ${this.marks(eco, i) ? `${section('Estados')}${this.marks(eco, i)}` : ''}
      ${teaching ? this.teaching(teaching) : ''}
      ${craft >= 0 ? `${section('Capacidade')}<div class="cs-rows">${row('Jeito para', ROLE_NAMES[ROLES[craft]].toLowerCase(), pixelIcon('star'))}</div>${meter('Aptidão', apt, pct(apt), 'good', pixelIcon('target'), 'Aptidão para o ofício de que mais tem jeito')}` : ''}`;
  }

  /** Personalidade: os traços marcantes e os 16 traços (−10 a 10) como barra de dois lados. */
  private personPersonality(eco: Ecosystem, i: number): string {
    const marks = notable(eco.traits, i);
    const chips = marks.length ? `<div class="cs-chips">${marks.map((t) => `<span class="cs-chip" title="${TRAIT_INFO[t.trait].name}">${t.icon}<em>${t.label}</em></span>`).join('')}</div>` : empty('Nenhum traço marcante: um temperamento equilibrado');
    const grid = TRAITS.map((t, k) => {
      const value = eco.traits[i * TRAIT_COUNT + k];
      const info = TRAIT_INFO[t];
      const w = (Math.abs(value) / 10) * 50;
      const side = value >= 0 ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`;
      return `<div class="cs-trait" title="${info.name}: ${value > 0 ? '+' : ''}${value}"><span class="lo ${value < 0 ? 'on' : ''}">${info.low}</span><span class="cs-tb"><i style="${side}" class="${value >= 0 ? 'hi' : 'lo'}"></i></span><span class="hi ${value > 0 ? 'on' : ''}">${info.high}</span></div>`;
    }).join('');
    return `
      ${section('Traços marcantes')}
      ${chips}
      ${section('Temperamento')}
      <div class="cs-traits">${grid}</div>
      <div class="cs-note">Cada barra vai de −10 (esquerda) a +10 (direita); o meio é o equilíbrio. Esses traços pesam nas escolhas do dia (aba Decisão).</div>`;
  }

  private tieRow(eco: Ecosystem, kind: 'partner' | 'friend' | 'rival', t: Tie): string {
    const ic = kind === 'partner' ? '💞' : kind === 'friend' ? '🤝' : '😠';
    const label = kind === 'partner' ? 'Cônjuge' : kind === 'friend' ? 'Amigo(a)' : 'Rival';
    const f = Math.abs(t.value) / 100;
    return `<div class="cs-tie ${kind}"><i>${ic}</i>${this.who(eco, t.i)}<em>${label}</em><span class="cs-tb1" title="Força do laço: ${Math.round(t.value)}"><i style="width:${(f * 100).toFixed(0)}%"></i></span></div>`;
  }

  private personFamily(eco: Ecosystem, i: number): string {
    const fam = eco.familyOf(i);
    const ties = tiesWithValues(eco, i);
    const kids = fam.children.slice(0, 5).map((j) => this.who(eco, j));
    const more = fam.children.length - 5;
    return `
      ${section(`Família ${esc(personFullName(eco, i).family)}`)}
      <div class="cs-rows">
        ${row('Pai ou mãe', fam.parent >= 0 ? this.who(eco, fam.parent) : '<span class="cs-dim">Desconhecido</span>', '👤')}
        ${row('Filhos', kids.length ? `${kids.join(', ')}${more > 0 ? ` <span class="cs-dim">e mais ${more}</span>` : ''}` : '<span class="cs-dim">Nenhum</span>', '👶')}
      </div>
      ${section('Laços')}
      ${ties.partner ? this.tieRow(eco, 'partner', ties.partner) : `<div class="cs-tie none"><i>💞</i><span class="cs-dim">Sem cônjuge</span></div>`}
      ${ties.friends.map((t) => this.tieRow(eco, 'friend', t)).join('') || `<div class="cs-tie none"><i>🤝</i><span class="cs-dim">Nenhum amigo</span></div>`}
      ${ties.moreFriends ? `<div class="cs-dim cs-more">e mais ${ties.moreFriends} amigo(s)</div>` : ''}
      ${ties.rivals.map((t) => this.tieRow(eco, 'rival', t)).join('') || `<div class="cs-tie none"><i>😠</i><span class="cs-dim">Nenhum rival</span></div>`}
      ${ties.moreRivals ? `<div class="cs-dim cs-more">e mais ${ties.moreRivals} rival(is)</div>` : ''}`;
  }

  private personDiary(eco: Ecosystem, i: number): string {
    const all = diaryOf(eco, i);
    const entry = (t: (typeof all)[number], old = false) => `<li class="${old ? 'old' : ''}"><i>${thoughtIcon(t)}</i><span><b>Ano ${t.year}:</b> ${esc(thoughtText(t.text))}</span></li>`;
    return `
      ${section('Decisões recentes')}
      <ol class="cs-diary">${all.slice(0, 4).map((t) => entry(t)).join('')}</ol>
      ${all.length > 4 ? `${section('Mais antigas')}<ol class="cs-diary">${all.slice(4).map((t) => entry(t, true)).join('')}</ol>` : ''}
      <div class="cs-note">O diário guarda as últimas ${all.length >= 10 ? 10 : all.length} decisões; brigas e amizades antigas saem primeiro.</div>`;
  }

  /**
   * Uma consideração da escolha numa linha da conta: ícone, a frase (a favor quando ajudou, contra quando derrubou),
   * o nome técnico e o traço de que depende, a curva de resposta com o ponto de agora (ou a barra, quando o motor não
   * mandou a curva) e o fator (0 a 1). `low` marca a que mais puxou a nota para baixo.
   */
  private consRow(eco: Ecosystem, i: number, c: NoteFactor, low = false): string {
    const { name, value } = c;
    const f = FACTOR[name];
    const good = value >= 0.6;
    const phrase = f ? cap(good ? f.pro : f.con) : cap(name);
    const tv = f?.trait ? eco.traits[i * TRAIT_COUNT + TRAIT[f.trait]] : 0;
    const info = f?.trait ? TRAIT_INFO[f.trait] : null;
    const trait = info && Math.abs(tv) >= 3 ? `<small title="Depende do traço ${esc(info.name.toLowerCase())} (${tv > 0 ? '+' : ''}${tv})">${tv > 0 ? info.high : info.low}</small>` : '';
    const t = value >= 0.6 ? 't-good' : value >= 0.3 ? 't-warn' : 't-bad';
    const path = c.shape && c.x !== undefined ? curvePlot(c.shape, c.x, c.curve ?? value) : '';
    const how = path
      ? ` Entrada ${num(c.x!)} na curva dá ${num(c.curve ?? value)}${Math.abs((c.curve ?? value) - value) > 0.005 ? `; com a compensação pelo número de considerações, ${num(value)}` : ''}.`
      : '';
    return `<div class="cs-con ${t} ${low ? 'low' : ''}" title="${esc(name)}: ${num(value)}: 1 é o melhor, 0 é o pior.${how} Cada fator multiplica a nota: 1 não muda nada, 0 zera.">
        <i>${pixelIcon(f?.icon ?? 'thought')}</i>
        <span><b>${esc(phrase)}</b><em>${esc(name)}${low ? ' · a que mais pesou contra' : ''}</em>${trait}</span>
        ${path || `<span class="cs-tb1"><i style="width:${pct(value)}"></i></span>`}
        <code>${num(value)}</code>
      </div>`;
  }

  /** Necessidades em grade com rótulo, valor e barra; a mais urgente fica destacada (é a que mais disputa a vez). */
  private needGrid(needs: NonNullable<ReturnType<typeof needsOf>>): string {
    const list: [string, string, number, string][] = [
      ['meat', 'Fome', needs.hunger, 'Calculada da energia (mais fome abaixo de 75% de energia)'],
      ['rest', 'Cansaço', needs.rest, 'Sobe com o tempo e zera ao descansar em casa'],
      ['chat', 'Companhia', needs.social, 'Falta de companhia: sobe com o tempo e zera ao conversar'],
      ['candle', 'Fé', needs.faith, 'Vontade de rezar: sobe com o tempo e zera ao rezar ou ir a um enterro'],
    ];
    const top = Math.max(...list.map((x) => x[2]));
    return `<div class="cs-needs">${list
      .map(([ic, l, f, hint]) => {
        const t = f > 0.75 ? 't-bad' : f > 0.5 ? 't-warn' : 't-good';
        return `<div class="cs-need ${t} ${f === top && f > 0.5 ? 'top' : ''}" title="${l}: ${pct(f)}. ${hint}.">${pixelIcon(ic)}<span>${l}</span><code>${pct(f)}</code><span class="cs-tb1"><i style="width:${pct(f)}"></i></span></div>`;
      })
      .join('')}</div>`;
  }

  /** Abre ou fecha um detalhe da ficha (as linhas da disputa, a explicação); o estado sobrevive às atualizações. */
  toggle(eco: Ecosystem, key: string): void {
    if (key === 'lock') this.locked = !this.locked;
    else if (key.startsWith('pick:')) {
      const at = key.slice(5);
      this.pickAt = at === 'now' ? null : Number(at);
    } else if (this.open.has(key)) this.open.delete(key);
    else this.open.add(key);
    this.refresh(eco);
  }

  /** Botão de abrir e fechar um detalhe, com a seta que gira. */
  private fold(key: string, label: string): string {
    const on = this.open.has(key);
    return `<button class="cs-fold ${on ? 'on' : ''}" data-cs-x="${esc(key)}" aria-expanded="${on}">${pixelIcon('chevron')}<span>${label}</span></button>`;
  }

  /**
   * Mente e decisão (RF-AS-30), a tela de pensamento, de cima para baixo: o pensamento de agora (a ação, o alvo, há
   * quanto tempo, se já chegou e se a ação ainda está na frente, ao vivo), como está o corpo, por que escolheu (cada
   * consideração com a curva), a disputa e as últimas decisões, com como cada uma acabou. Uma decisão antiga do
   * histórico pode ser aberta no lugar da atual. Enquanto o mouse está na ficha, ela não muda (ver `held`).
   */
  private personJourney(eco: Ecosystem, i: number): string {
    const v = homeOf(eco, i);
    const name = personFullName(eco, i).first;
    if (!v) {
      // Mundo generativo: a pessoa não tem lista de comportamentos; a ficha mostra o que ela gerou e escolheu agora.
      const mente = this.host.mente?.(i);
      if (mente) return `<div class="cs-now">${pixelIcon('play')}<span>Agora: <b>${esc(mente.agora || 'pensando no que fazer')}</b></span></div>${fichaGenerativaHtml(mente)}`;
    }
    const r = doing(eco, i);
    // Sem lugar e longe da tela: só a regra de procurar o povo. Perto da tela, o andarilho tem mente e a ficha mostra
    // a decisão como a de qualquer um.
    if (!v && !r.d.note) {
      const g = eco.wanderGoal(i);
      const to = g.village >= 0 ? eco.villages[g.village] : null;
      return `${this.hero(r.act, '', null, null, '')}
        ${section('O que decidiu')}
        <div class="cs-pick"><div class="cs-pick-head">${pixelIcon('check')}<b>${to ? 'Ir morar num lugar do seu povo' : 'Juntar-se a outros solitários'}</b></div>
          <p class="cs-say">${esc(name)} vive sem assentamento e ${
            to
              ? `<button class="cs-link" data-village="${to.id}">${eco.tierName(to)} ${esc(to.name)}</button> fica a ${Math.round(g.distance)} tiles; ao chegar, entra e recebe uma profissão.`
              : 'não há lugar do seu povo a menos de 40 tiles: procura outros solitários e só funda um lugar em grupo.'
          }</p>
          <p class="cs-fine">Longe da tela, quem vive solto só procura o seu povo. Perto da câmera, ele decide o que fazer como qualquer pessoa: comer do mato, dormir ao relento, fazer fogo, procurar o povo.</p></div>`;
    }
    const { d, act, live, past } = r;
    const needs = needsOf(eco, i);
    const full = !v || eco.full(v);
    const needsHtml = needs ? `${section('Como está')}${this.needGrid(needs)}` : '';
    const offscreen = full ? '' : '<div class="cs-note">O lugar está fora da tela: as decisões só são tomadas uma a uma nos lugares perto da câmera ou de quem está aberto na ficha.</div>';
    // A decisão mostrada: a atual ou uma do histórico escolhida pelo jogador.
    const chosen = this.pickAt !== null ? past.find((p) => p.at === this.pickAt) : undefined;
    if (this.pickAt !== null && !chosen) this.pickAt = null;
    const n = chosen ?? d.note;
    const hero = this.hero(act, d.carry, chosen ? null : d.note, chosen ? null : live, chosen ? '' : this.targetText(eco, r, d.note?.target, live), live?.rivals[0]?.target ? this.targetName(eco, r, live.rivals[0].target) : '', chosen ? -1 : r.hour);
    const history = this.historyList(eco, r, past);

    // Sem nota da IAUS: uma ordem do quadro ou um evento do lugar passou na frente da escolha.
    if (!n || n.score === undefined) {
      return `${hero}${needsHtml}
        ${section('O que decidiu')}
        <div class="cs-pick"><div class="cs-pick-head">${pixelIcon(n ? 'flag' : 'check')}<b>${esc(cap(d.task))}</b><span class="cs-tag">${n ? 'evento do lugar' : 'sem disputa'}</span></div>
          <p class="cs-say">${esc(cap(d.why))}.</p>
          <p class="cs-fine">${n ? 'Um evento do lugar (festa, enterro, alarme) passa na frente da escolha: não houve disputa de notas.' : 'Nenhuma ideia pontuou: a pessoa espera o próximo pensamento.'}</p></div>
        ${history}${offscreen}`;
    }

    const task = n.label;
    const score = n.score;
    const cut = n.cut ?? score * 0.85;
    const cons = (n.considerations ?? n.factors ?? []).slice();
    const lowName = cons.length > 1 ? cons.reduce((p, q) => (q.value < p.value ? q : p)).name : '';
    const prod = cons.reduce((p, c) => p * c.value, 1);
    const momentum = n.momentum && n.momentum !== 1 ? n.momentum : 0;
    const weight = prod > 0 ? score / prod / (momentum || 1) : 0;

    // O porquê em uma frase: as considerações que mais ajudaram (e a que mais pesou contra, se pesou).
    const top = (n.factors ?? cons.slice().sort((p, q) => q.value - p.value).slice(0, 3)).filter((f) => f.value >= 0.5);
    const against = lowName && (cons.find((c) => c.name === lowName)?.value ?? 1) < 0.6 ? FACTOR[lowName]?.con ?? lowName : '';
    const because = top.length
      ? `${esc(name)} escolheu <b>${esc(task)}</b> porque ${andList(top.map((f) => FACTOR[f.name]?.pro ?? f.name))}${against ? `, mesmo que ${esc(against)}` : ''}.`
      : `${esc(cap(n.why))}.`;
    const rivals = n.others;
    const best = Math.max(score, ...rivals.map((o) => o.score), 1e-6);
    const beaten = rivals.length && rivals[0].score > score;
    const verdict = beaten
      ? 'Não era a maior nota, mas estava dentro da faixa do sorteio e foi a sorteada.'
      : rivals.length && rivals[0].score >= cut
        ? 'Era a maior nota, mas outra ideia também estava na faixa do sorteio.'
        : 'Era a maior nota, com folga: nenhuma outra ideia chegou perto.';
    const math = cons.length
      ? `<div class="cs-math" title="Nota = peso × momentum × cada fator">
          <span>peso <b>${num(weight)}</b></span>${momentum ? `<span>× momentum <b>${num(momentum)}</b></span>` : ''}${cons.map((c) => `<span>× ${esc(c.name)} <b>${num(c.value)}</b></span>`).join('')}<span>= <b>${num(score)}</b></span>
        </div>`
      : '';
    const banner = chosen
      ? `<div class="cs-past">${pixelIcon('scroll')}<span>Vendo uma decisão de <b>${esc(this.ago(eco, r, chosen.at))}</b>${chosen.end ? ` · ${END[chosen.end].label}` : ''}</span><button class="cs-btn sm" data-cs-x="pick:now">Voltar à atual</button></div>`
      : '';
    const pick = `<div class="cs-pick">
        <div class="cs-pick-head">${pixelIcon('check')}<b>${esc(cap(task))}</b><span class="cs-score" title="Nota da escolha: o peso da ação vezes cada fator (pode passar de 1 quando o peso é maior que 1)"><span class="cs-tb1"><i style="width:${pct(score / best)}"></i></span><code>${num(score)}</code></span></div>
        <p class="cs-say">${because}</p>
        ${cons.length ? `<div class="cs-cons">${cons.map((c) => this.consRow(eco, i, c, c.name === lowName && c.value < 0.6)).join('')}</div>` : ''}
        ${cons.length ? this.fold('math', 'Ver a conta') : ''}
        ${this.open.has('math') ? math : ''}
      </div>`;

    // A disputa: todas as ideias numa régua (a escolhida em ouro), com o corte do sorteio.
    type Row = { label: string; score: number; low?: string; factors?: NoteFactor[]; target?: NoteTarget; chosen: boolean };
    const all: Row[] = [{ label: task, score, target: n.target, chosen: true }, ...rivals.map((o) => ({ ...o, chosen: false }))].sort((p, q) => q.score - p.score);
    const twice = new Set(all.filter((o, k) => all.findIndex((x) => x.label === o.label) !== k).map((o) => o.label));
    const cutAt = (cut / best) * 100;
    const seenTarget = new Set<string>();
    const rank = all
      .map((o, k) => {
        const inBand = o.score >= cut;
        const tag = o.chosen ? 'escolhida' : inBand ? 'no sorteio' : 'fora';
        const key = `alt:${k}:${o.label}`;
        const open = !o.chosen && this.open.has(key);
        const con = o.low ? FACTOR[o.low]?.con ?? o.low : '';
        const why = o.chosen ? '' : inBand ? 'Estava na faixa do sorteio, mas o sorteio escolheu outra.' : con ? `Ficou de fora porque ${con}.` : 'Ficou de fora: a nota foi mais baixa.';
        // A mesma ação aparece uma vez por alvo (cada presa, cada roça, cada pessoa à vista): o alvo vai numa linha
        // própria, inteiro, com a distância; dois alvos iguais à mesma distância ganham "outro".
        let where = '';
        if (o.target && (twice.has(o.label) || o.target.type === WOT_PESSOA)) {
          const dist = o.target.dist >= 1 ? ` · a ${Math.round(o.target.dist)} tiles` : ' · aqui';
          const text = `${this.targetName(eco, r, o.target)}${dist}`;
          const again = seenTarget.has(o.label + text);
          seenTarget.add(o.label + text);
          where = `<small>${again ? 'outro: ' : ''}${text}</small>`;
        }
        const detail = open
          ? `<div class="cs-rank-more"><p>${why}</p>${o.factors?.length ? `<div class="cs-cons">${o.factors.slice().sort((p, q) => p.value - q.value).map((c, j) => this.consRow(eco, i, c, j === 0 && c.value < 0.6)).join('')}</div>` : o.low ? `<div class="cs-cons">${this.consRow(eco, i, { name: o.low, value: 0 }, true)}</div>` : ''}</div>`
          : '';
        const head = `<span class="cs-rank-n">${k + 1}</span><b><span>${esc(cap(o.label))}</span>${where}</b><span class="cs-rank-bar"><i style="width:${pct(o.score / best)}"></i><s style="left:${cutAt.toFixed(1)}%"></s></span><code>${num(o.score)}</code><span class="cs-tag ${o.chosen ? 'on' : inBand ? 'mid' : ''}">${tag}</span>`;
        return o.chosen
          ? `<div class="cs-rank chosen"><div class="cs-rank-row">${head}</div></div>`
          : `<div class="cs-rank ${inBand ? 'band' : ''} ${open ? 'open' : ''}"><button class="cs-rank-row" data-cs-x="${esc(key)}" aria-expanded="${open}" title="${esc(why)} Clique para ver a conta.">${head}</button>${detail}</div>`;
      })
      .join('');
    const race = rivals.length
      ? `${section(`Disputa · ${all.length} ideias`)}
        <div class="cs-ranks">${rank}</div>
        <p class="cs-fine">${verdict} A linha vermelha é o corte do sorteio (${num(cut)}, 85% da melhor nota): só as ideias que passam dela concorrem. Clique numa ideia para ver por que perdeu.</p>`
      : `${section('Disputa')}${empty('Nenhuma outra ideia disputou a vez.')}`;

    const help = `${this.fold('help', 'Como a decisão funciona')}${
      this.open.has('help')
        ? `<div class="cs-note">Cada ideia ganha uma nota: o peso dela vezes cada consideração (de 0 a 1, depois da curva de resposta). Basta uma consideração perto de zero para derrubar a ideia. As ideias com nota acima de 85% da melhor vão a um sorteio ponderado, por isso duas pessoas no mesmo estado podem escolher coisas diferentes. Enquanto faz uma ação contínua, a pessoa pensa de novo a cada segundo, mas a ação de agora ganha o foco (momentum): só troca se outra valer mais mesmo com esse empurrão. Os traços de personalidade mudam o tamanho de algumas considerações (aba Personalidade).</div>`
        : ''
    }`;
    return `${hero}${needsHtml}${banner}${section(chosen ? 'O que decidiu então' : 'Por que escolheu')}${pick}${race}${history}${help}${offscreen}`;
  }

  /**
   * O pensamento de agora, no alto da tela: a ação, o estado (a caminho, no lugar), o alvo, há quanto tempo e, ao
   * vivo, se a ação ainda está na frente das outras ideias com o foco (momentum) ou se já vai perder a vez.
   */
  private hero(act: string, carry: string, note: DayNote | null | undefined, live: MindLive | null, target: string, rivalWhere = '', hour = -1): string {
    const state = !live ? '' : live.arrived ? `<span class="cs-pill ok">${pixelIcon('pin')}no lugar</span>` : `<span class="cs-pill go">${pixelIcon('play')}a caminho · ${Math.round(live.dist)} tiles</span>`;
    const rows = [
      target ? `<div class="cs-hrow"><i>${pixelIcon('target')}</i><span>Alvo</span><b>${target}</b></div>` : '',
      live ? `<div class="cs-hrow"><i>${pixelIcon('hourglass')}</i><span>Nesta ação</span><b>${live.seconds < 1 ? 'agora mesmo' : `há ${secs(live.seconds)}`}</b></div>` : '',
      carry ? `<div class="cs-hrow"><i>${pixelIcon('bag')}</i><span>Carregando</span><b>${esc(carry)}</b></div>` : '',
    ].join('');
    let pulse = '';
    if (live) {
      const rival = live.rivals[0];
      const max = Math.max(live.score, rival?.score ?? 0, 1e-6);
      const lead = rival ? live.score - rival.score : live.score;
      const focus = live.momentum > 1 ? `<span class="cs-tag mid" title="A ação contínua de agora vale ×${num(live.momentum)} enquanto dura, para não ser largada por pouco">foco ×${num(live.momentum)}</span>` : '';
      const say = !rival
        ? 'Nenhuma outra ideia pontua agora.'
        : lead >= 0
          ? `Continua na frente por ${num(lead)}${live.momentum > 1 && rival.score * live.momentum > live.score ? ': sem o foco, já teria trocado' : ''}.`
          : `Outra ideia já vale mais: troca no próximo pensamento.`;
      pulse = `<div class="cs-live" title="Notas do último pensamento (a cada segundo): a ação de agora, com o foco, contra a melhor das outras">
          <div class="cs-live-h"><em>Se pensasse agora</em>${focus}</div>
          <div class="cs-duel"><span>${esc(cap(note?.label ?? act))}</span><span class="cs-rank-bar mine"><i style="width:${pct(live.score / max)}"></i></span><code>${num(live.score)}</code></div>
          ${rival ? `<div class="cs-duel"><span>${esc(cap(rival.label))}${rival.label === (note?.label ?? act).toLowerCase() && rival.target ? ` <small>${rivalWhere}</small>` : ''}</span><span class="cs-rank-bar"><i style="width:${pct(rival.score / max)}"></i></span><code>${num(rival.score)}</code></div>` : ''}
          <p class="cs-fine">${say}</p>
        </div>`;
    }
    const title = note?.label ?? act;
    return `<div class="cs-hero">
        <div class="cs-hero-top">${pixelIcon('thought')}<span><em>Pensando em</em><b>${esc(cap(title))}</b>${act && act !== title ? `<small>${esc(cap(act))}</small>` : ''}</span><span class="cs-hero-r">${hour >= 0 ? clock(hour) : ''}${state}</span></div>
        ${rows ? `<div class="cs-hrows">${rows}</div>` : ''}
        ${pulse}
      </div>`;
  }

  /** As últimas decisões, a mais nova em cima: quando, como acabou, a ação e o alvo e a nota. Clicar abre a decisão. */
  private historyList(eco: Ecosystem, r: Doing, past: readonly DayNote[]): string {
    if (past.length < 2) return '';
    const items = past
      .map((p, k) => {
        const end = p.end ? END[p.end] : null;
        const on = this.pickAt === p.at || (this.pickAt === null && k === 0);
        const where = p.target ? ` <small>${this.targetName(eco, r, p.target)}</small>` : '';
        const dur = p.endAt !== undefined && p.at !== undefined ? ` · durou ${secs((p.endAt - p.at) * r.span)}` : '';
        return `<li><button class="cs-hist-row ${on ? 'on' : ''}" data-cs-x="pick:${k === 0 ? 'now' : p.at}" title="Abrir esta decisão">
            <span class="cs-hist-t">${esc(this.ago(eco, r, p.at))}</span>
            <span class="cs-hist-e ${end?.cls ?? 'now'}" title="${end ? end.label : 'em andamento'}">${pixelIcon(end?.icon ?? 'play')}</span>
            <span class="cs-hist-l"><b>${esc(cap(p.label))}${where}</b><em>${end ? `${end.label}${dur}` : 'em andamento'}${p.others.length ? ` · venceu ${p.others.length}` : ''}</em></span>
            <code>${p.score !== undefined ? num(p.score) : '—'}</code>
          </button></li>`;
      })
      .join('');
    return `${section('Últimas decisões')}<ol class="cs-hist">${items}</ol>`;
  }

  /** "há 12 s", "há 2 min" (tempo de jogo desde o ano `at`). */
  private ago(eco: Ecosystem, r: Doing, at: number | undefined): string {
    void eco;
    if (at === undefined) return '—';
    const s = (r.year - at) * r.span;
    return s < 1 ? 'agora' : `há ${secs(s)}`;
  }

  /** O alvo em palavras, com o nome de quem é (link para a ficha) quando é gente ou bicho. */
  private targetName(eco: Ecosystem, r: Doing, t: NoteTarget): string {
    const base = TARGET[t.type]?.name ?? t.type;
    if (t.uid === undefined) return esc(base);
    const j = r.find(t.uid);
    if (j < 0) return esc(base);
    if (isPerson(eco, j)) return this.who(eco, j);
    return esc(r.kindName(j).toLowerCase());
  }

  /** O alvo da ação de agora com a distância (ao vivo, quando há). */
  private targetText(eco: Ecosystem, r: Doing, t: NoteTarget | undefined, live: MindLive | null): string {
    if (!t) return '';
    const dist = live && !live.arrived ? live.dist : live?.arrived ? 0 : t.dist;
    return `${this.targetName(eco, r, t)}${dist >= 1 ? ` <em>a ${Math.round(dist)} tiles</em>` : ''}`;
  }

  private personHistory(eco: Ecosystem, i: number): string {
    const list = historyOf(eco, i);
    return `${section('Linha do tempo')}<ol class="cs-time">${list
      .map((e) => `<li><b>${e.year !== null ? `Ano ${e.year}` : '—'}</b><i>${e.icon}</i><span>${e.village !== undefined && eco.villages[e.village] && !eco.villages[e.village].abandoned ? e.text.replace(eco.villages[e.village].name, `<button class="cs-link" data-village="${e.village}">${esc(eco.villages[e.village].name)}</button>`) : esc(e.text)}</span></li>`)
      .join('')}</ol>`;
  }

  private personGear(eco: Ecosystem, i: number): string {
    const list = equipmentOf(eco, i);
    const v = homeOf(eco, i)!;
    const cards = list
      .map(
        (g) =>
          `<div class="cs-item"><span class="cs-slot">${g.icon ? this.icons.icon(`item:${g.icon}`, materialColor(g.material)) : '<i>🧺</i>'}</span><span><b>${esc(g.name)}</b><em>${cap(g.category)} · ${g.source === 'estoque' ? 'peça do estoque do reino' : 'feito à mão: o reino não tem peça assim'}</em></span></div>`,
      )
      .join('');
    return `${section(`Leva · ${eco.tierName(v)} ${esc(v.name)}`)}${cards}<div class="cs-note">As peças ficam no estoque do reino; a ficha mostra a melhor que o ofício usaria, pela era e pelo que há no estoque.</div>`;
  }

  // ---- Animais -----------------------------------------------------------------------------------

  private animalTab(eco: Ecosystem, i: number): string {
    const a = animalOf(eco, i);
    if (this.tab === 'nature') {
      return `
        ${section('Alimentação')}
        ${row('Dieta', esc(cap(a.diet)), '🍽️')}
        ${row('Parasitas', a.parasites ? `<span class="${a.parasites.heavy ? 'bad' : 'warn'}">${esc(a.parasites.name)} (${a.parasites.heavy ? 'muitos' : 'alguns'})</span>` : '<span class="cs-dim">Poucos</span>', '🦠')}
        ${section('Grupo e perigo')}
        ${row(cap(a.group.name), a.group.size > 1 ? `${a.group.size} juntos` : 'Sozinho', '🐾')}
        ${row('Predador por perto', a.threat ? `<span class="bad">${esc(a.threat.name)} a ${Math.round(a.threat.distance)} tiles</span>` : '<span class="cs-dim">Nenhum à vista</span>', '⚠')}`;
    }
    const life = a.age / a.maxAge;
    const sp = eco.species[eco.kind[i]];
    return `
      ${now(eco, i)}
      <div class="cs-tiles">
        ${tile(pixelIcon('dna'), esc(sp.name), 'Espécie')}
        ${tile(pixelIcon('leaf'), cap(a.stage), 'Fase da vida')}
        ${tile(pixelIcon('paw'), a.group.size > 1 ? `${a.group.size}` : '1', `Tamanho do ${a.group.name}`)}
        ${tile(pixelIcon('meat'), esc(cap(a.diet)), `Dieta: ${a.diet}`)}
        ${a.threat ? tile(pixelIcon('warn'), `${Math.round(a.threat.distance)} tiles`, `Predador por perto: ${a.threat.name}`, 'bad') : ''}
        ${a.parasites ? tile(pixelIcon('bug'), a.parasites.heavy ? 'Muitos' : 'Alguns', `Parasitas: ${a.parasites.name}`, a.parasites.heavy ? 'bad' : '') : ''}
      </div>
      ${section('Tempo de vida')}
      ${meter('Idade', life, `${Math.floor(a.age)} / ${Math.round(a.maxAge)} anos`, life > 0.75 ? 'warn' : 'good', pixelIcon('hourglass'))}`;
  }

  // ---- Grupo -------------------------------------------------------------------------------------

  /** Ficha do grupo do Shift + arrastar (RF-VIDA-336): espécies, profissões e a energia média. */
  private groupSheet(eco: Ecosystem, set: Set<number>): void {
    const species = new Map<number, number>();
    const jobs = new Map<string, number>();
    let energy = 0;
    let n = 0;
    let people = 0;
    for (const uid of set) {
      const i = eco.findUid(uid);
      if (i < 0) continue;
      n++;
      energy += eco.energy[i];
      species.set(eco.kind[i], (species.get(eco.kind[i]) ?? 0) + 1);
      if (isPerson(eco, i)) {
        people++;
        const life = lifeOf(eco, i);
        const job = jobLabel(life);
        jobs.set(job, (jobs.get(job) ?? 0) + 1);
      }
    }
    this.el.classList.remove('docked');
    this.setTitle(`Grupo de ${n}`);
    this.head.set(
      pixelize(`<div class="cs-portrait cs-group">👥</div>
      <div class="cs-hslot"><span>Shift + arrastar no mapa escolhe outro</span></div>
      <div class="cs-hslot"><span>${n} ${n === 1 ? 'criatura' : 'criaturas'}${people ? ` · ${people} ${people === 1 ? 'pessoa' : 'pessoas'}` : ''}</span></div>`),
    );
    this.tabs.set('');
    this.foot.set('<span class="cs-hint">Clique no vazio ou Esc para soltar</span>');
    if (!n) {
      this.setBody(empty('Ninguém do grupo está vivo.'));
      return;
    }
    const sorted = <K>(m: Map<K, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
    const sp = sorted(species)
      .map(([k, c]) => {
        const s = eco.species[k];
        const img = s.kind === 'sapient' ? this.icons.icon(`${bodyOf(s)}:gatherer`, s.color, s.color) : this.icons.icon(spriteOf(s), s.color);
        return `<div class="cs-gcard" title="${esc(s.name)}: ${c}"><span class="cs-slot">${img}</span><b>${c}</b><em>${esc(s.name)}</em></div>`;
      })
      .join('');
    const top = Math.max(1, ...jobs.values());
    const jb = sorted(jobs)
      .map(([k, c]) => `<div class="cs-meter good"><span class="cs-ml">${k}</span><span class="cs-mb"><i style="width:${((c / top) * 100).toFixed(0)}%"></i><em>${c}</em></span></div>`)
      .join('');
    this.setBody(`
      ${meter('Energia média', energy / n, pct(energy / n), tone(energy / n), '⚡')}
      ${section('Por espécie')}<div class="cs-ggrid">${sp}</div>
      ${people ? `${section(`Pessoas por profissão · ${people}`)}<div class="cs-bars">${jb}</div>` : ''}`);
  }
}

/**
 * Prévia da ficha (passar o mouse, RF-VIDA-330): o essencial da ficha completa (retrato, nome, ofício ou fase,
 * energia, saúde, o que faz agora e onde mora), sem o botão de seguir.
 */
export function previewHtml(eco: Ecosystem, i: number, sheet: CreatureSheet): string {
  const sp = eco.species[eco.kind[i]];
  const v = vitalsOf(eco, i);
  const bars = `${vital('Saúde', v.health, pct(v.health), tone(v.health), '❤')}${vital('Energia', v.energy, pct(v.energy), tone(v.energy), '⚡')}`;
  const marks = statusMarks(eco, i)
    .map((s) => `<span class="cs-mark ${s.tone}" title="${esc(s.label)}">${s.icon}</span>`)
    .join('');
  let name: string;
  let sub: string;
  let place = '';
  if (isPerson(eco, i)) {
    const n = personFullName(eco, i);
    const life = lifeOf(eco, i);
    const home = homeOf(eco, i);
    name = `${n.first} ${n.family}`;
    sub = `${sp.name} · ${jobLabel(life)} · ${years(eco.age[i])}`;
    place = home ? `🏠 ${eco.tierName(home)} ${esc(home.name)}${home.kingdom !== home.id ? ` · ${esc(eco.polityName(home))}` : ''}` : '⛺ Sem assentamento';
  } else {
    const a = animalOf(eco, i);
    name = sp.name;
    sub = `${cap(a.stage)} · ${years(a.age)} de até ${Math.round(a.maxAge)}`;
    place = a.group.size > 1 ? `🐾 ${cap(a.group.name)} de ${a.group.size}` : '🐾 Sozinho';
    if (a.threat) place += ` · <span class="bad">⚠ ${esc(a.threat.name)} perto</span>`;
  }
  return pixelize(`<div class="cs-prev">
      <div class="cs-prev-head"><div class="cs-portrait">${sheet.portrait(eco, i)}</div><div class="cs-name" style="--title:${titleColor(isPerson(eco, i) ? (homeOf(eco, i)?.color ?? sp.color) : sp.color)}"><b>${esc(name)}</b><span>${esc(sub)}</span></div></div>
      <div class="cs-vitals">${bars}</div>
      ${thought(eco, i)}
      <div class="cs-prev-foot"><span>${place}</span>${marks ? `<span class="cs-marks inline">${marks}</span>` : ''}</div>
      <div class="cs-hint">Clique para abrir a ficha</div>
    </div>`);
}
