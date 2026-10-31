import type { EngineView } from '../../../sim/api/engine';
import type { EngineEvent } from '../../../sim/api/events';
import { ERAS, WAR_MOTIVES } from '../../../sim/ecosystem';
import type { EventBus } from '../EventBus';

/**
 * Avisos dos acontecimentos do mundo (consumidor da fila de eventos do
 * motor): fundação, colônia, guerra e era viram uma linha no balão. O texto é
 * montado aqui, pelos ids do evento e pelo que a vista do motor mostra; a
 * crônica continua com o texto longo.
 */

/** Nome do assentamento pelo id (o lugar pode ter sumido do mapa: fica o nome). */
const nameOf = (view: EngineView, id: number): string => view.villages[id]?.name ?? '?';

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
    case 'warStart':
      return e.motive === 'civil' ? `Guerra civil: ${nameOf(view, e.a)} contra ${nameOf(view, e.b)}` : `Guerra: ${nameOf(view, e.a)} contra ${nameOf(view, e.b)} (${WAR_MOTIVES[e.motive]})`;
    case 'era':
      // Só a primeira vez no mundo: cada lugar que chega depois fica na crônica.
      return e.first ? `${nameOf(view, e.village)} chegou primeiro à ${ERAS[e.era] ?? `era ${e.era + 1}`}` : null;
    default:
      return null;
  }
}

/** Liga os avisos ao despachante: cada evento com texto vai para `say` (o balão de acontecimentos). */
export function bindNotices(bus: EventBus<EngineEvent>, view: () => EngineView, say: (text: string) => void): (() => void)[] {
  const fn = (e: EngineEvent) => {
    const text = noticeText(e, view());
    if (text) say(text);
  };
  return (['found', 'colony', 'warStart', 'era'] as const).map((kind) => bus.on(kind, fn));
}
