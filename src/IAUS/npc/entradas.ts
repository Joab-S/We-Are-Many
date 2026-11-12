/**
 * Entradas (inputs) das considerações das pessoas, registradas no IAUS com o prefixo `npc.`.
 *
 * Uma entrada só LÊ: a pessoa (`ctx.owner`), o alvo do contexto (`ctx.target`) e o que a pessoa crê sobre ele.
 * O mundo mantém os stats e as tags em dia (ver `vocab.ts`). Entradas que esperam um alvo devolvem 0 sem alvo.
 */
import type { AiEntity } from '../aiEntity';
import { Inputs, In, type ConsiderationParams } from '../consideration';
import type { ContextInfo } from '../context';
import { distance } from '../math';
import { compatibilidade, ehLugar, ehPessoa, jeitoPara } from './pessoa';
import { BENS, OFICIOS, OFICIO_IDS, WOT, falta, hab, inv, precisa, type Oficio } from './vocab';

export const E = {
  ...In,
  /** Stat da própria pessoa (`stat`). */
  eu: 'npc.Eu',
  /** Stat do alvo (`stat`). */
  alvo: 'npc.Alvo',
  /** A pessoa crê (ou sabe) que o alvo tem a tag (`tag`): Tagging System, tag percebida. */
  creioQueAlvoE: 'npc.CreioQueAlvoE',
  /** O alvo tem a tag `tag:<meu id>` (eu marquei). */
  marcadoPorMim: 'npc.MarcadoPorMim',
  /** O alvo tem a tag `tag:<outro>` (outro marcou antes). */
  marcadoPorOutro: 'npc.MarcadoPorOutro',
  /** Quantas pessoas a pessoa conhece com a tag (`tag`). */
  conhecoQuemE: 'npc.ConhecoQuemE',
  /** Laço com o alvo (−100 a 100). */
  laco: 'npc.Laco',
  /** Compatibilidade de jeito com o alvo (−1 a 1). */
  compatibilidade: 'npc.Compatibilidade',
  /** Quanto os traços combinam com o ofício do alvo (−1 a 1). */
  jeito: 'npc.Jeito',
  /** Habilidade da pessoa no ofício do alvo (0 a 1). */
  habilidade: 'npc.Habilidade',
  /** A pessoa tem a tag do ofício do alvo (lenhador diante da árvore). */
  souDoOficio: 'npc.SouDoOficio',
  /** O ofício do alvo é o da família (tag `Tradição:<ofício>`). */
  tradicao: 'npc.Tradicao',
  /** Quanto a pessoa precisa do bem que o alvo dá (0 a 1): o recurso, o ofício ou o que ela crê que o alvo faz. */
  precisoDoQueAlvoDa: 'npc.PrecisoDoQueAlvoDa',
  /** Quanto a pessoa tem guardado do bem que o alvo pede (oferta) ou dá (ofício), normalizado por `value` unidades. */
  tenhoDoBemDoAlvo: 'npc.TenhoDoBemDoAlvo',
  /** Dá para pagar o preço do alvo: riqueza ÷ preço (1 = exatamente). */
  possoPagar: 'npc.PossoPagar',
  /** O alvo é desta pessoa (stat `dono` = id) ou do lugar dela (stat `lugar`). */
  meu: 'npc.Meu',
  doMeuLugar: 'npc.DoMeuLugar',
  /** A oferta (alvo) é para esta pessoa (`fornecedor` = id) ou desta pessoa (`cliente` = id). */
  ofertaParaMim: 'npc.OfertaParaMim',
  ofertaMinha: 'npc.OfertaMinha',
  /** Amigos e parentes que moram no lugar (alvo assentamento ou o próprio lugar). */
  amigosLa: 'npc.AmigosLa',
  /** Melhor laço com alguém que já mora no lugar alvo. */
  melhorLacoLa: 'npc.MelhorLacoLa',
  /** Lotação da casa: família ÷ vagas. */
  casaLotada: 'npc.CasaLotada',
  /** Ofício do alvo é o que a pessoa faz hoje. */
  oficioAtual: 'npc.OficioAtual',
  /** A pessoa pratica um ofício (stat `oficio` ≥ 0). */
  temOficio: 'npc.TemOficio',
  /** Habilidade no ofício que pratica (0 a 1). */
  habNoMeuOficio: 'npc.HabNoMeuOficio',
  /** Quanto o lugar sente falta do ofício que ele pratica (0 a 1; 0 = está sobrando). */
  faltaDoMeuOficio: 'npc.FaltaDoMeuOficio',
  /** Já se vê no ofício que pratica (tem a tag de identidade dele: "Ferreiro"). */
  tenhoIdentidade: 'npc.TenhoIdentidade',
  /** Ainda carrega a tag de um ofício que não pratica mais. */
  identidadeVelha: 'npc.IdentidadeVelha',
  /** O alvo mostra algum ofício (tem uma tag de identidade de ofício). */
  alvoMostraOficio: 'npc.AlvoMostraOficio',
  /** Crê que o alvo tem um ofício que ele não mostra mais (crença vencida). */
  crencaVencida: 'npc.CrencaVencida',
  /** O ofício da pessoa rende o bem do alvo (a oferta pede o que ela faz). */
  facoOBemDoAlvo: 'npc.FacoOBemDoAlvo',
  /** Laço com o cliente da oferta (alvo). */
  lacoComCliente: 'npc.LacoComCliente',
  /** Tesouro do lugar ÷ custo do alvo (obra pública): 1 = dá exatamente. */
  tesouroPaga: 'npc.TesouroPaga',
  /** Quanto do material que falta à obra alvo (stats `faltaMadeira`/`faltaPedra`) ele tem consigo (0 a 1). */
  tenhoMaterialDaObra: 'npc.TenhoMaterialDaObra',
  /** Falta, no lugar, do ofício da habilidade do contexto (pacotes de habilidade). */
  faltaDaHabilidade: 'npc.FaltaDaHabilidade',
} as const;

