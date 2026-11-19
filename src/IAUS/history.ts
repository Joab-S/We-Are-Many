// history.ts — Behavior History: quando cada coisa foi feita pela última vez.
//
// Três mapas (como no manual):
//   behaviorHistory     — behavior id → último instante em que rodou
//   contextHistory      — behavior + alvo → último instante (ex.: não acenar
//                         duas vezes para o mesmo aldeão)
//   behaviorTypeHistory — behavior type → último instante em que QUALQUER
//                         behavior desse tipo rodou
// Os dados alimentam considerations de cooldown ("tempo desde…").

export const contextKey = (behaviorId: number, targetId: number | null): string =>
  `${behaviorId}:${targetId ?? '-'}`;

class TimeMap<K> {
  private readonly map = new Map<K, number>();

  store(key: K, time: number): void {
    this.map.set(key, time);
  }
  /** Último instante registrado, ou undefined se nunca aconteceu. */
  lastTime(key: K): number | undefined {
    return this.map.get(key);
  }
  /** Remove entradas mais velhas que `expiry` segundos. */
  clean(now: number, expiry: number): void {
    for (const [k, t] of this.map) if (now - t > expiry) this.map.delete(k);
  }
  size(): number {
    return this.map.size;
  }
}

export class BehaviorHistory {
  readonly behaviors = new TimeMap<number>();
  readonly contexts = new TimeMap<string>();
  readonly behaviorTypes = new TimeMap<string>();

  /** Entradas mais velhas que isto são descartadas (padrão: 10 min). */
  expiry = 600;

  record(behaviorId: number, targetId: number | null, behaviorType: string, time: number): void {
    this.behaviors.store(behaviorId, time);
    this.contexts.store(contextKey(behaviorId, targetId), time);
    this.behaviorTypes.store(behaviorType, time);
  }

  /** Segundos desde a última execução; Infinity se nunca rodou (ou expirou). */
  timeSinceBehavior(id: number, now: number): number {
    const t = this.behaviors.lastTime(id);
    return t === undefined ? Infinity : now - t;
  }
  timeSinceContext(behaviorId: number, targetId: number | null, now: number): number {
    const t = this.contexts.lastTime(contextKey(behaviorId, targetId));
    return t === undefined ? Infinity : now - t;
  }
  timeSinceBehaviorType(type: string, now: number): number {
    const t = this.behaviorTypes.lastTime(type);
    return t === undefined ? Infinity : now - t;
  }

  /** Chamado no início de cada ciclo de pensamento. */
  process(now: number): void {
    this.behaviors.clean(now, this.expiry);
    this.contexts.clean(now, this.expiry);
    this.behaviorTypes.clean(now, this.expiry);
  }
}
