import type { EngineEvent } from '../../sim/api/events';
import type { Runner } from '../../sim/api/catchUp';
import { ERAS } from '../../sim/ecosystem';
import { addSignal, SIGNAL_INTEREST, type NavState, type PlanetSignal } from '../../nav/guide';
import { catchUpPlanet, yearsToCatchUp, type CatchUpState } from '../surface/catchUp';

/** Um trabalho a cada tanto: o retrato sai e volta pela thread principal, e isso pesa um pouco no voo. */
export const BACKGROUND_INTERVAL_MS = 20_000;
/** Só vale o trabalho a partir deste atraso, em anos. */
export const BACKGROUND_MIN_YEARS = 5;
/** Anos por trabalho: de pouco em pouco, nenhum ano é pulado aqui. */
export const BACKGROUND_YEARS = 10;

/** O que os anos rodados têm a dizer ao GUIA: o povo que chegou a uma era nova e o planeta que pede ajuda. */
export function signalsOf(events: readonly EngineEvent[], planet: string, name: string, time: number): PlanetSignal[] {
  const out: PlanetSignal[] = [];
  for (const e of events) {
    if (e.kind === 'era' && e.first) {
      out.push({ planet, name, time, interest: SIGNAL_INTEREST.era, reason: `Um povo chegou à ${ERAS[e.era]}` });
    } else if (e.kind === 'indicator') {
      const reason = e.what === 'fome' ? 'O povo passa fome: o planeta pede ajuda' : e.what === 'calor' ? 'Quente demais para o povo: o planeta pede terraformação' : 'Frio demais para o povo: o planeta pede terraformação';
      out.push({ planet, name, time, interest: SIGNAL_INTEREST.indicator, reason });
    }
  }
  return out;
}

/**
 * Os mundos já visitados andam enquanto a nave voa, um por vez e de pouco em pouco, num Worker: é o que traz os sinais
 * deles ao GUIA e o que evita, na volta, pular os anos que o teto de 5 s não cobre.
 */
export class BackgroundWorlds {
  private next = 0;
  private busy = false;

  constructor(
    private readonly state: CatchUpState & { nav: NavState },
    private readonly onSignal: (signal: PlanetSignal) => void,
    private readonly run?: Runner,
  ) {}

  /** O planeta mais atrasado, se algum passou do mínimo. */
  pick(): string | null {
    let best: string | null = null;
    let most = BACKGROUND_MIN_YEARS - 1;
    for (const id of this.state.ecosystems.keys()) {
      const lost = yearsToCatchUp(this.state, id);
      if (lost > most) {
        most = lost;
        best = id;
      }
    }
    return best;
  }

  /** Chamado a cada quadro do espaço; quase sempre não faz nada. Devolve o trabalho, quando começa um. */
  frame(now: number): Promise<void> | null {
    if (this.busy || now < this.next) return null;
    this.next = now + BACKGROUND_INTERVAL_MS;
    if (!this.run && typeof Worker === 'undefined') return null;
    const id = this.pick();
    if (!id) return null;
    this.busy = true;
    const state = this.state;
    return catchUpPlanet(state, id, { run: this.run, slice: BACKGROUND_YEARS })
      .then((r) => {
        if (!r) return;
        const name = r.map.params.name;
        for (const s of signalsOf(r.events, id, name, state.time)) if (addSignal(state.nav, s)) this.onSignal(s);
      })
      .finally(() => {
        this.busy = false;
      });
  }
}