/** Ofício que a pessoa pratica (stat `oficio`), ou null. */
export function meuOficio(e: AiEntity): Oficio | null {
  const k = e.stat('oficio', -1);
  return k >= 0 ? OFICIO_IDS[k] ?? null : null;
}

/** Tags de identidade de ofício que a entidade carrega. */
export function identidades(e: AiEntity, now: number): string[] {
  return OFICIO_IDS.map((o) => OFICIOS[o].tag).filter((t) => e.tags.has(t, now));
}

const num = (b: boolean) => (b ? 1 : 0);

/** Ofício ligado a um alvo: o próprio (alvo `oficio`), o do recurso (árvore → lenhador) ou o da oficina. */
export function oficioDoAlvo(t: AiEntity | null): Oficio | null {
  if (!t) return null;
  switch (t.type) {
    case WOT.oficio:
      return (t.name in OFICIOS ? t.name : null) as Oficio | null;
    case WOT.arvore:
      return 'lenhador';
    case WOT.rocha:
      return 'pedreiro';
    case WOT.arbusto:
      return 'coletor';
    case WOT.animal:
      return 'cacador';
    case WOT.pesqueiro:
      return 'pescador';
    case WOT.roca:
      return 'agricultor';
    case WOT.obra:
      return 'construtor';
    case WOT.tarefa:
    case WOT.oficina: {
      const k = t.stat('oficio', -1);
      return k >= 0 ? OFICIO_IDS[k] ?? null : null;
    }
    default:
      return null;
  }
}

