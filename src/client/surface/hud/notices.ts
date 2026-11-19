import type { EngineView } from '../../../sim/api/engine';
import type { EngineEvent } from '../../../sim/api/events';
import { ERAS, WAR_MOTIVES } from '../../../sim/ecosystem';
import type { EventBus } from '../EventBus';

/**
 * Avisos dos acontecimentos do mundo (consumidor da fila de eventos do
 * motor): fundação, colônia, fissão, cerco, guerra e era viram uma linha no
 * balão. O texto é montado aqui, pelos ids do evento e pelo que a vista do
 * motor mostra; a crônica continua com o texto longo.
 */

/** Nome do assentamento pelo id (o lugar pode ter sumido do mapa: fica o nome). */
const nameOf = (view: EngineView, id: number): string => view.villages[id]?.name ?? '?';

/** Algum lugar vivo do reino (id da capital) está cercado, sem sítio livre para a fissão (agente 3B). */
const cramped = (view: EngineView, kingdom: number): boolean => view.villages.some((v) => !v.abandoned && v.kingdom === kingdom && (v.circumscribed ?? 0) > 0);

/** Texto do aviso de um evento, ou null quando o evento não vira aviso (ou já tem outro aviso no mesmo instante). */
export function noticeText(e: EngineEvent, view: EngineView): string | null {
  switch (e.kind) {
    case 'found':
      // Colônias têm o aviso próprio (o `colony` do mesmo instante).
      if (e.how === 'colônia' || e.how === 'família' || e.how === 'mar') return null;
      if (e.how === 'sítio') return `O sítio de ${nameOf(view, e.from)} virou a aldeia ${nameOf(view, e.village)}`;
      return `Nasceu ${nameOf(view, e.village)}`;
    case 'colony':
      if (e.by === 'land' && e.phase === 'depart') return `Colonos de ${nameOf(view, e.from)} fundaram ${nameOf(view, e.to)}`;
      if (e.by === 'sea' && e.phase === 'depart') return `Colonos de ${nameOf(view, e.from)} partiram pelo mar`;
      if (e.by === 'sea' && e.to >= 0) return `Colonos de ${nameOf(view, e.from)} chegaram pelo mar a ${nameOf(view, e.to)}`;
      return null;
    case 'fission':
      // Toma o lugar do aviso da colônia do mesmo instante (`bindNotices`).
      return `${nameOf(view, e.from)} cresceu demais e se dividiu: ${e.people} pessoas fundaram ${nameOf(view, e.to)}`;
    case 'circumscribed':
      return `${nameOf(view, e.village)} está cercado, sem terra para onde crescer`;
    case 'warStart':
      // Guerra por terra de quem está cercado: o elo com o cerco, sem aviso a mais.
      if (e.motive === 'land' && cramped(view, e.a)) return `Guerra por terra: ${nameOf(view, e.a)}, sem para onde crescer, ataca ${nameOf(view, e.b)}`;
      return e.motive === 'civil' ? `Guerra civil: ${nameOf(view, e.a)} contra ${nameOf(view, e.b)}` : `Guerra: ${nameOf(view, e.a)} contra ${nameOf(view, e.b)} (${WAR_MOTIVES[e.motive]})`;
    case 'era':
      // Só a primeira vez no mundo: cada lugar que chega depois fica na crônica.
      return e.first ? `${nameOf(view, e.village)} chegou primeiro à ${ERAS[e.era] ?? `era ${e.era + 1}`}` : null;
    default:
      return null;
  }
}

/**
 * Liga os avisos ao despachante: cada evento com texto vai para `say` (o balão de acontecimentos). Os avisos de
 * uma entrega saem juntos no fim dela (`defer`, uma microtarefa): a fissão chega logo depois da colônia do mesmo
 * instante, e o aviso dela toma o lugar do da colônia em vez de repetir a fundação.
 */
export function bindNotices(bus: EventBus<EngineEvent>, view: () => EngineView, say: (text: string) => void, defer: (fn: () => void) => void = queueMicrotask): (() => void)[] {
  const batch: { key: string; text: string }[] = [];
  const flush = () => {
    for (const b of batch.splice(0)) say(b.text);
  };
  const fn = (e: EngineEvent) => {
    const text = noticeText(e, view());
    if (!text) return;
    const key = e.kind === 'colony' || e.kind === 'fission' ? `${e.from}>${e.to}` : '';
    const colony = e.kind === 'fission' ? batch.find((b) => b.key === key) : undefined;
    if (colony) {
      colony.text = text;
      return;
    }
    if (!batch.length) defer(flush);
    batch.push({ key, text });
  };
  return (['found', 'colony', 'fission', 'circumscribed', 'warStart', 'era'] as const).map((kind) => bus.on(kind, fn));
}
