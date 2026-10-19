/** Teclado, mouse com Pointer Lock e roda do mouse. */
export class Input {
  private readonly keys = new Set<string>();
  private readonly pressed = new Set<string>();
  mouseDx = 0;
  mouseDy = 0;
  wheel = 0;
  private readonly abort = new AbortController();

  constructor(private readonly element: HTMLElement, private readonly pointerLock: boolean) {
    const opts = { signal: this.abort.signal };
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    }, opts);
    window.addEventListener('keyup', (e) => this.keys.delete(e.code), opts);
    window.addEventListener('blur', () => this.keys.clear(), opts);
    if (pointerLock) {
      element.addEventListener('click', () => {
        if (document.pointerLockElement !== element) void element.requestPointerLock();
      }, opts);
    }
    window.addEventListener('mousemove', (e) => {
      if (!this.pointerLock || document.pointerLockElement === element) {
        this.mouseDx += e.movementX;
        this.mouseDy += e.movementY;
      }
    }, opts);
    element.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { ...opts, passive: false });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.element;
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  /** Verdadeiro uma única vez por pressionamento. */
  hit(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Limpa os acumuladores do frame. */
  endFrame(): void {
    this.mouseDx = 0;
    this.mouseDy = 0;
    this.wheel = 0;
    this.pressed.clear();
  }

  dispose(): void {
    this.abort.abort();
    if (this.locked) document.exitPointerLock();
  }
}