/** Bem que o alvo dá ou pede: a oferta (`bem`), o recurso, o ofício, ou o que a pessoa crê que o alvo faz. */
export function bemDoAlvo(owner: AiEntity, t: AiEntity | null, now: number): string | null {
  if (!t) return null;
  if (t.type === WOT.oferta) {
    const k = t.stat('bem', -1);
    return k >= 0 ? BENS[k] : null;
  }
  if (t.type === WOT.pessoa) {
    // O que eu acho que essa pessoa faz: a primeira tag de ofício que vejo nela.
    // (O construtor vende trabalho na obra, não um bem: não entra aqui.)
    for (const o of OFICIO_IDS) if (OFICIOS[o].onde !== WOT.obra && owner.seesTag(t, OFICIOS[o].tag, now)) return OFICIOS[o].rende;
    return null;
  }
  const o = oficioDoAlvo(t);
  return o ? OFICIOS[o].rende : null;
}

const tag = (p: ConsiderationParams) => p.tag ?? '';

Inputs.register(E.eu, (c, p) => c.owner.stat(p.stat ?? ''));
Inputs.register(E.alvo, (c, p) => (c.target ? c.target.stat(p.stat ?? '') : 0));
Inputs.register(E.creioQueAlvoE, (c, p) => num(!!c.target && c.owner.seesTag(c.target, tag(p), c.now)));
Inputs.register(E.marcadoPorMim, (c, p) => num(!!c.target && c.target.tags.has(`${tag(p)}:${c.owner.id}`, c.now)));
Inputs.register(E.marcadoPorOutro, (c, p) => {
  if (!c.target) return 0;
  const mine = `${tag(p)}:${c.owner.id}`;
  return num(c.target.tags.list().some((t) => t !== mine && t.startsWith(`${tag(p)}:`) && c.target!.tags.has(t, c.now)));
});
Inputs.register(E.conhecoQuemE, (c, p) => c.owner.beliefs.whoHas(tag(p), c.now).length);
Inputs.register(E.laco, (c) => (ehPessoa(c.owner) && c.target ? c.owner.laco(c.target.id) : 0));
Inputs.register(E.compatibilidade, (c) => (ehPessoa(c.owner) && ehPessoa(c.target) ? compatibilidade(c.owner, c.target) : 0));
Inputs.register(E.jeito, (c) => {
  const o = oficioDoAlvo(c.target);
  return o ? jeitoPara(c.owner, OFICIOS[o].jeito) : 0;
});
Inputs.register(E.habilidade, (c) => {
  const o = oficioDoAlvo(c.target);
  return o ? c.owner.stat(hab(o)) : 0;
});
Inputs.register(E.souDoOficio, (c) => {
  const o = oficioDoAlvo(c.target);
  return num(!!o && meuOficio(c.owner) === o);
});
Inputs.register(E.tradicao, (c) => {
  const o = oficioDoAlvo(c.target);
  return num(!!o && c.owner.tags.has(`Tradição:${o}`, c.now));
});
Inputs.register(E.precisoDoQueAlvoDa, (c) => {
  const b = bemDoAlvo(c.owner, c.target, c.now);
  return b ? c.owner.stat(precisa(b)) : 0;
});
Inputs.register(E.tenhoDoBemDoAlvo, (c) => {
  const b = bemDoAlvo(c.owner, c.target, c.now);
  return b ? c.owner.stat(inv(b)) : 0;
});
Inputs.register(E.possoPagar, (c) => {
  const preco = c.target ? c.target.stat('preco', 1) : 1;
  return preco > 0 ? c.owner.stat('riqueza') / preco : 1;
});
Inputs.register(E.meu, (c) => num(!!c.target && c.target.stat('dono', -1) === c.owner.id));
Inputs.register(E.doMeuLugar, (c) => num(!!c.target && c.owner.stat('lugar', -1) >= 0 && c.target.stat('lugar', -2) === c.owner.stat('lugar', -1)));
Inputs.register(E.ofertaParaMim, (c) => num(!!c.target && c.target.stat('fornecedor', -1) === c.owner.id));
Inputs.register(E.ofertaMinha, (c) => num(!!c.target && c.target.stat('cliente', -1) === c.owner.id));
Inputs.register(E.amigosLa, (c) => {
  if (!ehPessoa(c.owner)) return 0;
  const lugar = ehLugar(c.target) ? c.target : null;
  if (!lugar) return 0;
  let n = 0;
  for (const id of lugar.moradores) if (c.owner.laco(id) >= 40) n++;
  return n;
});
Inputs.register(E.melhorLacoLa, (c) => {
  if (!ehPessoa(c.owner) || !ehLugar(c.target)) return 0;
  let best = 0;
  for (const id of c.target.moradores) best = Math.max(best, c.owner.laco(id));
  return best;
});
Inputs.register(E.casaLotada, (c) => {
  const vagas = c.owner.stat('vagasCasa', 0);
  return vagas > 0 ? c.owner.stat('familia', 1) / vagas : 0;
});
Inputs.register(E.oficioAtual, (c) => {
  const o = oficioDoAlvo(c.target);
  return num(!!o && meuOficio(c.owner) === o);
});
Inputs.register(E.temOficio, (c) => num(meuOficio(c.owner) !== null));
Inputs.register(E.habNoMeuOficio, (c) => {
  const o = meuOficio(c.owner);
  return o ? c.owner.stat(hab(o)) : 0;
});
Inputs.register(E.faltaDoMeuOficio, (c) => {
  const o = meuOficio(c.owner);
  return o ? c.owner.stat(falta(o)) : 0;
});
Inputs.register(E.tenhoIdentidade, (c) => {
  const o = meuOficio(c.owner);
  return num(!!o && c.owner.tags.has(OFICIOS[o].tag, c.now));
});
Inputs.register(E.identidadeVelha, (c) => {
  const o = meuOficio(c.owner);
  const mine = o ? OFICIOS[o].tag : '';
  return num(identidades(c.owner, c.now).some((t) => t !== mine));
});
Inputs.register(E.alvoMostraOficio, (c) => num(!!c.target && identidades(c.target, c.now).length > 0));
Inputs.register(E.crencaVencida, (c) => {
  const t = c.target;
  if (!t) return 0;
  return num(c.owner.beliefs.tagsOf(t.id).some((tag) => OFICIO_IDS.some((o) => OFICIOS[o].tag === tag) && !t.tags.has(tag, c.now)));
});
Inputs.register(E.facoOBemDoAlvo, (c) => {
  const o = meuOficio(c.owner);
  const b = bemDoAlvo(c.owner, c.target, c.now);
  return num(!!o && !!b && OFICIOS[o].rende === b);
});
Inputs.register(E.lacoComCliente, (c) => (ehPessoa(c.owner) && c.target ? c.owner.laco(c.target.stat('cliente', -1)) : 0));
Inputs.register(E.tenhoMaterialDaObra, (c) => {
  const t = c.target;
  if (!t) return 0;
  const fm = t.stat('faltaMadeira');
  const fp = t.stat('faltaPedra');
  const tenho = Math.min(fm, c.owner.stat(inv('madeira'))) + Math.min(fp, c.owner.stat(inv('pedra')));
  return Math.min(1, tenho / Math.max(1, Math.min(4, fm + fp)));
});
Inputs.register(E.tesouroPaga, (c) => {
  const custo = c.target ? c.target.stat('preco', 1) : 1;
  return custo > 0 ? c.owner.stat('loc.tesouro') / custo : 1;
});
Inputs.register(E.faltaDaHabilidade, (c) => {
  const id = c.abilityId ?? '';
  const o = id.startsWith('oficio:') ? id.slice(7) : '';
  return o ? c.owner.stat(`loc.falta.oficio.${o}`) : 0;
});

/** Distância até o alvo (atalho para quem monta contextos fora do cérebro). */
export const distanciaAte = (c: ContextInfo): number => (c.target ? distance(c.owner.position, c.target.position) : Infinity);
