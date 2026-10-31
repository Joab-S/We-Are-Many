import type { Ecosystem } from '../../../sim/ecosystem';
import { HudComponent } from './component';

/** Quanto tempo (ms) um aviso fica na tela; os acontecimentos do mundo ficam um pouco menos, para a fila andar. */
const SAY_MS = 2500;
const NOTICE_MS = 2200;
/** Acontecimentos esperando a vez: com o mundo agitado (5x), os mais antigos caem e fica o que acabou de acontecer. */
const NOTICE_QUEUE = 3;

/**
 * Avisos curtos num balão que some sozinho. Dois canais: os da interface e
 * do motor sobre o que o jogador fez (`say`: lugar inválido, próximo passo de
 * uma ferramenta; o aviso do motor vem no resultado do comando) e os
 * acontecimentos do mundo que chegam pela fila de eventos (`notice`:
 * fundação, colônia, guerra, era). Os do jogador passam na frente; os
 * acontecimentos saem um de cada vez.
 */
export class Toast extends HudComponent {
  private until = 0;
  private pending = '';
  private readonly notices: string[] = [];

  constructor(private readonly el: HTMLElement) {
    super(150);
  }

  /** Aviso da interface, mostrado no próximo quadro. */
  say(text: string): void {
    this.pending = text;
    this.invalidate();
  }

  /** Acontecimento do mundo: entra na fila e aparece quando o balão estiver livre. */
  notice(text: string): void {
    this.notices.push(text);
    if (this.notices.length > NOTICE_QUEUE) this.notices.shift();
  }

  protected update(_eco: Ecosystem, now: number): void {
    if (this.pending) {
      this.show(this.pending, now + SAY_MS);
      this.pending = '';
    } else if (now > this.until && this.notices.length) this.show(this.notices.shift()!, now + NOTICE_MS);
    else if (now > this.until) this.el.hidden = true;
  }

  private show(text: string, until: number): void {
    this.el.textContent = text;
    this.el.hidden = false;
    this.until = until;
  }
}
