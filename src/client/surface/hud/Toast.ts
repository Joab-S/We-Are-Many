import type { Ecosystem } from '../../../sim/ecosystem';
import { HudComponent } from './component';

/**
 * Avisos curtos (lugar inválido, próximo passo de uma ferramenta) num balão
 * que some sozinho. Junta os dois canais: os avisos do motor (`eco.hint`, que
 * a interface lê e limpa) e os da própria interface (`say`).
 */
export class Toast extends HudComponent {
  private until = 0;
  private pending = '';

  constructor(private readonly el: HTMLElement) {
    super(150);
  }

  /** Aviso da interface, mostrado no próximo quadro. */
  say(text: string): void {
    this.pending = text;
    this.invalidate();
  }

  protected update(eco: Ecosystem, now: number): void {
    const text = this.pending || eco.hint;
    if (text) {
      this.el.textContent = text;
      this.el.hidden = false;
      this.pending = '';
      eco.hint = '';
      this.until = now + 2500;
    } else if (now > this.until) this.el.hidden = true;
  }
}
