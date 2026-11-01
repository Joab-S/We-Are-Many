import type { Ecosystem } from '../../../sim/ecosystem';
import { ROLE_NAMES, ROLES } from '../../../sim/roles';
import { aptitudeOf, bestCraft, TECH_BY_ID } from '../../../sim/progress';
import { notable, TRAIT_INFO, TRAITS, TRAIT_COUNT } from '../../../ai/traits';
import { DEATH_TEXT } from '../../../sim/people';
import { icon as svgIcon } from '../../ui/icons';
import { ROLE_ICONS } from '../settlementWindow';
import { bodyOf, spriteOf } from '../tools';
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

/** Abas da ficha. Cada criatura mostra só as que têm conteúdo para ela. */
export type SheetTab = 'overview' | 'status' | 'family' | 'diary' | 'journey' | 'history' | 'gear' | 'nature';

const TAB_INFO: Record<SheetTab, { label: string; icon: string }> = {
  overview: { label: 'Visão geral', icon: 'eye' },
  status: { label: 'Status e personalidade', icon: 'heart' },
  family: { label: 'Família e laços', icon: 'users' },
  diary: { label: 'Pensamentos e diário', icon: 'chat' },
  journey: { label: 'Jornada e decisões', icon: 'route' },
  history: { label: 'História', icon: 'chron' },
  gear: { label: 'Equipamento', icon: 'swords' },
  nature: { label: 'Vida selvagem', icon: 'leaf' },
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

/** Linha "Ofício" da visão geral: o ofício, ou por que não tem (criança, aposentado, sem lugar). */
function craftLabel(life: ReturnType<typeof lifeOf>): string {
  if (life.stage === 'child') return 'Nenhum (criança)';
  if (!life.role) return 'Nenhum';
  if (life.stage === 'elder' && life.label === 'Idoso') return `Aposentado · era ${ROLE_NAMES[life.role].toLowerCase()}`;
  return `${ROLE_ICONS[life.role]} ${life.label}`;
}

/** Barra com ícone, rótulo e valor (energia, saúde, progresso). */
function meter(label: string, frac: number, text: string, t = tone(frac), ic = ''): string {
  const f = Math.max(0, Math.min(1, frac));
  return `<div class="cs-meter ${t}" title="${esc(label)}: ${esc(text)}">${ic ? `<span class="cs-mi">${ic}</span>` : ''}<span class="cs-ml">${label}</span><span class="cs-mb"><i style="width:${(f * 100).toFixed(0)}%"></i><em>${text}</em></span></div>`;
}

/** Necessidade do dia (0 a 1): quanto mais cheia, mais urgente. */
const need = (label: string, f: number, ic: string) => meter(label, f, pct(f), f > 0.75 ? 'bad' : f > 0.5 ? 'warn' : 'good', ic);

/** Linha rótulo à esquerda, valor à direita. */
const row = (label: string, value: string, ic = '') => `<div class="cs-row"><span>${ic ? `<i>${ic}</i>` : ''}${label}</span><b>${value}</b></div>`;
/** Quadradinho de ícone e número (a grade de atributos das referências). */
const tile = (ic: string, value: string, label: string, t = '') => `<span class="cs-tile ${t}" title="${esc(label)}"><i>${ic}</i><b>${value}</b></span>`;
const section = (title: string) => `<div class="cs-sec">${title}</div>`;
const empty = (text: string) => `<div class="cs-empty">${text}</div>`;

/**
 * Ficha completa de uma criatura (RF-VIDA-335): janela no meio da tela, aberta com o clique e fixada, com
 * abas verticais. Também mostra a ficha de grupo (Shift + arrastar, RF-VIDA-336). Só a criatura aberta é
 * lida, a cada `interval`; cada parte (cabeça, abas, corpo, rodapé) só reescreve o DOM quando mudou.
 */
export class CreatureSheet extends HudComponent {
  tab: SheetTab = 'overview';
  private readonly head: HtmlSlot;
  private readonly tabs: HtmlSlot;
  private readonly body: HtmlSlot;
  private readonly foot: HtmlSlot;
  /** Quem estava aberto no último quadro, para voltar a rolagem ao topo quando troca. */
  private shown = '';

  constructor(
    private readonly el: HTMLElement,
    private readonly sel: Selection,
    private readonly icons: IconCache,
    private readonly host: { say(text: string): void },
  ) {
    super(250);
    el.innerHTML = `
      <div class="cs-frame">
        <div class="cs-head" data-cs-head></div>
        <button class="wb-x cs-close" data-sheet-close title="Fechar (Esc)" aria-label="Fechar">✕</button>
        <nav class="cs-tabs" data-cs-tabs></nav>
        <div class="cs-body" data-cs-body></div>
        <div class="cs-foot" data-cs-foot></div>
      </div>`;
    const q = (s: string) => el.querySelector<HTMLElement>(s)!;
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
    this.head.set(this.headHtml(eco, i));
    this.tabs.set(this.tabsHtml(tabs));
    this.setBody(person ? this.personTab(eco, i) : this.animalTab(eco, i));
    this.foot.set(
      `<button class="cs-btn ${this.sel.follow ? 'on' : ''}" data-act="follow" title="A câmera acompanha a criatura (F)">${svgIcon(this.sel.follow ? 'stop' : 'target')}<span>${this.sel.follow ? 'Parar de seguir' : 'Seguir'}</span><kbd>F</kbd></button>
       <span class="cs-hint">Clique no vazio ou Esc para soltar</span>`,
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
    if (this.body.set(html)) this.body.el.scrollTop = top;
  }

  /** Abas que fazem sentido para a criatura: as de pessoa só para pessoas, e nenhuma aba vazia. */
  private tabsFor(eco: Ecosystem, i: number): SheetTab[] {
    if (!isPerson(eco, i)) return ['overview', 'nature'];
    const out: SheetTab[] = ['overview', 'status'];
    const fam = eco.familyOf(i);
    const t = eco.tiesOf(i);
    if (fam.parent >= 0 || fam.children.length || t.partner >= 0 || t.friends.length || t.rivals.length) out.push('family');
    if (eco.diary.get(eco.uid[i])?.length) out.push('diary');
    out.push('journey', 'history');
    if (equipmentOf(eco, i).length) out.push('gear');
    return out;
  }

  private tabsHtml(tabs: SheetTab[]): string {
    return tabs
      .map((t) => `<button class="cs-tab ${t === this.tab ? 'on' : ''}" data-ctab="${t}" aria-label="${TAB_INFO[t].label}" aria-pressed="${t === this.tab}">${svgIcon(TAB_INFO[t].icon)}<span class="cs-tip">${TAB_INFO[t].label}</span></button>`)
      .join('');
  }

  /** Retrato em pixel art: o sprite que anda no mapa, na cor do lugar e da espécie. */
  portrait(eco: Ecosystem, i: number): string {
    const sp = eco.species[eco.kind[i]];
    if (!isPerson(eco, i)) return this.icons.icon(spriteOf(sp), sp.color);
    const v = homeOf(eco, i);
    const life = lifeOf(eco, i);
    const look = life.stage === 'child' ? 'child' : life.stage === 'elder' && (!life.role || ROLES.indexOf(life.role) < ROLES.indexOf('leader')) ? 'elder' : (life.role ?? 'gatherer');
    return this.icons.icon(`${bodyOf(sp)}:${look}`, v ? v.color : sp.color, sp.color);
  }

  private headHtml(eco: Ecosystem, i: number): string {
    const sp = eco.species[eco.kind[i]];
    let name: string;
    let sub: string;
    if (isPerson(eco, i)) {
      const n = personFullName(eco, i);
      const life = lifeOf(eco, i);
      name = `${n.first} ${n.family}`;
      sub = `${sp.name} · ${jobLabel(life)}`;
    } else {
      const a = animalOf(eco, i);
      name = sp.name;
      sub = `${cap(a.stage)} · ${years(a.age)}`;
    }
    return `<div class="cs-portrait">${this.portrait(eco, i)}</div>
      <div class="cs-name"><b>${esc(name)}</b><span>${esc(sub)}</span></div>
      <span class="cs-pin" title="Ficha fixada: clique no vazio ou Esc solta">📌</span>`;
  }

  // ---- Pessoas -----------------------------------------------------------------------------------

  private personTab(eco: Ecosystem, i: number): string {
    switch (this.tab) {
      case 'status':
        return this.personStatus(eco, i);
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
    return `<div class="cs-bars">${meter('Energia', v.energy, pct(v.energy), tone(v.energy), '⚡')}${meter('Saúde', v.health, pct(v.health), tone(v.health), '❤')}</div>`;
  }

  /** Cartão do lugar onde mora (clicável, abre a janela do assentamento), ou "Sem assentamento". */
  private placeCard(eco: Ecosystem, i: number): string {
    const v = homeOf(eco, i);
    if (!v) return `<div class="cs-place none"><i>⛺</i><span><b>Sem assentamento</b><em>Vive solto, sem lugar nem profissão</em></span></div>`;
    const king = eco.villages[v.kingdom];
    const polity = v.kingdom !== v.id ? eco.polityName(v) : null;
    return `<button class="cs-place" data-village="${v.id}" title="Abrir a janela de ${esc(v.name)}">${this.icons.crest(king)}<span><b>${eco.tierName(v)} ${esc(v.name)}</b><em>${polity ? `Reino: ${esc(polity)}` : 'Independente'}</em></span><i class="cs-go">›</i></button>`;
  }

  private personOverview(eco: Ecosystem, i: number): string {
    const life = lifeOf(eco, i);
    const fam = eco.familyOf(i);
    const t = eco.tiesOf(i);
    const v = homeOf(eco, i);
    const craft = life.stage !== 'child' ? ROLE_NAMES[ROLES[bestCraft(eco.uid[i])]] : '';
    const stage = life.stage === 'child' ? 'Criança' : life.stage === 'elder' ? 'Idoso' : 'Adulto';
    const tiles = [
      tile('🎂', `${Math.floor(eco.age[i])}`, 'Idade em anos'),
      tile(life.stage === 'child' ? '🧒' : life.stage === 'elder' ? '👴' : '🧑', stage, 'Fase da vida'),
      tile('👶', `${fam.children.length}`, 'Filhos vivos'),
      tile('🤝', `${t.friends.length}`, 'Amigos'),
      tile('😠', `${t.rivals.length}`, 'Rivais', t.rivals.length ? 'bad' : ''),
      t.partner >= 0 ? tile('💞', 'Sim', 'Casado(a)') : tile('💞', 'Não', 'Casado(a)'),
    ].join('');
    const teaching = v?.pendingTech?.uid === eco.uid[i] ? v.pendingTech : null;
    return `
      ${this.vitals(eco, i)}
      <div class="cs-now"><i>▶</i><span>Agora: <b>${esc(eco.activityOf(i))}</b></span></div>
      ${this.marks(eco, i)}
      <div class="cs-tiles">${tiles}</div>
      ${this.placeCard(eco, i)}
      <div class="cs-rows">
        ${row('Família', esc(personFullName(eco, i).family), '🏷️')}
        ${row('Espécie', esc(eco.species[eco.kind[i]].name), '🧬')}
        ${row('Ofício', craftLabel(life), '🛠️')}
        ${craft ? row('Jeito para', craft.toLowerCase(), '⭐') : ''}
      </div>
      ${teaching ? this.teaching(teaching) : ''}`;
  }

  /** Quem descobriu uma técnica e ainda a ensina ao lugar (RF-VIDA-419): nome, progresso e o aviso de que transmite. */
  private teaching(t: { id: string; progress: number }): string {
    const name = TECH_BY_ID[t.id]?.name ?? t.id;
    return `<div class="cs-teach"><i class="cs-teach-ic">📜</i><span><b>Ensinando ${esc(name)}</b><em>Transmite o que descobriu ao lugar</em></span>${meter('Progresso', t.progress, pct(t.progress), 'good')}</div>`;
  }

  private personStatus(eco: Ecosystem, i: number): string {
    const life = lifeOf(eco, i);
    const needs = needsOf(eco, i);
    const v = homeOf(eco, i);
    const marks = notable(eco.traits, i);
    const chips = marks.length ? `<div class="cs-chips">${marks.map((t) => `<span class="cs-chip" title="${TRAIT_INFO[t.trait].name}">${t.icon} ${t.label}</span>`).join('')}</div>` : empty('Nenhum traço marcante: um temperamento equilibrado');
    // Os 16 traços (−10 a 10) como barra de dois lados: a ponta baixa à esquerda, a alta à direita.
    const grid = TRAITS.map((t, k) => {
      const value = eco.traits[i * TRAIT_COUNT + k];
      const info = TRAIT_INFO[t];
      const w = (Math.abs(value) / 10) * 50;
      const side = value >= 0 ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`;
      return `<div class="cs-trait" title="${info.name}: ${value > 0 ? '+' : ''}${value}"><span class="lo">${info.low}</span><span class="cs-tb"><i style="${side}" class="${value >= 0 ? 'hi' : 'lo'}"></i></span><span class="hi">${info.high}</span></div>`;
    }).join('');
    const craft = life.stage !== 'child' ? bestCraft(eco.uid[i]) : -1;
    const apt = craft >= 0 ? aptitudeOf(eco.uid[i], craft) : 0;
    const teaching = v?.pendingTech?.uid === eco.uid[i] ? v.pendingTech : null;
    return `
      ${section('Condição')}
      ${this.vitals(eco, i)}
      ${this.marks(eco, i)}
      ${
        needs
          ? `${section('Necessidades do dia')}<div class="cs-bars">${need('Cansaço', needs.rest, '💤')}${need('Solidão', needs.social, '💬')}${need('Rezar', needs.faith, '🕯️')}</div>`
          : ''
      }
      ${teaching ? this.teaching(teaching) : ''}
      ${craft >= 0 ? `${section('Capacidade')}<div class="cs-rows">${row('Jeito para', ROLE_NAMES[ROLES[craft]].toLowerCase(), '⭐')}</div>${meter('Aptidão', apt, pct(apt), 'good', '🎯')}` : ''}
      ${section('Personalidade')}
      ${chips}
      <div class="cs-traits">${grid}</div>`;
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

  /** Jornada (RF-AS-30): a tarefa que venceu na IAUS, o porquê e as alternativas que perderam. */
  private personJourney(eco: Ecosystem, i: number): string {
    const v = homeOf(eco, i);
    const now = `<div class="cs-now"><i>▶</i><span>Agora: <b>${esc(eco.activityOf(i))}</b></span></div>`;
    if (!v) {
      const g = eco.wanderGoal(i);
      const to = g.village >= 0 ? eco.villages[g.village] : null;
      return `${now}
        <div class="cs-choice win"><div class="cs-ch"><i>✓</i><b>${to ? 'Ir morar num lugar do seu povo' : 'Juntar-se a outros solitários'}</b></div>
          <div class="cs-why">${
            to
              ? `<span>Por quê:</span> vive sem assentamento e <button class="cs-link" data-village="${to.id}">${eco.tierName(to)} ${esc(to.name)}</button> fica a ${Math.round(g.distance)} tiles; ao chegar, entra e recebe uma profissão`
              : '<span>Por quê:</span> nenhum lugar do seu povo a menos de 40 tiles; procura outros solitários e só funda um lugar em grupo'
          }</div></div>`;
    }
    const d = eco.dayOf(i);
    const carry = `<div class="cs-row"><span><i>🎒</i>Carregando</span>${d.carry ? `<b>${esc(d.carry)}</b>` : '<b class="cs-dim">Nada</b>'}</div>`;
    const n = d.note;
    // Barras das notas relativas à melhor nota da escolha (as notas passam de 1 com o peso da opção).
    const best = Math.max(n?.score ?? 0, ...(n?.others.map((o) => o.score) ?? []), 1e-6);
    const score = (x: number, label: string) => `<span class="cs-score" title="${label}: ${num(x)}"><span class="cs-tb1"><i style="width:${pct(x / best)}"></i></span>${num(x)}</span>`;
    const cut = n?.cut;
    const factors = n?.factors?.length
      ? `<div class="cs-factors">${n.factors.map((f) => `<span class="cs-factor" title="Consideração: ${esc(f.name)} ${num(f.value)}"><em>${esc(f.name)}</em><span class="cs-tb1"><i style="width:${pct(f.value)}"></i></span><b>${num(f.value)}</b></span>`).join('')}</div>`
      : '';
    let why = esc(d.why);
    if (n?.factors?.length && n.score !== undefined) {
      const top = n.others.length && n.others[0].score > n.score;
      why = top
        ? `não era a nota mais alta, mas ficou acima do corte de ${num(cut ?? 0)} (85% da melhor) e saiu no sorteio ponderado, em que nota maior tem mais chance. Pesaram a favor:`
        : `teve a melhor nota. A nota é o produto das considerações (cada uma de 0 a 1); pesaram a favor:`;
    }
    const lost = (o: { label: string; score: number; low?: string }) => {
      const close = cut !== undefined && o.score >= cut;
      const reason = close ? 'estava no páreo (acima do corte), mas o sorteio ponderado escolheu outra' : `ficou abaixo do corte${o.low ? `; o que mais puxou a nota para baixo foi ${esc(o.low)}` : ''}`;
      return `<div class="cs-choice lost ${close ? 'close' : ''}"><div class="cs-ch"><i>✗</i><b>${esc(o.label)}</b>${score(o.score, 'Nota')}</div><div class="cs-why"><span>Perdeu:</span> ${reason}</div></div>`;
    };
    const others = n?.others.length
      ? n.others.map(lost).join('')
      : d.others.length
        ? d.others.map((o) => `<div class="cs-choice lost"><div class="cs-ch"><i>✗</i><b>${esc(o)}</b></div><div class="cs-why"><span>Perdeu:</span> a ordem do quadro do lugar passa na frente</div></div>`).join('')
        : empty(n ? 'Nenhuma alternativa disputou: um evento do lugar passou na frente da escolha' : 'Nenhuma alternativa registrada');
    const full = eco.full(v);
    return `${full ? '' : now}
      ${carry}
      ${section('Decisão')}
      <div class="cs-choice win"><div class="cs-ch"><i>✓</i><b>${esc(cap(d.task))}</b>${n?.score !== undefined ? score(n.score, 'Nota da escolha') : ''}</div>
        <div class="cs-why"><span>Por quê:</span> ${why}</div>${factors}</div>
      ${section('Alternativas que perderam')}
      ${others}
      ${full ? '' : '<div class="cs-note">O lugar está fora da tela: as jornadas só são escolhidas uma a uma nos lugares perto da câmera ou de quem está aberto na ficha.</div>'}`;
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
    return `
      ${this.vitals(eco, i)}
      ${meter('Idade', life, `${Math.floor(a.age)} de até ${Math.round(a.maxAge)} anos`, life > 0.75 ? 'warn' : 'good', '⏳')}
      <div class="cs-now"><i>▶</i><span>Agora: <b>${esc(eco.activityOf(i))}</b></span></div>
      ${this.marks(eco, i)}
      <div class="cs-tiles">
        ${tile('🧬', esc(eco.species[eco.kind[i]].name), 'Espécie')}
        ${tile('🌱', cap(a.stage), 'Fase da vida')}
        ${tile('🐾', a.group.size > 1 ? `${a.group.size}` : '1', `Tamanho do ${a.group.name}`)}
        ${a.threat ? tile('⚠', `${Math.round(a.threat.distance)}t`, `Predador por perto: ${a.threat.name}`, 'bad') : ''}
      </div>
      ${a.parasites?.heavy ? `<div class="cs-marks"><span class="cs-mark bad">🦠<em>Muitos ${esc(a.parasites.name)}</em></span></div>` : ''}`;
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
    this.head.set(`<div class="cs-portrait cs-group">👥</div><div class="cs-name"><b>Grupo de ${n}</b><span>Shift + arrastar no mapa escolhe outro</span></div><span class="cs-pin" title="Ficha fixada">📌</span>`);
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
  const bars = `${meter('Energia', v.energy, pct(v.energy), tone(v.energy), '⚡')}${meter('Saúde', v.health, pct(v.health), tone(v.health), '❤')}`;
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
  return `<div class="cs-prev">
      <div class="cs-prev-head"><div class="cs-portrait">${sheet.portrait(eco, i)}</div><div class="cs-name"><b>${esc(name)}</b><span>${esc(sub)}</span></div></div>
      <div class="cs-bars">${bars}</div>
      <div class="cs-now"><i>▶</i><span>Agora: <b>${esc(eco.activityOf(i))}</b></span></div>
      <div class="cs-prev-foot"><span>${place}</span>${marks ? `<span class="cs-marks inline">${marks}</span>` : ''}</div>
      <div class="cs-hint">Clique para abrir a ficha</div>
    </div>`;
}
