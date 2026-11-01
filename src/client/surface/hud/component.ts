import type { Ecosystem } from '../../../sim/ecosystem';

/**
 * Parte do HUD da superfície (padrão Component): cada uma tem o seu
 * intervalo de atualização e só reescreve o DOM quando o HTML mudou.
 */
export abstract class HudComponent {
  private last = -Infinity;

  constructor(protected readonly interval: number) {}

  /** Chamado todo quadro; refaz quando passou o intervalo, ou já com `force`. */
  tick(eco: Ecosystem, now: number, force = false): void {
    if (!force && now - this.last < this.interval) return;
    this.last = now;
    this.update(eco, now);
  }

  /** Refaz no próximo `tick`, sem esperar o intervalo. */
  invalidate(): void {
    this.last = -Infinity;
  }

  protected abstract update(eco: Ecosystem, now: number): void;
}

/** Um pedaço do DOM que só recebe `innerHTML` quando o texto é outro (comparação antes de escrever). */
export class HtmlSlot {
  private html: string | null = null;

  constructor(readonly el: HTMLElement) {}

  /** Escreve se mudou; devolve se escreveu. */
  set(html: string): boolean {
    if (html === this.html) return false;
    this.html = html;
    this.el.innerHTML = html;
    return true;
  }

  /** Esquece o último HTML (o próximo `set` escreve de qualquer jeito). */
  reset(): void {
    this.html = null;
  }
}
