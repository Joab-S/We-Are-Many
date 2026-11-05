import type { Ecosystem } from '../../../sim/ecosystem';
import { ROLE_NAMES, ROLES } from '../../../sim/roles';
import { aptitudeOf, bestCraft, TECH_BY_ID } from '../../../sim/progress';
import { notable, TRAIT, TRAIT_INFO, TRAITS, TRAIT_COUNT, type Trait } from '../../../IAUS/npc/traits';
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
  journey: { label: 'Decisão do dia', icon: 'compass' },
  history: { label: 'História de vida', icon: 'scroll' },
  gear: { label: 'Equipamento', icon: 'sword' },
  nature: { label: 'Vida selvagem', icon: 'leaf' },
};

/**
 * Cada consideração da escolha do dia (src/IAUS/npc/decisions/day.ts) em palavras de gente: o ícone, a frase de quando
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

  constructor(
    private readonly el: HTMLElement,
    private readonly sel: Selection,
    private readonly icons: IconCache,
    private readonly host: { say(text: string): void },
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
  }

  /** Troca de aba sem esperar o intervalo (os dados já estão no ecossistema; só o corpo é refeito). */
  setTab(eco: Ecosystem, tab: SheetTab): void {
    this.tab = tab;
    this.body.el.scrollTop = 0;
    this.tick(eco, performance.now(), true);
  }

  refresh(eco: Ecosystem): void {
    this.tick(eco, performance.now(), true);
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
    this.setBody(person ? this.personTab(eco, i) : this.animalTab(eco, i));
    this.foot.set(
      pixelize(`<button class="cs-btn ${this.sel.follow ? 'on' : ''}" data-act="follow" title="A câmera acompanha a criatura (F)">${pixelIcon(this.sel.follow ? 'x' : 'eye')}<span>${this.sel.follow ? 'Parar de seguir' : 'Seguir'}</span><kbd>F</kbd></button>
       <span class="cs-hint">Clique no vazio ou Esc para soltar</span>`),
    );
  }

  /** Mostra a janela; ao trocar de criatura, a rolagem volta ao topo. */
  private show(eco: Ecosystem, key: string): void {
    void eco;
    this.el.hidden = false;
    if (key !== this.shown) {
      this.shown = key;
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
    const out: SheetTab[] = ['overview', 'status', 'personality'];
    const fam = eco.familyOf(i);
    const t = eco.tiesOf(i);
    if (fam.parent >= 0 || fam.children.length || t.partner >= 0 || t.friends.length || t.rivals.length) out.push('family');
    if (eco.diary.get(eco.uid[i])?.length) out.push('diary');
    out.push('journey', 'history');
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
      ${now(eco, i)}
      <div class="cs-tiles">${tiles}</div>
      ${this.placeCard(eco, i)}
      <div class="cs-rows">
        ${row('Família', esc(personFullName(eco, i).family), pixelIcon('flag'))}
        ${row('Espécie', esc(eco.species[eco.kind[i]].name), pixelIcon('dna'))}
      </div>
      ${teaching ? this.teaching(teaching) : ''}`;
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

  /** Uma consideração da escolha em palavras: ícone, frase (a favor ou contra) e a barra, com o jeito dele quando o traço pesa. */
  private factorChip(eco: Ecosystem, i: number, name: string, value: number, against = false): string {
    const f = FACTOR[name];
    if (!f) return `<span class="cs-fchip"><em>${esc(name)}</em></span>`;
    const tv = f.trait ? eco.traits[i * TRAIT_COUNT + TRAIT[f.trait]] : 0;
    const info = f.trait ? TRAIT_INFO[f.trait] : null;
    const trait = info && Math.abs(tv) >= 3 ? `<small>${tv > 0 ? info.high : info.low}</small>` : '';
    return `<span class="cs-fchip ${against ? 'against' : ''}" title="${esc(name)}: ${num(value)} (de 0 a 1)${info ? ` · depende do traço ${esc(info.name.toLowerCase())}` : ''}">${pixelIcon(f.icon)}<em>${cap(against ? f.con : f.pro)}</em>${trait}<span class="cs-tb1"><i style="width:${pct(value)}"></i></span></span>`;
  }

  /** Decisão do dia (RF-AS-30): o que fez, por quê, em que estado estava e as outras ideias, em linguagem de personagem. */
  private personJourney(eco: Ecosystem, i: number): string {
    const v = homeOf(eco, i);
    const name = personFullName(eco, i).first;
    if (!v) {
      const g = eco.wanderGoal(i);
      const to = g.village >= 0 ? eco.villages[g.village] : null;
      return `${now(eco, i)}
        <div class="cs-pick"><div class="cs-pick-head">${pixelIcon('check')}<b>${to ? 'Ir morar num lugar do seu povo' : 'Juntar-se a outros solitários'}</b></div>
          <p class="cs-say">${esc(name)} vive sem assentamento e ${
            to
              ? `<button class="cs-link" data-village="${to.id}">${eco.tierName(to)} ${esc(to.name)}</button> fica a ${Math.round(g.distance)} tiles; ao chegar, entra e recebe uma profissão.`
              : 'não há lugar do seu povo a menos de 40 tiles: procura outros solitários e só funda um lugar em grupo.'
          }</p></div>`;
    }
    const d = eco.dayOf(i);
    const n = d.note;
    const needs = needsOf(eco, i);
    const state = needs
      ? `<div class="cs-needmini" title="O estado dele na hora de decidir">${[['meat', 'Fome', needs.hunger], ['rest', 'Cansaço', needs.rest], ['chat', 'Companhia', needs.social], ['candle', 'Fé', needs.faith]]
          .map(([ic, l, f]) => `<span class="${(f as number) > 0.75 ? 'bad' : (f as number) > 0.5 ? 'warn' : 'good'}" title="${l}: ${pct(f as number)}">${pixelIcon(ic as string)}<span class="cs-tb1"><i style="width:${pct(f as number)}"></i></span></span>`)
          .join('')}</div>`
      : '';
    const carry = d.carry ? `<div class="cs-carry">${pixelIcon('bag')}<span>Carregando <b>${esc(d.carry)}</b></span></div>` : '';
    const full = eco.full(v);
    const topFactors = n?.factors ?? [];
    const best = Math.max(n?.score ?? 0, ...(n?.others.map((o) => o.score) ?? []), 1e-6);
    const cut = n?.cut;
    // O porquê: as considerações que mais pesaram a favor, ditas como motivos.
    const reasons = topFactors.map((f) => (FACTOR[f.name]?.pro ?? f.name));
    let because: string;
    if (topFactors.length) because = `<p class="cs-say">${esc(name)} escolheu <b>${esc(d.task)}</b> porque ${andList(reasons)}.</p>`;
    else because = `<p class="cs-say">${esc(cap(d.why))}.</p>`;
    let luck = '';
    if (topFactors.length && n?.score !== undefined) {
      const top = n.others.length && n.others[0].score > n.score;
      luck = `<p class="cs-fine" title="Corte do sorteio: ${num(cut ?? 0)} (85% da melhor nota)">${top ? 'Havia uma opção com nota um pouco maior, mas esta também estava entre as melhores e foi a sorteada.' : 'Era a opção com a melhor nota naquele momento.'}</p>`;
    }
    const pick = `<div class="cs-pick"><div class="cs-pick-head">${pixelIcon('check')}<b>${esc(cap(d.task))}</b>${n?.score !== undefined ? `<span class="cs-tb1" title="Nota da escolha: ${num(n.score)}"><i style="width:${pct(n.score / best)}"></i></span>` : ''}</div>
        ${because}
        ${topFactors.length ? `<div class="cs-fchips">${topFactors.map((f) => this.factorChip(eco, i, f.name, f.value)).join('')}</div>` : ''}
        ${luck}</div>`;
    const lost = (o: { label: string; score: number; low?: string }) => {
      const close = cut !== undefined && o.score >= cut;
      const con = o.low ? (FACTOR[o.low]?.con ?? o.low) : '';
      const reason = close ? 'Também era uma boa opção, mas o sorteio escolheu outra.' : con ? `Ficou de fora: ${con}.` : 'Ficou de fora: a nota foi mais baixa.';
      return `<div class="cs-alt ${close ? 'close' : ''}"><div class="cs-alt-head">${pixelIcon('thought')}<b>${esc(cap(o.label))}</b><span class="cs-tb1" title="Nota: ${num(o.score)}"><i style="width:${pct(o.score / best)}"></i></span></div><p>${reason}</p>${!close && o.low ? `<div class="cs-fchips">${this.factorChip(eco, i, o.low, 0, true)}</div>` : ''}</div>`;
    };
    const others = n?.others.length
      ? n.others.map(lost).join('')
      : d.others.length
        ? d.others.map((o) => `<div class="cs-alt"><div class="cs-alt-head">${pixelIcon('thought')}<b>${esc(cap(o))}</b></div><p>A ordem do quadro do lugar passou na frente.</p></div>`).join('')
        : empty(n ? 'Nenhuma outra ideia disputou: um evento do lugar passou na frente da escolha.' : 'Nenhuma outra ideia registrada.');
    return `${now(eco, i)}
      ${carry}
      ${state ? `${section('Como está agora')}${state}` : ''}
      ${section('O que decidiu')}
      ${pick}
      ${section('Também pensou em')}
      ${others}
      ${full ? '' : '<div class="cs-note">O lugar está fora da tela: as decisões só são tomadas uma a uma nos lugares perto da câmera ou de quem está aberto na ficha.</div>'}`;
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
      ${now(eco, i)}
      <div class="cs-prev-foot"><span>${place}</span>${marks ? `<span class="cs-marks inline">${marks}</span>` : ''}</div>
      <div class="cs-hint">Clique para abrir a ficha</div>
    </div>`);
}
